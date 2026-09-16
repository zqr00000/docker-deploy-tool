/**
 * i18n 语言包一致性校验（构建期执行）
 * 校验所有语言包的 key 集合完全一致，缺失时列出差异并使构建失败。
 * 用法：node scripts/check-i18n.mjs （package.json 的 build 脚本已接入）
 */
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const localesDir = join(root, 'src', 'renderer', 'locales')

function flatten(obj, prefix = '') {
  const keys = []
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') keys.push(...flatten(v, key))
    else keys.push(key)
  }
  return keys
}

const files = ['zh-CN.json', 'en-US.json']
const keySets = new Map()

for (const file of files) {
  try {
    const data = JSON.parse(readFileSync(join(localesDir, file), 'utf-8'))
    keySets.set(file, new Set(flatten(data)))
  } catch (e) {
    console.error(`[i18n-check] 解析 ${file} 失败: ${e.message}`)
    process.exit(1)
  }
}

let failed = false
const entries = [...keySets.entries()]
for (let i = 0; i < entries.length; i++) {
  const [fileA, keysA] = entries[i]
  for (let j = i + 1; j < entries.length; j++) {
    const [fileB, keysB] = entries[j]
    const missingInB = [...keysA].filter(k => !keysB.has(k))
    const missingInA = [...keysB].filter(k => !keysA.has(k))
    if (missingInB.length) {
      failed = true
      console.error(`[i18n-check] ${fileB} 缺少 ${missingInB.length} 个 key（来自 ${fileA}）:`)
      missingInB.forEach(k => console.error(`  - ${k}`))
    }
    if (missingInA.length) {
      failed = true
      console.error(`[i18n-check] ${fileA} 缺少 ${missingInA.length} 个 key（来自 ${fileB}）:`)
      missingInA.forEach(k => console.error(`  - ${k}`))
    }
  }
}

if (failed) process.exit(1)
console.log(`[i18n-check] 通过：${files.join(' / ')} key 完全一致（${keySets.get(files[0]).size} keys）`)
