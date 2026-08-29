// 最终验证：非注释中文残留 + 键完整性
const fs = require('fs')
const src = fs.readFileSync('src/renderer/pages/agent/AgentTerminal.tsx', 'utf8')
const lines = src.split(/\r?\n/)
const allowed = /内\s*存|\u78c1\s*\u76d8/ // 仅允许解析正则中的双语关键词（第 330/336 行输入匹配用）
const out = []
lines.forEach((l, i) => {
  const noComment = l.replace(/\/\/.*$/, '').replace(/\/\*[\s\S]*?\*\//g, '')
  if (/[\u4e00-\u9fa5]/.test(noComment)) out.push((i + 1) + ': ' + l.trim())
})
console.log('--- non-comment Chinese lines (regex input matching is expected) ---')
console.log(out.join('\n'))
console.log('--- key check ---')
const keys = [...new Set([
  ...src.matchAll(/\bt\(['"]agent\.([\w.]+)['"]/g),
  ...src.matchAll(/\bi18n\.t\(['"]agent\.([\w.]+)['"]/g)
].map(m => m[1]))]
const get = (o, k) => k.split('.').reduce((a, c) => (a == null ? a : a[c]), o)
const zh = JSON.parse(fs.readFileSync('src/renderer/locales/zh-CN.json', 'utf8')).agent || {}
const en = JSON.parse(fs.readFileSync('src/renderer/locales/en-US.json', 'utf8')).agent || {}
const missZh = keys.filter(k => get(zh, k) === undefined)
const missEn = keys.filter(k => get(en, k) === undefined)
console.log('keys used:', keys.length, '| missing zh:', JSON.stringify(missZh), '| missing en:', JSON.stringify(missEn))
