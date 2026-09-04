# AI 工程基建一致性

- 状态：completed
- 负责人：forkvdo 核心开发
- 创建日期：2026-09-04
- 相关 issue / ADR：

## 背景与问题

仓库已经具备 `AGENTS.md`、设计文档、规格目录和统一 harness，但这些入口之间出现了可验证的漂移：已落地规格仍停留在 `accepted` 或使用未定义的 `implemented` 状态，平台基线仍把结果归档写成非目标，默认检查只验证文件存在，无法阻止无效状态、未完成验收或失效内部链接进入主分支。

## 目标

- 明确代码、当前态文档、历史规格和 ADR 各自的事实源边界。
- 让默认 harness 自动拒绝非法规格状态、带未完成验收项的 completed 规格、失效内部 Markdown 链接和误跟踪的敏感运行时文件。
- 修正当前文档与已落地功能之间的已知漂移。

## 非目标

- 不改变视频生成、上传、归档或供应商协议行为。
- 不引入测试框架、外部文档服务或会访问真实供应商的检查。
- 不重写已完成规格中的历史模型数量和当时背景。

## 用户流程

1. 人类或 AI 修改代码、规格或文档。
2. 执行 `pnpm check`，先验证仓库治理契约，再运行 lint 和 typecheck。
3. 契约不一致时，harness 返回非零退出码和具体文件；修复后可继续交付。

## 行为契约

- 规格状态只允许 `draft`、`accepted`、`completed`、`superseded`。
- `completed` 规格不得包含未勾选的 Markdown 验收项。
- 仓库 Markdown 文件的相对文件链接必须指向存在的目标；外部 URL、站内绝对路由和纯锚点不在离线检查范围。
- Git 不得跟踪 `.env`、`.data/`、`.nuxt/`、`.output/` 或 `node_modules/` 下的文件。
- harness 保持离线、无凭据、无付费调用。

## 验收条件

- [x] Given 规格使用未定义状态，When 执行 `pnpm check`，Then repository contract 步骤失败并指出文件和状态。
- [x] Given completed 规格仍有未勾选项，When 执行 `pnpm check`，Then repository contract 步骤失败。
- [x] Given内部 Markdown 链接目标不存在，When 执行 `pnpm check`，Then repository contract 步骤失败并指出来源和目标。
- [x] Given Git 跟踪敏感运行时文件，When 执行 `pnpm check`，Then repository contract 步骤失败。
- [x] 当前 AGENTS、DESIGN、README、docs、spec 与 harness 对事实源和验证范围的描述一致。

## 边界情况

- 外部链接不做网络探测，避免默认验证受网络波动影响。
- 历史规格允许保留已经过时的背景描述；当前态应由 `DESIGN.md`、`docs/`、README 和代码目录表达。
- `accepted` 规格可以包含已勾选与未勾选项，直到全部验收完成后再改为 `completed`。

## 实现提示

优先使用 Node.js 标准库扩展现有 `harness/run.mjs`，不新增依赖。

## 验证计划

- 自动化检查：`pnpm check`、`pnpm check:full`、`git diff --check`。
- 人工检查：审阅 harness 的失败信息以及当前态/历史事实源说明。
- 需要凭据或外部环境的检查：无。

## 上线与回滚

无运行时配置和数据迁移。可独立回滚文档与 repository contract 增强；不会影响已有生成记录。

## 实现结果

- 补齐事实源同步表、生成目录保护和规格状态约定。
- 将已验收规格统一收口为 `completed`，修正结果归档基线描述。
- repository contract 新增规格、链接与敏感运行时文件检查，保持默认验证离线运行。
