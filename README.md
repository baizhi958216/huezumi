<p align="center">
  <img src="./public/images/forkvdo-logo-nav.png" width="320" alt="forkvdo">
</p>
 <p align="center"> 使用 forkvdo 一站式调用各平台模型。 </p>

## 已有功能

- 输入文字生成视频
- 用首帧或首尾帧控制画面
- 同时提交参考图片、视频和音频
- 选择模型后，只显示它支持的分辨率、画幅、时长和素材数量
- 邀请注册、登录、个人头像、管理员控制面板和用户数据隔离
- 报价、额度预留、结算流水、幂等提交和平台预算保护
- PostgreSQL 任务记录、Redis/BullMQ worker 和故障 outbox 补发
- 把私有上传素材和生成结果归档到阿里云 OSS
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

本地运行需要 Node.js 22.12 或更新版本、pnpm 10 和 Docker Compose。PostgreSQL、SeaweedFS 在 Docker 中运行；Nuxt 与项目内的 ComfyUI 在宿主机运行。

```bash
pnpm install
cp -n .env.example .env
docker compose -f docker-compose.dev.yml up -d
# 确认两个服务健康后执行
node --env-file=.env --import tsx scripts/db-migrate.ts
node --env-file=.env --import tsx scripts/admin-create.ts --email=admin@example.com --password='replace-with-a-long-password'
pnpm dev
```

所有环境变量都写在 `.env.example` 里。已有 `.env` 请按[本机开发指南](./docs/development.md#本机热更新开发)合并配置。管理员进入工作流页面安装、启动 ComfyUI；模型需要另行安装。

阿里云百炼示例最小配置：

```dotenv
NUXT_DASHSCOPE_API_KEY=sk-your-api-key
NUXT_DASHSCOPE_WORKSPACE_ID=your-workspace-id
NUXT_DASHSCOPE_REGION=cn-beijing
NUXT_PUBLIC_APP_URL=https://your-public-domain.example.com
```

开发环境未启用 OSS 时可把素材保存在 `.data`；生产环境要求 private OSS，并由 worker 向供应商签发短期素材地址。

## Docker

生产编排文件包含 PostgreSQL、Redis、migration、Web、worker 和独立 ComfyUI GPU 服务：

```bash
POSTGRES_PASSWORD='replace-me' COMFYUI_MODELS_DIR='/absolute/path/to/models' \
  docker compose -f docker-compose.production.yml up -d --build
```

服务监听 `3000`。业务状态在 PostgreSQL，媒体在 private OSS，ComfyUI 模型从只读宿主目录挂载。

## 开发

```bash
pnpm check        # repository contract + tests + lint + typecheck
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
