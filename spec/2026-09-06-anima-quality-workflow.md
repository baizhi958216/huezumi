# Anima Aesthetic 质量版工作流

- 状态：completed
- 创建日期：2026-09-06
- 范围：本机 ComfyUI + Apple Silicon MPS
- 存储边界：模型和生成结果保存在本机 `vendor/ComfyUI`，不上传 OSS。

## 目标

在保留 Anima Turbo 快速预览工作流的同时，提供一个以画质为优先的 Anima 工作流，避免 Turbo 蒸馏参数和多个风格 LoRA 叠加造成的质量上限或风格冲突。

## 工作流

工作流：[`workflows/anima-aesthetic-quality.json`](../workflows/anima-aesthetic-quality.json)

节点链路：

```text
Anima Aesthetic → Qwen CLIP → 正/负面提示词 → KSampler → VAE Decode → SaveImage
```

默认参数：

- 模型：`anima-aesthetic-v1.1.safetensors`
- 尺寸：1024 × 1280
- 采样：Euler / simple
- Steps：36
- CFG：4.5
- LoRA：默认不叠加

## 本地资产

| 类型                 | 文件                               | 本地目录                                 | SHA-256                                                            |
| -------------------- | ---------------------------------- | ---------------------------------------- | ------------------------------------------------------------------ |
| Aesthetic checkpoint | `anima-aesthetic-v1.1.safetensors` | `vendor/ComfyUI/models/diffusion_models` | `3C1868387A3A1FF504BBB87C33678321965EAD381FCF87AFBD0264DAA600C082` |

## 验收结果

- ComfyUI 已识别 Aesthetic checkpoint、Qwen 文本编码器和 Qwen VAE。
- Mac MPS 执行成功，36 steps 约耗时 156 秒。
- 输出：`vendor/ComfyUI/output/forkvdo-anima-aesthetic-quality_00001_.png`。
- 输出尺寸：1024 × 1280 PNG。
- 质量版已在应用中保存为新的私有工作流，旧的公开 Turbo 工作流保持不变。

## 来源

- 官方模型说明：<https://huggingface.co/circlestone-labs/Anima/blob/main/README.md>
- 官方 Aesthetic 权重：<https://huggingface.co/circlestone-labs/Anima/blob/main/split_files/diffusion_models/anima-aesthetic-v1.1.safetensors>
