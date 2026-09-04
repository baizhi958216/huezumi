# 百炼家族与 Seedance 2.x 多模型扩展

- 状态：completed
- 创建日期：2026-09-01
- 相关设计：`DESIGN.md`、`spec/2026-09-01-model-capability-accuracy.md`

## 背景与问题

百炼在 wan3.0 之外提供 HappyHorse 1.1（t2v/i2v/r2v）、Wan 2.7（t2v/i2v/r2v）、可灵 V3 系列，并在模型市场提供 MiniMax-H3。经官方文档核实，它们与 wan3.0 共用异步端点 `video-synthesis` 与任务查询协议（`GET /tasks/{task_id}`），但请求体按模型族有差异。百炼视频生成官方目录覆盖 HappyHorse、万相、人像驱动、PixVerse、可灵和 Vidu 六类，平台当前只登记已完成映射的模型：

| 模型                    | input                                                                                                               | parameters 差异                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| wan3.0-video(-prime)    | prompt + media（全能参考）                                                                                          | resolution 480/720/1080P、ratio、duration 2–30、audio 开关、prompt_extend、watermark、seed                            |
| happyhorse-1.1-t2v      | 仅 prompt                                                                                                           | resolution 480/720/1080P、ratio、duration 3–15、watermark（默认 true）、seed；无 negative/audio 开关/改写             |
| happyhorse-1.1-i2v      | prompt + media(first_frame ×1)                                                                                      | 同上但**无 ratio**（跟随首帧）                                                                                        |
| happyhorse-1.1-r2v      | prompt + media(reference_image 1–9)                                                                                 | 同 t2v                                                                                                                |
| wan2.7-t2v              | prompt + negative_prompt + audio_url                                                                                | resolution 720/1080P、ratio、duration 2–15、prompt_extend、watermark、seed                                            |
| wan2.7-i2v              | media 组合：first_frame/last_frame + driving_audio；或 first_clip（视频续写）                                       | resolution 720/1080P、duration 2–15、prompt_extend、watermark、seed；**无 ratio**                                     |
| wan2.7-r2v(-2026-06-12) | prompt + negative_prompt + media(reference_image/reference_video/first_frame，图+视频 ≤5)，每项可带 reference_voice | resolution 720/1080P、ratio、duration 2–10、prompt_extend、watermark、seed                                            |
| MiniMax/MiniMax-H3      | prompt + media（first_frame/last_frame/reference_image/reference_video/reference_audio）                            | resolution 768P/2K、ratio、duration 4–15、watermark；原生立体声（无开关）；参考上限 9 图 + 3 视频 + 3 音频（合计 12） |
| Kling V3 Turbo          | prompt + media（first_frame）                                                                                       | mode 720P/1080P、aspect_ratio、duration 3–15、watermark；固定音画同出                                                 |
| Kling V3                | prompt + media（first_frame/last_frame）                                                                            | mode 720P/1080P/4K、aspect_ratio、duration 3–15、audio、negative_prompt、watermark                                    |
| Kling V3 Omni           | prompt + media（first_frame/last_frame/refer/feature）                                                              | 同 V3；另支持参考图与 1 个特征参考视频；视频编辑、主体列表与多镜头暂未暴露                                            |

变更前 DashScope 适配器按 wan3.0 All-in-One 协议硬编码请求体，其他模型无法接入；模型级能力覆盖项也缺少负向提示词、种子、改写与素材限制的表达能力。Seedance 2.x 与现有 1.x 共用火山方舟任务端点，但 2.x 还增加了视频和音频 content 项。

## 目标

