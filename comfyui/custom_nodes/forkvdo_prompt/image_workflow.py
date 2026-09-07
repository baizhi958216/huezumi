"""Small, model-independent building blocks around ComfyUI's native sampler.

No model loading, provider protocol or workflow knowledge belongs in the web UI.
The generator accepts standard MODEL/CLIP/VAE outputs from existing loaders.
"""

from io import BytesIO
import math

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image, ImageOps

from .nodes import _input_image_choices, _read_file_item


class ForkVdoLLMConfig:
    """Keep a user-owned OpenAI-compatible connection inside a workflow copy."""

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "base_url": ("STRING", {"default": "", "tooltip": "OpenAI Chat Completions 兼容地址，例如 https://api.example.com/v1"}),
            "api_key": ("STRING", {"default": "", "secret": True, "tooltip": "会随私有工作流保存；不要把包含密钥的工作流公开或分享"}),
            "auth": (["bearer", "none"], {"default": "bearer", "tooltip": "云端一般使用 bearer；本机免鉴权服务选择 none"}),
            "model_name": ("STRING", {"default": "", "tooltip": "供应商实际模型名称"}),
            "supports_vision": ("BOOLEAN", {"default": True, "tooltip": "上传参考图时必须启用，并且模型确实支持视觉输入"}),
            "timeout_seconds": ("INT", {"default": 120, "min": 5, "max": 600}),
        }}

    RETURN_TYPES = ("FORKVDO_LLM_CONFIG",)
    RETURN_NAMES = ("config",)
    FUNCTION = "configure"
    CATEGORY = "forkvdo/connection"
    DESCRIPTION = "把用户自己的 OpenAI 兼容接口、API Key 和模型写入工作流副本。包含密钥的工作流必须保持私有。"

    def configure(self, base_url, api_key, auth, model_name, supports_vision, timeout_seconds):
        return ({
            "baseUrl": str(base_url or "").strip(),
            "apiKey": str(api_key or "").strip(),
            "auth": "none" if auth == "none" else "bearer",
            "supportsVision": bool(supports_vision),
            "defaultModel": str(model_name or "").strip(),
            "timeoutSeconds": max(5, min(600, int(timeout_seconds))),
        },)


class ForkVdoText:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"text": ("STRING", {"default": "", "multiline": True})}}

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "execute"
    CATEGORY = "forkvdo/text"
    DESCRIPTION = "写下需求，并通过连线交给大模型。说明图1、图2的角色，以及需要保留和修改的内容。"

    def execute(self, text):
        return (text,)


class ForkVdoPromptText:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "operation": (["append", "replace"], {"tooltip": "append：保留大模型结果并追加；replace：用下方文本替换"}),
            "text": ("STRING", {"default": "", "multiline": True}),
        }, "optional": {"prompt": ("STRING", {"forceInput": True})}}

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("prompt",)
    FUNCTION = "execute"
    CATEGORY = "forkvdo/text"
    DESCRIPTION = "独立查看、追加或替换正向/反向提示词。运行后展示最终文本；反向提示词可以为空。"

    def execute(self, operation, text, prompt=""):
        if operation not in {"append", "replace"}:
            raise RuntimeError("提示词操作必须是 append 或 replace")
        value = str(text).strip() if operation == "replace" else ", ".join(
            part for part in [str(prompt).strip(), str(text).strip()] if part)
        return {"result": (value,), "ui": {"text": [value or "（空提示词）"]}}


def _load_pixels(item):
    if item.get("kind") == "tensor":
        value = item["value"]
        if not isinstance(value, torch.Tensor):
            raise RuntimeError("原图连线必须是 IMAGE 张量")
        if value.ndim == 3:
            value = value.unsqueeze(0)
        if value.ndim != 4 or value.shape[0] != 1 or value.shape[-1] not in (3, 4):
            raise RuntimeError("每个原图槽必须是一张 RGB/RGBA 图片")
        return value[..., :3].detach().cpu().float().clamp(0, 1)
    if item.get("kind") != "file":
        raise RuntimeError("原图格式无效")
    data, _ = _read_file_item(str(item["value"]))
    with Image.open(BytesIO(data)) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        return torch.from_numpy(np.array(image).astype(np.float32) / 255).unsqueeze(0)


