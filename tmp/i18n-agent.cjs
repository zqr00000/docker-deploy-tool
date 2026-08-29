// AgentTerminal i18n 全量迁移脚本
const fs = require('fs')
const path = require('path')

const root = path.resolve(__dirname, '..')
const srcPath = path.join(root, 'src', 'renderer', 'pages', 'agent', 'AgentTerminal.tsx')
const zhPath = path.join(root, 'src', 'renderer', 'locales', 'zh-CN.json')
const enPath = path.join(root, 'src', 'renderer', 'locales', 'en-US.json')

let src = fs.readFileSync(srcPath, 'utf8')

const T = (k, vars) => vars ? `t('agent.${k}', { ${vars} })` : `t('agent.${k}')`
const IT = (k, vars) => vars ? `i18n.t('agent.${k}', { ${vars} })` : `i18n.t('agent.${k}')`

// ==================== AI 提示词（模板字符串，先处理长串） ====================
const promptReplacements = [
  ['`请分析下面这段终端输出，说明它的含义、关键信息，以及是否需要处理：\\n```\\n${sel.slice(0, 3000)}\\n```' + '`',
   't(\'agent.analyzeSelectionPrompt\', { output: sel.slice(0, 3000) })'],
  ['`请针对当前服务器执行一次智能诊断分析并给出处理方案。\\n\\n检测结果如下：\\n${diagText}\\n\\n请使用工具进行深入检查（如查看容器状态、日志、资源占用等），定位问题根因并给出可执行的修复步骤。高风险操作需要经过我的确认。`',
   't(\'agent.smartDiagPrompt\', { diagText })']
]

