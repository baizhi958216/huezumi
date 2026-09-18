"""One-shot multimodal prompt nodes for forkvdo.

Connections can come from the execution host or from the user-owned workflow
configuration node. The latter is intentionally opt-in so a workflow copy can
carry its own OpenAI-compatible endpoint and credentials.
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
from http.client import HTTPException
from io import BytesIO
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from PIL import Image

import folder_paths


MAX_COLLECTION_SLOTS = 8
DEFAULT_MAX_IMAGES = 8
DEFAULT_MAX_IMAGE_BYTES = 20 * 1024 * 1024
DEFAULT_MAX_TOTAL_BYTES = 60 * 1024 * 1024
DEFAULT_TIMEOUT_SECONDS = 120
API_PROTOCOLS = ("auto", "chat_completions", "responses")

PROMPT_SCHEMA = {
    "name": "forkvdo_image_prompts",
    "strict": True,
    "schema": {
        "type": "object",
        "additionalProperties": False,
        "properties": {
            "positive_prompt": {"type": "string"},
            "negative_prompt": {"type": "string"},
        },
        "required": ["positive_prompt", "negative_prompt"],
    },
}

DEFAULT_RULES = """You are an expert prompt director for an AI image-generation workflow.
Your task is to analyze the user's natural language request and any ordered reference images (labeled as 图1, 图2...), and produce two prompts: positive_prompt and negative_prompt.
Return exactly one JSON object with these keys:
- positive_prompt: A descriptive, concrete image prompt. Must be a non-empty string.
- negative_prompt: Undesired visual flaws, artifacts, or traits. May be an empty string.

