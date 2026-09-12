# MiniMax H3 本地节点与权重验证

- 状态：completed
- 创建日期：2026-09-12

## 背景与问题

用户要求获取公开 H3 权重（包括社区版本），遍历本地视频节点，进入真实视频生成即可停止。现有五个预设仅通过结构验证；本次开始时 ComfyUI 0.35.0 的模型候选列表为空。

## 目标

- 盘点公开 FL2VA、Ref2VA、量化、Turbo、ControlNet 权重及本机全部 H3 本地节点。
- 下载适合 Apple M5 Pro 48 GB 的权重，必要时安装公开 GGUF 加载节点。
- 验证文生、首帧、尾帧、首尾帧、参考图、人物多图、多素材、Guide 与 ControlNet 路径。
- 保存真实执行证据，区分节点校验通过、模型加载、采样开始和硬件/格式阻塞。

## 非目标

- 不调用云端付费生成，不穷举重复镜像、每个量化精度或每个风格 LoRA。
- 不要求完成视频采样、解码或输出，不修改平台生成契约。

## 行为契约

权重和测试素材仅保存在本机且不提交 Git。按运行期 `/object_info` 识别节点；不能把排队成功当成生成成功。测试串行执行，仅中断本次测试任务，已有队列非空时不调用全局 interrupt。真实采样事件出现后停止；无法到达时记录具体失败，不标记通过。

## 验收条件

- [x] 记录权重来源、文件、体积和完整性信息。
- [x] 盘点所有本机 H3 非 API 节点及公开主要模型分支。
- [x] 每条路径提供采样开始后的中断证据，或可复现的阻塞记录。
- [x] `pnpm check` 通过，原有用户改动保留。

## 边界情况

48 GB 统一内存不等于可用内存；FP8/NVFP4/INT8 的加载与算子支持分别验证。下载失败的临时文件不作为可选模型。中断只覆盖采样开始后的测试，不验证最终音视频质量。

## 验证计划

使用本机 ComfyUI HTTP/WebSocket、真实权重和小尺寸测试素材，记录 prompt ID、执行节点及错误；检查文档与仓库约束。

## 实现结果

已下载并校验 11 个权重，合计 91.337 GB；公开目录核对覆盖 13 个主要来源。运行期发现 6 个 H3 非 API 节点，GGUF 的 15 条路径均到达 `SamplerCustomAdvanced` 的第 1 步并定向中断，覆盖 FL2VA、Ref2VA、Turbo、Guide、SigmaShift 与 Fun ControlNet。

官方 INT8 ConvRot 的 FL2VA 与 Ref2VA 可加载，但默认 MPS 缺少 `aten::_int_mm`。在服务进程启动前设置 `PYTORCH_ENABLE_MPS_FALLBACK=1` 后，两者均到达第 1 步采样；该 CPU 回退显著更慢。Unsloth 的 sd.cpp GGUF 不符合已安装 ComfyUI-GGUF 加载器的元数据格式，已停止下载并记录限制。完整清单、哈希和 prompt 证据保留在被 Git 忽略的 `vendor/h3-validation-2026-09-12/`；当前态说明见 `docs/minimax-h3-local-validation.md`。
