"""Deterministic Wan 3.0 node checks; no credentials or paid calls."""

import importlib.util
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import MagicMock, Mock, patch


ROOT = Path(__file__).parent
VIDEO_NAME = "Bailian_Wan3_0123456789abcdef0123456789abcdef.mp4"
paths = types.ModuleType("folder_paths")
sys.modules["folder_paths"] = paths
spec = importlib.util.spec_from_file_location("bailian_video_test", ROOT / "bailian_video.py")
video = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = video
spec.loader.exec_module(video)


class BailianVideoTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        paths.get_input_directory = lambda: str(self.root)
        paths.get_output_directory = lambda: str(self.root)
        for name in ("one.png", "motion.mp4", "voice.wav"):
            (self.root / name).write_bytes(b"fixture")
        self.kwargs = dict(positive_prompt="a walking character", negative_prompt="blurry",
                           model="wan3.0-video-prime", seed=-1, resolution="720P", ratio="16:9",
                           duration=5, output_audio=True, prompt_extend=True, watermark=False,
                           timeout_minutes=20)

    def run_graph(self, **media):
        captured = []

        def request(method, url, key, **options):
            captured.append((method, url, options.get("payload")))
            return {"output": {"task_id": "fixture-task"}} if method == "POST" else {
                "output": {"task_status": "SUCCEEDED", "video_url": "https://example.invalid/video.mp4"}}

        with patch.object(video, "_config", return_value=("private-key", "https://workspace.cn-beijing.maas.aliyuncs.com/api/v1")), \
             patch.object(video, "_upload_file", side_effect=lambda path, model, key: f"oss://fixture/{path.name}"), \
             patch.object(video, "_request_json", side_effect=request), \
             patch.object(video, "_save_video", return_value=VIDEO_NAME), \
             patch.object(video.time, "sleep"):
            result = video.ForkVdoBailianWan3Video().generate(**self.kwargs, **media)
        return captured[0][2], result

    def test_empty_sources_and_deleted_nodes_use_text_to_video(self):
        sources = (video.ForkVdoBailianImage(), video.ForkVdoBailianVideo(), video.ForkVdoBailianAudio())
        self.assertEqual([source.select("")[0] for source in sources], [None, None, None])
        payload, result = self.run_graph(reference_image=None, reference_video=None, reference_audio=None)
        self.assertNotIn("media", payload["input"])
        self.assertNotIn("negative_prompt", payload["input"])
        self.assertIn("避免出现：blurry", payload["input"]["prompt"])
        self.assertEqual(result["ui"]["videos"][0]["filename"], VIDEO_NAME)
        self.assertEqual(result["result"], (VIDEO_NAME,))

    def test_prompt_nodes_allow_empty_negative_but_require_positive(self):
        self.kwargs["negative_prompt"] = ""
        payload, _ = self.run_graph()
        self.assertEqual(payload["input"]["prompt"], "a walking character")
        self.kwargs["positive_prompt"] = ""
        with self.assertRaisesRegex(RuntimeError, "正向提示词"):
            video.ForkVdoBailianWan3Video().generate(**self.kwargs)

    def test_optional_combinations_map_only_selected_media(self):
        image = video.ForkVdoBailianImage().select("one.png")[0]
        motion = video.ForkVdoBailianVideo().select("motion.mp4")[0]
        voice = video.ForkVdoBailianAudio().select("voice.wav")[0]
        for selected, types in (({"reference_image": image}, ["reference_image"]),
                                ({"reference_video": motion, "reference_audio": voice},
                                 ["reference_video", "reference_audio"]),
                                ({"reference_image": image, "reference_video": motion,
                                  "reference_audio": voice},
                                 ["reference_image", "reference_video", "reference_audio"])):
            payload, _ = self.run_graph(**selected)
            self.assertEqual([item["type"] for item in payload["input"]["media"]], types)
            self.assertTrue(all(item["url"].startswith("oss://") for item in payload["input"]["media"]))

    def test_invalid_inputs_fail_before_network(self):
        with patch.object(video, "_config", side_effect=AssertionError("network config read")):
            with self.assertRaisesRegex(RuntimeError, "片段时长"):
                video.ForkVdoBailianWan3Video().generate(**{**self.kwargs, "duration": 1})
        with self.assertRaisesRegex(RuntimeError, "文件不存在"):
            video.ForkVdoBailianImage().select("missing.png")
        with self.assertRaisesRegex(RuntimeError, "文件不存在"):
            video.ForkVdoBailianImage().select("../outside.png")

    def test_failed_task_does_not_create_second_submission(self):
        calls = []

        def request(method, url, key, **options):
            calls.append(method)
            return {"output": {"task_id": "fixture-task"}} if method == "POST" else {
                "output": {"task_status": "FAILED", "message": "upstream-secret"}}

        with patch.object(video, "_config", return_value=("private-key", "https://workspace.cn-beijing.maas.aliyuncs.com/api/v1")), \
             patch.object(video, "_request_json", side_effect=request), \
             patch.object(video.time, "sleep"):
            with self.assertRaisesRegex(RuntimeError, "百炼任务未完成") as caught:
                video.ForkVdoBailianWan3Video().generate(**self.kwargs)
        self.assertEqual(calls, ["POST", "GET"])
        self.assertNotIn("upstream-secret", str(caught.exception))
        self.assertNotIn("private-key", str(caught.exception))

    def test_temporary_upload_uses_model_binding_and_oss_url(self):
        policy = {"data": {"upload_host": "https://fixture.oss-cn-beijing.aliyuncs.com",
                           "upload_dir": "dashscope-instant/fixture", "oss_access_key_id": "access",
                           "signature": "signature", "policy": "policy", "x_oss_object_acl": "private",
                           "x_oss_forbid_overwrite": "true"}}
        response = Mock()
        response.json.return_value = policy
        response.raise_for_status.return_value = None
        with patch.object(video.requests, "get", return_value=response) as get, \
             patch.object(video.requests, "post", return_value=response) as post:
            url = video._upload_file(self.root / "motion.mp4", "wan3.0-video-prime", "private-key")
        self.assertTrue(url.startswith("oss://dashscope-instant/fixture/"))
        self.assertEqual(get.call_args.kwargs["params"]["model"], "wan3.0-video-prime")
        self.assertEqual(post.call_args.kwargs["files"]["key"][1], url.removeprefix("oss://"))

    def test_success_video_is_saved_for_comfy_history(self):
        response = MagicMock()
        response.__enter__ = Mock(return_value=response)
        response.__exit__ = Mock(return_value=None)
        response.raise_for_status.return_value = None
        response.iter_content.return_value = [b"video fixture"]
        with patch.object(video.requests, "get", return_value=response):
            name = video._save_video("https://dashscope-result-bj.oss-cn-beijing.aliyuncs.com/video.mp4")
        self.assertEqual((self.root / name).read_bytes(), b"video fixture")
        preview = video.ForkVdoBailianVideoOutput().preview(name)
        self.assertEqual(preview["ui"]["videos"][0]["filename"], name)

    def test_output_node_rejects_missing_or_outside_files(self):
        output = video.ForkVdoBailianVideoOutput()
        with self.assertRaisesRegex(RuntimeError, "文件名无效"):
            output.preview("../outside.mp4")
        with self.assertRaisesRegex(RuntimeError, "文件不存在"):
            output.preview(VIDEO_NAME)


if __name__ == "__main__":
    unittest.main()