Guidelines:
1. Understand the exact role of each reference image based on the user's request (e.g. "图1 is art style, 图2 is character 3-view turnaround, generate this character in a desert").
2. Separate visual traits that must be preserved (e.g., character identity, hair/eye color, costume, facial features, or artistic style) from elements that must be changed (e.g., background, lighting, action, camera angle).
3. Do not arbitrarily alter key character or scene features that the user did not ask to change.
4. Follow the target model guidance when supplied. Otherwise describe subjects, composition, lighting, materials, colors and camera framing in natural language. Do not invent model-specific trigger words.
5. Do not include image indices, instructions, API parameters, or markdown fences in either prompt string.
"""



def _connection_config() -> dict[str, dict[str, Any]]:
    raw = os.environ.get("FORKVDO_LLM_CONNECTIONS_JSON", "").strip()
    if not raw:
        raise RuntimeError("未配置大模型连接，请在 ComfyUI 执行端设置 FORKVDO_LLM_CONNECTIONS_JSON")
    try:
        payload = json.loads(raw)
    except (TypeError, ValueError):
        raise RuntimeError("大模型连接配置不是有效 JSON") from None
    if not isinstance(payload, dict):
        raise RuntimeError("大模型连接配置必须是对象")
    result: dict[str, dict[str, Any]] = {}
    for key, value in payload.items():
        if isinstance(key, str) and key.strip() and isinstance(value, dict):
            result[key] = value
    if not result:
        raise RuntimeError("没有可用的大模型连接配置")
    return result


def _configured_connections() -> dict[str, dict[str, Any]]:
    try:
        return _connection_config()
    except RuntimeError:
        return {}


def _connection_ids() -> list[str]:
    return ["manual", "workflow"] + sorted(key for key in _configured_connections() if key not in {"manual", "workflow"})


def _input_image_choices() -> list[str]:
    root = folder_paths.get_input_directory()
    files = [os.path.relpath(os.path.join(directory, name), root)
             for directory, _, names in os.walk(root) for name in names]
    files = folder_paths.filter_files_content_types(files, ["image"])
    return [""] + sorted({str(name) for name in files})


def _image_slots() -> dict[str, tuple[list[str], dict[str, Any]]]:
    choices = _input_image_choices()
    return {
        f"image_{index}": (choices, {"image_upload": True, "tooltip": f"第 {index} 张图片；留空表示不使用"})
        for index in range(1, MAX_COLLECTION_SLOTS + 1)
    }


class ForkVdoImageCollection:
    """Collect ordered uploaded files and/or IMAGE links for one prompt run."""

    @classmethod
    def INPUT_TYPES(cls):
        optional: dict[str, Any] = {
            "previous": ("IMAGE_COLLECTION", {"tooltip": "可连接上一个图片集合，顺序为前序在前"}),
        }
        optional.update(_image_slots())
        for index in range(1, MAX_COLLECTION_SLOTS + 1):
            optional[f"image_{index}_input"] = (
                "IMAGE",
                {"tooltip": f"第 {index} 个图片连线；可接 LoadImage 或其他图片节点"},
            )
        return {"required": {}, "optional": optional}

    RETURN_TYPES = ("IMAGE_COLLECTION",)
    RETURN_NAMES = ("images",)
    FUNCTION = "collect"
    CATEGORY = "forkvdo/reference"
    DESCRIPTION = "按顺序合并多张参考图片；可通过 previous 串联多个集合节点。"

    @classmethod
    def IS_CHANGED(cls, previous=None, **kwargs):
        digest = hashlib.sha256()
        for index in range(1, MAX_COLLECTION_SLOTS + 1):
            name = str(kwargs.get(f"image_{index}") or "").strip()
            if name and kwargs.get(f"image_{index}_input") is None:
                digest.update(_read_file_item(name)[0])
        return digest.hexdigest()

    def collect(self, previous=None, **kwargs):
        items: list[dict[str, Any]] = []
        if isinstance(previous, dict) and isinstance(previous.get("items"), list):
            items.extend(previous["items"])

        for index in range(1, MAX_COLLECTION_SLOTS + 1):
            linked = kwargs.get(f"image_{index}_input")
            if linked is not None:
                if hasattr(linked, "shape") and len(getattr(linked, "shape", ())) == 4:
                    for frame in linked:
                        items.append({"kind": "tensor", "value": frame, "slot": index})
                else:
                    items.append({"kind": "tensor", "value": linked, "slot": index})
                continue
            filename = str(kwargs.get(f"image_{index}") or "").strip()
            if filename and filename not in {"__COMBO_EMPTY__", "[none]", "none"}:
                items.append({"kind": "file", "value": filename, "slot": index})

        if len(items) > 64:
            raise RuntimeError("图片集合最多 64 张，请减少素材")
        for item in items:
            if item.get("kind") == "file":
                _read_file_item(str(item["value"]))

        return {
            "result": ({"items": items},),
            "ui": {
                "image_count": [str(len(items))],
                "text": [f"共 {len(items)} 张图片，按非空槽位顺序编号；编辑时选择原图序号。"],
            },
        }



def _safe_number(value: Any, default: int, minimum: int, maximum: int) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return default
    return max(minimum, min(maximum, number))


def _normalise_base_url(value: Any) -> str:
    base_url = str(value or "").strip().rstrip("/")
    parsed = urlparse(base_url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise RuntimeError("大模型连接的 baseUrl 必须是 http(s) 地址")
    if parsed.query or parsed.fragment:
        raise RuntimeError("大模型连接的 baseUrl 不能包含 query 或 fragment")
    if parsed.path.rstrip("/").endswith("/v1"):
        return base_url
    if parsed.path not in {"", "/"}:
        raise RuntimeError("baseUrl 请填写 origin 或以 /v1 结尾的地址；API 协议在连接节点中选择")
    return f"{base_url}/v1"


def _read_file_item(filename: str) -> tuple[bytes, str]:
    if not folder_paths.exists_annotated_filepath(filename):
        raise RuntimeError("参考图片不存在或已被移除，请重新上传")
    try:
        path = folder_paths.get_annotated_filepath(filename, folder_paths.get_input_directory())
        roots = [folder_paths.get_input_directory(), folder_paths.get_output_directory(), folder_paths.get_temp_directory()]
        if not any(os.path.commonpath([os.path.realpath(path), os.path.realpath(root)]) == os.path.realpath(root) for root in roots):
            raise RuntimeError("参考图片必须位于 ComfyUI 素材目录")
        with open(path, "rb") as handle:
            data = handle.read(200 * 1024 * 1024 + 1)
    except (OSError, ValueError):
        raise RuntimeError("读取参考图片失败，请重新上传") from None
    if len(data) > 200 * 1024 * 1024:
        raise RuntimeError("单张图片超过 200MB 读取上限")
    try:
        with Image.open(BytesIO(data)) as image:
            if getattr(image, "n_frames", 1) != 1:
                raise RuntimeError("仅支持静态图片，请将动画转换为单张图片")
            mime = Image.MIME.get(image.format, "image/png")
            image.verify()
    except (OSError, ValueError, Image.DecompressionBombError):
        raise RuntimeError("参考素材不是有效图片，请重新上传") from None
    return data, mime


def _tensor_item(value: Any) -> tuple[bytes, str]:
    try:
        tensor = value.detach().cpu().clamp(0, 1)
        if len(tensor.shape) == 4:
            tensor = tensor[0]
        array = (tensor.numpy() * 255).astype("uint8")
        image = Image.fromarray(array)
        output = BytesIO()
        image.save(output, format="PNG")
        return output.getvalue(), "image/png"
    except Exception:
        raise RuntimeError("无法编码连线图片，请改用 LoadImage 或重新上传") from None


def _image_parts(reference_images: Any, connection: dict[str, Any]) -> list[dict[str, str]]:
    if reference_images is None:
        return []
    if not isinstance(reference_images, dict) or not isinstance(reference_images.get("items"), list):
        raise RuntimeError("图片集合格式无效，请重新添加图片集合节点")

    items = reference_images["items"]
    max_images = _safe_number(connection.get("maxImages"), DEFAULT_MAX_IMAGES, 1, 64)
    max_image_bytes = _safe_number(connection.get("maxImageBytes"), DEFAULT_MAX_IMAGE_BYTES, 1, 200 * 1024 * 1024)
    max_total_bytes = _safe_number(connection.get("maxTotalImageBytes"), DEFAULT_MAX_TOTAL_BYTES, 1, 500 * 1024 * 1024)
    if len(items) > max_images:
        raise RuntimeError(f"参考图片最多 {max_images} 张，当前为 {len(items)} 张；请减少图片或调整连接配置")

    result: list[dict[str, str]] = []
    total = 0
    for item in items:
        if not isinstance(item, dict):
            raise RuntimeError("图片集合包含无效项目")
        if item.get("kind") == "file":
            data, mime = _read_file_item(str(item.get("value") or ""))
        elif item.get("kind") == "tensor":
            data, mime = _tensor_item(item.get("value"))
        else:
            raise RuntimeError("图片集合包含不支持的图片类型")
        if len(data) > max_image_bytes:
            raise RuntimeError(f"单张参考图片超过 {max_image_bytes // (1024 * 1024)}MB 上限")
        total += len(data)
        if total > max_total_bytes:
            raise RuntimeError(f"参考图片总大小超过 {max_total_bytes // (1024 * 1024)}MB 上限")
        result.append({"url": f"data:{mime};base64,{base64.b64encode(data).decode('ascii')}"})
    return result


def _response_text(payload: Any) -> str:
    try:
        content = payload["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError):
        raise RuntimeError("大模型返回缺少可解析内容") from None
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        chunks = [part.get("text", "") for part in content if isinstance(part, dict) and isinstance(part.get("text"), str)]
        return "".join(chunks).strip()
    raise RuntimeError("大模型返回内容格式无效")


def _parse_prompt_result(text: str) -> tuple[str, str]:
    candidate = text.strip()
    if candidate.startswith("```") and candidate.endswith("```"):
        lines = candidate.splitlines()
        if len(lines) >= 3:
            candidate = "\n".join(lines[1:-1]).strip()
    try:
        payload = json.loads(candidate)
    except (TypeError, ValueError):
        raise RuntimeError("大模型返回不是有效 JSON，请检查模型或兼容端点配置") from None
    if not isinstance(payload, dict):
        raise RuntimeError("大模型返回必须是 JSON 对象")
    positive = payload.get("positive_prompt")
    negative = payload.get("negative_prompt")
    if not isinstance(positive, str) or not positive.strip():
        raise RuntimeError("大模型返回缺少非空 positive_prompt")
    if negative is None:
        negative = ""
    if not isinstance(negative, str):
        raise RuntimeError("大模型返回的 negative_prompt 必须是字符串或 null")
    return positive.strip(), negative.strip()


class ModelHTTPError(RuntimeError):
    """Keep retry decisions independent of translated or upstream error text."""

    def __init__(self, status_code: int, protocol: str, client_restricted: bool = False):
        self.status_code = status_code
        self.client_restricted = client_restricted
        endpoint = "/responses" if protocol == "responses" else "/chat/completions"
        context = f"HTTP {status_code}，{endpoint}"
        if client_restricted:
            message = f"大模型服务不接受通用 API 请求（{context}），要求 Codex 等指定客户端；请使用支持通用 API 的连接或对应客户端接入"
        elif status_code in {404, 405}:
            message = f"大模型 API 不支持当前模型或端点不存在（{context}），请核对模型和 API 协议；仅支持 Responses 的模型不能使用 Chat Completions"
        elif status_code == 401:
            message = f"大模型鉴权失败（{context}），请检查 API Key 是否有效"
        elif status_code == 403:
            message = f"大模型访问被拒绝（{context}），请检查模型权限、网络或服务商的客户端限制"
        elif status_code == 429:
            message = f"大模型请求受限（{context}），请检查额度或稍后重试"
        elif status_code >= 500:
            message = f"大模型服务暂不可用（{context}），请稍后重试或检查服务商状态"
        else:
            message = f"大模型请求参数不兼容（{context}），请检查 API 协议、模型和连接配置"
        super().__init__(message)


def _sse_events(response):
    data: list[str] = []
    for raw_line in response:
        line = raw_line.decode("utf-8").rstrip("\r\n")
        if line.startswith("data:"):
            data.append(line[5:].lstrip(" "))
        elif not line and data:
            yield "\n".join(data)
            data = []
    if data:
        yield "\n".join(data)


def _read_responses_stream(response) -> Any:
    for data in _sse_events(response):
        if data == "[DONE]":
            break
        event = json.loads(data)
        if not isinstance(event, dict):
            raise RuntimeError("大模型返回的流事件格式无效")
        event_type = event.get("type")
        if event_type == "response.completed":
            return event.get("response")
        if event_type in ("error", "response.failed", "response.incomplete"):
            raise RuntimeError("大模型生成失败或输出不完整，请检查服务商状态后重试")
    # A delta can contain valid JSON even when generation subsequently fails.
    # Only a terminal completed response is safe to hand to the image sampler.
    raise RuntimeError("大模型输出流中断或缺少完成事件，请重试")


def _post_json(url: str, api_key: str, payload: dict[str, Any], timeout: int) -> tuple[int, Any]:
    request = Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"content-type": "application/json", **({"authorization": f"Bearer {api_key}"} if api_key else {})},
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            if "text/event-stream" in response.headers.get("content-type", "").lower():
                return int(response.status), _read_responses_stream(response)
            return int(response.status), json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        # Inspect only a bounded fragment for a known client restriction. Never
        # expose or retain upstream bodies, which can echo credentials or inputs.
        try:
            with error:
                client_restricted = b"invalid codex request" in error.read(8192).lower()
        except (OSError, HTTPException):
            client_restricted = False
        protocol = "responses" if url.endswith("/responses") else "chat_completions"
        raise ModelHTTPError(error.code, protocol, client_restricted) from None
    except (URLError, TimeoutError, OSError, HTTPException):
        raise RuntimeError("无法连接大模型或请求超时，请检查执行端网络和连接配置") from None
    except ValueError:
        raise RuntimeError("大模型返回不是有效 JSON 或 SSE，请检查 API 协议和兼容端点") from None


def _responses_payload(model: str, messages: list[dict[str, Any]]) -> dict[str, Any]:
    instructions: list[str] = []
    inputs: list[dict[str, Any]] = []
    for message in messages:
        if message["role"] == "system":
            instructions.append(message["content"])
            continue
        content = message["content"]
        if isinstance(content, str):
            content = [{"type": "text", "text": content}]
        parts: list[dict[str, Any]] = []
        for part in content:
            if part["type"] == "text":
                parts.append({"type": "input_text", "text": part["text"]})
            elif part["type"] == "image_url":
                parts.append({"type": "input_image", "image_url": part["image_url"]["url"]})
            else:
                raise RuntimeError("Responses 输入包含不支持的内容类型")
        inputs.append({"role": message["role"], "content": parts})
    return {
        "model": model,
        "instructions": "\n\n".join(instructions),
        "input": inputs,
        "store": False,
        "stream": True,
        "text": {"format": {"type": "json_schema", **PROMPT_SCHEMA}},
    }


def _responses_text(payload: Any) -> str:
    if not isinstance(payload, dict):
        raise RuntimeError("大模型返回的 Responses 格式无效")
    if payload.get("error") or payload.get("status") not in (None, "completed"):
        raise RuntimeError("大模型生成失败或输出不完整，请检查服务商状态后重试")
    output = payload.get("output")
    if not isinstance(output, list):
        raise RuntimeError("大模型返回缺少 Responses 输出")
    chunks: list[str] = []
    for item in output:
        if not isinstance(item, dict) or item.get("type") != "message" or item.get("role", "assistant") != "assistant":
            continue
        if item.get("status") not in (None, "completed"):
            raise RuntimeError("大模型消息输出不完整，请重试")
        content = item.get("content")
        if not isinstance(content, list):
            raise RuntimeError("大模型返回的消息内容格式无效")
        for part in content:
            if not isinstance(part, dict):
                continue
            if part.get("type") == "refusal":
                raise RuntimeError("大模型未接受当前需求，请调整需求后重试")
            if part.get("type") == "output_text" and isinstance(part.get("text"), str):
                chunks.append(part["text"])
    text = "".join(chunks).strip()
    if not text:
        raise RuntimeError("大模型返回缺少可解析的提示词文本")
    return text


def _request_model(url: str, api_key: str, payload: dict[str, Any], timeout: int, format_key: str) -> Any:
    try:
        _, response = _post_json(url, api_key, payload, timeout)
    except ModelHTTPError as error:
        if error.status_code != 400 or error.client_restricted:
            raise
        # Some compatible services reject structured-output parameters. Retry
        # only the rejected request; never retry parsing or a failed output stream.
        fallback = {key: value for key, value in payload.items() if key != format_key}
        _, response = _post_json(url, api_key, fallback, timeout)
    return response


def _call_model(connection: dict[str, Any], model: str, messages: list[dict[str, Any]], timeout: int) -> tuple[str, str]:
    api_key = str(connection.get("apiKey") or "").strip()
    if connection.get("auth") == "none":
        api_key = ""
    elif not api_key:
        raise RuntimeError("大模型连接未配置 apiKey")
    base_url = _normalise_base_url(connection.get("baseUrl"))
    protocol = str(connection.get("apiProtocol") or "auto").strip()
    if protocol not in API_PROTOCOLS:
        raise RuntimeError("大模型 API 协议无效，请选择 auto、chat_completions 或 responses")
    if protocol in {"auto", "chat_completions"}:
        payload = {
            "model": model,
            "messages": messages,
            "temperature": 0.2,
            "response_format": {"type": "json_schema", "json_schema": PROMPT_SCHEMA},
        }
        try:
            response = _request_model(f"{base_url}/chat/completions", api_key, payload, timeout, "response_format")
        except ModelHTTPError as error:
            if protocol != "auto" or error.status_code not in {404, 405} or error.client_restricted:
                raise
        else:
            return _parse_prompt_result(_response_text(response))
    payload = _responses_payload(model, messages)
    response = _request_model(f"{base_url}/responses", api_key, payload, timeout, "text")
    return _parse_prompt_result(_responses_text(response))


class ForkVdoPrompt:
    @classmethod
    def INPUT_TYPES(cls):
        connections = _configured_connections()
        first_connection = connections.get(sorted(connections.keys())[0], {}) if connections else {}
        return {
            "required": {
                "connection_id": (_connection_ids(), {"tooltip": "workflow 表示使用已连接的工作流配置；云端连接标识仍从 ComfyUI 执行端环境读取"}),
                "model_name": ("STRING", {"default": str(first_connection.get("defaultModel") or ""), "socketless": True}),
                "user_request": ("STRING", {"default": "", "multiline": True, "dynamicPrompts": True}),
                "default_rules": ("STRING", {"default": DEFAULT_RULES, "multiline": True, "dynamicPrompts": True, "socketless": True}),
                "target_config": ("STRING", {"default": "通用图片模型；使用自然语言描述画面", "socketless": True}),
                "refresh_token": ("INT", {"default": 0, "min": 0, "max": 0x7FFFFFFF}),
            },
            "optional": {
                "reference_images": ("IMAGE_COLLECTION", {"tooltip": "可选；按集合节点中的图1、图2顺序发送"}),
                "llm_config": ("FORKVDO_LLM_CONFIG", {"tooltip": "可选；连接工作流内的大模型配置后优先使用"}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("positive_prompt", "negative_prompt")
    FUNCTION = "generate"
    CATEGORY = "forkvdo/prompt"
    DESCRIPTION = "理解文字与有序参考图，输出正负提示词。选择 manual 直接使用需求，不调用大模型；其他连接可为云端或本地视觉模型。修改 refresh_token 后再次运行可重新生成。"

    @classmethod
    def IS_CHANGED(cls, connection_id, model_name, user_request, default_rules, target_config, refresh_token, reference_images=None, llm_config=None):
        # The explicit refresh token is intentionally part of the cache key. Other values are
        # included so normal edits invalidate the node without making every retry call the LLM.
        digest = hashlib.sha256()
        digest.update(os.environ.get("FORKVDO_LLM_CONNECTIONS_JSON", "").encode("utf-8"))
        digest.update(json.dumps({
            "connection_id": connection_id,
            "model_name": model_name,
            "user_request": user_request,
            "default_rules": default_rules,
            "target_config": target_config,
            "refresh_token": refresh_token,
            "reference_count": len(reference_images.get("items", [])) if isinstance(reference_images, dict) else 0,
            "llm_config": llm_config,
        }, ensure_ascii=False, sort_keys=True).encode("utf-8"))
        return digest.hexdigest()

    def generate(self, connection_id, model_name, user_request, default_rules, target_config, refresh_token, reference_images=None, llm_config=None):
        del refresh_token
        request_text = str(user_request or "").strip()
        if not request_text:
            raise RuntimeError("请填写用户需求")
        if llm_config is None and connection_id == "manual":
            return {"result": (request_text, ""), "ui": {"text": ["手动模式：直接使用需求文本，参考图未经过大模型理解。", request_text]}}
        if llm_config is not None:
            if not isinstance(llm_config, dict):
                raise RuntimeError("工作流大模型配置格式无效")
            connection = llm_config
        else:
            connections = _connection_config()
            connection_key = str(connection_id or "").strip()
            connection = connections.get(connection_key)
            if connection is None:
                raise RuntimeError("大模型连接标识无效，请选择已配置的连接")
        model = str(model_name or connection.get("defaultModel") or "").strip()
        if not model:
            raise RuntimeError("请填写大模型名称")
        images = _image_parts(reference_images, connection)
        if images and not bool(connection.get("supportsVision", False)):
            raise RuntimeError("当前连接未声明支持视觉输入，不能处理参考图片")
        rules = str(default_rules or DEFAULT_RULES).strip() or DEFAULT_RULES
        target = str(target_config or "generic image generation")
        image_note = ""
        if images:
            image_note = f"\nThe following {len(images)} reference images are provided in exact UI order. Use the user's description to infer each image's purpose; do not assume they are separate outputs."
        system = f"{rules}\n\nTarget model guidance: {target}"
        user_content: Any = request_text + image_note
        if images:
            user_content = [{"type": "text", "text": request_text + image_note}]
            for index, image in enumerate(images, 1):
                user_content.append({"type": "text", "text": f"图{index}"})
                user_content.append({"type": "image_url", "image_url": {"url": image["url"]}})
        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": user_content},
        ]
        timeout = _safe_number(connection.get("timeoutSeconds"), DEFAULT_TIMEOUT_SECONDS, 5, 600)
        positive, negative = _call_model(connection, model, messages, timeout)
        return {
            "result": (positive, negative),
            "ui": {
                "text": [f"正向提示词：\n{positive}", f"反向提示词：\n{negative}"],
                "positive_prompt": [positive],
                "negative_prompt": [negative],
                "reference_count": [str(len(images))],
            },
        }


NODE_CLASS_MAPPINGS = {
    "ForkVdoImageCollection": ForkVdoImageCollection,
    "ForkVdoPrompt": ForkVdoPrompt,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ForkVdoImageCollection": "forkvdo 图片集合",
    "ForkVdoPrompt": "forkvdo 大模型提示词",
}
