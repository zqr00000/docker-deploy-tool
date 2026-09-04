# 云舵 (YunDuo) — Docker Deploy Tool

现代化的 Docker 部署管理与 AI 运维助手，支持通过 SSH 远程管理 Docker 容器、应用部署、文件传输，并内置可配置主流大模型的 AI 运维终端。

> 📦 下载安装包：[GitHub Releases](https://github.com/zqr00000/docker-deploy-tool/releases/latest)
>
> 🔄 安装版应用内置自动更新（基于 GitHub Releases），无需手动下载升级

## 功能特性

### 服务器管理
- 添加、编辑、删除远程服务器
- 支持密码和 SSH 密钥两种认证方式
- 一键连接/断开服务器
- 实时显示服务器连接状态
- 服务器分组管理
- 批量操作与多服务器管理
- SSH 连接自动重连和空闲超时管理

### Docker 环境检测
- 自动检测 Docker 是否安装
- 检测 Docker 服务运行状态
- 显示 Docker 和 Docker Compose 版本信息
- 自动安装 Docker 和 Docker Compose

### 应用部署
- 预置多种应用模板（Web、数据库、缓存、CMS、消息队列、监控等）
- 支持自定义 Docker Compose 配置
- 一键部署应用到远程服务器
- 支持启动、停止、重启应用容器
- 部署历史记录与版本回滚
- 批量部署到多台服务器

### 资源监控
- 实时查看容器状态
- 监控 CPU、内存、网络、块 IO 使用情况
- 查看容器日志（支持实时流式日志）
- 资源使用报表与趋势分析
- 容器性能分析和对比

### 实时日志流
- 实时流式日志查看（基于 SSH docker logs -f）
- 多容器日志聚合查看
- 日志过滤和搜索
- 日志导出（文本格式）
- 自动滚动和跟随模式

### 镜像管理
- 查看远程服务器镜像列表
- 拉取、删除镜像
- 清理悬空镜像和未使用镜像

### 数据卷管理
- 查看数据卷列表
- 创建、删除数据卷
- 清理未使用数据卷
- 查看数据卷详情

### 网络管理
- 查看 Docker 网络列表
- 创建、删除网络
- 管理容器网络连接

### 容器终端
- 基于 Web 的 SSH 终端
- 直接进入容器内部执行命令
- 多标签页支持

### 定时任务
- 定时重启容器
- 定时更新容器
- 定时备份数据库和数据卷
- 定时清理镜像和数据卷
- Cron 表达式支持

### 告警与通知
- 容器状态异常告警
- 资源阈值告警（CPU、内存、磁盘）
- 系统通知和 Webhook 通知
- 告警历史记录

### 健康检查
- 容器健康状态监控
- 自动重启异常容器
- 健康检查报告和历史记录

### 配置管理
- 配置导入/导出（JSON 格式）
- 操作审计日志
- 配置分享

### 应用商店
- 丰富的预置应用模板
- 模板分类与搜索
- 常用应用栈一键部署（LAMP、ELK 等）

### Compose 可视化编辑器
- 图形化编辑 Docker Compose 配置
- YAML 实时预览与校验
- 快速模板导入

### 批量操作
- 批量启动/停止/重启/删除容器
- 按状态过滤容器
- 容器搜索功能
- 操作模板保存和复用
- 操作进度可视化

### 备份与恢复
- 快速备份数据库、数据卷、配置
- 备份历史管理
- 从备份恢复
- 定时备份任务

### 安全扫描
- 镜像漏洞扫描
- 安全检查（Root 用户、健康检查、只读文件系统等）
- 扫描历史记录
- 安全报告生成

### CI/CD 集成
- 部署流水线管理
- 多种触发方式（手动、Webhook、定时）
- 部署历史记录
- 部署日志查看
- GitHub/GitLab Webhook 配置

### 全局搜索
- 跨模块搜索（服务器、应用、模板、容器、镜像、数据卷、网络）
- 键盘快捷键（Ctrl/Cmd + K）
- 搜索结果分类筛选
- 键盘导航

### 操作引导
- 分步骤新手引导教程
- 首次访问自动显示
- 使用帮助按钮

### 界面特性
- 深色/浅色主题切换
- 中英文语言切换
- 响应式设计
- 统一的 Ant Design 设计语言
- 虚拟滚动支持（大数据量列表）

## 性能优化

### 前端优化
- 路由级代码分割和懒加载
- 虚拟滚动组件（大数据量列表）
- 状态管理优化
- 组件渲染优化

### 后端优化
- 数据库索引优化
- SSH 连接池管理（空闲超时、连接数限制）
- 监控数据聚合和存储优化
- 日志流背压控制

## 技术栈

### 前端
- **框架**: React 18 + TypeScript
- **UI 库**: Ant Design 5
- **路由**: React Router 6
- **国际化**: i18next
- **图表**: Recharts
- **编辑器**: Monaco Editor
- **终端**: xterm.js
- **构建工具**: electron-vite + Vite

### 后端（Electron 主进程）
- **运行时**: Electron 32
- **数据库**: better-sqlite3
- **SSH**: ssh2
- **AI 框架**: Mastra + Vercel AI SDK（多提供商模型支持）
- **自动更新**: electron-updater（GitHub Releases）
- **日志**: electron-log
- **定时任务**: node-cron

### 打包
- **打包工具**: electron-builder
- **输出格式**: NSIS 安装包 (.exe) / MSI 安装包 (.msi)

## 项目结构

```
docker-deploy-tool/
├── src/
│   ├── main/                     # Electron 主进程
│   │   ├── index.ts              # 主进程入口
│   │   ├── database.ts           # 数据库操作
│   │   ├── ssh.ts                # SSH 服务（含连接池管理）
│   │   ├── system-check.ts       # 系统环境检测
│   │   ├── app-deploy.ts         # 应用部署服务
│   │   ├── docker-images.ts      # 镜像管理
│   │   ├── docker-volumes.ts     # 数据卷管理
│   │   ├── docker-networks.ts    # 网络管理
│   │   ├── container-terminal.ts # 容器终端
│   │   ├── deploy-history.ts     # 部署历史
│   │   ├── batch-operations.ts   # 批量操作
│   │   ├── scheduler.ts          # 定时任务调度
│   │   ├── alert-service.ts      # 告警服务
│   │   ├── health-check.ts       # 健康检查
│   │   ├── resource-reports.ts   # 资源报表
│   │   ├── audit-log.ts          # 审计日志
│   │   └── install-service.ts    # 自动安装
│   ├── preload/                  # 预加载脚本
│   │   └── index.ts
│   └── renderer/                 # 渲染进程（前端）
│       ├── components/           # React 组件
│       │   ├── GlobalSearch.tsx  # 全局搜索组件
│       │   ├── LogViewer.tsx     # 日志查看器
│       │   ├── MultiContainerLogs.tsx # 多容器日志
│       │   ├── OnboardingGuide.tsx # 操作引导
│       │   ├── VirtualList.tsx   # 虚拟滚动列表
│       │   └── ...
│       ├── pages/                # 页面组件
│       │   ├── BackupRestore.tsx # 备份恢复
│       │   ├── CicdIntegration.tsx # CI/CD 集成
│       │   ├── ContainerPerformance.tsx # 容器性能
│       │   ├── SecurityScan.tsx  # 安全扫描
│       │   └── ...
│       ├── context/              # React Context
│       ├── types/                # TypeScript 类型定义
│       ├── locales/              # 国际化语言文件
│       └── styles.css            # 全局样式
├── build/                        # 构建资源
│   └── icon.svg                  # 应用图标
├── dist/                         # 构建输出目录
├── release/                      # 打包输出目录
├── electron.vite.config.ts       # electron-vite 配置
├── package.json
└── tsconfig.json
```

## 安装说明

### 环境要求
- Node.js 18+
- npm 9+ 或 yarn
- Windows 10/11 (打包为 Windows 安装包)

### 开发环境安装

1. 克隆项目
```bash
git clone https://github.com/zqr00000/docker-deploy-tool.git
cd docker-deploy-tool
```

2. 安装依赖
```bash
npm install
```

3. 启动开发服务器
```bash
npm run dev
```

### 构建打包

1. 构建项目
```bash
npm run build
```

2. 打包为安装包
```bash
# 打包为 NSIS 和 MSI 安装包
npm run package

# 仅打包为 NSIS 安装包
npm run package:nsis

# 仅打包为 MSI 安装包
npm run package:msi

# 打包为目录（不打包成安装包）
npm run package:dir
```

3. 打包产物位于 `release/` 目录

## 使用说明

### 添加服务器
1. 点击左侧菜单「服务器」
2. 点击「添加服务器」按钮
3. 填写服务器信息（名称、主机、端口、用户名）
4. 选择认证方式（密码或 SSH 密钥）
5. 点击「保存」

### 连接服务器
1. 在服务器列表中找到目标服务器
2. 点击「连接」按钮
3. 等待连接状态变为「已连接」

### 部署应用
1. 连接目标服务器
2. 点击左侧菜单「应用」
3. 点击「部署新应用」按钮
4. 选择服务器和模板
5. 填写应用名称和配置
6. 点击「部署」

### 管理应用
- **启动**: 点击应用对应的「启动」按钮
- **停止**: 点击应用对应的「停止」按钮
- **重启**: 点击应用对应的「重启」按钮
- **查看日志**: 点击应用对应的「日志」按钮
- **删除**: 点击应用对应的「删除」按钮（需二次确认）

### 使用容器终端
1. 点击左侧菜单「终端」
2. 选择服务器和容器
3. 点击「连接」进入容器终端
4. 支持多标签页同时连接多个容器

### 使用全局搜索
- 按下 `Ctrl + K` 或 `Cmd + K` 打开全局搜索
- 输入关键词搜索服务器、应用、模板、容器等
- 使用 `↑` `↓` 键导航，`Enter` 键跳转，`ESC` 键关闭

### 使用批量操作
1. 点击左侧菜单「批量操作」
2. 筛选服务器和容器
3. 选择操作类型（启动/停止/重启/删除）
4. 点击「执行」按钮
5. 支持保存操作模板以便复用

### 使用实时日志
1. 在应用详情页点击「日志」标签
2. 选择容器
3. 点击「实时流」按钮开始流式传输
4. 支持日志过滤和自动滚动

### 使用多容器日志
1. 在应用详情页点击「多容器日志」
2. 选择多个容器
3. 点击「实时流」按钮同时查看所有容器日志
4. 支持按错误/警告类型过滤

### 配置定时任务
1. 点击左侧菜单「定时任务」
2. 点击「创建任务」
3. 选择任务类型（重启、更新、备份、清理）
4. 配置 Cron 表达式或选择预设
5. 选择目标服务器和应用
6. 保存并启用任务

### 设置告警规则
1. 点击左侧菜单「告警管理」
2. 点击「创建规则」
3. 选择规则类型（容器退出、资源超限等）
4. 配置阈值和通知渠道
5. 保存规则

### 使用备份恢复
1. 点击左侧菜单「备份恢复」
2. 选择服务器
3. 点击备份类型（数据库/数据卷/配置）
4. 在「恢复」标签选择备份进行恢复

### 使用安全扫描
1. 点击左侧菜单「安全扫描」
2. 选择服务器和镜像
3. 点击「开始扫描」
4. 查看漏洞报告和安全检查结果

### 使用 CI/CD 集成
1. 点击左侧菜单「CI/CD」
2. 点击「创建流水线」
3. 配置仓库地址、分支、触发方式
4. 手动触发或配置 Webhook 自动触发

### 导入/导出配置
1. 点击左侧菜单「设置」
2. 在「配置管理」卡片中：
   - 点击「导出配置」将所有配置导出为 JSON 文件
   - 点击「导入配置」从 JSON 文件恢复配置

### 使用 Compose 编辑器
1. 点击左侧菜单「Compose 编辑器」
2. 使用图形化界面添加服务、网络、卷
3. 实时预览生成的 YAML
4. 支持导入/导出 YAML 配置

## 预置应用模板

### 单服务模板
- Nginx Web Server
- MySQL 数据库
- PostgreSQL 数据库
- Redis 缓存
- MongoDB 数据库
- RabbitMQ 消息队列
- Elasticsearch 搜索引擎
- Grafana 监控面板
- Prometheus 监控系统
- Jenkins CI/CD
- GitLab 代码仓库
- Portainer 容器管理
- MinIO 对象存储
- Nginx Proxy Manager 反向代理
- WordPress CMS
- Nginx + PHP-FPM

### 应用栈模板
- LAMP (Linux + Apache + MySQL + PHP)
- ELK (Elasticsearch + Logstash + Kibana)
- Prometheus + Grafana 监控栈

## 配置说明

### 数据库
应用数据存储在用户数据目录下：
- Windows: `%APPDATA%/docker-deploy-tool/data/docker-deploy-tool.db`

### 日志文件
日志文件位于用户数据目录下：
- Windows: `%APPDATA%/docker-deploy-tool/logs/`

### 备份文件
定时任务备份文件存储在：
- Windows: `%APPDATA%/docker-deploy-tool/backups/`

## 常见问题

### Q: 连接到服务器失败？
A: 请检查：
1. 服务器 SSH 端口是否可达
2. 用户名和密码/密钥是否正确
3. 服务器防火墙是否开放了 SSH 端口

### Q: Docker 环境检测失败？
A: 请确保：
1. 服务器已安装 Docker
2. Docker 服务正在运行
3. 当前用户有权限访问 Docker

### Q: 部署应用失败？
A: 请检查：
1. 服务器是否已连接
2. Docker Compose 配置是否正确
3. 服务器磁盘空间是否充足

### Q: 定时任务未执行？
A: 请检查：
1. 任务是否已启用
2. Cron 表达式是否正确
3. 服务器是否在线

### Q: 告警通知未收到？
A: 请检查：
1. 告警规则是否已启用
2. 通知渠道配置是否正确
3. Webhook URL 是否有效

### Q: 如何使用全局搜索？
A: 按下 `Ctrl + K`（Windows）或 `Cmd + K`（Mac）打开搜索框，输入关键词即可搜索所有资源。

### Q: 如何批量操作容器？
A: 进入「批量操作」页面，筛选容器后选择操作类型，支持保存为模板以便下次复用。

### Q: Windows 安装时提示「Windows 已保护你的电脑」（SmartScreen）？
A: 软件目前未做代码签名，属正常现象。点击「更多信息」→「仍要运行」即可继续安装。

### Q: 应用内检查更新失败 / 提示 404？
A: 自动更新基于 GitHub Releases，请确认本机可以访问 github.com。命令行工具（git、npm 等）不读取 Windows 系统代理，需要时为其单独配置代理或使用镜像源。

## 开发指南

### 添加新的 SSH 处理器
在 `src/main/index.ts` 中的 `registerIpcHandlers` 函数添加新的 IPC handler：

```typescript
ipcMain.handle('your:handler', async (_, ...args) => {
  try {
    // 处理逻辑
    return result
  } catch (error) {
    log.error('your:handler error:', error)
    return { success: false, message: (error as Error).message }
  }
})
```

### 添加新的前端页面
1. 在 `src/renderer/pages/` 创建页面组件
2. 在 `src/renderer/App.tsx` 中添加路由
3. 在 `src/renderer/components/Layout.tsx` 中添加导航菜单
4. 在 `src/renderer/locales/` 中添加国际化文本
5. 在 `src/preload/index.ts` 中暴露 API

### 添加新的应用模板
在 `src/main/database.ts` 中的 `DEFAULT_TEMPLATES` 数组添加新模板。

### 添加新的定时任务类型
1. 在 `src/main/scheduler.ts` 中添加任务处理逻辑
2. 在 `src/renderer/pages/ScheduledTasks.tsx` 中添加 UI 选项
3. 在国际化文件中添加文本

### 使用虚拟滚动组件
```tsx
import VirtualList from '../components/VirtualList'

<VirtualList
  items={data}
  itemHeight={50}
  height={400}
  renderItem={(item, index) => <div>{item.name}</div>}
  keyExtractor={(item) => item.id}
/>
```

## 许可证

MIT License

## 致谢

- [Ant Design](https://ant.design/) - UI 组件库
- [Electron](https://electronjs.org/) - 桌面应用框架
- [Docker](https://www.docker.com/) - 容器技术
- [xterm.js](https://xtermjs.org/) - Web 终端
- [Recharts](https://recharts.org/) - 图表库
- [Monaco Editor](https://microsoft.github.io/monaco-editor/) - 代码编辑器
