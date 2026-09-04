# RollDek WAN 3.0 Provider

- 状态：completed
- 负责人：
- 创建日期：2026-09-03
- 相关 issue / ADR：

## 背景与问题

平台需要接入 RollDek 的统一 WAN 3.0 视频接口。该接口使用扁平 OpenAI 风格请求，提交后返回异步任务 ID；模型 ID 的分辨率后缀优先于请求体中的清晰度字段。

## 目标

- 通过统一 `VideoProvider` 接入 RollDek 的提交和任务查询流程。
- 登记标准版、Prime、Image、Image Prime 四个系列的 480P / 720P / 1080P 模型，共 12 个 API model ID。
- 将平台素材映射为 `reference_images`、`reference_videos`、`reference_audios`，并归一化 RollDek 状态和完成视频地址。
- 不让请求体的清晰度与模型后缀产生歧义。

## 非目标

- 不接入 RollDek 文档之外的模型或编辑/延长任务。
- 不在本次变更中发起真实生成请求或提交凭据。
- 不改变已有任务的存储结构和结果归档流程。

## 用户流程

1. 服务端配置 `NUXT_ROLLDEK_API_KEY`，可选配置 `NUXT_ROLLDEK_BASE_URL`。
2. 创作台从 `/api/providers` 读取 RollDek 的模型和能力；模型分辨率与模型 ID 后缀保持一致。
3. 提交后本地保存 RollDek task ID，列表/详情查询刷新 `queued`、`in_progress`、`completed` 和 `failed` 状态。
4. 完成后读取 `metadata.url`，继续使用平台统一的结果归档。

## 行为契约

- RollDek provider ID 为 `rolldek`，默认地址为 `https://rolldek.com`。
- 请求发送 `model`、`prompt`、字符串 `seconds`、`size`、`resolution`、`aspect_ratio` 和兼容别名 `ratio`。
- 模型后缀 `-480p`、`-720p`、`-1080p` 分别强制 `480P`、`720P`、`1080P`；目录模型级能力只允许对应清晰度。
- `first_frame`、`last_frame`、`reference_image` 映射为 `reference_images`；首尾帧带对应 `role`，普通参考图省略 role。
- `reference_video` 映射为 `{ url, duration }`；RollDek 按参考视频秒数计费，因此该字段必填且必须落在目录声明的素材时长范围内。统一 `MediaInput.duration` 仍可选，但 RollDek 的能力目录会将 `reference_video` 标记为必填。
- `reference_audio` 映射为 `{ url }`，不计入输出视频秒数。
- 标准版 / Prime 支持图片、视频、音频参考；Image / Image Prime 不支持参考视频。
- 平台状态映射为：`queued → PENDING`、`in_progress → RUNNING`、`completed → SUCCEEDED`、`failed → FAILED`；完成视频使用 `metadata.url`。
- RollDek 文档未声明提示词改写、种子、水印或音频输出开关，目录对此均关闭；提示词仍为必填。

## 验收条件

- [x] `GET /api/providers` 在配置凭据时返回启用的 `rolldek`，且不返回 API Key。
- [x] 目录包含四个系列、三个分辨率后缀的 12 个 RollDek 模型。
- [x] 提交请求发送 Bearer 鉴权，并将模型后缀对应清晰度同步写入 `size` / `resolution`。
- [x] 首尾帧角色、参考图、参考视频时长和参考音频按 RollDek 字段映射；RollDek 缺少或超出范围的参考视频时长在服务端能力校验阶段拒绝；Image 系列的参考视频在服务端能力校验阶段拒绝。
- [x] 查询任务归一化四种文档状态，并从 `metadata.url` 返回完成视频地址。
- [x] 统一结果归档无需 RollDek 特殊分支，继续复用现有流程。

## 边界情况

- 创建响应优先读取 `id`，兼容读取 `task_id`；缺少任务 ID 时提交失败。
- 缺少模型分辨率后缀时适配器拒绝构造请求；即使统一请求中的 resolution 不一致，也以模型后缀为准。
- 缺少参考视频时长时服务端返回可操作的 422，不向上游提交不完整的计费请求。
- 完成响应缺少 `metadata.url` 时保留成功状态但由统一归档流程标记归档失败，不伪造视频地址。
- 没有配置 RollDek API Key 时 provider 保持未启用，提交返回 503。

## 实现提示

- 供应商差异集中在 `server/services/providers/rolldek.ts`；目录和工厂分别位于 `catalog.ts`、`index.ts`。
- 不在适配器中把 RollDek 原始响应泄漏到 API 响应；仅返回平台统一任务结果。

## 验证计划

- 自动化检查：`pnpm check`、`pnpm check:full`、`git diff --check`。
- 无网络验证：请求构造、模型后缀解析、状态归一化和类型检查。
- 需要凭据或外部环境的检查：使用专用 RollDek 测试账号和公开 HTTPS 素材进行一次真实提交/查询；不纳入默认检查。

## 上线与回滚

新增私有环境变量，无存储迁移。删除 provider 注册、环境配置和目录项即可回滚；已有 RollDek 任务记录仍会因 provider 缺失而无法自动刷新，应在回滚前完成或保留适配器代码。

## 实现结果

- 新增 RollDek 适配器和 12 个模型能力声明。
- 新增 RollDek runtime 配置、环境示例、API/开发文档和 README 入口。
- 为统一媒体项增加可选 `duration`，并在 RollDek 能力中声明参考视频必须提供该字段；创作台本地视频上传自动读取时长，URL 输入要求手动填写。
- 尚未执行真实 RollDek 任务调用。
