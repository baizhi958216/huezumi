# 本机 ComfyUI 与 Docker 基础服务配置

- 状态：completed
- 创建日期：2026-09-12

## 背景与问题

开发 Compose 已包含 PostgreSQL 和 MinIO，但缺少 Redis；环境示例使用容器服务名，宿主机 Nuxt 无法直接连接。需要让本机开发配置与项目现有 ComfyUI 托管能力一致。

## 目标

- PostgreSQL、Redis、MinIO 使用 Docker 持久化卷，仅映射到本机回环地址。
- Nuxt 与项目目录下的 ComfyUI 在宿主机运行；开发 Nuxt 同时消费 Redis 队列。
- 环境示例与文档提供可直接执行的初始化、迁移和启动步骤。

## 非目标

- 不改变生产部署、平台 API、用户权限或供应商配置。
- 不自动下载模型，不执行收费生成，不覆盖已有用户数据或密钥。

## 用户流程

1. 安装 Node 依赖，首次复制环境示例。
2. 启动开发 Compose，等待服务就绪及私有 bucket 初始化成功。
3. 加载 `.env` 执行数据库迁移，按需创建管理员并启动 Nuxt。
4. 管理员在工作流页安装、启动项目内的 ComfyUI。

## 行为契约

开发默认端口为 PostgreSQL 55432、Redis 56379、MinIO API 9100、控制台 9101。Redis 开启 AOF；停止容器保留卷。MinIO 初始化错误必须返回非零状态，等待服务必须有界。开发启用 Redis 时，Nuxt 配置 `NUXT_WORKER_ENABLED=true`；生产仍使用独立 worker。

首次登录的限流请求应等待 Redis 初始连接就绪；单条命令最长等待 5 秒。Redis 不可用时返回受控 503，不跳过限流，也不暴露连接异常。

## 验收条件

- [x] Compose 启动 PostgreSQL、Redis、MinIO，健康检查通过，初始化容器成功退出。
- [x] 宿主机使用 `.env` 完成迁移、Redis 读写及 MinIO 私有对象上传、签名读取、删除验证。
- [x] ComfyUI 安装在 `vendor/ComfyUI`，能启动、返回节点定义并加载项目节点。
- [x] 应用冷启动后的首个登录请求成功；Redis 不可用时限流在有界时间内返回 503。
- [x] `pnpm check:full` 与 `git diff --check` 通过。

## 边界情况

- 端口冲突时修改 Compose 对应变量及 Nuxt 连接地址。
- 已有 `.env` 不可直接覆盖；已有数据卷不可通过 `down -v` 清除。
- 未安装模型时可以加载节点，不能承诺完成真实生图或视频生成。
- 本地 MinIO 地址不能直接提供给要求公网 HTTPS 的供应商。

## 验证计划

执行 Compose 配置校验、真实本地服务探针、迁移、ComfyUI 探活和 `pnpm check:full`。真实供应商及模型生成不在本次配置验收范围。

## 上线与回滚

仅调整开发 Compose 与配置示例；回滚可停止开发容器并恢复本机环境配置，保留数据卷。

## 实现结果

已完成本机服务配置、数据库迁移及管理员创建。三项 Docker 服务健康，MinIO 初始化正常退出；错误凭据初始化返回非零状态。对象存储探针验证上传、匿名 403、签名读取 200 与删除；Redis 验证读写、冷连接并发限流及无响应 5 秒后受控 503。

ComfyUI 安装于忽略的 `vendor/ComfyUI`（commit `7193f56`），使用 Python 3.14.7 / PyTorch 2.14.0，MPS 可用。通过平台 API 验证启动、停止、重启与 7 个项目节点；项目 Python 节点测试 26 项通过。Nuxt 冷启动首个管理员登录与工作流页面正常。`pnpm check:full` 五项检查通过（含 22 项单元测试），`git diff --check` 通过。未下载模型或执行真实供应商生成。
