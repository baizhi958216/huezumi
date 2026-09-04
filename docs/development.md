# 开发指南

## 环境

- Node.js 20 或更高版本。
- pnpm 10；版本以 `package.json#packageManager` 为准。
- 真实生成需要至少一家供应商凭据。

```bash
pnpm install
cp .env.example .env
pnpm dev
```

访问 `http://localhost:3000`。没有供应商凭据时仍可开发页面和查看供应商目录，但无法提交真实任务。

## 配置

Nuxt runtime config 从带 `NUXT_` 前缀的大写下划线环境变量映射。例如 `dashscopeApiKey` 对应 `NUXT_DASHSCOPE_API_KEY`。新增变量必须同步更新 `nuxt.config.ts`、`.env.example` 和部署配置。

未启用 OSS 时，`NUXT_PUBLIC_APP_URL` 决定上传素材返回的绝对 URL，使用远程供应商时该地址必须能被公网访问；启用 OSS 后，新上传素材返回 OSS 公网 URL。

### 阿里云 OSS 素材与结果转存

配置以下四项后，`POST /api/files` 会在本地接收文件后自动上传到阿里云 OSS，并把 OSS 公网 URL 返回给创作台：

```dotenv
NUXT_OSS_ACCESS_KEY_ID=
NUXT_OSS_ACCESS_KEY_SECRET=
NUXT_OSS_BUCKET=
NUXT_OSS_REGION=cn-beijing
```

可选配置：

```dotenv
NUXT_OSS_ENDPOINT=
NUXT_OSS_PUBLIC_BASE_URL=
NUXT_OSS_PREFIX=forkvdo/uploads
NUXT_OSS_OUTPUT_PREFIX=forkvdo/outputs
NUXT_OSS_MAX_OUTPUT_BYTES=1073741824
NUXT_OSS_TRANSFER_TIMEOUT_MS=300000
```

Bucket 和对象必须允许百炼及作品库浏览器读取。默认上传对象使用 `public-read` ACL；如果上传端点是内网地址，必须通过 `NUXT_OSS_PUBLIC_BASE_URL` 指定公网 HTTPS 基地址。OSS 配置完全为空时输入素材仍使用本地存储，生成结果保留供应商临时地址并把归档标记为失败；配置不完整时素材上传接口返回 `503`。

生成任务变为 `SUCCEEDED` 时，服务端会将供应商结果下载到随机临时目录，在字节数和时间限制内上传到 `NUXT_OSS_OUTPUT_PREFIX`，成功后用 OSS URL 替换记录中的临时地址。归档失败不会把生成任务改成失败，可在作品库点击“重试归档”。

AccessKey 和 OSS object key 仅存在于服务端，不会下发到浏览器。大文件分片、断点续传、浏览器直传、私有对象签名 URL 和生命周期清理尚未实现。

### RollDek

RollDek 通过 `POST /v1/videos` 提交 WAN 3.0 异步任务，通过 `GET /v1/videos/{task_id}` 查询；默认地址为 `https://rolldek.com`。配置：

```dotenv
NUXT_ROLLDEK_API_KEY=
NUXT_ROLLDEK_BASE_URL=https://rolldek.com
```

平台目录登记 12 个带分辨率后缀的模型。适配器发送推荐的字符串 `seconds`，并将模型后缀对应的清晰度同时写入 `size` 和 `resolution`；比例同时写入 `aspect_ratio` 和兼容别名 `ratio`。完成任务从 `metadata.url` 读取签名视频直链，随后沿用统一的 OSS 结果归档流程。RollDek 参考视频必须通过统一 `media[].duration` 传递素材自身时长；创作台本地上传自动读取，粘贴 URL 时由用户填写。

### Runway Dev

Runway 当前接入 Gen-4.5、WAN 3.0、Seedance 2/2.5、Hailuo 3 和 Gemini Omni Flash。配置：

```dotenv
NUXT_RUNWAY_API_KEY=
NUXT_RUNWAY_BASE_URL=https://api.dev.runwayml.com
NUXT_RUNWAY_MODEL=gen4.5
```

