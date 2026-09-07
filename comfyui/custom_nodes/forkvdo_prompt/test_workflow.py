"""Run with the ComfyUI Python environment; no models, credentials or GPU needed."""
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch, Mock

import torch
from PIL import Image


PACKAGE = Path(__file__).parent
stub_paths = types.ModuleType("folder_paths")
sys.modules["folder_paths"] = stub_paths
package = types.ModuleType("image_workflow_test_package")
package.__path__ = [str(PACKAGE)]
sys.modules[package.__name__] = package


def load_module(name):
    spec = importlib.util.spec_from_file_location(f"{package.__name__}.{name}", PACKAGE / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


prompt = load_module("nodes")
workflow = load_module("image_workflow")


class ImageWorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        stub_paths.get_input_directory = lambda: str(self.root)
        stub_paths.get_output_directory = lambda: str(self.root)
        stub_paths.get_temp_directory = lambda: str(self.root)
        stub_paths.get_annotated_filepath = lambda name, *args: str(self.root / name)
        stub_paths.exists_annotated_filepath = lambda name: (self.root / name).is_file()
        stub_paths.filter_files_content_types = lambda names, _: [name for name in names if name.endswith(".png")]
        Image.new("RGB", (65, 67), "red").save(self.root / "one.png")
        Image.new("RGB", (40, 50), "blue").save(self.root / "two.png")
        self.collection = prompt.ForkVdoImageCollection().collect(image_1="one.png", image_2="two.png")["result"][0]

    def plan(self, mode="edit", **kwargs):
        values = dict(positive="a portrait", negative="", mode=mode, width=512, height=512,
                      source_index=1, edit_strength=0.5, images=self.collection)
        values.update(kwargs)
        return workflow.ForkVdoImagePlan().prepare(**values)[0]

    def call_prompt(self, connection_id="remote", images=None, **kwargs):
        values = dict(connection_id=connection_id, model_name="vision-model", user_request="图1人物，图2配色",
                      default_rules="", target_config="natural language", refresh_token=0, reference_images=images)
        values.update(kwargs)
        return prompt.ForkVdoPrompt().generate(**values)

    def test_empty_single_multiple_and_ordered_collections(self):
        node = prompt.ForkVdoImageCollection()
        self.assertEqual(node.collect()["result"][0]["items"], [])
        self.assertEqual(prompt._input_image_choices(), ["", "one.png", "two.png"])
        previous = node.collect(image_4="one.png")["result"][0]
        combined = node.collect(previous=previous, image_2="two.png")["result"][0]
        self.assertEqual([item["value"] for item in combined["items"]], ["one.png", "two.png"])

    def test_linked_image_takes_precedence_and_batches_expand(self):
        result = prompt.ForkVdoImageCollection().collect(image_1="missing.png", image_1_input=torch.zeros(2, 8, 8, 3))
        self.assertEqual(len(result["result"][0]["items"]), 2)
        self.assertTrue(all(item["kind"] == "tensor" for item in result["result"][0]["items"]))

    def test_same_filename_content_invalidates_cache(self):
        before = prompt.ForkVdoImageCollection.IS_CHANGED(image_1="one.png")
        Image.new("RGB", (65, 67), "green").save(self.root / "one.png")
        self.assertNotEqual(before, prompt.ForkVdoImageCollection.IS_CHANGED(image_1="one.png"))

    def test_reject_bad_or_animated_images(self):
        (self.root / "bad.png").write_text("not an image")
        with self.assertRaisesRegex(RuntimeError, "有效图片"):
            prompt._read_file_item("bad.png")
        Image.new("RGB", (8, 8), "red").save(self.root / "animated.png", save_all=True,
            append_images=[Image.new("RGB", (8, 8), "blue")], duration=50, loop=0)
        with self.assertRaisesRegex(RuntimeError, "静态"):
            prompt._read_file_item("animated.png")

    def test_reference_limits(self):
        with self.assertRaisesRegex(RuntimeError, "最多 1 张"):
            prompt._image_parts(self.collection, {"maxImages": 1})
        with self.assertRaisesRegex(RuntimeError, "单张"):
            prompt._image_parts(self.collection, {"maxImageBytes": 1})
        with self.assertRaisesRegex(RuntimeError, "总大小"):
            prompt._image_parts(self.collection, {"maxTotalImageBytes": 1})

    def test_manual_mode_never_calls_network(self):
        with patch.object(prompt, "_call_model", side_effect=AssertionError("network called")):
            self.assertEqual(self.call_prompt("manual")["result"], ("图1人物，图2配色", ""))

    def test_workflow_config_supplies_user_owned_connection(self):
        config = workflow.ForkVdoLLMConfig().configure(
            "https://example.invalid/v1", "workflow-key", "bearer", "workflow-vision", True, 45,
        )[0]
        with patch.object(prompt, "_call_model", return_value=("positive", "negative")) as call:
            result = self.call_prompt("workflow", images=None, llm_config=config)
        self.assertEqual(result["result"], ("positive", "negative"))
        self.assertEqual(call.call_args.args[0]["apiKey"], "workflow-key")
        self.assertEqual(call.call_args.args[0]["baseUrl"], "https://example.invalid/v1")

    def test_generic_prompt_and_ordered_vision_messages(self):
        config = {"remote": {"baseUrl": "http://localhost:1234/v1", "supportsVision": True, "auth": "none"}}
        with patch.dict(os.environ, {"FORKVDO_LLM_CONNECTIONS_JSON": json.dumps(config)}), \
                patch.object(prompt, "_call_model", return_value=("positive", "negative")) as call:
            result = self.call_prompt(images=self.collection)
            self.assertEqual(result["result"], ("positive", "negative"))
            messages = call.call_args.args[2]
            self.assertNotIn("Anima", messages[0]["content"])
            self.assertEqual([item["text"] for item in messages[1]["content"][1:] if item["type"] == "text"], ["图1", "图2"])
            self.assertNotEqual(messages[1]["content"][2], messages[1]["content"][4])

    def test_empty_collection_works_with_text_only_model(self):
        config = {"remote": {"supportsVision": False}}
        with patch.dict(os.environ, {"FORKVDO_LLM_CONNECTIONS_JSON": json.dumps(config)}), \
                patch.object(prompt, "_call_model", return_value=("ok", "")):
            self.assertEqual(self.call_prompt(images={"items": []})["result"], ("ok", ""))
            with self.assertRaisesRegex(RuntimeError, "视觉"):
                self.call_prompt(images=self.collection)

    def test_no_auth_and_schema_fallback(self):
        response = {"choices": [{"message": {"content": '{"positive_prompt":"ok"}'}}]}
        with patch.object(prompt, "_post_json", side_effect=[RuntimeError("HTTP 400"), (200, response)]) as post:
            self.assertEqual(prompt._call_model({"baseUrl": "http://localhost:1234", "auth": "none"}, "local", [], 30), ("ok", ""))
            self.assertEqual(post.call_count, 2)
            self.assertEqual(post.call_args.args[1], "")
            self.assertNotIn("response_format", post.call_args.args[2])
        with self.assertRaisesRegex(RuntimeError, "apiKey"):
            prompt._call_model({"baseUrl": "http://localhost:1234"}, "local", [], 30)

    def test_http_errors_and_malformed_results_do_not_continue(self):
        for raw in ["not json", "[]", '{"positive_prompt":""}', '{"positive_prompt":"ok","negative_prompt":5}']:
            with self.assertRaises(RuntimeError):
                prompt._parse_prompt_result(raw)
        with patch.object(prompt, "_post_json", side_effect=RuntimeError("HTTP 401")) as post:
            with self.assertRaisesRegex(RuntimeError, "401"):
                prompt._call_model({"baseUrl": "https://example.invalid", "apiKey": "fixture"}, "m", [], 30)
            self.assertEqual(post.call_count, 1)
        with patch.object(prompt, "urlopen", side_effect=TimeoutError):
            with self.assertRaisesRegex(RuntimeError, "超时"):
                prompt._post_json("http://localhost:1234/v1/chat/completions", "", {}, 1)

    def test_no_authorization_header_for_local_no_auth(self):
        response = Mock()
        response.status = 200
        response.read.return_value = b'{}'
        manager = Mock()
        manager.__enter__ = Mock(return_value=response)
        manager.__exit__ = Mock(return_value=False)
        with patch.object(prompt, "urlopen", return_value=manager) as urlopen:
            prompt._post_json("http://localhost:1234/v1/chat/completions", "", {}, 1)
            self.assertFalse(urlopen.call_args.args[0].has_header("Authorization"))

    def test_prompt_append_and_replace(self):
        node = workflow.ForkVdoPromptText()
        self.assertEqual(node.execute("append", "warm light", "portrait")["result"], ("portrait, warm light",))
        self.assertEqual(node.execute("replace", "new", "old")["result"], ("new",))
        self.assertEqual(node.execute("replace", "", "old")["result"], ("",))

    def test_generation_and_edit_requirements(self):
        self.assertIsNone(self.plan("generate", images=None)["original"])
        self.assertEqual((self.plan()["width"], self.plan()["height"]), (65, 67))
        self.assertEqual(self.plan(source_index=2)["width"], 40)
        with self.assertRaisesRegex(RuntimeError, "原图"):
            self.plan(images=None)
        with self.assertRaisesRegex(RuntimeError, "原图"):
            self.plan(source_index=3)
        with self.assertRaisesRegex(RuntimeError, "不能为空"):
            self.plan(positive="")

    def test_mask_required_same_size_nonempty(self):
        with self.assertRaisesRegex(RuntimeError, "需要遮罩"):
            self.plan("inpaint")
        with self.assertRaisesRegex(RuntimeError, "尺寸"):
            self.plan("inpaint", mask=torch.ones(1, 8, 8))
        with self.assertRaisesRegex(RuntimeError, "全黑"):
            self.plan("inpaint", mask=torch.zeros(1, 67, 65))

    def test_mask_cache_and_pixel_preservation_with_odd_dimensions(self):
        Image.new("L", (65, 67), 255).save(self.root / "mask.png")
        before = workflow.ForkVdoImagePlan.IS_CHANGED(mode="inpaint", mask_image="mask.png")
        Image.new("L", (65, 67), 128).save(self.root / "mask.png")
        self.assertNotEqual(before, workflow.ForkVdoImagePlan.IS_CHANGED(mode="inpaint", mask_image="mask.png"))
        mask = torch.zeros(1, 67, 65)
        mask[:, 10:30, 10:30] = 1
        mask[:, 30:35, 10:30] = 0.5
        plan = self.plan("inpaint", mask=mask)
        padded = workflow._pad_pixels(plan["original"], 8)
        self.assertEqual(tuple(padded.shape), (1, 72, 72, 3))
        output = workflow._finish_image(torch.ones_like(padded), plan)
        self.assertEqual(tuple(output.shape), (1, 67, 65, 3))
        self.assertTrue(torch.equal(output[mask == 0], plan["original"][mask == 0]))
        self.assertTrue(torch.all(output[mask == 1] == 1))


if __name__ == "__main__":
    unittest.main()
