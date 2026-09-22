"""Wan 3.0 API video nodes. Credentials stay in the ComfyUI process environment."""

import os
from pathlib import Path
import re
import time
from urllib.parse import urlparse
import uuid

import folder_paths
import requests

from .runtime_connections import runtime_connections


MODELS = ("wan3.0-video-prime", "wan3.0-video")
RESOLUTIONS = ("480P", "720P", "1080P")
RATIOS = ("adaptive", "16:9", "4:3", "1:1", "3:4", "9:16")
KINDS = {"image": ("reference_image", 20 * 1024 * 1024, {".jpg", ".jpeg", ".png", ".bmp", ".webp"}),
         "video": ("reference_video", 100 * 1024 * 1024, {".mp4", ".mov"}),
         "audio": ("reference_audio", 15 * 1024 * 1024, {".wav", ".mp3"})}


def _choices(kind):
    root = Path(folder_paths.get_input_directory())
    extensions = KINDS[kind][2]
    return [""] + sorted(str(path.relative_to(root)) for path in root.rglob("*")
                         if path.is_file() and path.suffix.lower() in extensions)


def _file_path(name, kind):
    if not isinstance(name, str) or not name.strip():
        return None
    root = Path(folder_paths.get_input_directory()).resolve()
    path = (root / name).resolve()
    if not path.is_relative_to(root) or not path.is_file():
        raise RuntimeError(f"参考{ {'image': '图', 'video': '视频', 'audio': '音频'}[kind] }文件不存在，请重新上传")
    _, limit, extensions = KINDS[kind]
    if path.suffix.lower() not in extensions or path.stat().st_size > limit:
        raise RuntimeError(f"参考素材格式或大小不符合百炼 {kind} 限制，请重新上传")
    return path


class _MediaSource:
    KIND = "image"
    RETURN_TYPES = ("HUEZUMI_BAILIAN_MEDIA",)
    RETURN_NAMES = ("media",)
    FUNCTION = "select"
    CATEGORY = "huezumi/bailian"

    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"file": (_choices(cls.KIND), {f"{cls.KIND}_upload": True,
                                                  "tooltip": "可选；留空不会发送素材"})}}

    def select(self, file):
        path = _file_path(file, self.KIND)
        return ({"kind": self.KIND, "path": str(path)} if path else None,)


class HuezumiBailianImage(_MediaSource):
    KIND = "image"
    DESCRIPTION = "可选参考图。上传后可在提示词中写图1。"


class HuezumiBailianVideo(_MediaSource):
    KIND = "video"
    DESCRIPTION = "可选参考视频。上传后可在提示词中写视频1。"


class HuezumiBailianAudio(_MediaSource):
    KIND = "audio"
    DESCRIPTION = "可选参考音频。上传后可在提示词中写音频1。"


def _config():
    runtime = runtime_connections()
    if runtime is not None:
        config = runtime.get("video") or {}
        if not config.get("apiKey") or not config.get("baseUrl"):
            raise RuntimeError("请在管理面板分配工作流视频连接")
        return config["apiKey"], config["baseUrl"].rstrip("/")
    key = (os.getenv("HUEZUMI_DASHSCOPE_API_KEY") or "").strip()
    workspace = (os.getenv("HUEZUMI_DASHSCOPE_WORKSPACE_ID") or "").strip()
    region = (os.getenv("HUEZUMI_DASHSCOPE_REGION") or "cn-beijing").strip()
    if not key or not re.fullmatch(r"[A-Za-z0-9_-]+", workspace) or not re.fullmatch(r"[a-z0-9-]+", region):
        raise RuntimeError("百炼连接未配置：请在 ComfyUI 执行端设置私有 API Key、业务空间 ID 和地域")
    return key, f"https://{workspace}.{region}.maas.aliyuncs.com/api/v1"


def _request_json(method, url, key, *, payload=None, timeout=30, headers=None):
    try:
        response = requests.request(method, url, json=payload, timeout=timeout,
                                    headers={"Authorization": f"Bearer {key}", **(headers or {})})
        response.raise_for_status()
        value = response.json()
    except requests.Timeout as error:
        raise RuntimeError("百炼连接超时，请检查网络并稍后重试") from error
    except requests.RequestException as error:
        status = getattr(error.response, "status_code", None)
        label = {400: "参数或素材不被支持，请检查所选模型的限制",
                 401: "API Key 鉴权失败", 403: "访问被拒绝，请检查地域和业务空间",
                 404: "接口不存在，请检查业务空间和地域",
                 429: "请求受限，请稍后重试"}.get(status, "服务暂不可用，请检查连接和参数")
        raise RuntimeError(f"百炼{label}") from error
    except (ValueError, TypeError) as error:
        raise RuntimeError("百炼返回了无效响应，请稍后重试") from error
    if not isinstance(value, dict) or value.get("code"):
        raise RuntimeError("百炼拒绝请求，请检查模型、素材和参数是否匹配")
    return value


