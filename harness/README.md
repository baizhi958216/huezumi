# 工程验证 Harness

Harness 为人类、AI 和 CI 提供同一个确定性验证入口，不读取真实供应商凭据，也不会发起付费生成请求。

```bash
pnpm check
pnpm check:full
node harness/run.mjs --list
```

默认模式依次执行仓库约束检查、lint 和 typecheck。`--full` 额外执行 production build。输出以步骤为单位，任何一步失败都会立即停止并保留原命令退出码。

后续引入测试框架时，把稳定、无网络、无凭据的测试命令加入默认步骤；需要 Docker 或外部服务的检查应使用单独显式模式，不能让默认 harness 隐式消费额度。