// ==================== 替换表 ====================
const table = [
  // ---- 模块级组件/函数（i18n.t）----
  ['>复制</Button>', '>' + IT('copy') + '</Button>'],
  ['>在终端执行</Button>', '>' + IT('execInTerminal') + '</Button>'],
  ["const tagText = isRunning ? '执行中' : tc.status === 'success' ? '成功' : '失败'",
   "const tagText = isRunning ? " + IT('tagRunning') + " : tc.status === 'success' ? " + IT('tagSuccess') + " : " + IT('tagFail')],
  ["title={favorited ? '取消收藏' : '收藏此命令'}", "title={favorited ? " + IT('unfavorite') + " : " + IT('favoriteCmd') + "}"],
  ["name: cfg.provider === 'openai' ? '默认配置' : cfg.provider,", "name: cfg.provider === 'openai' ? " + IT('defaultProfile') + " : cfg.provider,"],
  ["result: '执行中...', status: 'running'", "result: " + T('toolRunning') + ", status: 'running'"],

  // ---- ROUTE_META ----
  ["  thinking: { label: '分析模型', color: 'purple', hint: '分析/诊断/排查' },",
   "  thinking: { labelKey: 'agent.route.thinking', label: 'thinking', color: 'purple', hintKey: 'agent.route.thinkingHint' },"],
  ["  critique: { label: '审查模型', color: 'geekblue', hint: '检查/复核/验证' },",
   "  critique: { labelKey: 'agent.route.critique', label: 'critique', color: 'geekblue', hintKey: 'agent.route.critiqueHint' },"],
  ["  vision: { label: '视觉模型', color: 'cyan', hint: '截图/图片' },",
   "  vision: { labelKey: 'agent.route.vision', label: 'vision', color: 'cyan', hintKey: 'agent.route.visionHint' },"],
  ["  execution: { label: '默认模型', color: 'default', hint: '日常命令' }",
   "  execution: { labelKey: 'agent.route.execution', label: 'execution', color: 'default', hintKey: 'agent.route.executionHint' }"],
  ["{ROUTE_META[msg.metadata.route]?.label || msg.metadata.route}",
   "{ROUTE_META[msg.metadata.route]?.labelKey ? i18n.t(ROUTE_META[msg.metadata.route].labelKey) : msg.metadata.route}"],

  // ---- 会话管理 ----
  ['name: `对话 ${new Date().toLocaleString()}`,', 'name: ' + T('defaultSessionName', 'time: new Date().toLocaleString()') + ','],
  ['name: sessions.find(s => s.id === activeSessionId)?.name || `对话 ${new Date().toLocaleString()}`,',
   'name: sessions.find(s => s.id === activeSessionId)?.name || ' + T('defaultSessionName', 'time: new Date().toLocaleString()') + ','],
  ['name: `${src.name} 副本`,', 'name: ' + T('sessionCopyName', 'name: src.name') + ','],
  ["message.success('会话已复制')", 'message.success(' + T('sessionCopied') + ')'],
  ["message.success('会话已重命名')", 'message.success(' + T('sessionRenamed') + ')'],
  ["message.success('对话已清空')", 'message.success(' + T('chatCleared') + ')'],

  // ---- 通用提示 ----
  ["message.warning('请先在「系统管理 → AI 模型配置」中配置模型')", 'message.warning(' + T('needModelConfig') + ')'],
  ["message.warning('请先选择服务器')", 'message.warning(' + T('selectServerFirst') + ')'],
  ["message.error('加载容器失败')", 'message.error(' + T('loadContainersFailed') + ')'],
  ['message.warning(`服务器连接失败: ${result.message}`)', 'message.warning(' + T('serverConnectFailed', 'msg: result.message') + ')'],
  ['message.warning(`服务器连接失败: ${(error as Error).message}`)', 'message.warning(' + T('serverConnectFailed', 'msg: (error as Error).message') + ')'],

  // ---- 流式/消息 ----
  ["result: '执行中...',", 'result: ' + T('toolRunning') + ','],
  ['\\n... (已截断 ${raw.length - 2000} 字符)', '\\n... ' + T('truncatedChars', 'count: raw.length - 2000')],
  ["'> ⏹ 已取消生成'", "'> ⏹ ' + " + T('genCancelled')],
  [": '已取消生成',", ': ' + T('genCancelled') + ','],
  ["content: m.content ? `${m.content}\\n\\n> ⏹ 已取消生成` : '已取消生成', segments: [...segments] }",
   "content: m.content ? `${m.content}\\n\\n> ⏹ ${" + T('genCancelled') + "}` : " + T('genCancelled') + ", segments: [...segments] }"],
  ["content: m.content ? `${m.content}\\n\\n> ⏹ 已取消生成` : '已取消生成' }",
   "content: m.content ? `${m.content}\\n\\n> ⏹ ${" + T('genCancelled') + "}` : " + T('genCancelled') + " }"],
  ['`错误: ${error}`', T('errorWithMsg', 'msg: error')],
  ['`错误: ${result.error}`', T('errorWithMsg', 'msg: result.error')],
  ['`错误: ${errMsg}`', T('errorWithMsg', 'msg: errMsg')],
  ['`错误: ${(error as Error).message}`', T('errorWithMsg', 'msg: (error as Error).message')],
  ["const role = m.role === 'user' ? '用户' : m.role === 'system' ? '系统' : '助手'",
   "const role = m.role === 'user' ? " + T('roleUser') + " : m.role === 'system' ? " + T('roleSystem') + " : " + T('roleAssistant')],
  ['\\n...（更早的对话内容已省略）', '\\n... ' + T('historyOmitted')],

  // ---- 命令执行 ----
  ["if (gate.blocked) message.error('命令命中黑名单，已拒绝执行')", 'if (gate.blocked) message.error(' + T('cmdBlocked') + ')'],
  ["else message.warning('命令未获批准，已取消执行')", 'else message.warning(' + T('cmdNotApproved') + ')'],
  ["message.info('请先在终端中选中文本')", 'message.info(' + T('selectTextFirst') + ')'],
  ["message.warning('请先打开终端')", 'message.warning(' + T('openTerminalFirst') + ')'],
  ["message.warning('终端尚未就绪，已取消发送。请确认终端已连接后重试')", 'message.warning(' + T('terminalNotReady') + ')'],
  ["message.success('命令已发送到终端')", 'message.success(' + T('cmdSent') + ')'],
  ['message.error(`发送失败: ${(error as Error).message}`)', 'message.error(' + T('sendFailed', 'msg: (error as Error).message') + ')'],
  ["message.success('已复制')", 'message.success(' + T('copied') + ')'],

  // ---- 诊断 ----
  ["{ status = 'critical'; diagMessage = 'CPU使用率过高'; suggestion = '建议检查高负载进程' }",
   "{ status = 'critical'; diagMessage = " + T('diag.cpuHigh') + "; suggestion = " + T('diag.cpuHighTip') + " }"],
  ["{ status = 'warning'; diagMessage = 'CPU使用率较高' }", "{ status = 'warning'; diagMessage = " + T('diag.cpuWarn') + " }"],
  ["else diagMessage = 'CPU使用率正常'", 'else diagMessage = ' + T('diag.cpuOk')],
  ["{ status = 'critical'; diagMessage = '内存使用率过高'; suggestion = '建议释放内存或增加内存' }",
   "{ status = 'critical'; diagMessage = " + T('diag.memHigh') + "; suggestion = " + T('diag.memHighTip') + " }"],
  ["{ status = 'warning'; diagMessage = '内存使用率较高' }", "{ status = 'warning'; diagMessage = " + T('diag.memWarn') + " }"],
  ["else diagMessage = '内存使用率正常'", 'else diagMessage = ' + T('diag.memOk')],
  ["{ status = 'critical'; diagMessage = '磁盘空间不足'; suggestion = '建议清理磁盘空间' }",
   "{ status = 'critical'; diagMessage = " + T('diag.diskHigh') + "; suggestion = " + T('diag.diskHighTip') + " }"],
  ["{ status = 'warning'; diagMessage = '磁盘空间较少' }", "{ status = 'warning'; diagMessage = " + T('diag.diskWarn') + " }"],
  ["else diagMessage = '磁盘空间充足'", 'else diagMessage = ' + T('diag.diskOk')],
  ['diagMessage = `运行 ${value} 个容器`', 'diagMessage = ' + T('diag.containers', 'value')],
  ["message: '诊断失败'", 'message: ' + T('diag.failed')],
  ["message.error('诊断失败')", 'message.error(' + T('diagFailed') + ')'],
  ["message.warning('未获取到诊断数据')", 'message.warning(' + T('noDiagData') + ')'],
  ['` (建议: ${d.suggestion})`', '` (' + "t('agent.suggestion')" + ': ${d.suggestion})`'],
  ["message.error('智能诊断失败')", 'message.error(' + T('smartDiagFailed') + ')'],

  // ---- 审批/终端 ----
  ["message.warning('审批超时，操作已自动拒绝')", 'message.warning(' + T('approvalTimeout') + ')'],
  ["message.success('终端已打开')", 'message.success(' + T('terminalOpened') + ')'],
  ["message.error(result.message || '打开终端失败')", 'message.error(result.message || ' + T('terminalOpenFailed') + ')'],

  // ---- 顶部状态栏 ----
  ['placeholder="选择服务器"', 'placeholder={' + T('selectServer') + '}'],
  ['>已连接</Tag>', '>' + T('connected') + '</Tag>'],
  ['</Text> 命令', '</Text> ' + T('unitCommands')],
  ['</Text> 成功', '</Text> ' + T('unitSuccessRate')],
  ["{modelConfig.model || '未配置'}", '{modelConfig.model || ' + T('notConfigured') + '}'],
  ['<Tooltip title="模型配置已移至 系统管理">', '<Tooltip title={' + T('modelConfigMoved') + '}>'],
  ["<Tooltip title={sidebarCollapsed ? '展开侧边栏' : '收起侧边栏'}>", "<Tooltip title={sidebarCollapsed ? " + T('expandSidebar') + " : " + T('collapseSidebar') + '}>'],

  // ---- 左侧边栏 ----
  ['>对话 ({sessions.length})</Text>', '>' + T('sessionsTitle', 'count: sessions.length') + '</Text>'],
  ['title="新建对话"', 'title={' + T('newSession') + '}'],
  ['placeholder="搜索会话…"', 'placeholder={' + T('searchSessions') + '}'],
  ['{s.messages.length} 条消息', '{s.messages.length} ' + T('unitMessages')],
  ['title="复制会话"', 'title={' + T('copySession') + '}'],
  ['title="重命名"', 'title={' + T('rename') + '}'],
  ['title="删除"', 'title={' + T('delete') + '}'],
  ["{sessionSearch ? '未找到匹配会话' : '暂无会话，点击 + 新建'}", "{sessionSearch ? " + T('noMatchedSession') + " : " + T('noSessions') + '}'],
  ['>收藏命令</Text>', '>' + T('favoriteCommands') + '</Text>'],
  ['title="取消收藏"', 'title={' + IT('unfavorite') + '}'],
  ['>暂无收藏，点击工具卡片星标添加</Text>', '>' + T('noFavorites') + '</Text>'],
  ['>服务器</Text>', '>' + T('servers') + '</Text>'],
  ['>暂无在线服务器</Text>', '>' + T('noServers') + '</Text>'],

  // ---- 终端面板 ----
  ['>终端</Text>', '>' + T('terminal') + '</Text>'],
  [", borderRadius: 4, fontSize: 11 } : { color: '#aeaeb2', fontSize: 11, borderRadius: 4 }}>服务器</Button>",
   ", borderRadius: 4, fontSize: 11 } : { color: '#aeaeb2', fontSize: 11, borderRadius: 4 }}>" + T('serverTab') + '</Button>'],
  [", borderRadius: 4, fontSize: 11 } : { color: '#aeaeb2', fontSize: 11, borderRadius: 4 }}>容器</Button>",
   ", borderRadius: 4, fontSize: 11 } : { color: '#aeaeb2', fontSize: 11, borderRadius: 4 }}>" + T('containerTab') + '</Button>'],
  ['<Tooltip title="AI 分析终端选中内容">', '<Tooltip title={' + T('aiAnalyzeSelection') + '}>'],
  ['disabled={!selectedServer}>刷新</Button>', 'disabled={!selectedServer}>' + T('refresh') + '</Button>'],
  ["message.warning('没有可用容器')", 'message.warning(' + T('noContainers') + ')'],
  ["'服务器终端', 'server'", T('serverTerminal') + ", 'server'"],
  ['>新建终端</Button>', '>' + T('newTerminal') + '</Button>'],
  ["选择 {terminalMode === 'server' ? '服务器' : '容器'} 打开终端",
   T('selectToOpen', "type: terminalMode === 'server' ? " + T('server') + " : " + T('container'))],

  // ---- 右侧对话面板 ----
  ["p.model || '未选模型'", 'p.model || ' + IT('noModelSelected')],
  ['<Tooltip title="系统诊断">', '<Tooltip title={' + T('sysDiagnosis') + '}>'],
  ['<Tooltip title="命令历史">', '<Tooltip title={' + T('commandHistory') + '}>'],
  ['<Tooltip title="清空对话">', '<Tooltip title={' + T('clearChat') + '}>'],
  ['<div style={{ fontWeight: 600, marginBottom: 4 }}>上下文压缩策略</div>', '<div style={{ fontWeight: 600, marginBottom: 4 }}>' + T('ctxPolicyTitle') + '</div>'],
  ['<div>• 保留最近 {HISTORY_KEEP} 条消息完整传递</div>', '<div>• ' + T('ctxPolicyKeep', 'n: HISTORY_KEEP') + '</div>'],
  ['<div>• 更早消息压缩为摘要：单条 ≤ {SUMMARY_PER_MSG_MAX} 字，摘要总长 ≤ {SUMMARY_TOTAL_MAX} 字</div>',
   '<div>• ' + T('ctxPolicySummary', 'per: SUMMARY_PER_MSG_MAX, total: SUMMARY_TOTAL_MAX') + '</div>'],
  ['<div>• 当前：完整 {ctxState.keptFull} 条（≈{fmtTokens(ctxState.fullTokens)}）+ 已压缩 {ctxState.compressedCount} 条（≈{fmtTokens(ctxState.summaryTokens)}）</div>',
   '<div>• ' + T('ctxPolicyCurrent', 'kept: ctxState.keptFull, full: fmtTokens(ctxState.fullTokens), compressed: ctxState.compressedCount, summary: fmtTokens(ctxState.summaryTokens)') + '</div>'],
  ['<div style={{ color: \'#8e8e93\', marginTop: 4 }}>窗口：{fmtTokens(contextWindow)}（可于「系统管理 → AI 模型配置 → 单模型」中调整），占比按估算。</div>',
   '<div style={{ color: \'#8e8e93\', marginTop: 4 }}>' + T('ctxPolicyWindow', 'window: fmtTokens(contextWindow)') + '</div>'],
  ['上下文 <span', T('context') + ' <span'],
  ['`已压缩 ${ctxState.compressedCount} 条` : `完整 ${ctxState.total} 条`',
   T('ctxCompressed', 'n: ctxState.compressedCount') + ' : ' + T('ctxFull', 'n: ctxState.total')],
  ['>开始与 AI 对话，管理你的服务器</Text>', '>' + T('emptyTitle') + '</Text>'],
  ['>支持工具调用 · 智能诊断 · 风险审批</Text>', '>' + T('emptySubtitle') + '</Text>'],
  ['>快捷命令</Text>', '>' + T('quickCommands') + '</Text>'],
  ["'请对当前服务器做一次综合健康检查',\n                        '列出当前服务器上运行的所有 Docker 容器',\n                        '查看服务器 CPU、内存、磁盘使用率'",
   T('quickTip1') + ',\n                        ' + T('quickTip2') + ',\n                        ' + T('quickTip3')],
  ['<span style={{ fontSize: 11, color: \'#8e8e93\' }}>💭 思考过程</span>', '<span style={{ fontSize: 11, color: \'#8e8e93\' }}>💭 ' + T('reasoning') + '</span>'],
  ["{msg.content || '思考中'}", '{msg.content || ' + T('thinking') + '}'],
  ['title="本次回复的模型 token 用量"', 'title={' + T('tokenUsageTip') + '}'],
  ['<Tooltip title="复制回复">', '<Tooltip title={' + T('copyReply') + '}>'],
  ['placeholder={modelConfig.apiKey && modelConfig.model ? "输入你的问题，例如：检查服务器状态" : "请先配置 AI 模型"}',
   'placeholder={modelConfig.apiKey && modelConfig.model ? ' + T('inputPlaceholder') + ' : ' + T('needConfigPlaceholder') + '}'],
  ['<Tooltip title="停止生成">', '<Tooltip title={' + T('stopGenerating') + '}>'],
  ['>Enter 发送 · Shift+Enter 换行</Text>', '>' + T('enterToSend') + '</Text>'],
  ["{ value: 'global', label: '温度：全局' },", "{ value: 'global', label: " + T('tempGlobal') + ' },'],
  ['...[0.1, 0.3, 0.5, 0.7, 1.0, 1.5].map(t => ({ value: String(t), label: `温度：${t.toFixed(1)}` }))',
   '...[0.1, 0.3, 0.5, 0.7, 1.0, 1.5].map(v => ({ value: String(v), label: ' + T('tempValue', 'v: v.toFixed(1)') + ' }))'],
  ['title="本会话累计 token 用量"', 'title={' + T('sessionUsageTip') + '}'],
  ['累计 ↑{sessionTotalUsage.input} · ↓{sessionTotalUsage.output}',
   T('sessionUsage', 'input: sessionTotalUsage.input, output: sessionTotalUsage.output')],
  ['/>已连接 {servers.find(s => s.id === selectedServer)?.name}</Text>',
   '/>' + T('connectedTo', 'name: servers.find(s => s.id === selectedServer)?.name') + '</Text>'],

  // ---- 模态框 ----
  ['>打开容器终端</span>', '>' + T('openContainerTerminal') + '</span>'],
  ['placeholder="请选择容器"', 'placeholder={' + T('selectContainer') + '}'],
  ['>系统诊断报告</span>', '>' + T('diagReportTitle') + '</span>'],
  ['>AI 深入分析并修复</Button>', '>' + T('aiDeepAnalysis') + '</Button>'],
  ['>命令历史</span>', '>' + T('commandHistory') + '</span>'],
  ['>安全审批</span>', '>' + T('safetyApproval') + '</span>'],
  ['>队列 {approvalQueue.length} 项</Tag>', '>' + T('queueCount', 'count: approvalQueue.length') + '</Tag>'],
  ['okText="确认执行" cancelText="取消"', 'okText={' + T('confirmExec') + '} cancelText={' + T('cancel') + '}'],
  ["message={`风险等级: ${currentApproval.riskLevel === 'high' ? '高风险' : '中风险'}`}",
   'message={' + T('riskLevel', "level: currentApproval.riskLevel === 'high' ? " + T('riskHigh') + ' : ' + T('riskMedium')) + '}'],
  ['>执行命令</Text>', '>' + T('execCommand') + '</Text>'],
  ['>重命名会话</span>', '>' + T('renameSessionTitle') + '</span>'],
  ['okText="保存" cancelText="取消"', 'okText={' + T('save') + '} cancelText={' + T('cancel') + '}'],
  ['placeholder="输入新的会话名称"', 'placeholder={' + T('newSessionNamePlaceholder') + '}']
]

