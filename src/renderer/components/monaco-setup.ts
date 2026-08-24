// Monaco 本地化配置：使用随应用打包的 monaco-editor（离线可用），而非从 CDN 加载
import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'

import EditorWorker from 'monaco-editor/editor/editor.worker?worker'

self.MonacoEnvironment = {
  getWorker(): typeof EditorWorker {
    return new EditorWorker()
  }
}

loader.config({ monaco })

// ==================== Shell 语法提示（自动补全） ====================
const SHELL_KEYWORDS: Array<[string, string]> = [
  ['if', 'if ... fi 条件判断'],
  ['then', 'if/then 分支'],
  ['else', 'if/else 分支'],
  ['elif', 'if 的另一分支'],
  ['fi', 'if 结束'],
  ['for', 'for 循环'],
  ['while', 'while 循环'],
  ['until', 'until 循环'],
  ['do', 'do ... done'],
  ['done', '循环结束'],
  ['case', 'case 分支'],
  ['esac', 'case 结束'],
  ['function', '定义函数'],
  ['local', '声明局部变量'],
  ['readonly', '只读变量'],
  ['export', '导出变量'],
  ['return', '函数返回'],
  ['exit', '退出脚本'],
  ['break', '中断循环'],
  ['continue', '继续循环'],
  ['select', 'select 菜单循环'],
  ['trap', '捕获信号'],
  ['source', '执行文件内容'],
  ['shift', '参数左移'],
  ['set', '设置 shell 选项'],
  ['unset', '删除变量/函数'],
  ['[[', '扩展测试 [[ ]]'],
  ['${', '变量引用 ${var}'],
  ['$(', '命令替换 $(cmd)'],
  ['&', '后台执行 &']
]

const SHELL_BUILTINS: Array<[string, string]> = [
  ['echo', '输出文本'], ['printf', '格式化输出'], ['read', '读取输入'],
  ['cd', '切换目录'], ['pwd', '打印当前目录'], ['ls', '列出文件'],
  ['mkdir', '创建目录'], ['rmdir', '删除空目录'], ['rm', '删除文件/目录'],
  ['cp', '复制文件'], ['mv', '移动/重命名'], ['touch', '创建空文件/更新时间'],
  ['cat', '查看文件'], ['tail', '查看文件尾部'], ['head', '查看文件头部'],
  ['grep', '文本搜索'], ['egrep', '扩展正则搜索'], ['sed', '流编辑器'],
  ['awk', '文本处理'], ['wc', '统计行/字/字节'], ['cut', '裁剪列'],
  ['sort', '排序'], ['uniq', '去重'], ['find', '查找文件'],
  ['chmod', '修改权限'], ['chown', '修改属主'], ['tar', '打包/解压'],
  ['zip', '压缩'], ['unzip', '解压'], ['ps', '查看进程'],
  ['top', '实时进程'], ['kill', '杀死进程'], ['free', '查看内存'],
  ['df', '查看磁盘'], ['du', '查看目录空间'], ['date', '系统时间'],
  ['sleep', '休眠'], ['jobs', '查看作业'], ['bg', '后台作业'],
  ['fg', '前台作业'], ['alias', '定义别名'], ['history', '历史命令'],
  ['which', '定位命令'], ['uname', '系统信息'], ['id', '用户信息'],
  ['whoami', '当前用户'], ['env', '环境变量'], ['type', '命令类型'],
  ['docker', 'Docker 命令'], ['docker ps', '列出容器'],
  ['docker images', '列出镜像'], ['docker logs', '容器日志'],
  ['docker exec', '进入容器'], ['docker compose', 'Compose 编排'],
  ['systemctl', '系统服务'], ['service', '服务管理'], ['journalctl', '系统日志'],
  ['curl', '网络请求'], ['wget', '下载'], ['nc', '网络工具'],
  ['ping', '网络连通'], ['ifconfig', '网卡配置'], ['ip', '网络配置']
]

const SHELL_BUILTIN_VARS: Array<[string, string]> = [
  ['$0', '脚本名'], ['$1', '第 1 个参数'], ['$2', '第 2 个参数'],
  ['$#', '参数个数'], ['$@', '全部参数'], ['$*', '全部参数（单字符串）'],
  ['$?', '上一条命令退出码'], ['$$', '当前 Shell PID'], ['$!', '后台最近作业 PID'],
  ['$HOME', '主目录'], ['$PATH', '路径变量'], ['$USER', '当前用户'],
  ['$HOSTNAME', '主机名'], ['$PWD', '当前目录'], ['$OLDPWD', '上个目录'],
  ['$SHELL', '当前 Shell'], ['$LINENO', '当前行号']
]

function registerShellCompletion(language: string): void {
  monaco.languages.registerCompletionItemProvider(
    { language },
    {
      triggerCharacters: ['$', ' ', '.', '/', '-', '{'],
      provideCompletionItems(model, position) {
        const word = model.getWordUntilPosition(position)
        const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn)

        const suggestions: monaco.languages.CompletionItem[] = []

        const prevChar = (position.column > 1
          ? model.getValueInRange(new monaco.Range(position.lineNumber, position.column - 1, position.lineNumber, position.column))
          : '')
        const wordText = word.word

        // 触发 $ 时优先提供变量补全
        if (prevChar === '$' || wordText.startsWith('$')) {
          for (const [label, detail] of SHELL_BUILTIN_VARS) {
            suggestions.push({
              label,
              kind: monaco.languages.CompletionItemKind.Variable,
              detail,
              insertText: label,
              range
            })
          }
        }

        // 内置变量/函数建议
        const modelText = model.getValue()
        const varSet = new Set<string>()
        const varRe = /\b(?:local\s+|readonly\s+|export\s+)?([A-Za-z_][A-Za-z0-9_]*)=/g
        let m: RegExpExecArray | null
        while ((m = varRe.exec(modelText)) !== null) {
          varSet.add(m[1])
        }
        for (const v of Array.from(varSet)) {
          suggestions.push({
            label: v,
            kind: monaco.languages.CompletionItemKind.Variable,
            detail: '脚本内已定义变量',
            insertText: v,
            range
          })
        }

        // 关键字 + 常用命令
        const lists: Array<[string, string, monaco.languages.CompletionItemKind]> = [
          ...SHELL_KEYWORDS.map(([l, d]) => [l, d, monaco.languages.CompletionItemKind.Keyword] as any),
          ...SHELL_BUILTINS.map(([l, d]) => [l, d, monaco.languages.CompletionItemKind.Function] as any)
        ]
        for (const [label, detail, kind] of lists) {
          suggestions.push({
            label,
            kind,
            detail: `shell · ${detail}`,
            insertText: label,
            range
          })
        }

        return { suggestions }
      }
    }
  )
}

for (const lang of ['shell', 'bash']) {
  registerShellCompletion(lang)
}

export default monaco