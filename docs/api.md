# HTTP API

所有路径由 Nitro 提供。私有 API 使用 `forkvdo_session` HttpOnly Cookie；未登录返回 401，普通用户访问管理或 ComfyUI 接口返回 403。修改请求执行同源校验。用户资源查询始终在服务端加入 owner 条件。

## 帐号

| 方法      | 路径                    | 说明                                                                        |
| --------- | ----------------------- | --------------------------------------------------------------------------- |
| GET       | `/api/auth/session`     | 当前会话与公开用户资料；未登录返回 `{ user: null }`                         |
| POST      | `/api/auth/register`    | `{ email, password, displayName, invitationCode? }`；注册模式由环境变量控制 |
| POST      | `/api/auth/login`       | 邮箱密码登录并设置安全 Cookie                                               |
| POST      | `/api/auth/logout`      | 删除当前 session 与 Cookie                                                  |
| GET/PATCH | `/api/auth/profile`     | 查询或修改昵称；头像仅接受当前用户上传的 `/api/files/:id` 图片路径          |
| POST      | `/api/auth/password`    | `{ currentPassword, newPassword }` 修改密码并撤销旧会话                     |
| GET       | `/api/billing/ledger`   | 当前用户额度流水                                                            |
| GET       | `/api/account/overview` | 当前用户额度、存储、作品和模型资产概览                                      |

`/api/account/overview` 的消耗统计只累计实际结算的 `charge` 流水；`available` 为余额减去预留额度。模型资产统计只包含当前用户未软删除的资产。

## 用户模型资产

| 方法 | 路径          | 说明                                                               |
| ---- | ------------- | ------------------------------------------------------------------ |
| GET  | `/api/models` | 当前用户自己的模型资产元数据列表；不返回 OSS key、密钥或运行时路径 |

模型资产的上传、Civitai 下载、OSS 存储和 ComfyUI 部署尚未在当前阶段开放；页面空状态不会触发外部模型流量。

## 报价与生成

`POST /api/billing/quote` 接收经平台 schema 验证的 `GenerationRequest`，返回报价 ID、预估额度、价格版本、来源说明和过期时间。规则缺失返回 422。

`POST /api/generations` 在生成请求中额外要求 `quoteId` 与 `idempotencyKey`。报价必须属于当前用户、未过期且请求摘要一致。接口原子预留额度并创建待派发任务；余额不足返回 402，并发超限返回 429，报价冲突返回 409。相同用户和幂等键重复提交相同请求时返回原任务，不再次预留或派发。

`GET /api/generations` 返回当前用户任务，按创建时间倒序。`GET /api/generations/:id` 返回当前用户单条任务。两者只读 PostgreSQL，不调用供应商。`POST /api/generations/:id/refresh` 只把已有供应商任务加入查询队列，不会重新提交生成。

返回记录的 `billing` 包含预估、实际扣费、价格版本与结算状态。对象存储 key、供应商密钥和上游原始错误不进入响应。

## 私有文件

`POST /api/files` 接收字段名为 `file` 的 multipart 上传。视频最大 100 MiB，其他素材最大 20 MiB，同时受用户存储上限约束。生产环境未配置 OSS 时返回 503；开发环境可回退到 `.data`。上传响应中的 `url` 仍是平台素材路径，报价和正式提交前会由服务端解析为短期 OSS 签名 HTTPS URL，再执行供应商的公网 HTTPS 校验。

`GET /api/files/:id` 验证 owner 或管理员。OSS 资产返回短期签名地址的 302；本地开发资产直接返回字节。私有响应使用 `no-store`。生成结果通过 `GET /api/generations/:id/video` 使用相同所有权和签名流程。

个人资料页的头像通过 `POST /api/files` 上传图片后再保存资料；资料接口会再次验证素材属于当前用户、未删除且为图片。头像不接受外部在线 URL。密码修改要求当前密码和至少 10 个字符的新密码，成功后当前请求会建立新 session，原有 session 全部失效。

## 供应商目录

`GET /api/providers` 返回平台能力目录和服务端启用状态，不返回凭据。请求结构以 `shared/types/generation.ts` 和 `server/utils/generation-schema.ts` 为准；供应商特有映射保留在 `server/services/providers/`。

## 管理 API

全部要求 admin：

| 方法     | 路径                                | 说明                                                 |
| -------- | ----------------------------------- | ---------------------------------------------------- |
| GET      | `/api/admin/overview`               | 用户、任务、资产、预算等概览                         |
| GET      | `/api/admin/users`                  | 用户、额度、存储和任务数量                           |
| PATCH    | `/api/admin/users/:id`              | 修改状态、角色或存储上限；停用会撤销会话             |
| POST     | `/api/admin/users/:id/credits`      | 通过调整流水增减额度                                 |
| POST     | `/api/admin/invitations`            | 创建一次性邀请码                                     |
| GET/POST | `/api/admin/pricing`                | 查询或发布不可变价格版本                             |
| GET      | `/api/admin/generations`            | 最近 200 个所有用户任务                              |
| POST     | `/api/admin/generations/:id/action` | `refresh` 核对，或带理由 `release`/`charge` 人工结算 |
| GET      | `/api/admin/audit`                  | 最近 200 条管理员审计记录                            |

## ComfyUI

当前所有 `/api/comfyui/**` 端点和 `/api/comfyui/ws` 仅管理员可用。HTTP 覆盖 status、object-info、prompt、history、queue、interrupt、free、upload、view 和工作流 CRUD；WebSocket 转发实时事件。生产 local/auto 配置返回服务配置错误，本地 install/start/stop 只服务开发环境。

`POST /api/comfyui/upload` 接收 multipart 字段 `file` 与 `kind`（`image`、`audio` 或 `video`），上传到 ComfyUI input 目录后失效节点定义缓存；工作流右侧检查器会根据选中加载节点的上传标记选择文件类型，并把返回文件名写回节点参数。

工作流保存到 PostgreSQL并绑定 owner；prompt ID 同步记录到 `comfy_executions`。共享实例的任意工作流尚未对普通用户开放。

工作流 CRUD 的列表会返回当前用户自己的记录和 `visibility=public` 的公开记录。摘要和详情额外返回 `visibility`（`private` / `public`）以及 `scope`（`mine` / `public`）；左侧“公开工作流”按 `visibility=public` 筛选，因此拥有者自己的公开工作流会同时出现在“我的工作流”和“公开工作流”中。公开工作流允许读取和载入，保存公开工作流时只能更新自己的记录，载入他人的公开工作流会在页面中按副本保存。`POST /api/comfyui/workflows` 可传 `visibility`，默认是私有；删除仍只允许工作流拥有者。

## 契约演进

修改 API 时同步共享类型、Zod schema、spec 与本文。数据库结构通过 `drizzle/` migration 演进；持久化 generation payload 带 `schemaVersion`，不兼容变更必须提供兼容读取或迁移。
