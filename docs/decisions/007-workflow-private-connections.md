# ADR-007：平台工作流使用任务级私有连接

- 状态：accepted（基于当前实现补录）
- 记录日期：2026-09-22；不追溯推定原实施日期
- 部分取代：[ADR-006](006-platform-governance.md) 的 ComfyUI 独立配置描述
- 关联规格：[平台基线](../../spec/2026-09-22-platform-baseline.md)

## 背景

当前实现已将平台工作流的 Agent、图片和视频用途纳入后台连接治理。把密钥放在公共图或共享进程全局变量中不能表达每个提交的配置边界。

## 决策

平台提交按用途读取连接版本并创建快照，检查执行端私有连接能力，通过 ComfyUI 敏感数据槽传递；节点按任务读取上下文，结束清理。平台连接不写节点 inputs、workflow JSON、PNG 元信息或公开队列/历史。

独立 ComfyUI 仍保留环境配置，旧手动 HuezumiLLMConfig 副本仍兼容，但平台管理连接不隐式回退到它们。平台任务密钥更新无需重启执行端；节点包升级需重启一次。

## 后果

后台配置成为统一来源，执行端需匹配节点包并保持私有网络。手动连接图仍有导出密钥风险，公共模板不能携带真实凭据。工作流免平台额度结算不表示外部 API 免费。

## 验证依据

当前代码为 `server/services/platform/workflow-connections.ts`、`server/services/comfyui/client.ts` 和 `comfyui/custom_nodes/huezumi_prompt/runtime_connections.py`。现有 TypeScript/Python 测试覆盖分配、私有传输及上下文隔离；本轮结果见 [检查记录](../project-audit.md)，不代替真实执行端端到端验证。
