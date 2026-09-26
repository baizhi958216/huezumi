# 平台配置

## 配置来源

| 来源                   | 内容                                                     | 修改方式                           |
| ---------------------- | -------------------------------------------------------- | ---------------------------------- |
| 私有 `.env` / 部署环境 | 数据库、主密钥、对象存储、worker、ComfyUI 地址           | 运维配置并重启对应进程             |
| PostgreSQL             | 文本/图片/视频连接、连接版本、用途分配、价格、注册和预算 | 管理后台                           |
| 工作流 JSON            | 节点、连线、模型文件选择和任务输入                       | 管理员编辑器；公共模板不含真实密钥 |

平台请求不会回退读取旧供应商环境配置。独立 ComfyUI 的环境连接仅用于非平台任务兼容，见 [节点指南](../comfyui/custom_nodes/huezumi_prompt/README.md)。

## 必要基础设施配置

以 [.env.example](../.env.example) 和 [.env.production.example](../.env.production.example) 为准。`nuxt.config.ts` 定义可覆盖的 runtime config；不是每个 Nuxt 覆盖项都已经在生产 Compose 中透传，新增覆盖时要同步检查 Compose。

| 配置                                                                      | 作用 / 默认                                                  |
| ------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `NUXT_DATABASE_URL`                                                       | PostgreSQL URL，必需；生产 Compose 从 POSTGRES_* 组装        |
| `NUXT_CONNECTION_ENCRYPTION_KEY`                                          | 32 字节随机值的标准 Base64；Web/worker 一致，随备份保管      |
| `NUXT_PUBLIC_APP_URL`                                                     | 默认 `http://localhost:3000`；生产填写实际 HTTPS 地址        |
| `NUXT_WORKER_ENABLED`                                                     | 默认 false；开发示例 true，生产 web=false、worker=true       |
| `NUXT_WORKER_CONCURRENCY`                                                 | 默认 4，运行期限定 1–32                                      |
| `NUXT_OSS_ACCESS_KEY_ID`、`NUXT_OSS_ACCESS_KEY_SECRET`、`NUXT_OSS_BUCKET` | 应用访问私有存储的凭据与桶                                   |
| `NUXT_OSS_REGION`、`NUXT_OSS_ENDPOINT`、`NUXT_OSS_SECURE`                 | 阿里云 OSS 或 S3 兼容端点；本地示例 us-east-1 / HTTP / false |
| `NUXT_OSS_PREFIX`、`NUXT_OSS_OUTPUT_PREFIX`                               | 默认 `huezumi/uploads` / `huezumi/outputs`                   |
| `NUXT_OSS_PUBLIC_BASE_URL`                                                | 上传展示地址覆盖，不替代鉴权与签名                           |
| `NUXT_OSS_MAX_OUTPUT_BYTES`                                               | 默认 1073741824（1 GiB），归档大小上限                       |
| `NUXT_OSS_TRANSFER_TIMEOUT_MS`                                            | 默认 300000，归档传输超时                                    |
| `NUXT_OSS_SIGNED_URL_TTL_SECONDS`                                         | 默认 86400；供应商还需在有效期内可访问                       |

开发 Compose 使用 `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD`、`POSTGRES_HOST_PORT`（55432）、`LOCAL_OSS_BUCKET` / `LOCAL_OSS_ACCESS_KEY_ID` / `LOCAL_OSS_ACCESS_KEY_SECRET`、`LOCAL_OSS_API_PORT`（9100）和 `LOCAL_OSS_CONSOLE_PORT`（9101）。Nuxt 的连接值必须与之匹配。

## ComfyUI 配置

