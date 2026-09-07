# forkvdo prompt nodes

本节点包由 forkvdo 仓库直接维护，提供单次大模型多模态提示词提炼与参考图片集合能力。

## 节点列表

### 1. `ForkVdoImageCollection` (forkvdo 图片集合)

- **类别**：`forkvdo/reference`
- **功能**：将多个上传图片文件或连线图片按严格顺序合并为单个 `IMAGE_COLLECTION`，并按“图1、图2……”顺序编号供大模型理解。
- **插槽输入**：
  - `previous` (`IMAGE_COLLECTION`, 可选)：串联上一个图片集合节点（前序在前、当前节点在后）。
  - `image_1` ~ `image_8` (`COMBO`)：从 ComfyUI `input` 目录选取的图片。
  - `image_1_input` ~ `image_8_input` (`IMAGE`, 可选)：接收张量或批次图片的连线输入。
- **输出**：`IMAGE_COLLECTION`。

### 2. `ForkVdoPrompt` (forkvdo 大模型提示词)

- **类别**：`forkvdo/prompt`
- **功能**：一次性理解自然语言需求与可选参考图，输出 Anima 生图所需的正向与反向提示词。
- **输入参数**：
  - `connection_id`：连接标识（密钥保存在执行端，工作流只存标识）。
  - `model_name`：大模型名称（支持文本模型或视觉多模态模型）。
  - `user_request`：用户自然语言需求（多行文本）。
  - `default_rules`：默认提示词提示词规则。
  - `target_config`：生图目标适配配置（首版为 `anima`）。
  - `refresh_token`：刷新序号（整型）。修改该值会改变缓存哈希，强制大模型重新生成提示词。
  - `reference_images` (`IMAGE_COLLECTION`, 可选)：按集合顺序传入参考图片。
- **输出**：
  - `positive_prompt` (`STRING`)：非空正向提示词。
  - `negative_prompt` (`STRING`)：反向提示词（允许为空）。

---

## OpenAI 兼容协议契约

本节点使用标准的 OpenAI Chat Completions 协议与模型通信。

### 1. 端点格式

- 固定请求路径：`<baseUrl>/chat/completions`（若 `baseUrl` 未以 `/v1` 结尾，自动规范化补齐 `/v1`）。
- 支持协议：`http://` 或 `https://`，不得包含 query 参数或 fragment。

### 2. 鉴权与请求头

- `Authorization: Bearer <apiKey>`
- `Content-Type: application/json`

### 3. 请求体格式

```json
{
  "model": "gpt-4o-mini",
  "temperature": 0.2,
  "messages": [
    {
      "role": "system",
      "content": "You are an expert prompt director for an AI image-generation workflow..."
    },
    {
      "role": "user",
      "content": [
        { "type": "text", "text": "用户需求描述..." },
        { "type": "image_url", "image_url": { "url": "data:image/png;base64,..." } }
      ]
    }
  ],
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "forkvdo_image_prompts",
      "strict": true,
      "schema": {
        "type": "object",
        "additionalProperties": false,
        "properties": {
          "positive_prompt": { "type": "string" },
          "negative_prompt": { "type": "string" }
        },
        "required": ["positive_prompt", "negative_prompt"]
      }
    }
  }
}
```

- **兼容性回退**：若兼容端点因不支持 `response_format` 返回 HTTP 400，节点会自动移除 `response_format` 重试一次，并对响应内容执行严格的 JSON 解析与模式校验。

---

## 安全与连接配置

API Key 与 Base URL 等敏感信息**严禁**保存在工作流 JSON 或浏览器端。

### 环境变量：`FORKVDO_LLM_CONNECTIONS_JSON`

JSON 结构如下：

```json
{
  "openai-main": {
    "baseUrl": "https://api.openai.com",
    "apiKey": "sk-...",
    "supportsVision": true,
    "defaultModel": "gpt-4o-mini",
    "maxImages": 8,
    "maxImageBytes": 20971520,
    "maxTotalImageBytes": 62914560,
    "timeoutSeconds": 120
  }
}
```

### 进程间配置传递

1. **本地 ComfyUI**：在 Nuxt 的 `.env` 中填写 `NUXT_COMFYUI_LLM_CONNECTIONS_JSON`。Nuxt 启动 ComfyUI 子进程时，通过私有环境变量将其注入子进程的 `FORKVDO_LLM_CONNECTIONS_JSON`。
2. **远程 ComfyUI**：在远程 ComfyUI 宿主机环境中直接设置 `FORKVDO_LLM_CONNECTIONS_JSON` 环境变量。
