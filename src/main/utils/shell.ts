/**
 * Shell 命令安全工具
 *
 * 统一防护通过 SSH 执行的命令拼接注入：
 * 渲染层/前端输入（路径、镜像名、容器名等）在拼入 shell 命令前必须经过本模块校验或转义，
 * 否则形如 `rm -rf ${projectPath}`、`docker pull ${imageName}` 的拼接点会演变为
 * "渲染层 XSS = 服务器任意命令执行"。
 */

/** POSIX shell 单引号转义：包裹后内部任意字符（含单引号）都不会逃逸 */
export function shQuote(arg: string): string {
  return `'${String(arg).replace(/'/g, `'\\''`)}'`
}

/** 路径白名单：字母数字、斜杠、点、下划线、连字符；拒绝 .. 穿越、引号、分号、$、反引号等 */
const SAFE_PATH_RE = /^[a-zA-Z0-9_\-/. ]+$/

/**
 * 校验远端文件路径是否安全（可含空格，但不得包含 shell 元字符或 .. 穿越）。
 * 返回 null 表示合法，否则返回拒绝原因。
 */
export function validatePath(path: string, label = 'path'): string | null {
  if (!path || typeof path !== 'string') return `${label} 不能为空`
  if (path.includes('..')) return `${label} 禁止包含 .. 路径穿越`
  if (path.length > 1024) return `${label} 过长`
  if (!SAFE_PATH_RE.test(path)) return `${label} 含非法字符（仅允许字母数字、/ . _ - 和空格）: ${JSON.stringify(path.slice(0, 80))}`
  if (!path.startsWith('/')) return `${label} 必须是绝对路径（以 / 开头）`
  return null
}

/** Docker 对象（镜像/容器/网络/卷）名称白名单：字母数字、. _ - : /（镜像可含 registry 端口与 tag） */
const DOCKER_REF_RE = /^[a-zA-Z0-9_][a-zA-Z0-9_.\-/:]*$/

/**
 * 校验 Docker 引用（镜像名、容器名/ID、网络名、卷名等）。
 * 返回 null 表示合法，否则返回拒绝原因。
 */
export function validateDockerRef(ref: string, label = 'docker ref'): string | null {
  if (!ref || typeof ref !== 'string') return `${label} 不能为空`
  if (ref.length > 256) return `${label} 过长`
  if (!DOCKER_REF_RE.test(ref)) return `${label} 含非法字符: ${JSON.stringify(ref.slice(0, 80))}`
  return null
}

/** 环境变量名：[A-Za-z_][A-Za-z0-9_]* */
const ENV_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/

/** 校验环境变量名（.env 写入前必须校验，防止换行注入任意变量） */
export function validateEnvName(name: string): boolean {
  return ENV_NAME_RE.test(name)
}

/** 常用 shell 白名单（容器终端） */
export const ALLOWED_SHELLS = ['/bin/bash', '/bin/sh', '/bin/ash', 'bash', 'sh', 'ash']

/** 校验容器终端 shell 是否在白名单内 */
export function isAllowedShell(shell: string): boolean {
  return ALLOWED_SHELLS.includes(shell)
}

/** 断言工具：校验失败直接抛出带原因的 Error，适合在服务层入口统一拦截 */
export function assertSafe(check: string | null): void {
  if (check) {
    throw new Error(`安全校验失败: ${check}`)
  }
}

/** IPv4 / CIDR 校验（docker network 的 subnet/gateway/ip-range 等参数） */
export function isValidIpOrCidr(value: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})(\/(\d{1,2}))?$/.exec(value)
  if (!m) return false
  const octetsOk = [m[1], m[2], m[3], m[4]].every(o => {
    const n = Number(o)
    return Number.isInteger(n) && n >= 0 && n <= 255
  })
  const prefixOk = !m[6] || (Number.isInteger(Number(m[6])) && Number(m[6]) <= 32)
  return octetsOk && prefixOk
}
