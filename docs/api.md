# HTTP API

所有路径由 Nitro 提供。当前没有认证；不要把服务直接用于私密素材或多租户场景。

## `GET /api/providers`

返回供应商能力目录及各供应商的启用状态；不会返回服务端凭据。

## `POST /api/generations`

提交统一的 `GenerationRequest`。请求结构以 `shared/types/generation.ts` 和 `server/utils/generation-schema.ts` 为准。

`media` 是有序数组，同一种 `type` 可以重复出现，用于提交多张参考图、多个参考视频或多个参考音频。平台会按当前模型能力校验单类上限及跨类型组合上限；当前请求最多包含 50 份素材。创作台会将每一份素材分别保留并提交，公网 URL 仍需满足供应商可访问要求。

RollDek 的 `reference_video` 素材必须携带自身的 `duration`（秒），服务端会映射为上游 `reference_videos[].duration`；这与顶层生成输出时长字段无关。RollDek 还要求提示词和所有素材 URL 均为服务端可访问的公网 HTTPS 地址。其模型 ID 的 `-480p` / `-720p` / `-1080p` 后缀决定输出清晰度，覆盖请求中的清晰度选择。

Runway Dev 当前接入 Gen-4.5、WAN 3.0、Seedance 2/2.5、Hailuo 3 和 Gemini Omni Flash。适配器根据输入素材选择 `POST /v1/text_to_video`、`/v1/image_to_video` 或 `/v1/video_to_video`，将统一的首尾帧、参考图、参考视频和参考音频映射到 Runway 对应字段，并按模型映射像素 ratio / resolution。Runway 素材 URL 必须是公网 HTTPS 且满足供应商的 HEAD、Content-Type 和大小要求；任务完成后的输出 URL 为临时地址，服务端会沿用统一结果归档流程。

常见错误：

| 状态码 | 含义                           |
| ------ | ------------------------------ |
| 400    | 供应商不存在或尚未接入         |
| 422    | 请求结构或供应商能力组合不合法 |
| 503    | 供应商凭据未配置               |
| 5xx    | 上游或内部处理失败             |

## `GET /api/generations`

返回全部生成记录，按 `createdAt` 倒序排列。接口会并发刷新所有 `PENDING`/`RUNNING` 记录；供应商任务成功时同步把结果归档到 OSS。刷新或归档单条失败时保留旧记录并写服务端日志。

## `GET /api/generations/:id`

返回单条记录并刷新进行中状态。`?refresh=1` 可显式恢复状态待确认的任务，或重试任意供应商已成功但尚未归档的任务；只查询原供应商任务，不会重新提交。`outputArchive` 返回归档状态和非敏感错误码，内部 OSS object key 不进入响应。记录不存在时返回 404。

## `POST /api/files`

接收字段名为 `file` 的 multipart 上传。视频最大 100 MiB，其他文件最大 20 MiB。返回元数据与绝对读取 URL。

当阿里云 OSS 配置完整时，文件会同时转存到 OSS，返回的 `url` 为 OSS 公网 URL；OSS 配置为空时返回本地 `/api/files/:id` URL。OSS 配置不完整返回 503，OSS 上传失败返回 502。

## `GET /api/files/:id`

以内联方式返回素材，并设置一年 immutable 公共缓存。素材不存在时返回 404。

## 契约演进

修改 API 时同时更新共享类型、Zod schema、能力校验、相关 spec 和本文。破坏性修改需要版本化或兼容窗口，不得静默改变已持久化记录的含义。
