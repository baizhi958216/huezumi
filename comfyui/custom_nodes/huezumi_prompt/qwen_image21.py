"""Compact Qwen Image 2.1 editing nodes for huezumi workflows."""

from __future__ import annotations

import hashlib
from io import BytesIO
import json
import os
import re

import numpy as np
import torch
from PIL import Image, ImageOps

from .nodes import (
    _call_model,
    _configured_connections,
    _image_parts,
    _read_file_item,
    _safe_number,
)


from .runtime_connections import connection_revision


MAX_QWEN_IMAGE21_REFERENCES = 10

ASPECT_DIMENSIONS = {
    "1:1": (1024, 1024),
    "4:3": (1152, 864),
    "3:4": (864, 1152),
    "16:9": (1344, 768),
    "9:16": (768, 1344),
}

QWEN_AGENT_RULES = """You are the creative-planning agent in front of Qwen Image 2.1.
The user writes ordinary natural language and must never be expected to understand node order or model syntax.
Analyze the request and every ordered uploaded image, then return exactly one JSON object with:
- positive_prompt: a concrete Chinese or English instruction for Qwen Image 2.1; non-empty.
- negative_prompt: unwanted results and artifacts; may be empty.

Requirements:
1. Infer whether each upload is a logo/brand asset, the image to edit, a product/content reference, or a style/composition reference.
2. Respect the downstream <imageN> mapping supplied in the user message. Mention those tags when assigning image roles.
3. For a new design, create exactly one coherent finished scene or product. Do not make a collage, contact sheet, mood board, comparison board, or several independent alternatives unless explicitly requested.
4. A logo is a brand asset, never the output canvas. Preserve its spelling, shape and colors and do not imitate unrelated brands visible in references.
5. For an edit, identify one main image and state what must remain unchanged and what may change.
6. Specify composition, subject, materials, brand palette, lighting, camera angle, background and deliverable format. Avoid vague praise and unsupported factual claims.
7. If web search is available and the user requests online research, search before planning. Prefer official brand sources. Use verified visual facts in the prompt, but do not put citations, URLs, markdown, API parameters or research narration into the image prompt.
8. If search is unavailable, do not claim that research was performed; rely only on the request and uploads.
9. Preserve transparency only when the user explicitly requests a transparent background, cutout, or alpha channel. Otherwise describe a fully opaque scene with a deliberate background.
"""


def _agent_connection():
    connections = _configured_connections()
    if not connections:
        return None
    preferred = []
    for name, connection in sorted(connections.items()):
        purpose = str(connection.get("purpose") or "").strip().lower()
        if name == "image_agent" or purpose in {"image_agent", "qwen_image_agent"} or connection.get("defaultForImageAgent") is True:
            preferred.append((name, connection))
    if preferred:
        return preferred[0]
    if len(connections) == 1:
        return next(iter(connections.items()))
    return None


def _detect_mode(user_request: str, image_count: int) -> str:
    if image_count == 0:
        return "create"
    request = user_request.lower()
    edit_markers = (
        "编辑", "修改", "替换", "换成", "改成", "去掉", "移除", "保持不变", "局部", "重绘",
        "edit", "replace", "remove", "keep unchanged", "inpaint",
    )
    create_markers = (
        "生成", "设计", "创作", "做一个", "做一张", "来一张", "从零", "想要有", "海报", "壁纸",
        "generate", "design", "create", "make a", "from scratch", "poster", "wallpaper",
    )
    if any(marker in request for marker in edit_markers):
        return "edit"
    if any(marker in request for marker in create_markers):
        return "create"
    return "create"


def _detect_aspect(user_request: str, selected: str) -> str:
    if selected != "auto":
        return selected
    request = user_request.lower()
    if any(marker in request for marker in ("手机壁纸", "竖屏", "手机海报", "story", "9:16")):
        return "9:16"
    if any(marker in request for marker in ("电脑壁纸", "桌面壁纸", "横屏", "宽屏", "16:9", "wallpaper")):
        return "16:9"
    if any(marker in request for marker in ("头像", "方形", "1:1", "icon", "avatar")):
        return "1:1"
    if any(marker in request for marker in ("竖版", "小红书", "封面", "3:4")):
        return "3:4"
    return "4:3"


