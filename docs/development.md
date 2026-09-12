# 开发与部署指南

## 本地环境

需要 Node.js 22、pnpm 10、PostgreSQL。使用 Redis 队列时还需要 Redis；不配置 Redis的开发环境默认采用 inline 后台执行。

```bash
pnpm install
cp .env.example .env
set -a; source .env; set +a
pnpm db:migrate
pnpm admin:create -- --email=admin@example.com --password='replace-with-a-long-password' --name=管理员
pnpm dev
```

所有帐号和任务 API 都需要 PostgreSQL。首次管理员只能通过 `admin:create` 创建。默认注册模式是 `invite`，登录后在控制面板生成邀请码；开发时可设置 `NUXT_REGISTRATION_MODE=open`。

### 本机热更新开发

本机开发把 PostgreSQL 和可选的 MinIO 放进 Docker；Nuxt 和 ComfyUI 使用宿主机进程，因此 Vue/Nitro 修改可以由 `pnpm dev` 实时重载。仓库若已包含 `vendor/ComfyUI`，ComfyUI 会复用其中的 Python 虚拟环境；Apple Silicon 可由 PyTorch 使用 MPS。

```bash
docker compose -f docker-compose.dev.yml up -d postgres
set -a; source .env; set +a
pnpm db:migrate
pnpm dev
```

`.env` 至少需要对应本机连接配置：

```dotenv
POSTGRES_PASSWORD=change-me-local-only
POSTGRES_HOST_PORT=55432
NUXT_DATABASE_URL=postgresql://forkvdo:change-me-local-only@127.0.0.1:55432/forkvdo
NUXT_QUEUE_MODE=inline
NUXT_WORKER_ENABLED=false
NUXT_COMFYUI_MODE=local
NUXT_COMFYUI_DIR=./vendor/ComfyUI
NUXT_COMFYUI_PYTHON=./vendor/ComfyUI/.venv/bin/python
```

启动 Nuxt 后，工作流页面的“启动 ComfyUI”会通过项目后端拉起 `vendor/ComfyUI`；也可以手动执行同等命令：

```bash
vendor/ComfyUI/.venv/bin/python vendor/ComfyUI/main.py \
  --listen 127.0.0.1 --port 8188 --disable-auto-launch
```

本机已有其他 PostgreSQL 服务时，开发 Compose 默认使用 `55432`，不会占用 `5432`。

### 本地对象存储（MinIO）

开发环境可以用 Compose 中的 MinIO 代替阿里云 OSS，上传素材和结果只保存在本机 Docker volume，不产生云端流量。先启动服务：

```bash
docker compose -f docker-compose.dev.yml up -d minio minio-init
```

在 `.env` 中加入以下配置（账号需要与 Compose 中的 `LOCAL_OSS_*` 一致）：

```dotenv
NUXT_OSS_ACCESS_KEY_ID=forkvdo-local
NUXT_OSS_ACCESS_KEY_SECRET=forkvdo-local-secret-change-me
NUXT_OSS_BUCKET=forkvdo
NUXT_OSS_REGION=us-east-1
NUXT_OSS_ENDPOINT=http://127.0.0.1:9100
NUXT_OSS_SECURE=false
NUXT_OSS_PUBLIC_BASE_URL=
```

MinIO 管理控制台是 <http://127.0.0.1:9101>。Nuxt 在宿主机运行时必须使用 `127.0.0.1:9100`；只有把 Nuxt 也放进 Compose，才改用服务名 `http://minio:9000`。本地配置不会覆盖生产环境的阿里云 OSS 配置，后者仍使用 HTTPS 和阿里云地域名。

## 数据库、队列与 worker

核心配置：

```dotenv
NUXT_DATABASE_URL=postgresql://forkvdo:password@127.0.0.1:5432/forkvdo
NUXT_REDIS_URL=redis://127.0.0.1:6379
NUXT_QUEUE_MODE=redis
NUXT_WORKER_ENABLED=false
NUXT_WORKER_CONCURRENCY=4
NUXT_USER_MAX_ACTIVE_GENERATIONS=3
NUXT_PLATFORM_DAILY_CREDIT_BUDGET=100000
```

Web 进程设置 `NUXT_WORKER_ENABLED=false`；worker 进程使用相同构建和配置并设置为 `true`。worker 同时消费 BullMQ 和每三秒扫描 transactional outbox。开发环境 `NUXT_QUEUE_MODE=inline` 会在 Web 进程异步执行，不能作为多实例生产配置。

修改 `server/database/schema.ts` 后运行 `pnpm db:generate`，检查生成 SQL，再运行 `pnpm db:migrate`。迁移旧 `.data` 前先建受控 owner 帐号并备份：

```bash
pnpm data:migrate -- --owner-email=legacy-owner@example.com --data-dir=.data
```

