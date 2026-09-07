# ComfyUI 工作流模块

- 状态：draft
- 负责人：
- 创建日期：2026-09-04
- 相关 issue / ADR：

## 背景与问题

forkvdo 现有的生成链路面向"一家供应商一个 HTTP 任务"：平台契约 `GenerationRequest` 描述要什么，`VideoProvider` 把它映射成上游协议。这套模型无法表达用户自定义的节点图——ComfyUI 的工作流是**用户现场搭出来的图**，节点类型、连线关系和参数都由 `GET /object_info` 在运行期决定，平台不可能预先声明。

另一方面，ComfyUI 需要 Python + PyTorch 环境，安装门槛高；它的自带前端（litegraph canvas）与 forkvdo 的设计语言、导航和账号体系完全割裂。

因此需要一个独立模块：

1. ComfyUI 本体由 Nuxt 后端托管——仓库不存在时从官方仓库克隆，进程由后端拉起/停止。
2. 启动后 ComfyUI **只作为接口服务**，浏览器不直接访问它的 8188 端口，全部流量经 `/api/comfyui/**` 代理。
3. 前端工作流编辑器在 forkvdo 内自研，数据模型与序列化规则对齐 ComfyUI 官方前端（`ComfyUI_frontend` 的 `graphToPrompt`），保证导出的工作流 JSON 与官方互通。

## 目标

- 导航新增"工作流"入口，`/workflow` 页面可用。
- 支持两种接入模式：本地托管（`local`）与连接其他机器上的 ComfyUI（`remote`），可通过环境变量切换。
- 本地模式下，后端能检测仓库缺失并从 `https://github.com/comfyanonymous/ComfyUI.git` 克隆；能建虚拟环境并安装 `requirements.txt`。
- 后端能拉起、探活、停止 ComfyUI 进程，并向前端暴露状态与日志尾部。
- 前端节点库、节点参数控件完全由 `/object_info` 驱动，新增节点类型无需改前端代码。
- 拖拽建图、连线做类型校验、支持静音/绕过、一键提交到队列、WebSocket 实时进度、输出预览。
- 工作流可保存、列出、加载、删除、导入/导出 JSON（兼容 ComfyUI 官方 workflow 格式）。

## 非目标

- 不实现 ComfyUI-Manager、自定义节点安装/卸载、模型下载。
- 不实现多用户隔离、权限、配额；ComfyUI 侧无鉴权，模块假定运行在可信网络内。
- 不把 ComfyUI 任务并入 `GenerationRecord` / 作品库；两套任务模型互不迁移。
- 不实现子图（Subgraph）、分组（Group）、节点模板库、撤销/重做栈（首版仅保留前端内联的简单操作）。
- 不做 ComfyUI 前端的像素级还原，只对齐数据模型与交互习惯。
- 不处理远程 ComfyUI 的 HTTPS 证书自定义与鉴权头。

## 用户流程

1. 用户点导航"工作流"进入 `/workflow`。
2. 页面加载时请求 `GET /api/comfyui/status`：
   - 已运行 → 拉取 `/object_info`，渲染节点库。
   - 本地模式且未安装 → 展示"安装 ComfyUI"卡片（显示目标目录与预计步骤）。
   - 已安装未运行 → 展示"启动 ComfyUI"按钮。
   - remote 模式连不上 → 展示错误与基地址，提示检查 `NUXT_COMFYUI_REMOTE_BASE_URL`。
3. 用户点击安装 → 后端异步执行 clone（可选装依赖），页面轮询 status 展示进度日志。
4. 用户启动 → 后端 spawn 进程并轮询 `/system_stats` 直到就绪，页面显示"启动中…"与实时日志。
5. 就绪后：用户从左侧节点库点击或拖拽添加节点，在画布上连线；点击节点后，右侧检查器展示该节点的参数并可直接修改，文件加载节点还可从检查器上传对应类型的图片、音频或视频。
6. 点击"运行" → 前端把图序列化为 API prompt，`POST /api/comfyui/prompt` 提交，通过 WebSocket 接收 `execution_start` / `executing` / `progress` / `executed` / `execution_error`，节点高亮显示当前执行位置与进度条。
7. 执行完成后前端拉 `/api/comfyui/history/{promptId}`，把输出文件渲染为预览（图片走 `/api/comfyui/view`，视频用 `<video>`）。
8. 用户可保存/加载/导入/导出工作流，可清队、中断当前执行、释放显存。

## 行为契约

### 接入模式