def _needs_research(user_request: str) -> bool:
    return bool(re.search(r"上网|联网|搜索|搜一下|查找|查资料|官网|最新|research|search online|look up", user_request, re.I))


def _wants_transparency(user_request: str) -> bool:
    return bool(re.search(
        r"透明底|透明背景|背景透明|去背景|无背景|抠图|透明通道|alpha|transparent\s+background|cutout|remove\s+background",
        user_request,
        re.I,
    ))


def _mapping_note(mode: str, count: int, aspect: str) -> str:
    if mode == "create":
        mappings = "；".join(f"上传图{index} 对应下游 <image{index + 1}>" for index in range(1, count + 1))
        return f"这是从零创作。下游 <image1> 是系统生成的 {aspect} 目标画布，不是参考素材。{mappings or '没有上传参考图。'}"
    mappings = "；".join(f"上传图{index} 对应下游 <image{index}>" for index in range(1, count + 1))
    return f"这是图片编辑。{mappings}。默认 <image1> 是主图；只有用户明确指定其他主图时才改变判断。"


def _likely_logo_indexes(items) -> list[int]:
    indexes = []
    for index, item in enumerate(items, 1):
        try:
            pixels = _load_qwen_image(item)
            height, width = pixels.shape[1:3]
            aspect = max(width / max(height, 1), height / max(width, 1))
            transparent = pixels.shape[-1] == 4 and float((pixels[..., 3] > 0.05).float().mean()) < 0.85
            if transparent or aspect >= 2.5:
                indexes.append(index)
        except RuntimeError:
            continue
    return indexes


def _offline_prompt(user_request: str, mode: str, items, aspect: str, preserve_alpha: bool) -> tuple[str, str]:
    count = len(items)
    if mode == "create":
        references = ""
        if count:
            tags = "、".join(f"<image{index}>" for index in range(2, count + 2))
            likely_logos = _likely_logo_indexes(items)
            logo_note = ""
            if likely_logos:
                logo_tags = "、".join(f"<image{index + 1}>" for index in likely_logos)
                logo_note = f"检测到 {logo_tags} 很可能是透明 Logo 或品牌字标：准确保留其拼写、形状和颜色，并优先以其颜色建立品牌视觉。"
            references = (
                f"分析并使用 {tags} 作为有序参考素材：自动识别其中的品牌 Logo、产品内容、包装结构、配色和风格；"
                f"{logo_note}Logo 只作为品牌资产，其他案例只参考包装结构、材质、陈列或摄影方式；"
                "除非用户明确要求，不得复制参考案例里的公司名称、文字、商标、手机、酒类、礼品卡等可识别第三方商品，改为适合目标品牌的原创内容。"
            )
        positive = (
            f"在 <image1> 的 {aspect} 全新目标画布上完成一张统一、完整的最终设计。用户需求：{user_request}。"
            f"{references}只输出一个连贯场景或一套完整产品，不要把参考图并排摆放，不要做拼贴、情绪板、对比图或多套方案。"
            "画面应具有清晰主体、合理构图、统一材质与光线，并达到可交付的商业视觉质量。"
        )
    else:
        positive = (
            f"以 <image1> 为唯一构图主图完成编辑。用户需求：{user_request}。"
            "其余图片只作为用户要求涉及的品牌、内容或风格参考；保持未要求修改的主体、比例、视角和构图稳定。"
            "只输出一张连贯的最终图片，不要拼贴或并排展示参考图。"
        )
    if preserve_alpha:
        positive += "用户明确要求透明背景：主体边缘干净，背景完全透明并保留有效 alpha 通道。"
    else:
        positive += "用户没有要求透明背景：生成完整且完全不透明的背景，不要透明、半透明或镂空画布。"
    negative = "拼贴图，情绪板，联系表，多套独立方案并排，重复主体，无关品牌，错误商标，乱码，低清晰度"
    return positive, negative


