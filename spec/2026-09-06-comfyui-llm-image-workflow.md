# ComfyUI 单次多模态提示词生图工作流

- 状态：completed
- 创建日期：2026-09-06
- 范围：管理员工作流画布、仓库维护的 ComfyUI 自定义节点包、Anima 图片工作流

## 目标

在一次独立的 ComfyUI 工作流执行中，把用户需求和可选的有序参考图片交给大模型，得到经过运行时校验的 `positive_prompt` 与 `negative_prompt`，再连接到现有 Anima 生图链路。工作流不使用聊天历史；重新运行时只使用当前图上的输入。

## 非目标

- 不把提示词工作流并入视频 `GenerationRequest` 或普通生成任务系统。
- 不在浏览器或工作流 JSON 中保存 API Key、Base URL 或上游响应。
- 不承诺任意 HTTP API 地址兼容；首版只支持文档中规定的 OpenAI Chat Completions 兼容请求。
- 不在仓库提交 ComfyUI、模型、用户图片或运行时目录修改。

## 行为契约

- `ForkVdoImageCollection` 提供最多 8 个文件槽和最多 8 个 `IMAGE` 连线槽；多个集合节点可以通过 `previous` 串联，前序素材在前、当前节点素材在后。
- 图片集合输出为 `IMAGE_COLLECTION`，不自动拆成多个生图任务。空集合是合法的，提示词节点也可不连接图片。
- `ForkVdoPrompt` 的输入为连接标识、模型名、用户需求、默认规则、`anima` 目标配置、刷新编号和可选图片集合；输出只有 `STRING` 类型的 `positive_prompt`、`negative_prompt`。
- 图片存在时，连接配置必须声明 `supportsVision: true`；图片数量、单图大小和总大小按连接配置校验，超限明确失败。
- 结构化请求优先发送 `response_format: { type: "json_schema", ... }`；兼容端点因不支持该参数返回 400 时，重试一次不带该参数的同一请求。两种情况下都只接受 JSON 对象，并要求非空字符串 `positive_prompt`，`negative_prompt` 缺失或 null 视为空字符串。
- 固定端点为 `<baseUrl>/v1/chat/completions`，其中 `baseUrl` 只能是 `http(s)` origin 或以 `/v1` 结尾的地址；请求体使用 OpenAI Chat Completions 的 `messages`、`model`、`temperature` 和可选 `response_format` 字段。
- `refresh_token` 变化会使提示词节点重新执行。画布与节点卡片均提供“重新生成提示词”按钮；普通运行允许 ComfyUI 复用已经成功的提示词，以便下游生图失败后重试。
- 自定义节点通过 `ui` 执行事件返回本次正负提示词，画布右侧与节点卡片区分“本次新生成”“复用成功提示词”和“生成失败”等执行状态。

## 安全配置

Nuxt 私有 runtime config 使用 `NUXT_COMFYUI_LLM_CONNECTIONS_JSON` 把连接配置注入本地 ComfyUI 子进程的 `FORKVDO_LLM_CONNECTIONS_JSON` 环境变量；remote 模式必须在远程 ComfyUI 执行端设置同名 `FORKVDO_LLM_CONNECTIONS_JSON`。工作流只保存连接标识和模型名。

连接值形如：

```json
{
  "openai-main": {
    "baseUrl": "https://api.openai.com",
    "apiKey": "仅写在 ComfyUI 执行端环境",
    "supportsVision": true,
    "defaultModel": "gpt-4o-mini",
    "maxImages": 8,
    "maxImageBytes": 20971520,
    "timeoutSeconds": 120
  }
}
```

## 验收条件

- [x] 能在画布中添加图片集合节点，上传/选择多张图片，按“图1、图2……”顺序预览，并把多个集合节点按连线顺序合并。
- [x] 无图片连接时可独立执行文字模式；有图片但连接不支持视觉、文件数量/大小超限时明确失败。
- [x] 大模型节点输出经过结构化运行时校验；连接失败、超时、非 JSON、空正向提示词不会继续执行下游节点。
- [x] 正负提示词能分别连到 Anima 的两个 `CLIPTextEncode.text` 输入；保存、导入、导出、重新加载后混合文本输入的连线和控件值保留。
- [x] 提供文字模式、参考图模式和原图编辑模式的可加载 Anima 示例工作流。
- [x] 重新生成提示词会改变刷新编号并绕过 ComfyUI 缓存；下游失败后普通运行可复用成功提示词。
- [x] 文档明确本地/remote 自定义节点安装方式、OpenAI 兼容端点和私密配置边界。

## 验收结果与实现事实

- `comfyui/custom_nodes/forkvdo_prompt/`：包含 `ForkVdoImageCollection` 与 `ForkVdoPrompt`，支持严格的结构化 schema 请求、运行时校验、容错回退、图片数量/体积限制与缓存控制。
- `workflows/anima-llm-prompt-generate.json` 与 `workflows/anima-llm-multi-image-edit.json`：设为公开工作流，覆盖自然语言多模态生图以及原图参与编辑/局部重绘场景。
- `server/services/comfyui/workflows.ts`：将内置公开模板与数据库记录无缝聚合，在画布左侧“公开工作流”面板即时呈现。
- `app/components/workflow/`：增强节点卡片缩略图、连线标识、状态徽章与检查器提示词预览，支持一键复制与重新生成提示词。

## 遗留边界

ControlNet、局部重绘、放大和额外模型仍由 ComfyUI 已安装的原生/自定义节点提供；本变更提供可连接的原图编辑模板和现有节点库入口，不把第三方模型下载器或通用自动选模系统引入平台。
