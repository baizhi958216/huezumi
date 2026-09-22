# HTTP API

平台 API 使用 HttpOnly session Cookie，所有写请求校验来源。普通资源按 owner 过滤，管理与 ComfyUI 要求 admin。错误保留 HTTP 状态，并在 `data` 中提供 `code`、`message`、`requestId`；响应头含 `x-request-id`，不回显密钥或上游原文。

## 资源契约

| 方法      | 路径                                     | 契约                                                                                                 |
| --------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| GET       | `/api/catalog/models`                    | 登录后查询连接下的模型、能力及可用性，不返回私有地址或凭据                                           |
| GET       | `/api/providers`                         | 公共视频能力目录，供首页和管理员选择适配器                                                           |
| GET/POST  | `/api/projects`                          | owner 项目列表 / 创建；不命名快速创作时受理服务自动创建                                              |
| GET/PATCH | `/api/projects/:id`                      | 项目摘要 / 重命名项目                                                                                |
| GET       | `/api/documents`                         | 分页摘要，不包含正文、人物或场景全文                                                                 |
| GET       | `/api/documents/:id`                     | 当前完整版本                                                                                         |
| GET/POST  | `/api/documents/:id/versions`            | 分页版本摘要 / `{ baseVersionId, content }` 保存新版本                                               |
| GET       | `/api/documents/:id/versions/:versionId` | 指定不可变版本                                                                                       |
| POST      | `/api/billing/quotes`                    | `{ kind, connectionId, model, input, projectId?, sourceVersionId?, sourceExcerpt?, baseVersionId? }` |
| GET/POST  | `/api/runs`                              | 分页任务查询 / `{ request, quoteId, idempotencyKey }`；受理返回 202                                  |
| GET       | `/api/runs/:id`                          | 任务摘要、允许动作及结果；视频状态从原记录派生                                                       |
| POST      | `/api/runs/:id/sync`                     | 查询已有视频或工作流执行；视频计费核对状态拒绝                                                       |
| POST      | `/api/runs/:id/archive`                  | 重试视频或工作流输出归档，不重复扣费                                                                 |
| GET       | `/api/works`                             | 文本、图片、视频作品摘要，返回同过滤口径 total                                                       |
| PATCH     | `/api/works/:id`                         | `{ projectId }` 将本人作品归入本人项目                                                               |
| GET/POST  | `/api/assets`                            | 分页媒体元数据 / multipart 上传                                                                      |
| GET       | `/api/assets/:id/content`                | 鉴权后读取字节或跳转私有签名地址                                                                     |
| GET       | `/api/model-assets`                      | 用户模型文件资产元数据                                                                               |
| GET       | `/api/billing/ledger`                    | 分页额度流水                                                                                         |
| GET       | `/api/account/overview`                  | 钱包、存储、统一作品统计及最近摘要                                                                   |

业务分页使用 `{ items, nextCursor }`，默认 30、最大 100。`cursor` 绑定时间与 ID；作品支持 `q`、`kind`、`projectId`，任务支持 `kind`、`projectId`、`status` 和 `active=true`。目录、配置集合及原生引擎协议保持各自返回结构。

报价返回规范化 `request`，提交必须回传它，不能重新拼装默认值。报价有效十分钟，绑定用户、模型、连接版本和价格版本。相同幂等键/请求返回原任务；冲突和过期返回 409，余额不足 402，活动任务超限 429，无价格或非法能力组合 422。

文本价格为连接、模型、篇幅的固定额度。结构化结果保存成功后原子结算；明确失败释放，结果不明进入 review，不自动重复调用。手动保存遇到当前版本变化返回 409；AI 完成时基础版本已变化则保存候选版本，`needsReview=true`，不覆盖当前文档。

## 管理

- `/api/admin/connections` GET/POST，`/:id` PUT：连接及不可变版本，凭据只写不读，省略表示保持。
- `/api/admin/connections/:id/versions` GET：分页版本摘要，支持查询与撤销历史版本，永不返回密文或明文凭据。
- `/api/admin/connections/:id/revoke` POST `{ revisionId }`：显式撤销版本；已受理任务不能自动换连接。
- `/api/admin/comfyui/restart` POST：重启平台托管的本地 ComfyUI，并把控制面板选择的工作流 Agent 连接以私有环境配置注入执行端；外部或远程实例拒绝该操作。
- `/api/admin/settings` GET/PUT：注册、赠送、任务上限、日预算、默认连接。
- `/api/admin/text-prices` GET/POST：发布固定文本价格版本，不自动预设价格。
- `/api/admin/deployment` GET：只读配置存在性与运行方式。
- `/api/admin/runs` GET：待核对文本任务；`/:id/settle` POST `{ action: 'release' | 'charge', reason }`，最多按报价结算，不伪造正文。
- 原有 `/api/admin/users`、`pricing`、`generations`、`audit`、`invitations` 保留管理职责。
- `/api/admin/comfyui/**` 与 WebSocket：原生工作流及执行端管理；prompt 提交先持久化执行意图再请求引擎。作品历史由 worker 同步，列表不访问引擎。

## 身份与旧地址

`/api/auth/session`、`register`、`login`、`logout`、`password` 与 `PATCH /api/auth/profile` 保持原契约；没有 `GET /api/auth/profile`。

历史 `/api/files/:id`、`/api/generations/:id/video`、`/api/comfyui/view` 继续提供受保护的媒体访问；旧继续创作链接中的视频 ID 由 `/api/runs/:id` 解析为统一任务，旧业务详情入口已移除。旧的免费文本生成、视频提交和引擎作品聚合入口已退出使用。队列仍接受旧视频 submit/poll 消息。

## API 连接用途分配

`/api/admin/connections` 的 `kind` 支持 `text`、`image`、`video`；图片连接使用 `openai-compatible`，必须填写 Base URL、默认模型和模型列表。Key 通过 `secrets` 写入，查询只返回 `hasCredentials`。

`PUT /api/admin/settings` 支持 `defaultTextConnectionId`、`defaultImageConnectionId`、`defaultVideoConnectionId`、`workflowVideoConnectionId`（百炼）及 `workflowAgentConnectionId`（文本）。保存时验证类型、启用和撤销状态。图片 API 通过工作流入口使用，不加入文本/视频报价目录。

工作流提交接口不接受客户端传入平台私有连接。服务端按节点用途生成连接快照，经执行端能力检查后写入 ComfyUI 的敏感数据槽；仅内部执行期间可读，不返回前端。

## 图片生成

`POST /api/billing/quotes` 支持 `kind: "image"`，`input` 字段包括 `mode: "text" | "edit"`、`prompt`、`images`（已上传素材地址）、`size`、`count`、`negativePrompt`、`promptExtend`、`watermark` 和 `seed`。报价后通过现有 `/api/runs` 提交，`GET /api/runs/:id` 返回任务状态和图片作品地址。保存失败时按 `allowedActions` 调用 `/api/runs/:id/archive`。详细配置见 [图片生成](./image-generation.md)。
