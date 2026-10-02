"""Small, optional ComfyUI nodes. The platform discovers them through object_info."""
import json
import urllib.error
import urllib.request


class HuezumiTextOutput:
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {"text": ("STRING", {"multiline": True})}}

    RETURN_TYPES = ()
    FUNCTION = "save"
    OUTPUT_NODE = True
    CATEGORY = "Huezumi/output"

    def save(self, text):
        return {"ui": {"text": [text]}}


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        raise urllib.error.URLError("模型服务不允许重定向")


class HuezumiOpenAIChat:
    """OpenAI-compatible local/online model. Admin pins endpoint and injects secrets."""
    @classmethod
    def INPUT_TYPES(cls):
        return {"required": {
            "base_url": ("STRING", {"default": "http://127.0.0.1:11434/v1"}),
            "api_key": ("STRING", {"default": ""}),
            "model": ("STRING", {"default": ""}),
            "system": ("STRING", {"default": "你是一位创作助手。", "multiline": True}),
            "prompt": ("STRING", {"default": "", "multiline": True}),
            "temperature": ("FLOAT", {"default": 0.7, "min": 0, "max": 2, "step": 0.1}),
            "max_tokens": ("INT", {"default": 2048, "min": 1, "max": 32768}),
        }}

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("text",)
    FUNCTION = "generate"
    CATEGORY = "Huezumi/text"

    def generate(self, base_url, api_key, model, system, prompt, temperature, max_tokens):
        if not base_url.startswith(("http://", "https://")):
            raise ValueError("模型服务地址必须为 HTTP 或 HTTPS")
        data = json.dumps({"model": model, "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ], "temperature": temperature, "max_tokens": max_tokens, "stream": False}).encode()
        headers = {"Content-Type": "application/json"}
        if api_key:
            headers["Authorization"] = "Bearer " + api_key
        request = urllib.request.Request(base_url.rstrip("/") + "/chat/completions", data=data, headers=headers)
        try:
            # Never retry a possibly billed request and never print its body or credentials.
            with urllib.request.build_opener(NoRedirect()).open(request, timeout=240) as response:
                payload = response.read(4 * 1024 * 1024 + 1)
                if len(payload) > 4 * 1024 * 1024:
                    raise ValueError("模型响应过大")
                result = json.loads(payload)
            text = result["choices"][0]["message"]["content"]
            if not isinstance(text, str):
                raise ValueError("模型响应不包含文本")
            return (text,)
        except (urllib.error.URLError, KeyError, IndexError, json.JSONDecodeError):
            raise RuntimeError("模型调用失败；请核对服务状态和供应商账单后处理") from None


NODE_CLASS_MAPPINGS = {"HuezumiTextOutput": HuezumiTextOutput, "HuezumiOpenAIChat": HuezumiOpenAIChat}
NODE_DISPLAY_NAME_MAPPINGS = {"HuezumiTextOutput": "文本输出", "HuezumiOpenAIChat": "兼容模型文本生成"}
