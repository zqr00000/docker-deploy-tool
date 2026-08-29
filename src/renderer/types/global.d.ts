import type { ElectronAPI } from './electron-api'

// ============================================================
// 渲染进程全局类型声明
// ElectronAPI 与全部 IPC 数据类型的"单一来源"是 ./electron-api
// （由 src/preload/index.ts 同步引用），此处不再手写副本以避免类型漂移。
// ============================================================

export * from './electron-api'

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}