| 配置                                      | 说明                                                           |
| ----------------------------------------- | -------------------------------------------------------------- |
| `NUXT_COMFYUI_MODE`                       | `auto`（默认）/ `local` / `remote`                             |
| `NUXT_COMFYUI_REMOTE_BASE_URL`            | remote 模式的基地址，如 `http://192.168.1.20:8188`             |
| `NUXT_COMFYUI_DIR`                        | local 模式仓库目录，默认 `<projectRoot>/vendor/ComfyUI`        |
| `NUXT_COMFYUI_PYTHON`                     | 解释器，默认依次尝试仓库内 `.venv/bin/python`、`uv`、`python3` |
| `NUXT_COMFYUI_HOST` / `NUXT_COMFYUI_PORT` | 本地监听地址与端口，默认 `127.0.0.1` / `8188`                  |
| `NUXT_COMFYUI_ARGS`                       | 追加到 `python main.py` 的额外参数                             |
| `NUXT_COMFYUI_START_TIMEOUT_MS`           | 就绪探测超时，默认 `180000`                                    |

- `auto`：配置了 `NUXT_COMFYUI_REMOTE_BASE_URL` 走 remote，否则 local。
- `remote` 模式下 `/api/comfyui/start`、`/stop`、`/install` 返回 `409`，状态接口不报告进程信息。
- 本地基地址恒为 `http://<host>:<port>`，仅服务端可访问。

### 后端进程管理

- 进程句柄挂在 `globalThis` 上，避免 Nitro HMR 重复拉起。
- 启动命令：`python main.py --listen <host> --port <port> --disable-auto-launch`，追加 `NUXT_COMFYUI_ARGS`。
- 就绪判定：轮询 `GET /system_stats`，默认 3 分钟超时；超时视为失败并停止进程。
- stdout/stderr 合并写入环形缓冲（最近 200 行），`GET /api/comfyui/status` 返回尾部 40 行。
- 停止：SIGTERM → 5 秒后 SIGKILL；进程自行退出时清理状态并失效 object_info 缓存。
- 重复 start：已有存活进程时返回当前状态，不重复拉起。

### 代理边界

- 浏览器只与 `/api/comfyui/**` 通信，**不直连 ComfyUI**（WebSocket 也走代理）。
- 上游不可达 → `502`；超时 → `504`；错误响应不含上游堆栈。
- `/api/comfyui/view` 以流方式转发二进制，并限制 `type` 只能是 `input|output|temp`。

### 节点定义（object_info）

- 服务端内存缓存，`GET /api/comfyui/object-info` 默认走缓存，`?refresh=1` 强制回源。
- 进程重启、安装完成、图片上传成功后缓存失效。
- 节点定义结构（`ComfyNodeDef`）直接映射官方返回：

```jsonc
{
  "input": {
    "required": { "ckpt_name": [["a.safetensors", "b.safetensors"], {}] },
    "optional": { "upscale_method": [["nearest-exact", "lanczos"], {}] }
  },
  "output": ["MODEL", "CLIP", "VAE"],
  "output_name": ["MODEL", "CLIP", "VAE"],
  "output_is_list": [false, false, false],
  "name": "CheckpointLoaderSimple",
  "display_name": "Load Checkpoint",
  "description": "",
  "category": "loaders",
  "output_node": false
}
```

### 输入分类规则

对 `input.required` 与 `input.optional`（先 required 后 optional，按声明顺序）：

- 类型为数组或字符串 `COMBO` → **COMBO 控件**（数组或 `options.options` 即选项列表）。
- 类型为 `INT` / `FLOAT` / `STRING` / `BOOLEAN` → **对应控件**。
- 其他类型（`MODEL`、`CLIP`、`VAE`、`IMAGE`、`LATENT`、`CONDITIONING`、`MASK` 等）→ **连线输入插槽**。

特殊规则（对齐官方前端）：

- 节点类型 ∈ {`KSampler`, `KSamplerAdvanced`, `PrimitiveNode`} 且输入名为 `seed` / `noise_seed` 时，紧跟一个前端专用控件 `control_after_generate`（`randomize` / `fixed` / `increment` / `decrement`）。该控件 **不参与序列化**（等价官方 `options.serialize === false`）。
- `control` 字段支持 `default`、`min`、`max`、`step`、`multiline`、`dynamic_prompts`。
- `image_upload` / `audio_upload` / `video_upload` 标记的 COMBO 控件显示对应的上传入口；上传成功后刷新 object_info 并将返回文件名写回该控件。
- `output_node: true` 的节点（如 `SaveImage`）标记为输出节点，运行后参与结果展示。

### 连线类型校验

允许连接当且仅当：`输入类型 === 输出类型`，或任一方为 `*`。

### 图 → API prompt 序列化

对齐 `ComfyUI_frontend` 的 `graphToPrompt`：

