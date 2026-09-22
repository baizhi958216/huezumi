"""Run with the ComfyUI Python environment; no models, credentials or GPU needed."""
import importlib.util
from io import BytesIO
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch, Mock
from urllib.error import HTTPError

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
qwen = load_module("qwen_image21")


def responses_result(text='{"positive_prompt":"ok","negative_prompt":""}'):
    return {"status": "completed", "output": [
        {"type": "reasoning", "summary": [{"type": "summary_text", "text": "not a prompt"}]},
        {"type": "message", "role": "assistant", "status": "completed",
         "content": [{"type": "output_text", "text": text}]},
    ]}


def http_response(body, content_type="application/json"):
    response = BytesIO(body.encode("utf-8"))
    response.status = 200
    response.headers = {"content-type": content_type}
    return response


class ImageWorkflowTests(unittest.TestCase):
    def test_node_registration_and_socket_types(self):
        execution = types.ModuleType("execution")
        execution.SENSITIVE_EXTRA_DATA_KEYS = ()
        execution.PromptExecutor = type("Executor", (), {"execute_async": Mock()})
        server = types.ModuleType("server")
        server.PromptServer = types.SimpleNamespace(instance=types.SimpleNamespace(routes=Mock()))
        with patch.dict(sys.modules, {"execution": execution, "server": server}):
            registered = load_module("__init__")
        self.assertEqual(len(registered.NODE_CLASS_MAPPINGS), 17)
        self.assertTrue(all(key.startswith("Huezumi") for key in registered.NODE_CLASS_MAPPINGS))
        self.assertIn("HuezumiQwenImage21Agent", registered.NODE_CLASS_MAPPINGS)
        self.assertIn("HuezumiQwenImage21Prepare", registered.NODE_CLASS_MAPPINGS)
        self.assertIn("HuezumiQwenImage21Encode", registered.NODE_CLASS_MAPPINGS)
        self.assertIn("HuezumiQwenImage21Finalize", registered.NODE_CLASS_MAPPINGS)
        self.assertEqual(workflow.HuezumiLLMConfig.RETURN_TYPES[0],
                         prompt.HuezumiPrompt.INPUT_TYPES()["optional"]["llm_config"][0])

    def test_connection_environment(self):
        current = {"current": {"baseUrl": "https://current.invalid", "apiKey": "fixture", "defaultModel": "m"}}
        with patch.dict(os.environ, {"HUEZUMI_LLM_CONNECTIONS_JSON": json.dumps(current)}, clear=True):
            self.assertIn("current", prompt._connection_config())

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
        self.collection = prompt.HuezumiImageCollection().collect(image_1="one.png", image_2="two.png")["result"][0]

    def plan(self, mode="edit", **kwargs):
        values = dict(positive="a portrait", negative="", mode=mode, width=512, height=512,
                      source_index=1, edit_strength=0.5, images=self.collection)
        values.update(kwargs)
        return workflow.HuezumiImagePlan().prepare(**values)[0]

    def call_prompt(self, connection_id="remote", images=None, **kwargs):
        values = dict(connection_id=connection_id, model_name="vision-model", user_request="图1人物，图2配色",
                      default_rules="", target_config="natural language", refresh_token=0, reference_images=images)
        values.update(kwargs)
        return prompt.HuezumiPrompt().generate(**values)

    def test_empty_single_multiple_and_ordered_collections(self):
        node = prompt.HuezumiImageCollection()
        self.assertEqual(node.collect()["result"][0]["items"], [])
        self.assertEqual(prompt._input_image_choices(), ["", "one.png", "two.png"])
        previous = node.collect(image_4="one.png")["result"][0]
        combined = node.collect(previous=previous, image_2="two.png")["result"][0]
        self.assertEqual([item["value"] for item in combined["items"]], ["one.png", "two.png"])

    def test_linked_image_takes_precedence_and_batches_expand(self):
        result = prompt.HuezumiImageCollection().collect(image_1="missing.png", image_1_input=torch.zeros(2, 8, 8, 3))
        self.assertEqual(len(result["result"][0]["items"]), 2)
        self.assertTrue(all(item["kind"] == "tensor" for item in result["result"][0]["items"]))

    def test_same_filename_content_invalidates_cache(self):
        before = prompt.HuezumiImageCollection.IS_CHANGED(image_1="one.png")
        Image.new("RGB", (65, 67), "green").save(self.root / "one.png")
        self.assertNotEqual(before, prompt.HuezumiImageCollection.IS_CHANGED(image_1="one.png"))

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
        config = workflow.HuezumiLLMConfig().configure(
            "https://example.invalid/v1", "workflow-key", "bearer", "workflow-vision", True, 45,
        )[0]
        with patch.object(prompt, "_call_model", return_value=("positive", "negative")) as call:
            result = self.call_prompt("workflow", images=None, llm_config=config)
        self.assertEqual(result["result"], ("positive", "negative"))
        self.assertEqual(call.call_args.args[0]["apiKey"], "workflow-key")
        self.assertEqual(call.call_args.args[0]["baseUrl"], "https://example.invalid/v1")
        self.assertEqual(config["apiProtocol"], "auto")

    def test_workflow_protocol_is_appended_and_validated(self):
        inputs = workflow.HuezumiLLMConfig.INPUT_TYPES()
        self.assertEqual(list(inputs["required"]), ["base_url", "api_key", "auth", "model_name", "supports_vision", "timeout_seconds"])
        self.assertEqual(list(inputs["optional"]), ["api_protocol"])
        config = workflow.HuezumiLLMConfig().configure("https://example.invalid", "key", "bearer", "m", True, 30, "responses")[0]
        self.assertEqual(config["apiProtocol"], "responses")
        with self.assertRaisesRegex(RuntimeError, "协议"):
            workflow.HuezumiLLMConfig().configure("https://example.invalid", "key", "bearer", "m", True, 30, "invalid")

    def test_generic_prompt_and_ordered_vision_messages(self):
        config = {"remote": {"baseUrl": "http://localhost:1234/v1", "supportsVision": True, "auth": "none"}}
        with patch.dict(os.environ, {"HUEZUMI_LLM_CONNECTIONS_JSON": json.dumps(config)}), \
                patch.object(prompt, "_call_model", return_value=("positive", "negative")) as call:
            result = self.call_prompt(images=self.collection)
            self.assertEqual(result["result"], ("positive", "negative"))
            messages = call.call_args.args[2]
            self.assertNotIn("Anima", messages[0]["content"])
            self.assertEqual([item["text"] for item in messages[1]["content"][1:] if item["type"] == "text"], ["图1", "图2"])
            self.assertNotEqual(messages[1]["content"][2], messages[1]["content"][4])

    def test_empty_collection_works_with_text_only_model(self):
        config = {"remote": {"supportsVision": False}}
        with patch.dict(os.environ, {"HUEZUMI_LLM_CONNECTIONS_JSON": json.dumps(config)}), \
                patch.object(prompt, "_call_model", return_value=("ok", "")):
            self.assertEqual(self.call_prompt(images={"items": []})["result"], ("ok", ""))
            with self.assertRaisesRegex(RuntimeError, "视觉"):
                self.call_prompt(images=self.collection)

    def test_no_auth_and_schema_fallback(self):
        response = {"choices": [{"message": {"content": '{"positive_prompt":"ok"}'}}]}
        with patch.object(prompt, "_post_json", side_effect=[prompt.ModelHTTPError(400, "chat_completions"), (200, response)]) as post:
            self.assertEqual(prompt._call_model({"baseUrl": "http://localhost:1234", "auth": "none"}, "local", [], 30), ("ok", ""))
            self.assertEqual(post.call_count, 2)
            self.assertEqual(post.call_args.args[1], "")
            self.assertNotIn("response_format", post.call_args.args[2])
            self.assertIn("response_format", post.call_args_list[0].args[2])
        with self.assertRaisesRegex(RuntimeError, "apiKey"):
            prompt._call_model({"baseUrl": "http://localhost:1234"}, "local", [], 30)

    def test_auto_protocol_uses_responses_after_unsupported_chat_endpoint(self):
        connection = {"baseUrl": "https://example.invalid/v1/", "apiKey": "fixture"}
        for status in (404, 405):
            with self.subTest(status=status), patch.object(prompt, "_post_json", side_effect=[
                prompt.ModelHTTPError(status, "chat_completions"), (200, responses_result()),
            ]) as post:
                self.assertEqual(prompt._call_model(connection, "gpt-6-astra", [], 30), ("ok", ""))
                self.assertEqual([call.args[0] for call in post.call_args_list], [
                    "https://example.invalid/v1/chat/completions", "https://example.invalid/v1/responses",
                ])
                for call in post.call_args_list:
                    self.assertEqual(call.args[1], "fixture")
                    self.assertEqual(call.args[2]["model"], "gpt-6-astra")

    def test_explicit_protocol_does_not_switch_and_unknown_protocol_is_rejected(self):
        connection = {"baseUrl": "https://example.invalid", "apiKey": "fixture", "apiProtocol": "chat_completions"}
        with patch.object(prompt, "_post_json", side_effect=prompt.ModelHTTPError(404, "chat_completions")) as post:
            with self.assertRaisesRegex(RuntimeError, "404"):
                prompt._call_model(connection, "m", [], 30)
            self.assertEqual(post.call_count, 1)
        with patch.object(prompt, "_post_json") as post:
            with self.assertRaisesRegex(RuntimeError, "协议"):
                prompt._call_model({**connection, "apiProtocol": "invalid"}, "m", [], 30)
            post.assert_not_called()

    def test_responses_maps_rules_text_and_ordered_images(self):
        config = {"baseUrl": "https://example.invalid/v1", "apiKey": "fixture", "apiProtocol": "responses", "supportsVision": True}
        with patch.object(prompt, "_post_json", return_value=(200, responses_result())) as post:
            self.assertEqual(self.call_prompt("workflow", images=self.collection, llm_config=config)["result"], ("ok", ""))
        url, key, payload, _ = post.call_args.args
        self.assertEqual(url, "https://example.invalid/v1/responses")
        self.assertIn("Target model guidance: natural language", payload["instructions"])
        self.assertEqual(payload["text"]["format"]["type"], "json_schema")
        self.assertEqual(payload["text"]["format"]["schema"]["required"], ["positive_prompt", "negative_prompt"])
        self.assertFalse(payload["store"])
        self.assertTrue(payload["stream"])
        self.assertEqual(payload["input"][0]["role"], "user")
        parts = payload["input"][0]["content"]
        self.assertEqual([part["type"] for part in parts], ["input_text", "input_text", "input_image", "input_text", "input_image"])
        self.assertEqual([parts[1]["text"], parts[3]["text"]], ["图1", "图2"])
        self.assertTrue(parts[2]["image_url"].startswith("data:image/png;base64,"))
        self.assertNotEqual(parts[2]["image_url"], parts[4]["image_url"])
        self.assertNotIn(key, json.dumps(payload))
        for field in ("messages", "response_format", "temperature", "previous_response_id", "conversation"):
            self.assertNotIn(field, payload)

    def test_responses_web_search_is_backend_controlled_and_forces_responses(self):
        config = {
            "baseUrl": "https://example.invalid/v1", "apiKey": "fixture", "apiProtocol": "auto",
            "supportsVision": True, "webSearch": True,
        }
        with patch.object(prompt, "_post_json", return_value=(200, responses_result())) as post:
            self.assertEqual(prompt._call_model(config, "agent-model", [], 30), ("ok", ""))
        url, _, payload, _ = post.call_args.args
        self.assertEqual(url, "https://example.invalid/v1/responses")
        self.assertEqual(payload["tools"], [{"type": "web_search"}])
        self.assertEqual(payload["tool_choice"], "auto")
        with patch.object(prompt, "_post_json") as send:
            with self.assertRaisesRegex(RuntimeError, "Responses"):
                prompt._call_model({**config, "apiProtocol": "chat_completions"}, "agent-model", [], 30)
            send.assert_not_called()

    def test_qwen_agent_offline_auto_canvas_and_edit_routing(self):
        node = qwen.HuezumiQwenImage21Agent()
        Image.new("RGBA", (300, 60), (255, 0, 120, 128)).save(self.root / "logo.png")
        logo_collection = prompt.HuezumiImageCollection().collect(image_1="logo.png")["result"][0]
        with patch.dict(os.environ, {"HUEZUMI_LLM_CONNECTIONS_JSON": ""}), \
                patch.object(qwen, "_call_model", side_effect=AssertionError("network called")):
            created = node.plan(
                self.collection,
                "别的公司都有中秋礼盒，PEROPERO 也想要有，生成一张 PEROPERO 公司的",
                "auto",
                0,
            )
            edited = node.plan(self.collection, "把图1中的衣服替换成图2中的款式", "auto", 0)
            branded = node.plan(logo_collection, "生成一个品牌礼盒", "auto", 0)
            transparent = node.plan(logo_collection, "生成透明背景的品牌贴纸", "auto", 0)
        created_items = created["result"][2]["items"]
        self.assertEqual(len(created_items), 3)
        self.assertEqual(created_items[0]["role"], "canvas")
        self.assertEqual(tuple(created_items[0]["value"].shape), (1, 864, 1152, 3))
        self.assertIn("<image1>", created["result"][0])
        self.assertIn("不要做拼贴", created["result"][0])
        self.assertEqual(edited["result"][2]["items"], self.collection["items"])
        self.assertEqual(created["ui"]["mode"], ["create"])
        self.assertEqual(edited["ui"]["mode"], ["edit"])
        self.assertIn("很可能是透明 Logo", branded["result"][0])
        self.assertIn("不得复制参考案例", branded["result"][0])
        self.assertFalse(branded["result"][3])
        self.assertTrue(transparent["result"][3])
        self.assertIn("完全不透明", branded["result"][0])
        self.assertIn("背景完全透明", transparent["result"][0])
        self.assertEqual(created["result"][4], {"mode": "create", "aspect": "4:3", "preserve_alpha": False})

    def test_qwen_prepare_supports_agent_optional_manual_fallback(self):
        node = qwen.HuezumiQwenImage21Prepare()
        one_image = prompt.HuezumiImageCollection().collect(image_1="one.png")["result"][0]

        edited = node.prepare(one_image, "auto", "auto", False)
        created = node.prepare(self.collection, "auto", "16:9", False)
        forced_edit = node.prepare(self.collection, "edit", "auto", True)
        planned = node.prepare(
            self.collection,
            "edit",
            "1:1",
            False,
            {"mode": "create", "aspect": "9:16", "preserve_alpha": True},
        )

        self.assertEqual(len(edited["result"][0]["items"]), 1)
        self.assertEqual(len(created["result"][0]["items"]), 3)
        self.assertEqual(tuple(created["result"][0]["items"][0]["value"].shape), (1, 768, 1344, 3))
        self.assertEqual(forced_edit["result"][0]["items"], self.collection["items"])
        self.assertTrue(forced_edit["result"][1])
        self.assertEqual(tuple(planned["result"][0]["items"][0]["value"].shape), (1, 1344, 768, 3))
        self.assertTrue(planned["result"][1])

    def test_qwen_finalize_strips_unrequested_alpha(self):
        rgba = torch.rand(1, 8, 8, 4)
        node = qwen.HuezumiQwenImage21Finalize()
        self.assertEqual(node.finalize(rgba, False)[0].shape[-1], 3)
        self.assertTrue(torch.equal(node.finalize(rgba, True)[0], rgba))
        rgb = rgba[..., :3]
        self.assertTrue(torch.equal(node.finalize(rgb, False)[0], rgb))

    def test_qwen_agent_uses_backend_connection_and_shifts_creation_images(self):
        config = {"image_agent": {
            "purpose": "image_agent", "baseUrl": "https://example.invalid/v1", "apiKey": "fixture",
            "apiProtocol": "responses", "defaultModel": "vision-agent", "supportsVision": True,
            "webSearch": True,
        }}
        with patch.dict(os.environ, {"HUEZUMI_LLM_CONNECTIONS_JSON": json.dumps(config)}), \
                patch.object(qwen, "_call_model", return_value=("planned", "avoid")) as call:
            result = qwen.HuezumiQwenImage21Agent().plan(
                self.collection, "生成品牌礼盒，并上网查找品牌资料", "16:9", 7)
        self.assertEqual(result["result"][0:2], ("planned", "avoid"))
        self.assertEqual(tuple(result["result"][2]["items"][0]["value"].shape), (1, 768, 1344, 3))
        connection, model, messages, _ = call.call_args.args
        self.assertTrue(connection["webSearch"])
        self.assertEqual(model, "vision-agent")
        self.assertIn("上传图1 对应下游 <image2>", messages[1]["content"][0]["text"])
        self.assertEqual([part["text"] for part in messages[1]["content"][1:] if part["type"] == "text"], ["上传图1", "上传图2"])
        self.assertIn("联网能力：已启用", result["ui"]["text"][0])

    def test_responses_text_only_and_schema_fallback(self):
        config = {"baseUrl": "http://localhost:1234", "auth": "none", "apiProtocol": "responses"}
        with patch.object(prompt, "_post_json", side_effect=[
            prompt.ModelHTTPError(400, "responses"), (200, responses_result('{"positive_prompt":"ok","negative_prompt":null}')),
        ]) as post:
            self.assertEqual(self.call_prompt("workflow", llm_config=config)["result"], ("ok", ""))
            self.assertEqual(post.call_count, 2)
            first, second = [call.args[2] for call in post.call_args_list]
            self.assertEqual(first["input"], [{"role": "user", "content": [{"type": "input_text", "text": "图1人物，图2配色"}]}])
            self.assertIn("text", first)
            self.assertNotIn("text", second)
            self.assertEqual(first["input"], second["input"])
            self.assertEqual(post.call_args.args[1], "")

    def test_responses_accepts_json_and_completed_sse(self):
        result = responses_result()
        completed = json.dumps({"type": "response.completed", "response": result})
        stream = ': heartbeat\r\nevent: response.output_text.delta\r\ndata:{"type":"response.output_text.delta","delta":"partial"}\r\n\r\n'
        stream += 'event: response.completed\r\n' + ''.join(f'data: {line}\r\n' for line in json.dumps(json.loads(completed), indent=2).splitlines()) + '\r\n'
        for body, content_type in [(json.dumps(result), "application/json"), (stream, "text/event-stream; charset=utf-8")]:
            with self.subTest(content_type=content_type), patch.object(prompt, "urlopen", return_value=http_response(body, content_type)) as send:
                self.assertEqual(prompt._call_model({"baseUrl": "https://example.invalid", "apiKey": "fixture", "apiProtocol": "responses"}, "m", [], 30), ("ok", ""))
                self.assertEqual(send.call_count, 1)
                self.assertEqual(send.call_args.args[0].get_header("Authorization"), "Bearer fixture")

    def test_responses_rejects_failure_refusal_and_partial_outputs(self):
        for result in [
            None, [], {}, {"status": "completed", "output": []},
            {**responses_result(), "status": "incomplete"},
            {**responses_result(), "status": []},
            {**responses_result(), "error": {"message": "secret-upstream"}},
            {"output": [{"type": "message", "status": "in_progress", "content": []}]},
            {"output": [{"type": "message", "content": [{"type": "refusal", "refusal": "secret-upstream"}]}]},
            responses_result("not json"), responses_result('{"positive_prompt":""}'),
        ]:
            with self.subTest(result=result), patch.object(prompt, "_post_json", return_value=(200, result)) as post:
                with self.assertRaises(RuntimeError) as error:
                    prompt._call_model({"baseUrl": "https://example.invalid", "apiKey": "fixture", "apiProtocol": "responses"}, "m", [], 30)
                self.assertNotIn("secret-upstream", str(error.exception))
                self.assertEqual(post.call_count, 1)

    def test_stream_errors_and_non_json_responses_never_retry(self):
        partial = 'data: ' + json.dumps({"type": "response.output_text.delta", "delta": '{"positive_prompt":"valid but partial"}'}) + '\n\n'
        bodies = [("<html>upstream-secret</html>", "text/html")]
        bodies += [(partial + tail, "text/event-stream") for tail in [
            "", "data: [DONE]\n\n", "data: not-json\n\n",
            *('data: ' + json.dumps({"type": kind, "message": "HTTP 400 upstream-secret"}) + '\n\n'
              for kind in ["error", "response.failed", "response.incomplete"]),
        ]]
        for body, content_type in bodies:
            with self.subTest(body=body), patch.object(prompt, "urlopen", return_value=http_response(body, content_type)) as send:
                with self.assertRaises(RuntimeError) as error:
                    prompt._call_model({"baseUrl": "https://example.invalid", "auth": "none", "apiProtocol": "responses"}, "m", [], 30)
                self.assertNotIn("upstream-secret", str(error.exception))
                self.assertEqual(send.call_count, 1)

    def test_http_error_categories_and_client_restrictions_hide_upstream_data(self):
        for status, body, expected in [
            (401, "upstream-secret", "鉴权失败"), (403, "upstream-secret", "访问被拒绝"),
            (429, "upstream-secret", "请求受限"), (500, "upstream-secret", "暂不可用"),
            (400, "invalid codex request upstream-secret", "指定客户端"),
        ]:
            error = HTTPError("https://example.invalid/v1/chat/completions", status, "upstream-secret", {}, BytesIO(body.encode()))
            with self.subTest(status=status), patch.object(prompt, "urlopen", side_effect=error) as send:
                with self.assertRaisesRegex(RuntimeError, expected) as caught:
                    prompt._call_model({"baseUrl": "https://example.invalid", "apiKey": "private-key"}, "m", [], 30)
                message = str(caught.exception)
                self.assertIn(f"HTTP {status}", message)
                for secret in ("upstream-secret", "private-key", "example.invalid"):
                    self.assertNotIn(secret, message)
                self.assertEqual(send.call_count, 1)

    def test_two_missing_endpoints_and_repeated_schema_rejection_are_bounded(self):
        for statuses in [(404, 404), (400, 400)]:
            with self.subTest(statuses=statuses), patch.object(prompt, "_post_json", side_effect=[
                prompt.ModelHTTPError(status, "chat_completions" if index == 0 else "responses")
                for index, status in enumerate(statuses)
            ]) as post:
                with self.assertRaises(RuntimeError):
                    prompt._call_model({"baseUrl": "https://example.invalid", "apiKey": "fixture"}, "m", [], 30)
                self.assertEqual(post.call_count, 2)

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
        response.headers = {}
        response.read.return_value = b'{}'
        manager = Mock()
        manager.__enter__ = Mock(return_value=response)
        manager.__exit__ = Mock(return_value=False)
        with patch.object(prompt, "urlopen", return_value=manager) as urlopen:
            prompt._post_json("http://localhost:1234/v1/chat/completions", "", {}, 1)
            self.assertFalse(urlopen.call_args.args[0].has_header("Authorization"))

    def test_prompt_append_and_replace(self):
        node = workflow.HuezumiPromptText()
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
        before = workflow.HuezumiImagePlan.IS_CHANGED(mode="inpaint", mask_image="mask.png")
        Image.new("L", (65, 67), 128).save(self.root / "mask.png")
        self.assertNotEqual(before, workflow.HuezumiImagePlan.IS_CHANGED(mode="inpaint", mask_image="mask.png"))
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