def _prepare_images(images, mode: str, aspect: str):
    items = images.get("items", []) if isinstance(images, dict) else []
    if not isinstance(items, list):
        raise RuntimeError("图片集合格式无效，请重新添加图片")
    if mode == "edit":
        if not items:
            raise RuntimeError("图片编辑至少需要一张主图")
        if len(items) > MAX_QWEN_IMAGE21_REFERENCES:
            raise RuntimeError(f"Qwen Image 2.1 最多支持 {MAX_QWEN_IMAGE21_REFERENCES} 张图片")
        return {"items": list(items)}
    if len(items) >= MAX_QWEN_IMAGE21_REFERENCES:
        raise RuntimeError("从零创作会自动加入一张目标画布，因此最多上传 9 张参考图")
    width, height = ASPECT_DIMENSIONS[aspect]
    canvas = torch.full((1, height, width, 3), 0.5, dtype=torch.float32)
    return {"items": [{"kind": "tensor", "value": canvas, "slot": 0, "role": "canvas"}, *items]}


class HuezumiQwenImage21Agent:
    """Turn an ordinary brief and unordered references into a safe Qwen edit plan."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE_COLLECTION",),
                "user_request": ("STRING", {"default": "", "multiline": True, "dynamicPrompts": True}),
                "aspect_ratio": (["auto", *ASPECT_DIMENSIONS.keys()], {"default": "auto"}),
                "refresh_token": ("INT", {"default": 0, "min": 0, "max": 0x7FFFFFFF}),
            }
        }

    RETURN_TYPES = ("STRING", "STRING", "IMAGE_COLLECTION", "BOOLEAN", "QWEN_IMAGE21_PLAN")
    RETURN_NAMES = ("prompt", "negative_prompt", "prepared_images", "preserve_alpha", "plan")
    FUNCTION = "plan"
    CATEGORY = "huezumi/qwen image"
    DESCRIPTION = "接收自然语言和参考图；由后端统一配置的多模态 Agent 研究品牌、判断创作/编辑模式、分配图片角色并建立目标画布。工作流不保存 API Key。"

    @classmethod
    def IS_CHANGED(cls, images, user_request, aspect_ratio, refresh_token):
        digest = hashlib.sha256()
        digest.update(connection_revision().encode("utf-8"))
        digest.update(os.environ.get("HUEZUMI_LLM_CONNECTIONS_JSON", "").encode("utf-8"))
        digest.update(json.dumps({
            "request": user_request,
            "aspect": aspect_ratio,
            "refresh": refresh_token,
            "items": [
                {"kind": item.get("kind"), "value": item.get("value") if item.get("kind") == "file" else None}
                for item in (images.get("items", []) if isinstance(images, dict) else [])
                if isinstance(item, dict)
            ],
        }, ensure_ascii=False, sort_keys=True).encode("utf-8"))
        return digest.hexdigest()

    def plan(self, images, user_request, aspect_ratio, refresh_token):
        del refresh_token
        request = str(user_request or "").strip()
        if not request:
            raise RuntimeError("请用自然语言描述想要生成或修改的内容")
        items = images.get("items", []) if isinstance(images, dict) else []
        if not isinstance(items, list):
            raise RuntimeError("图片集合格式无效，请重新添加图片")
        mode = _detect_mode(request, len(items))
        aspect = _detect_aspect(request, aspect_ratio)
        preserve_alpha = _wants_transparency(request)
        prepared = _prepare_images(images, mode, aspect)
        selected = _agent_connection()
        status = "离线规则模式：后端未配置 image_agent，未执行联网检索"

        if selected is None:
            positive, negative = _offline_prompt(request, mode, items, aspect, preserve_alpha)
        else:
            connection_name, connection = selected
            if items and not bool(connection.get("supportsVision", False)):
                raise RuntimeError("后端 image_agent 未启用视觉输入，不能分析参考图片")
            model = str(connection.get("defaultModel") or "").strip()
            if not model:
                raise RuntimeError("后端 image_agent 未配置 defaultModel")
            timeout = _safe_number(connection.get("timeoutSeconds"), 120, 5, 600)
            parts = _image_parts(images, connection)
            note = _mapping_note(mode, len(parts), aspect)
            research_note = (
                "用户明确要求联网研究；如果已提供 web_search 工具，必须先搜索再规划。"
                if _needs_research(request)
                else "仅当确有必要时使用联网搜索。"
            )
            alpha_note = (
                "用户明确要求透明背景；在图像指令中保留 alpha。"
                if preserve_alpha
                else "用户没有要求透明背景；图像指令必须要求完全不透明的完整背景，禁止透明或半透明画布。"
            )
            user_content = [{"type": "text", "text": f"用户原始需求：\n{request}\n\n{note}\n{research_note}\n{alpha_note}"}]
            for index, image in enumerate(parts, 1):
                user_content.append({"type": "text", "text": f"上传图{index}"})
                user_content.append({"type": "image_url", "image_url": {"url": image["url"]}})
            positive, negative = _call_model(connection, model, [
                {"role": "system", "content": QWEN_AGENT_RULES},
                {"role": "user", "content": user_content},
            ], timeout)
            web = "已启用" if connection.get("webSearch") else "未启用"
            status = f"Agent：{connection_name} / {model}；联网能力：{web}"

        plan = {"mode": mode, "aspect": aspect, "preserve_alpha": preserve_alpha}
        return {
            "result": (positive, negative, prepared, preserve_alpha, plan),
            "ui": {
                "text": [status, f"模式：{'从零创作' if mode == 'create' else '编辑主图'} · 画幅：{aspect} · 透明背景：{'保留' if preserve_alpha else '关闭'}", f"正向指令：\n{positive}", f"反向指令：\n{negative}"],
                "positive_prompt": [positive],
                "negative_prompt": [negative],
                "mode": [mode],
                "aspect_ratio": [aspect],
                "preserve_alpha": [str(preserve_alpha).lower()],
            },
        }


class HuezumiQwenImage21Prepare:
    """Prepare the image collection independently so the creative agent is optional."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE_COLLECTION",),
                "manual_mode": (["auto", "create", "edit"], {"default": "auto"}),
                "aspect_ratio": (["auto", *ASPECT_DIMENSIONS.keys()], {"default": "auto"}),
                "preserve_alpha": ("BOOLEAN", {"default": False}),
            },
            "optional": {
                "agent_plan": ("QWEN_IMAGE21_PLAN",),
            },
        }

    RETURN_TYPES = ("IMAGE_COLLECTION", "BOOLEAN")
    RETURN_NAMES = ("prepared_images", "preserve_alpha")
    FUNCTION = "prepare"
    CATEGORY = "huezumi/qwen image"
    DESCRIPTION = "Agent 可选的图片准备节点。Agent 禁用时自动判断单图编辑/多图创作，也可手动指定模式、画幅和透明背景。"

    def prepare(self, images, manual_mode, aspect_ratio, preserve_alpha, agent_plan=None):
        items = images.get("items", []) if isinstance(images, dict) else []
        if not isinstance(items, list):
            raise RuntimeError("图片集合格式无效，请重新添加图片")

        plan = agent_plan if isinstance(agent_plan, dict) else None
        if plan:
            mode = str(plan.get("mode") or "create")
            aspect = str(plan.get("aspect") or "4:3")
            keep_alpha = bool(plan.get("preserve_alpha", False))
            source = "Agent"
        else:
            mode = manual_mode if manual_mode != "auto" else ("edit" if len(items) == 1 else "create")
            aspect = "4:3" if aspect_ratio == "auto" else aspect_ratio
            keep_alpha = bool(preserve_alpha)
            source = "手动回退"

        if mode not in {"create", "edit"}:
            raise RuntimeError("图片准备模式无效")
        if aspect not in ASPECT_DIMENSIONS:
            raise RuntimeError("图片画幅无效")
        prepared = _prepare_images(images, mode, aspect)
        return {
            "result": (prepared, keep_alpha),
            "ui": {"text": [f"{source} · {'从零创作' if mode == 'create' else '编辑主图'} · {aspect} · 透明背景：{'保留' if keep_alpha else '关闭'}"]},
        }


