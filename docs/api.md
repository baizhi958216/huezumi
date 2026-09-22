# HTTP API

以下按 `server/api/` 与 `server/routes/` 的实际路由整理。参数的完整类型以 [共享类型](../shared/types/platform.ts)、[请求 schema](../server/services/platform/schemas.ts) 和各路由中的 Zod 校验为准。

## 通用约定

会话使用 HttpOnly `huezumi_session` Cookie。POST/PUT/PATCH/DELETE 若带 Origin 则校验同源；无 Origin 不跳过身份校验。普通资源按 owner 过滤，管理与 ComfyUI 需要 admin。错误保留 HTTP 状态，`data` 包含 `code`、`message`、`requestId`，响应头包含 `x-request-id`。

业务分页使用 `{ items, nextCursor }`，默认 limit=30、最大 100，cursor 是不透明游标。作品返回相同过滤口径的 total；作品支持 q/kind/projectId（kind=workflow 按来源筛选），任务支持 kind/projectId/status/active=true。配置集合、部分管理列表和原生引擎接口不使用统一分页格式。

## 身份

| 方法  | 路径                 | 权限 / 用途                                                      |
| ----- | -------------------- | ---------------------------------------------------------------- |
| GET   | `/api/auth/session`  | 查询当前会话，未登录也可查询                                     |
| POST  | `/api/auth/register` | 按 open/invite/disabled 注册设置处理                             |
| POST  | `/api/auth/login`    | 登录并设置会话                                                   |
| POST  | `/api/auth/logout`   | 清除会话                                                         |
| POST  | `/api/auth/password` | 登录用户修改密码                                                 |
| PATCH | `/api/auth/profile`  | 登录用户更新 displayName / avatarUrl；头像必须是本人图片素材路径 |

没有 `GET /api/auth/profile`。权限检查还受账户 active 状态和会话过期控制。

## 创作资源

以下接口除公共 `/api/providers` 外均需登录。

| 方法      | 路径                                     | 合同                                                      |
| --------- | ---------------------------------------- | --------------------------------------------------------- |
| GET       | `/api/providers`                         | 公共视频适配器能力目录，无供应商凭据                      |
| GET       | `/api/catalog/models`                    | 用户可用模型、能力与状态，无私有地址/凭据                 |
| GET/POST  | `/api/projects`                          | 本人项目列表 / `{ name }` 创建                            |
| GET/PATCH | `/api/projects/:id`                      | 本人项目摘要 / 重命名                                     |
| GET       | `/api/documents`                         | 分页摘要，不携带完整正文                                  |
| GET       | `/api/documents/:id`                     | 当前完整版本                                              |
| GET/POST  | `/api/documents/:id/versions`            | 分页版本摘要 / `{ baseVersionId, content }` 保存          |
| GET       | `/api/documents/:id/versions/:versionId` | 指定不可变版本                                            |
| POST      | `/api/billing/quotes`                    | 规范化输入并返回报价                                      |
| GET/POST  | `/api/runs`                              | 任务列表 / 受理任务，提交成功返回 202                     |
| GET       | `/api/runs/:id`                          | 任务详情、结果和 allowedActions；兼容旧视频 generation ID |
| POST      | `/api/runs/:id/sync`                     | 排队同步已有视频/工作流状态；不再次生成                   |
| POST      | `/api/runs/:id/archive`                  | 排队重试图片、视频或工作流归档；不重复计费                |
| GET       | `/api/works`                             | 本人文本、图片、视频作品摘要及 total                      |
| PATCH     | `/api/works/:id`                         | `{ projectId }` 将本人作品归入本人项目                    |
| GET/POST  | `/api/assets`                            | 分页素材元数据 / multipart `file` 上传                    |
| GET       | `/api/assets/:id/content`                | 鉴权媒体读取或私有签名跳转                                |
| GET       | `/api/model-assets`                      | 模型资产元数据；非模型上传/训练接口                       |
| GET       | `/api/billing/ledger`                    | 分页额度流水                                              |
| GET       | `/api/account/overview`                  | 钱包、存储、作品统计及最近摘要                            |

上传视频上限 100 MiB，其他支持的图片/音频上限 20 MiB，同时校验内容签名及个人存储配额。独立图片台参考图另限 PNG/JPEG/WebP、每张 10 MiB；素材上传成功不代表符合所有模型输入要求。

## 报价与受理

报价请求：

```json
{
  "kind": "image",
  "connectionId": "<connection-uuid>",
  "model": "qwen-image-2.0",
  "input": {
    "mode": "text",
    "prompt": "窗边晒太阳的小猫，温暖插画",
    "images": [],
    "size": "1024*1024",
    "count": 1,
    "promptExtend": true,
    "watermark": false
  }
}
```

占位 connectionId 必须替换为本人可用目录中的实际 UUID。kind 允许 text/image/video；可选上下文为 projectId、sourceVersionId、sourceExcerpt、baseVersionId。workflow 使用管理员独立接口。

报价返回 `{ id, request, estimatedCredits, priceVersion, expiresAt }`。提交 `/api/runs` 使用 `{ request: quote.request, quoteId: quote.id, idempotencyKey }`，键长度 12–120；不要重新拼装默认值。报价有效十分钟，相同 owner/键/请求返回原任务，不因重试再扣费。

