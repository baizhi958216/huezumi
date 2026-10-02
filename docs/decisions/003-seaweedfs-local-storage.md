# ADR-003：本地对象存储选择 SeaweedFS

- 状态：accepted
- 日期：2026-09-12
- 决策者：项目维护者授权选择
- 原关联规格：`spec/2026-09-12-seaweedfs-local-storage.md`（未随当前检出提供）

## 背景

本项目的对象存储需求是私有素材上传、视频归档、短期签名读取与 Range 播放。用户要求以 RustFS 或 SeaweedFS 替换 MinIO，本机优先考虑可维护性与部署复杂度。

## 决策

使用固定版本 `chrislusf/seaweedfs:4.46` 的 `weed mini`，使用独立 volume 和 S3 认证，保留现有 AWS SDK 抽象与本机端口。部署前实测项目使用的 S3 操作，不将厂商兼容性声明视为应用验收。

## 备选方案

| 方案       | 适配点                                                          | 本次取舍                                                                               |
| ---------- | --------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| SeaweedFS  | 官方 mini 模式支持单机、S3、自动建桶与管理界面；4.46 为正式发布 | 选择；关闭不需要的附加协议，只暴露本机 S3 和管理端口                                   |
| RustFS     | 单节点模式、S3 与 Web Console，可沿用 AWS SDK                   | 当时核对的 1.0.0-rc.6 为预发布；本次优先正式版本，不依据 Rust 语言或宣传跑分判断稳定性 |
| 保留 MinIO | 已跑通现有封装                                                  | 不符合用户明确的替换要求                                                               |

依据：2026-09-12 核对的 [SeaweedFS mini 指南](https://github.com/seaweedfs/seaweedfs/wiki/Quick-Start-with-weed-mini)、[SeaweedFS 4.46 发布](https://github.com/seaweedfs/seaweedfs/releases/tag/4.46)、[RustFS 发布记录](https://github.com/rustfs/rustfs/releases)、[RustFS 能力说明](https://github.com/rustfs/rustfs)。

## 后果

### 正面

- 单个存储容器自动初始化，去除 MinIO mc 辅助容器。
- 平台 API 与数据库中的对象 key 保持不变。

### 负面与风险

- SeaweedFS 内部仍有 master / volume / filer 组件；单容器不意味着高可用。
- 必须备份整个数据卷，不能只备份业务 PostgreSQL。
- S3 接口兼容不代表底层文件格式兼容，历史对象要通过 S3 搬迁。

## 验证与复审

验证私有读取、签名、HEAD、Range、文件流上传、删除与重启持久性。版本升级前重复该组验证；本地容量或高可用要求改变时重新评估拓扑。
