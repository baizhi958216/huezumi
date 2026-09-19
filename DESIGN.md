# 绘小宙设计说明

本文记录当前已实现系统的架构与边界。未来需求和验收标准在 `spec/`，日常操作说明在 `docs/`，重要取舍在 `docs/decisions/`。

## 1. 系统上下文

绘小宙（工程标识 forkvdo）是 Nuxt Web/API 与独立 worker 组成的多用户 AI 视频平台。浏览器只使用平台契约；供应商差异留在适配器中。

```text
Browser ──HTTPS──> Nuxt Web/API ─────────────> PostgreSQL
                       │                         帐号、会话、报价、钱包、任务、工作流、审计、outbox
                       ├──签名读写────────────> private OSS
                       └──publish─────────────> PostgreSQL / pg-boss
                                                   │
                                              generation worker
                                               ├──> provider APIs
                                               ├──> private OSS archive
                                               └──> billing settlement

Admin Browser ──authenticated HTTP/WS──> Nuxt proxy ──private network──> ComfyUI GPU service
```

PostgreSQL 是业务状态和账目的事实源，并通过 pg-boss 承担持久化调度，通过原子计数表承担限流。对象存储只保存媒体字节。生产环境要求 PostgreSQL 队列、私有对象存储和 remote ComfyUI，Web 请求不直接轮询供应商。

## 2. 身份、所有权与私密数据

帐号支持 `user`、`admin` 角色和 `active`、`disabled` 等状态。密码使用带随机盐的 scrypt 哈希；随机 session token 仅通过 HttpOnly、SameSite Cookie 下发，数据库只保存 token 摘要。管理员由部署命令创建，注册请求不能指定角色。

`generations`、`assets`、`workflows`、`comfy_executions` 均保存 `owner_id`。普通列表、详情和文件读取在服务端验证 owner；工作流读取允许 owner 或 `visibility=public`，公开工作流的更新和删除仍只允许 owner；管理 API 验证 admin。停用帐号时撤销其现有 session。修改请求执行同源检查，认证和生成入口另有 PostgreSQL 原子限流。

OSS 对象使用 private ACL，数据库保存 object key。浏览器经平台鉴权后获得短期 302 签名地址；报价和供应商提交前也由服务端把平台资产 URL 换成短期签名 URL，再执行要求公网 HTTPS 的能力校验。开发环境可用 `.data` 保存新上传字节，生产环境拒绝该回退。

## 3. 生成与计费流程

`shared/types/generation.ts` 定义平台级 `GenerationRequest` 和 `GenerationRecord`；Zod schema 在 HTTP 边界校验。供应商适配器只实现提交、查询与状态/用量归一化，能力源仍为 `server/services/providers/catalog.ts`。

生成采用报价后提交：

1. `POST /api/billing/quotes` 根据 provider、精确模型和分辨率选择已生效价格版本，生成绑定用户和请求摘要的十分钟报价。
2. `POST /api/runs` 按 kind 区分文本和视频，要求报价 ID 与幂等键。在带共享受理锁的事务中校验报价、用户并发与平台日预算，原子预留钱包额度，写任务、账本和 outbox。
3. outbox publisher 把任务 ID 发布到 pg-boss。重复消息由队列 job ID、任务条件更新、账本幂等键共同吸收。
4. worker 提交供应商并延迟轮询。明确失败时释放额度；提交结果不明或多次查询失败时进入 `review`，不自动再次提交。
5. 成功输出由 worker 下载并归档到用户 OSS 路径，然后原子结算钱包与流水。归档失败保留生成成功状态，可继续恢复归档且不会重复扣费。

价格公式是受限 JSON 数据，支持固定额度、输出秒、输入视频秒、参考图、最低消费和时长档位。已受理任务保留报价版本和预留值；管理员发布新版本不会改写历史任务。

## 4. PostgreSQL、迁移与兼容

