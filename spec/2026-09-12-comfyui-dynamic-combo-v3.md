# ComfyUI 动态下拉控件兼容

- 状态：completed
- 创建日期：2026-09-12

## 背景与问题

当前 ComfyUI 的 `SaveVideo` 将必填 `format` 和可选 `codec` 声明为 `COMFY_DYNAMICCOMBO_V3`。平台只把数组 COMBO 和字符串 `COMBO` 识别为控件，因而把这两个字段误判为连线插槽；H3 工作流提交到 `/prompt` 时缺少 `format`，最终在 `SaveVideo.execute()` 报缺少位置参数。

## 目标

- 根据运行期 `/object_info` 正确渲染并序列化动态下拉控件 v3。
- 保持现有 H3 工作流和缺少新增控件值的旧副本可执行。

## 非目标

- 不实现动态下拉中所有嵌套编码参数的联动界面。
- 不更改视频生成、模型选择或输出存储契约。

## 用户流程

1. 用户载入内置或已保存的 H3 工作流。
2. 保存视频节点显示运行期可用的格式和编码选项。
3. 运行时提交 `format` 与 `codec`，视频进入当前 ComfyUI 的保存流程。

## 行为契约

`COMFY_DYNAMICCOMBO_V3` 与现有 COMBO 一样作为可序列化控件处理。候选项从 `options[].key` 读取；旧工作流缺少对应的 `widgets_values` 时使用运行期候选列表的首项。当前 `SaveVideo` 的首项为 `auto`。未知输入类型仍作为连线插槽处理。

## 验收条件

- [x] Given 当前 `SaveVideo` 节点定义，When 构建画布节点，Then `format` 和 `codec` 是下拉控件而不是连线插槽。
- [x] Given H3 预设中的三个控件值，When 序列化 API prompt，Then 输入包含 `filename_prefix`、`format=auto` 和 `codec=auto`。
- [x] Given 旧副本缺少新增控件值，When 序列化，Then 缺失值使用运行期第一个合法选项。
- [x] 加载、错误和响应式布局不受影响；本次没有新增页面状态。

## 边界情况

动态选项没有可识别的 `key` 时继续按空候选列表报告可操作错误。嵌套的 `encoding`、`crf` 等条件控件不在本次范围；当前 H3 预设使用 `auto`，不依赖这些嵌套参数。

## 验证计划

- 自动化检查：`pnpm check`。
- 人工检查：载入 H3 预设，确认保存视频节点显示格式并可提交。
- 需要凭据或外部环境的检查：最终视频编码依赖本机 ComfyUI 与模型，不纳入确定性检查。

## 上线与回滚

无迁移与配置项。回滚代码即可恢复旧行为，但当前 ComfyUI 的 `SaveVideo` 会再次无法执行。

## 实现结果

共享节点定义解析已兼容 `COMFY_DYNAMICCOMBO_V3` 的对象候选项，并加入 `SaveVideo` prompt 回归测试。旧图缺值时由现有缺省逻辑选择 `auto`。
