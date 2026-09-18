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

数据库是视频/文本连接、默认模型、注册方式、赠送额度、并发任务上限和平台日预算的唯一事实源。ComfyUI 继续使用独立执行端配置；导入不会删除它需要的百炼变量或 LLM JSON。

## 生产

以 `.env.production.example` 为模板，在部署目录填写私有基础设施配置。生产 Compose 显式把主密钥、数据库及 OSS 配置传给应用进程；ComfyUI 只接收自己的连接和模型卷。`NUXT_WORKER_CONCURRENCY` 为唯一 worker 并发覆盖名。

```bash
docker compose -f docker-compose.production.yml config --quiet
docker compose -f docker-compose.production.yml up -d --build
```

Web 不消费队列，worker 消费旧视频和新文本/工作流消息。已有部署应先备份、迁移、导入与回填，然后切换匹配版本。`docker-compose.yml` 仅是旧单进程入口，不代表完整生产拓扑。

## 高级覆盖项

| 分组         | 配置项                                                                                                   | 默认值/作用                                                                   |
| ------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| 数据库容器   | `POSTGRES_DB`、`POSTGRES_USER`、`POSTGRES_HOST_PORT`                                                     | 本地 forkvdo / forkvdo / 55432                                                |
| 队列         | `NUXT_WORKER_ENABLED`、`NUXT_WORKER_CONCURRENCY`                                                         | false / 4；本地示例启用 worker                                                |
| 对象存储     | `NUXT_OSS_PUBLIC_BASE_URL`、`NUXT_OSS_PREFIX`、`NUXT_OSS_OUTPUT_PREFIX`                                  | 展示地址、uploads/outputs 前缀                                                |
| 归档         | `NUXT_OSS_MAX_OUTPUT_BYTES`、`NUXT_OSS_TRANSFER_TIMEOUT_MS`                                              | 1 GiB / 300000 ms                                                             |
| 签名         | `NUXT_OSS_SIGNED_URL_TTL_SECONDS`                                                                        | 86400 秒；供应商仍需公网 HTTPS 可达                                           |
| 本地存储容器 | `LOCAL_OSS_BUCKET`、`LOCAL_OSS_API_PORT`、`LOCAL_OSS_CONSOLE_PORT`                                       | forkvdo / 9100 / 9101                                                         |
| ComfyUI 本地 | `NUXT_COMFYUI_DIR`、`NUXT_COMFYUI_PYTHON`、`NUXT_COMFYUI_HOST`、`NUXT_COMFYUI_PORT`、`NUXT_COMFYUI_ARGS` | vendor/ComfyUI、自动发现解释器、127.0.0.1、8188、无额外参数                   |
| ComfyUI 远程 | `NUXT_COMFYUI_MODE`、`NUXT_COMFYUI_REMOTE_BASE_URL`                                                      | 生产要求 remote 和私有地址                                                    |
| ComfyUI 开发 | `NUXT_COMFYUI_CUSTOM_NODE_SOURCE_DIR`、`NUXT_COMFYUI_START_TIMEOUT_MS`、`NUXT_COMFYUI_PROBE_TIMEOUT_MS`  | 项目自定义节点、180000 / 1500 ms                                              |
| ComfyUI 连接 | `NUXT_COMFYUI_LLM_CONNECTIONS_JSON`、`NUXT_DASHSCOPE_*`                                                  | 宿主机注入子进程；remote 使用 `FORKVDO_LLM_CONNECTIONS_JSON` 与 `DASHSCOPE_*` |

不需要覆盖默认值时不必写入 `.env`。平台后台不会修改这些部署项。配置检查只报告项名、存在性和来源，不打印值。

## 历史 OSS 恢复

恢复工具只读取明确的 `FORKVDO_LEGACY_OSS_*` 配置，不再从当前 `NUXT_OSS_*` 猜测旧连接，也不支持依靠同名变量的前后顺序选择配置。原有历史播放地址保持兼容。