1. 跳过 `mode` 为 `NEVER`(2) / `BYPASS`(4) 的节点。
2. 每个节点生成 `{ class_type, inputs, _meta: { title } }`，key 为节点 id 字符串。
3. 控件值：按控件声明顺序写入 `inputs[name]`；`control_after_generate` 跳过；数组值包成 `{ __value__: v }`（后端会自动解包）。
4. 连线输入：`inputs[name] = [源节点 id 字符串, 源插槽序号]`。
5. 已被连线覆盖的控件不再写入字面值（以连线为准）。
6. 最后清理：指向不存在节点的连线输入删除。
7. 提交体：`{ prompt, client_id, extra_data: { extra_pnginfo: { workflow } } }`。

工作流 JSON 结构（与官方一致，便于互相导入）：

```jsonc
{
  "last_node_id": 9,
  "last_link_id": 5,
  "nodes": [
    {
      "id": 4,
      "type": "CheckpointLoaderSimple",
      "pos": [80, 120],
      "size": [280, 100],
      "flags": {},
      "order": 0,
      "mode": 0,
      "inputs": [],
      "outputs": [{ "name": "MODEL", "type": "MODEL", "links": [1] }],
      "title": "Load Checkpoint",
      "properties": { "Node name for S&R": "CheckpointLoaderSimple" },
      "widgets_values": ["v1-5-pruned-emaonly.safetensors"]
    }
  ],
  "links": [[1, 4, 0, 3, 0, "MODEL"]],
  "groups": [],
  "config": {},
  "extra": { "ds": { "scale": 1, "offset": [0, 0] } },
  "version": 1
}
```

`links` 每项为 `[linkId, 源节点 id, 源插槽, 目标节点 id, 目标插槽, 类型]`。

导入约束：`widgets_values` 为数组时按控件声明顺序位置映射；长度不匹配时缺失项取默认值并在 UI 提示。官方导出的工作流中"可选控件排在必填控件之前"的少数节点可能映射错位，属已知限制。

### 工作流持久化

Nitro `data` storage（`./.data`）：

- `comfyui:workflows:index` → `WorkflowSummary[]`（`id` / `name` / `nodeCount` / `updatedAt`）
- `comfyui:workflows:{id}` → `{ id, name, graph, createdAt, updatedAt }`

`id` 使用 UUID；无 schema version 字段，图结构以 `version: 1` 标记。

### HTTP 契约

| 方法   | 路径                              | 说明                                                                             |
| ------ | --------------------------------- | -------------------------------------------------------------------------------- |
| GET    | `/api/comfyui/status`             | 模式、安装状态、运行状态、基地址、进程 pid、system_stats、日志尾部、安装任务状态 |
| POST   | `/api/comfyui/install`            | body `{ installDeps?: boolean }`，异步执行 clone/装依赖                          |
| POST   | `/api/comfyui/start`              | 拉起本地进程并等待就绪（remote 模式 409）                                        |
| POST   | `/api/comfyui/stop`               | 停止本地进程（remote 模式 409）                                                  |
| GET    | `/api/comfyui/object-info`        | 节点定义；`?refresh=1` 强制回源                                                  |
| POST   | `/api/comfyui/prompt`             | body `{ prompt, clientId?, front? }` → `{ promptId, number, nodeErrors }`        |
| GET    | `/api/comfyui/history`            | `?maxItems=` 历史列表                                                            |
| GET    | `/api/comfyui/history/[promptId]` | 单条历史，含 outputs                                                             |
| GET    | `/api/comfyui/queue`              | `{ queueRunning, queuePending }`                                                 |
| POST   | `/api/comfyui/queue`              | body `{ clear?: true, delete?: number[] }`                                       |
| POST   | `/api/comfyui/interrupt`          | 中断当前执行                                                                     |
| POST   | `/api/comfyui/free`               | body `{ unloadModels?, freeMemory? }`                                            |
| POST   | `/api/comfyui/upload`             | multipart `{ file, kind }`；kind=image/audio/video；成功后失效 object_info 缓存  |
| GET    | `/api/comfyui/view`               | `?filename=&subfolder=&type=&preview=` 二进制流                                  |
| GET    | `/api/comfyui/workflows`          | 工作流列表                                                                       |
| POST   | `/api/comfyui/workflows`          | body `{ id?, name, graph }` 保存（id 存在则更新）                                |
| GET    | `/api/comfyui/workflows/[id]`     | 读取单个                                                                         |
| DELETE | `/api/comfyui/workflows/[id]`     | 删除                                                                             |
| GET    | `/api/comfyui/ws`                 | WebSocket 代理，逐帧转发 ComfyUI `/ws` 事件                                      |

提交失败但 HTTP 200 的情况：ComfyUI 在校验失败时返回 `{ error, node_errors }`，服务端必须解析并以 `422` 抛出，消息带上首个节点错误。

## 验收条件

