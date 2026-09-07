# Anima 本地工作流验收

- 状态：completed
- 范围：本机 ComfyUI + Apple Silicon MPS
- 存储边界：模型、LoRA 和生成结果均保存在本机 `vendor/ComfyUI`；本次没有上传到阿里云 OSS 或本地 MinIO。

## 选型

首版使用官方 Anima Turbo v1.1 和 ComfyUI 原生节点，避免依赖 Civitai 社区工作流中较多的自定义节点。社区 AIO 工作流作为参考保留，但不作为首次 Mac 验证入口。

工作流：[`workflows/anima-turbo-style-api.json`](../workflows/anima-turbo-style-api.json)

节点链路：

```text
UNETLoader → 高分辨率美化 LoRA → Greg Rutkowski 风格 LoRA
          → Qwen CLIP → 正/负面提示词 → KSampler → VAE Decode → SaveImage
```

默认参数：

- 尺寸：1024 × 1024
- 采样：Euler / simple
- Steps：12
- CFG：1
- 高分辨率美化 LoRA：`0.65`
- Greg Rutkowski 风格 LoRA：`0.45`
- Greg 触发词：`@greg rutkowski`

## 本地文件

| 类型             | 文件                                        | 本地目录                                 | SHA-256                                                             |
| ---------------- | ------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------- |
| Turbo checkpoint | `anima-turbo-v1.1.safetensors`              | `vendor/ComfyUI/models/diffusion_models` | `FBA11953276B57EDF59DD1DC4F1857AC05AA079C56F982B4D7C20298D57D3F7EB` |
| Text encoder     | `qwen_3_06b_base.safetensors`               | `vendor/ComfyUI/models/text_encoders`    | `CD2A512003E2F9F3CD3C32A9C3573F820BB28C940F73C57B1DDAA983D9223EBA`  |
| VAE              | `qwen_image_vae.safetensors`                | `vendor/ComfyUI/models/vae`              | `A70580F0213E67967EE9C95F05BB400E8FB08307E017A924BF3441223E023D1F`  |
| LoRA             | `anima-highres-aesthetic-boost.safetensors` | `vendor/ComfyUI/models/loras`            | `DB5B2DCC4E1AFA215058B7A85FB9377124C2E9AABD48C25E595AF7199207C299`  |
| LoRA             | `anima-greg-rutkowski-style.safetensors`    | `vendor/ComfyUI/models/loras`            | `3251AE0BF2771D7957B3AAD251827DC5DE716FD3C5911444D981045AF5C82E11`  |
| LoRA（备用）     | `anima-turbo-lora-v0.2.safetensors`         | `vendor/ComfyUI/models/loras`            | `1B55E40BDB1D0E5A78CB498F245FCCFDAAE97823265DB957D2AABDCF4CD3CAF1`  |

备用 Turbo LoRA 已下载，但没有叠加到已经 baked-in 的 Turbo v1.1 上，以免过度强化 Turbo 效果；它用于后续 Anima Base + Turbo LoRA 工作流。

## 验收结果

- ComfyUI `/object_info` 已识别 Turbo checkpoint、Qwen 编码器、VAE 和 3 个 LoRA。
- 调用 `/prompt` 返回 HTTP 200，`node_errors` 为空。
- `/history` 返回 `execution_success`。
- 实际输出：`vendor/ComfyUI/output/forkvdo-anima-turbo-style_00001_.png`。
- 输出尺寸：1024 × 1024 PNG。
- 本机 Mac MPS 首次完整执行耗时约 21.6 秒。

## 来源

- 官方 ComfyUI Anima 指南：<https://github.com/Comfy-Org/docs/blob/main/tutorials/image/anima/anima.mdx>
- 官方模型镜像：<https://www.modelscope.cn/models/circlestone-labs/Anima>
- Civitai Anima：<https://civitai.com/models/2458426/anima>
- Civitai Anima Highres/Aesthetic Boost：<https://civitai.com/models/2540444/anima-highresaesthetic-boost>
- Civitai Greg Rutkowski Style - Anima：<https://civitai.com/models/2536147/greg-rutkowski-style-anima>
- Civitai Anima Turbo LoRA：<https://civitai.com/models/2560840/anima-turbo-lora>
