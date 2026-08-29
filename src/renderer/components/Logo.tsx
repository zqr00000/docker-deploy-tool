import React from 'react'

const Logo: React.FC<{ size?: number }> = ({ size = 32 }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      style={{ width: size, height: size, display: 'block' }}
    >
      <defs>
        <linearGradient id="yunduo-logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#2E9BFF" />
          <stop offset="100%" stopColor="#0047C1" />
        </linearGradient>
      </defs>

      {/* 背景：圆角方块 + 深蓝渐变（云端意象） */}
      <rect x="2" y="2" width="60" height="60" rx="14" fill="url(#yunduo-logo-bg)" />
      <rect x="2" y="2" width="60" height="60" rx="14" fill="none" stroke="#ffffff" strokeOpacity="0.18" strokeWidth="1" />

      {/* 云朵 */}
      <g fill="#ffffff">
        <circle cx="27" cy="17" r="6.5" />
        <circle cx="36" cy="19" r="5.5" />
        <circle cx="22" cy="21" r="5" />
        <rect x="18.5" y="19" width="23" height="9.5" rx="4.75" />
      </g>

      {/* 船舵（舵轮） */}
      <g stroke="#ffffff" strokeWidth="3.2" strokeLinecap="round">
        <circle cx="32" cy="45" r="12.5" fill="none" />
        <line x1="32" y1="32.5" x2="32" y2="57.5" />
        <line x1="19.5" y1="45" x2="44.5" y2="45" />
        <line x1="23.2" y1="36.2" x2="40.8" y2="53.8" />
        <line x1="40.8" y1="36.2" x2="23.2" y2="53.8" />
      </g>
      {/* 舵柄端点 + 中心毂 */}
      <g fill="#ffffff">
        <circle cx="32" cy="29" r="2.6" />
        <circle cx="32" cy="61" r="2.6" />
        <circle cx="16" cy="45" r="2.6" />
        <circle cx="48" cy="45" r="2.6" />
        <circle cx="32" cy="45" r="4.6" />
      </g>
      <circle cx="32" cy="45" r="2" fill="#0047C1" />
    </svg>
  )
}

export default Logo