// ==================== 结构性插入 ====================
const insertions = [
  ["import type { Server } from '../../types/server'",
   "import type { Server } from '../../types/server'\nimport { useTranslation } from 'react-i18next'\nimport i18n from '../../i18n'"],
  ['  // 会话重命名', '  const { t } = useTranslation()\n\n  // 会话重命名']
]

// ==================== 执行 ====================
let applied = 0
const missed = []

function applyAll(oldStr, newStr) {
  if (!src.includes(oldStr)) {
    missed.push(oldStr.slice(0, 100))
    return
  }
  applied += src.split(oldStr).length - 1
  src = src.split(oldStr).join(newStr)
}

for (const [o, n] of promptReplacements) applyAll(o, n)
for (const [o, n] of table) applyAll(o, n)
for (const [o, n] of insertions) applyAll(o, n)

fs.writeFileSync(srcPath, src, 'utf8')

// ==================== locale 键写入 ====================
const zh = {
  copy: '复制', execInTerminal: '在终端执行', tagRunning: '执行中', tagSuccess: '成功', tagFail: '失败',
  unfavorite: '取消收藏', favoriteCmd: '收藏此命令', defaultProfile: '默认配置', toolRunning: '执行中...',
  copied: '已复制', copyReply: '复制回复', refresh: '刷新', save: '保存', cancel: '取消', delete: '删除', rename: '重命名',
  connected: '已连接', selectServer: '选择服务器', notConfigured: '未配置', modelConfigMoved: '模型配置已移至 系统管理',
  expandSidebar: '展开侧边栏', collapseSidebar: '收起侧边栏', serverTab: '服务器', containerTab: '容器',
  sysDiagnosis: '系统诊断', commandHistory: '命令历史', newSession: '新建对话', clearChat: '清空对话',
  openTerminalFirst: '请先打开终端', terminalNotReady: '终端尚未就绪，已取消发送。请确认终端已连接后重试',
  cmdSent: '命令已发送到终端', selectTextFirst: '请先在终端中选中文本', selectServerFirst: '请先选择服务器',
  cmdBlocked: '命令命中黑名单，已拒绝执行', cmdNotApproved: '命令未获批准，已取消执行',
  needModelConfig: '请先在「系统管理 → AI 模型配置」中配置模型',
  loadContainersFailed: '加载容器失败', serverConnectFailed: '服务器连接失败: {{msg}}',
  defaultSessionName: '对话 {{time}}', sessionCopyName: '{{name}} 副本', sessionCopied: '会话已复制', sessionRenamed: '会话已重命名',
  chatCleared: '对话已清空', noModelSelected: '未选模型', noContainers: '没有可用容器', noServers: '暂无在线服务器',
  serverTerminal: '服务器终端', newTerminal: '新建终端', openContainerTerminal: '打开容器终端', selectContainer: '请选择容器',
  selectToOpen: '选择 {{type}} 打开终端', server: '服务器', container: '容器',
  genCancelled: '已取消生成', errorWithMsg: '错误: {{msg}}', thinking: '思考中', reasoning: '思考过程',
  roleUser: '用户', roleSystem: '系统', roleAssistant: '助手', historyOmitted: '（更早的对话内容已省略）',
  truncatedChars: '(已截断 {{count}} 字符)',
  diagFailed: '诊断失败', noDiagData: '未获取到诊断数据', smartDiagFailed: '智能诊断失败', suggestion: '建议',
  approvalTimeout: '审批超时，操作已自动拒绝', terminalOpened: '终端已打开', terminalOpenFailed: '打开终端失败',
  sendFailed: '发送失败: {{msg}}',
  sessionsTitle: '对话 ({{count}})', searchSessions: '搜索会话…', unitMessages: '条消息', copySession: '复制会话',
  noMatchedSession: '未找到匹配会话', noSessions: '暂无会话，点击 + 新建', favoriteCommands: '收藏命令',
  noFavorites: '暂无收藏，点击工具卡片星标添加', servers: '服务器', terminal: '终端',
  aiAnalyzeSelection: 'AI 分析终端选中内容', unitCommands: '命令', unitSuccessRate: '成功',
  ctxPolicyTitle: '上下文压缩策略',
  ctxPolicyKeep: '保留最近 {{n}} 条消息完整传递',
  ctxPolicySummary: '更早消息压缩为摘要：单条 ≤ {{per}} 字，摘要总长 ≤ {{total}} 字',
  ctxPolicyCurrent: '当前：完整 {{kept}} 条（≈{{full}}）+ 已压缩 {{compressed}} 条（≈{{summary}}）',
  ctxPolicyWindow: '窗口：{{window}}（可于「系统管理 → AI 模型配置 → 单模型」中调整），占比按估算。',
  context: '上下文', ctxCompressed: '已压缩 {{n}} 条', ctxFull: '完整 {{n}} 条',
  emptyTitle: '开始与 AI 对话，管理你的服务器', emptySubtitle: '支持工具调用 · 智能诊断 · 风险审批', quickCommands: '快捷命令',
  quickTip1: '请对当前服务器做一次综合健康检查',
  quickTip2: '列出当前服务器上运行的所有 Docker 容器',
  quickTip3: '查看服务器 CPU、内存、磁盘使用率',
  inputPlaceholder: '输入你的问题，例如：检查服务器状态', needConfigPlaceholder: '请先配置 AI 模型',
  stopGenerating: '停止生成', enterToSend: 'Enter 发送 · Shift+Enter 换行',
  tempGlobal: '温度：全局', tempValue: '温度：{{v}}',
  sessionUsageTip: '本会话累计 token 用量', sessionUsage: '累计 ↑{{input}} · ↓{{output}}',
  connectedTo: '已连接 {{name}}', tokenUsageTip: '本次回复的模型 token 用量',
  diagReportTitle: '系统诊断报告', aiDeepAnalysis: 'AI 深入分析并修复', safetyApproval: '安全审批',
  queueCount: '队列 {{count}} 项', confirmExec: '确认执行', riskLevel: '风险等级: {{level}}',
  riskHigh: '高风险', riskMedium: '中风险', execCommand: '执行命令',
  renameSessionTitle: '重命名会话', newSessionNamePlaceholder: '输入新的会话名称',
  analyzeSelectionPrompt: '请分析下面这段终端输出，说明它的含义、关键信息，以及是否需要处理：\n```\n{{output}}\n```',
  smartDiagPrompt: '请针对当前服务器执行一次智能诊断分析并给出处理方案。\n\n检测结果如下：\n{{diagText}}\n\n请使用工具进行深入检查（如查看容器状态、日志、资源占用等），定位问题根因并给出可执行的修复步骤。高风险操作需要经过我的确认。',
  diag: {
    cpuHigh: 'CPU使用率过高', cpuHighTip: '建议检查高负载进程', cpuWarn: 'CPU使用率较高', cpuOk: 'CPU使用率正常',
    memHigh: '内存使用率过高', memHighTip: '建议释放内存或增加内存', memWarn: '内存使用率较高', memOk: '内存使用率正常',
    diskHigh: '磁盘空间不足', diskHighTip: '建议清理磁盘空间', diskWarn: '磁盘空间较少', diskOk: '磁盘空间充足',
    containers: '运行 {{value}} 个容器', failed: '诊断失败'
  },
  route: {
    thinking: '分析模型', thinkingHint: '分析/诊断/排查',
    critique: '审查模型', critiqueHint: '检查/复核/验证',
    vision: '视觉模型', visionHint: '截图/图片',
    execution: '默认模型', executionHint: '日常命令'
  }
}