Drizzle schema 位于 `server/database/schema.ts`，SQL migration 位于 `drizzle/`。部署先运行 `pnpm db:migrate`，应用进程不自行改 schema。该命令同时维护 pg-boss 的独立 `pgboss` schema；`rate_limit_buckets` 由 Drizzle 管理。队列失败重试、死信与恢复策略见 [ADR-004](docs/decisions/004-postgres-queue.md)。任务记录含 `schema_version`，工作流图保留自身 version。

`pnpm data:migrate -- --owner-email=<email>` 可把旧 `.data` 生成记录和上传元数据导入一个已存在的受控帐号。迁移不会自动把未知 owner 的历史数据暴露给新用户。旧的 Nitro generation service 已删除，历史导入入口仍保留。

## 5. ComfyUI 边界

生产环境只接受 `NUXT_COMFYUI_MODE=remote` 且必须配置 remote base URL。ComfyUI 使用独立 GPU Docker 镜像和模型卷，仅暴露在 Compose 私有网络。主 Node 镜像不安装 Git、Python、ComfyUI 或模型。

当前任意 ComfyUI 工作流只向管理员开放。所有 `/api/admin/comfyui/**` HTTP 端点和 WebSocket 都验证管理员 session 与来源；浏览器始终通过 Nuxt 代理访问。这样共享队列、全局 interrupt、节点文件候选项和执行事件不会暴露给普通用户。以后向普通用户开放时，需要先实现审核模板、节点白名单、资源预算和每次执行的 owner 输出映射。

图片创作模板位于 `workflows/image-creation.json`，将生图、原图编辑、遮罩重绘和用户自定义大模型连接组合在一张图中。执行逻辑位于 `comfyui/custom_nodes/forkvdo_prompt/`：提示词输出为通用 STRING，生成节点接标准 MODEL/CLIP/VAE，复用 ComfyUI 编码、采样和解码；不扩展平台生成/计费契约。工作流连接节点中的 API Key 随私有工作流保存，公开工作流禁止携带 Key。画布按 `/object_info` 的上传、强制连线、种子控件元数据渲染，文本执行输出统一展示，不识别具体节点类名。多参考图用于 LLM 理解，编辑只将指定原图送入扩散链路；局部重绘使用遮罩并合回未修改像素。

MiniMax H3 本地视频预设位于 `workflows/minimax-h3-*.json`，分别覆盖纯文生、单参考图、人物多角度一致性、首尾帧和图/视频/音频多素材 Ref2VA。预设复用 ComfyUI 官方 `MiniMaxH3ImageToVideo` / `MiniMaxH3ReferenceToVideo` 与标准视频采样节点，默认 960×544、124 帧和 Turbo LoRA；权重与第三方节点不随仓库分发，实际可用节点和模型候选项以运行期 `/object_info` 为准。

百炼 Wan 3.0 画布预设位于 `workflows/bailian-wan3-multimodal-reference.json`。正向、反向提示词各由一个通用文本节点提供，连线到生成节点；旧副本仍可直接使用生成节点内的文本。项目 ComfyUI 节点从执行进程的私有环境读取百炼连接，将可选的图、视频、音频文件上传到模型绑定的临时 OSS，提交异步视频任务并轮询，完成后保存到 ComfyUI output 目录，再接独立的视频输出节点供画布右侧预览。生成节点本身仍登记视频，兼容此前保存的四节点副本；同一文件在右侧只显示一次。此路径绕开平台生成报价与计费契约，仍只允许管理员执行；工作流 JSON 不保存 API Key。Wan 3.0 未声明独立反向提示词字段，画布把反向文本写成提示词中的避免约束。

作品库从 PostgreSQL 的 works 读取管理员自己的已登记图片和视频，列表不访问执行引擎。工作流提交前保存执行意图、固定 prompt ID 和可用画布快照；后台查询队列/历史，按执行与文件身份去重，再归档到用户私有对象存储。执行成功与归档状态分离，归档失败可按保存的文件身份重试。画布快照和归档媒体在引擎历史清理后仍可读取；无法找回的输出显示不可用，不伪造归档成功。工作流不写入视频 generations，也不扣平台额度。

