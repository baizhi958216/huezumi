<p align="center">
  <img src="./public/favicon.svg" width="80" alt="绘小宙">
</p>
<p align="center">
  <strong>绘小宙</strong> · 创作属于自己的小宇宙
</p>
<p align="center">
  写一个故事，遇见一个角色，让脑海里的画面变成会动的奇妙世界。
</p>

---

## 🌟 核心特性

绘小宙（工程标识 forkvdo）解耦了前端交互、业务调度与底层模型供应商协议，提供一致、安全且可追溯的多模态创作体验：

### 📝 文案与剧本创作 (Text & Story Studio)

- **多类型文案生成**：支持故事故事线、短剧分场剧本、营销爆款文案等多模态文本创作。
- **结构化设定提取**：不仅生成正文，还自动拆解人物角色设定、场景氛围与关键词标签。
- **不可变版本演进**：正文与设定保存为不可变版本快照，支持协同编辑冲突检测与历史版本回滚。
- **跨模态引用基石**：文案版本可作为后续分镜、概念画面与镜头视频的稳定输入源。

### 🎬 全生态视频生成 (Video Studio)

- **统一生成契约**：覆盖纯文本文生视频、首帧/首尾帧精确运镜约束、图/视/音多模态参考驱动。
- **全生态模型调度**：接入主流顶级视频模型矩阵，平台根据供应商能力自动对齐画幅、清晰度与时长约束。
- **电影级画质控制**：支持自适应画幅、480P 至 4K 超清画质、最长 30 秒连续渲染与原生有声生成。
- **状态归一化与归档**：抹平不同供应商异步轮询差异，生成产物自动归档至用户私有对象存储。

### 🎨 图像与工作流画布 (Images & ComfyUI Workflows)

- **原生工作流集成**：内置 ComfyUI 画布与节点能力，支持文生图、图生图、局部重绘与提示词扩写。
- **执行意图预先登记**：提交即固化意图与画布快照，后台异步同步并持久化输出，避免刷新丢失结果。
- **免依赖解耦隔离**：主 Web 容器与 GPU 执行环境完全网络与进程隔离，引擎离线不影响已归档作品浏览。

### 📁 项目中心与派生资产 (Projects & Works)

- **以项目为组织核心**：以 `Project` 聚合管理文案剧本、关键画面、镜头视频与成片资产。
- **清晰的派生追溯**：每个作品明确记录来源项目、输入版本、分镜编号、参考素材与模型参数。
- **统一作品库视图**：支持全类型作品聚合检索、多维度筛选（文本/图片/视频）、标签管理与二次再创作。

### 🛡️ 生产级治理与安全体系 (Platform Governance)

- **可靠异步调度**：PostgreSQL 任务记录 + pg-boss 分布式持久化队列，配备 Outbox 事务可靠补发。
- **严密计费与额度**：报价（Quote）-> 额度原子预留 -> Worker 异步执行 -> 成功原子结算/失败释放。
- **企业级连接加密**：视频与文本连接凭据在数据库中使用 AES-256-GCM 主密钥加密存储，不可变版本追踪。
- **资产私密性**：多用户隔离，对象存储私有 ACL，仅通过服务端短期签名 URL（302）安全交付。

---

## 🏛️ 系统架构

```text
Browser (Web App) ──HTTPS──> Nuxt 4 Web & Nitro API ───────────> PostgreSQL
                                    │                             帐号、会话、加密连接、
                                    │                             项目、文档版本、作品库、
                                    │                             报价预留、任务与审计流水
                                    ├──签名直传/短期读写──────────> Private OSS (Aliyun / SeaweedFS)
                                    └──pg-boss 调度 / Outbox ───> PostgreSQL Job Queue
                                                                    │
                                     ┌──────────────────────────────┴──────────────────────────────┐
                                     ▼                                                             ▼
                             Text Worker (LLM)                                            Generation Worker (Video)
                         ├──> OpenAI-compatible APIs                                  ├──> Provider Video APIs
                         └──> 结构化版本与账目结算                                       ├──> 异步轮询与私有 OSS 归档
                                                                                      └──> 额度最终原子结算

Admin Browser ──Authenticated HTTP/WS──> Nuxt Reverse Proxy ──Private Network──> ComfyUI GPU Service
```

---

## 🤖 已接入的模型生态

### 视频生成模型 (Video Providers)

