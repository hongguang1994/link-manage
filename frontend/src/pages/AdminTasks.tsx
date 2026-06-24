import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import {
  Play, Trash2, PauseCircle, ChevronDown, ChevronRight,
  CheckCircle, XCircle, Clock, Activity, Users, Search, RefreshCw,
} from 'lucide-react'
import clsx from 'clsx'
import {
  adminGetTasksApi, adminGetTaskStatsApi, adminGetTaskHistoryApi,
  updateTaskApi, deleteTaskApi, runTaskNowApi,
  type ScheduledTask, type TaskStats, type SmsMessage,
} from '../api/sms'
import { listUsersApi, type UserOut } from '../api/auth'
import { useLangStore } from '../store/langStore'

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl px-5 py-4">
      <p className="text-xs text-gray-400 mb-1">{label}</p>
      <p className={clsx('text-2xl font-bold', color)}>{value}</p>
    </div>
  )
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_CLS: Record<string, string> = {
  active:    'bg-green-900/60 text-green-300',
  paused:    'bg-yellow-900/60 text-yellow-300',
  completed: 'bg-gray-700 text-gray-400',
  failed:    'bg-red-900/60 text-red-300',
}
const STATUS_LABEL: Record<string, Record<string, string>> = {
  zh: { active: '运行中', paused: '已暂停', completed: '已完成', failed: '失败' },
  en: { active: 'Active', paused: 'Paused', completed: 'Done', failed: 'Failed' },
}

// ── History drawer ────────────────────────────────────────────────────────────

function HistoryRow({ msg }: { msg: SmsMessage }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-700/50 text-xs">
      {msg.status === 'sent'
        ? <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
        : <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
      }
      <span className="text-gray-300 w-32 shrink-0">{msg.phone_number}</span>
      <span className={clsx('shrink-0', msg.status === 'sent' ? 'text-green-400' : 'text-red-400')}>
        {msg.status}
      </span>
      {msg.error_message && (
        <span className="text-red-400 truncate max-w-[200px]">{msg.error_message}</span>
      )}
      <span className="ml-auto text-gray-500 shrink-0">
        {msg.created_at ? format(new Date(msg.created_at), 'MM-dd HH:mm') : '—'}
      </span>
    </div>
  )
}

// ── Task row ──────────────────────────────────────────────────────────────────