- DashScope 适配器按模型构造请求体（模型感知），一个供应商声明覆盖本期已完成映射的百炼模型。
- 能力目录扩展为百炼 12、MiniMax 3、可灵 2、Seedance 7 个 API model ID；新增百炼 Kling V3 三模型、MiniMax 2.3 Fast，以及 Seedance 2.0 / Fast / Mini 和 2.5。
- `Resolution` 联合类型补充 `2K`（MiniMax-H3 输出档位）。
- `ModelCapabilityOverride` 扩展 `supportsNegativePrompt`、`supportsSeed`、`supportsPromptExtend`、`mediaLimits`，`resolveModelCapability` 合并之；创作台与 `assertRequestSupported` 消费合并后的有效能力。
- 创作台素材限制与高级选项改读模型合并后的有效能力（当前误读供应商级）。

## 非目标

- 接入视频编辑（wan2.7-videoedit、happyhorse-video-edit、VACE）与人物动效类（AnimateAnyone、EMO、LivePortrait 等）——任务结构不同，需新增任务类型，另行立项。
- 可灵自有平台的 V3 端点：本次通过百炼统一协议接入 V3 系列，不额外适配 JWT 鉴权的直连端点。
- wan2.7-r2v 的逐素材 `reference_voice` 音色参考：平台媒体结构无逐素材附件位，本期不暴露。
- 视频续写（first_clip）通过 reference_video 透传可用，但 UI 未提供专门模式。
- 多图参考的 UI 多槽位输入（当前每种素材类型单槽位，API 可传目录声明上限内的数量）。
- Seedance 2.x 的编辑与延长任务：上游支持，但平台统一契约尚未表达对应任务语义。
- 百炼 PixVerse、Vidu 与人像驱动：官方 API 已核实，但请求字段和任务结构尚未映射。

## 行为契约

- 平台层继续只使用 `GenerationRequest`/`GenerationRecord`；模型差异全部收敛在 `server/services/providers/`。
- DashScope 适配器按模型 ID 选择请求体构造器；未声明模型时沿用供应商默认模型（wan3.0-video-prime）。
- 未在官方文档声明的参数不下发：H3 不发送 seed/prompt_extend/negative_prompt；HappyHorse 不发送 negative_prompt/prompt_extend/audio。
- `wan2.7-i2v` 的 reference_video 映射为 `first_clip`（视频续写），reference_audio 映射为 `driving_audio`；`wan2.7-t2v` 的 reference_audio 映射为 `input.audio_url`。
- Wan 2.7 与 H3 音频直出：`audio` 开关不下发；HappyHorse 官方未声明音频生成字段；`audio` 开关仅在 wan3.0 和支持开关的 Kling V3 上生效。
- `ProviderCapability` 供应商级字段继续表达能力并集；模型级覆盖未声明的字段保持继承，兼容旧目录项与已持久化 `GenerationRecord`。

## 验收条件

- [x] 首页模型目录显示 24 个已适配 API model ID（dashscope 12、minimax 3、kling 2、seedance 7），通过一个不展示供应商层级的全量模型选择器，一次展示一个模型的生成方式、清晰度、时长、画幅和音频。
- [x] 创作台选择 happyhorse-1.1-i2v 时：无画幅选择器（跟随首帧）、时长 3–15、480P/720P/1080P；选择 MiniMax/MiniMax-H3 时：清晰度为 768P/2K、时长 4–15、高级选项不含反向提示词/种子/改写。
- [x] `assertRequestSupported` 按模型级覆盖拒绝：向 happyhorse 传 negativePrompt、向 H3 传 1080P、向 wan2.7-r2v 传 15 秒等组合返回 422。
- [x] 使用脱敏 `$fetch` mock 核对适配器请求体：HappyHorse/H3 不下发未声明字段，Kling Omni 与 Seedance 的视频/音频素材映射正确。
- [x] `pnpm check:full` 通过。

## 边界情况

- 模型级 `mediaLimits` 仅覆盖声明过的类型，其余类型继承供应商级限制。
- `wan2.7-i2v` 的 driving_audio 必须搭配 first_frame，当前校验器不做配对校验，由上游报错兜底；模型 notes 说明。
- 智能时长（-1）仅 wan3.0 与 Seedance 1.5 Pro 支持；新模型 duration.smart=false，UI 不展示智能时长。
- MiniMax-H3 文生视频要求显式画幅，模型级能力已移除 `adaptive`。

