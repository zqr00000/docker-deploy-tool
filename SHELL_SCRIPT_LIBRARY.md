# Shell 脚本库使用文档

## 一、功能概述

Shell 脚本库用于集中管理可复用的运维脚本，支持：

- **集中管理**：在统一的页面中创建、编辑、分类、检索脚本
- **用户自定义配置**：脚本运行时可通过环境变量参数 / 位置参数灵活注入配置
- **多服务器调用**：一键在单台或多台服务器上执行同一脚本，并行的并发度自动控制
- **版本控制**：每次修改内容自动生成新版本并保留快照，可随时查看历史或一键回滚
- **执行记录**：每次执行自动保存输出、退出码、耗时与状态，可在「执行历史」中回溯排查
- **错误反馈**：单服务器执行失败不影响其他服务器，结果按服务器维度完整返回

## 二、配置机制

脚本支持三类配置方式，均交由 bash 原生展开，兼容 `bash` 标准语法：

### 1. 环境变量参数（推荐）

运行脚本时在「环境变量参数」中填写 `KEY=Value`，参数会以环境变量注入脚本进程，
脚本内通过 `${KEY}` 或 `${KEY:-默认值}` 引用：

```bash
#!/usr/bin/env bash
echo "备份目录: ${BACKUP_DIR:-/data/backup}"
echo "保留天数: ${RETENTION_DAYS:-7}"
```

### 2. 位置参数

运行脚本时在「位置参数」中填写以空格分隔的参数列表，脚本内通过 `$1 $2 ...` 引用：

```bash
#!/usr/bin/env bash
echo "目标: $1"
echo "环境: $2"
```

### 3. 配置文件

脚本内可直接读取远端任意路径的配置文件（如 `/etc/myapp.conf`），实现与服务器本地
配置的联动。

> 参数名仅支持字母、数字、下划线，且不能以数字开头；含非法字符的键会被忽略。

## 三、调用接口（IPC）

脚本库通过 Electron IPC 向渲染进程暴露统一接口，接口命名空间为 `shellScript`：

| 方法 | 参数 | 说明 |
| --- | --- | --- |
| `getAll()` | - | 获取全部脚本 |
| `getById(id)` | 脚本 ID | 获取单个脚本 |
| `create(input)` | `{ name, description?, category?, content, timeout? }` | 新建脚本（初始版本 v1） |
| `update(id, input, changeNote?)` | 脚本 ID、更新字段、变更说明 | 更新脚本，内容变更自动升级版本 |
| `delete(id)` | 脚本 ID | 删除脚本（级联删除版本与执行记录） |
| `getVersions(scriptId)` | 脚本 ID | 获取版本历史（新版本在前） |
| `getVersionById(id)` | 版本 ID | 获取某个版本的脚本内容 |
| `rollback(scriptId, versionId, changeNote?)` | 脚本 ID、版本 ID | 回滚到指定版本 |
| `run(scriptId, options)` | `{ serverIds[], params?, args?, timeout? }` | 在指定服务器上执行脚本 |
| `getExecutionLogs(scriptId?, limit?)` | 脚本 ID（可选）、数量 | 获取执行历史 |
| `deleteExecutionLog(logId)` | 日志 ID | 删除单条执行记录 |
| `clearExecutionLogs(scriptId?)` | 脚本 ID（可选） | 清空执行历史 |

### 执行结果结构（`run`）

```json
{
  "success": true,
  "total": 3,
  "successCount": 3,
  "failureCount": 0,
  "results": [
    {
      "serverId": "xxx",
      "serverName": "生产-01",
      "success": true,
      "status": "success",
      "exitCode": 0,
      "stdout": "...",
      "stderr": "",
      "duration": 1234
    }
  ]
}
```

- `success`：所有服务器均成功才为 `true`
- 单台服务器超时（默认取脚本配置的 `timeout`，可在运行时覆盖）不会影响其他服务器
- 多服务器执行采用并发控制（默认并发 3），避免对远端造成压力

## 四、使用流程

1. 进入侧边栏 **「Shell 脚本库」**
2. 点击 **「新建脚本」**，填写名称、分类，在编辑器中编写脚本内容（支持语法高亮与参数提示）
3. 点击 **「运行」**，选择一台或多台目标服务器，按需填写环境变量参数 / 位置参数 / 超时时间
4. 在结果弹窗中查看每台服务器的输出、退出码与耗时
5. 如需调整脚本，点击 **「编辑」** 修改；每次修改都会生成新版本
6. 出问题时可在 **「版本」** 中查看历史内容并一键回滚

## 五、版本控制与更新机制

- 新建脚本默认版本为 `v1`，同时写入初始版本快照
- 每次修改脚本内容，旧内容自动保存为快照，版本号递增
- 回滚操作也会先保存当前内容快照再切换版本，避免误操作丢失
- 内置脚本（系统信息、磁盘检查、Docker 清理等）仅首次启动时写入，后续不会覆盖用户的任何自定义修改

## 六、兼容性说明

- 脚本统一通过 `bash` 解释执行，兼容 Debian / Ubuntu / CentOS / RHEL / Rocky / AlmaLinux 等主流发行版
- 脚本内容经 base64 编码传输，不受引号、换行、特殊字符影响
- 内置脚本优先使用 POSIX 兼容语法；建议自研脚本也尽量使用 `bash` 与 POSIX 通用语法
- 执行环境为普通登录用户；需要 root 权限的操作请在脚本内自行处理（如 `sudo`）

## 七、数据表结构

| 表名 | 用途 |
| --- | --- |
| `shell_scripts` | 脚本主表（名称、描述、分类、内容、当前版本、超时时间、是否内置） |
| `shell_script_versions` | 版本历史（脚本 ID、版本号、内容快照、变更说明、创建时间） |
| `shell_script_execution_logs` | 执行记录（脚本、服务器、状态、退出码、stdout/stderr、耗时、参数） |
