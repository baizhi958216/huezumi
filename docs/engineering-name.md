# Huezumi 工程命名

中文品牌「绘小宙」用于网页导航、登录与站点标题；英文品牌 Huezumi，包名 `huezumi`。当前代码不读取旧品牌 Cookie 或节点包别名。

| 类别                               | 当前标识                                              |
| ---------------------------------- | ----------------------------------------------------- |
| Python 节点包                      | `comfyui/custom_nodes/huezumi_prompt/`                |
| 节点 / 插槽                        | `Huezumi*` / `HUEZUMI_*`                              |
| Nuxt 部署变量                      | `NUXT_*`                                              |
| 独立执行端连接                     | `HUEZUMI_LLM_CONNECTIONS_JSON`、`HUEZUMI_DASHSCOPE_*` |
| 历史导入专用                       | `HUEZUMI_LEGACY_*`，不作为运行期品牌回退              |
| 默认数据库 / 本地桶 / Compose 项目 | `huezumi`                                             |
| 开发显式卷名                       | `huezumi-postgres-dev`、`huezumi-seaweedfs-dev`       |
| 默认新对象前缀                     | `huezumi/uploads`、`huezumi/outputs`                  |
| 会话 Cookie                        | `huezumi_session`                                     |
| 主队列 / 死信队列                  | `huezumi-generations`、`huezumi-generation-failures`  |
| 任务锁前缀                         | `huezumi:generation:`                                 |

已有数据库、桶和对象前缀可以继续使用明确配置的名称。工程重命名不自动搬迁对象、数据卷、绝对路径或 Git remote；不要根据新示例覆盖旧部署配置。

如果迁移更旧品牌的数据，先盘点实际标识与引用，再提供专门的迁移方案；不能仅重命名目录就认为数据库、工作流插槽和对象引用已更新。保留备份，验证复制结果后再切换引用，具体数据操作见 [运维指南](operations.md)。