提示词连接支持 Chat Completions 与 Responses，协议转换留在 Python 节点中。旧工作流缺省自动模式：只在 Chat Completions 明确返回 404/405 时改用同一连接的 Responses；鉴权、超时、限流和生成失败不触发协议切换。Responses 将规则与有序图文转换为相应输入，关闭远端状态保存，只接收完成后的文本并校验正负提示词。指定客户端限制通过受控错误提示呈现，不把上游原始响应或密钥暴露给画布。

开发环境使用 `docker-compose.dev.yml` 在本机回环地址提供 PostgreSQL 和 SeaweedFS，分别使用持久化卷。Nuxt 在宿主机运行并可同时启用 PostgreSQL worker；ComfyUI 安装到 `vendor/ComfyUI`，由现有本地进程管理器托管。Nuxt 初始化时后台探活，已运行则复用，本地已安装未运行则自动启动；未安装或失败时提示管理员处理，remote 模式只探活。该开发配置不改变生产的进程与 GPU 服务边界。

## 6. 管理面与运维

管理员控制面板提供概览、用户停启、额度调整、邀请码、价格版本、全部用户生成任务、异常任务核对/释放额度和审计记录。所有变更写 append-only 额度流水或审计日志，不修改历史流水。

`docker-compose.production.yml` 定义 PostgreSQL、migration、Web、worker 与 ComfyUI。Web 与 worker 使用同一应用镜像，通过 `NUXT_WORKER_ENABLED` 分工。worker 正常关闭时停止 pg-boss consumer；outbox 定时补发数据库中未发布事件。稳定 job ID 吸收重复派发，同一生成通过 singleton 队列策略与会话 advisory lock 串行处理。未知提交进入人工核对；终态只从已保存 URL 恢复归档，不再请求供应商。

仍需由实际部署环境完成的运维项目包括 PostgreSQL 备份恢复演练、OSS 生命周期和旧 public-read 对象清单、告警接入、供应商账单对账、目标 GPU 上的镜像与模型验证。这些属于上线验收，不能只凭本地构建视为通过。

普通用户的“我的空间”位于 `/dashboard`，展示额度汇总、额度流水、作品概览和模型资产元数据。个人资料与密码仍由 `/account` 管理，完整作品列表仍由 `/projects` 管理。模型资产元数据独立于普通媒体 `assets`，支持用户归属、来源、类型、状态和多文件模型包；当前阶段尚未启用模型上传、Civitai 下载或 ComfyUI 部署。

帐号页默认展示已保存的资料与资源摘要，通过「编辑资料」弹窗修改昵称与头像。管理后台的连接、运营设置、价格发布及额度调整同样按需打开弹窗，内容列表保留在页面；编辑草稿与摘要分离，取消不保存，失败保留输入。页面根节点隔离堆叠上下文，挂载到 body 的弹窗及下拉菜单可覆盖固定导航。

## 7. 工程事实源

文本创作使用独立的 `creative_projects`、`creative_documents` 与 `creative_document_versions`。正文版本是不可变派生输入，人物与场景结构和正文一同保存；现有视频 `GenerationRequest` 不承载文章字段。创作台默认在 `/studio` 打开文案剧本，视频和管理员图片工作流分别位于 `/studio/video`、`/studio/workflow`。文本生成通过私有 OpenAI 兼容连接异步生成内容版本，连接只向浏览器公开名称和模型。文本当前通过报价、额度预留与独立 worker 生成，详见第 8 节。

- `server/database/schema.ts` 与 `drizzle/`：业务数据和迁移。
- `shared/types/` 与运行时 schema：浏览器/API 契约。
- `server/services/providers/`：供应商能力和协议。
- `server/services/generation-worker.ts`：后台任务状态推进、归档和结算。
- `docker-compose.production.yml` 与 `docker/comfyui/Dockerfile`：生产进程边界。
- `harness/run.mjs`：单元测试、文档约束、lint、类型和构建验证入口。

