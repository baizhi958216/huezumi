# 图片创作节点与工作流

唯一创作模板：[图片创作 · 生图 / 原图编辑 / 局部重绘](../../../workflows/image-creation.json)。它替代原来的两个 Anima 大模型模板；已保存的旧工作流与 `ForkVdoPrompt` / `ForkVdoImageCollection` 节点仍兼容。

```text
图片集合 ─┬→ 大模型 ← 需求文本
          │     ├→ 正向提示词 ─┐
          │     └→ 反向提示词 ─┤
          └──────────────→ 创作设置 → 生成图片 → 保存
                                       ↑
                             模型加载（MODEL / CLIP / VAE）
```

## 使用

1. 更新节点包并重启 ComfyUI，在平台刷新服务/节点定义，从公开工作流载入“图片创作”。
2. **图片**：可不上传、上传一张或多张。一个集合提供八槽，更多图片可串联集合；连线优先于同槽文件。按实际非空素材顺序编号，图片尺寸可以不同；只接受静态图片。检查器支持单选替换指定槽、多选依次填空槽。
3. **需求**：写最终画面要求，明确图1、图2是人物、配色、风格还是构图参考。
4. **大模型**：在“③ 大模型连接”节点填写自己的 OpenAI Chat Completions 兼容地址、API Key、模型名和视觉能力，再将它连接到“④ 大模型”节点。连接配置会随工作流副本保存；含 Key 的工作流必须保持私有，导出 JSON 也会包含该 Key。`manual` 仍可直接使用需求文本，不联网、不分析参考图。大模型模式有图时需视觉模型。
5. **正负提示词**：`append` 保留大模型结果并追加文本；`replace` 完全替换。反向词可以为空，正向词不能为空。运行后可查看和复制最终文本。要完全跳过 LLM，应选择 `manual`，只替换下游文本不会取消上游调用。
6. **创作设置**：选择下表中的模式。所有模式一次生成一张图片，多图输入不是批量生图。
7. **生图模型**：选择已安装且包含匹配编码器/VAE 的 checkpoint。模板默认本机已有的 `anythingv5nijimix_25BEST.safetensors`；其他机器需自行选择已有模型，不会自动下载。512×512 是模板起始尺寸，换用 SDXL 时自行调整适合模型的尺寸与参数。
8. **生成**：调整种子、步数、CFG、采样器和调度器；`control_after_generate=fixed` 可保留种子，`randomize` 为下次运行换种子。运行后在输出区查看图片。

| mode     | 行为                                               | 需要填写                                             |
| -------- | -------------------------------------------------- | ---------------------------------------------------- |
| generate | 从空 latent 生图，参考图只帮助 LLM 编写提示词      | width / height；图片可留空                           |
| edit     | 原图编码后重采样，保留原图尺寸                     | source_index（从1开始）、edit_strength               |
| inpaint  | 原图 + latent 遮罩重采样，再将遮罩外的原始像素合回 | source_index、edit_strength、mask_image 或 MASK 连线 |

`edit_strength` 越低越接近原图，越高改动越大；0直接返回原图。生图模式忽略它。编辑模式忽略 width/height，原图边长支持8到4096像素。非模型倍数的尺寸会在右侧/底部补边，解码后裁回原尺寸，避免原图被中心裁切。

局部重绘上传与原图同尺寸的黑白遮罩，**白改、黑留、灰色渐变过渡**，不使用透明通道作为遮罩。全黑、尺寸不符或缺失遮罩会报错，不会静默变成整图编辑。MASK 连线优先于文件。黑色区域保持原图像素；白色区域的生成质量仍取决于模型、提示词和编辑强度。平台暂不提供画笔式遮罩编辑器。

## 模型边界

大模型只输出两个 STRING，不依赖 Anima。生成节点复用 ComfyUI 的 `CLIPTextEncode`、`VAEEncode`、`KSampler`、`VAEDecode`，默认 checkpoint 路径适合 SD1.5/SDXL 的标准文本条件链路。

