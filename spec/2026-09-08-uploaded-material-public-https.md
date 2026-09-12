# 已上传素材的供应商公网 HTTPS 校验

- 状态：completed
- 负责人：
- 创建日期：2026-09-08
- 相关 issue / ADR：`docs/decisions/001-oss-material-storage.md`

## 背景与问题

创作台上传的素材使用平台路径 `/api/files/<asset-id>`，浏览器可以通过鉴权读取。Runway Dev 和 RollDek WAN 3.0 要求供应商收到可从公网读取的 HTTPS URL，但报价与正式提交的能力校验先于 worker 的 OSS URL 解析，因此已上传素材会被误报为非公网 HTTPS。

## 目标

- 已上传且属于当前用户的素材，在报价和正式提交校验前解析为短期 OSS 签名 URL。
- 保持 OSS private ACL 和平台素材路径，不把签名 URL 持久化为素材身份。
- 保留外部 URL 的 HTTPS 校验，以及未配置 OSS 时的可操作错误。

## 非目标

- 不把私有 OSS 对象改为公开读取。
- 不改变 `GenerationRequest.media` 或已持久化任务记录的结构。
- 不延长签名 URL 超过现有 runtime 配置，也不实现供应商专用上传 API。

## 用户流程

1. 用户上传图片、视频或音频，创作台继续保存平台素材路径。
2. 用户首次点击生成获取报价时，服务端解析属于当前用户的已上传素材并签发 OSS HTTPS URL，再执行供应商能力校验。
3. 用户确认报价提交时重复执行解析和校验；worker 提交前仍再次签发 URL，覆盖排队等待窗口。
4. OSS 未配置、素材不存在或签名地址不是 HTTPS 时，返回不泄露内部信息且可操作的错误，不创建付费任务。

## 行为契约

- `POST /api/files` 的 `url` 保持 `/api/files/<asset-id>`，供平台鉴权读取和历史任务兼容。
- `POST /api/billing/quote` 与 `POST /api/generations` 在调用 `assertRequestSupported` 前调用 `resolveProviderMediaUrls`。
- 平台路径素材必须属于当前用户、未删除且有 OSS object key；服务端以 `NUXT_OSS_SIGNED_URL_TTL_SECONDS` 签发短期地址。
- Runway Dev / RollDek 的 `requiresHttpsMediaUrls` 校验针对解析后的地址执行。外部 HTTP URL 仍被拒绝。
- 报价和任务记录继续使用原始平台请求及其请求摘要；签名 URL 只存在于当前校验或 worker 提交过程。

## 验收条件

- [x] Given 用户已上传素材且 OSS 配置完整，When 获取 Runway Dev 或 RollDek 报价，Then 不因 `/api/files/<id>` 路径触发公网 HTTPS 错误。
- [x] Given 用户已上传素材且 OSS 配置完整，When 正式提交与报价摘要一致的任务，Then 校验通过并保留原始平台素材路径。
- [x] Given 用户提交外部 HTTP 素材 URL，When 获取报价或提交任务，Then 仍返回公网 HTTPS 校验错误。
- [x] Given 本地素材未配置 OSS，When 获取需要公网素材的供应商报价，Then 返回配置 OSS 的可操作错误且不创建报价或任务。
- [x] Given 旧任务仍保存 `/api/files/<id>`，When worker 提交，Then 继续在提交前解析为短期签名 URL。

## 边界情况

- 素材不存在、已删除或不属于当前用户时拒绝解析，不向供应商发送请求。
- HTTPS Endpoint 配置错误或签名结果为 HTTP 时仍由供应商能力校验拒绝。
- 签名 URL 过期后不修改历史任务请求；下一次受控提交流程重新签发。

## 实现提示

- 复用现有 `resolveProviderMediaUrls` 和 OSS 签名服务，不新增公开代理或供应商分支。
- 报价阶段只使用解析后的副本做能力校验，避免将短期 URL 写入报价和任务请求。

## 验证计划

- 自动化检查：`pnpm check`、`pnpm check:full`、`git diff --check`。
- 人工检查：在已配置 HTTPS OSS 的创作台上传素材，分别对 Runway Dev 和 RollDek WAN 3.0 获取报价并提交；确认供应商请求使用签名 HTTPS 地址。
- 需要凭据或外部环境的检查：真实 OSS 公网读取与供应商任务联调不纳入默认检查。

## 上线与回滚

无数据库迁移和新增配置。回滚代码会恢复为旧的校验顺序，已上传素材仍可通过平台路径读取，但远程供应商生成会再次在报价阶段失败；不影响已有任务记录。

## 实现结果

报价和正式提交现在会在供应商能力校验前解析平台素材 URL；worker 的提交前解析保持不变。私有 OSS、历史请求结构和外部 HTTPS URL 校验均未改变。
