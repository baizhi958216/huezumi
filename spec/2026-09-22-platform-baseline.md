# 平台能力与合同基线

- 状态：implemented（2026-09-22 按当前源码补录）
- 范围：现有 Web/API、后台任务、连接治理、文档与作品
- 证据：下表源码与仓库测试；不代表真实供应商、GPU 或生产部署验收
- 设计：[DESIGN.md](../DESIGN.md)

## 目标与非目标

统一多用户的创作入口、任务进度、作品归属和额度核对；保留视频底层契约与历史媒体访问。当前不含完整分镜、剪辑成片、用户任意执行 ComfyUI、模型训练部署或支付充值系统。

## 行为合同

| 编号        | 场景与预期                                                                                               | 实现依据                                                                                |
| ----------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| AUTH-01     | 未登录访问私有 API 返回 401；非管理员访问管理 API 返回 403；owner 条件不满足时不返回他人资源             | `server/utils/auth.ts`、各 API 及平台服务                                               |
| CONFIG-01   | 文本/图片/视频连接有稳定身份与版本；保存产生新版本，凭据只写不读；用途分配验证连接类型与有效状态         | `server/services/platform/connections.ts`、`config-schemas.ts`                          |
| CONFIG-02   | 主密钥在服务端环境，AES-256-GCM 密文入库；平台任务使用数据库连接，ComfyUI 通过私有上下文接收快照         | `crypto.ts`、`workflow-connections.ts`、节点 `runtime_connections.py`                   |
| RUN-01      | 报价规范化输入并固定连接/价格版本，有效十分钟；提交必须回传返回的 request                                | `server/services/platform/quotes.ts`、`schemas.ts`                                      |
| RUN-02      | 相同 owner/幂等键/请求返回同一任务；冲突或过期 409、余额不足 402、并发超限 429、日预算耗尽 503           | `server/services/platform/runs.ts`                                                      |
| RUN-03      | 受理时同事务预留额度、写任务与 outbox；worker 使用持久化队列和任务锁；结果不明不得自动再次提交供应商     | `generation-queue.ts`、`generation-worker.ts`、`server/database/task-queue.ts`          |
| TEXT-01     | 故事/剧本/文案按连接、模型、篇幅固定报价；成功保存版本与结算原子完成                                     | `server/services/platform/text-worker.ts`                                               |
| TEXT-02     | 手动保存 baseVersionId 冲突返回 409；AI 完成遇到并发编辑保存候选并标记 needsReview，不改变当前文档       | `server/services/platform/documents.ts`、`text-worker.ts`                               |
| IMAGE-01    | 独立图片台仅开放代码允许的百炼千问 2.0 系列；文生图无参考图，编辑需要 1–3 张本人素材，每次 1–6 张        | `shared/types/image-generation.ts`、`server/utils/image-generation-schema.ts`           |
| IMAGE-02    | 按实际生成张数结算，最多收取预留额度；先持久化 URL 再归档，归档重试不重新生成或扣费                      | `server/services/platform/image-worker.ts`                                              |
| VIDEO-01    | 视频由连接对应的 provider 适配器校验能力；统一任务详情从 generations 派生状态；保留旧 generation ID 查询 | `server/services/providers/`、`server/services/platform/runs.ts`                        |
| WORKFLOW-01 | 工作流仅管理员提交，先登记 prompt ID 和执行意图再调用引擎；同一 ID 请求冲突拒绝，未知提交不重发          | `server/middleware/comfy-auth.ts`、`server/services/platform/workflows.ts`              |
| WORKFLOW-02 | 平台额度 exempt；worker 同步历史、按 sourceKey 去重登记输出并归档，列表只读取数据库                      | `server/services/platform/works.ts`                                                     |
| MEDIA-01    | 新素材/成品私有，读取校验 owner；供应商获得有时效的签名 URL；作品 availability 与生成状态独立            | `server/services/assets.ts`、`server/utils/oss.ts`、`server/services/platform/works.ts` |
| LIST-01     | 业务分页默认 30、最大 100；游标按毫秒时间和 ID 排序；摘要列表不携带完整正文；作品 total 使用同一过滤条件 | `server/utils/pagination.ts`、平台列表服务                                              |

## 图片具体输入

`mode` 为 `text` 或 `edit`；prompt 为 1–4000 字符，negativePrompt 最多 500；参考图只接受平台 `/api/assets/:id/content` 或历史 `/api/files/:id` 路径并再验证所有权。count 为 1–6，seed 为 0–2147483647 的整数；默认 promptExtend=true、watermark=false。

当前 size 白名单：`1024*1024`、`1664*928`、`928*1664`、`1472*1104`、`1104*1472`、`2048*2048`。这描述平台请求校验，不承诺每个模型在任何地域都可用。

## 异常、结算与恢复

明确失败释放预留；结果不明保留待核对状态。管理员可对文本/图片 review 任务执行 release 或 charge 并记录原因；人工结算不伪造结果正文或图片。视频使用单独的管理员生成动作接口。

图片可处于 SUCCEEDED/archiving/settled，说明已生成并结算但保存未完成。工作流归档结束后即使个别作品 unavailable，任务阶段也可为 complete；展示以作品可用性和 `allowedActions` 为准。手动“再次生成”是新任务，不能混同归档恢复。

## 验收矩阵

| 场景                                       | 现有证据                                                                        | 本轮状态                                      |
| ------------------------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------- |
| 图片参数、价格、协议和下载                 | `tests/image-generation.test.ts`、`tests/image-download.test.ts`                | 已运行，见检查记录                            |
| 工作流连接分配与私有传输                   | `tests/workflow-connections.test.ts`、`tests/comfy-private-connections.test.ts` | 已运行                                        |
| 图片受理、并发、预算、结算、归档、未知提交 | `tests/image-worker.integration.test.ts`                                        | 默认跳过；通过 test:postgres 在新建临时库验证 |
| Python 节点与私有上下文                    | 节点目录 `test_*.py`                                                            | 已运行，见检查记录                            |
| owner / 文档并发 / 视频队列全链路          | 相关服务源码；历史治理记录不可替代现有测试                                      | 本轮未做端到端验证                            |
| 真实供应商 / GPU / 私有存储恢复            | 部署环境验收                                                                    | 本轮未运行                                    |

当前测试与已知缺口见 [项目检查记录](../docs/project-audit.md)。开发库使用 schema push 初始化；测试只创建隔离数据库，不修改已有部署数据。
