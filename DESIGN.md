# forkvdo 设计说明

本文记录当前已实现系统的架构与边界。未来需求和验收标准在 `spec/`，日常操作说明在 `docs/`，重要取舍在 `docs/decisions/`。

## 1. 系统上下文

forkvdo 是 Nuxt Web/API 与独立 worker 组成的多用户 AI 视频平台。浏览器只使用平台契约；供应商差异留在适配器中。

```text
Browser ──HTTPS──> Nuxt Web/API ─────────────> PostgreSQL
                       │                         帐号、会话、报价、钱包、任务、工作流、审计、outbox
                       ├──签名读写────────────> private OSS
                       └──publish─────────────> Redis / BullMQ
                                                   │
                                              generation worker
                                               ├──> provider APIs
                                               ├──> private OSS archive
                                               └──> billing settlement

Admin Browser ──authenticated HTTP/WS──> Nuxt proxy ──private network──> ComfyUI GPU service
```

PostgreSQL 是业务状态和账目的事实源。OSS 只保存媒体字节；Redis 只负责调度和限流。生产环境要求 Redis 队列、私有 OSS 和 remote ComfyUI，Web 请求不直接轮询供应商。

## 2. 身份、所有权与私密数据

帐号支持 `user`、`admin` 角色和 `active`、`disabled` 等状态。密码使用带随机盐的 scrypt 哈希；随机 session token 仅通过 HttpOnly、SameSite Cookie 下发，数据库只保存 token 摘要。管理员由部署命令创建，注册请求不能指定角色。

`generations`、`assets`、`workflows`、`comfy_executions` 均保存 `owner_id`。普通列表、详情和文件读取在服务端验证 owner；工作流读取允许 owner 或 `visibility=public`，公开工作流的更新和删除仍只允许 owner；管理 API 验证 admin。停用帐号时撤销其现有 session。修改请求执行同源检查，认证和生成入口另有 Redis/进程内限流。

OSS 对象使用 private ACL，数据库保存 object key。浏览器经平台鉴权后获得短期 302 签名地址；供应商提交前也由服务端把平台资产 URL 换成短期签名 URL。开发环境可用 `.data` 保存新上传字节，生产环境拒绝该回退。

## 3. 生成与计费流程

`shared/types/generation.ts` 定义平台级 `GenerationRequest` 和 `GenerationRecord`；Zod schema 在 HTTP 边界校验。供应商适配器只实现提交、查询与状态/用量归一化，能力源仍为 `server/services/providers/catalog.ts`。

生成采用报价后提交：

1. `POST /api/billing/quote` 根据 provider、精确模型和分辨率选择已生效价格版本，生成绑定用户和请求摘要的十分钟报价。
2. `POST /api/generations` 要求报价 ID 与幂等键。在 serializable 事务中校验报价、用户并发与平台日预算，原子预留钱包额度，写任务、账本和 outbox。
3. outbox publisher 把任务 ID 发布到 BullMQ。重复消息由队列 job ID、任务条件更新、账本幂等键共同吸收。
4. worker 提交供应商并延迟轮询。明确失败时释放额度；提交结果不明或多次查询失败时进入 `review`，不自动再次提交。
5. 成功输出由 worker 下载并归档到用户 OSS 路径，然后原子结算钱包与流水。归档失败保留生成成功状态，可继续恢复归档且不会重复扣费。

价格公式是受限 JSON 数据，支持固定额度、输出秒、输入视频秒、参考图、最低消费和时长档位。已受理任务保留报价版本和预留值；管理员发布新版本不会改写历史任务。

## 4. PostgreSQL、迁移与兼容

Drizzle schema 位于 `server/database/schema.ts`，SQL migration 位于 `drizzle/`。部署先运行 `pnpm db:migrate`，应用进程不自行改 schema。任务记录含 `schema_version`，工作流图保留自身 version。

`pnpm data:migrate -- --owner-email=<email>` 可把旧 `.data` 生成记录和上传元数据导入一个已存在的受控帐号。迁移不会自动把未知 owner 的历史数据暴露给新用户。旧的 Nitro generation service 已退出运行调用链，仅作为迁移前历史实现保留。

## 5. ComfyUI 边界

生产环境只接受 `NUXT_COMFYUI_MODE=remote` 且必须配置 remote base URL。ComfyUI 使用独立 GPU Docker 镜像和模型卷，仅暴露在 Compose 私有网络。主 Node 镜像不安装 Git、Python、ComfyUI 或模型。

当前任意 ComfyUI 工作流只向管理员开放。所有 `/api/comfyui/**` HTTP 端点和 WebSocket 都验证管理员 session 与来源；浏览器始终通过 Nuxt 代理访问。这样共享队列、全局 interrupt、节点文件候选项和执行事件不会暴露给普通用户。以后向普通用户开放时，需要先实现审核模板、节点白名单、资源预算和每次执行的 owner 输出映射。

图片创作模板位于 `workflows/image-creation.json`，将生图、原图编辑、遮罩重绘和用户自定义大模型连接组合在一张图中。执行逻辑位于 `comfyui/custom_nodes/forkvdo_prompt/`：提示词输出为通用 STRING，生成节点接标准 MODEL/CLIP/VAE，复用 ComfyUI 编码、采样和解码；不扩展平台生成/计费契约。工作流连接节点中的 API Key 随私有工作流保存，公开工作流禁止携带 Key。画布按 `/object_info` 的上传、强制连线、种子控件元数据渲染，文本执行输出统一展示，不识别具体节点类名。多参考图用于 LLM 理解，编辑只将指定原图送入扩散链路；局部重绘使用遮罩并合回未修改像素。

## 6. 管理面与运维

管理员控制面板提供概览、用户停启、额度调整、邀请码、价格版本、全部用户生成任务、异常任务核对/释放额度和审计记录。所有变更写 append-only 额度流水或审计日志，不修改历史流水。

`docker-compose.production.yml` 定义 PostgreSQL、Redis、migration、Web、worker 与 ComfyUI。Web 与 worker 使用同一应用镜像，通过 `NUXT_WORKER_ENABLED` 分工。worker 正常关闭时停止 BullMQ consumer；outbox 定时补发数据库中未发布事件。

仍需由实际部署环境完成的运维项目包括 PostgreSQL 备份恢复演练、OSS 生命周期和旧 public-read 对象清单、告警接入、供应商账单对账、目标 GPU 上的镜像与模型验证。这些属于上线验收，不能只凭本地构建视为通过。

普通用户的“我的空间”位于 `/dashboard`，展示额度汇总、额度流水、作品概览和模型资产元数据。个人资料与密码仍由 `/account` 管理，完整作品列表仍由 `/projects` 管理。模型资产元数据独立于普通媒体 `assets`，支持用户归属、来源、类型、状态和多文件模型包；当前阶段尚未启用模型上传、Civitai 下载或 ComfyUI 部署。

## 7. 工程事实源

- `server/database/schema.ts` 与 `drizzle/`：业务数据和迁移。
- `shared/types/` 与运行时 schema：浏览器/API 契约。
- `server/services/providers/`：供应商能力和协议。
- `server/services/generation-worker.ts`：后台任务状态推进、归档和结算。
- `docker-compose.production.yml` 与 `docker/comfyui/Dockerfile`：生产进程边界。
- `harness/run.mjs`：单元测试、文档约束、lint、类型和构建验证入口。
