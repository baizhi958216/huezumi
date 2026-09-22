# 独立图片创作台

入口 `/studio/image`，与文案生成、视频生成并列；管理员的「工作流 · 高级」保留独立入口，可编排文本、图片、视频及多步骤任务。

## 阿里云百炼接入

实现依据：

- [千问文生图 API](https://help.aliyun.com/zh/model-studio/qwen-image-api)
- [千问图像编辑 API](https://help.aliyun.com/zh/model-studio/qwen-image-edit-api)

当前开放 `qwen-image-2.0`、`qwen-image-2.0-pro` 及其日期快照模型。使用同步 DashScope HTTP 接口 `POST /api/v1/services/aigc/multimodal-generation/generation`，通过 `Authorization: Bearer <API Key>` 鉴权。服务端队列执行请求，浏览器仅查询平台任务状态。

请求将参考图和单条文字描述放入 `input.messages[0].content`；`parameters` 包含 `size`（宽*高）、`n`、`negative_prompt`、`prompt_extend`、`watermark`、`seed`。支持 1–6 张输出、1–3 张编辑参考图。参考图必须上传为当前账户的私有素材，服务器验证归属后签发短期 URL。

返回图片从 `output.choices[].message.content[].image` 读取。供应商 URL 有效期有限，先持久化到任务对应作品记录，再立即保存到平台对象存储。浏览器通过权限校验后的 `/api/assets/:id/content` 访问成品。

## 配置步骤

1. 控制面板 → 模型连接 → 新建，类型选择「图片 API」，供应商选择「阿里云百炼 · 千问图片」。默认填入两款支持的模型。
2. 填入对应地域的百炼 API Key。基地址留空时默认北京；新加坡填地域 `ap-southeast-1`。设置业务空间 ID 后使用 `https://{WorkspaceId}.{Region}.maas.aliyuncs.com/api/v1`；其他地域可显式填写完整基地址。密钥地域必须与请求地域匹配。
3. 在「图片按张报价」中为具体模型发布每张额度，可应用于全部画幅或指定画幅。图片报价不采用视频通配模型和按秒公式。
4. 在「用途分配与运营设置」选择默认图片连接。原有 OpenAI 兼容图片连接继续供工作流使用，独立图片页展示百炼连接。
5. 确保后台 worker 和私有对象存储已配置。参考图的签名 URL 必须可被百炼访问。

本次使用现有 `runs`、`works`、`pricing_rules` 等表及 JSON 字段，未新增数据库列，无需额外结构迁移。不要将 API Key 写入前端或工作流图。

## 任务与费用

- 使用已有 `/api/billing/quotes`、`/api/runs`、`/api/runs/:id`，新增 `kind: "image"`。
- 报价、连接版本、幂等键、用户并发限制及平台日预算均纳入图片任务。
- 按实际成功张数结算并释放多余预留额度；明确失败释放全部预留额度。
- 网络超时、进程在提交阶段中断等结果不明场景进入人工核对，绝不自动再次调用生成接口。控制面板支持核对图片任务。
- 归档失败保留已生成结果，可通过任务「重试保存图片」重新归档，不重复生成或计费。应在上游 URL 过期前完成保存。
- 工作流图片 API 节点同时兼容百炼原生图片协议和已有 OpenAI 兼容协议。

## 验证

`pnpm test` 运行接口合同、参数和计费测试；需要本地 PostgreSQL 时运行：

```sh
HUEZUMI_IMAGE_DB_TEST=1 node --env-file=.env node_modules/vitest/vitest.mjs run tests/image-worker.integration.test.ts
```

集成测试仅在随机命名的独立 schema 中复制表结构、插入测试数据，并在结束后删除该 schema；不复制或修改现有用户数据，不调用收费接口。