| 供应商            | 主要模型系列                                            | 支持特性                              |
| :---------------- | :------------------------------------------------------ | :------------------------------------ |
| **阿里云百炼**    | Wan 3.0 / Wan 2.7 系列、HappyHorse、MiniMax H3、可灵 V3 | 文生 / 首尾帧 / 提示词扩写 / 原生音频 |
| **MiniMax 海螺**  | Hailuo 2.3、Hailuo 2.3 Fast、02 系列                    | 电影感镜头 / 强主体运动 / 丰富运镜    |
| **可灵 Kling**    | Kling V2.6、V2.5 Turbo                                  | 首尾帧连贯运动 / 多画幅适配           |
| **Seedance 即梦** | Seedance 1.x、2.0、2.5 系列                             | 创意视觉 / 高一致性画面               |
| **RollDek**       | WAN 3.0 标准版、Prime、Image 系列                       | 专业画质渲染 / 多画幅支持             |
| **Runway**        | Gen-4.5 与多模态视频模型                                | 顶尖多模态运镜与运动控制              |

### 文本大模型 (Text LLM Connections)

- 兼容标准 **OpenAI Chat Completions** 与 **Responses** 协议。
- 支持接入各类主流语言模型（通义千问、DeepSeek、GPT-4o、Claude 等），用于剧本创作、分镜拆解与提示词润色。

### 图像与工作流 (ComfyUI)

- 内置 `forkvdo_prompt` 自定义节点，支持提示词双向翻译扩写。
- 提供百炼 Wan 3.0 多模态预设、MiniMax H3 角色一致性与首尾帧预设。

---

## 🚀 快速上手

### 环境准备

- **Node.js**: 22.12 或更高版本
- **pnpm**: 10.x
- **Docker Compose**: 用于本地启动 PostgreSQL 与 SeaweedFS 依赖服务

### 本地开发启动

```bash
# 1. 安装依赖
pnpm install

# 2. 复制开发环境变量
cp -n .env.example .env

# 3. 启动本地 Docker 基础服务（PostgreSQL + SeaweedFS）
docker compose -f docker-compose.dev.yml up -d

# 4. 执行数据库迁移与初始化配置
node --env-file=.env --import tsx scripts/db-migrate.ts
pnpm config:import -- --compact-env
node --env-file=.env --import tsx scripts/backfill-platform.ts

# 5. 创建首个管理员帐号
node --env-file=.env --import tsx scripts/admin-create.ts --email=admin@example.com --password='replace-with-a-long-password'

# 6. 启动开发服务器
pnpm dev
```

启动后访问 `http://localhost:3000`：

- 进入 `/studio`：开启文案剧本、视频生成或图像工作流创作。
- 进入 `/projects`：浏览创作项目与聚合作品库。
- 进入 `/admin`：管理员进入控制面板配置供应商连接、运营参数与文本定价。

---

## 🐳 生产部署 (Docker)

生产环境推荐使用自带的多阶段编排：

```bash
POSTGRES_PASSWORD='your-strong-password' \
COMFYUI_MODELS_DIR='/absolute/path/to/models' \
  docker compose -f docker-compose.production.yml up -d --build
```

- Web/API 与后台 Worker 共享镜像，通过环境变量 `NUXT_WORKER_ENABLED` 隔离职责。
- 业务数据落地 PostgreSQL，多媒体资产落地私有阿里云 OSS。
- ComfyUI 独立容器运行于内部私网，只读挂载宿主机模型目录。

---

## 🛠️ 工程验证与质量约束

项目遵循严格的工程质量契约：

```bash
pnpm check        # 契约规则 + 单元测试 + ESLint + Nuxt 严格类型检查
pnpm check:full   # 上述检查 + 生产构建打包验证 (Production Build)
pnpm test:postgres # 隔离式 PostgreSQL 队列与限流集成验证
pnpm config:check # 敏感配置检查
```

---

## 📚 开发文档与规格设计

- 📐 [系统设计说明 (DESIGN.md)](./DESIGN.md)
- 🔌 [HTTP API 契约文档 (docs/api.md)](./docs/api.md)
- ⚙️ [配置与治理指南 (docs/configuration.md)](./docs/configuration.md)
- 💻 [本地开发与部署 (docs/development.md)](./docs/development.md)
- 📋 [产品与能力规格索引 (spec/README.md)](./spec/README.md)
- 🏛️ [架构决策记录 (docs/decisions/README.md)](./docs/decisions/README.md)
- 🧪 [工程验证入口 (harness/README.md)](./harness/README.md)
