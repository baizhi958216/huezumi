# forkvdo 设计说明

本文记录当前已实现系统的架构与边界。未来需求和验收标准在 `spec/`，日常操作说明在 `docs/`，重要取舍在 `docs/decisions/`。

## 1. 系统上下文

forkvdo 将用户的文字和媒体输入转换为统一的生成请求，再由供应商适配器映射为上游协议。应用同时承担 Web UI、HTTP API、任务轮询和本地文件/任务持久化。

```text
Browser (Nuxt/Vue)
  ├─ GET  /api/providers ───────────────┐
  ├─ POST /api/files ──> Nitro storage ──> 阿里云 OSS（可选）
  └─ /api/generations ─> API + schema ─┼─> VideoProvider ─> vendor API
                              │         ├─> 结果归档 ─> 阿里云 OSS（可选）
                              └─ records┘

Browser (Nuxt/Vue)
  └─ /workflow ─> /api/comfyui/** ─> ComfyUI 进程（local / remote）
                            ├─> /object_info /prompt /history /ws …
                            └─> 工作流 JSON（持久化到 Nitro storage）
```

这是一个 Nuxt 单体应用，不存在独立数据库和队列。Nitro storage 的 `data` mount 在本地映射到 `.data/`，Docker 中由 volume 持久化。ComfyUI 自身不进入供应商目录（见 §8），浏览器通过 Nuxt 反向代理与它通信，ComfyUI 的监听端口不出现在客户端代码或文档中。

## 2. 分层职责

### 表现层

`app/` 负责页面、交互和展示。创作台从 `/api/providers` 获取能力，供应商、模型、画幅、时长和素材控件不应写死为某一家协议。供应商能力表示平台接入能力的并集；同一供应商下的模型差异由 `ModelSpec.capabilities` 覆盖，客户端通过 `resolveModelCapability` 得到当前模型的有效能力。

### HTTP 与编排层

`server/api/` 是信任边界：解析请求、执行 schema 与能力校验、调用领域服务、选择 HTTP 状态码并读写记录。API handler 不应包含复杂的供应商字段映射。

### 领域契约

`shared/types/generation.ts` 定义平台级请求、记录、状态和能力。`server/utils/generation-schema.ts` 是运行时输入校验，两者必须同步演进。

### 供应商层

每个适配器实现 `VideoProvider.submit()` 与 `VideoProvider.getTask()`。`catalog.ts` 是静态供应商能力声明源；`index.ts` 负责凭据探测、实例创建和模型级组合校验。上游状态、错误和用量必须在适配器内归一化。

### 持久化

- `generations:{id}`：完整的 `GenerationRecord`。
- `forkvdo/outputs/{id}.{ext}`：OSS 中的生成结果视频；`GenerationRecord.outputArchive` 保存归档状态。
- `uploads:{id}:meta`：上传元数据。
- `uploads:{id}:data`：上传二进制内容。
- `comfyui:workflows:index`：工作流摘要（`id` / `name` / `nodeCount` / `updatedAt`）。
- `comfyui:workflows:{id}`：单个工作流的完整图（`ComfyWorkflowJSON`）。

当前存储适合单实例和原型部署。多实例部署前需要外部对象存储、共享数据库，以及避免重复轮询的任务协调机制。

## 3. 关键流程

### 创建任务

1. UI 依据供应商能力构造 `GenerationRequest`。
2. `POST /api/generations` 用 Zod 校验通用结构。
3. `assertRequestSupported` 校验供应商能力和组合规则。
4. 适配器提交上游任务并返回平台状态。
5. API 创建 UUID，持久化 `GenerationRecord` 后返回。

### 查询任务

列表和详情 API 读取本地记录。状态为 `PENDING` 或 `RUNNING` 时查询供应商，并把归一化结果写回；任务成功后，服务端把供应商临时结果下载到受限临时文件并上传 OSS，再以 OSS URL 替换 `videoUrl`。成功但未归档的历史或失败记录可通过显式刷新重试，且不会重新提交生成任务。查询接口当前兼有读、刷新和结果归档副作用。

### 上传素材

上传 API 接收 multipart 文件，执行大小限制后保存到 Nitro storage；配置完整的阿里云 OSS 凭据后会再转存到 OSS，并返回 OSS 公网 URL，否则返回本地读取 URL。供应商必须能访问返回的 URL，因此 OSS 模式需要 Bucket / 对象允许公网读取；未启用 OSS 时生产环境的 `NUXT_PUBLIC_APP_URL` 必须是公网 HTTPS 地址。

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

## 6. ComfyUI 工作流模块

forkvdo 在 `/workflow` 提供一个独立的工作流编辑器，ComfyUI 本身被作为接口服务托管。

### 边界

