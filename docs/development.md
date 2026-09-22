> 2026-09-18：平台连接、文本价格和运营参数已迁入管理后台；部署和旧配置导入以 [configuration.md](configuration.md) 为准。下文 ComfyUI 参数仍适用于独立执行端。

# 开发与部署指南

## 本地环境

需要 Node.js 22.12 或更新版本、pnpm 10、Docker Compose。Nuxt 和项目内的 ComfyUI 使用宿主机进程；PostgreSQL 和 SeaweedFS 使用开发 Compose。

```bash
pnpm install
# 仅首次创建；已有 .env 请合并配置，保留供应商密钥
cp -n .env.example .env
docker compose -f docker-compose.dev.yml up -d
# 等待 postgres / seaweedfs healthy
docker compose -f docker-compose.dev.yml ps -a
# CLI 不会自动加载 .env；用 Node 加载，避免 shell 解析 JSON 等配置
node --env-file=.env --import tsx scripts/db-migrate.ts
node --env-file=.env --import tsx scripts/admin-create.ts --email=admin@example.com --password='replace-with-a-long-password' --name=管理员
pnpm dev
```

所有帐号和任务 API 都需要 PostgreSQL。首次管理员通过 `admin:create` 对应脚本创建；已有管理员无需重复创建（重复执行会重置该帐号密码）。默认注册模式是 `invite`，登录后在控制面板生成邀请码；开发时可在管理后台将注册方式设为 open。

### 本机热更新开发

`.env.example` 默认使用以下本机连接配置。修改密码或端口时，同时更新 Compose 变量和对应的 Nuxt 地址；密码含 URL 特殊字符时，数据库 URL 中的密码需要百分号编码。

```dotenv
POSTGRES_DB=huezumi
POSTGRES_USER=huezumi
POSTGRES_PASSWORD=change-me-local-only
POSTGRES_HOST_PORT=55432
NUXT_DATABASE_URL=postgresql://huezumi:change-me-local-only@127.0.0.1:55432/huezumi
NUXT_WORKER_ENABLED=true
NUXT_COMFYUI_MODE=local
NUXT_COMFYUI_DIR=./vendor/ComfyUI
NUXT_COMFYUI_PYTHON=./vendor/ComfyUI/.venv/bin/python
```

本机由同一个 Nuxt 进程提供 Web/API 和 PostgreSQL worker，生产仍将 Web 与 worker 分开。所有环境的队列均持久化到 PostgreSQL；不再提供 Redis 或进程内 inline 调度。仅启动 Web 时将 `NUXT_WORKER_ENABLED=false`，任务等待独立 worker 消费。

两个服务仅映射到 `127.0.0.1`：PostgreSQL `55432`、SeaweedFS S3 API `9100`、控制台 `9101`。PostgreSQL 和 SeaweedFS 各用独立 volume；`docker compose -f docker-compose.dev.yml stop` 停止服务但保留数据，不要使用 `down -v` 清除已有开发数据。

启动 Nuxt 时会在后台自动检查 ComfyUI：已运行则复用，本地已安装但未运行则自动启动，正在启动则等待原任务。检查不会阻塞其他页面；未安装或启动失败会在终端提示，管理员可进入 `/studio/workflow` 查看状态并重试。首次仍需点“安装 ComfyUI”并安装依赖，后端克隆到 `vendor/ComfyUI`、创建 `.venv`；完成后点“启动 ComfyUI”，之后启动项目会自动带起服务。remote 模式只探活，不启动本地进程。项目自定义节点会在启动时挂载，浏览器通过鉴权代理访问。安装需要 Git、Python 和网络，PyTorch 首次下载可能较久。已有仓库和虚拟环境会被复用；模型权重需要另外放入 `vendor/ComfyUI/models/`，不会自动下载。

