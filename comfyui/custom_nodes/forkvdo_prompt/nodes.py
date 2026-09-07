"""One-shot multimodal prompt nodes for forkvdo.

The node deliberately keeps provider secrets out of graph inputs.  A ComfyUI
execution host supplies FORKVDO_LLM_CONNECTIONS_JSON, and graph inputs only
refer to a connection id.
"""

from __future__ import annotations

import base64
import hashlib
import json
import mimetypes
import os
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

DEFAULT_RULES = """You are an expert prompt director for an AI image-generation workflow.
Your task is to analyze the user's natural language request and any ordered reference images (labeled as 图1, 图2...), and produce two prompts: positive_prompt and negative_prompt.
Return exactly one JSON object with these keys:
- positive_prompt: A descriptive, concrete prompt tailored for the Anima image model. Must be a non-empty string.
- negative_prompt: Undesired visual flaws, artifacts, or traits. May be an empty string.

Guidelines:
1. Understand the exact role of each reference image based on the user's request (e.g. "图1 is art style, 图2 is character 3-view turnaround, generate this character in a desert").
2. Separate visual traits that must be preserved (e.g., character identity, hair/eye color, costume, facial features, or artistic style) from elements that must be changed (e.g., background, lighting, action, camera angle).
3. Do not arbitrarily alter key character or scene features that the user did not ask to change.
4. Adapt prompt style specifically for Anima: describe concrete visual subjects, composition, lighting, materials, colors, camera framing, and quality keywords (e.g. masterpiece, best quality, detailed background). Avoid meta descriptions or story narratives.
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
    return sorted(_configured_connections().keys()) or ["default"]


def _input_image_choices() -> list[str]:
    files = folder_paths.get_filename_list("input")
    try:
        files = folder_paths.filter_files_content_types(files, ["image"])
    except Exception:
        files = []
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

        image_names = [
            str(item.get("value") or f"连线图片{i + 1}") if item.get("kind") == "file" else f"连线张量{i + 1}"
            for i, item in enumerate(items)
        ]

        return {
            "result": ({"items": items},),
            "ui": {
                "image_count": [str(len(items))],
                "images": image_names,
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
        raise RuntimeError("首版只支持 origin 或以 /v1 结尾的 OpenAI 兼容 baseUrl")
    return f"{base_url}/v1"


def _read_file_item(filename: str) -> tuple[bytes, str]:
    if not folder_paths.exists_annotated_filepath(filename):
        raise RuntimeError("参考图片不存在或已被移除，请重新上传")
    try:
        path = folder_paths.get_annotated_filepath(filename, folder_paths.get_input_directory())
        with open(path, "rb") as handle:
            data = handle.read()
    except (OSError, ValueError):
        raise RuntimeError("读取参考图片失败，请重新上传") from None
    mime = mimetypes.guess_type(filename, strict=False)[0] or "image/png"
    if not mime.startswith("image/"):
        raise RuntimeError("参考素材必须是图片")
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


def _post_json(url: str, api_key: str, payload: dict[str, Any], timeout: int) -> tuple[int, Any]:
    request = Request(
        url,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"content-type": "application/json", "authorization": f"Bearer {api_key}"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=timeout) as response:
            body = response.read()
            return int(response.status), json.loads(body.decode("utf-8"))
    except HTTPError as error:
        # Do not include upstream response bodies in the ComfyUI error; they may contain secrets.
        raise RuntimeError(f"大模型连接被拒绝（HTTP {error.code}），请检查连接标识、密钥、模型和端点") from None
    except (URLError, TimeoutError, OSError, ValueError):
        raise RuntimeError("无法连接大模型或请求超时，请检查执行端网络和连接配置") from None


def _call_model(connection: dict[str, Any], model: str, messages: list[dict[str, Any]], timeout: int) -> tuple[str, str]:
    api_key = str(connection.get("apiKey") or "").strip()
    if not api_key:
        raise RuntimeError("大模型连接未配置 apiKey")
    url = f"{_normalise_base_url(connection.get('baseUrl'))}/chat/completions"
    payload: dict[str, Any] = {
        "model": model,
        "messages": messages,
        "temperature": 0.2,
        "response_format": {
            "type": "json_schema",
            "json_schema": {
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
            },
        },
    }
    try:
        _, response = _post_json(url, api_key, payload, timeout)
        return _parse_prompt_result(_response_text(response))
    except RuntimeError as error:
        # A 400 from a compatible endpoint is indistinguishable from other 400s without
        # exposing the body. Retry once without response_format; output validation remains strict.
        if "HTTP 400" not in str(error):
            raise
        payload.pop("response_format", None)
        _, response = _post_json(url, api_key, payload, timeout)
        return _parse_prompt_result(_response_text(response))


class ForkVdoPrompt:
    @classmethod
    def INPUT_TYPES(cls):
        connections = _configured_connections()
        first_connection = connections.get(sorted(connections.keys())[0], {}) if connections else {}
        return {
            "required": {
                "connection_id": (_connection_ids(), {"tooltip": "只保存连接标识；密钥由 ComfyUI 执行端环境提供"}),
                "model_name": ("STRING", {"default": str(first_connection.get("defaultModel") or ""), "socketless": True}),
                "user_request": ("STRING", {"default": "", "multiline": True, "dynamicPrompts": True, "socketless": True}),
                "default_rules": ("STRING", {"default": DEFAULT_RULES, "multiline": True, "dynamicPrompts": True, "socketless": True}),
                "target_config": (["anima"], {"default": "anima"}),
                "refresh_token": ("INT", {"default": 0, "min": 0, "max": 0x7FFFFFFF}),
            },
            "optional": {
                "reference_images": ("IMAGE_COLLECTION", {"tooltip": "可选；按集合节点中的图1、图2顺序发送"}),
            },
        }

    RETURN_TYPES = ("STRING", "STRING")
    RETURN_NAMES = ("positive_prompt", "negative_prompt")
    FUNCTION = "generate"
    CATEGORY = "forkvdo/prompt"
    DESCRIPTION = "一次性理解文字与参考图，输出 Anima 正向和反向提示词。"

    @classmethod
    def IS_CHANGED(cls, connection_id, model_name, user_request, default_rules, target_config, refresh_token, reference_images=None):
        # The explicit refresh token is intentionally part of the cache key. Other values are
        # included so normal edits invalidate the node without making every retry call the LLM.
        digest = hashlib.sha256()
        digest.update(json.dumps({
            "connection_id": connection_id,
            "model_name": model_name,
            "user_request": user_request,
            "default_rules": default_rules,
            "target_config": target_config,
            "refresh_token": refresh_token,
            "reference_count": len(reference_images.get("items", [])) if isinstance(reference_images, dict) else 0,
        }, ensure_ascii=False, sort_keys=True).encode("utf-8"))
        return digest.hexdigest()

    def generate(self, connection_id, model_name, user_request, default_rules, target_config, refresh_token, reference_images=None):
        del refresh_token
        connections = _connection_config()
        connection_key = str(connection_id or "").strip()
        connection = connections.get(connection_key)
        if connection is None:
            raise RuntimeError("大模型连接标识无效，请选择已配置的连接")
        model = str(model_name or connection.get("defaultModel") or "").strip()
        if not model:
            raise RuntimeError("请填写大模型名称")
        if reference_images is not None and not bool(connection.get("supportsVision", False)):
            raise RuntimeError("当前连接未声明支持视觉输入，不能处理参考图片")

        images = _image_parts(reference_images, connection)
        request_text = str(user_request or "").strip()
        if not request_text:
            raise RuntimeError("请填写用户需求")
        rules = str(default_rules or DEFAULT_RULES).strip() or DEFAULT_RULES
        target = str(target_config or "anima")
        image_note = ""
        if images:
            image_note = f"\nThe following {len(images)} reference images are provided in exact UI order. Use the user's description to infer each image's purpose; do not assume they are separate outputs."
        system = f"{rules}\n\nTarget prompt adapter: {target}. Generate prompts suitable for the existing Anima image workflow."
        user_content: Any = request_text + image_note
        if images:
            user_content = [{"type": "text", "text": request_text + image_note}]
            for image in images:
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
