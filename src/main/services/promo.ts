// ============================================================
// AI 厂商福利活动自动抓取服务
// 运行时访问各厂商官方页面，提取与促销/福利相关的文本片段。
// 官方页面为动态渲染或无促销内容时返回空 items，由前端展示"官方暂无公开可解析活动"。
// 本服务不编造活动内容，一切以官方页面实际可抓取文本为准。
// ============================================================
import log from 'electron-log'

interface PromoItem {
  name: string
  url: string
  title: string
  items: string[]
}

interface PromoSource {
  id: string
  name: string
  url: string
}

// 首批厂商官方源（可增删调整，URL 尽量使用官方主域/活动页）
const PROMO_SOURCES: PromoSource[] = [
  { id: 'qoder', name: 'Qoder', url: 'https://www.qoder.com/' },
  { id: 'lingma', name: '通义灵码', url: 'https://lingma.aliyun.com/' },
  { id: 'trae', name: 'Trae', url: 'https://www.trae.ai/' },
  { id: 'doubao', name: '豆包', url: 'https://www.doubao.com/' },
  { id: 'deepseek', name: 'DeepSeek', url: 'https://www.deepseek.com/' },
  { id: 'kimi', name: 'Kimi', url: 'https://kimi.moonshot.cn/' },
  { id: 'openai', name: 'OpenAI', url: 'https://openai.com/' },
  { id: 'anthropic', name: 'Anthropic', url: 'https://www.anthropic.com/' },
  { id: 'gemini', name: 'Google Gemini', url: 'https://gemini.google.com/' }
]

// 促销/福利关键词：命中即认为该句可能是福利信息（中英混合）
const PROMO_KEYWORDS = [
  'credits', 'credit', '免费', '赠送', '送', '优惠', '折扣', '翻倍', '加赠',
  '首月', '续费', '兑换', '领', '外赠', 'bonus', 'discount', 'offer',
  'promo', 'free', 'off', 'claim'
]

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36'

// 去除 HTML 标签与脚本/样式块 → 纯文本
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
}

// 提取页面标题
function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i)
  return (m && m[1] ? m[1].trim() : '') || ''
}

// 句子切分（按常见中英文句子终结符），过于琐碎的句子丢弃
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[。！？；.\n!?])/) // 后面是正向断言，兼容 PCRE
    .map(s => s.trim())
    .filter(s => s.length >= 6 && s.length <= 180)
}

async function fetchPromo(source: PromoSource): Promise<PromoItem> {
  const result: PromoItem = { name: source.name, url: source.url, title: '', items: [] }
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 9000)
    const res = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    }).finally(() => clearTimeout(timer))

    if (!res.ok) {
      log.warn(`[promo] ${source.name} HTTP ${res.status}`)
      return result
    }

    const html = await res.text()
    result.title = extractTitle(html)
    const text = htmlToText(html)

    // 命中促销关键词的句子去重缓存
    const seen = new Set<string>()
    for (const sentence of splitSentences(text)) {
      if (result.items.length >= 5) break
      if (!PROMO_KEYWORDS.some(k => sentence.toLowerCase().includes(k.toLowerCase()))) continue
      const key = sentence.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      result.items.push(sentence)
    }
    log.info(`[promo] ${source.name}: title="${result.title}", matched=${result.items.length}`)
  } catch (error) {
    log.warn(`[promo] ${source.name} fetch failed: ${(error as Error).message}`)
  }
  return result
}

// 并行抓取全部厂商（首流者失败不影响其他）
export async function fetchPromotions(): Promise<PromoItem[]> {
  return Promise.all(PROMO_SOURCES.map(s => fetchPromo(s)))
}