def _load_mask(filename):
    data, _ = _read_file_item(filename)
    with Image.open(BytesIO(data)) as image:
        image = ImageOps.exif_transpose(image).convert("L")
        return torch.from_numpy(np.array(image).astype(np.float32) / 255).unsqueeze(0)


class ForkVdoImagePlan:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "positive": ("STRING", {"forceInput": True}),
            "negative": ("STRING", {"forceInput": True}),
            "mode": (["generate", "edit", "inpaint"], {"tooltip": "generate 生图；edit 整图编辑；inpaint 局部重绘"}),
            "width": ("INT", {"default": 512, "min": 64, "max": 4096, "step": 8, "tooltip": "仅生图使用；编辑保留原图尺寸"}),
            "height": ("INT", {"default": 512, "min": 64, "max": 4096, "step": 8}),
            "source_index": ("INT", {"default": 1, "min": 1, "max": 64, "tooltip": "编辑哪张原图：按图片集合实际非空顺序，从1开始"}),
            "edit_strength": ("FLOAT", {"default": 0.45, "min": 0, "max": 1, "step": 0.05, "tooltip": "越低越接近原图；0直接返回原图；生图模式忽略此值"}),
        }, "optional": {
            "images": ("IMAGE_COLLECTION",),
            "mask_image": (_input_image_choices(), {"image_upload": True, "tooltip": "局部重绘需同尺寸黑白遮罩：白色修改，黑色保留。支持灰度过渡。"}),
            "mask": ("MASK", {"tooltip": "可接其他遮罩节点；连线优先于遮罩文件"}),
        }}

    RETURN_TYPES = ("IMAGE_PLAN",)
    RETURN_NAMES = ("plan",)
    FUNCTION = "prepare"
    CATEGORY = "forkvdo/image"
    DESCRIPTION = "整合提示词、图片与创作模式。多图用于大模型理解；编辑仅作用于 source_index 指定的原图。局部重绘必须提供遮罩。"

    @classmethod
    def IS_CHANGED(cls, mask_image="", mask=None, mode="generate", **kwargs):
        if mode == "inpaint" and mask is None and mask_image:
            import hashlib
            return hashlib.sha256(_read_file_item(mask_image)[0]).hexdigest()
        return "no-mask-file"

    def prepare(self, positive, negative, mode, width, height, source_index, edit_strength,
                images=None, mask_image="", mask=None):
        if mode not in {"generate", "edit", "inpaint"}:
            raise RuntimeError("创作模式无效")
        if not isinstance(positive, str) or not positive.strip():
            raise RuntimeError("正向提示词不能为空")
        if not isinstance(negative, str):
            raise RuntimeError("反向提示词必须为文本")
        if not 0 <= edit_strength <= 1 or not math.isfinite(edit_strength):
            raise RuntimeError("编辑强度必须在0到1之间")
        if not all(isinstance(size, int) and 64 <= size <= 4096 for size in (width, height)):
            raise RuntimeError("生图宽高必须为64到4096之间的整数")
        original = edit_mask = None
        if mode != "generate":
            items = images.get("items", []) if isinstance(images, dict) else []
            if not isinstance(source_index, int) or not 1 <= source_index <= len(items):
                raise RuntimeError("原图编辑需要图片，请上传并选择有效的 source_index 原图序号")
            original = _load_pixels(items[source_index - 1])
            height, width = original.shape[1:3]
            if not 8 <= min(height, width) or max(height, width) > 4096:
                raise RuntimeError("编辑原图边长需在8到4096像素之间，请先缩放图片")
            if mode == "inpaint":
                edit_mask = mask if mask is not None else (_load_mask(mask_image) if mask_image else None)
                if edit_mask is None:
                    raise RuntimeError("局部重绘需要遮罩：请上传同尺寸黑白图片，白色修改、黑色保留")
                if not isinstance(edit_mask, torch.Tensor):
                    raise RuntimeError("遮罩连线必须为 MASK 张量")
                if edit_mask.ndim == 2:
                    edit_mask = edit_mask.unsqueeze(0)
                if tuple(edit_mask.shape) != (1, height, width):
                    raise RuntimeError("遮罩尺寸必须与原图一致，且只能包含一张遮罩")
                if not torch.isfinite(edit_mask).all():
                    raise RuntimeError("遮罩包含无效数值")
                edit_mask = edit_mask.detach().cpu().float().clamp(0, 1)
                if not torch.any(edit_mask > 0):
                    raise RuntimeError("遮罩全黑，没有可修改区域；请用白色标记重绘位置")
        return ({"positive": positive.strip(), "negative": negative.strip(), "mode": mode,
                 "width": width, "height": height, "strength": edit_strength,
                 "original": original, "mask": edit_mask},)


