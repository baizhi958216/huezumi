# ComfyUI 工作流创作

`/studio/workflow` 复用其他创作台的页面容器、卡片、标签页与空状态，提供自定义节点编辑器：左侧节点、工作流模板与任务，中间缩放/平移/连接画布，右侧节点参数和结果。操作反馈在右下角逐条弹出，最多叠放五条，可展开并逐条关闭；具体节点参数问题保留在右侧详情中。画布采用 Vue Flow，平台不嵌入 ComfyUI 官方页面，也不向浏览器开放 ComfyUI 的通用代理。

## 安装与启动

在项目根目录执行：

```bash
pnpm install
pnpm comfy:install
pnpm db:push
pnpm dev
```

`comfy:install` 需要可用的 `python3` 和 Git，创建项目内的 uv 引导环境，下载 Python 3.12，在 `vendor/ComfyUI/.venv` 安装 Python 依赖。ComfyUI 首次检出固定到 [runtime.json](../integrations/comfyui/runtime.json) 中的提交；已有检出不会自动更新或重置。依赖来自该版本的 requirements，GPU/CUDA 环境应按设备要求自行调整 PyTorch 安装。此脚本不下载模型权重、不配置在线供应商凭据。

模型放在 `vendor/ComfyUI/models/` 对应目录，或按 ComfyUI 的 `extra_model_paths.yaml` 引用外部模型目录。第三方运行时、模型和运行数据均不提交到仓库。安装脚本同时安装独立的 [huezumi_nodes](../integrations/comfyui/huezumi_nodes/__init__.py) 插件，提供可选的兼容接口文本生成及文本输出节点。

Checkpoint 加载节点的 `ckpt_name` 需要选择真实 checkpoint，安装 ComfyUI 本身不会提供模型。标准 checkpoint 放在 `vendor/ComfyUI/models/checkpoints/`，拆分的 diffusion model 则放在 `models/diffusion_models/` 并使用对应加载节点，不能把两者混用。已有外部模型可在 `extra_model_paths.yaml` 配置路径并重启服务。安装完成后在参数面板点击「刷新可选项」。列表为空或原模型已移除时会提示具体原因；平台不会替换已选模型，运行前会重新读取最新列表。

默认随 Nuxt 启动本机 ComfyUI，只监听 `127.0.0.1:8188`。关闭 Nuxt 时关闭由该进程启动的 ComfyUI；不会接管或终止已存在的外部服务。管理员可在工作流页启停；存在未完成或待核对任务时拒绝停止。安装缺失不会阻止平台其他能力启动。首次 Python 加载可能需要几十秒。

| 环境变量                | 默认值           | 用途                                                  |
| ----------------------- | ---------------- | ----------------------------------------------------- |
| `NUXT_COMFY_MANAGED`    | `true`           | 是否允许该 Web 进程管理本机 ComfyUI                   |
| `NUXT_COMFY_AUTO_START` | `true`           | Nuxt 启动时拉起服务                                   |
| `NUXT_COMFY_DIRECTORY`  | `vendor/ComfyUI` | 第三方运行时目录，生产推荐绝对路径                    |
| `NUXT_COMFY_PYTHON`     | 空               | 空时使用上述目录中 `.venv` 的 Python                  |
| `NUXT_COMFY_PORT`       | `8188`           | 本机监听端口                                          |
| `NUXT_COMFY_CPU`        | `false`          | 无 GPU 时可设 `true` 做协议检查；视频模型通常需要 GPU |

私有运行日志位于 `.data/comfyui/runtime.log`，不通过 API 返回。进程控制不接受浏览器提供的命令、路径、监听地址或附加参数。安装脚本不自动加载 `.env`；本地路径默认相对项目根目录，`COMFY_BOOTSTRAP_PYTHON` 可替换引导 Python 可执行文件。

## 首次配置

管理员进入工作流页右上角「服务设置」，保存服务地址和可选节点参数配置，平台将创建数据库连接并分配默认工作流服务。已有主密钥仍使用 `NUXT_CONNECTION_ENCRYPTION_KEY`。不需要把供应商密钥写进工作流。

