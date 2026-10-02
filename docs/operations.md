# 开发部署与数据操作

## 数据库策略

当前仍处于开发期，以 `server/database/schema.ts` 为结构来源，按新项目初始化，不维护历史迁移 SQL、journal 或快照。Drizzle ORM 继续供业务代码访问数据库，Drizzle Kit 用于直接同步结构。

```bash
pnpm db:init
```

命令加载可选 `.env`：先执行 db:push 同步 public 业务表，再由 db-queue-init.ts 初始化 pg-boss 的独立 schema 和队列。后续只同步开发库结构可用 `pnpm db:push`。连接必须显式提供 NUXT_DATABASE_URL；不使用 --force 自动确认破坏性变更，也不自动清空数据。

db:init 是建表和初始化，不会创建管理员、发布价格、分配连接或发放额度。这些步骤见 [开发指南](development.md) 与 [配置说明](configuration.md)。

## 容器部署

[部署 Compose](../docker-compose.production.yml) 保留 postgres、db-init、web、worker。db-init 成功后才启动 Web/worker，Web 不消费队列，worker 不发布端口。

镜像包含 drizzle.config.ts、server/schema、初始化脚本。该 Compose 不包含对象存储和 TLS 反向代理；部署环境需提供。`docker-compose.yml` 是旧单进程入口，不是完整拓扑。

```bash
docker compose -f docker-compose.production.yml config --quiet
docker compose -f docker-compose.production.yml up -d --build
docker compose -f docker-compose.production.yml ps -a
```

使用 [.env.production.example](../.env.production.example) 填写部署参数。PostgreSQL URL 由 Compose 组装，密码含 URL 特殊字符时需处理编码。生成使用供应商 API。

## 队列与结果核对

worker 每三秒发布 outbox，消费 pg-boss。主队列配置四次重试、指数退避、60 秒 heartbeat、900 秒执行过期和七天完成任务保留。

- queued 不推进：检查 worker、outbox、pg-boss 初始化与数据库连接。
- UNKNOWN/review：核对上游结果后结算，不自动再次提交生成。
- 已生成但保存失败：按 allowedActions 重试归档，不重复生成或扣费。
- 日预算控制新付费任务，设为 0 可暂停新付费任务受理。

## 数据保留与可选历史工具

按新库开发不等于每次启动都删除已有库。需要重置时应明确选择可丢弃的开发库；不要把 `docker compose down -v` 当作日常停止命令。

已有 scripts/config-import.ts、backfill-platform.ts、migrate-legacy.ts、restore-oss-archives.ts、recover-generation-queue.ts 是可选历史数据工具，不属于新项目初始化流程。除 config-import 自行加载环境外，调用前明确传入环境与目标，并核实归属；不自动执行旧数据导入或队列恢复。

需要保留开发成果时，备份数据库、私有存储、独立保管的加密主密钥。数据库本身不包含媒体字节或模型。存储服务切换通过 API 复制对象并校验，不能直接共用不同服务的数据卷。

## 已停用能力的数据保留

已有归档作品继续按 owner 通过私有素材接口读取。已停用类型的历史任务不再提供执行、同步或归档操作；旧队列消息不触发生成，旧 outbox 事件不阻塞受支持任务，废弃用途字段在读取时忽略、下次保存时移除。

已有库执行 `db:push` / `db:init` 前，先备份数据库和私有对象存储，导出需保留的历史配置与未归档文件，逐项核对工具显示的删表、删列差异。仓库结构定义的调整不授权清空业务数据、私有 `.env`、`vendor/`、模型、输出目录或已有容器卷。

如需恢复已停用能力，在维护窗口停止 Web/worker，使用此前 Git 版本及配套备份在独立环境恢复并验证；不要用旧快照覆盖已经产生新账目的业务库。
