# 平台配置

## 后台操作

`/admin/settings` 默认展示连接列表、运营摘要和文本价格。通过「新建连接 / 编辑」「编辑设置」「发布价格」打开对应弹窗；连接历史版本和只读部署状态也按需查看。`/admin` 的视频价格发布与用户额度调整使用独立弹窗，页面保留用户、价格和任务列表。

编辑弹窗使用临时草稿：取消或关闭后重开恢复已保存值，提交失败在弹窗内保留输入并提示错误，保存成功后关闭并更新摘要。提交期间禁用表单和关闭操作，避免重复提交；连接凭据不回显，关闭弹窗即清空临时密钥。

## 本机开发

`.env.example` 仅列出部署必要项。启动 PostgreSQL 和 SeaweedFS 后，执行：

```bash
node --env-file=.env --import tsx scripts/db-migrate.ts
pnpm config:import -- --compact-env
node --env-file=.env --import tsx scripts/backfill-platform.ts
pnpm config:check
pnpm dev
```

导入工具从旧环境配置读取供应商、文本连接和运营设置，创建加密连接版本；重复执行不覆盖后台修改。未单独配置文本连接时，仅在这次导入中复制旧 ComfyUI 默认连接，之后两者独立。工具不设置商业价格；管理员必须在 `/admin/settings` 发布每个文本模型与篇幅的价格。

首次导入自动生成缺失的加密主密钥。写回前生成 `.env.backup-*` 私有备份，权限为 `0600`；导入失败不提交数据库事务。Git 与 Docker 均忽略这些备份。请保管原始数据库备份和主密钥，不要把主密钥加入公开配置。每次更换部署机器，Web/worker 必须使用原主密钥；直接更换会使已有连接无法解密。

数据库是文本/图片/视频/Agent 连接、用途分配、默认模型、注册方式、赠送额度、并发任务上限和平台日预算的唯一事实源。平台提交的 ComfyUI 任务也从数据库读取连接；旧执行端环境变量仅用于独立运行的兼容场景，导入工具暂时保留这些旧项。

## 生产

以 `.env.production.example` 为模板，在部署目录填写私有基础设施配置。生产 Compose 显式把主密钥、数据库及 OSS 配置传给应用进程；ComfyUI 挂载模型卷，通过任务的私有数据接收所需连接快照，无需配置供应商 Key。`NUXT_WORKER_CONCURRENCY` 为唯一 worker 并发覆盖名。

```bash
docker compose -f docker-compose.production.yml config --quiet
docker compose -f docker-compose.production.yml up -d --build
```

Web 不消费队列，worker 消费旧视频和新文本/工作流消息。已有部署应先备份、迁移、导入与回填，然后切换匹配版本。`docker-compose.yml` 仅是旧单进程入口，不代表完整生产拓扑。

## 高级覆盖项

| 分组         | 配置项                                                                                                   | 默认值/作用                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 数据库容器   | `POSTGRES_DB`、`POSTGRES_USER`、`POSTGRES_HOST_PORT`                                                     | 新安装 huezumi / huezumi / 55432（旧默认保留）                                |
| 队列         | `NUXT_WORKER_ENABLED`、`NUXT_WORKER_CONCURRENCY`                                                         | false / 4；本地示例启用 worker                                                |
| 对象存储     | `NUXT_OSS_PUBLIC_BASE_URL`、`NUXT_OSS_PREFIX`、`NUXT_OSS_OUTPUT_PREFIX`                                  | 展示地址、uploads/outputs 前缀                                                |
| 归档         | `NUXT_OSS_MAX_OUTPUT_BYTES`、`NUXT_OSS_TRANSFER_TIMEOUT_MS`                                              | 1 GiB / 300000 ms                                                             |
| 签名         | `NUXT_OSS_SIGNED_URL_TTL_SECONDS`                                                                        | 86400 秒；供应商仍需公网 HTTPS 可达                                           |
| 本地存储容器 | `LOCAL_OSS_BUCKET`、`LOCAL_OSS_API_PORT`、`LOCAL_OSS_CONSOLE_PORT`                                       | 新安装 huezumi / 9100 / 9101（旧默认保留）                                    |
| ComfyUI 本地 | `NUXT_COMFYUI_DIR`、`NUXT_COMFYUI_PYTHON`、`NUXT_COMFYUI_HOST`、`NUXT_COMFYUI_PORT`、`NUXT_COMFYUI_ARGS` | vendor/ComfyUI、自动发现解释器、127.0.0.1、8188、无额外参数                   |
| ComfyUI 远程 | `NUXT_COMFYUI_MODE`、`NUXT_COMFYUI_REMOTE_BASE_URL`                                                      | 生产要求 remote 和私有地址                                                    |
| ComfyUI 开发 | `NUXT_COMFYUI_CUSTOM_NODE_SOURCE_DIR`、`NUXT_COMFYUI_START_TIMEOUT_MS`、`NUXT_COMFYUI_PROBE_TIMEOUT_MS`  | 项目自定义节点、180000 / 1500 ms                                              |
| ComfyUI 连接 | `NUXT_COMFYUI_LLM_CONNECTIONS_JSON`、`NUXT_DASHSCOPE_*`                                                  | 宿主机注入子进程；remote 使用 `HUEZUMI_LLM_CONNECTIONS_JSON` 与 `DASHSCOPE_*` |

