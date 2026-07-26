import React, { useState, useCallback, useRef, useEffect, memo } from 'react'
import { Spin } from 'antd'

interface VirtualListProps<T> {
  items: T[]
  itemHeight: number
  height: number
  renderItem: (item: T, index: number) => React.ReactNode
  keyExtractor: (item: T, index: number) => string | number
  onScrollEnd?: () => void
  loading?: boolean
  emptyText?: string
  overscan?: number
}

interface VirtualListItemProps<T> {
  item: T
  index: number
  style: React.CSSProperties
  renderItem: (item: T, index: number) => React.ReactNode
}

function VirtualListItemComponent<T>({ item, index, style, renderItem }: VirtualListItemProps<T>) {
  return (
    <div style={style}>
      {renderItem(item, index)}
    </div>
  )
}

const VirtualListItem = memo(VirtualListItemComponent) as typeof VirtualListItemComponent
(VirtualListItem as { displayName?: string }).displayName = 'VirtualListItem'

function VirtualList<T>({
  items,
  itemHeight,
  height,
  renderItem,
  keyExtractor,
  onScrollEnd,
  loading = false,
  emptyText = '暂无数据',
  overscan = 5
}: VirtualListProps<T>) {
  const [scrollTop, setScrollTop] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const isScrollingRef = useRef(false)

  const totalHeight = items.length * itemHeight
  const visibleCount = Math.ceil(height / itemHeight)
  const startIndex = Math.max(0, Math.floor(scrollTop / itemHeight) - overscan)
  const endIndex = Math.min(items.length, startIndex + visibleCount + overscan * 2)
  const offsetY = startIndex * itemHeight

  const visibleItems = items.slice(startIndex, endIndex)

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement
    const newScrollTop = target.scrollTop
    setScrollTop(newScrollTop)

    // 检测是否滚动到底部
    if (onScrollEnd && !isScrollingRef.current) {
      const { scrollHeight, clientHeight } = target
      if (scrollHeight - newScrollTop - clientHeight < 100) {
        isScrollingRef.current = true
        onScrollEnd()
        setTimeout(() => {
          isScrollingRef.current = false
        }, 200)
      }
    }
  }, [onScrollEnd])

  // 重置滚动位置当 items 变化
  useEffect(() => {
    if (containerRef.current && items.length > 0) {
      // 保持当前位置
    }
  }, [items.length])

  if (items.length === 0 && !loading) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          color: '#999'
        }}
      >
        {emptyText}
      </div>
    )
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      style={{
        height,
        overflow: 'auto',
        position: 'relative'
      }}
    >
      <div style={{ height: totalHeight, position: 'relative' }}>
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            transform: `translateY(${offsetY}px)`
          }}
        >
          {visibleItems.map((item, index) => {
            const actualIndex = startIndex + index
            return (
              <VirtualListItem
                key={keyExtractor(item, actualIndex)}
                item={item}
                index={actualIndex}
                style={{ height: itemHeight }}
                renderItem={renderItem}
              />
            )
          })}
        </div>
      </div>
      {loading && (
        <div style={{ textAlign: 'center', padding: 16 }}>
          <Spin size="small" />
        </div>
      )}
    </div>
  )
}

export default memo(VirtualList) as typeof VirtualList
