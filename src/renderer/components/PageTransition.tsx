import React, { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Wraps page content with Apple-style fadeInUp transition on route change.
 * Re-triggers animation when the path changes.
 */
const PageTransition: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation()
  const [visible, setVisible] = useState(false)
  const prevPathRef = useRef(location.pathname)

  useEffect(() => {
    if (location.pathname !== prevPathRef.current) {
      setVisible(false)
      prevPathRef.current = location.pathname
      // Double rAF to ensure the browser registers the re-mount
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setVisible(true)
        })
      })
    } else {
      setVisible(true)
    }
  }, [location.pathname])

  return (
    <div
      style={{
        animation: visible ? 'pageEnter 0.35s cubic-bezier(0.32, 0.72, 0, 1) both' : 'none',
        opacity: visible ? undefined : 0,
        minHeight: '100%'
      }}
      key={location.pathname}
    >
      {children}
    </div>
  )
}

export default PageTransition
