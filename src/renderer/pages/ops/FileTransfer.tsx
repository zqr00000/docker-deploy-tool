import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Card,
  Select,
  Button,
  Space,
  Typography,
  message,
  Input,
  Table,
  Tag,
  Tooltip,
  Progress,
  List,
  Empty,
  Spin,
  Modal,
  Popconfirm
} from 'antd'
import type { ColumnsType } from 'antd/es/table'
import {
  SwapOutlined,
  FolderOutlined,
  FileOutlined,
  ArrowUpOutlined,
  ArrowLeftOutlined,
  ArrowRightOutlined,
  ReloadOutlined,
  HomeOutlined,
  LinkOutlined,
  LoadingOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  ClearOutlined,
  CloudUploadOutlined,
  CloudDownloadOutlined,
  FolderAddOutlined,
  EditOutlined,
  DeleteOutlined,
  FileTextOutlined
} from '@ant-design/icons'
import type { Server } from '../../types/server'
import Editor from '@monaco-editor/react'
import * as monaco from 'monaco-editor'
import * as yaml from 'js-yaml'

const { Text, Title } = Typography

// YAML 实时语法检查：通过 Monaco marker（红色波浪线）在编辑器中即时标出错误
const YAML_CHECK_OWNER = 'yaml-live-check'
const validateYamlModel = (editor: monaco.editor.IStandaloneCodeEditor) => {
  const model = editor.getModel()
  if (!model || model.getLanguageId() !== 'yaml') return
  try {
    yaml.load(model.getValue())
    monaco.editor.setModelMarkers(model, YAML_CHECK_OWNER, [])
  } catch (e) {
    const err = e as { mark?: { line: number; column: number }; reason?: string; message?: string }
    const line = err?.mark?.line ?? 1
    const col = err?.mark?.column ?? 1
    monaco.editor.setModelMarkers(model, YAML_CHECK_OWNER, [{
      severity: monaco.MarkerSeverity.Error,
      message: (err?.reason || err?.message || 'YAML 语法错误') + (err?.mark ? ` (第 ${line} 行 第 ${col} 列)` : ''),
      startLineNumber: line,
      startColumn: col,
      endLineNumber: line,
      endColumn: col + 1
    }])
  }
}

// 根据文件名/扩展名识别 Monaco 语言（用于高亮与语法检查）
const langForFile = (name: string): string => {
  const lower = (name || '').toLowerCase()
  const ext = lower.split('.').pop() || ''
  if (ext === 'conf' && (lower.includes('nginx') || lower.includes('apache') || lower.includes('httpd'))) return 'ini'
  const byExt: Record<string, string> = {
    json: 'json', jsonc: 'json', yaml: 'yaml', yml: 'yaml',
    ini: 'ini', cfg: 'ini', conf: 'ini', properties: 'properties', env: 'ini',
    sh: 'shell', bash: 'shell', zsh: 'shell', py: 'python',
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
    ts: 'typescript', tsx: 'typescript', css: 'css', less: 'less', scss: 'scss',
    html: 'html', htm: 'html', xml: 'xml', xhtml: 'xml', plist: 'xml',
    md: 'markdown', markdown: 'markdown', sql: 'sql', toml: 'toml',
    log: 'log', out: 'log', err: 'log', 'error': 'log', debug: 'log',
    java: 'java', go: 'go', rs: 'rust', c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', hpp: 'cpp',
    php: 'php', rb: 'ruby', swift: 'swift', kt: 'kotlin', lua: 'lua'
  }
  if (byExt[ext]) return byExt[ext]
  if (lower.startsWith('dockerfile')) return 'dockerfile'
  if (lower === 'makefile' || ext === 'mk') return 'makefile'
  // 无扩展名的常见日志文件：messages / syslog / dpkg.log / nginx.access.log 等
  if (/\/(?:messages|syslog|kern\.log|boot\.log|auth\.log|daemon\.log|access\.log|error\.log)\b/i.test(lower)) return 'log'
  if (lower.endsWith('.log')) return 'log'
  return 'plaintext'
}

// 并发数存储 key（本地持久化）
const CONCURRENCY_KEY = 'fileTransferConcurrency'

type DirEntryType = 'dir' | 'link' | 'file'
interface DirEntry {
  name: string
  type: DirEntryType
  size: number
  mtime: number
  mode?: number
}

type TaskStatus = 'queued' | 'transferring' | 'success' | 'error'
interface TransferTask {
  id: string
  type: 'upload' | 'download'
  name: string
  local: string
  remote: string
  status: TaskStatus
  progress: number
  message?: string
}

