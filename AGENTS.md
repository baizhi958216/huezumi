# 仓库协作约定

适用于本仓库全部目录。面向用户使用中文，沿用现有代码标识；英文工程名为 Huezumi，包名和资源前缀为 `huezumi`。

## 开始工作

1. 阅读 [README.md](README.md)、[DESIGN.md](DESIGN.md) 和相关 [docs](docs/README.md) / [spec](spec/README.md)。
2. 查看 `git status --short`，保留用户已有修改；按任务范围检查代码，不仅依据文档判断实现。
3. 当前项目处于开发期，数据库以 `server/database/schema.ts` 为唯一结构来源，使用 `pnpm db:init` 建表和初始化队列；不维护历史迁移目录。

## 代码职责

- 页面和交互在 `app/`；接口入口在 `server/api/`，业务逻辑在 `server/services/`。
- 跨模态编排在 `server/services/platform/`；视频适配器在 `server/services/providers/`。
- 共享契约放 `shared/types/`，纯函数放 `shared/utils/`；请求运行期校验使用现有 Zod schema。
- 数据结构以 `server/database/schema.ts` 为源。开发库使用 `pnpm db:push` 同步结构，`pnpm db:init` 还初始化 pg-boss。不要为当前开发阶段补造迁移历史；不要把结构同步当作清空现有数据的授权。
- TypeScript / Vue 使用两空格、单引号、无分号，遵循现有 ESLint 配置。视觉复用 `app/assets/css/main.css` 和 `app/app.config.ts` 的语义令牌与组件。

## 必须保留的业务边界

- API 在服务端检查登录、管理员权限和 owner；前端隐藏控件不能替代鉴权。
- 付费任务经过报价、同事务预留额度/登记任务/outbox、worker 执行与幂等结算。报价绑定规范化请求及连接版本；不要绕过幂等键或直接写钱包余额。
- 外部提交结果不明时进入 `UNKNOWN` / `review`，不得自动重复生成。区分“重新生成”“同步状态”“重试归档”。
- 文档版本不可变；手动保存校验基础版本，AI 与用户编辑冲突时保留候选版本，不覆盖用户当前正文。
- 作品列表读取数据库索引，执行端历史同步和媒体归档在后台完成。普通用户素材与结果保持私有访问。
- 平台连接来自数据库。凭据只在服务端解密，不将密钥写入前端或输出元信息。
- 生产 Web 与 worker 分离；保持 PostgreSQL 持久化队列。

## 修改范围与数据

不要提交 `.env`、备份、`.data/`、`vendor/`、模型权重、用户素材、构建产物或真实凭据。示例使用占位值。不要为文档/测试任务修改实际账户、迁移真实数据库、清空卷或调用收费生成服务。运行数据库测试前确认目标及隔离方式；`pnpm test:postgres` 创建随机临时数据库、初始化结构并在结束时清理，不修改现有业务库。

保留历史媒体 URL 的兼容行为；需要迁移时提供明确范围与恢复办法。检查脚本加载环境变量的实际方式，普通 `tsx scripts/...` 不会自动读取 `.env`；db:init/db:push/test:postgres 已显式加载可选 `.env`。

## 文档维护

- README 是导航与最短起步路径；DESIGN 描述当前架构；docs 提供操作指南；spec 描述范围、合同和验收；ADR 保留决策背景。
- 变更接口、环境变量、启动步骤或用户可见能力时，同步对应文档，避免在多处复制完整参数表。
- 历史验收放 `docs/archive/`，标明日期、环境和证据限制；不得把旧记录当作本轮测试结果。
- 使用仓库相对链接，确保目标存在。不要为补链接而杜撰已完成规格或测试证据。

## 验证与交付

按改动选择现有测试，通常执行 `pnpm test`、`pnpm lint`、`pnpm typecheck`；影响构建时执行 `pnpm build`。文档修改检查链接、命令入口及 `git diff --check`，不为简单文案新增实现镜像测试。

`pnpm check` 直接执行测试、lint 与类型检查，`pnpm check:full` 再构建，不设独立 harness 目录。报告改了什么、验证结果、跳过项和阻塞项；不声称没有运行的验证已通过。
