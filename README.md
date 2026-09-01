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

以上共 24 个 API model ID（百炼 12、MiniMax 3、可灵 2、Seedance 7），只代表 forkvdo 已完成参数映射与校验的范围，不代表厂商完整产品线。百炼官方视频生成目录还包含 PixVerse、Vidu 与人像驱动；这些模型已有官方 API 文档，但其请求字段和任务结构尚未映射到平台契约。

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

DashScope 必须能够访问上传素材的 URL。生产环境请将 `NUXT_PUBLIC_APP_URL` 设置为平台的公网 HTTPS 地址。本地开发时，也可以直接在创作台粘贴 OSS 或其他公网素材 URL。

## Docker 部署

```bash
cp .env.example .env
docker compose up -d --build
```

服务默认监听 `3000` 端口，任务与上传素材元数据保存在 Docker volume `forkvdo-data` 中。

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

## 扩展新供应商

1. 在 `server/services/providers` 新增适配器，实现 `submit` 与 `getTask`。
2. 将平台统一的 `GenerationRequest` 映射为供应商请求结构。
3. 在 `server/services/providers/index.ts` 注册供应商。
4. 在运行时配置中增加对应密钥与模型参数。

前端和任务存储无需因供应商变化而重写。