def _upload_file(path, model, key):
    try:
        policy_response = requests.get("https://dashscope.aliyuncs.com/api/v1/uploads",
                                       params={"action": "getPolicy", "model": model},
                                       headers={"Authorization": f"Bearer {key}"}, timeout=30)
        policy_response.raise_for_status()
        policy = policy_response.json()["data"]
        host = policy["upload_host"]
        parsed = urlparse(host)
        if parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith(".aliyuncs.com"):
            raise RuntimeError("百炼上传地址无效")
        object_key = f"{policy['upload_dir'].rstrip('/')}/{uuid.uuid4().hex}-{path.name}"
        fields = {"OSSAccessKeyId": policy["oss_access_key_id"], "Signature": policy["signature"],
                  "policy": policy["policy"], "x-oss-object-acl": policy["x_oss_object_acl"],
                  "x-oss-forbid-overwrite": policy["x_oss_forbid_overwrite"], "key": object_key,
                  "success_action_status": "200"}
        with path.open("rb") as source:
            files = {name: (None, value) for name, value in fields.items()}
            files["file"] = (path.name, source)
            upload_response = requests.post(host, files=files, timeout=120)
        upload_response.raise_for_status()
        return f"oss://{object_key}"
    except (requests.RequestException, KeyError, ValueError, TypeError) as error:
        raise RuntimeError("参考素材上传百炼失败，请检查网络、素材大小和地域") from error


def _save_video(url):
    parsed = urlparse(url)
    if parsed.scheme != "https" or not parsed.hostname or not parsed.hostname.endswith((".aliyuncs.com", ".aliyun.com")):
        raise RuntimeError("百炼返回的视频地址无效")
    output = Path(folder_paths.get_output_directory())
    output.mkdir(parents=True, exist_ok=True)
    name = f"Bailian_Wan3_{uuid.uuid4().hex}.mp4"
    target = output / name
    completed = False
    try:
        with requests.get(url, stream=True, timeout=(20, 120)) as response:
            response.raise_for_status()
            with target.open("wb") as destination:
                total = 0
                for chunk in response.iter_content(1024 * 1024):
                    total += len(chunk)
                    if total > 1024 * 1024 * 1024:
                        raise RuntimeError("百炼视频超过输出大小限制")
                    destination.write(chunk)
        if not target.stat().st_size:
            raise RuntimeError("百炼返回了空视频")
        completed = True
        return name
    except (requests.RequestException, OSError) as error:
        raise RuntimeError("百炼视频下载失败；任务可能已成功，请勿立即重复提交") from error
    finally:
        if not completed and target.exists():
            target.unlink()


