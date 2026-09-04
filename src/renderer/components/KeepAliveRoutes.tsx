// ============================================================
// 轻量级路由 Keep-Alive：缓存已访问页面的渲染结果与组件状态
// 原理：useRoutes 只产出"当前匹配"的 element，本组件把每次匹配结果
// 存入缓存 Map，所有已访问页面同时挂载（非激活 display:none 隐藏），
// 从而在切换标签时保留表单、滚动位置、编辑器等组件状态。
// 关闭标签时应调用 releaseCache(path) 释放对应页面，避免内存占用。
// 详情路由（/servers/:id、/apps/:id）每次路径参数不同，不做缓存。
// ============================================================
import React, { useRef, useCallback } from 'react'
import { useRoutes, useLocation, RouteObject } from 'react-router-dom'

// 模块级引用：Layout 关闭标签时通过 releaseCache 释放对应页面缓存
let dropCacheRef: ((path: string) => void) | null = null

export function releaseCache(path: string): void {
  try {
    dropCacheRef?.(path)
  } catch {
    // 忽略
  }
}

// 不做缓存的详情路由前缀（路径含参数，按首次访问路径缓存会导致内存无限增长）
const NO_CACHE_PREFIXES = ['/servers/', '/apps/']

function shouldCache(pathname: string): boolean {
  return !NO_CACHE_PREFIXES.some(p => pathname.startsWith(p))
}

interface KeepAliveRoutesProps {
  routes: RouteObject[]
}

const KeepAliveRoutes: React.FC<KeepAliveRoutesProps> = ({ routes }) => {
  const location = useLocation()
  const cacheMapRef = useRef<Map<string, React.ReactNode>>(new Map())
  const [, forceUpdate] = React.useReducer((x: number) => x + 1, 0)

  const element = useRoutes(routes, location)

  // 当前路径写入缓存（详情路由不缓存）
  const key = location.pathname
  const cacheMap = cacheMapRef.current
  if (shouldCache(key) && element && !cacheMap.has(key)) {
    cacheMap.set(key, element)
    forceUpdate()
  }

  const dropCache = useCallback((path: string) => {
    if (cacheMapRef.current.delete(path)) {
      forceUpdate()
    }
  }, [])

  // 暴露释放缓存给 Layout 使用
  dropCacheRef = dropCache

  // 不缓存的路径（详情路由等）：不放进缓存 Map，但必须直接渲染当前 element，否则会整页空白/黑屏
  const shouldRenderDirect = !shouldCache(key) && !!element

  return (
    <>
      {shouldRenderDirect && (
        <div
          key={key}
          style={{
            display: 'block',
            height: '100%',
            minHeight: 0
          }}
        >
          {element}
        </div>
      )}
      {Array.from(cacheMap.entries()).map(([path, node]) => (
        <div
          key={path}
          style={{
            // 非激活页隐藏；激活页撑满父容器高度，保证 FileTransfer 等固定高度页面正常布局
            display: path === key ? undefined : 'none',
            height: '100%',
            minHeight: 0
          }}
        >
          {node}
        </div>
      ))}
    </>
  )
}

export default KeepAliveRoutes
