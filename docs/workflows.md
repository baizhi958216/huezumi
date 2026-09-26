# 管理员工作流与 ComfyUI

## 执行端与权限

`/studio/workflow` 和 ComfyUI API 仅开放给管理员。公开工作流表示管理员工作流库内可共享，不表示匿名或普通用户可执行。画布依据运行期 `/object_info` 生成控件和序列化输入；节点缺失需更新执行端或安装对应节点，不能只改画布显示。

本地安装、探活和启动见 [开发指南](development.md)。生产使用私有网络 remote ComfyUI，当前镜像基线 v0.37.0；模型文件自行放置，不随项目下载。修改自定义节点包需重启一次，之后后台连接变化按新任务生效。

内置库从工作目录 `workflows/` 读取 JSON，排除 `*-api.json`；当前有 13 个可发现预设和 1 个 API prompt 示例。Dockerfile 将该目录复制到 runner 的 `/app/workflows`，使容器与宿主机使用同一组预设。

## 连接、费用与输出

在 `/admin/services` 分配工作流 Agent（文本）、图片和工作流视频（百炼）连接。平台按提交时版本创建私有快照，经执行端敏感数据槽传入，禁止写到节点输入或公开历史。旧手动连接节点仅作兼容，含 Key 的副本保持私有，导出也包含 Key；详见 [节点包说明](../comfyui/custom_nodes/huezumi_prompt/README.md)。

工作流执行的平台代理额度为 exempt，云 API 节点仍按供应商规则收费。提交前登记 prompt ID，结果不明确不自动重发；后续由 worker 同步状态并把图片/视频输出登记到 works、归档私有存储。作品列表不请求引擎历史，已归档媒体不依赖 ComfyUI 在线；未归档文件必须在源文件仍保留时重试。

工作流中的文本输出可查看和复制，但作品归档扫描的是支持的图片/视频输出，不能推断所有节点输出都会成为作品。

## 预设目录

| 预设                                                                                                                                                                                                                                                                                            | 用途与边界                                                               |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| [图片创作](../workflows/image-creation.json)                                                                                                                                                                                                                                                    | 标准 checkpoint 生图、原图编辑、局部重绘；参考图先供 Agent 理解          |
| [图片 API](../workflows/managed-image-generation.json)                                                                                                                                                                                                                                          | HuezumiApiImage，使用后台图片连接；支持百炼原生或 OpenAI-compatible 协议 |
| [Qwen 2.1 文生图](../workflows/qwen-image-2.1-text-to-image.json)                                                                                                                                                                                                                               | 本地 Qwen Image 2.1，不是独立图片台的百炼 2.0 API                        |
| [Qwen 2.1 多图](../workflows/qwen-image-2.1-multi-image-edit.json)                                                                                                                                                                                                                              | 图片集合、可选 Agent、创作/编辑及按需透明输出                            |
| [Wan 3.0 多模态](../workflows/bailian-wan3-multimodal-reference.json)                                                                                                                                                                                                                           | 百炼 API，参考图/视频/音频可选；不需要本地视频权重                       |
| [H3 文生](../workflows/minimax-h3-text-to-video.json)、[参考图](../workflows/minimax-h3-reference-image.json)、[人物多角度](../workflows/minimax-h3-character-consistency.json)、[首尾帧](../workflows/minimax-h3-first-last-frame.json)、[多素材](../workflows/minimax-h3-multi-material.json) | 本地 H3 专用权重与节点；模板名不构成一致性或成片质量验收                 |
| [Anima Turbo](../workflows/anima-turbo-style.json)、[质量](../workflows/anima-aesthetic-quality.json)、[穹顶](../workflows/anima-aesthetic-quality-dome.json)                                                                                                                                   | 分体模型与采样预设，按实际硬件选择尺寸                                   |

[Anima API JSON](../workflows/anima-turbo-style-api.json) 是 API prompt 示例，不进入画布预设发现列表。

## 标准图片创作

输入集合最多十张。generate 从空 latent 生成；edit 对指定原图重采样；inpaint 使用同尺寸黑白遮罩（白改、黑留），最后合回遮罩外原像素。平台没有画笔式遮罩编辑器；标准模板多图仅供 LLM 理解，编辑时指定原图进入扩散模型。

模板默认 checkpoint 文件名只是预设，不保证机器已有该模型。标准链路适合匹配的 SD1.5/SDXL checkpoint，特殊条件模型需使用自身原生链路。HuezumiPrompt 默认使用后台 Agent；无连接时显式改 manual。右侧图片按原比例预览，可打开大图并用 Escape 关闭。

## 本地 Qwen Image 2.1

文生图预设为 1344×768、40 步、CFG 1、Euler/Simple；多图预设为 768 编码分辨率、20 步、CPU/int8 KV cache。实际参数以 JSON 为准。

模型路径约定：

```text
models/diffusion_models/qwen_image_2.1_int8_convrot.safetensors
models/text_encoders/qwen3vl_8b_int8_convrot.safetensors
models/vae/qwen_image_2.1_vae_bf16.safetensors
```

图片集合按非空顺序编号。创作模式插入目标画布，最多再放九张参考图；编辑模式使用第一张为主图。Agent 未分配时可使用离线规则，不声称联网；联网需后台连接支持 Responses 的 web_search。CLIPLoader 的 Qwen3-VL 编码器输出扩散条件，不能代替文本 Agent 服务。

普通需求保存不透明 RGB PNG，仅明确要求透明底/alpha 时保留透明通道。RGBA VAE 并不等于默认透明。模板和模型许可、硬件支持须在实际部署时核对，旧实测不能替代完整任务验证。

## Wan 3.0 API

正向、反向提示词独立连接；反向文本按节点实现拼为正向约束。参考图、视频、音频可留空，全部为空是文生视频。默认模型 wan3.0-video-prime，控件包含种子、分辨率、比例、时长和声音等选项；是否被供应商接受仍由具体连接和模型决定。

节点上传已选素材到供应商临时存储、轮询后立即下载 MP4 到 ComfyUI output，再由平台 worker 归档。临时 URL 不作为长期保存方案；重复手动执行是新收费任务。

## H3 本地模型

五个预设使用 FL2VA/Ref2VA、专用文本编码器和音视频 VAE，部分带 Turbo LoRA。预设默认 960×544、124 帧、24 fps，不表示当前硬件在该尺寸已验收。模型候选以节点列表和工作流 JSON 为准；模型文件名相近不代表格式/架构兼容。

[2026-09-12 H3 历史验证](archive/2026-09-12-minimax-h3-local-validation.md) 只记录特定机器的小尺寸首步采样与中断，没有验证默认尺寸的完整视频。其 vendor 脚本、权重和哈希清单不随 Git 分发，不作为干净检出后可直接复跑的命令。
