# Runway Dev Video Provider

- 状态：completed
- 负责人：
- 创建日期：2026-09-03
- 相关 issue / ADR：

## 背景与问题

平台需要接入 Runway Dev 的异步视频生成 API。Runway 的生成结果 URL 只在有限时间内有效，必须继续经过现有结果归档流程；其 API 还使用实际像素尺寸表达画幅，与平台的宽高比契约不同。

## 目标

- 通过统一 `VideoProvider` 接入 Runway Dev Gen-4.5 及多模态视频模型。
- 将平台 `GenerationRequest` 映射为官方 `POST /v1/text_to_video`、`/v1/image_to_video` 或 `/v1/video_to_video` 请求，并携带固定 API 版本头。
- 归一化 Runway 任务状态和完成输出，复用统一 OSS 结果归档。
- 在目录中只登记字段和约束已经由官方 API Reference 核实、能被当前平台契约准确表达的模型。

## 非目标

- 本次暂不登记 `aleph2`、`veo3.1`、`veo3.1_fast`、`gen4_turbo`、`happyhorse_1_0` 和 `grok_imagine_1_5`；其中部分模型需要关键帧时间轴、视频输入时长跟随或独立的输入模式，当前统一契约尚未完整表达。
- 不接入 Runway 图片、音频、实时头像、Recipe、Model Router 或临时上传 API。
- 不向 Runway 发送平台没有对应官方字段的提示词改写、水印和音频开关。
- 不发起真实生成请求或提交任何凭据。

## 用户流程

1. 服务端配置 `NUXT_RUNWAY_API_KEY`，可选配置 API 基地址和默认模型。
2. 创作台从 `/api/providers` 读取 Runway 已接入模型及其文生、首尾帧和多模态参考能力。
3. 提交后本地保存 Runway task ID；详情和作品库查询刷新 `PENDING`、`THROTTLED`、`RUNNING`、`SUCCEEDED`、`FAILED` 状态。
4. 任务成功后读取 `output[0]`，继续使用统一 OSS 结果归档；未配置 OSS 时仍遵循现有临时 URL 生命周期限制。

## 行为契约

- provider ID 为 `runway`，默认 API 地址为 `https://api.dev.runwayml.com`，默认模型为 `gen4.5`。
- 请求头包含 `Authorization: Bearer <key>`、`Content-Type: application/json` 和 `X-Runway-Version: 2024-11-06`。
- `prompt` 映射为 `promptText`，按模型官方 UTF-16 长度限制校验；支持的模型统一要求平台提示词非空。
- Gen-4.5 使用 `POST /v1/image_to_video`，无首帧时省略 `promptImage`，有 `first_frame` 时传入首帧 URL；平台画幅映射为 `1280:720`、`720:1280`、`1104:832`、`960:960`、`832:1104`、`1584:672`。
- `wan3` 无图片输入时使用 `text_to_video`，有图片输入时使用 `image_to_video`；参考视频和参考音频分别映射到 `referenceVideos`、`referenceAudio`。
- `seedance2_5`、`seedance2`、`seedance2_fast`、`seedance2_mini` 和 `hailuo3` 根据输入自动选择文本、图片或视频端点；图片输入在 `image_to_video` 中映射为 `promptImage`，视频输入映射为 `promptVideo`，视频端点的额外参考图/视频/音频映射为 `references`、`referenceVideos`、`referenceAudio`。
- `gemini_omni_flash` 的首帧输入使用 `promptImage`，视频输入使用 `videoUri`；视频编辑输出由 Runway 按输入视频方向和时长生成，额外参考图映射为 `references`。为避免把多图提交到只接受单首帧的图片端点，平台对该模型统一收敛为一张参考图。
- 平台清晰度和画幅按各模型官方像素 ratio 映射；Hailuo 额外传递官方 `resolution`，Seedance 系列支持官方 `auto` 时长并将平台智能时长 `-1` 映射为 `auto`。
- 仅在用户提供 `seed` 时下发 `seed`；支持音频的模型下发 `audio`；不下发平台没有对应官方语义的 `negativePrompt`、`promptExtend` 或 `watermark`。
- 创建响应保存 `id`；任务查询使用 `GET /v1/tasks/{id}`。`PENDING` / `THROTTLED` → `PENDING`，`RUNNING` → `RUNNING`，`SUCCEEDED` → `SUCCEEDED`，`FAILED` / `CANCELED` / `CANCELLED` → `FAILED`，未知值 → `UNKNOWN`。
- 成功任务仅从 `output[0]`取得视频地址；该地址是临时 URL，不直接作为长期产品存储，交由统一归档流程处理。失败不把 Runway 的 failure code 原样返回给用户。
- Runway 素材 URL 必须是服务端可访问的 HTTPS URL；实际 URL、Content-Type、HEAD、大小和重定向要求由 Runway 官方输入规则约束，平台目录按图片 16MB、视频/音频 32MB 的 URL 上限收敛。

