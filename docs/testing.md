# 验证指南

## 常规检查

```bash
pnpm check
pnpm check:full
git diff --check
```

package.json 直接串联命令：check 为 test → lint → typecheck，check:full 再执行 Nuxt build。任一步失败即停止，没有独立 harness 框架。也可单独运行 pnpm test/lint/typecheck/build。

默认 Vitest 跳过需要数据库的文件。其余现有测试使用 fixture/mock，不需要真实 API Key。Nuxt build 不代表完整 Docker 镜像或真实供应商通过。

## PostgreSQL 集成测试

```bash
pnpm test:postgres
```

命令读取可选 `.env`，要求 NUXT_DATABASE_URL 中的账户具备创建数据库权限。脚本只用它连接 PostgreSQL 服务，创建随机 `huezumi_test_*` 空库，在该库执行 db:init，再运行数据库初始化、图片 worker 与控制面板集成测试，最后删除临时库。不会在传入 URL 指定的业务库上建表、清表或迁移数据。

控制面板检查覆盖统一任务去重、类型/关键词筛选、分页、管理员鉴权和并发设置局部保存。

检查包括当前 schema 建表、重复初始化保留用户/钱包/账本/邀请码与队列任务，以及图片受理、并发/预算限制、结算、未知提交和归档重试。图片供应商与对象存储均被 mock，不调用收费接口。

图片测试还在临时库内创建随机 schema，只复制结构。测试异常退出通常由 finally 清理；如果整个进程被强制终止，应按随机名称核对并清理残留测试库。

## 文档与部署检查

检查 Markdown 本地链接、命令入口、API 路由和示例变量。ESLint 启用了文档格式化规则；只对目标文件执行 --fix，避免扩大改动范围。

完整镜像需另执行 `docker build`，并检查容器内 db:init。真实 HTTPS、私有存储签名、浏览器交互、供应商账单与备份恢复均需目标环境验收。实际执行结果见 [项目检查记录](project-audit.md)。