## 8. 平台治理（2026-09-18）

视频与文本连接由管理员在 PostgreSQL 管理，不可变连接版本使用环境主密钥 AES-256-GCM 加密。报价绑定连接与价格版本；停用仅影响新报价，撤销影响引用该版本的未完成任务。运营设置以数据库为准，ComfyUI 独立配置不变，配置与迁移步骤见 [配置说明](docs/configuration.md)。

文本采用固定报价与 pg-boss 后台任务，版本保存和扣费在同一事务提交。未知提交进入核对，手动编辑通过基础版本检测冲突。新增 runs 作为执行身份，视频状态仍以 generations 为准；works 索引文档或媒体，作品读取不请求供应商或 ComfyUI。原有同步免费文本 MVP 已被此链路替代。

项目关联兼容旧数据，旧任务、链接及账目不改写；工作流先登记执行意图，再提交引擎，后台同步并归档输出。历史回填可重复执行，缺失历史不伪造作品。密钥、工作流原始图和正文不进入列表摘要。

## 9. 品牌与视觉

对外品牌为「绘小宙」，主张「创作属于自己的小宇宙」，围绕故事、角色设定、画面与视频展开。全站共享暖珊瑚色、奶油白、蜜桃色的语义令牌；界面辅助色为鹅黄与嫩绿；插画按题材使用独立配色，包括粉白、蓝青、翠绿与淡紫，不再限制为暖黄。深色模式为暖棕色。导航、表单、作品库与管理页面沿用同一套圆角和状态反馈。首页原创插画与示例文案明确为创意示意；角色设定复用文本创作，图像工作流仍仅限管理员。工程包名、存储前缀与旧路由保持兼容。

桌面鼠标使用透明品牌指针：普通区域为 40×40 透明画布内的短款珊瑚红箭头，可点击控件为 40×40 星球手形。通过 CSS cursor 与系统后备实现，不跟踪鼠标或添加尾迹；文本、禁用、拖拽等保留专用指针，触屏和强制颜色模式不启用。

首页采用插画手帐式章节排版：淡彩创作入口、错落白边画廊、虚线旅行步骤、胶囊式模型选项与参数面板、虚线问答和插画结尾。不同章节以留白、纸张与图像建立层次；创作台的功能表单仍按需要分组。样式集中在 `app/assets/css/home-editorial.css`。

## 10. 品牌视觉与语气

绘小宙以「创作属于你的小宇宙」连接故事、角色、画面与视频。全站使用奶油底色、珊瑚强调色、暖棕正文、圆润控件和柔和边框；深色模式复用暖色语义变量。首页以二次元概念插画和开放式手帐排版承载品牌，创作与管理页面保持内容和操作清晰。文案亲切具体，避免把角色一致性、输出质量等愿景描述成保证；示例插画标明 AI 概念用途。新的方向见 `spec/2026-09-19-little-universe-direction.md`。

首屏以用户确认的参考图为视觉依据：左侧两行主标题与三行引导文案，右侧大幅拱形插画、轻微倾斜的白边与贴签。主操作进入创作台，次操作「找一点灵感」定位页内灵感区；窄屏改为上下排列。

首屏七张 AI 概念插画以不对称拱形轮廓的错位卡片堆同时展示，新增用户参考角色的樱色场景、蓝色星海和翠绿绘本。点击露出的卡片或 imagegen 生成的两侧珊瑚红手绘箭头可循环切换。Vue 仅提供固定初始 CSS 变量，已有 GSAP 依赖独立管理卡片实时位置、抽卡、归位与贴签入场，避免更新时复位；快速操作转向最新选择，减少动态模式即时切换，卸载时清理动画。每图独立加载状态，当前图失败可重试。