## 验收条件

- [x] Given 未配置 Runway API Key，When 请求 `/api/providers`，Then Runway 返回 `enabled: false` 且不返回凭据。
- [x] Given 配置 Runway API Key，When 请求 `/api/providers`，Then 返回 `runway` 及已接入模型，并准确展示各模型的多模态输入、清晰度、时长和画幅能力。
- [x] Given 文生请求，When provider 提交任务，Then provider 根据模型向官方文本端点或 Gen-4.5 的 `image_to_video` 端点提交 `model`、`promptText`、ratio 和时长。
- [x] Given 首尾帧或参考素材请求，When provider 提交任务，Then 图片、视频、音频和 seed 按模型官方字段映射，且不混用不支持的字段。
- [x] Given Runway 返回各文档状态，When provider 查询任务，Then 状态和 `output[0]` 按统一 `ProviderTaskResult` 返回。
- [x] Given Runway 任务成功且返回临时视频 URL，When forkvdo 刷新任务，Then 继续走现有统一结果归档，不新增 Runway 专用存储格式。
- [x] Given Runway 返回 failure code，When 任务失败，Then 平台状态为 `FAILED`，用户错误不直接暴露该诊断 code。
- [x] Given 旧供应商任务记录，When 读取或刷新，Then 其 provider、请求字段和归档行为保持不变。

## 边界情况

- Runway 返回成功但缺少 `output[0]` 时保留成功状态，由统一归档流程报告输出传输失败，不伪造 URL。
- Runway 返回 `THROTTLED` 时视为仍在等待，不把任务误判为失败。
- `adaptive` 或不支持的画幅不在目录中；适配器对绕过目录的请求拒绝构造请求。
- 未配置 OSS 时结果 URL 仍会按 Runway 的 24–48 小时生命周期过期；生产环境应配置 OSS 才能持久保存。
- 供应商请求的 HTTP 重试策略继续由 `$fetch` / 上游客户端边界负责；本次不对生成任务做重复提交，避免重复消费额度。

## 实现提示

- 供应商差异集中在 `server/services/providers/runway.ts`；目录和工厂分别位于 `catalog.ts`、`index.ts`。
- 直接使用 REST 请求以保持与现有 provider 适配器一致，不新增 Runway SDK 依赖；请求字段以 Runway 官方 OpenAPI、cURL / Node 示例和 SDK 类型定义核对。

## 验证计划

- 自动化检查：`pnpm check`、`pnpm check:full`、`git diff --check`。
- 无网络验证：Runway 请求构造、画幅映射、状态归一化、类型检查和构建。
- 需要凭据或外部环境的检查：使用专用 Runway Dev 测试账号和公开 HTTPS 首帧素材进行一次真实提交/查询；不纳入默认检查。

## 上线与回滚

新增私有环境变量，无存储迁移。移除 provider 注册、环境配置和目录项即可回滚；已有 Runway 任务记录在回滚前应完成，否则回滚后无法刷新其任务状态。

## 实现结果

- 新增 Runway Gen-4.5 与多模态视频模型 REST 适配器、能力目录和 provider 工厂注册。
- 新增 `NUXT_RUNWAY_API_KEY`、`NUXT_RUNWAY_BASE_URL`、`NUXT_RUNWAY_MODEL` 服务端配置示例。
- 根据素材选择官方 `text_to_video`、`image_to_video` 或 `video_to_video`；查询 `tasks` 状态并继续复用统一输出归档。
- 其它需要额外平台语义的 Runway 模型仍按非目标保留，未在目录中虚假宣称已适配。
