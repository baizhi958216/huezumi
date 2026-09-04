# 生成结果视频 OSS 归档

- 状态：implemented
- 负责人：
- 创建日期：2026-09-02
- 相关 issue / ADR：`docs/decisions/001-oss-material-storage.md`

## 背景与问题

视频供应商完成任务后返回有时效的下载地址。当前 `GenerationRecord.videoUrl` 直接保存该地址，作品库虽然能长期保存任务记录，但地址过期后无法继续播放或下载结果。现有 OSS 能力只覆盖生成前上传的素材，不覆盖供应商输出。

## 目标

- 供应商任务成功后，由服务端及时把结果视频转存到阿里云 OSS。
- OSS 上传成功后，`videoUrl` 替换为长期可访问的 OSS URL，作品库不再依赖供应商临时链接。
- 下载和上传使用流式文件 I/O，并限制响应大小与传输时间，避免整段视频进入内存。
- OSS 未配置、下载失败或上传失败时保留原结果地址和成功任务状态，并允许用户显式重试归档。

## 非目标

- 本次不实现浏览器直传、私有 Bucket 签名 URL、分片断点续传、对象清理和账号级目录隔离。
- 本次不自动迁移全部历史成功记录；历史记录可在作品库显式触发归档。

## 用户流程

1. 作品库或任务详情刷新进行中的生成任务。
2. 供应商返回 `SUCCEEDED` 和视频临时地址。
3. 服务端把视频下载到受限临时文件，再从文件流上传至 OSS。
4. 上传成功后记录 OSS URL、对象 key 和归档时间；页面展示“OSS 已归档”。
5. 归档失败时仍展示可用的临时或本地地址，并提供“重试归档”；重试会重新查询原供应商任务以争取取得新的临时地址，不会重新提交生成任务。

## 行为契约

- 新增私有配置 `NUXT_OSS_OUTPUT_PREFIX`、`NUXT_OSS_MAX_OUTPUT_BYTES` 和 `NUXT_OSS_TRANSFER_TIMEOUT_MS`。
- OSS 输出对象默认使用 `forkvdo/outputs/{generationId}.{ext}`，设置 `public-read`、正确的 `Content-Type` 和 immutable 缓存头。
- `GenerationRecord.outputArchive` 保存 `not_started | archived | failed` 状态；内部 `objectKey` 不得通过 API 返回。
- `videoArchived=true` 只表示最终 `videoUrl` 已指向 OSS 归档。
- 归档错误不把已经成功的生成任务改为 `FAILED`，也不覆盖供应商生成错误。
- 老记录缺少 `outputArchive` 时保持兼容；对成功且尚未归档的记录执行 `?refresh=1` 会查询原任务并尝试归档。

## 验收条件

- [x] Given OSS 配置完整且供应商返回成功视频，When 刷新任务，Then 视频被写入输出前缀且 API 返回的 `videoUrl` 为 OSS URL。
- [x] Given 视频大于配置上限、下载超时或 OSS 上传失败，When 归档，Then 任务仍为 `SUCCEEDED`、原地址仍保留、归档状态为 `failed`。
- [x] Given 归档失败或历史成功记录，When 用户显式刷新，Then 平台只重新查询原任务并重试归档，不创建新任务。
- [x] Given API 返回任务记录，When 记录包含 OSS 对象 key，Then 浏览器响应中不包含该内部 key。

## 边界情况

- 供应商临时链接已失效且原任务也不再返回新链接时，归档保持失败；平台无法恢复已经丢失的字节。
- OSS 完全未配置时归档标记为 `OUTPUT_ARCHIVE_NOT_CONFIGURED`，本地开发仍可查看尚未过期的供应商链接。
- 配置了内网 OSS Endpoint 时必须同时提供公网 `NUXT_OSS_PUBLIC_BASE_URL`，否则作品库浏览器无法访问结果。
- 进程在 OSS 写入成功、任务记录更新前退出可能产生孤儿对象；相同 generation ID 重试会覆盖同一对象 key。

## 实现提示

- 使用 `ali-oss` 的文件/流上传能力；临时文件路径由服务端随机创建，完成后无论成功或失败都清理。
- 下载阶段校验协议、HTTP 状态、Content-Type、Content-Length 和实际字节数。

## 验证计划

- 自动化检查：`pnpm check:full`、`git diff --check`。
- 人工检查：使用返回短期 URL 的脱敏 mock，确认成功、超限、超时和显式重试状态。
- 需要凭据或外部环境的检查：真实 OSS Bucket 上传、ACL、公网 URL 播放，以及各供应商完成任务后的端到端转存。

## 上线与回滚

上线前配置现有 OSS 必填变量，并确认 AccessKey 具备 PutObject 与设置对象 ACL 的权限。可通过回滚应用代码停止新结果归档；已归档对象与记录无需迁移，旧客户端仍可使用 `videoUrl`。

## 实现结果

已增加通用结果归档状态、受限下载、OSS 文件流上传、显式重试和作品库状态展示。真实 Bucket 与供应商临时链接仍需部署环境凭据进行人工验证。