| HTTP 状态       | 常见业务含义                                              |
| --------------- | --------------------------------------------------------- |
| 401 / 403 / 404 | 未登录 / 无权限或来源不符 / 资源不存在或不属于当前用户    |
| 402             | 可用额度不足                                              |
| 409             | 幂等冲突、报价过期/请求不符、文档基础版本冲突或动作不允许 |
| 413 / 415       | 上传大小/配额超限，或不支持的媒体内容                     |
| 422             | 参数、连接/模型能力或价格配置不满足要求                   |
| 429             | 活动任务或请求限流超限                                    |
| 503             | 平台日预算耗尽或必需基础设施不可用                        |

任务返回 `status`、`stage`、`billing`、`allowedActions`、`outputs` 等；文本包含 documentVersion，图片详情包含 imageRequest。已生成不等于已归档。动作必须依据 allowedActions，review 状态不允许自行再次提交上游。完整合同见 [平台基线](../spec/2026-09-22-platform-baseline.md)。

## 管理接口

| 方法     | 路径                                  | 用途                                                                                    |
| -------- | ------------------------------------- | --------------------------------------------------------------------------------------- |
| GET      | `/api/admin/overview`                 | 管理概览                                                                                |
| GET      | `/api/admin/users`                    | 用户列表                                                                                |
| PATCH    | `/api/admin/users/:id`                | 用户管理                                                                                |
| POST     | `/api/admin/users/:id/credits`        | `{ amount, reason }` 调整额度，余额不能低于预留                                         |
| GET/POST | `/api/admin/pricing`                  | 图片/视频价格规则查询与发布                                                             |
| GET/POST | `/api/admin/text-prices`              | 固定文本价格版本                                                                        |
| GET      | `/api/admin/generations`              | 视频生成管理                                                                            |
| POST     | `/api/admin/generations/:id/action`   | `refresh` 同步、`release` 释放或 `charge` 核对扣费；后两者需 reason，charge 另需 amount |
| GET      | `/api/admin/runs`                     | 待核对文本/图片任务，最多 100 条                                                        |
| POST     | `/api/admin/runs/:id/settle`          | `{ action: "release" 或 "charge", reason }`，按报价上限核对，不伪造产物                 |
| GET      | `/api/admin/audit`                    | 管理审计                                                                                |
| GET/POST | `/api/admin/invitations`              | 邀请码查询与创建                                                                        |
| DELETE   | `/api/admin/invitations/:id`          | 删除邀请码                                                                              |
| GET/POST | `/api/admin/connections`              | 查询摘要 / 创建 text、image、video 连接                                                 |
| PUT      | `/api/admin/connections/:id`          | 保存新版本；省略 secrets 保持已有凭据                                                   |
| GET      | `/api/admin/connections/:id/versions` | 分页版本摘要，不返回凭据                                                                |
| POST     | `/api/admin/connections/:id/revoke`   | `{ revisionId }` 显式撤销版本                                                           |
| GET/PUT  | `/api/admin/settings`                 | 运营设置与默认用途分配                                                                  |
| GET      | `/api/admin/deployment`               | 只读部署状态                                                                            |

图片连接支持 dashscope 与 OpenAI-compatible 两类，独立图片报价仅支持前者的白名单模型。用途字段为 defaultTextConnectionId、defaultImageConnectionId、defaultVideoConnectionId、workflowAgentConnectionId、workflowVideoConnectionId，详见 [配置指南](configuration.md)。

## ComfyUI（管理员）

全部位于 `/api/admin/comfyui`：

| 方法       | 后缀                                      | 用途                                                |
| ---------- | ----------------------------------------- | --------------------------------------------------- |
| GET        | `/status`、`/object-info`                 | 执行端状态、运行期节点定义                          |
| POST       | `/install`、`/start`、`/stop`、`/restart` | 平台托管本地进程生命周期；远端实例不由平台启动/重启 |
| POST       | `/prompt`                                 | 校验后登记执行意图并提交，返回 promptId、runId 等   |
| GET/POST   | `/queue`                                  | 队列查询/操作                                       |
| POST       | `/interrupt`、`/free`                     | 中断执行、释放资源                                  |
| GET        | `/history`、`/history/:promptId`          | 历史查询                                            |
| GET/POST   | `/workflows`                              | 工作流列表/保存                                     |
| GET/DELETE | `/workflows/:id`                          | 工作流读取/删除                                     |
| POST       | `/upload`                                 | 执行端文件上传                                      |
| GET        | `/view`                                   | 执行端媒体读取                                      |
| WebSocket  | `/ws`                                     | 鉴权执行事件代理，位于 server/routes                |

prompt 请求包含 prompt、可选 clientId/front/promptId/workflow/projectId。重试需复用完整请求与 promptId；服务端生成 ID 后丢失响应时不能凭空知道原 ID。平台私有连接由服务端生成，客户端不能注入平台连接配置。

## 保留的媒体地址

`GET /api/files/:id`、`GET /api/generations/:id/video` 保持受保护的历史媒体访问；`GET /api/comfyui/view` 仍需管理员。不存在旧 `POST /api/files` 或独立免费文本生成入口，不应按早期 ADR 调用。