如果旧作品记录已经丢失、但结果视频仍在旧阿里云 OSS 的 `forkvdo/outputs/` 下，可先执行只读预览，再导入到指定帐号。脚本只创建缺失的历史记录，不删除或覆盖 OSS 对象；由于 OSS 对象不含提示词和模型元数据，恢复记录会明确标记这些字段未恢复。

```bash
pnpm data:restore-oss -- --owner-email=owner@example.com --dry-run
pnpm data:restore-oss -- --owner-email=owner@example.com
```

脚本默认读取 `.env` 中第一次出现的 `NUXT_OSS_*` 配置，适用于本地配置同时保留旧阿里云和当前 MinIO 覆盖项的情况；也可用 `FORKVDO_LEGACY_OSS_*` 环境变量显式覆盖。导入前应确认当前帐号就是历史作品的归属帐号，并保留数据库备份。

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
NUXT_OSS_PREFIX=forkvdo/uploads
NUXT_OSS_OUTPUT_PREFIX=forkvdo/outputs
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

内置 [图片创作工作流](../workflows/image-creation.json) 将大模型连接、生图、原图编辑和遮罩局部重绘合为十个节点。它替代两个 Anima 大模型模板，用户已保存的旧工作流不删除。完整的节点、模式、安装和模型兼容说明见 [节点包指南](../comfyui/custom_nodes/forkvdo_prompt/README.md)。

- 更新包后重启 ComfyUI，再刷新节点定义；已有副本先保存修改，再重新载入以显示新增控件。默认 checkpoint 是本机已有模型；其他环境需在模型节点重新选择已安装的兼容 SD1.5/SDXL checkpoint。
- 单张/多张图片进入图片集合；需求通过独立文本节点连入大模型；正负提示词可追加或替换。多参考图只帮助 LLM 理解，编辑时仅指定原图进入扩散模型。
- 大模型支持两种方式：模板中的“③ 大模型连接”节点填写兼容 Chat Completions / Responses 的地址、API Key、模型和视觉能力；或者由执行端配置私有 `NUXT_COMFYUI_LLM_CONNECTIONS_JSON` / `FORKVDO_LLM_CONNECTIONS_JSON`。`api_protocol`（环境连接使用 `apiProtocol`）可选 `auto`、`chat_completions`、`responses`；缺省在 Chat Completions 返回 404/405 时尝试 Responses，保留旧工作流控件顺序。连接节点中的 Key 会保存到工作流 JSON，含 Key 的工作流必须保持私有，导出时也会包含 Key。
- Responses 支持有序参考图与 JSON/SSE 完成结果；不把断流或失败内容交给生图节点。部分中转服务只允许指定客户端：例如 AnyRouter 的 GPT 模型要求 Responses，但仍可能以 `invalid codex request` 拒绝通用 HTTP 请求。节点会明确提示这种限制，不伪装客户端或自动更换用户模型。具体排查见[节点包指南](../comfyui/custom_nodes/forkvdo_prompt/README.md#anyrouter-排查)。
- 模板默认改为使用工作流连接；如果不配置连接，可切换 `manual`，直接使用需求文本。`refresh_token` 变化或上传图片内容变化使提示词缓存失效。
- 局部重绘必须上传与原图同尺寸的黑白遮罩，白改黑留；黑色区域以原图像素合回。整图编辑不保证人物完全一致。不同架构模型需匹配的 loader/专用生成链路，平台不自动下载或承诺任意模型兼容。
- 工作流右侧输出图片按原始比例完整显示；点击图片在弹窗中查看大图，支持关闭按钮、点击遮罩和 Escape 返回。图片仍通过原有鉴权代理读取，加载失败时可关闭重试或在新窗口打开原图。

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

节点测试不依赖 GPU 或真实凭据，使用已有 ComfyUI Python 环境：

```bash
PYTHONDONTWRITEBYTECODE=1 vendor/ComfyUI/.venv/bin/python comfyui/custom_nodes/forkvdo_prompt/test_workflow.py
pnpm check:full
```

## 供应商配置

各供应商 API Key 仍从私有 Nuxt runtime config 读取，详见 `.env.example`。素材先写个人空间，报价和 worker 提交前都将 `/api/files/:id` 换成有时效的 OSS 签名地址，再校验供应商要求的公网 HTTPS；供应商输出由 worker 归档后才作为平台长期结果。

## 验证

```bash
pnpm check
pnpm check:full
```

`check` 执行仓库文档约束、计费/幂等纯函数测试、ESLint 和 TypeScript；`check:full` 再执行 production build。真实数据库并发、Redis 故障恢复、OSS 私有访问、供应商账单和 GPU 作业需要在对应环境单独验收，并记录结果。

提交前执行 `git diff --check` 和 `git status --short`，确认没有 `.env`、`.data`、构建产物、用户素材或密钥。
