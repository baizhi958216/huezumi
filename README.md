# forkvdo

forkvdo 是一个基于 Nuxt 4 的 AI 视频生成平台。项目包含产品首页、视频创作台、作品库、素材上传、DashScope 异步任务轮询，以及面向更多视频供应商的可插拔适配层。

## 已实现能力

- 文生视频
- 首帧 / 首尾帧生成视频
- 参考图、参考视频、参考音频组合生成
- 480P、768P、720P、1080P、2K、4K（按模型收敛）
- 自适应、16:9、4:3、1:1、3:4、9:16、21:9 画幅
- 2–30 秒自定义时长（按模型收敛）
- 音轨、提示词智能改写、水印、随机种子控制
- 本地素材上传与公网 URL 输入
- 生成任务持久化、状态轮询与作品库
- Docker / Docker Compose 部署

已接入模型（能力目录见 `server/services/providers/catalog.ts`）：

- 阿里云百炼：wan3.0-video / prime、happyhorse-1.1-t2v/i2v/r2v、wan2.7-t2v/i2v/r2v、MiniMax/MiniMax-H3、Kling V3 Turbo / V3 / V3 Omni（统一 `video-synthesis` 异步端点）
- MiniMax：Hailuo 2.3 / 2.3 Fast / 02
- 可灵：Kling V2.6 / V2.5 Turbo
- 火山方舟：Seedance 1.5 Pro、1.0 Pro / Fast、2.0 / 2.0 Fast / 2.0 Mini、2.5
- RollDek：WAN 3.0 标准 / Prime、Image / Image Prime（每个系列提供 480P / 720P / 1080P）
- Runway Dev：Gen-4.5，以及 WAN 3.0、Seedance 2/2.5、Hailuo 3、Gemini Omni Flash 多模态视频

以上共 44 个 API model ID（百炼 12、MiniMax 3、可灵 2、Seedance 7、RollDek 12、Runway 8），只代表 forkvdo 已完成参数映射与校验的范围，不代表厂商完整产品线。百炼官方视频生成目录还包含 PixVerse、Vidu 与人像驱动；Runway 还提供其它视频、图片、音频和实时模型；这些模型未因字段或任务结构尚未完成映射而登记到平台。

供应商代码位于 `server/services/providers`，新增供应商只需实现 `VideoProvider` 接口并在注册器中启用。

## 本地运行

```bash
pnpm install
cp .env.example .env
pnpm dev
```

至少需要在 `.env` 中配置：

```dotenv
NUXT_DASHSCOPE_API_KEY=sk-xxx
NUXT_DASHSCOPE_WORKSPACE_ID=your-workspace-id
NUXT_DASHSCOPE_REGION=cn-beijing
NUXT_PUBLIC_APP_URL=https://your-public-domain.example.com
```

未启用 OSS 时，DashScope 必须能够访问上传素材的 URL，生产环境请将 `NUXT_PUBLIC_APP_URL` 设置为平台的公网 HTTPS 地址。启用 OSS 后，新上传素材会直接返回 OSS 地址；本地开发时也可以在创作台粘贴 OSS 或其他公网素材 URL。

### 使用阿里云 OSS 存储输入素材和生成结果

如果希望输入素材自动转存到 OSS，并在供应商完成任务后把结果视频归档到 OSS，在 `.env` 中补充以下配置：

```dotenv
NUXT_OSS_ACCESS_KEY_ID=你的OSS_ACCESS_KEY_ID
NUXT_OSS_ACCESS_KEY_SECRET=你的OSS_ACCESS_KEY_SECRET
NUXT_OSS_BUCKET=你的Bucket名称
NUXT_OSS_REGION=cn-beijing
NUXT_OSS_PREFIX=forkvdo/uploads
NUXT_OSS_OUTPUT_PREFIX=forkvdo/outputs
NUXT_OSS_MAX_OUTPUT_BYTES=1073741824
NUXT_OSS_TRANSFER_TIMEOUT_MS=300000
```

Bucket 需要允许对象公网读取，输入素材和生成结果都会使用 `public-read` ACL。`NUXT_OSS_ENDPOINT` 留空时会根据地域使用标准公网 Endpoint；如果配置了内网 Endpoint 或自定义域名，请同时设置 `NUXT_OSS_PUBLIC_BASE_URL` 为供应商和浏览器可以访问的 HTTPS 地址。OSS 配置完整后，`POST /api/files` 返回 OSS 素材 URL；生成任务成功后，作品库会把供应商临时结果转存到 `forkvdo/outputs` 并替换为 OSS URL。归档失败可在作品库重试。

