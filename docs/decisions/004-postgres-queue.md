# ADR-004：任务队列与限流统一到 PostgreSQL

- 状态：accepted
- 日期：2026-09-12
- 决策者：项目维护者要求移除 Redis
- 原关联规格：`spec/2026-09-12-postgres-queue.md`（未随当前检出提供）

## 背景

本机已需要 PostgreSQL 保存用户、任务、账务和 outbox。Redis / BullMQ 额外引入数据服务。用户明确要求彻底移除 Redis，同时需要保留任务重启恢复能力。

## 决策

使用 pg-boss 管理 PostgreSQL 持久化队列、延迟、重试和死信；显式迁移 `pgboss` schema。生成互斥使用 PostgreSQL advisory lock，限流使用原子 UPSERT 和到期时间。开发 / 生产使用同一调度机制，去掉 inline 定时器回退。

## 备选方案

- pg-boss：选择。已有 PostgreSQL 可直接承载，成熟库负责任务生命周期；引入一项 Node 依赖并删除 BullMQ / ioredis。参考[官方说明](https://github.com/timgit/pg-boss)、[worker 语义](https://pgboss.io/api/workers)及[显式迁移选项](https://pgboss.io/api/constructor)。
- 自建 SKIP LOCKED 队列：无需新增库，但需要维护租约、重试、崩溃恢复、死信和清理，超出本项目的核心职责。
- Valkey 等 Redis 协议替代：仍需要独立缓存服务，不满足减少基础设施的目标。
- 进程内定时器：退出会丢调度，不适合作为已付费任务的持久化机制。

## 后果

### 正面

- 本地只需 PostgreSQL 和 SeaweedFS；任务可随数据库一起备份。
- 调度、互斥、限流都在同一数据基础设施中，不依赖 Redis。

### 负面与风险

- PostgreSQL 承担更多短事务，需控制并发、保留时间和自动清理。
- 数据库任务完成与供应商外部副作用无法原子提交；仍需幂等与人工核对。
- 部署迁移需停止旧 worker 并恢复未完成任务，不直接搬运 Redis 底层数据。

## 验证与复审

用真实 PostgreSQL 验证持久化、竞争、退避与过期限流；压力增长后根据队列延迟、连接数和表膨胀复审。生产仍保持独立 worker。