- [ ] Given 本地模式且 `vendor/ComfyUI` 不存在，When 在 `/workflow` 点"安装"，Then 后端执行 `git clone`，status 轮询显示进度，完成后 `installed` 为 `true`。
- [ ] Given 仓库已存在，When 再次调用 install，Then 跳过克隆并返回已安装状态。
- [ ] Given 已安装未运行，When 点"启动"，Then 进程拉起、`system_stats` 就绪后 status 返回 `running: true`，页面可拉取 object_info。
- [ ] Given ComfyUI 已运行，When 打开 `/workflow`，Then 节点库按 `category` 分组展示全部节点，搜索可按 `display_name` / `name` 过滤。
- [ ] Given 一个含 CheckpointLoaderSimple → CLIPTextEncode → KSampler → VAEDecode → SaveImage 的图，When 点"运行"，Then 提交成功、节点按执行顺序高亮、完成后历史里出现输出图片并在预览区渲染。
- [ ] Given 连线两端类型不兼容（如 `MODEL` 连到 `IMAGE`），When 拖拽连接，Then 连接被拒绝并给出提示。
- [ ] Given 节点被静音（`mode: 2`）或绕过（`mode: 4`），When 提交，Then 序列化结果中不含该节点。
- [ ] Given 保存过的工作流，When 重新加载，Then 节点位置、连线、控件值与静音状态完全还原。
- [ ] Given 导出的工作流 JSON，When 在 ComfyUI 官方前端导入，Then 图结构可正常打开（控件顺序依赖声明顺序，见已知限制）。
- [ ] Given remote 模式，When 调用 `/api/comfyui/start`，Then 返回 `409` 且不影响远端服务。
- [ ] Given ComfyUI 未运行，When 调用 `/api/comfyui/prompt`，Then 返回 `502` 且错误信息不含上游堆栈。
- [ ] Given 移动端窄屏，Then 节点库与检查面板可折叠，画布仍可平移缩放。

## 边界情况

- ComfyUI 启动慢（首次加载模型）：就绪探测需容忍数分钟，页面展示日志而非超时报错。
- 重复提交：ComfyUI 串行执行，前端在队列非空时禁用重复运行按钮并提示队列位置。
- 上游限流/崩溃：进程退出后 status 变为 `stopped`，前端提示重启。
- 图片上传与 COMBO 刷新：上传后必须失效 object_info 缓存，否则 `LoadImage` 下拉不出现新文件。
- 音频/视频上传与 COMBO 刷新：`LoadAudio` / `LoadVideo` 使用字符串 `COMBO` 定义，上传后必须刷新节点定义并回填选中的节点参数。
- 右侧检查器：未选中节点时显示运行与输出；选中节点时展示其控件、连线输入和对应文件上传入口，参数修改必须同步到画布节点与最终 prompt。
- 大图预览：`/view` 支持 `preview` 参数，列表用缩略图，点击看原图。
- 节点缺失：加载的工作流引用了当前环境不存在的节点类型时，渲染为缺失节点卡片并阻止运行。
- 端口占用：8188 已被其他 ComfyUI 占用时，本地启动失败，日志显示端口冲突，需人工换端口。
- Nitro HMR：dev 下模块重载不能重复拉起进程，也不能丢失已有句柄。
- 远程模式 WebSocket：目标不可达时前端退化为轮询 history。

## 实现提示

- 进程与安装状态用 `globalThis` 单例保存，避免 dev HMR 重复拉起。
- 序列化逻辑放 `shared/` 或 `app/utils/`，必须可在无网络环境下单测；首版 harness 无测试框架，先保证纯函数可测、边界清晰。
- 服务端到 ComfyUI 的 WebSocket 客户端：优先用 Node 22+ 全局 `WebSocket`，缺失时回落到 `ws` 包。
- object_info 体积通常数 MB，服务端缓存并对前端按需裁剪（首版整体下发，后续再考虑分页）。

## 验证计划

- 自动化检查：`pnpm check:full`（harness contract + lint + typecheck + production build）。
- 人工检查：`/workflow` 安装/启动/建图/运行/预览/保存/加载全链路；窄屏折叠；深色模式。
- 需要凭据或外部环境的检查：真实 ComfyUI 运行（需 Python + PyTorch + 模型权重）。本机为 Apple M5 Pro / 48GB，ComfyUI 走 MPS；交付时如未实跑需明确说明。

## 上线与回滚

- 配置：新增环境变量见上表，同步 `.env.example` 与 `docs/development.md`。
- 依赖：新增 `@vue-flow/core`（节点编辑器）与 `ws`（WebSocket 客户端回落）。
- 存储：新增 `comfyui:workflows:*` 键，删除模块不影响其他数据。
- 回滚：移除 `/api/comfyui/**` 与 `/workflow` 页面即可，`.data` 中工作流保持可读；`vendor/ComfyUI` 已在 `.gitignore` 中。
- 可观测性：status 接口提供运行状态与日志尾部；进程退出原因记录到日志缓冲。

## 实现结果

完成后填写实际改动、偏差和遗留事项。
