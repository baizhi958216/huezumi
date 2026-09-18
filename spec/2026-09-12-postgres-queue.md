# PostgreSQL 统一任务调度与限流

- 状态：completed
- 创建日期：2026-09-12
- 相关 ADR：[ADR-004](../docs/decisions/004-postgres-queue.md)

## 背景与问题

用户要求不再使用 Redis。本地已有 PostgreSQL，Redis 当前只承担 BullMQ 调度、任务互斥与请求限流，增加单机维护负担。数据库 outbox 是可恢复任务派发的事实源。

## 目标

- 用 PostgreSQL / pg-boss 替代 BullMQ、Redis 与 inline 临时定时器；所有已受理任务持久化。
- 保持延迟轮询、重试、幂等和账务不重复；未确认的供应商提交不自动再次提交。
- 使用 PostgreSQL 原子计数和过期时间执行跨进程限流。
- 移除 Redis 配置、依赖、开发和生产 Compose 服务；保留历史文档记录。

## 非目标

- 不更改生成请求、价格和钱包契约，不调用真实收费供应商。
- 不自动删除旧 Redis / MinIO 数据卷，不猜测历史数据归属。

## 用户流程

1. 停止旧 Web / worker，备份数据库。
2. 运行数据库迁移，显式创建 / 升级 pg-boss schema 与限流表。
3. 按文档恢复旧队列中的未完成任务，再启动新 Web / worker。
4. 本机 Nuxt 启用 worker；生产保持 Web / worker 分离，共享 PostgreSQL。

## 行为契约

- pg-boss job 保存 `submit|poll` 与 generation ID，出站请求仍使用平台契约。
- 每个任务最多尝试 5 次，指数退避；延迟轮询为 12 秒；失败耗尽进入死信处理并把未终结生成标为人工核对。
- 通过 PostgreSQL 会话级 advisory lock 防止同一生成并行处理；锁竞争需重试，不丢弃当前 job。
- 供应商提交前由数据库 `queued -> submitting` 条件更新防重；进程中断留下的 `submitting` 进入人工核对。终态不得再次查询供应商，成功记录的归档重试使用已保存 URL。
- outbox 与队列写入幂等；重启后队列仍可消费。运行期关闭自动 schema migration，数据库升级只在 `db:migrate` 中执行。
- 限流以 bucket / IP 摘要作为 key，原子更新计数及 TTL。服务故障返回受控 503，超限 429；清理过期条目有界，不向内存计数回退。
- 旧 `NUXT_QUEUE_MODE`、`NUXT_REDIS_URL` 不再参与运行；新增队列表在独立 `pgboss` schema，业务记录无破坏性迁移。

## 验收条件

- [x] 无 Redis 容器运行时，管理员首次登录和队列消费正常；依赖及当前配置不再需要 Redis。
- [x] 实测重复 outbox、延迟 job、重启恢复、重试与死信；不调用真实供应商。
- [x] 同一 generation 的并发处理互斥；不明提交进入 review；终态不会查询上游。
- [x] 并发限流准确拒绝超限请求，过期后可重新请求，错误配置返回受控错误。
- [x] `pnpm check:full` 和相关数据库集成验证通过；旧数据恢复命令 / 步骤可验证。

## 边界情况

worker 崩溃后任务按持久化状态重试；外部副作用不承诺 exactly-once，依靠提交条件与结算幂等限制重复。停止旧 worker 后才能恢复旧队列，避免双栈处理；旧 submitting 保守进入 review。

## 验证计划

单元测试覆盖调度与终态处理；独立测试数据库或隔离测试队列验证 pg-boss、锁、重试与限流。真实模型生成不属于本次验证。

## 上线与回滚

先停止旧 worker、备份，再迁移及恢复任务。回滚应用版本前停止新 worker，核对活动任务并备份；不得直接删除 pg-boss schema 或旧数据卷。

## 实现结果

已用 `pg-boss@12.31.0` 替换 BullMQ / ioredis，开发与生产 Compose 均移除 Redis，当前运行容器只剩 PostgreSQL / SeaweedFS。新增 Drizzle 限流表 migration `0005`、显式 pg-boss schema migration 和只读预览 / 应用恢复脚本。

`pnpm test:postgres` 的 10 项隔离数据库测试通过，覆盖计数并发 / 过期、锁竞争 / 释放、去重、延迟重启恢复、同一生成串行、重复 outbox、未知提交 review、立即提交成功的完整结果获取、终态缓存归档、重试 / 死信及旧队列恢复。测试供应商均为 mock，临时数据库已删除。本机恢复预览为 0 个历史任务。

真实 HTTP 验证 Redis 不存在时首次管理员登录成功；11 个并发错误登录得到 10 个 401、1 个 429，PostgreSQL 不可用时返回不含内部连接信息的 503。`pnpm check:full` 与 `git diff --check` 通过。旧卷保留，真实供应商请求和 GPU 生成未执行。
