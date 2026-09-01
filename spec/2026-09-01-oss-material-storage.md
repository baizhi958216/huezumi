# 阿里云 OSS 素材存储

- 状态：completed
- 负责人：
- 创建日期：2026-09-01
- 相关 issue / ADR：`docs/decisions/001-oss-material-storage.md`

## 背景与问题

当前 `POST /api/files` 将素材只写入应用本地 `.data/`，并返回 `/api/files/:id` 地址。远程视频供应商无法访问开发机或私有部署的本地地址，导致参考图、参考视频和参考音频无法被百炼读取。

## 目标

- 服务端接收上传后自动写入阿里云 OSS。
- OSS 配置完整时，上传接口返回可供远程供应商读取的 OSS 公网 URL。
- OSS AccessKey 只存在于服务端 runtime config，不进入浏览器或错误响应。
- 保留现有本地元数据与文件副本，兼容旧素材读取接口并提供故障排查兜底。

## 非目标

- 本次不实现浏览器直传、STS 临时凭证或分片上传。
- 本次不迁移已经存在的 `.data/` 素材。
- 本次不实现结果视频的 OSS 归档和清理策略。

## 用户流程

1. 用户在创作台选择图片、视频或音频文件。
2. 浏览器将文件上传到 `POST /api/files`。
3. 服务端先校验文件大小，再使用私有凭据上传到配置的 OSS Bucket。
4. 上传成功后返回 OSS URL，创作台把该 URL 写入生成请求。
5. OSS 未配置时继续返回本地 URL；配置不完整或 OSS 上传失败时返回可操作错误。

## 行为契约

- 新增私有配置：`NUXT_OSS_ACCESS_KEY_ID`、`NUXT_OSS_ACCESS_KEY_SECRET`、`NUXT_OSS_BUCKET`、`NUXT_OSS_REGION`，以及可选的 `NUXT_OSS_ENDPOINT`、`NUXT_OSS_PUBLIC_BASE_URL`、`NUXT_OSS_PREFIX`。
- OSS 配置全部为空时，上传行为保持本地模式。
- OSS 必填配置只配置了一部分时，`POST /api/files` 返回 `503`。
- OSS 上传失败时，`POST /api/files` 返回 `502`，不向客户端返回上游错误或凭据。
- OSS 成功时响应中的 `url` 为 OSS 公网 URL；对象使用 `public-read` ACL，以便百炼通过 URL 读取。
- 上传元数据和本地副本继续写入 Nitro storage，旧的 `GET /api/files/:id` 行为保持不变。

## 验收条件

- [x] 完整 OSS 配置下，上传图片、视频和音频均返回 OSS URL。
- [x] 返回的 OSS URL 不包含 AccessKey 或 Secret。
- [x] 缺少 OSS 配置时，现有本地上传仍可用。
- [x] OSS 配置不完整和上传失败时，客户端得到明确的非敏感错误。
- [x] 文件大小限制、文件名和 MIME 类型校验保持现有行为。
- [x] `pnpm check:full` 通过。

## 边界情况

- OSS Bucket 未设置公网读取权限或 AccessKey 没有上传/设置对象 ACL 权限时，上传会失败或供应商无法读取；部署文档必须说明权限要求。
- 自定义 OSS Endpoint 使用内网地址时，必须同时配置公网 `NUXT_OSS_PUBLIC_BASE_URL`，否则远程供应商仍不可访问。
- OSS 上传成功但本地元数据写入失败可能产生孤儿对象；本次不实现自动清理。

## 实现提示

- 使用服务端 `ali-oss` SDK，避免把凭据暴露给浏览器。
- 对象 key 使用服务端生成的 UUID 和安全扩展名，不使用用户原始文件名作为路径。
- 默认前缀为 `forkvdo/uploads`，公网 URL 支持通过自定义域名覆盖。

## 验证计划

- 自动化检查：`pnpm check:full`、`git diff --check`。
- 人工检查：配置 OSS 后分别上传图片、视频、音频，确认返回 URL 可在浏览器打开，并确认生成请求使用该 URL。
- 需要凭据或外部环境的检查：真实 OSS Bucket、公共读取策略和百炼任务提交。

## 上线与回滚

- 上线前配置 OSS 四项必填变量，并确认 Bucket 允许公共读取及当前 AccessKey 具备所需权限。
- 删除或清空 OSS 配置即可回退到现有本地上传模式；已上传的 OSS 对象不会自动删除。

## 实现结果

已实现服务端 OSS 转存、运行时配置、文档和兼容性回退。真实 Bucket 上传与百炼读取仍需使用部署环境凭据进行人工验证；当前实现保留本地副本，尚未提供清理任务。
