# MiniMax H3 本地验证（2026-09-12）

> 历史资料：迁入归档于 2026-09-22。以下硬件、版本、下载和采样结果来自旧记录，本轮未复验。所述 vendor 证据及脚本不随仓库分发；不能作为当前环境可用性保证。

本次按用户要求下载公开权重并实测本地节点，以真实采样进度出现后中断为验收边界，不验收最终视频或音频质量。原记录关联 `spec/2026-09-12-minimax-h3-local-node-verification.md`，该历史规格未随当前检出提供。

## 环境与范围

- Apple M5 Pro，48 GB 统一内存；macOS 26.6.2，PyTorch 2.14.0，Python 3.14.7。
- ComfyUI 0.35.0，提交 `7193f5627f036701e5efc23beaea20fa37ceaadd`；本机地址 `127.0.0.1:8188`。
- 安装 city96/ComfyUI-GGUF，提交 `6ea2651e7df66d7585f6ffee804b20e92fb38b8a`，以及 `gguf 0.19.0`、`protobuf 7.36.1`；未改动 ComfyUI 核心源文件。
- 初始运行期模型列表为空。历史 Anima 实测记录不代表本次机器仍保存那些权重。
- Hugging Face 名称检索返回 670 个仓库；详细核对 13 个主要来源。搜索结果包含镜像、LoRA 和工作流，不能当成 670 个独立生成模型。

## 公开模型分支

