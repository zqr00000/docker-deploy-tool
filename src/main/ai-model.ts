/**
 * AI 模型工厂 - 基于 Vercel AI SDK，统一多提供商适配
 * 供 ai:getModels / Mastra Agent 使用
 */

// AI SDK v7 为 ESM-only，主进程为 CJS 打包，需动态 import
let aiModulePromise: Promise<any> | null = null
function getAISDK(): Promise<any> {
  if (!aiModulePromise) aiModulePromise = import('ai')
  return aiModulePromise
}

// 根据提供商创建 AI SDK 模型
export async function createAIModel(
  provider: string,
  apiKey: string,
  model: string,
  baseUrl: string | undefined,
  extraParams: any
): Promise<any> {
  const ep = extraParams || {}
  switch (provider) {
    case 'anthropic': {
      const { createAnthropic } = await import('@ai-sdk/anthropic')
      return createAnthropic({ apiKey, baseURL: baseUrl || undefined })(model)
    }
    case 'gemini': {
      const { createGoogleGenerativeAI } = await import('@ai-sdk/google')
      return createGoogleGenerativeAI({ apiKey, baseURL: baseUrl || undefined })(model)
    }
    case 'azure': {
      const { createAzure } = await import('@ai-sdk/azure')
      return createAzure({
        apiKey,
        baseURL: (baseUrl || ep.azureEndpoint || '').replace(/\/$/, '') || undefined,
        apiVersion: ep.apiVersion || '2024-02-01'
      })(model) // model 即 deployment name
    }
    case 'ollama': {
      // Ollama 走 OpenAI 兼容端点
      const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible')
      return createOpenAICompatible({
        name: 'ollama',
        baseURL: (baseUrl || 'http://localhost:11434/v1').replace(/\/$/, '')
      })(model)
    }
    case 'custom': {
      const { createOpenAICompatible } = await import('@ai-sdk/openai-compatible')
      return createOpenAICompatible({
        name: 'custom',
        apiKey: apiKey || undefined,
        baseURL: (baseUrl || '').replace(/\/$/, '')
      })(model)
    }
    default: {
      const { createOpenAI } = await import('@ai-sdk/openai')
      return createOpenAI({
        apiKey,
        baseURL: (baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '')
      })(model)
    }
  }
}

// 获取 AI SDK 模块（供 jsonSchema 等工具使用）
export function getAI(): Promise<any> {
  return getAISDK()
}
