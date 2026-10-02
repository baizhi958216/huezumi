# ComfyUI 工作流创作台

状态：implemented（代码已落地；验证范围见末节）
日期：2026-10-02

## 范围

增加 `/studio/workflow`，左侧节点/模板、中间图编辑、右侧属性/上传/结果；实现 ComfyUI 本机安装、自动启动、管理员启停及独立服务连接。文本、图片、视频图采用统一执行协议，不按模型或节点硬编码平台业务。

不包含自动下载权重、任意 Python 节点在线安装、GPU 资源调度、完整官方前端插件运行环境、视觉 JSON 任意转换、实时 WebSocket 百分比或跨主机进程控制。标准 API 节点、COMBO 与 DynamicCombo 可动态读取；专有 widgets/其他动态图协议需要标准 API 导出，详见 [指南](../docs/comfyui.md)。

## 数据与接口

数据库 schema 增加 `workflows`，保存 owner、graph、layout、assets、revision、isTemplate；`runs` 增加 workflow JSON 保存 promptId/outputs。连接和任务 kind 增加 workflow，连接 settings 增加 workflowPolicy，平台设置增加默认工作流连接。无历史迁移，使用现有 db:push/db:init。

新增工作流 CRUD、节点目录、本机运行状态与管理员控制/配置接口。管理员节点目录扫描全部已安装节点，支持搜索并自动提供全部节点，自动识别上传字段；扫描摘要不携带输入默认值或共享文件名。通过 `/api/workflows/runs` 直接受理；任务恢复和作品沿用现有 API。图是规范化 API 数据，Vue Flow 结构不进入执行合同。保存校验 owner 与 revision；运行任务保留不可变请求快照。

## 权限与计费

已登录用户可使用 ComfyUI 已加载的全部节点，无需管理员逐个启用。节点参数配置不是白名单。服务端验证拓扑、输入类型、模型枚举、数值范围、owner 素材、节点策略和输出节点。凭据字段映射到连接加密凭据，文件字段只能使用当前 owner 素材。节点描述清除共享文件列表与服务端参数。模板发布仅管理员，模板不携带素材绑定；普通用户只读共享模板并创建副本。

工作流暂不接入计费：不创建报价、不预留余额、不写账本、不扣费，也不依赖钱包和平台额度预算。绑定连接版本与规范化请求，同事务检查用户并发、登记任务/outbox；pg-boss 持久化投递并按任务串行执行。其他创作模式的计费不变。

## 状态与恢复

queued → submitting → submitted → archiving/complete。发送前记录 submitting，重复交付看到该状态进入 UNKNOWN/review，不能重发。上游完成前通过延迟 outbox 继续查指定 history。提交前失败、明确拒绝及已知执行错误标记失败；未知结果进入人工核查。已知 promptId 可显式同步，撤销版本禁止执行/同步。

完成后同事务幂等登记文本版本/作品输出；媒体归档在后台，失败保持可重试归档状态。重试不重新生成。运行状态与媒体可用性分开，settlementStatus 固定为 not_required。没有 promptId 的未知请求依赖管理员查看私有上游记录。

本机控制只有管理员可用，只终止平台自己启动的进程；存在 PENDING/RUNNING/UNKNOWN 工作流时拒绝停止。生产 Compose 使用独立后端，Web 与 worker 继续分离。

## 验证与限制

- 单元测试：图校验、动态元数据、保护字段、上传目录隔离、混合输出与路径检查。
- 随机临时 PostgreSQL：免计费/幂等/并发、文本与媒体输出、未知提交不重发、显式同步、归档重试、owner/revision/模板发布。
- 类型检查、lint、生产构建。
- 本机 ComfyUI：安装、进程启动/停止/重启、真实 object_info/prompt/history 文本输出协议。

以上不等于真实模型质量、在线账单、生产 GPU/CUDA、全部第三方节点或生产恢复演练验收。具体运行结果在本次交付中报告，不复用历史测试记录。