class HuezumiQwenImage21Finalize:
    """Keep alpha only when the user's brief explicitly requests it."""

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "images": ("IMAGE",),
            "preserve_alpha": ("BOOLEAN", {"forceInput": True}),
        }}

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    FUNCTION = "finalize"
    CATEGORY = "huezumi/qwen image"
    DESCRIPTION = "仅在用户明确要求透明背景时保留 alpha；其他情况移除透明通道并保存为不透明 RGB。"

    def finalize(self, images, preserve_alpha):
        if not isinstance(images, torch.Tensor) or images.ndim != 4 or images.shape[-1] not in (3, 4):
            raise RuntimeError("Qwen 输出必须是 RGB 或 RGBA 图片")
        if bool(preserve_alpha) or images.shape[-1] == 3:
            return (images,)
        return (images[..., :3].contiguous(),)


def _load_qwen_image(item):
    if item.get("kind") == "tensor":
        value = item.get("value")
        if not isinstance(value, torch.Tensor):
            raise RuntimeError("参考图连线必须是 IMAGE 张量")
        if value.ndim == 3:
            value = value.unsqueeze(0)
        if value.ndim != 4 or value.shape[-1] not in (3, 4):
            raise RuntimeError("参考图必须是 RGB 或 RGBA 图片")
        return value[:1].detach().cpu().float().clamp(0, 1)

    if item.get("kind") != "file":
        raise RuntimeError("参考图格式无效")
    data, _ = _read_file_item(str(item.get("value") or ""))
    with Image.open(BytesIO(data)) as image:
        image = ImageOps.exif_transpose(image)
        mode = "RGBA" if "A" in image.getbands() else "RGB"
        array = np.asarray(image.convert(mode), dtype=np.float32) / 255.0
    return torch.from_numpy(array).unsqueeze(0)