| 配置                                                             | 作用 / 默认                                                     |
| ---------------------------------------------------------------- | --------------------------------------------------------------- |
| `NUXT_COMFYUI_MODE`                                              | auto/local/remote；默认 auto，生产必须 remote                   |
| `NUXT_COMFYUI_REMOTE_BASE_URL`                                   | remote 私有执行端地址；生产 Compose 为 `http://comfyui:8188`    |
| `NUXT_COMFYUI_DIR`、`NUXT_COMFYUI_PYTHON`                        | 本地目录默认 vendor/ComfyUI；目录内 venv 优先于显式 Python 路径 |
| `NUXT_COMFYUI_HOST`、`NUXT_COMFYUI_PORT`                         | 默认 127.0.0.1 / 8188                                           |
| `NUXT_COMFYUI_ARGS`                                              | 本地启动附加参数                                                |
| `NUXT_COMFYUI_CUSTOM_NODE_SOURCE_DIR`                            | 自定义节点源目录覆盖                                            |
| `NUXT_COMFYUI_START_TIMEOUT_MS`、`NUXT_COMFYUI_PROBE_TIMEOUT_MS` | 默认 180000 / 1500                                              |
| `COMFYUI_MODELS_DIR`                                             | 生产 Compose 必填的宿主模型路径，只读挂载                       |
| `COMFYUI_REF`                                                    | 生产 Compose / 执行端镜像基线为 v0.37.0                         |

独立执行端兼容项包括 `HUEZUMI_LLM_CONNECTIONS_JSON` 与 `HUEZUMI_DASHSCOPE_*`；本地 Nuxt 启动子进程可接收 `NUXT_COMFYUI_LLM_CONNECTIONS_JSON` 与兼容 `NUXT_DASHSCOPE_*`。这些不是当前平台连接的推荐配置方式，生产 Compose 不向 ComfyUI 传平台主密钥或供应商环境 Key。

## 后台连接与价格

1. 管理员在 `/admin/services` 新建连接，类型为 text、image 或 video，填写供应商、模型列表、默认模型和凭据。默认模型从列表中选择；若历史配置的默认模型已不在列表中，需要重新选择后才能保存。
2. 文本连接支持自动 / Chat Completions / Responses；联网要求 Responses 或自动协议及上游工具支持。独立图片台使用 dashscope 连接，OpenAI-compatible 图片连接用于 `HuezumiApiImage` 工作流。
3. 分配文本、图片、视频、工作流 Agent 和工作流视频用途；创作台仅使用对应连接的默认模型，不展示平台和模型选择。未分配、连接停用或默认模型缺价时不回退其他模型。调整连接的默认模型即可变更该用途的新报价；已生成报价和已受理任务保持原快照。工作流视频要求百炼。默认图片连接同时供图片工作流使用，选 OpenAI-compatible 不会让它进入独立图片台报价目录。
4. 在 `/admin/pricing` 为文本连接的每个模型/篇幅发布固定价格，为图片模型发布正数按张价格，为视频发布匹配 provider/model/resolution 的规则。不能把图片按张公式与视频按秒公式混用。
5. 在 `/admin/settings` 配置注册方式（默认 invite）、赠送额度（0）、用户活动任务上限（3）和平台日预算（100000）。这些值由数据库保存，旧 `NUXT_REGISTRATION_MODE` 等不是运行期覆盖。

生成服务页先展示用途分配，下方统一维护连接；工作流 Agent 复用文本连接编辑器，不再有另一套凭据表单。用途可单独更换或移除；运营设置按字段保存，保留未编辑项，已停用的历史分配不会阻止修改无关运营策略。价格按文本、图片、视频切换，默认每组展示最新版本，可展开历史；视频时长档位使用逐行输入。

编辑使用临时草稿，失败保留输入。凭据不回显，更新时省略 secrets 沿用原值；保存连接产生新版本，新报价使用新版本，既有任务保留原引用。显式撤销版本会把相关未完成文本/图片/视频任务转为待核对。

Agent 未分配时 Qwen Agent 可走离线规则；普通 `HuezumiPrompt` 选择非 manual 且没有手动连接时需要分配后台 Agent。不要把两者的降级行为混为一谈。

## 主密钥与检查

更换 API Key 应编辑连接；不要同时更换加密主密钥。丢失或直接替换主密钥将导致既有连接无法解密。后台只读部署页展示存在性，配置检查不打印配置值：

```bash
pnpm config:check
# 在已具备生产运行期变量的环境中执行
pnpm config:check --production
```

`--production` 还检查 OSS 必要项、remote 模式和执行端地址。宿主 `.env.production.example` 没写完整的容器运行期变量；Compose 会注入数据库 URL 与 remote 地址，因此不能把宿主直接执行检查的结果等同于容器配置。

旧配置导入会备份并可能重写 `.env`，只在迁移场景按 [运维指南](operations.md) 执行。工程标识见 [命名约定](engineering-name.md)。