服务端根据请求素材选择 `POST /v1/text_to_video`、`/v1/image_to_video` 或 `POST /v1/video_to_video`。Runway 的 `references`、`referenceVideos`、`referenceAudio` 和 `promptVideo` 分别承载平台的参考图、参考视频、参考音频和主视频输入；Seedance 系列的智能时长会映射为官方 `auto`。平台按模型官方 ratio / resolution 约束请求，Runway 要求素材 URL 使用公网 HTTPS，完成输出地址会在 24–48 小时内失效，因此生产环境应配置 OSS 以归档结果。

### ComfyUI 工作流模块

`/workflow` 是一个独立模块：ComfyUI 在本地由 Nuxt 后端托管（或连接其他机器上已运行的实例），浏览器只与本模块的 `/api/comfyui/**` 通信。配置：

```dotenv
# 接入模式：auto / local / remote。auto 下若设置了 REMOTE_BASE_URL 则走 remote，否则 local
NUXT_COMFYUI_MODE=auto
# 本地模式：仓库目录，默认 ./vendor/ComfyUI
NUXT_COMFYUI_DIR=
# 本地模式：python 解释器；默认优先仓库内 .venv/bin/python，其次 uv，最后 python3
NUXT_COMFYUI_PYTHON=
NUXT_COMFYUI_HOST=127.0.0.1
NUXT_COMFYUI_PORT=8188
# 追加到 `python main.py` 之后的额外参数
NUXT_COMFYUI_ARGS=
# 远程模式基地址，例如 http://192.168.1.20:8188
NUXT_COMFYUI_REMOTE_BASE_URL=
NUXT_COMFYUI_START_TIMEOUT_MS=180000
NUXT_COMFYUI_PROBE_TIMEOUT_MS=1500
```

首次进入 `/workflow` 时：

- **local + 未安装**：页面展示「安装 ComfyUI」按钮；点击后后端异步执行 `git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git`（必要时建虚拟环境并安装 `requirements.txt`），页面轮询状态显示日志。
- **local + 已安装未运行**：页面展示「启动」按钮；点击后 `python main.py --listen <host> --port <port> --disable-auto-launch` 拉起，轮询 `/system_stats` 直至就绪（默认 3 分钟）。
- **remote**：按钮组隐藏本地启停，状态接口直接报告上游连通性。

工作流保存到 Nitro storage（`comfyui:workflows:*`），与 `GenerationRecord` 完全独立；删除走显式接口。`/workflow` 本身不需要供应商凭据，但只有运行 ComfyUI 进程且加载完模型后才能真正跑图。

常见排障：

- 端口占用：8188 已被占用时本地启动失败，日志显示端口冲突；通过 `NUXT_COMFYUI_PORT` 换端口。
- Python 找不到：系统未装 `python3` 或 `uv` 时安装会失败；优先安装 uv（`pip install uv` 或 https://docs.astral.sh/uv/）。
- 启动超时：首次加载模型较慢，按需把 `NUXT_COMFYUI_START_TIMEOUT_MS` 调到 600000 之类。
- WS 不可达：浏览器与 `/api/comfyui/ws` 连不上时页面退化为轮询历史，功能不缺失，只是没有逐节点进度。
- 安装目录被 `.gitignore` 排除：本地克隆落在 `./vendor/ComfyUI`，不要把它提交到仓库。

## 质量入口

```bash
pnpm check
pnpm check:full
```

`check` 先验证仓库契约（必需工程文件、规格状态、内部 Markdown 链接、忽略规则和敏感运行时文件），再运行 ESLint 和 TypeScript；`check:full` 额外执行生产构建。两者均由 `harness/run.mjs` 编排，任一步失败都会返回非零退出码。

真实供应商调用不属于默认检查，以免产生费用或依赖网络。需要验证时使用专门的测试账号和非敏感素材，并在交付说明中记录供应商、模型和结果。

## 常见排障

- 供应商显示未启用：检查服务端凭据，重启 dev server。
- 上传 URL 无法被供应商读取：检查 `NUXT_PUBLIC_APP_URL`、HTTPS 和防火墙。
- `.nuxt` 类型不存在：执行 `pnpm postinstall` 后重试。
- 本地状态异常：检查 `.data/`；不要在未确认数据可丢弃前删除它。

## 提交前

检查 `git diff --check` 和 `git status --short`，确认没有 `.env`、`.data`、构建产物、用户素材或临时文件。行为变化需要同步规格和对应文档。
