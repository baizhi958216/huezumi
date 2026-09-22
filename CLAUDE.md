# Claude 仓库入口

请先阅读并遵循 [AGENTS.md](AGENTS.md)。它是本仓库唯一的完整协作约定，本文件不复制另一套规则。

阅读顺序：

1. [README.md](README.md)：产品范围、目录和起步限制。
2. [DESIGN.md](DESIGN.md)：架构、数据与交互边界。
3. [docs/README.md](docs/README.md)：任务相关操作指南。
4. [spec/README.md](spec/README.md)：功能合同与验收。
5. [项目检查记录](docs/project-audit.md)：已验证状态和现有缺口。

优先核对源码与脚本。开发库以 schema.ts 为准，使用 `pnpm db:init` 初始化，不维护历史迁移；检查命令直接定义在 package.json。验证入口、数据保护和交付要求统一见 AGENTS.md。
