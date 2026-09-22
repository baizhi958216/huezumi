# 本地开发

## 环境

使用 Node.js 22.12+、`pnpm@10.15.1`、Docker Compose。可选 ComfyUI 需要 Git、Python、PyTorch 和对应模型。Nuxt 在宿主机运行，PostgreSQL 17 与 SeaweedFS 4.46 使用 [开发 Compose](../docker-compose.dev.yml)。

当前按全新开发库处理，不维护历史 SQL 迁移或独立 harness 目录。数据库结构以 `server/database/schema.ts` 为准；验证入口直接定义在 package.json。

## 1. 准备依赖和配置

```bash
pnpm install
# 仅首次复制；已有 .env 应合并配置，保留原密钥和连接
cp -n .env.example .env
```

编辑 `.env`：数据库 URL 与 Compose 用户、密码、端口一致；`LOCAL_OSS_*` 与 `NUXT_OSS_*` 两组本地存储凭据一致。为新安装填写 Base64 编码的 32 字节随机 `NUXT_CONNECTION_ENCRYPTION_KEY`，已有部署必须保留原值。生成新值可使用 `openssl rand -base64 32`，只保存到私有配置，不提交或粘贴到日志。

```bash
docker compose -f docker-compose.dev.yml up -d --wait
docker compose -f docker-compose.dev.yml ps -a
pnpm config:check
```

`config:check` 自行读取 `.env`，仅核对必要配置存在性和主密钥长度，不测试数据库、存储或供应商连通性。

| 服务               | 本机地址                | 持久化                             |
| ------------------ | ----------------------- | ---------------------------------- |
| PostgreSQL         | `127.0.0.1:55432`       | 显式命名卷 `huezumi-postgres-dev`  |
| SeaweedFS S3       | `http://127.0.0.1:9100` | 显式命名卷 `huezumi-seaweedfs-dev` |
| SeaweedFS 管理界面 | `http://127.0.0.1:9101` | 使用 `LOCAL_OSS_*` 凭据            |

这些开发卷设置了显式 `name`，不会再自动加 Compose 项目前缀。停止使用 `docker compose -f docker-compose.dev.yml stop`；`down -v` 会删除数据，不是常规停止命令。

## 2. 初始化数据库

`pnpm db:init` 读取可选 `.env`，先通过 Drizzle Kit push 同步 public 业务表，再初始化 pg-boss 独立 schema 与队列。后续仅同步结构可用 `pnpm db:push`。两个命令均要求明确的 NUXT_DATABASE_URL，没有默认数据库回退，也不加 --force。

```bash
pnpm db:init
node --env-file=.env --import tsx scripts/admin-create.ts --email=admin@example.com --password='replace-with-a-long-password' --name=管理员
```

应用运行期不自动改 schema；相同结构重复初始化不会重复建表或清空数据。管理员脚本要求密码至少 10 字符，重复指定同一邮箱会重置密码并设为 active/admin，因此不是日常启动步骤。

除已封装环境加载的 db:init/db:push/test:postgres 外，普通 `tsx` 脚本不自动加载 `.env`，使用 `node --env-file=.env --import tsx scripts/…`。旧配置导入、回填和恢复仅用于已有数据升级，见 [运维指南](operations.md)，全新安装不需要迁移旧配置。

## 3. 启动应用

```bash
pnpm dev
```

访问 `http://localhost:3000`。开发示例启用 `NUXT_WORKER_ENABLED=true`，同一进程消费 PostgreSQL 队列。若设为 false，需另一个启用 worker 的进程才能推进任务。

默认注册模式 invite、赠送额度 0。管理员在 `/admin/invitations` 创建邀请码，在 `/admin/settings` 配置连接、文本价格、默认用途、并发及日预算；图片/视频价格在管理界面发布。没有价格或额度时不能提交付费任务。

## 可选 ComfyUI

`NUXT_COMFYUI_MODE=local` 时启动会后台探活，已安装且未运行则尝试启动；首次进入管理员 `/studio/workflow` 安装后再启动。默认目录 `vendor/ComfyUI`。解释器先选该目录内 .venv/venv，再检查 `NUXT_COMFYUI_PYTHON`，最后查 PATH；`NUXT_COMFYUI_DIR` 可调整目录。

安装不会下载模型权重。remote 模式只检查连接，不管理远端进程。节点更新需要重启一次；后台 API Key 或用途分配变化使用下一次任务快照，无需重启。预设和执行端边界见 [工作流指南](workflows.md)。

## 日常验证

```bash
pnpm test
pnpm lint
pnpm typecheck
pnpm build
git diff --check
```

`pnpm check` 串联测试/lint/类型检查，`pnpm check:full` 再构建。Python 与可选数据库测试见 [验证指南](testing.md)。`pnpm generate` 是静态生成命令，不能替代依赖认证、数据库和 worker 的完整平台部署。

## 常见问题

| 现象                         | 检查方向                                                           |
| ---------------------------- | ------------------------------------------------------------------ |
| 配置检查通过但登录/任务失败  | 它不检测连通性；核对 PostgreSQL 地址、schema 与账户状态            |
| 任务停留 queued              | worker 开关、pg-boss 初始化、outbox 和后台日志                     |
| 模型不可选 / 报价 422        | 连接启用状态、模型白名单、用途及匹配价格                           |
| 图片成功但不能预览           | 查看归档阶段、作品可用性和 OSS 连接；按 allowedActions 重试保存    |
| 云供应商读不到参考图         | 本机 9100 HTTP URL 不能供公网供应商读取，需可访问的 HTTPS 私有存储 |
| ComfyUI 缺失节点             | 执行端版本、自定义节点挂载、依赖和重启状态                         |
| Python 测试缺少 torch/PIL 等 | 使用已安装依赖的 ComfyUI 虚拟环境，不能只换成裸系统 Python         |
