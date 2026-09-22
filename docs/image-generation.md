# 独立图片生成

`/studio/image` 面向登录用户提供文生图与参考图编辑，使用统一报价、runs、作品库和私有存储。它与管理员的本地 Qwen Image 2.1 工作流是不同入口。

## 平台支持范围

独立图片台当前只接受 provider=dashscope 的 `qwen-image-2.0`、`qwen-image-2.0-pro` 及代码正则允许的日期版本。模型白名单和尺寸见 [共享类型](../shared/types/image-generation.ts)，请求边界见 [schema](../server/utils/image-generation-schema.ts)。这是当前适配范围，不代表所有地域或账号已开通。

- 文生图：prompt 必填，不能携带参考图。
- 参考图编辑：1–3 张本人已上传图片；PNG/JPEG/WebP，每张不超过 10 MiB，需存于配置的对象存储。
- 每次生成 1–6 张；支持六个预设尺寸、可选反向词、提示词扩写、水印与 seed。
- 参考图请求传平台素材路径，服务端校验归属并签发一小时 URL；该输入签名时长独立于通用 OSS 默认 TTL。

普通素材上传上限可能高于图片模型上限。图片报价前就要求对象存储可用，即使文生图没有参考图也需要保存结果。

## 配置步骤

1. `/admin/settings` 新建图片连接，供应商选择百炼千问图片，填写 API Key、地域和允许的模型列表。基地址留空时由服务端按地域/业务空间解析；显式基地址须与 Key 对应。
2. 在管理界面发布具体图片模型的正数按张价格，可匹配指定 size 或 `*`。图片使用 fixedCredits，不能混入视频按秒字段，也不使用通配模型兜底。
3. 设置默认图片连接。OpenAI-compatible 图片连接可供 `HuezumiApiImage` 工作流使用，但不会变成独立图片台的可报价模型。
4. 确认 worker、用户额度、日预算和私有对象存储已配置。真实编辑请求需要供应商能通过 HTTPS 访问参考图签名 URL。

连接修改产生新版本，已受理任务固定原版本；不要把 API Key 写到浏览器或工作流图。完整配置见 [配置指南](configuration.md)。

## 生成、结算与保存

报价接口为 `/api/billing/quotes`，kind=image；受理使用 `/api/runs`，详情使用 `/api/runs/:id`。相同幂等键重试不重复受理。

worker 调用供应商，先把上游 URL 保存到作品记录，再按实际成功张数结算（不超过预留额度）并释放剩余预留，随后下载到私有对象存储。成功归档后通过 `/api/assets/:id/content` 读取。

明确失败释放预留；提交超时或进程在 submitting 阶段中断等未知结果进入人工核对，不自动再次调用生成接口。归档失败可能表现为 SUCCEEDED/archiving，保存重试仅下载已有结果，不重复生成或扣费。依据 allowedActions 调用 `/api/runs/:id/archive`，并在供应商 URL 失效前完成。

空库先执行 `pnpm db:init` 初始化当前业务结构与任务队列，不需要历史迁移文件。

## 验证

单元测试与可选数据库集成测试见 [验证指南](testing.md)。集成测试使用独立随机 schema，mock 供应商和存储，不消耗真实生成额度；真实连通性与画质应在目标部署另行验收。
