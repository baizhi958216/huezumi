# MiniMax H3 本地 ComfyUI 视频工作流预设

- 状态：completed
- 负责人：
- 创建日期：2026-09-12
- 相关 issue / ADR：

## 背景与问题

本机为 Apple M5 Pro、48 GB 统一内存。项目已有 ComfyUI 工作流画布和运行代理，但没有面向 MiniMax H3 本地权重的可直接载入图，用户需要从空画布手工拼出 H3 的音视频联合采样链。

## 目标

- 在项目内置工作流库提供五个可编辑的 H3 图：纯文生、单参考图、人物一致性、首尾帧、多素材控制。
- 统一使用 H3 的本地 FL2VA/Ref2VA 节点、视频/音频 VAE、标准 ComfyUI 采样与视频保存节点。
- 默认以 960×544、124 帧（24 fps，约 5.2 秒）和 Turbo LoRA 作为 M5 Pro 48 GB 的预览起点；用户可在画布中切换权重、步数和分辨率。

## 非目标

- 不在仓库中存放 H3 权重、用户素材或第三方节点包。
- 不自动下载模型、安装自定义节点或修改平台 `GenerationRequest` / `GenerationRecord` 契约。
- 不保证 Apple Silicon 的 MPS 量化路径在所有 ComfyUI 版本都可运行；实际节点定义仍以 `/object_info` 为准。

## 用户流程

1. 管理员进入 `/workflow`，启动或连接本地 ComfyUI。
2. 工作流库选择一个 `MiniMax H3 · ...` 预设并载入画布。
3. 首先在 `UNETLoader`、`CLIPLoader`、两个 `VAELoader` 和 `LoraLoaderModelOnly` 中选择本机已有文件；若节点缺失，画布显示缺失节点提示。
4. 参考图、首尾帧、视频和音频通过各自 `LoadImage` / `LoadVideo` / `LoadAudio` 节点上传。多素材图通过 `GetVideoComponents` 把参考视频拆成图像帧和配套音频。
5. 修改 H3 节点的 prompt、宽高、length 与参考槽位后运行，结果经 `VAEDecode`、`VAEDecodeAudio` 和 `CreateVideo` 合成为带原生音频的视频，再由 `SaveVideo` 保存。

## 行为契约

### 预设与能力

| 文件                                    | H3 节点                     | 输入                                          |
| --------------------------------------- | --------------------------- | --------------------------------------------- |
| `minimax-h3-text-to-video.json`         | `MiniMaxH3ImageToVideo`     | 纯文本，T2VA                                  |
| `minimax-h3-reference-image.json`       | `MiniMaxH3ReferenceToVideo` | 1 张身份或风格参考图                          |
| `minimax-h3-character-consistency.json` | `MiniMaxH3ReferenceToVideo` | 3 张同一人物的多角度参考图                    |
| `minimax-h3-first-last-frame.json`      | `MiniMaxH3ImageToVideo`     | `first_frame` 与 `last_frame` 两张图，FL2VA   |
| `minimax-h3-multi-material.json`        | `MiniMaxH3ReferenceToVideo` | 2 张图、1 段视频（含配套音轨）和 1 段独立音频 |

Ref2VA 提示词按节点顺序引用 `<Picture 1..9>`、`<Video 1..3>`、`<Audio 1..3>`。参考视频先经 `GetVideoComponents` 输出图像帧和音频；同一视频的音频接入 `ref_video_audios.ref_video_audio_0`，独立音频接入 `ref_audios.ref_audio_0`。

### 兼容与失败

- 预设是标准 ComfyUI workflow JSON；项目画布按运行期 `/object_info` 还原节点，缺少 H3 节点或模型候选项时不提交并显示可操作错误。
- 已保存的用户工作流不迁移、不覆盖；新增文件只会作为 `builtin-*` 条目出现在工作流库。
- 模型文件名只是默认选择值，不代表仓库已下载。用户必须在本机 ComfyUI 模型目录放置兼容权重，或在节点中改选已有文件。

## 验收条件

- [x] 五个 JSON 均能被解析，名称以 `MiniMax H3 ·` 开头，包含 H3 节点和 `SaveVideo`。
- [x] 所有连线端点都指向图中现有节点；人物一致性图含三个 `ref_images.*` 槽位，首尾帧图含两个端点，多素材图含图像、视频帧、配套音频和独立音频槽位。
- [x] 工作流库沿用现有 `workflows/*.json` 自动发现机制，不需要新增 API 或数据库迁移。
- [x] `pnpm check` 与 ComfyUI JSON/连线测试通过；真实 MPS 生成需在安装权重后的本机单独验收。

## 边界情况

- 空的 `LoadImage`、`LoadVideo` 或 `LoadAudio` 选择框在上传素材前会触发 ComfyUI 的资源校验，这是预期行为。
- H3 的 length 必须落在其 17k+5 帧网格；预设使用 124，用户改值时应保持 5、22、39、56、73、90、107、124… 等合法序列。
- Ref2VA 的参考图越多、`ref_image_size` 越高，显存和耗时越高；M5 Pro 48 GB 建议先保持 `match` 与 960×544。

## 实现结果

已新增五个内置 workflow JSON 和对应的结构测试、开发文档说明。未下载权重、未安装第三方节点、未在本机执行真实 H3 采样。