class HuezumiBailianWan3Video:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "positive_prompt": ("STRING", {"default": "一位人物在夜色中的街道缓步前行，镜头平稳跟随，电影质感，自然环境音。", "multiline": True}),
            "negative_prompt": ("STRING", {"default": "模糊、低画质、肢体畸形", "multiline": True}),
            "model": (list(MODELS), {"default": MODELS[0]}),
            "seed": ("INT", {"default": -1, "min": -1, "max": 2147483647, "control_after_generate": True}),
            "resolution": (list(RESOLUTIONS), {"default": "720P"}),
            "ratio": (list(RATIOS), {"default": "16:9"}),
            "duration": ("INT", {"default": 5, "min": -1, "max": 30, "tooltip": "-1 为智能时长；其余为 2–30 秒"}),
            "output_audio": ("BOOLEAN", {"default": True}),
            "prompt_extend": ("BOOLEAN", {"default": True}),
            "watermark": ("BOOLEAN", {"default": False}),
            "timeout_minutes": ("INT", {"default": 20, "min": 2, "max": 60}),
        }, "optional": {
            "reference_image": ("HUEZUMI_BAILIAN_MEDIA",),
            "reference_video": ("HUEZUMI_BAILIAN_MEDIA",),
            "reference_audio": ("HUEZUMI_BAILIAN_MEDIA",),
        }}

    RETURN_TYPES = ("HUEZUMI_BAILIAN_VIDEO",)
    RETURN_NAMES = ("video",)
    FUNCTION = "generate"
    OUTPUT_NODE = True
    CATEGORY = "huezumi/bailian"
    DESCRIPTION = "通过私有执行端连接调用百炼 Wan 3.0 All-in-One。参考素材可选；空节点不参与请求。"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")  # Explicit reruns create fresh paid tasks, even with the same seed.

    def generate(self, positive_prompt, negative_prompt, model, seed, resolution, ratio, duration,
                 output_audio, prompt_extend, watermark, timeout_minutes,
                 reference_image=None, reference_video=None, reference_audio=None):
        if model not in MODELS or resolution not in RESOLUTIONS or ratio not in RATIOS:
            raise RuntimeError("百炼模型、清晰度或画面比例无效")
        if not isinstance(positive_prompt, str) or not positive_prompt.strip() or len(positive_prompt) > 20000:
            raise RuntimeError("正向提示词需要 1–20000 个字符")
        if not isinstance(negative_prompt, str) or len(negative_prompt) > 500:
            raise RuntimeError("反向提示词不能超过 500 个字符")
        if duration != -1 and not 2 <= duration <= 30:
            raise RuntimeError("片段时长应为 -1 或 2–30 秒")
        if not isinstance(seed, int) or not -1 <= seed <= 2147483647:
            raise RuntimeError("随机种子应为 -1 或 0–2147483647")
        if not isinstance(timeout_minutes, int) or not 2 <= timeout_minutes <= 60:
            raise RuntimeError("等待时长应为 2–60 分钟")
        prompt = positive_prompt.strip()
        if negative_prompt.strip():
            prompt += f"\n画面与声音中避免出现：{negative_prompt.strip()}。"
        if len(prompt) > 20000:
            raise RuntimeError("合并反向约束后的提示词超过百炼 20000 字符限制")
        key, base = _config()
        media = []
        for expected, item in (("image", reference_image), ("video", reference_video), ("audio", reference_audio)):
            if item is None:
                continue
            if not isinstance(item, dict) or item.get("kind") != expected:
                raise RuntimeError("参考素材连线类型错误，请检查图、视频和音频节点")
            path = _file_path(item.get("path"), expected)
            if path is None:
                raise RuntimeError("参考素材文件未选择，请重新上传或断开节点")
            media.append({"type": KINDS[expected][0], "url": _upload_file(path, model, key)})
        payload = {"model": model, "input": {"prompt": prompt},
                   "parameters": {"resolution": resolution, "ratio": ratio, "duration": duration,
                                  "audio": bool(output_audio), "prompt_extend": bool(prompt_extend),
                                  "watermark": bool(watermark), "seed": int(seed)}}
        if media:
            payload["input"]["media"] = media
        submitted = _request_json("POST", f"{base}/services/aigc/video-generation/video-synthesis", key,
                                  payload=payload, timeout=60,
                                  headers={"X-DashScope-Async": "enable", "X-DashScope-OssResourceResolve": "enable"})
        task_id = submitted.get("output", {}).get("task_id")
        if not isinstance(task_id, str) or not re.fullmatch(r"[A-Za-z0-9_-]+", task_id):
            raise RuntimeError("百炼未返回有效任务 ID；请勿立即重复提交")
        deadline = time.monotonic() + timeout_minutes * 60
        while time.monotonic() < deadline:
            time.sleep(15)
            result = _request_json("GET", f"{base}/tasks/{task_id}", key, timeout=30)
            output = result.get("output", {})
            status = output.get("task_status")
            if status == "SUCCEEDED":
                video_url = output.get("video_url")
                if not isinstance(video_url, str):
                    raise RuntimeError("百炼任务成功但没有视频地址；请勿立即重复提交")
                filename = _save_video(video_url)
                return {"result": (filename,),
                        "ui": {"videos": [{"filename": filename, "subfolder": "", "type": "output"}]}}
            if status in ("FAILED", "CANCELED", "UNKNOWN"):
                raise RuntimeError("百炼任务未完成，请检查素材和参数；请勿立即重复提交")
            if status not in ("PENDING", "RUNNING"):
                raise RuntimeError("百炼返回未知任务状态；请勿立即重复提交")
        raise RuntimeError("等待百炼任务超时，任务可能仍在运行；请勿立即重复提交")


class HuezumiBailianVideoOutput:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"video": ("HUEZUMI_BAILIAN_VIDEO", {"forceInput": True})}}

    RETURN_TYPES = ()
    FUNCTION = "preview"
    OUTPUT_NODE = True
    CATEGORY = "huezumi/bailian"
    DESCRIPTION = "读取百炼生成的视频文件，在 ComfyUI 历史和画布右侧登记预览。"

    def preview(self, video):
        if not isinstance(video, str) or not re.fullmatch(r"Bailian_Wan3_[0-9a-f]{32}\.mp4", video):
            raise RuntimeError("百炼视频文件名无效，请重新运行生成节点")
        path = Path(folder_paths.get_output_directory()).resolve() / video
        if not path.is_file() or not path.stat().st_size:
            raise RuntimeError("百炼视频文件不存在，请检查 ComfyUI 输出目录")
        return {"ui": {"videos": [{"filename": video, "subfolder": "", "type": "output"}]}}


NODE_CLASS_MAPPINGS = {
    "HuezumiBailianImage": HuezumiBailianImage,
    "HuezumiBailianVideo": HuezumiBailianVideo,
    "HuezumiBailianAudio": HuezumiBailianAudio,
    "HuezumiBailianWan3Video": HuezumiBailianWan3Video,
    "HuezumiBailianVideoOutput": HuezumiBailianVideoOutput,
}
NODE_DISPLAY_NAME_MAPPINGS = {
    "HuezumiBailianImage": "百炼 · 参考图",
    "HuezumiBailianVideo": "百炼 · 参考视频",
    "HuezumiBailianAudio": "百炼 · 参考音频",
    "HuezumiBailianWan3Video": "百炼 · Wan 3.0 视频生成",
    "HuezumiBailianVideoOutput": "百炼 · 视频输出 / 预览",
}