| 分支                 | 用途与本次范围                                                    | 来源                                                                                                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FL2VA                | 文生、首帧、尾帧、首尾帧；原始/裁剪 BF16、INT8 ConvRot、裁剪 FP8  | [Comfy-Org](https://huggingface.co/Comfy-Org/MiniMax-H3)                                                                                                                                                                     |
| Ref2VA               | 图像、视频及音频参考；精度分支与 FL2VA 对应                       | [Comfy-Org](https://huggingface.co/Comfy-Org/MiniMax-H3)                                                                                                                                                                     |
| ComfyUI GGUF         | 本轮选择裁剪 Q3_K_M 的 FL2VA 与 Ref2VA；同源还提供 Q4、Q5、Q6、Q8 | [Abiray](https://huggingface.co/Abiray/MiniMax-H3-Pruned-GGUF)                                                                                                                                                               |
| 其他 GGUF            | Vantage 的 ComfyUI 版本；Unsloth 的 sd.cpp 版本需要不同加载支持   | [Vantage](https://huggingface.co/vantagewithai/MiniMax-H3-comfyUI-GGUF)、[Unsloth](https://huggingface.co/unsloth/MiniMax-H3-GGUF)                                                                                           |
| Turbo / Acc LoRA     | FL2VA 4/8 步、Ref2VA 4 步及社区压缩/加速版本                      | [Comfy-Org](https://huggingface.co/Comfy-Org/MiniMax-H3)、[Kijai](https://huggingface.co/Kijai/MiniMax-H3_comfy)、[Acc](https://huggingface.co/alibaba-pai/MiniMax-H3-Acc-LoRAs)                                             |
| W4A8 / FastVideo     | 实验量化及加速权重，单独列入目录，不推断其已在本机通过            | [Kijai experimental](https://huggingface.co/Kijai/MiniMax-H3-experimental)                                                                                                                                                   |
| Fun ControlNet Union | 控制视频与遮罩重绘；使用 ComfyUI 重打包的裁剪 BF16 patch          | [Alibaba PAI](https://huggingface.co/alibaba-pai/MiniMax-H3-Fun-Controlnet-Union)                                                                                                                                            |
| 融合与混合模型       | Turbo 融合、FL2VA/Ref2VA 混合、社区微调；未逐个下载风格变体       | [MATLOWAI](https://huggingface.co/MATLOWAI/minimax-h3-fused-turbo-int8-convrot)、[smhfacct](https://huggingface.co/smhfacct/Minimax-H3-fl2va-ref2va-hybrid-models)、[OpenVDN](https://huggingface.co/OpenVDN/vdn-minimax-h3) |

共享依赖为 H3 专用 Qwen3-VL-32B 编码器、视频 VAE 与音频 VAE。通用 Qwen 文件不能仅凭名称替换 H3 编码器；需要核对层裁剪、视觉投影、词表与加载器支持。

## 本机全部 H3 本地节点

运行期 `/object_info` 返回 6 个 H3 非 API 节点：

| 节点                          | 验证路径                              |
| ----------------------------- | ------------------------------------- |
| `MiniMaxH3ImageToVideo`       | 纯文本、首帧、尾帧、首尾帧            |
| `MiniMaxH3ReferenceToVideo`   | 单图、三图、图/视频/配套音频/独立音频 |
| `EmptyMiniMaxH3LatentAV`      | Guide 路径的独立音视频 latent         |
| `MiniMaxH3AddGuide`           | 图像、音频、视频加音频引导            |
| `MiniMaxH3SigmaShift`         | Guide 路径的视频/音频 sigma 设置      |
| `MiniMaxH3FunControlNetApply` | 控制视频、遮罩与源视频                |

Comfy Cloud H3、供应商 API、Context-IR 与 Regenerate-2K 服务没有作为本地节点执行。

## 验收判定

测试使用 256×160、5 帧（Guide 为 22 帧）的诊断输入及本地合成素材。尺寸和长度用于快速触发真实计算，不能用于评价正常 5 秒、960×544 输出质量。使用 4 步采样配置，在 `SamplerCustomAdvanced` 的第一条匹配采样总步数的进度事件后，按该测试的 `prompt_id` 发送中断，并等待队列退出；不把节点进入、权重加载进度或 HTTP 200 视为通过。

## 实测结果

11 个权重文件已全部下载并通过 SHA-256 校验，总计 91.337 GB。GGUF 的 15 条生成路径均完成第 1 步采样后中断，覆盖全部 6 个 H3 本地节点。共享组件另完成以下真实验证：

- 音频 VAE：`81d731c7-e6a8-445d-9c7e-fafa407654e7`，MPS 编码本地 2 秒立体声音频成功，约 2.69 秒。
- H3 NVFP4 文本编码器：`13bde0b5-a77b-48a5-9fff-060b75ceea57`，使用 CPU 逐层解量化路径完成文本编码，约 28.36 秒。
- 编码器及两个 VAE 的完整 SHA-256 均与 Hugging Face LFS 元数据一致。

GGUF FL2VA 纯文生路径已收到第 1/4 步真实采样事件，随后按 prompt ID 中断：`479f0e67-50fb-4ac1-aeec-59b4694f52e4`，总耗时约 42.35 秒，第一步采样约 10.43 秒。该结果只覆盖诊断尺寸，不代表最终视频质量或默认分辨率已验收。

已确认的格式限制：Unsloth 此组 GGUF 文件头没有 `general.architecture` 元数据，当前 city96 加载器不识别其 H3 sd.cpp 架构，文本加载器也明确拒绝无架构元数据的文件。下载已中止，未将其作为完成模型发布到候选目录。Abiray 文件头含 `wan` 架构标识及 `comfy.gguf.orig_shape.*`，符合当前 GGUF 加载器格式入口；是否真实可采样仍以执行结果为准。

PyTorch 2.14.0 的小张量探针确认 BF16、FP16、FP8 E4M3/E5M2 和 INT8 均可传入 MPS；这仅证明存储 dtype 传输，不证明对应量化矩阵运算或完整 H3 模型可用。

## 已下载文件

文件位于本机 `vendor/ComfyUI/models/`，全部与来源的 LFS SHA-256 一致。完整校验值保存在本机 `vendor/h3-validation-2026-09-12/integrity.json`，不随 Git 分发。

| 模型目录内的文件                                                        | 大小（GB） |
| ----------------------------------------------------------------------- | ---------- |
| `diffusion_models/MiniMax-H3-FL2VA-Pruned-Q3_K_M.gguf`                  | 8.903      |
| `diffusion_models/MiniMax-H3-Ref2VA-Pruned-Q3_K_M.gguf`                 | 8.903      |
| `diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors`     | 20.970     |
| `diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors`    | 20.970     |
| `loras/minimax_h3_fl2v_turbo_4step_v1.0_768p_comfyui_bf16.safetensors`  | 1.956      |
| `loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors`       | 1.956      |
| `loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors`      | 1.956      |
| `model_patches/minimax_h3_fun_controlnet_union_pruned_bf16.safetensors` | 4.222      |
| `text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors`            | 15.687     |
| `vae/minimax_h3_audio_vae_fp32.safetensors`                             | 0.605      |
| `vae/minimax_h3_video_vae_fp16.safetensors`                             | 5.208      |

## GGUF 逐项结果

所有下列测试都使用 CPU 上的 H3 NVFP4 编码器与 MPS 上的 GGUF 去噪模型。总耗时包含编码、加载和第一步采样，不是完整视频生成耗时。

| 路径                                  | 结果          | 总耗时（秒） | Prompt ID                              |
| ------------------------------------- | ------------- | ------------ | -------------------------------------- |
| 纯文生                                | 第 1 步后中断 | 42.35        | `479f0e67-50fb-4ac1-aeec-59b4694f52e4` |
| 首帧                                  | 第 1 步后中断 | 44.38        | `bb9c0afb-177a-4437-8dd5-7c3f9ecabc5b` |
| 尾帧                                  | 第 1 步后中断 | 45.57        | `22de91b5-b42a-43a2-a1e5-0a9e01889de7` |
| 首尾帧                                | 第 1 步后中断 | 45.49        | `fc00fe75-e899-4e45-9183-bd711781b7e8` |
| FL2VA Turbo 4 步                      | 第 1 步后中断 | 21.56        | `18ce16b3-c520-4f82-bc09-e104c93b87d1` |
| FL2VA Turbo 8 步                      | 第 1 步后中断 | 18.41        | `c9a1662b-9e2f-46a8-bcc3-d24ae09cd8df` |
| 单图参考                              | 第 1 步后中断 | 40.61        | `f6962014-9b4a-4cd4-9b40-8b551737232e` |
| 三图参考                              | 第 1 步后中断 | 38.78        | `d352027e-ccf8-472a-b72c-8e4e45bf8c03` |
| 图/视频/配套音频/独立音频             | 第 1 步后中断 | 32.26        | `7fc7f7e7-0e5c-4c8d-8107-57ebcce88a7c` |
| Ref2VA Turbo 4 步                     | 第 1 步后中断 | 39.02        | `788c3539-6c83-4458-b72c-f64f7cdd6074` |
| Guide 图像 + 独立 latent + SigmaShift | 第 1 步后中断 | 39.27        | `914789e1-c3c9-4865-b639-717de109c1d1` |
| Guide 音频                            | 第 1 步后中断 | 12.59        | `b23ce6ab-9619-4211-a48d-b6895c5d49ac` |
| Guide 视频和音频                      | 第 1 步后中断 | 14.19        | `f81fc15b-9c45-485b-b02b-d549bf74efb7` |
| ControlNet 控制视频                   | 第 1 步后中断 | 50.44        | `0f0b01a6-7198-4567-9fad-6b0717e2b36c` |
| ControlNet 遮罩和源视频               | 第 1 步后中断 | 11.84        | `e31a7d16-72c0-44d2-8017-4db0b1d7352c` |

## 原生 INT8 限制

原生 `UNETLoader` 加载 INT8 ConvRot 权重成功，但默认 MPS 在第一次采样计算中报 `NotImplementedError: aten::_int_mm`。失败 prompt：`59efa8e5-3f9f-453a-9cf4-3dd64e74c82b`。因此不能把加载成功视为原生 INT8 在 MPS 上可运行。无回退的 Turbo 重试随后被主动中断，未记作通过。

本次后续重试在 ComfyUI **服务进程启动前**设置 `PYTORCH_ENABLE_MPS_FALLBACK=1`；只在测试客户端设置此变量不会改变已经运行的 ComfyUI。该回退使用本机 CPU 执行缺失算子，不能称为纯 MPS 推理。后续回退结果记录在下一段。

启用回退后，官方 INT8 ConvRot 的两个主模型都到达第 1 步采样并被定向中断：FL2VA 纯文生 prompt `9a71a1ea-9db1-4006-bca0-930a7be3402b` 用时 173.25 秒；Ref2VA 图/视频/配套音频/独立音频 prompt `b23cc006-6946-4eff-a642-74aceb117fc9` 用时 645.40 秒。后者的第 1 步约 585 秒。两条记录说明 CPU 回退可用，但不适合作为此机器的交互式预览路径。

## 本机复跑

公开来源目录、哈希清单、API prompt 和 WebSocket 执行记录保存在 `vendor/h3-validation-2026-09-12/`。该目录与模型一样受 `/vendor/` 忽略规则保护，不提交权重、测试素材或运行日志。

ComfyUI 在本机 8188 端口运行且队列为空时，从项目根目录执行：

```bash
vendor/ComfyUI/.venv/bin/python vendor/h3-validation-2026-09-12/smoke.py text-to-video
```

脚本默认使用已下载的 GGUF、CPU 文本编码器和本地合成素材；收到采样器第 1 步进度后按 prompt ID 中断。无参数时依次运行 15 条 GGUF 路径。通过 `H3_MODEL_FORMAT=native` 改用官方 INT8 主模型，需先满足上述服务端 CPU 回退条件。每次结果写入独立时间目录，保留首次验证证据。

本次仅验证小尺寸启动，不验证 960×544、124 帧默认预设的内存占用、人物一致性、成片画质或最终音视频解码。三图参考使用合成图片验证输入路径，不能当作人物身份一致性质量验收。

## 预设与素材读取补查

通过项目的 `serializeGraphToApiPrompt` 和真实 `/object_info` 检查五个内置预设：文生预设无问题；其余预设在空素材状态只报告缺少文件，填入本地测试 PNG、MP4、WAV 后均无序列化问题。未覆盖用户保存的工作流。

另外直接调用 ComfyUI 的 `LoadVideo` 与 `GetVideoComponents`，成功拆出测试 MP4 的 48 帧 64×64 图像、24 fps 和 32 kHz 双声道音轨。该 MP4 是程序构造的输入夹具，不是模型生成结果。H3 诊断图的目标长度为 5 帧，其节点会把参考视频截到目标长度；本次验证的是各素材输入确实进入条件计算，不是完整参考视频保持或最终内容质量。