def _pad_pixels(pixels, factor):
    height, width = pixels.shape[1:3]
    return F.pad(pixels.movedim(-1, 1), (0, -width % factor, 0, -height % factor), mode="replicate").movedim(1, -1)


def _finish_image(generated, plan):
    image = generated[:, :plan["height"], :plan["width"], :3]
    if plan["mode"] == "inpaint":
        original = plan["original"].to(image)
        mask = plan["mask"].to(image).unsqueeze(-1)
        # VAE round-trips change even unmasked pixels; composite against the untouched original.
        image = torch.where(mask == 0, original, image * mask + original * (1 - mask))
    return image


class ForkVdoImageGenerate:
    @classmethod
    def INPUT_TYPES(cls):
        import nodes
        sampler_inputs = nodes.KSampler.INPUT_TYPES()["required"]
        return {"required": {
            "model": ("MODEL",), "clip": ("CLIP",), "vae": ("VAE",), "plan": ("IMAGE_PLAN",),
            "seed": ("INT", {"default": 0, "min": 0, "max": 0xFFFFFFFF, "control_after_generate": True}),
            "steps": ("INT", {"default": 24, "min": 1, "max": 100}),
            "cfg": ("FLOAT", {"default": 7, "min": 0, "max": 30, "step": 0.5}),
            "sampler_name": sampler_inputs["sampler_name"],
            "scheduler": sampler_inputs["scheduler"],
        }}

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "generate"
    CATEGORY = "forkvdo/image"
    DESCRIPTION = "复用 ComfyUI 文本编码、KSampler 和 VAE。接入匹配的 MODEL/CLIP/VAE；默认 checkpoint 支持 SD1.5/SDXL。特殊编辑模型需其专用链路。"

    def generate(self, model, clip, vae, plan, seed, steps, cfg, sampler_name, scheduler):
        import nodes
        import comfy.model_management as management

        if plan["mode"] != "generate" and plan["strength"] == 0:
            return (plan["original"].clone(),)
        factor = int(vae.spacial_compression_encode())
        if factor < 1 or vae.latent_dim not in (2, 3):
            raise RuntimeError("此 VAE 需要专用生成链路，请更换兼容的图片模型")
        if plan["mode"] == "generate":
            shape = [1, vae.latent_channels]
            if vae.latent_dim == 3:
                shape.append(1)
            shape.extend([math.ceil(plan["height"] / factor), math.ceil(plan["width"] / factor)])
            latent = {"samples": torch.zeros(shape, device=management.intermediate_device(), dtype=management.intermediate_dtype())}
        else:
            pixels = _pad_pixels(plan["original"], factor)
            latent = nodes.VAEEncode().encode(vae, pixels)[0]
            if plan["mode"] == "inpaint":
                height, width = plan["mask"].shape[-2:]
                latent["noise_mask"] = F.pad(plan["mask"], (0, -width % factor, 0, -height % factor))
        positive = nodes.CLIPTextEncode().encode(clip, plan["positive"])[0]
        negative = nodes.CLIPTextEncode().encode(clip, plan["negative"])[0]
        samples = nodes.KSampler().sample(
            model, seed, steps, cfg, sampler_name, scheduler, positive, negative, latent,
            denoise=1.0 if plan["mode"] == "generate" else plan["strength"])[0]
        generated = nodes.VAEDecode().decode(vae, samples)[0]
        return (_finish_image(generated, plan),)


NODE_CLASS_MAPPINGS = {cls.__name__: cls for cls in (ForkVdoLLMConfig, ForkVdoText, ForkVdoPromptText, ForkVdoImagePlan, ForkVdoImageGenerate)}
NODE_DISPLAY_NAME_MAPPINGS = {
    "ForkVdoLLMConfig": "大模型连接 · 用户自定义 API / Key",
    "ForkVdoText": "需求文本",
    "ForkVdoPromptText": "提示词 · 追加 / 替换",
    "ForkVdoImagePlan": "创作设置 · 生图 / 编辑 / 重绘",
    "ForkVdoImageGenerate": "生成图片",
}
