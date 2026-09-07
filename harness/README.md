# 工程验证 Harness

Harness 为人类、AI 和 CI 提供同一个确定性验证入口，不读取真实供应商凭据，也不会发起付费生成请求。

```bash
pnpm check
pnpm check:full
node harness/run.mjs --list
```

默认模式依次执行仓库约束检查、无网络单元测试、lint 和 typecheck。仓库约束会检查必需工程文件与脚本、规格状态、已完成规格的验收勾选、内部 Markdown 链接、关键忽略项，以及是否误跟踪 `.env` / `.data` 等运行时文件。`--full` 额外执行 production build。输出以步骤为单位，任何一步失败都会立即停止并保留原命令退出码。

需要 Docker 或外部服务的检查应使用单独显式模式，不能让默认 harness 隐式消费额度。
