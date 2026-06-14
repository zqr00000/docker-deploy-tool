# Docker Deploy Tool

现代化的 Docker 部署管理工具，支持通过 SSH 远程管理 Docker 容器和应用部署。

## 功能特性

### 服务器管理
- 添加、编辑、删除远程服务器
- 支持密码和 SSH 密钥两种认证方式
- 一键连接/断开服务器
- 实时显示服务器连接状态

### Docker 环境检测
- 自动检测 Docker 是否安装
- 检测 Docker 服务运行状态
- 显示 Docker 和 Docker Compose 版本信息

### 应用部署
- 预置多种应用模板（Web、数据库、缓存、CMS 等）
- 支持自定义 Docker Compose 配置
- 一键部署应用到远程服务器
- 支持启动、停止、重启应用容器

### 资源监控
- 实时查看容器状态
- 监控 CPU、内存、网络、块 IO 使用情况
- 查看容器日志

### 模板管理
- 预置常用应用模板
- 创建自定义部署模板
- 模板分类管理

### 界面特性
- 深色/浅色主题切换
- 中英文语言切换
- 响应式设计，支持移动端查看
- 统一的 Ant Design 设计语言

## 技术栈

### 前端
- **框架**: React 18 + TypeScript
- **UI 库**: Ant Design 5
- **路由**: React Router 6
- **国际化**: i18next
- **构建工具**: electron-vite + Vite

### 后端（Electron 主进程）
- **运行时**: Electron 32
- **数据库**: better-sqlite3
- **SSH**: ssh2
- **日志**: electron-log

### 打包
- **打包工具**: electron-builder
- **输出格式**: NSIS 安装包 (.exe) / MSI 安装包 (.msi)

## 项目结构

```
docker-deploy-tool/
├── src/
│   ├── main/                 # Electron 主进程
│   │   ├── index.ts          # 主进程入口
│   │   ├── database.ts       # 数据库操作
│   │   ├── ssh.ts            # SSH 服务
│   │   ├── docker-check.ts   # Docker 环境检测
│   │   └── app-deploy.ts     # 应用部署服务
│   ├── preload/              # 预加载脚本
│   │   └── index.ts
│   └── renderer/             # 渲染进程（前端）
│       ├── components/        # React 组件
│       ├── pages/             # 页面组件
│       ├── context/           # React Context
│       ├── types/             # TypeScript 类型定义
│       ├── locales/           # 国际化语言文件
│       └── styles.css         # 全局样式
├── build/                    # 构建资源
│   └── icon.svg              # 应用图标
├── dist/                     # 构建输出目录
├── release/                  # 打包输出目录
├── electron.vite.config.ts   # electron-vite 配置
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
git clone <repository-url>
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

## 配置说明

### 数据库
应用数据存储在用户数据目录下：
- Windows: `%APPDATA%/docker-deploy-tool/database.sqlite`

### 日志文件
日志文件位于用户数据目录下：
- Windows: `%APPDATA%/docker-deploy-tool/logs/`

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
3. 在 `src/renderer/locales/` 中添加国际化文本

### 添加新的应用模板
在 `src/renderer/data/default-templates.ts` 中添加新模板。

## 许可证

MIT License

## 致谢

- [Ant Design](https://ant.design/) - UI 组件库
- [Electron](https://electronjs.org/) - 桌面应用框架
- [Docker](https://www.docker.com/) - 容器技术