需要 Anima 等分体模型时，在同一张工作流中将 checkpoint 节点替换为配套的 `UNETLoader`、文本编码器 loader 与 `VAELoader`，分别连到生成节点的 MODEL、CLIP、VAE，并修改提示词说明和采样参数。生成 latent 按 VAE 通道数、维数、压缩倍率创建，未固定为 SD 的四通道。

这不是任意模型的通用适配器：要求特殊参考图条件、专用 guidance、额外条件或专用 inpaint UNet 的模型，应将生成部分换成该模型原生链路。多张参考图目前只进入 LLM；编辑时只有指定原图进入扩散模型，不承诺多图融合或人物身份精确一致。云端图片生成 API 不在本次范围内。

## 大模型连接

模板提供 `ForkVdoLLMConfig` 节点，适合用户在工作流副本中配置自己的连接：

```text
大模型连接(base_url / api_key / auth / model_name / supports_vision)
  └── config → 大模型.llm_config
```

它使用 OpenAI Chat Completions 兼容协议，实际请求地址为 `<baseUrl>/chat/completions`。连接节点中的 API Key 会进入工作流 JSON；因此不要把该工作流设为公开，也不要把导出的 JSON 发送给不可信的人。

如果不希望把 Key 放入工作流，可继续使用下方的执行端环境连接。

执行端环境变量 `FORKVDO_LLM_CONNECTIONS_JSON`：

```json
{
  "cloud": {
    "baseUrl": "https://your-compatible-endpoint.example/v1",
    "apiKey": "replace-on-execution-host",
    "supportsVision": true,
    "defaultModel": "your-vision-model",
    "maxImages": 8,
    "maxImageBytes": 20971520,
    "maxTotalImageBytes": 62914560,
    "timeoutSeconds": 120
  },
  "local": {
    "baseUrl": "http://127.0.0.1:1234/v1",
    "auth": "none",
    "supportsVision": true,
    "defaultModel": "your-local-vision-model"
  }
}
```

连接 `auth=none` 明确允许免鉴权本地服务；其他连接必须有 apiKey。`supportsVision` 必须与实际模型能力一致。执行端连接仍只保存连接标识与模型名；工作流中的 `ForkVdoLLMConfig` 可以覆盖执行端连接并携带用户自己的密钥。`manual` 是保留连接标识。

协议为 OpenAI Chat Completions 兼容的 `<baseUrl>/v1/chat/completions`。优先请求 JSON schema；HTTP 400 时重试一次不带 response_format 的请求。始终要求非空 positive_prompt；negative_prompt 缺失/null视为空。超时、鉴权失败、非法 JSON 或字段无效会阻止下游生成。

本地托管模式在 `.env` 填 `NUXT_COMFYUI_LLM_CONNECTIONS_JSON`，Nuxt 启动 ComfyUI 时将它注入上述执行端变量。remote 模式直接在远端 ComfyUI 容器/主机设置。更改环境配置后重启执行进程。常规运行复用成功提示词，修改 `refresh_token` 再运行可强制更新；修改图片字节（包括同名文件替换）也会使缓存失效。

## 安装和验证

本地模式由项目将此目录软链接到 ComfyUI 的 `custom_nodes/forkvdo_prompt`。远端挂载或复制**整个目录**，然后重启 ComfyUI；该目录使用 ComfyUI 已有的 Python、Torch、NumPy、Pillow，不需新增包。安装后 `/object_info` 应出现7种 forkvdo节点。

```bash
PYTHONDONTWRITEBYTECODE=1 vendor/ComfyUI/.venv/bin/python comfyui/custom_nodes/forkvdo_prompt/test_workflow.py
pnpm check:full
```

Python 测试使用临时合成素材、模拟 LLM，不联网、不加载模型。真实 GPU/模型验收另外执行。主平台没有新增生成请求、数据库或计费规则。
