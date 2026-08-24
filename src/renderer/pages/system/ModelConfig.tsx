import React from 'react'
import AiModelConfigPanel from '../../components/AiModelConfigPanel'

/**
 * 系统管理 → 模型配置 子菜单页
 * 直接铺满渲染 AiModelConfigPanel（内嵌平铺布局），改动最小。
 */
const ModelConfig: React.FC = () => {
  return (
    <div style={{ height: '100%', overflow: 'hidden' }}>
      <AiModelConfigPanel />
    </div>
  )
}

export default ModelConfig