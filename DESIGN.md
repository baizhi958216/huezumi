# forkvdo 设计说明

本文记录当前已实现系统的架构与边界。未来需求和验收标准在 `spec/`，日常操作说明在 `docs/`，重要取舍在 `docs/decisions/`。

## 1. 系统上下文

forkvdo 将用户的文字和媒体输入转换为统一的生成请求，再由供应商适配器映射为上游协议。应用同时承担 Web UI、HTTP API、任务轮询和本地文件/任务持久化。

```text
Browser (Nuxt/Vue)
  ├─ GET  /api/providers ───────────────┐
  ├─ POST /api/files ──> Nitro storage  │
  └─ /api/generations ─> API + schema ─┼─> VideoProvider ─> vendor API
                              │         │
                              └─ records┘
```

这是一个 Nuxt 单体应用，不存在独立数据库和队列。Nitro storage 的 `data` mount 在本地映射到 `.data/`，Docker 中由 volume 持久化。

## 2. 分层职责

### 表现层

`app/` 负责页面、交互和展示。创作台从 `/api/providers` 获取能力，供应商、模型、画幅、时长和素材控件不应写死为某一家协议。

### HTTP 与编排层

`server/api/` 是信任边界：解析请求、执行 schema 与能力校验、调用领域服务、选择 HTTP 状态码并读写记录。API handler 不应包含复杂的供应商字段映射。

### 领域契约

`shared/types/generation.ts` 定义平台级请求、记录、状态和能力。`server/utils/generation-schema.ts` 是运行时输入校验，两者必须同步演进。

### 供应商层

每个适配器实现 `VideoProvider.submit()` 与 `VideoProvider.getTask()`。`catalog.ts` 是能力声明的唯一来源，`index.ts` 负责凭据探测和实例创建。上游状态、错误和用量必须在适配器内归一化。

### 持久化

- `generations:{id}`：完整的 `GenerationRecord`。
- `uploads:{id}:meta`：上传元数据。
- `uploads:{id}:data`：上传二进制内容。

当前存储适合单实例和原型部署。多实例部署前需要外部对象存储、共享数据库，以及避免重复轮询的任务协调机制。

## 3. 关键流程

### 创建任务

1. UI 依据供应商能力构造 `GenerationRequest`。
2. `POST /api/generations` 用 Zod 校验通用结构。
3. `assertRequestSupported` 校验供应商能力和组合规则。
4. 适配器提交上游任务并返回平台状态。
5. API 创建 UUID，持久化 `GenerationRecord` 后返回。

### 查询任务

列表和详情 API 读取本地记录。仅当状态为 `PENDING` 或 `RUNNING` 时查询供应商，并把归一化结果写回。查询接口当前兼有读和刷新副作用。

### 上传素材

上传 API 接收 multipart 文件，执行大小限制后保存到 Nitro storage，并返回公开读取 URL。供应商必须能访问该 URL，因此生产环境的 `NUXT_PUBLIC_APP_URL` 必须是公网 HTTPS 地址。

## 4. 数据与安全边界

- 所有密钥仅存在于服务端 runtime config。
- 不信任浏览器传入的 provider、model、URL、文件名和 MIME 类型。
- 当前文件读取 URL 不鉴权且使用长期公共缓存；它适合公开生成素材，不适合私密内容。
- 上游 URL 和错误文本进入记录前应避免携带凭据或敏感查询参数。
- CORS 当前对 `/api/**` 开放；引入账号或私密资产时必须重新设计鉴权和来源策略。

## 5. 扩展点

新增供应商时：

1. 在 `catalog.ts` 声明能力。
2. 新建适配器实现 `VideoProvider`。
3. 在 provider factory 与凭据探测中注册。
4. 在 `nuxt.config.ts` 和 `.env.example` 增加私有配置。
5. 为请求映射和状态归一化添加无网络测试。

若某项能力无法被现有 `GenerationRequest` 表达，应先扩展平台契约和 spec，而不是在页面中塞供应商专用字段。

## 6. 已知约束

- 尚无自动化单元/集成测试；当前 harness 覆盖文档、lint、类型和构建基线。
- 查询列表会并发刷新全部进行中任务，任务量增长后需要节流或后台 worker。
- 记录没有显式 schema version，契约演进需谨慎。
- 上传只按声明 MIME 选择大小上限，尚未做内容嗅探、病毒扫描、配额和清理。
- `GenerationRecord.videoArchived` 是预留字段，当前查询链路尚未实现结果视频归档。