也可以按照 [ComfyUI 官方手动安装指南](https://docs.comfy.org/installation/manual_install) 提前安装到上述目录。Apple Silicon 使用宿主机 PyTorch 的 MPS，实际可用性以 `/system_stats` 为准；无模型时只能验证服务与节点，不能执行需要权重的生成。

### 本地对象存储（SeaweedFS）

开发 Compose 使用固定版本 `chrislusf/seaweedfs:4.46` 的 `weed mini`，在单个容器内运行对象存储和管理界面，自动创建启用认证的 bucket，不再依赖 MinIO / mc。选择理由与 RustFS 对比见 [ADR-003](./decisions/003-seaweedfs-local-storage.md)。

```bash
docker compose -f docker-compose.dev.yml up -d --wait seaweedfs
```

`.env` 中的 Nuxt 凭据必须与 Compose 的 `LOCAL_OSS_*` 一致，空凭据会在 Compose 配置阶段报错：

```dotenv
LOCAL_OSS_ACCESS_KEY_ID=huezumi-local
LOCAL_OSS_ACCESS_KEY_SECRET=replace-with-a-long-local-secret
LOCAL_OSS_BUCKET=huezumi
LOCAL_OSS_API_PORT=9100
LOCAL_OSS_CONSOLE_PORT=9101
NUXT_OSS_ACCESS_KEY_ID=huezumi-local
NUXT_OSS_ACCESS_KEY_SECRET=replace-with-a-long-local-secret
NUXT_OSS_BUCKET=huezumi
NUXT_OSS_REGION=us-east-1
NUXT_OSS_ENDPOINT=http://127.0.0.1:9100
NUXT_OSS_SECURE=false
NUXT_OSS_PUBLIC_BASE_URL=
```

管理界面是 <http://127.0.0.1:9101>，使用同一组 `LOCAL_OSS_ACCESS_KEY_ID` / `LOCAL_OSS_ACCESS_KEY_SECRET` 登录。S3 API 是 <http://127.0.0.1:9100>；两个端口仅绑定本机。容器内 S3 / Admin 端口为 9000 / 9001，master / filer 等内部接口不映射到宿主机，WebDAV、Iceberg 与 Lance 已关闭。健康检查通过 `/healthz` 验证 S3 服务就绪。

对象和 SeaweedFS 内部元数据都在 `huezumi-seaweedfs-dev` volume（实际名称带 Compose 项目前缀）。备份应在停写并停止服务后复制整个卷；只备份业务 PostgreSQL 不包含素材。修改初始化凭据后，应在管理界面同步已有身份并验证旧凭据是否已撤销，不能把环境变量变更当成凭据轮换。

从 MinIO 切换：先停写并检查原 bucket；非空时启动 SeaweedFS 临时端口，通过 S3 SDK / AWS CLI 复制全部对象，保留 key、Content-Type、Cache-Control 等元数据并校验大小和内容，再切换端点。两者底层格式不兼容，不得挂载同一个数据卷。旧容器可停止、移除，但保留备份；不要运行 `down -v`。

本地 HTTP 地址不能供要求公网 HTTPS 的云供应商读取。真实供应商素材测试需单独配置可访问的 HTTPS 存储；阿里云 OSS 配置与现有 SDK 适配继续支持。

## 数据库、队列与 worker

核心配置：

```dotenv
NUXT_DATABASE_URL=postgresql://huezumi:password@127.0.0.1:5432/huezumi
NUXT_WORKER_ENABLED=false
NUXT_WORKER_CONCURRENCY=4
NUXT_USER_MAX_ACTIVE_GENERATIONS=3
NUXT_PLATFORM_DAILY_CREDIT_BUDGET=100000
```

Web 进程设置 `NUXT_WORKER_ENABLED=false`；worker 进程使用相同构建和配置并设置为 `true`。worker 消费 pg-boss 队列，并每三秒扫描 transactional outbox。任务延迟轮询 12 秒，最多尝试 5 次，指数退避；死信处理将未终结的生成转入人工核对。同一生成通过队列 singleton 策略和 PostgreSQL advisory lock 串行执行；锁占用会重试。

`db:migrate` 同时显式创建 / 升级 `pgboss` schema；应用运行期不会自动改 schema。已完成 job 保留 7 天，排队 / 重试 job 默认最多保留 14 天，pg-boss 定期维护；长期停机后应核对并恢复未完成生成。失败队列记录也保存在 PostgreSQL。限流计数保存在 `rate_limit_buckets`，采用原子 UPSERT、到期重置，每分钟最多清理 1000 个过期条目。业务数据库连接 / SQL 等待限制为 5 秒，失败时认证入口返回受控 503。

从旧 Redis / inline 版本迁移，先停掉全部旧 Web / worker 并备份数据库，再执行：

```bash
node --env-file=.env --import tsx scripts/db-migrate.ts
node --env-file=.env --import tsx scripts/recover-generation-queue.ts --dry-run
# 确认所有旧 worker 已停止，再将预览中的任务恢复到 PostgreSQL
node --env-file=.env --import tsx scripts/recover-generation-queue.ts --apply
pnpm dev
```

恢复脚本根据数据库重建 queued 和已提交任务的轮询；遗留 submitting 只进入 review，不自动再次调用供应商。已成功但未归档的记录仅使用已保存 URL 重试归档。旧 `NUXT_QUEUE_MODE`、`NUXT_REDIS_URL` 和 `REDIS_HOST_PORT` 应从环境配置中移除。旧服务停止后可移除容器，保留旧数据卷；本机首次配置没有历史生成任务。架构取舍见 [ADR-004](./decisions/004-postgres-queue.md)。

修改 `server/database/schema.ts` 后运行 `pnpm db:generate`，检查生成 SQL，再运行 `pnpm db:migrate`。迁移旧 `.data` 前先建受控 owner 帐号并备份：

```bash
pnpm data:migrate -- --owner-email=legacy-owner@example.com --data-dir=.data
```

如果旧作品记录已经丢失、但结果视频仍在旧阿里云 OSS 的 `huezumi/outputs/` 下，可先执行只读预览，再导入到指定帐号。脚本只创建缺失的历史记录，不删除或覆盖 OSS 对象；由于 OSS 对象不含提示词和模型元数据，恢复记录会明确标记这些字段未恢复。

```bash
pnpm data:restore-oss -- --owner-email=owner@example.com --dry-run
pnpm data:restore-oss -- --owner-email=owner@example.com
```

脚本只读取明确的 `HUEZUMI_LEGACY_*` 配置（如 `HUEZUMI_LEGACY_ACCESS_KEY_ID`、`HUEZUMI_LEGACY_BUCKET`），不从当前存储连接猜测历史凭据。导入前应确认当前帐号就是历史作品的归属帐号，并保留数据库备份。

迁移脚本按现有 ID 幂等导入，不会猜测历史数据归属。

## 私有 OSS

生产上传和结果归档要求以下配置完整：

```dotenv
NUXT_OSS_ACCESS_KEY_ID=
NUXT_OSS_ACCESS_KEY_SECRET=
NUXT_OSS_BUCKET=
NUXT_OSS_REGION=cn-beijing
NUXT_OSS_ENDPOINT=
NUXT_OSS_SECURE=true
NUXT_OSS_PREFIX=huezumi/uploads
NUXT_OSS_OUTPUT_PREFIX=huezumi/outputs
NUXT_OSS_SIGNED_URL_TTL_SECONDS=86400
```

服务端为对象写 private ACL。数据库保存 object key，浏览器与供应商按需取得短期签名 URL。Bucket/Endpoint 必须允许供应商在签名有效期内通过公网 HTTPS 读取；应在真实供应商测试中验证 HEAD、Range、重定向和排队最长时长。`NUXT_OSS_PUBLIC_BASE_URL` 只影响上传结果展示地址，不替代签名服务。

切换历史公开对象时，需要另行盘点并清除 object ACL、Bucket policy 和 CDN 缓存。仅部署新代码不会撤销旧公开 URL 已产生的副本。

## 价格与额度

首次 migration 会写入覆盖各 provider 的内部兜底规则，来源标签明确为部署前需复核。管理员应依据供应商帐号、地域和合同价在控制面板发布更精确的 provider/model/resolution 版本。规则支持：

- `fixedCredits`
- `outputSecondCredits`
- `inputVideoSecondCredits`
- `referenceImageCredits`
- `minimumCredits`
- `durationTiers`

每次提交先报价，再在事务中预留额度。平台额度是内部计量单位，不自动等同人民币或美元。上线收费前必须复核每个启用模型的官方采购方式和账单样例。

## ComfyUI GPU 服务

主 Dockerfile 只运行 Node 应用。生产环境必须使用独立 GPU 服务：

```dotenv
NUXT_COMFYUI_MODE=remote
NUXT_COMFYUI_REMOTE_BASE_URL=http://comfyui:8188
```

`docker/comfyui/Dockerfile` 固定 PyTorch/CUDA 基础镜像和 `COMFYUI_REF`；`docker-compose.production.yml` 把模型目录只读挂载，并让 8188 只在 Compose 网络暴露。启动：

```bash
POSTGRES_PASSWORD='replace-me' \
COMFYUI_MODELS_DIR='/absolute/path/to/models' \
docker compose -f docker-compose.production.yml up -d --build
```

目标机器必须安装 NVIDIA Container Toolkit，并在上线前实测 GPU、驱动、PyTorch、ComfyUI 版本和所需模型。主应用生产环境若使用 local/auto 或 remote URL 为空，会拒绝初始化 ComfyUI 配置。开发环境仍可使用 local/auto 安装与启动流程。

### ComfyUI 图片创作工作流

内置 [图片创作工作流](../workflows/image-creation.json) 将大模型连接、生图、原图编辑和遮罩局部重绘合为十个节点。它替代两个 Anima 大模型模板，用户已保存的旧工作流不删除。完整的节点、模式、安装和模型兼容说明见 [节点包指南](../comfyui/custom_nodes/huezumi_prompt/README.md)。

- 更新包后重启 ComfyUI，再刷新节点定义；已有副本先保存修改，再重新载入以显示新增控件。默认 checkpoint 是本机已有模型；其他环境需在模型节点重新选择已安装的兼容 SD1.5/SDXL checkpoint。
- 单张/多张图片进入图片集合；需求通过独立文本节点连入大模型；正负提示词可追加或替换。多参考图只帮助 LLM 理解，编辑时仅指定原图进入扩散模型。
- 大模型支持两种方式：模板中的“③ 大模型连接”节点填写兼容 Chat Completions / Responses 的地址、API Key、模型和视觉能力；或者由执行端配置私有 `NUXT_COMFYUI_LLM_CONNECTIONS_JSON` / `HUEZUMI_LLM_CONNECTIONS_JSON`。`api_protocol`（环境连接使用 `apiProtocol`）可选 `auto`、`chat_completions`、`responses`；缺省在 Chat Completions 返回 404/405 时尝试 Responses，保留旧工作流控件顺序。连接节点中的 Key 会保存到工作流 JSON，含 Key 的工作流必须保持私有，导出时也会包含 Key。
- Responses 支持有序参考图与 JSON/SSE 完成结果；不把断流或失败内容交给生图节点。部分中转服务只允许指定客户端：例如 AnyRouter 的 GPT 模型要求 Responses，但仍可能以 `invalid codex request` 拒绝通用 HTTP 请求。节点会明确提示这种限制，不伪装客户端或自动更换用户模型。具体排查见[节点包指南](../comfyui/custom_nodes/huezumi_prompt/README.md#anyrouter-排查)。
- 模板默认改为使用工作流连接；如果不配置连接，可切换 `manual`，直接使用需求文本。`refresh_token` 变化或上传图片内容变化使提示词缓存失效。
- 局部重绘必须上传与原图同尺寸的黑白遮罩，白改黑留；黑色区域以原图像素合回。整图编辑不保证人物完全一致。不同架构模型需匹配的 loader/专用生成链路，平台不自动下载或承诺任意模型兼容。
- 工作流右侧输出图片按原始比例完整显示；点击图片在弹窗中查看大图，支持关闭按钮、点击遮罩和 Escape 返回。图片仍通过原有鉴权代理读取，加载失败时可关闭重试或在新窗口打开原图。

### ComfyUI Qwen Image 2.1 生图与编辑工作流

公开工作流库内置 [Qwen Image 2.1 文生图](../workflows/qwen-image-2.1-text-to-image.json) 和 [Qwen Image 2.1 智能多图创作与编辑](../workflows/qwen-image-2.1-multi-image-edit.json)。文生图模板默认使用 1344×768 壁纸画布、40 步、CFG 1、Euler + Simple。智能多图模板把参考图集中在一个可动态添加/移除的节点里，再由 `HuezumiQwenImage21Agent` 接收普通自然语言、自动判断从零创作或编辑主图、分配图片角色并生成 Qwen 指令。API 地址、Key 和 Agent 模型统一保存在 ComfyUI 执行端的 `image_agent` 连接中，不进入公开工作流 JSON。Agent 是可选的：禁用后，图片准备节点会用单图编辑/多图创作的默认规则运行，编码节点中手写的 prompt 与 negative prompt 会作为回退值；多图编辑时可把图片准备模式手动设为 `edit`。

从零创作时 Agent 会自动在参考素材前插入独立目标画布，并按需求选择 1:1、4:3、3:4、16:9 或 9:16；因此透明 Logo 和超宽品牌素材不再决定成图比例，最多可再上传 9 张参考图。编辑需求仍把上传图1作为主图。若后端没有 Agent 连接，节点会明确使用离线规则整理指令和禁止默认拼贴，但不声称已经联网。后端连接设置 `webSearch=true` 时只走 Responses `web_search`；不支持该工具的 OpenAI-compatible 服务必须关闭此项。工作流中的 Qwen3-VL `CLIPLoader` 只负责生成扩散条件，不能复用为会输出策划文本的 Agent；如需使用 Qwen 文本/视觉模型，应将其单独部署为 OpenAI-compatible Instruct 服务并配置为 `image_agent`。模板默认增加 `QwenImage21Cache(cpu/int8)`，参考图编码分辨率和采样步数降为 768/20，以减少多图任务在共享内存设备上的换页；最终交付可再提高。

两个模板都先保存 PNG，再连接到独立输出预览节点。智能多图模板在解码后增加透明度控制：只有自然语言明确要求透明底、抠图或 alpha 时保留 RGBA；普通需求保存为完全不透明的 RGB PNG，不能把“使用 RGBA VAE”误解成“默认透明”。

工作流使用 ComfyUI 原生 `TextEncodeQwenImage21` 节点和官方 INT8 ConvRot 权重。编辑模板打开后需先在两个 `LoadImage` 节点上传主图和参考图；官方能力支持最多 10 张参考图。生产 ComfyUI 基线为 `v0.37.0`；旧本地安装必须先更新 ComfyUI，否则画布会把 Qwen 2.1 编码节点显示为缺失。

模型文件不随仓库下载，需要从 [Comfy-Org/Qwen-Image-2.1](https://huggingface.co/Comfy-Org/Qwen-Image-2.1) 放到对应目录：

```text
models/diffusion_models/qwen_image_2.1_int8_convrot.safetensors
models/text_encoders/qwen3vl_8b_int8_convrot.safetensors
models/vae/qwen_image_2.1_vae_bf16.safetensors
```

模板保存为 PNG，可保留模型生成的 alpha 通道。透明图建议把提示词写成 `This is an RGBA image with transparency. [主体描述]. The image has alpha channel and the background is transparent.`。反向提示词在 CFG 1 时不参与引导；需要使用反向提示词时才提高 CFG，但会增加计算量。模型权重采用 Qwen Research License，商业使用前必须单独核对并取得所需授权。

### 百炼 Wan 3.0 API 视频工作流

内置 [Wan 3.0 多模态参考视频工作流](../workflows/bailian-wan3-multimodal-reference.json) 默认带独立正向、反向提示词节点，以及参考图、参考视频、参考音频节点。两条提示词连线接入生成节点；参考素材可以留空、断开或删除，全部留空时是文生视频。生成节点后接“视频输出 · 生成后预览”节点，完成后在右侧输出区显示可播放 MP4，并可打开原文件；旧四/五节点副本仍可使用生成节点内的提示词并预览。画布提供随机种子、480P/720P/1080P、比例、时长及声音、智能改写、水印、等待时长。Wan 3.0 API 没有独立反向提示词参数，因此反向文本会追加到正向提示词，作为“避免出现”约束。

本地 ComfyUI 由 Nuxt 启动时读取 `NUXT_DASHSCOPE_API_KEY`、`NUXT_DASHSCOPE_WORKSPACE_ID`、`NUXT_DASHSCOPE_REGION`，并只传给执行进程。生产 remote ComfyUI 在 Compose 中使用 `DASHSCOPE_API_KEY`、`DASHSCOPE_WORKSPACE_ID`、`DASHSCOPE_REGION`；在其他部署方式中直接设置执行进程的 `HUEZUMI_DASHSCOPE_*` 环境变量。密钥不会写入工作流 JSON。地域、业务空间、模型和 Key 需要一致；默认模型是 `wan3.0-video-prime`，可改为 `wan3.0-video`。修改配置后重启 ComfyUI。

已选素材会先上传到百炼模型绑定的临时 OSS，再提交异步任务。临时素材 48 小时过期，结果链接 24 小时过期，节点会立即下载结果并留在 ComfyUI output。参考视频/音频长度、视频帧率和“输入视频总时长 + 输出时长 ≤30 秒”等细项由百炼校验；重复手动运行会创建新的收费任务。此工作流仍只开放给管理员，真实执行会产生百炼费用。详见 [规格](../spec/2026-09-16-bailian-wan3-comfy-workflow.md)。

已成功的工作流视频也会显示在管理员自己的 `/projects` 作品库“工作流视频”区域。列表从 `comfy_executions` 和 ComfyUI 历史恢复，包括功能上线前已执行的任务；同一个视频只显示一次。卡片只展示封面，点击后在弹窗中播放，关闭弹窗即停止播放。历史含生成时画布快照的作品可在弹窗点“查看原始工作流”，编辑器会还原当时节点与连线，保存时创建私有副本。播放和快照读取依赖 ComfyUI 正在运行且历史/output 卷仍保留；此路径尚未将工作流结果归档到 OSS。

### ComfyUI MiniMax H3 本地视频预设

项目内置五个 H3 工作流，工作流库会自动发现它们：

- [纯文生 T2VA](../workflows/minimax-h3-text-to-video.json)
- [单参考图 Ref2VA](../workflows/minimax-h3-reference-image.json)
- [人物一致性（多角度）](../workflows/minimax-h3-character-consistency.json)
- [首尾帧 FL2VA](../workflows/minimax-h3-first-last-frame.json)
- [多素材（图片 + 视频 + 音频）Ref2VA](../workflows/minimax-h3-multi-material.json)

这些图要求较新的 ComfyUI 核心节点（`MiniMaxH3ImageToVideo`、`MiniMaxH3ReferenceToVideo`、`GetVideoComponents`）和 MiniMax H3 本地权重。默认参数为 960×544、124 帧、24 fps：适合 M5 Pro 48 GB 先做预览；确认构图后可把宽高切换到官方 768p（例如 1344×768），并按需要关闭 Turbo LoRA、改用 8/20 步质量档。模型文件放在 ComfyUI 的 `models/` 对应目录，文件名可直接从节点里的候选项核对：

```text
models/diffusion_models/minimax_h3_fl2va_pruned_int8_convrot.safetensors
models/diffusion_models/minimax_h3_ref2va_pruned_int8_convrot.safetensors
models/text_encoders/qwen3vl_32b_minimax_h3_nvfp4_awq.safetensors
models/vae/minimax_h3_video_vae_fp16.safetensors
models/vae/minimax_h3_audio_vae_fp32.safetensors
models/loras/minimax_h3_fl2v_turbo_8step_v1.0_comfyui_bf16.safetensors
models/loras/minimax_h3_ref2v_turbo_4step_v0.1_comfyui_bf16.safetensors
```

预设不自动下载权重或第三方节点；若 `/object_info` 中没有 H3 节点，画布会将其显示为缺失节点，需先更新本地 ComfyUI。Ref2VA 提示词按接入顺序使用 `<Picture 1..9>`、`<Video 1..3>`、`<Audio 1..3>`；多素材预设中的参考视频先由 `GetVideoComponents` 拆成视频帧和配套音频。详细边界与验收记录见 [H3 工作流规格](../spec/2026-09-12-minimax-h3-comfy-workflows.md)。

当前 ComfyUI 的 `SaveVideo` 使用动态下拉控件 v3 声明 `format` 与 `codec`；平台按运行期 `/object_info` 显示并序列化这些字段。旧工作流副本没有保存新增控件值时使用当前节点的首个合法选项（通常为 `auto`）。

节点测试不依赖 GPU 或真实凭据，使用已有 ComfyUI Python 环境：

```bash
PYTHONDONTWRITEBYTECODE=1 vendor/ComfyUI/.venv/bin/python comfyui/custom_nodes/huezumi_prompt/test_workflow.py
pnpm check:full
```

## 供应商配置

各供应商 API Key 仍从私有 Nuxt runtime config 读取，详见 `.env.example`。素材先写个人空间，报价和 worker 提交前都将 `/api/files/:id` 换成有时效的 OSS 签名地址，再校验供应商要求的公网 HTTPS；供应商输出由 worker 归档后才作为平台长期结果。

## 验证

```bash
pnpm check
pnpm check:full
pnpm test:postgres
```

`check` 执行仓库文档约束、计费/幂等纯函数测试、ESLint 和 TypeScript；`check:full` 再执行 production build。`test:postgres` 创建随机独立测试库，验证队列、恢复、限流和终态边界，结束后删除，要求本机数据库帐号有创建数据库权限；默认 check 跳过该集成文件。OSS 私有访问、供应商账单和 GPU 作业需要在对应环境单独验收，并记录结果。

提交前执行 `git diff --check` 和 `git status --short`，确认没有 `.env`、`.data`、构建产物、用户素材或密钥。

## 文本创作连接

创作台默认页 `/studio` 使用后台维护的文本连接和篇幅价格。先获取报价，再受理后台任务；结果保存成功后结算。旧 JSON 仅用于首次配置导入，不再作为应用运行期覆盖。详见 [配置说明](configuration.md)。

工程更名与旧配置升级见 [Huezumi 工程命名](engineering-name.md)。已有部署保留原数据库、桶与卷；上述新名称用于全新安装。