## 验证计划

- 自动化检查：`pnpm check:full`。
- 人工检查：首页模型目录逐一选择跨供应商模型；创作台逐一切换 dashscope 全部 12 个模型、minimax 3 个模型与 seedance 7 个模型，核对参数收敛。
- 需要凭据的检查：真实上游提交不在本次范围。

## 上线与回滚

无存储迁移、无新环境变量（复用 DASHSCOPE/SEEDANCE 凭据）。可按文件回滚；`Resolution` 新增 `2K` 为联合类型扩展，向后兼容。

## 实现结果

- `shared/types/generation.ts`：`Resolution` 增加 `2K`；`ModelCapabilityOverride` 扩展 `supportsNegativePrompt` / `supportsSeed` / `supportsPromptExtend` / `mediaLimits`，`resolveModelCapability` 按字段合并（mediaLimits 按类型覆盖）。
- `server/services/providers/dashscope.ts`：按模型 ID 分派 9 种请求体构造器（wan3 / happyhorse t2v·i2v·r2v / wan2.7 t2v·i2v·r2v / minimax-h3 / kling-v3），仅下发各模型文档声明的参数；reference_audio→audio_url（wan2.7-t2v）/ driving_audio（wan2.7-i2v），reference_video→first_clip（wan2.7-i2v 续写）。
- `server/services/providers/catalog.ts`：dashscope 目录增至 12 个模型（含 MiniMax H3 与百炼 Kling V3 系列），minimax 增至 3 个，seedance 增至 7 个；逐模型声明真实输入、分辨率、时长和音频边界。
- `server/utils/generation-schema.ts`：API 分辨率枚举补齐 `2K` / `4K`，避免目录可选但 API 边界拒绝。
- `server/services/providers/index.ts`：`assertRequestSupported` 的反向提示词/种子/改写校验改用模型合并后的有效能力。
- `app/pages/studio.vue`：素材限制与高级选项改读 `effectiveCapability`。
- `app/pages/index.vue`：能力区改为全量模型选择器与单模型详情，不展示供应商 Tab、供应商状态和 Provider 生态；跑马灯、hero（最高 4K）、FAQ 与模型说明同步；模型数由目录驱动自动变为 24。
- `README.md`：模型清单与 DashScope 实现说明更新。
- 验证：`pnpm check:full` 通过；本地 `/api/providers` 返回 12/3/2/7、合计 24 个 model ID；三种非法组合返回 422，合法 2K/4K 请求通过 schema 与能力校验后才因缺少本机凭据返回 503；脱敏 mock 请求体断言通过。真实上游提交不在本次范围（无凭据）。
- 遗留：百炼 Vidu、PixVerse 与人像驱动已有官方 API 文档但尚未完成平台映射；wan2.7-r2v 逐素材 reference_voice、多图参考 UI 多槽位、视频编辑/延长/人物动效任务类型均未实现（见非目标）。

## 官方来源（核对日期 2026-09-01）

- [百炼视频生成模型目录](https://help.aliyun.com/zh/model-studio/video-generation-api/)
- [百炼可灵视频生成 API](https://help.aliyun.com/zh/model-studio/kling-video-generation-api-reference/)
- [火山方舟创建视频生成任务](https://docs.volcengine.com/docs/82379/1520757)
- [火山方舟模型列表](https://docs.volcengine.com/docs/82379/1330310)
- [Seedance 2.5 使用教程](https://docs.volcengine.com/docs/82379/2607688)
- [Seedance 2.0 系列使用教程](https://docs.volcengine.com/docs/82379/2291680)
- [MiniMax V1 文生视频 API](https://platform.minimaxi.com/docs/api-reference/video-generation-t2v)
- [MiniMax V1 图生视频 API](https://platform.minimaxi.com/docs/api-reference/video-generation-i2v)
- [MiniMax V2 视频生成 API](https://platform.minimaxi.com/docs/api-reference/video-generation-v2-create)
