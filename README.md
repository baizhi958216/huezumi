<p align="center">
  <img src="./public/images/forkvdo-logo-nav.png" width="320" alt="forkvdo">
</p>
 <p align="center"> 使用 forkvdo 一站式调用各平台模型。 </p>

## 已有功能

- 输入文字生成视频
- 用首帧或首尾帧控制画面
- 同时提交参考图片、视频和音频
- 选择模型后，只显示它支持的分辨率、画幅、时长和素材数量
- 保存生成记录，并在查询时刷新还没结束的任务
- 把上传素材和生成结果归档到阿里云 OSS
- 通过适配器接入其他供应商

覆盖 480P 到 4K、常用横竖屏画幅和最长 30 秒输出。

## 已接入的供应商

| 供应商        | 模型数 | 主要模型                                             |
| ------------- | -----: | ---------------------------------------------------- |
| 阿里云百炼    |     12 | Wan 3.0 / 2.7、HappyHorse、MiniMax H3、Kling V3 系列 |
| MiniMax       |      3 | Hailuo 2.3、2.3 Fast、02                             |
| 可灵 Kling    |      2 | Kling V2.6、V2.5 Turbo                               |
| Seedance 即梦 |      7 | 1.x、2.0 系列、2.5                                   |
| RollDek       |     12 | WAN 3.0 标准、Prime 与 Image 系列                    |
| Runway Dev    |      8 | Gen-4.5 与多模态视频模型                             |

## 开始使用

本地运行需要 Node.js 20+ 和 pnpm 10。

```bash
pnpm install
cp .env.example .env
pnpm dev
```

所有环境变量都写在 `.env.example` 里。

阿里云百炼示例最小配置：

```dotenv
NUXT_DASHSCOPE_API_KEY=sk-your-api-key
NUXT_DASHSCOPE_WORKSPACE_ID=your-workspace-id
NUXT_DASHSCOPE_REGION=cn-beijing
NUXT_PUBLIC_APP_URL=https://your-public-domain.example.com
```

没有启用 OSS 时，远程供应商需要直接读取 `NUXT_PUBLIC_APP_URL` 返回的素材地址，所以生产环境通常要准备一个公网 HTTPS 域名。

## Docker

```bash
cp .env.example .env
docker compose up -d --build
```

服务默认监听 `3000` 端口。生成记录和本地上传的素材保存在 `forkvdo-data` volume 中。

## 开发

```bash
pnpm check        # repository contract + lint + typecheck
pnpm check:full   # 上述检查 + production build
```

接入新供应商时，实现 `VideoProvider.submit()` 和 `VideoProvider.getTask()`，再把它注册到能力目录和 provider factory。上游请求类型留在 `server/services/providers/` 内，不进入 UI 或平台 API。

## 文档

- [设计说明](./DESIGN.md)
- [开发与配置](./docs/development.md)
- [HTTP API](./docs/api.md)
- [规格索引](./spec/README.md)
- [架构决策](./docs/decisions/README.md)
- [验证入口](./harness/README.md)