AccessKey 只在服务端使用，不要把 `.env` 提交到仓库。

### 使用 RollDek WAN 3.0

在 `.env` 中配置：

```dotenv
NUXT_ROLLDEK_API_KEY=your-rolldek-api-key
NUXT_ROLLDEK_BASE_URL=https://rolldek.com
```

RollDek 模型 ID 必须带 `-480p`、`-720p` 或 `-1080p` 后缀，后缀决定最终清晰度和计费档位；平台会同时把 `size` 与 `resolution` 强制为该值。标准版 / Prime 支持图片、视频和音频参考，Image 系列不支持参考视频。参考视频可在 API 的 `media` 项中提供 `duration`（秒），以便 RollDek 正确计费。

### 使用 Runway Dev

在 `.env` 中配置：

```dotenv
NUXT_RUNWAY_API_KEY=your-runway-api-key
NUXT_RUNWAY_BASE_URL=https://api.dev.runwayml.com
NUXT_RUNWAY_MODEL=gen4.5
```

当前平台接入 Gen-4.5、WAN 3.0、Seedance 2/2.5、Hailuo 3 和 Gemini Omni Flash。适配器会根据素材选择 Runway 的 `text_to_video`、`image_to_video` 或 `video_to_video`，支持参考图、参考视频、参考音频和模型对应的清晰度/时长。Runway 要求输入素材为公网 HTTPS URL，生成结果 URL 是临时地址；配置 OSS 后，作品库会按统一流程将完成结果转存为长期地址。其它 Runway 模型暂未登记，避免把关键帧时间轴、视频输入时长跟随等未被平台契约完整表达的语义暴露到平台。

## Docker 部署

```bash
cp .env.example .env
docker compose up -d --build
```

服务默认监听 `3000` 端口，任务和上传素材保存在 Docker volume `forkvdo-data` 中。

## 常用命令

```bash
pnpm dev
pnpm build
pnpm lint
pnpm lint:fix
pnpm typecheck
pnpm check
pnpm check:full
```

AI 协作规则、架构、规格和验证入口分别见 `AGENTS.md`、`DESIGN.md`、`spec/` 与 `harness/`；文档索引见 `docs/README.md`。

## DashScope 实现说明

平台按官方异步协议提交 `video-synthesis` 任务，保存返回的 `task_id`，再通过 `/tasks/{task_id}` 查询状态。wan3.0 采用 All-in-One 媒体结构，将首尾帧和参考图 / 视频 / 音频统一映射到 `input.media`；HappyHorse、Wan 2.7、MiniMax H3 与 Kling V3 系列按各自文档的参数子集与 media 组合构造请求体（见 `dashscope.ts` 中的模型分派）。

需要注意，官方协议不允许在同一任务中混用首尾帧与 `reference_*` 素材，服务端已做对应校验。

参考文档：

- [百炼视频生成模型目录](https://help.aliyun.com/zh/model-studio/video-generation-api/)
- [万相 3.0 视频生成 API](https://help.aliyun.com/zh/model-studio/wan3-video-generation-api-reference)
- [万相 2.7 图生视频 API](https://help.aliyun.com/zh/model-studio/image-to-video-general-api-reference)
- [万相文生视频 API](https://help.aliyun.com/en/model-studio/text-to-video-api-reference)
- [百炼可灵视频生成 API](https://help.aliyun.com/zh/model-studio/kling-video-generation-api-reference/)
- [火山方舟视频生成任务 API](https://docs.volcengine.com/docs/82379/1520757)
- [MiniMax 视频生成 API](https://platform.minimaxi.com/docs/api-reference/video-generation-t2v)
- [RollDek WAN 3.0 视频 API](https://rolldek.com)
- [Runway Dev API Getting Started Guide](https://docs.dev.runwayml.com/guides/using-the-api/)
- [Runway Dev API Reference](https://docs.dev.runwayml.com/api/)

## 扩展新供应商

1. 在 `server/services/providers` 新增适配器，实现 `submit` 与 `getTask`。
2. 将平台统一的 `GenerationRequest` 映射为供应商请求结构。
3. 在 `server/services/providers/index.ts` 注册供应商。
4. 在运行时配置中增加对应密钥与模型参数。

前端和任务存储无需因供应商变化而重写。
