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

### ComfyUI 多模态大模型提示词节点与配置

项目维护的自定义节点包位于 `comfyui/custom_nodes/forkvdo_prompt`，提供 `ForkVdoImageCollection` 与 `ForkVdoPrompt` 两个节点。

1. **连接与密钥配置**：
   通过私有环境变量 `FORKVDO_LLM_CONNECTIONS_JSON` 配置可用的大模型连接。
   - 本地开发：在 `.env` 中填写 `NUXT_COMFYUI_LLM_CONNECTIONS_JSON`，Nuxt 启动子进程时会自动传递。
   - 远程 ComfyUI：在执行端环境中设置 `FORKVDO_LLM_CONNECTIONS_JSON`。
   - 节点仅保存连接标识（如 `openai-main`），画布及客户端不包含或泄露 API Key 与 Base URL。
2. **协议与格式**：
   - 采用 OpenAI Chat Completions 协议：`<baseUrl>/v1/chat/completions`。
   - 支持结构化输出：自动优先使用 `response_format: { type: "json_schema" }`，兼容端点返回 400 时自动退化重试，并由节点保证返回非空的 `positive_prompt` 与合法的 `negative_prompt`。
3. **缓存与强制刷新**：
   - 普通生图重试复用已生成的提示词，避免重复消耗大模型费用。
   - 需要重新生成时，点击节点或检查器中的“重新生成提示词”即可变更 `refresh_token`，强制绕过缓存。
4. **内置公开工作流**：
   - `workflows/anima-llm-prompt-generate.json`：包含参考图片集合、大模型提示词提炼与 Anima 生图全链路。
   - `workflows/anima-llm-multi-image-edit.json`：支持原图参与生成、局部重绘与微调编辑模板。
   - 服务端自动将 `workflows/` 中的公开模板聚合至工作流库面板，无需手动导入。

## 供应商配置

各供应商 API Key 仍从私有 Nuxt runtime config 读取，详见 `.env.example`。素材先写个人空间，worker 提交前将 `/api/files/:id` 换成有时效的 OSS 签名地址。供应商输出由 worker 归档后才作为平台长期结果。

## 验证

```bash
pnpm check
pnpm check:full
```

`check` 执行仓库文档约束、计费/幂等纯函数测试、ESLint 和 TypeScript；`check:full` 再执行 production build。真实数据库并发、Redis 故障恢复、OSS 私有访问、供应商账单和 GPU 作业需要在对应环境单独验收，并记录结果。

提交前执行 `git diff --check` 和 `git status --short`，确认没有 `.env`、`.data`、构建产物、用户素材或密钥。