## 在管理面板配置 API 与用途

1. 打开 `/admin/settings`，点击「新建连接」，选择文本、图片 API 或视频类型，填写 Base URL、模型列表、默认模型和 Key。视频保留各供应商适配器；文本使用 Chat Completions / Responses；图片使用 OpenAI-compatible `/images/generations`。
2. 打开「用途分配与设置」，分别选择文本创作、图片 API、视频创作、工作流视频（百炼）和工作流 Agent 的连接。可以为同一供应商建立多条连接，使用不同地址和 Key。
3. 保存后，新报价和新提交的工作流使用当前连接版本。编辑连接时 Key 留空沿用旧值；已提交任务保留原快照。停用或撤销的连接不能用于新任务。

工作流库新增「图片 API · 后台连接」，通过 `HuezumiApiImage` 节点生成图片并保存输出。该入口目前支持文生图，图片服务需支持 `/images/generations`，并返回 `data[0].b64_json` 或 HTTPS 图片 URL；可用尺寸取决于供应商。现有本地 Qwen Image 工作流继续使用本地模型，Agent 单独使用分配的文本连接。Wan 3.0 工作流使用「工作流视频」中的百炼连接。

首次升级需更新本地/远程 ComfyUI 的 `huezumi_prompt` 节点包并重启一次。此后修改 API、Key 或用途分配无需重启。平台在发送任何凭据前检查执行端是否支持私有连接；旧节点包会被拒绝并提示升级。连接随任务放入 ComfyUI 的敏感数据槽，不写入节点输入、工作流、图片元信息、公开队列或历史；执行上下文按任务隔离，结束后清除。ComfyUI 应仅供平台通过私有网络访问。

Agent 可选择支持视觉和联网检索的文本连接；需要联网时使用 Responses 或自动协议。未分配 Agent 时 Qwen Agent 使用离线规则，`manual` 提示词节点也可独立运行。平台提交不会回退到 `.env` 中的旧供应商配置。

`.env` 仍需保留数据库、对象存储、执行端地址和 `NUXT_CONNECTION_ENCRYPTION_KEY` 等基础设施配置。加密主密钥只配置一次，不能随 API Key 一起更换；数据库备份应与主密钥一起保管。图片 API 工作流沿用现有工作流任务的免平台额度结算方式，供应商仍可能计费。

不需要覆盖默认值时不必写入 `.env`。平台后台不会修改这些部署项。配置检查只报告项名、存在性和来源，不打印值。

## 历史 OSS 恢复

恢复工具只读取明确的 `HUEZUMI_LEGACY_*` 配置（如 `HUEZUMI_LEGACY_ACCESS_KEY_ID`、`HUEZUMI_LEGACY_BUCKET`），不再从当前 `NUXT_OSS_*` 猜测旧连接，也不支持依靠同名变量的前后顺序选择配置。原有历史播放地址保持兼容。

英文工程名与变量、节点、存储迁移策略见 [Huezumi 工程命名](engineering-name.md)。
