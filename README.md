# 绘小宙 · Huezumi

面向故事、剧本、文案、图片与视频的多用户创作平台。前端使用 Nuxt 4 / Vue 3 / Nuxt UI 4，服务端使用 Nitro、PostgreSQL、Drizzle 和 pg-boss；管理员可通过 ComfyUI 工作流接入本地模型与云端 API。

## 当前能力

| 入口                     | 能力                                         | 使用边界                                                              |
| ------------------------ | -------------------------------------------- | --------------------------------------------------------------------- |
| `/studio`                | 故事、剧本、文案生成，手动编辑与不可变版本   | 登录后报价、后台生成、额度结算                                        |
| `/studio/image`          | 百炼千问图片文生图、参考图编辑               | 当前支持 `qwen-image-2.0` / `qwen-image-2.0-pro` 及代码允许的日期版本 |
| `/studio/video`          | 多供应商视频生成                             | 具体模式由适配器能力、连接模型和价格决定                              |
| `/studio/workflow`       | 节点画布、工作流库、ComfyUI 执行与输出预览   | 仅管理员；云端节点仍可能产生供应商费用                                |
| `/projects`              | 文本、图片、视频作品及项目归类               | 按账户隔离；工作流结果后台归档                                        |
| `/dashboard`、`/account` | 空间、额度、存储与账户资料                   | 登录后使用                                                            |
| `/admin` 及管理子页面    | 用户、价格、连接、运营设置、任务核对和邀请码 | 仅管理员                                                              |

平台尚未提供完整分镜编辑、视频剪辑与成片导出；模型资产目前主要是元数据读取，不能视为模型训练或部署服务。

## 开发起步

使用 Node.js 22.12+、`pnpm@10.15.1`，本地基础设施使用 Docker Compose。先安装依赖和创建本地配置：

```bash
pnpm install
cp -n .env.example .env
```

填写私有 `.env` 中的数据库、存储及加密主密钥，然后启动基础设施并初始化：

```bash
docker compose -f docker-compose.dev.yml up -d --wait
pnpm db:init
node --env-file=.env --import tsx scripts/admin-create.ts --email=admin@example.com --password='replace-with-a-long-password' --name=管理员
pnpm dev
```

当前按全新开发项目管理数据库，`schema.ts` 是结构来源。`db:init` 使用 Drizzle Kit push 建表并初始化 PostgreSQL 队列，不需要 `drizzle/` 迁移历史；已有开发库改结构使用 `pnpm db:push`，不自动强制确认破坏性变更。

默认页面地址为 `http://localhost:3000`。模型连接、价格、注册方式和平台预算在管理后台维护。完整步骤见 [开发指南](docs/development.md)，检查结果见 [项目检查记录](docs/project-audit.md)。

## 验证

以下入口存在于当前仓库，不需要真实供应商凭据：

```bash
pnpm check
pnpm check:full
git diff --check
```

`pnpm test` 默认跳过数据库集成测试。Python 节点测试及数据库测试的环境要求见 [验证指南](docs/testing.md)。独立数据库检查使用 `pnpm test:postgres`，构建成功不代表真实供应商或 GPU 已验收。

## 仓库地图

| 目录                                   | 职责                                        |
| -------------------------------------- | ------------------------------------------- |
| `app/`                                 | 页面、Vue 组件、composables、导航与视觉样式 |
| `server/api/`、`server/routes/`        | HTTP 入口及 ComfyUI WebSocket 代理          |
| `server/services/`                     | 计费、任务、供应商、ComfyUI 与平台资源服务  |
| `server/database/`                     | schema、连接、PostgreSQL 队列与限流         |
| `shared/`                              | 前后端共享类型与纯函数                      |
| `scripts/`                             | 管理员创建、配置导入、历史数据迁移与恢复    |
| `comfyui/custom_nodes/huezumi_prompt/` | Python 自定义节点及测试                     |
| `workflows/`                           | 随仓库分发的公共工作流 JSON                 |
| `tests/`                               | Vitest 单元测试与可选数据库集成测试         |
| `docs/`、`spec/`                       | 当前指南、历史记录、架构决策与功能规格      |

## 文档入口

- [AGENTS.md](AGENTS.md)：适用于全仓库的协作与修改约定。
- [CLAUDE.md](CLAUDE.md)：Claude 的仓库入口，复用同一套约定。
- [DESIGN.md](DESIGN.md)：系统分层、数据边界、执行流程与界面设计。
- [docs](docs/README.md)：开发、部署、配置、API、工作流与验证。
- [spec](spec/README.md)：当前实现基线、验收要求和后续规格模板。

工程标识为 `huezumi`，面向用户的中文名称为「绘小宙」。第三方模型权重、私有配置、运行数据与生成媒体不随代码分发。
