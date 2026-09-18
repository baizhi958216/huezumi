# 本地对象存储改用 SeaweedFS

- 状态：completed
- 创建日期：2026-09-12
- 相关 ADR：[ADR-003](../docs/decisions/003-seaweedfs-local-storage.md)

## 背景与问题

用户要求在 RustFS 与 SeaweedFS 中选择本地对象存储，彻底替换 MinIO。项目已经通过 AWS S3 SDK 封装兼容存储，不需要改变平台素材或生成记录契约。

## 目标

- 开发 Compose 使用固定版本 SeaweedFS 单容器，去除 MinIO 服务与 mc 初始化容器。
- 保持已有 S3 Endpoint 端口、对象 key、私有读取与签名契约。
- 核实旧 bucket 数据后切换，保留旧 volume，不丢失素材。

## 非目标

- 不更改云端阿里云存储能力，不承诺完整 AWS S3 API 兼容。
- 不直接挂载 MinIO 数据卷到 SeaweedFS，不下载生成模型。
- 本规格仅处理对象存储；任务队列的变更独立决定。

## 用户流程

1. 合并 `.env.example` 中的本机配置。
2. 启动开发 Compose；SeaweedFS 自动初始化带认证的 S3 bucket。
3. 宿主机 Nuxt 继续通过 `127.0.0.1:9100` 上传与签名读取；管理界面通过 `127.0.0.1:9101` 登录。

## 行为契约

- 固定 `chrislusf/seaweedfs:4.46`，使用 `mini`、独立持久化卷、仅回环映射 S3 与管理员界面。
- 必须配置非空 S3 凭据和管理员密码；关闭不需要的 WebDAV、Iceberg 与 Lance 服务。
- 复用 `LOCAL_OSS_*` 与私有 `NUXT_OSS_*` 配置；无客户端凭据、无公开 bucket。
- 健康检查检查 S3 就绪；对象存储实测涵盖上传、私有 ACL、HEAD、Range、签名 GET、删除与重启持久性。
- 历史 spec / ADR 保留 MinIO 作为历史记录，当前配置与运行时代码不再依赖 MinIO。

## 验收条件

- [x] Compose 配置无 MinIO 服务或 mc 镜像，SeaweedFS 正常启动且启用 S3 / 管理界面认证。
- [x] 现有对象封装的上传与文件流上传成功；匿名 GET 拒绝、签名 GET / HEAD / Range 成功，删除有效。
- [x] 重启 SeaweedFS 后测试对象仍可读取；测试对象最终清除，原 MinIO volume 保留。
- [x] Nuxt 管理员登录及 ComfyUI 仍正常；`pnpm check:full` 与 `git diff --check` 通过。

## 边界情况

空凭据必须在 Compose 配置阶段失败。MinIO bucket 非空时需停写并通过 S3 复制、核对 key / 大小 / 内容后切换，不能共享底层数据目录。仅存储在本机的 HTTP 签名 URL 不能交给要求公网 HTTPS 的云供应商。

## 验证计划

真实 Docker / S3 SDK 探针验证成功和失败路径，执行完整工程检查。无需供应商 API 或模型权重。

## 上线与回滚

仅切换本机存储服务；保留旧数据卷。已有部署先导出环境配置并停写；回滚时恢复原端点及匹配存储服务，切换后新增对象需先复制回去。

## 实现结果

已切换为 `chrislusf/seaweedfs:4.46`，删除 MinIO / mc 容器与当前编排依赖，保留旧卷。切换前原 bucket 为空，无用户对象需要搬迁。S3 / 管理界面认证均已实测；原封装的字节上传、流式上传、私有 GET 拒绝、签名 GET、HEAD、Range 206、错误签名拒绝、删除与重启持久性全部通过。探针对象已清除。

宿主机 Nuxt 登录、工作流及 ComfyUI MPS / 7 个项目节点正常。Redis 移除另由 [PostgreSQL 队列规格](2026-09-12-postgres-queue.md) 完成。完整工程检查通过，未下载模型或执行收费生成。