function TaskRow({
  task, onRefresh, lang,
}: { task: ScheduledTask; onRefresh: () => void; lang: string }) {
  const [expanded, setExpanded] = useState(false)
  const [history, setHistory] = useState<SmsMessage[]>([])
  const [loadingHist, setLoadingHist] = useState(false)

  const loadHistory = async () => {
    if (expanded) { setExpanded(false); return }
    setExpanded(true)
    setLoadingHist(true)
    adminGetTaskHistoryApi(task.id).then(r => setHistory(r.data)).finally(() => setLoadingHist(false))
  }

  const toggle = async () => {
    const newStatus = task.status === 'active' ? 'paused' : 'active'
    await updateTaskApi(task.id, { status: newStatus } as any)
    onRefresh()
  }

  const remove = async () => {
    if (!confirm(lang === 'zh' ? `确认删除任务「${task.name}」？` : `Delete task "${task.name}"?`)) return
    await deleteTaskApi(task.id)
    onRefresh()
  }

  const runNow = async () => {
    await runTaskNowApi(task.id)
    setTimeout(onRefresh, 1200)
  }

  return (
    <>
      <tr className={clsx('border-b border-gray-700/50 hover:bg-gray-750 transition-colors', expanded && 'bg-gray-800/60')}>
        {/* Expand */}
        <td className="px-3 py-3">
          <button onClick={loadHistory} className="text-gray-500 hover:text-gray-300">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </td>
        {/* Name */}
        <td className="px-3 py-3">
          <p className="text-sm font-medium text-white">{task.name}</p>
          <p className="text-xs text-gray-500 mt-0.5 truncate max-w-[180px]">{task.content}</p>
        </td>
        {/* Creator */}
        <td className="px-3 py-3">
          {task.created_by_username ? (
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-300">
              <div className="w-5 h-5 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                {task.created_by_username[0].toUpperCase()}
              </div>
              {task.created_by_username}
            </span>
          ) : <span className="text-gray-600 text-xs">—</span>}
        </td>
        {/* Schedule */}
        <td className="px-3 py-3 text-xs text-gray-400">
          {task.cron_expression
            ? <span className="font-mono">{task.cron_expression}</span>
            : task.send_once_at
              ? format(new Date(task.send_once_at), 'MM-dd HH:mm')
              : '—'}
        </td>
        {/* Status */}
        <td className="px-3 py-3">
          <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', STATUS_CLS[task.status])}>
            {STATUS_LABEL[lang]?.[task.status] ?? task.status}
          </span>
        </td>
        {/* Recipients */}
        <td className="px-3 py-3 text-xs text-gray-400 text-center">{task.recipients.length}</td>
        {/* Run count */}
        <td className="px-3 py-3 text-xs text-gray-300 text-center">{task.run_count}</td>
        {/* Last run */}
        <td className="px-3 py-3 text-xs text-gray-400">
          {task.last_run_at ? format(new Date(task.last_run_at), 'MM-dd HH:mm') : '—'}
        </td>
        {/* Next run */}
        <td className="px-3 py-3 text-xs text-gray-400">
          {task.next_run_at ? format(new Date(task.next_run_at), 'MM-dd HH:mm') : '—'}
        </td>
        {/* Actions */}
        <td className="px-3 py-3">
          <div className="flex items-center gap-1.5">
            <button onClick={runNow} title={lang === 'zh' ? '立即执行' : 'Run now'}
              className="text-gray-400 hover:text-green-400 transition-colors">
              <Play className="w-3.5 h-3.5" />
            </button>
            {(task.status === 'active' || task.status === 'paused') && (
              <button onClick={toggle}
                title={task.status === 'active' ? (lang === 'zh' ? '暂停' : 'Pause') : (lang === 'zh' ? '恢复' : 'Resume')}
                className="text-gray-400 hover:text-yellow-400 transition-colors">
                <PauseCircle className="w-3.5 h-3.5" />
              </button>
            )}
            <button onClick={remove} title={lang === 'zh' ? '删除' : 'Delete'}
              className="text-gray-400 hover:text-red-400 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </td>
      </tr>

      {/* History drawer */}
      {expanded && (
        <tr>
          <td colSpan={10} className="px-6 py-3 bg-gray-900/60">
            <p className="text-xs font-semibold text-gray-400 mb-2 uppercase tracking-wider">
              {lang === 'zh' ? '最近发送记录' : 'Recent send history'}
            </p>
            {loadingHist ? (
              <p className="text-xs text-gray-500">{lang === 'zh' ? '加载中…' : 'Loading…'}</p>
            ) : history.length === 0 ? (
              <p className="text-xs text-gray-600">{lang === 'zh' ? '暂无记录' : 'No records'}</p>
            ) : history.map(m => <HistoryRow key={m.id} msg={m} />)}
          </td>
        </tr>
      )}
    </>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AdminTasks() {
  const lang = useLangStore(s => s.lang)
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [stats, setStats] = useState<TaskStats | null>(null)
  const [users, setUsers] = useState<UserOut[]>([])
  const [filterStatus, setFilterStatus] = useState('')
  const [filterUser, setFilterUser] = useState<number | ''>('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [tasksRes, statsRes] = await Promise.all([
      adminGetTasksApi({ status: filterStatus || undefined, user_id: filterUser || undefined }),
      adminGetTaskStatsApi(),
    ])
    setTasks(tasksRes.data)
    setStats(statsRes.data)
    setLoading(false)
  }, [filterStatus, filterUser])

  useEffect(() => { load() }, [load])
  useEffect(() => { listUsersApi().then(r => setUsers(r.data)) }, [])

  const filtered = tasks.filter(t =>
    !search || t.name.toLowerCase().includes(search.toLowerCase())
      || (t.created_by_username ?? '').toLowerCase().includes(search.toLowerCase())
  )

  const zh = lang === 'zh'

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Activity className="w-6 h-6 text-blue-400" />
          {zh ? '定时任务监控' : 'Task Monitor'}
        </h1>
        <button onClick={load} className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition-colors">
          <RefreshCw className="w-4 h-4" /> {zh ? '刷新' : 'Refresh'}
        </button>
      </div>

      {/* Stat cards */}
      {stats && (
        <div className="grid grid-cols-5 gap-3">
          <StatCard label={zh ? '全部任务' : 'Total'}     value={stats.total}     color="text-white" />
          <StatCard label={zh ? '运行中' : 'Active'}      value={stats.active}    color="text-green-400" />
          <StatCard label={zh ? '已暂停' : 'Paused'}      value={stats.paused}    color="text-yellow-400" />
          <StatCard label={zh ? '已完成' : 'Completed'}   value={stats.completed} color="text-gray-400" />
          <StatCard label={zh ? '失败' : 'Failed'}        value={stats.failed}    color="text-red-400" />
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={zh ? '搜索任务名或创建者…' : 'Search name or creator…'}
            className="bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 w-56"
          />
        </div>

        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white"
        >
          <option value="">{zh ? '全部状态' : 'All status'}</option>
          <option value="active">{zh ? '运行中' : 'Active'}</option>
          <option value="paused">{zh ? '已暂停' : 'Paused'}</option>
          <option value="completed">{zh ? '已完成' : 'Completed'}</option>
          <option value="failed">{zh ? '失败' : 'Failed'}</option>
        </select>

        <select
          value={filterUser}
          onChange={e => setFilterUser(e.target.value ? Number(e.target.value) : '')}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white"
        >
          <option value="">{zh ? '全部用户' : 'All users'}</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
        </select>

        <div className="flex items-center gap-1.5 text-xs text-gray-500 ml-auto">
          <Users className="w-3.5 h-3.5" />
          {zh ? `共 ${filtered.length} 条任务` : `${filtered.length} tasks`}
        </div>
      </div>

      {/* Table */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-500 text-sm">{zh ? '加载中…' : 'Loading…'}</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-gray-500 text-sm">{zh ? '暂无任务' : 'No tasks'}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-700 text-xs text-gray-400 uppercase tracking-wider">
              <tr>
                <th className="px-3 py-3 w-8" />
                <th className="px-3 py-3 text-left">{zh ? '任务名称' : 'Name'}</th>
                <th className="px-3 py-3 text-left">{zh ? '创建者' : 'Creator'}</th>
                <th className="px-3 py-3 text-left">{zh ? '计划' : 'Schedule'}</th>
                <th className="px-3 py-3 text-left">{zh ? '状态' : 'Status'}</th>
                <th className="px-3 py-3 text-center">{zh ? '收件人' : 'Recipients'}</th>
                <th className="px-3 py-3 text-center">{zh ? '执行次数' : 'Runs'}</th>
                <th className="px-3 py-3 text-left">{zh ? '上次执行' : 'Last run'}</th>
                <th className="px-3 py-3 text-left">{zh ? '下次执行' : 'Next run'}</th>
                <th className="px-3 py-3 text-left">{zh ? '操作' : 'Actions'}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(task => (
                <TaskRow key={task.id} task={task} onRefresh={load} lang={lang} />
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
