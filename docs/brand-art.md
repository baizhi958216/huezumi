# 品牌与视觉资源

中文展示名「绘小宙」，英文品牌 Huezumi。导航、登录和站点标题沿用中文；工程标识见 [命名说明](engineering-name.md)。

## 当前实现入口

| 内容                                 | 来源                                                                               |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| 全站颜色、字体、圆角、阴影与鼠标指针 | [main.css](../app/assets/css/main.css)                                             |
| Nuxt UI 组件样式                     | [app.config.ts](../app/app.config.ts)                                              |
| 首页排版                             | [home-editorial.css](../app/assets/css/home-editorial.css)、`app/components/home/` |
| 导航标识                             | [BrandLogo.vue](../app/components/BrandLogo.vue)                                   |
| favicon                              | [favicon.svg](../public/favicon.svg)                                               |
| 插画与光标                           | `public/images/`、`public/cursors/`                                                |

基础界面采用奶油白、珊瑚与深棕文字，支持暗色；首页创意图允许冷色、多色和不同媒介，不能沿用旧提示词中的“禁止蓝紫”作为全站约束。插画是概念示意，不能替代真实用户作品或生成质量证明。

当前普通光标使用 `coral-arrow-v3.png`，手形使用 `planet-hand.png`；仅对支持 hover 的精细指针启用，保留原生后备与文本/禁用语义。旧资源仍可能被历史页面或工具引用，本轮未删除二进制图片。

## 维护方法

优先复用现有令牌和组件，核对明暗主题、移动布局、图片原比例与键盘关闭交互。调整资源前搜索实际引用；生成提示词、原始导出和当前网页引用分别管理，不依赖某个开发者的工具临时目录。

原文的大量生成提示词和版本迭代已移到 [历史品牌提示词](archive/brand-art-prompts.md)。它记录制作过程，当前效果以组件和 CSS 引用为准。