所有已加载节点自动可用，无需加入白名单。可选参数配置采用 JSON，键为 ComfyUI 的 `class_type`；`nodes` 可以为空，未列出的节点仍可使用：

```json
{
  "maxNodes": 100,
  "nodes": {
    "LoadImage": { "assetInputs": ["image"] },
    "SaveImage": { "fixedInputs": { "filename_prefix": "huezumi/output" } },
    "HuezumiTextOutput": {},
    "HuezumiOpenAIChat": {
      "fixedInputs": {
        "base_url": "https://model.example.com/v1",
        "model": "your-model",
        "max_tokens": 2048
      },
      "secretInputs": { "api_key": "apiKey" }
    }
  }
}
```

以上在线地址和模型名均为占位值。密钥在设置中的 `apiKey` / `accessKey` / `secretKey` 独立输入框填写，存储时加密，留空保留旧值。`secretInputs` 将节点输入名映射到这些凭据；只在 worker 提交给 ComfyUI 时注入。连接的 Bearer 鉴权也使用 `apiKey`，需要不同凭据时为节点映射其他凭据槽位。

本地文本模型可使用提供 OpenAI 兼容 `/chat/completions` 的服务，例如将 `base_url` 固定为本机服务的 `/v1`，将 `api_key` 放入 `fixedInputs` 且设为空字符串。文字生成后连接 `HuezumiTextOutput`。文本结果保存为新的不可变文档版本，不覆盖已有文稿。

工作流暂不接入平台计费，无需配置节点价格。用 `fixedInputs` 限制节点可访问的地址和文件路径。更改策略创建新的连接版本，已受理任务仍按固定版本执行；需要阻止旧任务时撤销连接版本。在线供应商自身的收费由连接账户承担。

## 工作流与节点扩展

1. 将可信插件安装到 ComfyUI 的 `custom_nodes/`，在对应虚拟环境安装插件依赖；普通用户不能通过平台安装 Python 插件。
2. 重启 ComfyUI，在节点面板点击「刷新节点」。目录来自当前服务的 `/object_info`，包括内置节点和已成功加载的插件节点，可按名称、类名或分类搜索。
3. 所有已加载节点自动显示并可执行，无需逐个勾选、启用或保存名单。标准上传字段自动识别；仅当需要服务端凭据、固定参数或补充自定义上传字段时，在服务设置的高级配置中填写。扫描只读取节点目录，不安装插件。
4. 点击刷新节点。平台通过 `/object_info` 获取输入/输出描述，生成控件和端口。替换模型文件或插件后无需重新编译平台。
5. 在画布编辑并保存，或导入 API JSON / 官方画布 JSON。管理员可将工作流保存为平台模板；用户载入其他人的模板会创建副本。

工作流保存在 `workflows` 表，兼容保留已有开发库的 `schema_version` / `visibility` 字段；新增布局、素材绑定和修订号提供默认值，不重写旧图、不把旧可见性自动升级为共享模板。更新需要基础 revision，冲突返回 409，可另存当前编辑。普通工作流及素材绑定按 owner 隔离；发布模板时清除素材绑定与受保护输入。浏览器草稿按账户隔离。导出 JSON 包含图和布局，素材需要接收者自行上传。

