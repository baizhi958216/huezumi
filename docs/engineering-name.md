# Huezumi 工程命名

中文品牌为「绘小宙」，网页导航、登录文案和站点标题使用中文。英文品牌为 **Huezumi**，包名为 `huezumi`，自定义节点包为 `comfyui/custom_nodes/huezumi_prompt/`。

## 统一标识

节点 ID 使用 `Huezumi*`，插槽使用 `HUEZUMI_*`，执行端配置使用 `HUEZUMI_LLM_CONNECTIONS_JSON`、`HUEZUMI_DASHSCOPE_*`。Nuxt 配置仍使用 `NUXT_*`。历史数据导入工具使用 `HUEZUMI_LEGACY_*`；这些变量不是品牌兼容入口。

数据库和本地对象桶默认名为 `huezumi`。Compose 项目名固定为 `huezumi`，开发卷为 `huezumi-postgres-dev`、`huezumi-seaweedfs-dev`。云端既有业务桶可以继续使用自身名称。新对象默认前缀为 `huezumi/uploads`、`huezumi/outputs`，明确配置的前缀仍优先。

登录只使用 `huezumi_session`；HTTP 和 WebSocket 共享解析规则。队列为 `huezumi-generations`、`huezumi-generation-failures`，互斥锁使用 `huezumi:generation:*`。

## 升级

本次是完整切换，不保留旧品牌别名、环境变量回退、节点包链接或旧 Cookie 读取。已有部署必须先备份数据库、私有配置与数据卷，停止应用和执行端，确认任务已结束，然后迁移工作流 ID、插槽、对象路径与数据库引用。对象先复制并验证，再切换引用和删除源对象。更新本地节点挂载后重启。已有登录需要重新登录。

不要用示例文件覆盖私有 `.env`，也不要用 `docker compose down -v` 代替迁移。源目录可搬迁，但必须同步 IDE 项目路径、本地挂载和任何绝对路径配置。Git remote 与历史提交不由工程更名自动重写。

历史规格中的名称已按当前命名统一，数字与当时的验收事实保持原样；当前行为以本文和完整切换规格为准。
