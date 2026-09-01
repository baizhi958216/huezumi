# HTTP API

所有路径由 Nitro 提供。当前没有认证；不要把服务直接用于私密素材或多租户场景。

## `GET /api/providers`

返回供应商能力目录。`enabled` 由服务端凭据是否齐全决定，不返回任何凭据内容。

## `POST /api/generations`

提交统一的 `GenerationRequest`。请求结构以 `shared/types/generation.ts` 和 `server/utils/generation-schema.ts` 为准。

常见错误：

| 状态码 | 含义                           |
| ------ | ------------------------------ |
| 400    | 供应商不存在或尚未接入         |
| 422    | 请求结构或供应商能力组合不合法 |
| 503    | 供应商凭据未配置               |
| 5xx    | 上游或内部处理失败             |

## `GET /api/generations`

返回全部生成记录，按 `createdAt` 倒序排列。接口会并发刷新所有 `PENDING`/`RUNNING` 记录；刷新单条失败时保留旧记录并写服务端日志。

## `GET /api/generations/:id`

返回单条记录并刷新进行中状态。记录不存在时返回 404。

## `POST /api/files`

接收字段名为 `file` 的 multipart 上传。视频最大 100 MiB，其他文件最大 20 MiB。返回元数据与绝对读取 URL。

## `GET /api/files/:id`

以内联方式返回素材，并设置一年 immutable 公共缓存。素材不存在时返回 404。

## 契约演进

修改 API 时同时更新共享类型、Zod schema、能力校验、相关 spec 和本文。破坏性修改需要版本化或兼容窗口，不得静默改变已持久化记录的含义。
