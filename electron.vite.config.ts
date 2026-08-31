import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts')
        }
      },
      outDir: 'dist/main'
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.ts')
        }
      },
      outDir: 'dist/preload'
    }
  },
  renderer: {
    plugins: [react()],
    root: resolve(__dirname, 'src/renderer'),
    // monaco 的 worker 以 `?worker` 形式从 node_modules 导入，依赖预构建无法解析，需排除
    optimizeDeps: {
      exclude: ['monaco-editor']
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      },
      outDir: resolve(__dirname, 'dist/renderer')
    },
    resolve: {
      alias: [
        // monaco-editor 0.56 的 exports 字段无法解析带 `?worker` 查询的导入，直接指向实际文件
        {
          find: /^monaco-editor\/esm\/vs\/editor\/editor\.worker\.js(\?.*)$/,
          replacement: resolve(__dirname, 'node_modules/monaco-editor/esm/vs/editor/editor.worker.js') + '$1'
        },
        {
          find: '@renderer',
          replacement: resolve(__dirname, 'src/renderer')
        }
      ]
    }
  }
})
