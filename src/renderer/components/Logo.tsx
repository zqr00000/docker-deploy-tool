import React from 'react'

const Logo: React.FC<{ size?: number }> = ({ size = 32 }) => {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      fill="none"
      style={{ width: size, height: size }}
    >
      <circle cx="32" cy="32" r="30" fill="#007AFF" />
      <rect x="16" y="20" width="32" height="8" rx="2" fill="#fff" />
      <rect x="16" y="30" width="32" height="8" rx="2" fill="#fff" opacity="0.9" />
      <rect x="16" y="40" width="32" height="8" rx="2" fill="#fff" opacity="0.8" />
      <line x1="20" y1="24" x2="44" y2="24" stroke="#007AFF" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="20" y1="34" x2="44" y2="34" stroke="#007AFF" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="20" y1="44" x2="36" y2="44" stroke="#007AFF" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M48 12 L48 20 M44 16 L48 12 L52 16" stroke="#34C759" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  )
}

export default Logo
