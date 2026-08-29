// JSX 文本节点中的 t()/i18n.t() 补 {} 包裹
const fs = require('fs')
const path = require('path')
const srcPath = path.join(__dirname, '..', 'src', 'renderer', 'pages', 'agent', 'AgentTerminal.tsx')

let src = fs.readFileSync(srcPath, 'utf8')
let applied = 0
const missed = []

function fix(oldStr, newStr) {
  if (!src.includes(oldStr)) { missed.push(oldStr.slice(0, 110)); return }
  applied += src.split(oldStr).length - 1
  src = src.split(oldStr).join(newStr)
}

fix(">t('agent.sessionsTitle', { count: sessions.length })</Text>", ">{t('agent.sessionsTitle', { count: sessions.length })}</Text>")
fix(">t('agent.connected')</Tag>", ">{t('agent.connected')}</Tag>")
fix("</Text> t('agent.unitCommands')", "</Text> {t('agent.unitCommands')}")
fix("</Text> t('agent.unitSuccessRate')", "</Text> {t('agent.unitSuccessRate')}")
fix(">• t('agent.ctxPolicyKeep', { n: HISTORY_KEEP })</div>", ">• {t('agent.ctxPolicyKeep', { n: HISTORY_KEEP })}</div>")
fix(">• t('agent.ctxPolicySummary', { per: SUMMARY_PER_MSG_MAX, total: SUMMARY_TOTAL_MAX })</div>", ">• {t('agent.ctxPolicySummary', { per: SUMMARY_PER_MSG_MAX, total: SUMMARY_TOTAL_MAX })}</div>")
fix(">• t('agent.ctxPolicyCurrent', { kept: ctxState.keptFull, full: fmtTokens(ctxState.fullTokens), compressed: ctxState.compressedCount, summary: fmtTokens(ctxState.summaryTokens) })</div>", ">• {t('agent.ctxPolicyCurrent', { kept: ctxState.keptFull, full: fmtTokens(ctxState.fullTokens), compressed: ctxState.compressedCount, summary: fmtTokens(ctxState.summaryTokens) })}</div>")
fix(">t('agent.ctxPolicyTitle')</div>", ">{t('agent.ctxPolicyTitle')}</div>")
fix(">t('agent.ctxPolicyWindow', { window: fmtTokens(contextWindow) })</div>", ">{t('agent.ctxPolicyWindow', { window: fmtTokens(contextWindow) })}</div>")
fix("t('agent.context') <span", "{t('agent.context')} <span")
fix(">t('agent.emptyTitle')</Text>", ">{t('agent.emptyTitle')}</Text>")
fix(">t('agent.emptySubtitle')</Text>", ">{t('agent.emptySubtitle')}</Text>")
fix(">t('agent.quickCommands')</Text>", ">{t('agent.quickCommands')}</Text>")
fix(">t('agent.favoriteCommands')</Text>", ">{t('agent.favoriteCommands')}</Text>")
fix(">t('agent.servers')</Text>", ">{t('agent.servers')}</Text>")
fix(">t('agent.terminal')</Text>", ">{t('agent.terminal')}</Text>")
fix(">t('agent.noFavorites')</Text>", ">{t('agent.noFavorites')}</Text>")
fix(">t('agent.noServers')</Text>", ">{t('agent.noServers')}</Text>")
fix(">💭 t('agent.reasoning')</span>", ">💭 {t('agent.reasoning')}</span>")
fix(">t('agent.queueCount', { count: approvalQueue.length })</Tag>", ">{t('agent.queueCount', { count: approvalQueue.length })}</Tag>")
fix(">t('agent.execCommand')</Text>", ">{t('agent.execCommand')}</Text>")
fix(">t('agent.openContainerTerminal')</span>", ">{t('agent.openContainerTerminal')}</span>")
fix(">t('agent.diagReportTitle')</span>", ">{t('agent.diagReportTitle')}</span>")
fix(">t('agent.commandHistory')</span>", ">{t('agent.commandHistory')}</span>")
fix(">t('agent.safetyApproval')</span>", ">{t('agent.safetyApproval')}</span>")
fix(">t('agent.renameSessionTitle')</span>", ">{t('agent.renameSessionTitle')}</span>")
fix(">t('agent.aiDeepAnalysis')</Button>", ">{t('agent.aiDeepAnalysis')}</Button>")
fix("disabled={!selectedServer}>t('agent.refresh')</Button>", "disabled={!selectedServer}>{t('agent.refresh')}</Button>")
fix("t('agent.selectToOpen', { type: terminalMode === 'server' ? t('agent.server') : t('agent.container') })", "{t('agent.selectToOpen', { type: terminalMode === 'server' ? t('agent.server') : t('agent.container') })}")
fix(">i18n.t('agent.copy')</Button>", ">{i18n.t('agent.copy')}</Button>")
fix(">i18n.t('agent.execInTerminal')</Button>", ">{i18n.t('agent.execInTerminal')}</Button>")
fix("t('agent.sessionUsage', { input: sessionTotalUsage.input, output: sessionTotalUsage.output })", "{t('agent.sessionUsage', { input: sessionTotalUsage.input, output: sessionTotalUsage.output })}")
fix("/>t('agent.connectedTo', { name: servers.find(s => s.id === selectedServer)?.name })</Text>", "/>{t('agent.connectedTo', { name: servers.find(s => s.id === selectedServer)?.name })}</Text>")

fs.writeFileSync(srcPath, src, 'utf8')
console.log('Fixed:', applied)
if (missed.length > 0) {
  console.log('MISSED:')
  for (const m of missed) console.log('  -', JSON.stringify(m))
} else {
  console.log('No misses.')
}