- 平台侧 `GenerationRequest` 不感知 ComfyUI；ComfyUI 任务**不进入**供应商目录，不写 `GenerationRecord`，不接入作品库。
- 浏览器只与 `/api/comfyui/**` 通信：HTTP、文件二进制与 WebSocket 事件全部经 Nuxt 反向代理。
- 上游不可达 → `502`；就绪探测超时 → `504`；校验失败 → `422`；远程模式下本地启停/安装端点返回 `409`。错误响应不携带上游堆栈或凭据。

### 数据来源

- 节点定义来自 `GET /object_info`，运行时由服务端内存缓存；进程退出、安装完成或图片上传成功后失效缓存，`?refresh=1` 强制回源。
- 输入分类规则与 ComfyUI 官方前端一致：字符串数组 → COMBO；`INT/FLOAT/STRING/BOOLEAN` → 控件；其余 → 连线插槽。`KSampler/KSamplerAdvanced/PrimitiveNode` 的 `seed`/`noise_seed` 后追加纯前端控件 `control_after_generate`，不参与序列化。
- 连线类型校验：相同类型或任一端为 `*` 才允许。

### 图 → API 序列化

`shared/types/comfyui.ts#serializeGraphToApiPrompt` 对齐 `ComfyUI_frontend` 的 `graphToPrompt`：

- 跳过 `mode: 2`（NEVER）和 `mode: 4`（BYPASS）节点。
- 控件按声明顺序写入 `inputs[name]`；`control_after_generate` 跳过；数组值包成 `{ __value__: v }`。
- 连线输入写 `[源节点 id 字符串, 源插槽序号]`。
- 提交体携带 `extra_data.extra_pnginfo.workflow`，便于官方前端恢复图。

### 进程管理

- 进程句柄与安装日志挂在 `globalThis.__forkvdoComfyRuntime`，避免 Nitro HMR 重复拉起。
- 启动命令：`python main.py --listen <host> --port <port> --disable-auto-launch`，可选附加 `NUXT_COMFYUI_ARGS`。
- 就绪判定：轮询 `/system_stats`，默认 3 分钟；stdout/stderr 写入环形缓冲（最近 200 行），状态接口返回尾部 40 行。
- 停止：SIGTERM → 5 秒后 SIGKILL；进程自行退出时清理状态并失效 object_info 缓存。
- 重复启动：已存活则直接返回当前状态，不重复拉起。

### 持久化

工作流 JSON 落到 Nitro storage 的 `comfyui:workflows:*` 键；`id` 使用 UUID；图结构本身携带 `version: 1`，与 ComfyUI 官方 workflow 文件结构一致，便于互相导入导出。

### 不做的事

- 不实现 ComfyUI-Manager、自定义节点安装/卸载、模型下载。
- 不做多用户隔离、权限、配额；ComfyUI 自身无鉴权，假定运行在可信网络内。
- 不做像素级 ComfyUI 前端还原；只对齐数据模型与交互习惯。
- 不处理远程 ComfyUI 的 HTTPS 证书自定义与鉴权头。

## 7. 已知约束

- 尚无自动化单元/集成测试；当前 harness 覆盖仓库契约（必需文件、规格状态、内部文档链接和敏感运行时文件）、lint、类型和构建基线。
- 查询列表会并发刷新全部进行中任务，任务量增长后需要节流或后台 worker。
- 记录没有显式 schema version，契约演进需谨慎。
- 上传只按声明 MIME 选择大小上限，尚未做内容嗅探、病毒扫描、配额和清理。
- OSS 素材当前同时保留本地副本；尚未实现对象生命周期清理、私有素材签名 URL 和浏览器直传。
- 结果视频归档在查询请求中同步执行；任务量增长后需要迁移到后台 worker，并增加分片断点续传和孤儿对象清理。
- ComfyUI 工作流编辑器首版没有子图、节点分组、撤销/重做栈；控件顺序依赖 `object_info` 的声明顺序，少数官方节点的"可选控件排在必填控件之前"会导致导入时控件错位，已记录为已知限制。
- 工作流持久化按 UUID 命名；删除走显式接口，没有回收站。

## 8. 工程事实源

- `DESIGN.md` 与 `docs/` 描述当前已经实现的系统事实。
- `spec/` 记录变更当时的目标、验收和结果；已完成规格中的模型数量等信息是历史快照，不替代当前能力目录。
- `server/services/providers/catalog.ts` 是当前供应商与模型能力的代码事实源，README 只做面向使用者的汇总。
- `shared/types/comfyui.ts` 与 `server/services/comfyui/` 是 ComfyUI 模块的代码事实源；`/api/comfyui/**` 是浏览器唯一对接面。
- `harness/run.mjs` 是统一验证入口；它必须保持无真实凭据、无付费供应商调用、可在本地和 CI 重复运行。