class HuezumiQwenImage21Encode:
    """Feed one compact IMAGE_COLLECTION into Qwen's native 2.1 encoder."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "clip": ("CLIP",),
                "vae": ("VAE",),
                "images": ("IMAGE_COLLECTION",),
                "prompt": ("STRING", {"default": "", "multiline": True, "dynamicPrompts": True}),
                "negative_prompt": ("STRING", {"default": "", "multiline": True, "dynamicPrompts": True}),
                "resolution": ("INT", {"default": 1024, "min": 0, "max": 4096, "step": 32}),
            }
        }

    RETURN_TYPES = ("CONDITIONING", "CONDITIONING", "LATENT")
    RETURN_NAMES = ("positive", "negative", "latent")
    FUNCTION = "encode"
    CATEGORY = "huezumi/qwen image"
    DESCRIPTION = "接收一个多图集合并调用 ComfyUI 原生 Qwen Image 2.1 编码器；最多 10 张。"

    def encode(self, clip, vae, images, prompt, negative_prompt, resolution):
        from comfy_extras.nodes_qwen import TextEncodeQwenImage21

        items = images.get("items", []) if isinstance(images, dict) else []
        if not items:
            raise RuntimeError("请在多图参考节点中至少添加一张主图")
        if len(items) > MAX_QWEN_IMAGE21_REFERENCES:
            raise RuntimeError(f"Qwen Image 2.1 最多支持 {MAX_QWEN_IMAGE21_REFERENCES} 张参考图")

        native_images = {
            f"image_{index}": _load_qwen_image(item)
            for index, item in enumerate(items, start=1)
        }
        output = TextEncodeQwenImage21.execute(
            clip=clip,
            vae=vae,
            images=native_images,
            prompt=prompt,
            negative_prompt=negative_prompt,
            resolution=resolution,
        )
        return output.result


NODE_CLASS_MAPPINGS = {
    "HuezumiQwenImage21Agent": HuezumiQwenImage21Agent,
    "HuezumiQwenImage21Prepare": HuezumiQwenImage21Prepare,
    "HuezumiQwenImage21Encode": HuezumiQwenImage21Encode,
    "HuezumiQwenImage21Finalize": HuezumiQwenImage21Finalize,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "HuezumiQwenImage21Agent": "Qwen Image 2.1 创作策划 Agent",
    "HuezumiQwenImage21Prepare": "Qwen Image 2.1 图片准备（Agent 可选）",
    "HuezumiQwenImage21Encode": "Qwen Image 2.1 多图编辑编码",
    "HuezumiQwenImage21Finalize": "Qwen Image 2.1 输出透明度控制",
}
