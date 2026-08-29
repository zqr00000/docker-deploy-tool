import React from 'react'

/**
 * 页面容器（彻底移除进入/切换动画，避免"动一下"）
 */
const PageTransition: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <div style={{ minHeight: '100%' }}>
      {children}
    </div>
  )
}

export default PageTransition
