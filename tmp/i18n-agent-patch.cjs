// i18n 迁移补丁：处理首轮未命中的 4 处
const fs = require('fs')
const path = require('path')
const root = path.resolve(__dirname, '..')
const srcPath = path.join(root, 'src', 'renderer', 'pages', 'agent', 'AgentTerminal.tsx')

let src = fs.readFileSync(srcPath, 'utf8')
let applied = 0
const missed = []

function applyAll(oldStr, newStr) {
  if (!src.includes(oldStr)) { missed.push(oldStr.slice(0, 100)); return }
  applied += src.split(oldStr).length - 1
  src = src.split(oldStr).join(newStr)
}

// 1. AI 分析提示词（源码中反引号被转义为 \`）
applyAll(
  '`请分析下面这段终端输出，说明它的含义、关键信息，以及是否需要处理：\\n\\`\\`\\`\\n${sel.slice(0, 3000)}\\n\\`\\`\\`' + '`',
  't(\'agent.analyzeSelectionPrompt\', { output: sel.slice(0, 3000) })'
)

// 2. 节流模板字面量中残留的“已取消生成”
applyAll('\\n\\n> ⏹ 已取消生成`', '\\n\\n> ⏹ ${' + "t('agent.genCancelled')" + '}`')

// 3. 快捷命令默认值（逐条替换，避免缩进差异）
applyAll("'请对当前服务器做一次综合健康检查',", "t('agent.quickTip1'),")
applyAll("'列出当前服务器上运行的所有 Docker 容器',", "t('agent.quickTip2'),")
applyAll("'查看服务器 CPU、内存、磁盘使用率'", "t('agent.quickTip3')")

fs.writeFileSync(srcPath, src, 'utf8')
console.log('Applied:', applied)
if (missed.length > 0) {
  console.log('MISSED:')
  for (const m of missed) console.log('  -', JSON.stringify(m))
} else {
  console.log('No misses.')
}
