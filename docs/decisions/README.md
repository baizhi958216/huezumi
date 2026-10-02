# 架构决策记录

ADR 记录长期维护成本较高的技术选择及背景。历史正文保留；被取代的结论在状态行链接后续决定，不能直接拿早期决策配置当前部署。

| ADR                                                             | 状态与适用范围                                                   |
| --------------------------------------------------------------- | ---------------------------------------------------------------- |
| [001 上传素材 OSS 转存](001-oss-material-storage.md)            | superseded：公开 ACL 与旧上传入口已由 002 私有存储取代           |
| [002 多用户生产架构](002-multi-user-production-architecture.md) | accepted：PostgreSQL/owner/私有存储仍适用，Redis 队列被 004 取代 |
| [003 SeaweedFS 本地存储](003-seaweedfs-local-storage.md)        | accepted：版本比较是 2026-09-12 的历史依据                       |
| [004 PostgreSQL 队列](004-postgres-queue.md)                    | accepted：pg-boss、advisory lock 与数据库限流                    |
| [005 创作文档边界](005-creative-document-boundary.md)           | accepted：版本边界仍适用，同步免费文本阶段被 006 取代            |
| [006 平台治理](006-platform-governance.md)                      | accepted：连接版本、runs/works 与文本计费                        |

早期关联的 spec 文件未随本次检出提供，原文件名仅作历史索引。当前合同见 [平台基线](../../spec/2026-09-22-platform-baseline.md)。

新增决定复制 [模板](000-template.md)，使用下一个三位编号。状态可为 proposed、accepted、superseded；规格负责范围与验收，ADR 负责为什么作出选择。状态及失效链接可修订，但不要重写历史结论冒充当时已有的新方案。
