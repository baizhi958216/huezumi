# 本地对象存储与 ComfyUI 模型验证

- 状态：accepted
- 日期：2026-09-06

## 背景

开发阶段不应因为测试素材、模型或生成结果产生阿里云 OSS 流量费用。项目当前使用 `ali-oss` SDK，需要一个本机可运行的 OSS 兼容服务，并需要在不把模型上传到对象存储的前提下验证 ComfyUI 生图。

## 本阶段目标

- 通过 Docker Compose 提供本地 MinIO API、控制台和持久化 volume。
- 让服务端对象存储封装同时支持阿里云 OSS 与本地 MinIO HTTP Endpoint。
- 从 Civitai 选择带 SafeTensors 文件的主流 SD1.5 二次元 checkpoint，下载到本机 ComfyUI 模型目录。
- 使用本机 ComfyUI 的最小文生图工作流进行验证，并区分下载成功、模型加载成功和完整出图成功。

## 明确不做

- 不把模型文件上传到阿里云 OSS、MinIO 或平台用户空间。
- 不在没有明确凭据的情况下访问需要鉴权的 Civitai 下载地址。
- 不以 SDXL、Flux 或视频模型作为首轮 Mac/MPS 兼容性测试目标。
- 不把本地测试模型提交到 Git。

## 验收条件

- `docker compose -f docker-compose.dev.yml up -d minio minio-init` 后，本地 bucket 可用，MinIO 数据保存在 `forkvdo-minio-dev` volume。
- 使用 `NUXT_OSS_ENDPOINT=http://127.0.0.1:9100` 与 `NUXT_OSS_SECURE=false` 时，服务端可上传、签名读取和删除对象；阿里云配置行为保持兼容。
- 每个测试模型记录来源、版本、格式、大小、SHA256 和测试结果；模型只存在本机 ComfyUI 模型目录。
- 至少一个模型在 Mac 的 MPS/CPU 回退路径上完成 512×512、batch 1 的最小生图，或记录可复现的硬件/算子阻塞原因。

## 2026-09-06 实测记录

- MinIO：`127.0.0.1:9100` API、`127.0.0.1:9101` 控制台启动成功；项目对象存储封装完成上传、签名读取（HTTP 200）和删除探针。
- `AnythingV5NijiMix`，Civitai model version `119438`，SD 1.5，SafeTensor，约 2033.8 MB，SHA256 `8BC735ED5786CA7EF2BD36DDEE1EF11FB9BBC3EBB74B218A5CB8B13DF25B478D`：已下载到 `vendor/ComfyUI/models/checkpoints` 并校验通过。
- 上述模型在 Apple Silicon MPS 上使用 512×512、batch 1、12 steps 的最小文生图成功，耗时约 12 秒，结果为 `vendor/ComfyUI/output/forkvdo-mps-test_00001_.png`。
- `MeinaMix`，Civitai model version `948574`：SafeTensor 元数据可读，但下载地址返回 401，未写入模型目录。
- `AbyssOrangeMix2 SFW`，Civitai model version `5021`：SafeTensor 元数据可读；下载开始后因当前 CDN 限速中止，临时文件未作为模型保留。

结论：当前 Mac 的 48GB 统一内存和 MPS 可以运行 SD1.5 二次元 checkpoint；首轮不建议直接用 SDXL、Flux 或视频模型作为本机兼容性基线。Civitai 的鉴权和限速需要在模型管理功能中做成可暂停、可重试的后台任务，不能阻塞工作流页面。
