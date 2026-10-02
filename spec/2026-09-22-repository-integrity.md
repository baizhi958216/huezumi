# 开发期仓库初始化与交付

- 状态：implemented
- 日期：2026-09-22
- 范围：数据库初始化、package scripts、容器运行资源

## 目标与决定

项目仍在开发，按全新数据库处理，不恢复历史迁移链。数据库结构以 schema.ts 为唯一来源；不新建 harness 目录，常规检查直接在 package.json 串联。

## 实现合同

1. db:push 使用 Drizzle Kit 同步 public 业务表，必须明确提供 NUXT_DATABASE_URL，没有默认连接或 --force。
2. db:init 在结构同步成功后初始化 pg-boss schema 和队列。pg-boss 自身的版本管理由库负责，与业务迁移历史无关。
3. check 运行测试、lint、typecheck；check:full 再构建，失败即停止。
4. test:postgres 创建随机独立空库，初始化并执行数据库/图片测试，结束删除，不修改已有业务库。
5. Docker runner 包含配置、schema、脚本；Compose 等待 db-init 成功后启动 web/worker。

## 验收范围

验证空库初始化、相同结构重复初始化保留 fixture 及队列任务、图片 worker 集成、完整检查、镜像构建、容器内初始化和内置预设。实际结果见 [检查记录](../docs/project-audit.md)。

不包含旧版本数据库升级、真实业务库重置、真实供应商或生产数据迁移。此次仅在临时测试数据库执行结构同步。
