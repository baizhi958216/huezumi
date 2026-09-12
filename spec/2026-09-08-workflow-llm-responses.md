# 图片创作大模型连接的 Responses 兼容

- 状态：completed
- 负责人：Codex
- 创建日期：2026-09-08
- 相关 issue / ADR：延续 2026-09-07-image-creation-workflow

## 背景与问题

图片创作副本配置 AnyRouter 后，`ForkVdoPrompt` 固定请求 `/v1/chat/completions`，对 `gpt-6-astra` 返回 HTTP 404。供应商使用指南指定 Responses 协议；现有错误把协议、模型、鉴权和服务端故障统一描述为连接被拒绝，不能指导用户排查。

## 目标

- 工作流连接支持 Chat Completions 和 Responses，已有副本可兼容读取。
- 文字、规则和有序参考图按所选协议传输，仍只向下游输出经过校验的正负提示词。
- 区分协议/模型不支持、鉴权失败、限流、服务故障与无效结果，错误中不包含密钥或上游原始响应。

## 非目标

- 不更换用户模型、Key 或服务商，不绕过供应商客户端访问限制。
- 不增加聊天历史、工具执行、平台生成或计费契约，不扩展图片生成链路。
- 不承诺第三方中转服务的模型可用性、额度或完整标准兼容性。

## 用户流程

1. 用户在现有大模型连接节点填写 Base URL、Key 和模型。
2. 新增协议选项 `auto`、`chat_completions`、`responses`；旧副本缺省为 `auto`。
3. 自动模式先沿用 Chat Completions，只在 HTTP 404/405 时尝试同一地址和模型的 Responses。
4. 成功后展示并传递正负提示词；失败时展示可操作的分类错误。

## 行为契约

- 新控件追加到连接节点现有控件末尾，保留 API Key 的索引和旧控件位置；Python 方法缺省参数支持旧 API prompt。
- 执行端连接可指定 `apiProtocol`，缺省与工作流连接一致。显式协议不自动切换。
- Base URL 的 origin 和 `/v1` 写法保持兼容，不重复添加 `/v1`。
- Responses 将系统规则映射为 `instructions`，用户文本和图片分别映射为 `input_text`、`input_image`；不携带 Chat Completions 专用字段，不创建远端对话状态。
- Responses 支持 JSON 响应和 SSE 完成事件；拒绝失败、不完整或中断的输出。只解析最终消息文本，不把推理或工具调用作为提示词。
- 结构化输出参数被 HTTP 400 拒绝时，同一协议至多重试一次去掉该参数；仍严格校验 JSON 与非空 `positive_prompt`。
- HTTP 401/403、429、5xx、超时、格式错误和已开始的流不触发协议切换或自动重复生成。
- 运行时错误只使用受控状态分类与固定端点路径，不回显 Base URL、Key、请求、上游响应或内部堆栈。

## 验收条件

- [x] 旧六控件副本和新模板均能序列化；旧 Key、模型和连线保持正确。
- [x] Chat Completions 成功、400 格式回退、404/405 协议切换和显式协议覆盖有自动化覆盖。
- [x] Responses 文字、规则、多图顺序、结构化参数与 JSON/SSE 输出解析有自动化覆盖。
- [x] 鉴权、限流、5xx、超时、断流、非法 JSON、空提示词不会继续生成或泄露上游信息。
- [x] Python 节点测试、`pnpm check:full` 和工作流控件人工检查通过；真实服务验证记录实际结果与限制。

## 边界情况

旧工作流、原始 API prompt、免鉴权本地连接、两个协议均 404、上游返回 HTML、SSE 心跳与失败事件、空或截断输出、供应商仅允许指定客户端。

## 验证计划

- 自动化检查：现有 Python unittest 中使用合成素材与 mock HTTP；Vitest 检查控件顺序和模板序列化；`pnpm check:full`。
- 人工检查：刷新节点定义后的协议控件、旧副本加载与失败信息。
- 真实服务：使用用户已配置的 AnyRouter 地址与 Key，保留其选定模型，用最小合成文字请求核对连接，不输出 Key。

## 上线与回滚

更新源节点包并在队列空闲时重启 ComfyUI，刷新节点定义。无数据库迁移；旧工作流按缺省参数读取。回滚节点包时去掉新增协议控件。

## 实现结果

- `nodes.py` 增加 Responses 图文转换、JSON/SSE 完成结果解析、按 HTTP 状态进行有限协议回退，以及不回显上游内容的错误分类。
- `ForkVdoLLMConfig` 追加可选协议字段；内置模板、对象定义 fixture 与序列化测试同步。旧副本的六个控件与 API Key 索引保持不变。
- 验证通过：Python 节点测试 26 项；Vitest 19 项（其中 ComfyUI 8 项）；`pnpm check:full` 包含文档约束、测试、lint、typecheck 与 production build。
- 人工检查：在空队列时重启本地 ComfyUI，刷新节点定义并重新载入已有副本，确认 Base URL、Key 控件、用户选定模型与连线保留，新增协议显示 `auto`。页面实测由原先 Chat Completions 的 404 转为明确的 Responses 指定客户端限制提示，布局可读。
- 真实服务限制：AnyRouter 的 `gpt-6-astra` 标准 Responses 请求仍返回 HTTP 400 / `invalid codex request`；没有获得真实大模型提示词或执行下游图片生成。通用协议修复不能解除该服务的客户端限制。继续使用此服务需另行接入其支持的官方客户端，或选择支持通用 API 的服务；本次没有增加 Codex CLI 依赖。