不自动预置起步模板。模板列表只展示数据库中保存的工作流与平台模板，可从空白画布开始或导入自己的 JSON；新增模板通过页面保存，无需改平台源码。仓库提供可手动导入的 [Qwen Image 2.1 文生图示例](#qwen-image-21-文生图模板)。

支持字符串、多行提示词、数字、布尔、枚举、类型端口、V3 COMBO 和递归 DynamicCombo。加载旧模板或导入 ComfyUI 官方画布 JSON 时，按服务端实时节点定义转换标准控件，恢复节点、位置与连线，并处理 seed 的生成后控制项。缺失插件、旁路状态或无法识别的控件会列出原因；此时只供检查画布，暂停保存、导出、执行和自动草稿写入，保留原始模板。安装插件后重新载入，或使用官方编辑器导出的 **API 格式 JSON**。未知节点会保留在画布中并标记缺失，不会静默丢弃。插件专有 JavaScript widget、自定义浏览器扩展、子图/reroute 的视觉格式、复杂 Autogrow/动态组等协议尚未实现；API 图支持 TemplateNames 单一 IMAGE 类型的命名动态端口，按当前连接展示端口并保留下一个空端口，校验名称、类型与最小数量。`min=0` 的空组可省略。支持 Qwen Image 2.1 文生图与参考图编辑；其他动态组需插件提供受支持的标准 API 节点。

标准上传字段根据节点元数据自动识别，自定义字段可通过 `assetInputs` 补充，不能让用户直接提交 ComfyUI 的共享文件名。输入先上传平台私有素材库，worker 校验 owner 后传到 ComfyUI 中按 owner/run 划分的目录。节点描述中的上传文件下拉列表被移除，避免泄露其他账户的文件名。节点插件由 ComfyUI 部署环境管理，平台不额外维护节点白名单。

## Qwen Image 2.1 文生图模板

导入 [绘小宙模板 JSON](../integrations/comfyui/templates/qwen-image-2.1-t2i.json)，管理员勾选「保存为平台模板」后保存，即可从模板列表复用。另提供 [ComfyUI API JSON](../integrations/comfyui/templates/qwen-image-2.1-t2i.api.json)，用于直接调用 ComfyUI `/prompt`；它没有画布布局，绘小宙中优先导入前一个文件。

模板根据 [Comfy-Org 官方工作流](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_qwen_image_2_1_t2i.json) 的基础文生图路径展开为九个标准节点，不启用提示词增强或参考图编辑。模型从 [官方 Comfy-Org 仓库](https://huggingface.co/Comfy-Org/Qwen-Image-2.1) 下载，分别放入：

| ComfyUI 模型目录           | 文件                                      |
| -------------------------- | ----------------------------------------- |
| `models/diffusion_models/` | `qwen_image_2.1_int8_convrot.safetensors` |
| `models/text_encoders/`    | `qwen3vl_8b_int8_convrot.safetensors`     |
| `models/vae/`              | `qwen_image_2.1_vae_bf16.safetensors`     |

三个文件合计约 17.3 GB；权重与生成结果不提交。ComfyUI 必须在 `/object_info` 中提供 `TextEncodeQwenImage21` 和 `QwenImage21Cache`。下载完成后刷新节点，确认三个加载器显示真实模型选项。

默认参数为 1024 × 1024、单张、25 步、Euler / simple、CFG 1、种子 `20261002`。修改「画面描述」节点的 `prompt`，修改「输出尺寸」节点的宽高（建议 32 的倍数），修改采样节点的 seed 可重新生成不同结果；CFG 1 时负向提示词不参与引导。初次检查可先把尺寸改为 512 × 512，保存标准模板后再修改测试草稿。文本节点的 `resolution` 主要控制参考图预处理，不是本模板的输出尺寸。

执行路径为扩散模型 → KV 缓存 → 采样，文本编码器 → 正/负条件 → 采样，空 latent → 采样 → VAE 解码 → PNG 保存。输出前缀为 `huezumi/qwen-image-2.1`，经绘小宙运行时仍通过私有作品归档访问。CPU/MPS/CUDA 和量化内核的实际兼容性以本机运行结果为准；成功加载目录不等于已完成生图。

## Qwen Image 2.1 图片编辑模板

导入 [图片编辑模板 JSON](../integrations/comfyui/templates/qwen-image-2.1-edit.json) 后保存为平台模板。它复用上节三个模型，按 [官方图片编辑工作流](https://github.com/Comfy-Org/workflow_templates/blob/main/templates/image_qwen_image_2_1_image_edit.json) 的参考图路径展开，不需要额外插件或提示词增强模型。

1. 选择「原图 · 上传要修改的图片」，上传自己的图片。
2. 选择「修改指令 · 参考图编码」，在 `prompt` 中说明要改什么、保留什么，例如「把宇航服改为湖蓝色，保留人物、姿势和背景」。
3. 点击「运行工作流」。结果保存为新作品，不覆盖原图。模板不保存私有素材绑定，每次重新载入模板需上传自己的素材；需要保留绑定时，取消「保存为平台模板」后另存个人工作流。

默认单张、25 步、Euler / simple、CFG 1、denoise 1。原图同时进入文本/视觉编码与 VAE 参考条件，采样使用编码节点的第三个 `latent` 输出，尺寸跟随第一张参考图。`resolution=0` 表示只将输入宽高取整到 32 的倍数；大图测试可以改为 512 或 1024，在保持比例的同时控制像素预算。这里的 denoise 1 是指令编辑路径的默认值，不是保证原图细节完全不变；修改范围由提示词和模型决定。

如需直接调用 ComfyUI，使用 [API JSON](../integrations/comfyui/templates/qwen-image-2.1-edit.api.json)，将节点 5 的 `image` 占位值替换为自己上传到该 ComfyUI 的文件名。绘小宙中应使用前一个模板，通过 owner 素材上传，不填写共享目录中的文件名。

## 执行与恢复

使用 `POST /api/workflows/runs` 直接运行，请求为 `{ input: { prompt, graph, assets }, idempotencyKey, projectId? }`。服务端固定规范化图和连接版本，在同一事务检查用户并发、登记任务和 outbox，复用 PostgreSQL pg-boss 持久队列。工作流不创建报价、不预留余额、不写账本、不扣费，也不依赖钱包或平台额度预算。任务结算状态为 `not_required`；其他创作模式仍使用原有计费流程。

提交状态持久化在调用 `/prompt` 前。网络超时或进程中断后不自动重发。已收到 prompt id 时通过后台任务轮询指定 `/history/{id}`，不向普通用户暴露全局 history、queue、view 或 interrupt。界面展示阶段，不伪造节点完成百分比。

- 提交前失败、明确拒绝或已知执行错误：标记失败。
- 提交或执行结果不明：进入 UNKNOWN/review，不自动重新生成。
- 已知 prompt id 的未知状态：可明确点击「同步状态」，只读取历史，不重新生成；撤销连接版本后禁止同步。
- 提交结果未知且没有 prompt id：由管理员核对 ComfyUI 私有历史，不能通过重试自动重发。
- 成功后幂等持久化输出，再后台归档。归档失败时「重试保存」不会重跑模型。

输出适配读取 history 的 UI 输出数组，支持 `text` 字符串及带 filename/subfolder/type=output 的 PNG/JPEG/WebP/GIF、MP4/WebM/MOV 文件，不依赖输出节点的类名。自定义输出应遵循这一合同。媒体由受固定连接限制的 `/view` 请求下载，再保存为私有对象，作品列表只读数据库。ComfyUI 原始媒体目录需保留到归档完成；下载和存储有大小/用户配额限制。托管启动关闭媒体 prompt 元数据，防止服务端注入的密钥被写进标准输出媒体；独立服务同样应启用 `--disable-metadata`。

## 生产部署

默认生产镜像只包含平台 Web/worker，不打包 Python、GPU 驱动、模型和第三方节点。两个 Compose 示例均关闭本机托管，生产应单独部署 ComfyUI，在数据库连接中填写 Web 与 worker 都可访问的私有地址，使用网络隔离或认证网关保护端口。浏览器仍只访问平台。

如在宿主机直接托管，只有一个 Web 实例启用 `NUXT_COMFY_MANAGED=true`，worker 和其他副本保持 false。多实例不能使用各自的 `127.0.0.1` 指向同一个服务。平台锁防止本机同目录重复启动；不承担跨主机进程编排。

## 验证

单元测试检查动态图校验、端口/循环、策略与元数据隔离、输出合同。`pnpm test:postgres` 创建随机临时数据库，覆盖连接版本绑定、幂等受理、混合输出、免计费、失败恢复、归档重试和 owner/revision 边界，结束后删除临时数据库。真实模型调用、真实采购账单与 GPU 性能需在对应部署环境另行验收。

协议依据：[ComfyUI 服务接口](https://docs.comfy.org/development/comfyui-server/comms_routes)、[Vue Flow 节点接口](https://vueflow.dev/guide/node.html)。
