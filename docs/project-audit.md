# 项目检查记录 · 2026-09-22

> 历史记录：仅保留仍相关的验证范围，测试数量属于当时环境，不代表当前测试结果。

基于提交 `9421d67` 的工作树完成文档整理，随后按用户确认的开发期策略修复初始化、检查命令和镜像资源。当前不保留业务迁移历史，不设独立 harness 目录。

## 已处理事项

| 原问题                              | 当前处理                                                                            |
| ----------------------------------- | ----------------------------------------------------------------------------------- |
| 初始化脚本引用缺失的 drizzle/       | 以 schema.ts 为唯一结构来源；db:push 直接同步 public 表，db:init 随后初始化 pg-boss |
| package scripts 引用缺失的 harness/ | check 直接运行 test/lint/typecheck，check:full 再构建                               |
| 数据库检查入口缺失                  | scripts/test-postgres.ts 创建随机空库、初始化、运行测试并清理                       |
| Docker 依赖缺失迁移目录             | 改为复制 drizzle.config.ts，使用已有 server schema 与初始化脚本                     |
| 开发/部署文档描述不可用入口         | 同步 README、AGENTS、CLAUDE、DESIGN、操作指南和规格                                 |

历史迁移曾从 Git 删除前的版本找到，但按后续要求不恢复。移除了 db:generate/db:migrate 和旧 db-migrate.ts，Compose 改为等待 db-init。Drizzle ORM 与 Drizzle Kit 仍用于业务查询和结构同步；删除迁移目录并不要求替换 ORM。

## 本轮验证

宿主机 Node.js v24.21.0、pnpm 10.15.1；另外构建 Node 22 Alpine 应用镜像，在独立 PostgreSQL 17 容器中验证。未修改原有开发业务库。

| 检查                                  | 结果      | 范围                                                                |
| ------------------------------------- | --------- | ------------------------------------------------------------------- |
| pnpm check:full                       | 通过      | 32 项单元测试、lint、类型检查、Nuxt build；默认跳过 10 项数据库测试 |
| pnpm test:postgres                    | 10 项通过 | 临时空库初始化、重复初始化、队列恢复及 9 项图片 worker 测试         |
| 重复 db:init                          | 通过      | 保留 fixture 用户、钱包、账本、邀请码和已入队任务                   |
| 测试数据库清理                        | 通过      | 测试脚本结束后随机测试库数量为 0                                    |
| docker build                          | 通过      | 完整 Node 应用 runner 镜像                                          |
| 镜像内 pnpm db:init                   | 通过      | 独立空数据库，业务表和 pg-boss 初始化成功                           |
| Compose 配置                          | 通过      | db-init 依赖正确、Web worker=false、worker=true 且不发布端口        |
| 本地 Markdown 链接 / git diff --check | 通过      | 不验证外部网站可达性                                                |

本轮只创建并使用测试容器和临时数据库；未执行真实业务库重置、历史数据升级、收费供应商调用。完整数据库初始化覆盖当前结构，不代表所有模态的真实端到端业务都已验收。

## 开发使用

- 新环境：配置 .env、启动基础设施、运行 pnpm db:init，再创建管理员。
- 修改 schema：使用 pnpm db:push 同步开发库；无 --force，不自动确认破坏性变更。
- 日常检查：pnpm check；完整构建检查：pnpm check:full。
- 数据库验证：pnpm test:postgres，要求测试账户可创建数据库。

方案与边界见 [规格](../spec/2026-09-22-repository-integrity.md)，操作步骤见 [开发指南](development.md)。历史治理验收和品牌提示词继续保存在 [archive](archive/README.md)，不作为当前部署结果。