const en = {
  copy: 'Copy', execInTerminal: 'Run in Terminal', tagRunning: 'Running', tagSuccess: 'Success', tagFail: 'Failed',
  unfavorite: 'Unfavorite', favoriteCmd: 'Favorite this command', defaultProfile: 'Default', toolRunning: 'Running...',
  copied: 'Copied', copyReply: 'Copy reply', refresh: 'Refresh', save: 'Save', cancel: 'Cancel', delete: 'Delete', rename: 'Rename',
  connected: 'Connected', selectServer: 'Select server', notConfigured: 'Not configured', modelConfigMoved: 'Model config moved to System',
  expandSidebar: 'Expand sidebar', collapseSidebar: 'Collapse sidebar', serverTab: 'Server', containerTab: 'Container',
  sysDiagnosis: 'System diagnosis', commandHistory: 'Command history', newSession: 'New chat', clearChat: 'Clear chat',
  openTerminalFirst: 'Please open a terminal first', terminalNotReady: 'Terminal not ready. Send cancelled. Please confirm the terminal is connected and retry',
  cmdSent: 'Command sent to terminal', selectTextFirst: 'Please select some text in the terminal first', selectServerFirst: 'Please select a server first',
  cmdBlocked: 'Command blocked by blocklist', cmdNotApproved: 'Command not approved, cancelled',
  needModelConfig: 'Please configure the AI model in System → Model Config first',
  loadContainersFailed: 'Failed to load containers', serverConnectFailed: 'Server connection failed: {{msg}}',
  defaultSessionName: 'Chat {{time}}', sessionCopyName: '{{name}} copy', sessionCopied: 'Session duplicated', sessionRenamed: 'Session renamed',
  chatCleared: 'Chat cleared', noModelSelected: 'No model', noContainers: 'No containers available', noServers: 'No online servers',
  serverTerminal: 'Server terminal', newTerminal: 'New terminal', openContainerTerminal: 'Open container terminal', selectContainer: 'Select a container',
  selectToOpen: 'Select a {{type}} to open a terminal', server: 'Server', container: 'Container',
  genCancelled: 'Generation cancelled', errorWithMsg: 'Error: {{msg}}', thinking: 'Thinking', reasoning: 'Reasoning',
  roleUser: 'User', roleSystem: 'System', roleAssistant: 'Assistant', historyOmitted: '(earlier conversation omitted)',
  truncatedChars: '(truncated {{count}} chars)',
  diagFailed: 'Diagnosis failed', noDiagData: 'No diagnosis data', smartDiagFailed: 'Smart diagnosis failed', suggestion: 'Suggestion',
  approvalTimeout: 'Approval timed out, operation auto-rejected', terminalOpened: 'Terminal opened', terminalOpenFailed: 'Failed to open terminal',
  sendFailed: 'Send failed: {{msg}}',
  sessionsTitle: 'Chats ({{count}})', searchSessions: 'Search chats…', unitMessages: 'messages', copySession: 'Duplicate session',
  noMatchedSession: 'No matching chats', noSessions: 'No chats yet, click + to create', favoriteCommands: 'Favorites',
  noFavorites: 'No favorites yet, click the star on a tool card to add', servers: 'Servers', terminal: 'Terminal',
  aiAnalyzeSelection: 'AI analyze terminal selection', unitCommands: 'commands', unitSuccessRate: 'success',
  ctxPolicyTitle: 'Context compression policy',
  ctxPolicyKeep: 'Keep the latest {{n}} messages in full',
  ctxPolicySummary: 'Older messages compressed to summaries: ≤ {{per}} chars each, ≤ {{total}} chars total',
  ctxPolicyCurrent: 'Current: {{kept}} full (≈{{full}}) + {{compressed}} compressed (≈{{summary}})',
  ctxPolicyWindow: 'Window: {{window}} (adjustable in System → Model Config → Per-model). Ratios are estimates.',
  context: 'Context', ctxCompressed: '{{n}} compressed', ctxFull: '{{n}} full',
  emptyTitle: 'Start chatting with AI to manage your servers', emptySubtitle: 'Tool calls · Smart diagnosis · Risk approval', quickCommands: 'Quick commands',
  quickTip1: 'Run a comprehensive health check on the current server',
  quickTip2: 'List all running Docker containers on the server',
  quickTip3: 'Show server CPU, memory and disk usage',
  inputPlaceholder: 'Ask a question, e.g. check server status', needConfigPlaceholder: 'Configure the AI model first',
  stopGenerating: 'Stop generating', enterToSend: 'Enter to send · Shift+Enter for newline',
  tempGlobal: 'Temp: global', tempValue: 'Temp: {{v}}',
  sessionUsageTip: 'Total tokens used in this session', sessionUsage: 'Total ↑{{input}} · ↓{{output}}',
  connectedTo: 'Connected to {{name}}', tokenUsageTip: 'Model token usage of this reply',
  diagReportTitle: 'System Diagnosis Report', aiDeepAnalysis: 'AI deep analysis & fix', safetyApproval: 'Safety approval',
  queueCount: 'Queue: {{count}}', confirmExec: 'Confirm', riskLevel: 'Risk level: {{level}}',
  riskHigh: 'High risk', riskMedium: 'Medium risk', execCommand: 'Command',
  renameSessionTitle: 'Rename session', newSessionNamePlaceholder: 'Enter a new session name',
  analyzeSelectionPrompt: 'Please analyze the following terminal output, explain its meaning and key information, and whether action is needed:\n```\n{{output}}\n```',
  smartDiagPrompt: 'Please run a smart diagnosis on the current server and propose a remediation plan.\n\nDiagnosis results:\n{{diagText}}\n\nUse tools to investigate further (container status, logs, resource usage, etc.), locate the root cause and give actionable fix steps. High-risk operations require my confirmation.',
  diag: {
    cpuHigh: 'CPU usage too high', cpuHighTip: 'Check high-load processes', cpuWarn: 'CPU usage high', cpuOk: 'CPU usage normal',
    memHigh: 'Memory usage too high', memHighTip: 'Free memory or add more memory', memWarn: 'Memory usage high', memOk: 'Memory usage normal',
    diskHigh: 'Disk space insufficient', diskHighTip: 'Clean up disk space', diskWarn: 'Disk space low', diskOk: 'Disk space sufficient',
    containers: '{{value}} containers running', failed: 'Diagnosis failed'
  },
  route: {
    thinking: 'Analysis model', thinkingHint: 'Analyze/Diagnose/Troubleshoot',
    critique: 'Review model', critiqueHint: 'Check/Review/Verify',
    vision: 'Vision model', visionHint: 'Screenshot/Image',
    execution: 'Default model', executionHint: 'Daily commands'
  }
}

const zhData = JSON.parse(fs.readFileSync(zhPath, 'utf8'))
zhData.agent = zh
fs.writeFileSync(zhPath, JSON.stringify(zhData, null, 2) + '\n', 'utf8')

const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'))
enData.agent = en
fs.writeFileSync(enPath, JSON.stringify(enData, null, 2) + '\n', 'utf8')

console.log('Applied replacements:', applied)
if (missed.length > 0) {
  console.log('MISSED entries:')
  for (const m of missed) console.log('  -', JSON.stringify(m))
} else {
  console.log('No misses.')
}
