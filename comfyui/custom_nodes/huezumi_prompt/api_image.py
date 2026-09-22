"""OpenAI-compatible image generation with administrator-assigned credentials."""
import base64
from io import BytesIO

import numpy as np
import requests
import torch
from PIL import Image, ImageOps

from .runtime_connections import runtime_connections


class HuezumiApiImage:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "prompt": ("STRING", {"multiline": True, "default": ""}),
            "size": (["1024x1024", "1536x1024", "1024x1536", "auto"],),
        }}

    RETURN_TYPES = ("IMAGE",)
    FUNCTION = "generate"
    CATEGORY = "huezumi/image"
    DESCRIPTION = "通过管理面板的图片连接调用 /images/generations；模型、地址和 Key 由管理员分配。"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def generate(self, prompt, size):
        config = (runtime_connections() or {}).get("image") or {}
        if not config.get("baseUrl") or not config.get("defaultModel"):
            raise RuntimeError("请在管理面板分配图片 API 连接")
        if not str(prompt).strip():
            raise RuntimeError("请填写图片提示词")
        headers = {}
        if config.get("auth") != "none":
            if not config.get("apiKey"):
                raise RuntimeError("图片连接缺少 API Key")
            headers["Authorization"] = f"Bearer {config['apiKey']}"
        timeout = config.get("timeoutSeconds") or 120
        try:
            base_url = config["baseUrl"].rstrip("/")
            if config.get("provider") == "dashscope":
                base_url = base_url.replace("/compatible-mode/v1", "/api/v1")
                payload = {"model": config["defaultModel"],
                           "input": {"messages": [{"role": "user", "content": [{"text": prompt}]}]},
                           "parameters": {"size": "1024*1024" if size == "auto" else size.replace("x", "*"), "n": 1}}
                response = requests.post(f"{base_url}/services/aigc/multimodal-generation/generation",
                                         headers=headers, timeout=timeout, json=payload)
                response.raise_for_status()
                content = response.json()["output"]["choices"][0]["message"]["content"]
                item = {"url": next(part["image"] for part in content if part.get("image"))}
            else:
                response = requests.post(f"{base_url}/images/generations",
                                         headers=headers, timeout=timeout,
                                         json={"model": config["defaultModel"], "prompt": prompt, "size": size, "n": 1})
                response.raise_for_status()
                item = response.json()["data"][0]
            if item.get("b64_json"):
                raw = base64.b64decode(item["b64_json"], validate=True)
            else:
                url = item.get("url", "")
                if not url.startswith("https://"):
                    raise ValueError("Invalid image URL")
                # Do not forward provider credentials to its image storage host.
                download = requests.get(url, timeout=timeout)
                download.raise_for_status()
                raw = download.content
            image = ImageOps.exif_transpose(Image.open(BytesIO(raw))).convert("RGB")
            return (torch.from_numpy(np.array(image).astype(np.float32) / 255.0).unsqueeze(0),)
        except (requests.RequestException, ValueError, KeyError, IndexError, TypeError, OSError, StopIteration):
            # Provider responses and request objects can contain secrets.
            raise RuntimeError("图片 API 调用失败，请检查管理面板中的地址、模型、Key 和尺寸支持；超时后请先核对供应商记录") from None


NODE_CLASS_MAPPINGS = {"HuezumiApiImage": HuezumiApiImage}
NODE_DISPLAY_NAME_MAPPINGS = {"HuezumiApiImage": "图片 API · 后台连接"}
