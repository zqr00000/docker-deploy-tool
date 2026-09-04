// ============================================================
// AI 厂商福利活动自动抓取服务
// 运行时访问各厂商官方页面，提取与促销/福利相关的文本片段。
// 使用 Electron net.request（走 Chromium 网络栈，跟随系统代理），
// 规避渲染进程 CORS 与 Node fetch 直连现状；反爬/动态渲染仍可能抓不到，
// 此时返回空 items，由前端展示"官方暂无公开可解析活动"。
// 本服务不编造活动内容，一切以官方页面实际可抓取文本为准。
// ============================================================
import { net } from 'electron'
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

// 基于 Electron net.request 的 GET（走 Chromium 网络栈并跟随系统代理）
function httpGet(url: string): Promise<{ ok: boolean; status: number; text: string }> {
  return new Promise((resolve) => {
    const req = net.request({
      method: 'GET',
      url,
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8'
      }
    })
    const timer = setTimeout(() => {
      try { req.abort() } catch { /* ignore */ }
      resolve({ ok: false, status: 0, text: '' })
    }, 9000)

    let status = 0
    let body = ''
    req.on('response', (res) => {
      status = res.statusCode
      res.on('data', (chunk) => { body += chunk.toString('utf8') })
      res.on('end', () => {
        clearTimeout(timer)
        resolve({ ok: status >= 200 && status < 300, status, text: body })
      })
    })
    req.on('error', () => {
      clearTimeout(timer)
      resolve({ ok: false, status: 0, text: '' })
    })
    req.end()
  })
}

async function fetchPromo(source: PromoSource): Promise<PromoItem> {
  const result: PromoItem = { name: source.name, url: source.url, title: '', items: [] }
  const res = await httpGet(source.url)
  if (!res.ok) {
    log.warn(`[promo] ${source.name} HTTP ${res.status || 'fail'}`)
    return result
  }

  result.title = extractTitle(res.text)
  const text = htmlToText(res.text)

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
  return result
}

// 并行抓取全部厂商（首流者失败不影响其他）
export async function fetchPromotions(): Promise<PromoItem[]> {
  return Promise.all(PROMO_SOURCES.map(s => fetchPromo(s)))
}