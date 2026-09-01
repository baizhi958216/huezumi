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

### 阿里云 OSS 素材转存

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
```

Bucket 和对象必须允许百炼读取。默认上传对象使用 `public-read` ACL；如果上传端点是内网地址，必须通过 `NUXT_OSS_PUBLIC_BASE_URL` 指定公网 HTTPS 基地址。OSS 配置完全为空时仍使用本地存储，配置不完整时上传接口返回 `503`，OSS 上传失败时返回 `502`。

AccessKey 仅存在于服务端 runtime config，不会下发到浏览器。大文件分片、浏览器直传和私有对象签名 URL 尚未实现。

## 质量入口

```bash
pnpm check
pnpm check:full
```

`check` 验证工程文档、ESLint 和 TypeScript；`check:full` 额外执行生产构建。两者均由 `harness/run.mjs` 编排，任一步失败都会返回非零退出码。

真实供应商调用不属于默认检查，以免产生费用或依赖网络。需要验证时使用专门的测试账号和非敏感素材，并在交付说明中记录供应商、模型和结果。

## 常见排障

- 供应商显示未启用：检查服务端凭据，重启 dev server。
- 上传 URL 无法被供应商读取：检查 `NUXT_PUBLIC_APP_URL`、HTTPS 和防火墙。
- `.nuxt` 类型不存在：执行 `pnpm postinstall` 后重试。
- 本地状态异常：检查 `.data/`；不要在未确认数据可丢弃前删除它。

## 提交前

检查 `git diff --check` 和 `git status --short`，确认没有 `.env`、`.data`、构建产物、用户素材或临时文件。行为变化需要同步规格和对应文档。