const genId = () => `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

const statusMeta: Record<TaskStatus, { color: string; label: string }> = {
  queued: { color: '#8e8e93', label: '排队中' },
  transferring: { color: '#0A84FF', label: '传输中' },
  success: { color: '#30D158', label: '已完成' },
  error: { color: '#FF453A', label: '失败' }
}

const fmtSize = (n: number): string => {
  if (!n) return n === 0 ? '0 B' : '-'
  if (n < 1024) return `${n} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let v = n
  let i = -1
  do { v /= 1024; i++ } while (v >= 1024 && i < units.length - 1)
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`
}

const fmtTime = (ms: number): string => {
  if (!ms) return '-'
  const d = new Date(ms)
  const pad = (x: number) => String(x).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// 拼接路径（统一用 / ，Windows 下 node fs 也兼容）
const joinPath = (base: string, name: string) => (base.endsWith('/') ? base + name : `${base}/${name}`)
const parentPath = (p: string) => {
  const t = p.replace(/\/+$/, '')
  const idx = t.lastIndexOf('/')
  if (idx <= 0) return t || '/'
  return t.slice(0, idx) || '/'
}

const dirName = (p: string) => {
  const t = p.replace(/\/+$/, '')
  const idx = t.lastIndexOf('/')
  return t.slice(idx + 1) || t
}

// 双窗格表格（memo 隔离：右键菜单/其他 setState 不触发大表格重建）
interface PaneTableProps {
  entries: DirEntry[]
  loading: boolean
  columns: ColumnsType<DirEntry>
  selectedKeys: string[]
  onSelect: (keys: string[]) => void
  onDouble: (e: DirEntry) => void
  onCtx: (e: React.MouseEvent, entry: DirEntry) => void
  empty?: React.ReactNode
}
const PaneTable = React.memo(function PaneTable({ entries, loading, columns, selectedKeys, onSelect, onDouble, onCtx, empty }: PaneTableProps) {
  const body = (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      {loading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div> : (
        <Table<DirEntry>
          rowKey="name" size="small" columns={columns} dataSource={entries}
          pagination={false}
          rowSelection={{ selectedRowKeys: selectedKeys, onChange: (k) => onSelect(k as string[]) }}
          onRow={(row) => ({
            onDoubleClick: () => onDouble(row),
            onContextMenu: (e) => onCtx(e, row)
          })}
        />
      )}
    </div>
  )
  return empty && !loading ? <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>{empty}</div> : body
})

/**
 * 文件传输（XFTP 式双窗格）
 * 左侧本地、右侧远程；双击/中间箭头传输；底部多任务队列（可配置并发、进度、失败重试）
 */
const FileTransfer: React.FC = () => {
  const [servers, setServers] = useState<Server[]>([])
  const [selectedServer, setSelectedServer] = useState<string | undefined>(undefined)

  // 页面固定高度：测量父容器（.app-content）实际高度，保证双窗格内部滚动链确定
  const rootRef = useRef<HTMLDivElement>(null)
  const [viewH, setViewH] = useState(0)
  useEffect(() => {
    const el = rootRef.current?.parentElement
    if (!el) return
    const measure = () => {
      if (el.clientHeight > 0) setViewH(el.clientHeight)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 本地窗格
  const [localPath, setLocalPath] = useState('')
  const [localEntries, setLocalEntries] = useState<DirEntry[]>([])
  const [localSel, setLocalSel] = useState<string[]>([])
  const [localLoading, setLocalLoading] = useState(false)
  // 本地可用盘符（Windows 多盘切换；非 Windows 为空数组不显示选择器）
  const [drives, setDrives] = useState<string[]>([])

  // 远程窗格
  const [remotePath, setRemotePath] = useState('/')
  const [remoteEntries, setRemoteEntries] = useState<DirEntry[]>([])
  const [remoteSel, setRemoteSel] = useState<string[]>([])
  const [remoteLoading, setRemoteLoading] = useState(false)

  // 任务队列
  const [tasks, setTasks] = useState<TransferTask[]>([])
  const tasksRef = useRef<TransferTask[]>([])
  tasksRef.current = tasks
  const activeCountRef = useRef(0)

  // 并发上限（可配置）
  const [maxConcurrent, setMaxConcurrent] = useState(() => {
    const saved = Number(localStorage.getItem(CONCURRENCY_KEY))
    return saved >= 1 && saved <= 10 ? saved : 5
  })
  const maxConcurrentRef = useRef(maxConcurrent)
  maxConcurrentRef.current = maxConcurrent

  // 加载服务器列表
  useEffect(() => {
    const load = async () => {
      try {
        const data = await window.electronAPI.server.getAll()
        setServers(Array.isArray(data) ? data : [])
      } catch (error) {
        message.error(`加载服务器失败: ${(error as Error).message}`)
      }
    }
    load()
  }, [])

  // 本地窗格：初始主目录 + 盘符列表
  useEffect(() => {
    const init = async () => {
      const [homeR, driveR] = await Promise.all([
        window.electronAPI.fileTransfer.homeLocal(),
        window.electronAPI.fileTransfer.listDrives()
      ])
      if (driveR.success && driveR.drives && driveR.drives.length > 0) setDrives(driveR.drives)
      if (homeR.success && homeR.path) {
        setLocalPath(homeR.path)
        loadLocal(homeR.path)
      }
    }
    init()
  }, [])

  const loadLocal = async (dir: string) => {
    const target = (dir || '').trim()
    if (!target) return // 空路径防御：避免向主进程发 scandir('')
    setLocalLoading(true)
    try {
      const r = await window.electronAPI.fileTransfer.listLocal(target)
      if (r.success && r.entries) {
        setLocalEntries(r.entries)
        setLocalSel([])
      } else {
        message.error(r.message || '读取目录失败')
      }
    } catch (error) {
      message.error(`读取目录失败: ${(error as Error).message}`)
    } finally {
      setLocalLoading(false)
    }
  }

  // 远程窗格：切换服务器后默认根目录
  const loadRemote = useCallback(async (serverId: string, dir: string) => {
    setRemoteLoading(true)
    try {
      const r = await window.electronAPI.fileTransfer.listRemote(serverId, dir)
      if (r.success && r.entries) {
        const sorted = [...r.entries].sort((a, b) =>
          (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1))
        setRemoteEntries(sorted)
        setRemoteSel([])
      } else {
        message.error(r.message || '读取远端目录失败')
      }
    } catch (error) {
      message.error(`读取远端目录失败: ${(error as Error).message}`)
    } finally {
      setRemoteLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedServer) {
      setRemotePath('/')
      loadRemote(selectedServer, '/')
    } else {
      setRemoteEntries([])
      setRemoteSel([])
    }
  }, [selectedServer, loadRemote])

  // 任务进度
  useEffect(() => {
    const remove = window.electronAPI.fileTransfer.onProgress(({ taskId, transferred, total }) => {
      setTasks(prev => prev.map(x =>
        x.id === taskId ? { ...x, progress: total > 0 ? Math.min(100, Math.round((transferred / total) * 100)) : x.progress } : x
      ))
    })
    return remove
  }, [])

  const runTask = useCallback(async (taskId: string) => {
    const task = tasksRef.current.find(x => x.id === taskId)
    if (!task) return
    setTasks(prev => prev.map(x => x.id === taskId ? { ...x, status: 'transferring' as TaskStatus, progress: 0, message: undefined } : x))
    try {
      const r = task.type === 'upload'
        ? await window.electronAPI.fileTransfer.upload(selectedServer!, task.local, task.remote, taskId)
        : await window.electronAPI.fileTransfer.download(selectedServer!, task.remote, task.local, taskId)
      setTasks(prev => prev.map(x =>
        x.id === taskId
          ? { ...x, status: r.success ? 'success' as TaskStatus : 'error' as TaskStatus, progress: r.success ? 100 : x.progress, message: r.success ? undefined : (r.message || '未知错误') }
          : x
      ))
    } catch (error) {
      setTasks(prev => prev.map(x => x.id === taskId ? { ...x, status: 'error' as TaskStatus, message: (error as Error).message } : x))
    }
  }, [selectedServer])

  const pump = useCallback(() => {
    const limit = maxConcurrentRef.current
    const queued = tasksRef.current.filter(x => x.status === 'queued')
    while (activeCountRef.current < limit && queued.length > 0) {
      const task = queued.shift()!
      activeCountRef.current += 1
      runTask(task.id).finally(() => {
        activeCountRef.current -= 1
        pump()
      })
    }
  }, [runTask])

  const enqueue = (newTasks: TransferTask[]) => {
    if (!newTasks.length) return
    setTasks(prev => [...prev, ...newTasks])
    setTimeout(pump, 0)
  }

  // 传输：本地选中 → 上传到远程当前目录
  const uploadSelected = () => {
    if (!selectedServer) { message.warning('请先选择服务器'); return }
    if (localSel.length === 0) { message.warning('请先在左侧选中要上传的文件'); return }
    const base = remotePath.endsWith('/') ? remotePath : remotePath + '/'
    const newTasks: TransferTask[] = localSel.map(name => ({
      id: genId(), type: 'upload', name,
      local: joinPath(localPath, name),
      remote: base + name,
      status: 'queued', progress: 0
    }))
    enqueue(newTasks)
    setLocalSel([])
  }

  // 传输：远程选中 → 下载到本地当前目录
  const downloadSelected = () => {
    if (!selectedServer) { message.warning('请先选择服务器'); return }
    if (remoteSel.length === 0) { message.warning('请先在右侧选中要下载的文件'); return }
    const base = localPath.endsWith('/') ? localPath : localPath + '/'
    const newTasks: TransferTask[] = remoteSel.map(name => ({
      id: genId(), type: 'download', name,
      local: base + name,
      remote: joinPath(remotePath, name),
      status: 'queued', progress: 0
    }))
    enqueue(newTasks)
    setRemoteSel([])
  }

  // 双击本地行：目录→进入；文件→上传
  const onLocalDouble = (entry: DirEntry) => {
    if (entry.type === 'dir') {
      const next = joinPath(localPath, entry.name)
      setLocalPath(next)
      loadLocal(next)
    } else {
      enqueue([{
        id: genId(), type: 'upload', name: entry.name,
        local: joinPath(localPath, entry.name),
        remote: joinPath(remotePath, entry.name),
        status: 'queued', progress: 0
      }])
    }
  }

  // 双击远程行：目录→进入；文件→下载
  const onRemoteDouble = (entry: DirEntry) => {
    if (entry.type === 'dir') {
      const next = joinPath(remotePath, entry.name)
      setRemotePath(next)
      if (selectedServer) loadRemote(selectedServer, next)
    } else {
      enqueue([{
        id: genId(), type: 'download', name: entry.name,
        local: joinPath(localPath, entry.name),
        remote: joinPath(remotePath, entry.name),
        status: 'queued', progress: 0
      }])
    }
  }

  const goLocalUp = () => {
    const next = parentPath(localPath)
    setLocalPath(next)
    loadLocal(next)
  }

  const goRemoteUp = () => {
    const next = parentPath(remotePath)
    setRemotePath(next)
    if (selectedServer) loadRemote(selectedServer, next)
  }

  const retryTask = (taskId: string) => {
    setTasks(prev => prev.map(x => x.id === taskId ? { ...x, status: 'queued' as TaskStatus, progress: 0, message: undefined } : x))
    setTimeout(pump, 0)
  }
  const removeTask = (taskId: string) => setTasks(prev => prev.filter(x => x.id !== taskId))
  const clearFinished = () => setTasks(prev => prev.filter(x => x.status === 'queued' || x.status === 'transferring'))
  const runningCount = tasks.filter(x => x.status === 'queued' || x.status === 'transferring').length

  // 当前本地盘符（如 'C:' 或 '/'）；切换盘符时跳到该盘根目录
  const currentDrive = (() => {
    const m = localPath.match(/^[A-Za-z]:/)
    return m ? m[0] : (drives.length === 1 && drives[0] === '/') ? '/' : ''
  })()
  const switchDrive = (drive: string) => {
    const root = drive === '/' ? '/' : `${drive}/`
    setLocalPath(root)
    loadLocal(root)
  }

  // 远端文件操作：新建目录 / 重命名 / 删除（文件或空目录）
  const [opModal, setOpModal] = useState<{ side: 'local' | 'remote'; kind: 'mkdir' | 'rename'; target?: string } | null>(null)
  const [opName, setOpName] = useState('')

  // 执行本地/远端文件操作并刷新对应窗格
  const runOp = async (op: 'mkdir' | 'rename' | 'delete', target: string, to?: string, side: 'local' | 'remote' = 'local') => {
    const r = side === 'local'
      ? await window.electronAPI.fileTransfer.localOp(op, target, to)
      : await window.electronAPI.fileTransfer.remoteOp(selectedServer!, op, target, to)
    if (r.success) {
      message.success(r.message || '操作成功')
      if (side === 'local') loadLocal(localPath)
      else if (selectedServer) loadRemote(selectedServer, remotePath)
    } else {
      message.error(r.message || '操作失败')
    }
  }

  const openMkdir = (side: 'local' | 'remote') => { setOpName('新建文件夹'); setOpModal({ side, kind: 'mkdir' }) }
  const openRename = (side: 'local' | 'remote', name: string, target: string) => { setOpName(name); setOpModal({ side, kind: 'rename', target }) }
  const submitOp = async () => {
    if (!opModal) return
    const name = opName.trim()
    if (!name) { message.warning('名称不能为空'); return }
    const base = opModal.side === 'local' ? localPath : remotePath
    const target = opModal.kind === 'rename' && opModal.target ? opModal.target : joinPath(base, name)
    const to = opModal.kind === 'rename' ? joinPath(base, name) : undefined
    try {
      await runOp(opModal.kind, target, to, opModal.side)
      setOpModal(null)
    } catch (error) {
      message.error(`操作失败: ${(error as Error).message}`)
    }
  }
  const confirmDelete = async (side: 'local' | 'remote', entry: DirEntry) => {
    const target = side === 'local' ? joinPath(localPath, entry.name) : joinPath(remotePath, entry.name)
    try {
      await runOp('delete', target, undefined, side)
    } catch (error) {
      message.error(`删除失败: ${(error as Error).message}`)
    }
  }

  // 右键菜单状态（行 onContextMenu 打开）
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; side: 'local' | 'remote'; entry: DirEntry } | null>(null)
  // 文本编辑器（打开文件 → 编辑 → 保存）
  const [editor, setEditor] = useState<{ side: 'local' | 'remote'; path: string; name: string } | null>(null)
  const [editorContent, setEditorContent] = useState('')
  const [editorLoading, setEditorLoading] = useState(false)
  const [editorSaving, setEditorSaving] = useState(false)

  // 点击空白处关闭右键菜单
  useEffect(() => {
    const close = () => setCtxMenu(null)
    window.addEventListener('click', close)
    return () => window.removeEventListener('click', close)
  }, [])

  // 打开文件到编辑器
  const openEditor = async (side: 'local' | 'remote', path: string, name: string) => {
    setEditor({ side, path, name })
    setEditorContent('')
    setEditorLoading(true)
    try {
      const r = side === 'local'
        ? await window.electronAPI.fileTransfer.readLocal(path)
        : await window.electronAPI.fileTransfer.readRemote(selectedServer!, path)
      if (r.success) setEditorContent(r.content || '')
      else message.error(r.message || '读取失败')
    } catch (error) {
      message.error(`读取失败: ${(error as Error).message}`)
    } finally {
      setEditorLoading(false)
    }
  }

  // 保存编辑器内容
  const saveEditor = async () => {
    if (!editor) return
    // JSON / YAML 文件保存前本地语法检查（Monaco 标记 + parse 兜底）
    const lang = langForFile(editor.name)
    if (lang === 'json') {
      try {
        JSON.parse(editorContent)
      } catch (e) {
        message.error(`JSON 语法错误：${(e as Error).message}`)
        return
      }
    }
    if (lang === 'yaml') {
      try {
        yaml.load(editorContent)
      } catch (e) {
        const err = e as { mark?: { line: number; column: number }; reason?: string; message?: string }
        message.error(`YAML 语法错误：${err?.reason || err?.message || '未知错误'}${err?.mark ? `（第 ${err.mark.line} 行 第 ${err.mark.column} 列）` : ''}`)
        return
      }
    }
    setEditorSaving(true)
    try {
      const r = editor.side === 'local'
        ? await window.electronAPI.fileTransfer.writeLocal(editor.path, editorContent)
        : await window.electronAPI.fileTransfer.writeRemote(selectedServer!, editor.path, editorContent)
      if (r.success) {
        message.success(r.message || '已保存')
        setEditor(null)
        if (editor.side === 'local') loadLocal(localPath)
        else if (selectedServer) loadRemote(selectedServer, remotePath)
      } else {
        message.error(r.message || '保存失败')
      }
    } catch (error) {
      message.error(`保存失败: ${(error as Error).message}`)
    } finally {
      setEditorSaving(false)
    }
  }

  // 右键菜单动作
  const onCtxAction = ({ key }: { key: string }) => {
    if (!ctxMenu) return
    const { side, entry } = ctxMenu
    const basePath = side === 'local' ? localPath : remotePath
    const full = joinPath(basePath, entry.name)
    const close = () => setCtxMenu(null)
    switch (key) {
      case 'open':
        setCtxMenu(null)
        openEditor(side, full, entry.name)
        break
      case 'enter':
        if (side === 'local') { setLocalPath(full); loadLocal(full) } else { setRemotePath(full); if (selectedServer) loadRemote(selectedServer, full) }
        close()
        break
      case 'upload':
        if (side === 'local') enqueue([{ id: genId(), type: 'upload', name: entry.name, local: full, remote: joinPath(remotePath, entry.name), status: 'queued', progress: 0 }])
        close()
        break
      case 'download':
        if (side === 'remote') enqueue([{ id: genId(), type: 'download', name: entry.name, local: joinPath(localPath, entry.name), remote: full, status: 'queued', progress: 0 }])
        close()
        break
      case 'rename':
        close()
        openRename(side, entry.name, full)
        break
      case 'delete':
        close()
        confirmDelete(side, entry)
        break
      default:
        close()
    }
  }

  const ctxItems = ctxMenu ? (() => {
    const { side, entry } = ctxMenu
    const isDir = entry.type === 'dir'
    const items: any[] = []
    if (!isDir) {
      items.push({ key: 'open', label: side === 'local' ? '编辑打开' : '编辑打开（远程）' })
      items.push({ key: side === 'local' ? 'upload' : 'download', label: side === 'local' ? '上传到远程当前目录' : '下载到本地当前目录' })
    } else {
      items.push({ key: 'enter', label: '进入文件夹' })
    }
    items.push({ key: 'rename', label: '重命名' })
    items.push({ key: 'delete', label: '删除', danger: true })
    return items
  })() : []

  const makeColumns = (side: 'local' | 'remote'): ColumnsType<DirEntry> => [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      ellipsis: true,
      render: (name: string, row) => (
        <Space size={6}>
          {row.type === 'dir'
            ? <FolderOutlined style={{ color: '#FFB340' }} />
            : <FileOutlined style={{ color: '#aeaeb2' }} />}
          <span>{name}</span>
        </Space>
      )
    },
    {
      title: '大小',
      dataIndex: 'size',
      key: 'size',
      width: 90,
      align: 'right',
      render: (size: number, row) => row.type === 'dir' ? '-' : fmtSize(size)
    },
    {
      title: '修改时间',
      dataIndex: 'mtime',
      key: 'mtime',
      width: 130,
      render: (mtime: number) => fmtTime(mtime)
    },
    {
      title: '',
      key: 'ops',
      width: 64,
      align: 'center',
      render: (_: unknown, row, _idx) => (
          <Space size={0} onClick={e => e.stopPropagation()}>
            <Tooltip title="重命名">
              <Button size="small" type="text" icon={<EditOutlined style={{ fontSize: 12 }} />}
                onClick={() => openRename(side, row.name, joinPath(side === 'local' ? localPath : remotePath, row.name))} />
            </Tooltip>
            <Popconfirm
              title="确认删除？"
              description={row.type === 'dir' ? '仅可删除空目录' : `删除文件 ${row.name}`}
              okText="删除" cancelText="取消" okButtonProps={{ danger: true }}
              onConfirm={() => confirmDelete(side, row)}
            >
              <Button size="small" type="text" icon={<DeleteOutlined style={{ fontSize: 12, color: '#FF453A' }} />} />
            </Popconfirm>
          </Space>
        )
    }
  ]

  // 稳定回调 + 列定义，配合 memo 化 PaneTable 隔离重渲染，保证右键/选择等交互流畅
  const handleLocalDouble = useCallback(onLocalDouble, [localPath, remotePath, selectedServer])
  const handleRemoteDouble = useCallback(onRemoteDouble, [localPath, remotePath, selectedServer])
  const handleLocalCtx = useCallback((e: React.MouseEvent, entry: DirEntry) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, side: 'local', entry })
  }, [])
  const handleRemoteCtx = useCallback((e: React.MouseEvent, entry: DirEntry) => {
    e.preventDefault()
    setCtxMenu({ x: e.clientX, y: e.clientY, side: 'remote', entry })
  }, [])
  const columnsLocal = useMemo(() => makeColumns('local'), [localPath, remotePath, selectedServer])
  const columnsRemote = useMemo(() => makeColumns('remote'), [localPath, remotePath, selectedServer])

  return (
    <div ref={rootRef} style={{ padding: 24, height: viewH > 0 ? viewH : '100%', display: 'flex', flexDirection: 'column', boxSizing: 'border-box', maxWidth: 1400, margin: '0 auto', width: '100%', minHeight: 0 }}>
      <Title level={4} style={{ margin: '0 0 4px', flexShrink: 0 }}><SwapOutlined style={{ color: '#0A84FF', marginRight: 8 }} />文件传输</Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 12, flexShrink: 0 }}>
        双击文件或选中后点击箭头传输 · 双击文件夹进入 · 支持多选
      </Text>

      {/* 工具栏 */}
      <Card size="small" style={{ marginBottom: 12, borderRadius: 12, flexShrink: 0 }}>
        <Space wrap>
          <Text style={{ fontSize: 13 }}>目标服务器</Text>
          <Select
            style={{ width: 300 }}
            placeholder="请选择服务器"
            value={selectedServer}
            onChange={setSelectedServer}
            options={servers.map(s => ({ value: s.id, label: `${s.name} (${s.host})` }))}
          />
          {selectedServer && (
            <Text style={{ fontSize: 12, color: '#30D158' }}>
              <LinkOutlined style={{ marginRight: 4 }} />
              {servers.find(s => s.id === selectedServer)?.host}
            </Text>
          )}
          <Space size={4}>
            <Text style={{ fontSize: 12 }}>并发数</Text>
            <Select
              size="small" style={{ width: 70 }}
              value={maxConcurrent}
              onChange={v => { setMaxConcurrent(v); localStorage.setItem(CONCURRENCY_KEY, String(v)) }}
              options={Array.from({ length: 10 }, (_, i) => ({ value: i + 1, label: String(i + 1) }))}
            />
          </Space>
          {runningCount > 0 && <Tag color="blue" icon={<LoadingOutlined spin />} style={{ borderRadius: 999 }}>{runningCount} 个任务进行中</Tag>}
        </Space>
      </Card>

      {/* 双窗格 */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 10 }}>
        {/* 本地窗格 */}
        <Card
          size="small" style={{ flex: 1, minWidth: 0, borderRadius: 12, display: 'flex', flexDirection: 'column' }}
          styles={{ body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 12 } }}
          title={<Space size={6}><Text style={{ fontSize: 13 }}>本地</Text>{dirName(localPath) && <Tag style={{ borderRadius: 999 }}>{dirName(localPath)}</Tag>}</Space>}
          extra={<Space size={2}>
            <Tooltip title="新建文件夹"><Button size="small" type="text" icon={<FolderAddOutlined />} onClick={() => openMkdir('local')} /></Tooltip>
            <Tooltip title="返回上级"><Button size="small" type="text" icon={<ArrowUpOutlined />} onClick={goLocalUp} /></Tooltip>
            <Tooltip title="主目录"><Button size="small" type="text" icon={<HomeOutlined />} onClick={async () => { const r = await window.electronAPI.fileTransfer.homeLocal(); if (r.success && r.path) { setLocalPath(r.path); loadLocal(r.path) } }} /></Tooltip>
            <Tooltip title="刷新"><Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => loadLocal(localPath)} /></Tooltip>
          </Space>}
        >
          <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexShrink: 0 }}>
            {/* 盘符切换（仅非 Windows 隐藏） */}
            {drives.length > 0 && !(drives.length === 1 && drives[0] === '/') && (
              <Select
                size="small" style={{ width: 88, flexShrink: 0 }}
                value={currentDrive}
                onChange={switchDrive}
                placeholder="选择盘符"
                options={drives.map(d => ({ value: d, label: `${d} 盘` }))}
              />
            )}
            <Input size="small" value={localPath} onChange={e => setLocalPath(e.target.value)}
              onPressEnter={() => loadLocal(localPath)} style={{ fontSize: 12 }} />
            <Button size="small" icon={<ArrowRightOutlined />} onClick={() => loadLocal(localPath)} />
          </div>
          {/* 内容区：内部滚动（容器内部永远需要滚动） */}
          <PaneTable
            entries={localEntries} loading={localLoading}
            columns={columnsLocal}
            selectedKeys={localSel} onSelect={setLocalSel}
            onDouble={handleLocalDouble} onCtx={handleLocalCtx}
          />
        </Card>

        {/* 传输方向按钮 */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 8, flexShrink: 0 }}>
          <Tooltip title="上传选中文件（本地 → 远程）">
            <Button icon={<CloudUploadOutlined />} size="large" style={{ borderColor: '#48484a', color: '#0A84FF' }} onClick={uploadSelected} disabled={localSel.length === 0} />
          </Tooltip>
          <Tooltip title="下载选中文件（远程 → 本地）">
            <Button icon={<CloudDownloadOutlined />} size="large" style={{ borderColor: '#48484a', color: '#30D158' }} onClick={downloadSelected} disabled={remoteSel.length === 0} />
          </Tooltip>
        </div>

        {/* 远程窗格 */}
        <Card
          size="small" style={{ flex: 1, minWidth: 0, borderRadius: 12, display: 'flex', flexDirection: 'column' }}
          styles={{ body: { flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 12 } }}
          title={<Space size={6}><Text style={{ fontSize: 13 }}>远程</Text>{dirName(remotePath) && <Tag style={{ borderRadius: 999 }}>{dirName(remotePath)}</Tag>}</Space>}
          extra={<Space size={2}>
            <Tooltip title="新建文件夹"><Button size="small" type="text" icon={<FolderAddOutlined />} onClick={() => openMkdir('remote')} disabled={!selectedServer} /></Tooltip>
            <Tooltip title="返回上级"><Button size="small" type="text" icon={<ArrowUpOutlined />} onClick={goRemoteUp} disabled={!selectedServer} /></Tooltip>
            <Tooltip title="根目录"><Button size="small" type="text" icon={<HomeOutlined />} onClick={() => { if (selectedServer) { setRemotePath('/'); loadRemote(selectedServer, '/') } }} disabled={!selectedServer} /></Tooltip>
            <Tooltip title="刷新"><Button size="small" type="text" icon={<ReloadOutlined />} onClick={() => selectedServer && loadRemote(selectedServer, remotePath)} disabled={!selectedServer} /></Tooltip>
          </Space>}
        >
          <div style={{ display: 'flex', gap: 4, marginBottom: 8, flexShrink: 0 }}>
            <Input size="small" value={remotePath} onChange={e => setRemotePath(e.target.value)}
              onPressEnter={() => selectedServer && loadRemote(selectedServer, remotePath)} style={{ fontSize: 12 }} disabled={!selectedServer} />
            <Button size="small" icon={<ArrowLeftOutlined />} onClick={() => selectedServer && loadRemote(selectedServer, remotePath)} disabled={!selectedServer} />
          </div>
          {/* 内容区：内部滚动（容器内部永远需要滚动） */}
          <PaneTable
            entries={remoteEntries} loading={remoteLoading}
            columns={columnsRemote}
            selectedKeys={remoteSel} onSelect={setRemoteSel}
            onDouble={handleRemoteDouble} onCtx={handleRemoteCtx}
            empty={!selectedServer ? <Empty description="请先选择服务器" style={{ padding: 40 }} /> : undefined}
          />
        </Card>
      </div>

      {/* 右键菜单浮层：纯静态无动画，悬停即时高亮 */}
      {ctxMenu && (
        <div
          style={{
            position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 3000, minWidth: 170,
            background: 'var(--app-bg-color, #ffffff)', // 实心背景，避免透出下层表格文字
            borderRadius: 8,
            padding: 4,
            boxShadow: '0 6px 20px rgba(0,0,0,0.28)',
            border: '1px solid var(--app-border-color, #48484a)'
          }}
          onClick={e => e.stopPropagation()}
          onContextMenu={e => e.preventDefault()}
        >
          {ctxItems.map(it => (
            <div
              key={it.key}
              onClick={() => onCtxAction(it)}
              style={{
                padding: '6px 12px', fontSize: 12, cursor: 'pointer', borderRadius: 6,
                color: it.danger ? '#FF453A' : undefined,
                transition: 'none'
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--app-hover-bg, rgba(120,120,128,0.16))' }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent' }}
            >
              {it.label}
            </div>
          ))}
        </div>
      )}

      {/* 文本编辑器（打开/编辑/保存）：按扩展名识别语言 → 语法高亮 + 语法检查 */}
      <Modal
        title={editor ? <Space><FileTextOutlined style={{ color: '#0A84FF' }} /><span>{editor.name}</span><Tag style={{ borderRadius: 999 }}>{editor.side === 'local' ? '本地' : '远程'}</Tag>{editor && <Tag color="blue" style={{ borderRadius: 999 }}>{langForFile(editor.name)}</Tag>}</Space> : ''}
        open={!!editor}
        onCancel={() => setEditor(null)}
        width={820}
        footer={<Space>
          <Button onClick={() => setEditor(null)}>取消</Button>
          <Button type="primary" loading={editorSaving} onClick={saveEditor} disabled={editorLoading}>保存</Button>
        </Space>}
      >
        {editorLoading ? <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div> : (
          <Editor
            height="420px"
            language={editor ? langForFile(editor.name) : 'plaintext'}
            value={editorContent}
            onChange={(v) => setEditorContent(v || '')}
            onMount={(ed) => {
              // YAML 实时语法检查：编辑过程中即时标错（保存按钮侧另有兜底拦截）
              validateYamlModel(ed)
              ed.getModel()?.onDidChangeContent(() => validateYamlModel(ed))
            }}
            theme={document.documentElement.getAttribute('data-theme') === 'dark' ? 'vs-dark' : 'light'}
            options={{
              fontSize: 12,
              minimap: { enabled: false },
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              lineNumbersMinChars: 3,
              padding: { top: 8 }
            }}
          />
        )}
      </Modal>

      {/* 新建文件夹 / 重命名 弹窗 */}
      <Modal
        title={opModal?.kind === 'rename' ? '重命名' : '新建文件夹'}
        open={!!opModal}
        onOk={submitOp}
        onCancel={() => setOpModal(null)}
        okText="确定" cancelText="取消"
        width={360}
      >
        <Input
          value={opName}
          onChange={e => setOpName(e.target.value)}
          placeholder="请输入名称"
          onPressEnter={submitOp}
          autoFocus
        />
      </Modal>

      {/* 任务队列 */}
      <Card
        size="small" style={{ marginTop: 12, borderRadius: 12, flexShrink: 0, maxHeight: 220, overflow: 'auto' }}
        title={<Space><span style={{ fontSize: 13 }}>传输队列</span><Tag style={{ borderRadius: 999 }}>{tasks.length}</Tag></Space>}
        extra={tasks.some(x => x.status === 'success' || x.status === 'error')
          ? <Button size="small" type="text" icon={<ClearOutlined />} onClick={clearFinished} style={{ fontSize: 12 }}>清除已完成</Button>
          : undefined}
      >
        {tasks.length === 0 ? (
          <Empty description="暂无传输任务" style={{ padding: '12px 0' }} image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <List
            size="small"
            dataSource={tasks}
            renderItem={(task) => (
              <List.Item
                style={{ padding: '4px 4px' }}
                actions={[
                  task.status === 'error'
                    ? <Button key="r" size="small" type="text" icon={<ReloadOutlined />} onClick={() => retryTask(task.id)}>重试</Button>
                    : task.status === 'success'
                      ? <Button key="d" size="small" type="text" icon={<CloseCircleOutlined />} onClick={() => removeTask(task.id)} />
                      : null
                ]}
              >
                <List.Item.Meta
                  avatar={task.status === 'transferring'
                    ? <LoadingOutlined style={{ fontSize: 15, color: '#0A84FF' }} spin />
                    : task.status === 'success'
                      ? <CheckCircleOutlined style={{ fontSize: 15, color: '#30D158' }} />
                      : task.status === 'error'
                        ? <CloseCircleOutlined style={{ fontSize: 15, color: '#FF453A' }} />
                        : <ClockCircleOutlined style={{ fontSize: 15, color: '#8e8e93' }} />}
                  title={<Space size={6}>
                    <span style={{ fontSize: 12 }}>{task.type === 'upload' ? <CloudUploadOutlined /> : <CloudDownloadOutlined />} {task.name}</span>
                    <Tag color={statusMeta[task.status].color} style={{ borderRadius: 999, fontSize: 10, margin: 0 }}>{statusMeta[task.status].label}</Tag>
                  </Space>}
                  description={<div style={{ width: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, marginBottom: 2 }}>
                      <span style={{ color: '#8e8e93', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: 12 }}>
                        <Tooltip title={task.remote}>{task.remote}</Tooltip>
                      </span>
                      <span style={{ color: '#8e8e93', flexShrink: 0 }}>{task.progress}%</span>
                    </div>
                    {(task.status === 'queued' || task.status === 'transferring') && (
                      <Progress percent={task.progress} size="small" showInfo={false} strokeColor={task.status === 'transferring' ? '#0A84FF' : '#8e8e93'} />
                    )}
                    {task.status === 'error' && task.message && <Text style={{ fontSize: 11, color: '#FF453A' }}>{task.message}</Text>}
                  </div>}
                />
              </List.Item>
            )}
          />
        )}
      </Card>
    </div>
  )
}

export default FileTransfer