import { useEffect, useState } from 'react'
import { Plus, Play, Trash2, PauseCircle } from 'lucide-react'
import { format } from 'date-fns'
import {
  getTasksApi, createTaskApi, deleteTaskApi, updateTaskApi, runTaskNowApi, ScheduledTask
} from '../api/sms'
import { useModemStore } from '../store/modemStore'
import clsx from 'clsx'

const statusBadge: Record<string, string> = {
  active: 'bg-green-900 text-green-300',
  paused: 'bg-yellow-900 text-yellow-300',
  completed: 'bg-gray-700 text-gray-400',
  failed: 'bg-red-900 text-red-300',
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const modems = useModemStore(s => s.modems)
  const [form, setForm] = useState({
    name: '', modem_id: '', recipients: '', content: '', cron_expression: '', send_once_at: ''
  })
  const [mode, setMode] = useState<'cron' | 'once'>('cron')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!form.name || !form.modem_id || !form.recipients || !form.content) {
      setError('请填写所有必填项')
      return
    }
    setSaving(true)
    try {
      await createTaskApi({
        name: form.name,
        modem_id: Number(form.modem_id),
        recipients: form.recipients.split('\n').map(s => s.trim()).filter(Boolean),
        content: form.content,
        cron_expression: mode === 'cron' ? form.cron_expression : undefined,
        send_once_at: mode === 'once' ? form.send_once_at : undefined,
      } as any)
      onCreated()
      onClose()
    } catch (e: any) {
      setError(e.response?.data?.detail || '创建失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-lg space-y-4">
        <h2 className="text-xl font-bold text-white">新建定时任务</h2>

        <input
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder="任务名称"
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
        />

        <select
          value={form.modem_id}
          onChange={e => setForm(f => ({ ...f, modem_id: e.target.value }))}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
        >
          <option value="">— 选择 SIM 卡 —</option>
          {modems.map(m => <option key={m.id} value={m.id}>{m.alias || `SIM ${m.id}`}</option>)}
        </select>

        <textarea
          value={form.recipients}
          onChange={e => setForm(f => ({ ...f, recipients: e.target.value }))}
          placeholder={`接收号码（每行一个）\n+8613800138000\n+8613912345678`}
          rows={3}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm resize-none"
        />

        <textarea
          value={form.content}
          onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
          placeholder="短信内容"
          rows={3}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white resize-none"
        />

        <div className="flex gap-2">
          {(['cron', 'once'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={clsx('px-3 py-1.5 rounded-lg text-sm', mode === m ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-400')}
            >
              {m === 'cron' ? '定时循环' : '单次发送'}
            </button>
          ))}
        </div>

        {mode === 'cron' ? (
          <input
            value={form.cron_expression}
            onChange={e => setForm(f => ({ ...f, cron_expression: e.target.value }))}
            placeholder="Cron 表达式，如 0 9 * * * (每天9点)"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
          />
        ) : (
          <input
            type="datetime-local"
            value={form.send_once_at}
            onChange={e => setForm(f => ({ ...f, send_once_at: e.target.value }))}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
          />
        )}

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white">取消</button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg"
          >
            {saving ? '创建中…' : '创建任务'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ScheduledTasks() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [showCreate, setShowCreate] = useState(false)

  const load = () => getTasksApi().then(r => setTasks(r.data))
  useEffect(() => { load() }, [])

  const toggleStatus = async (task: ScheduledTask) => {
    const newStatus = task.status === 'active' ? 'paused' : 'active'
    await updateTaskApi(task.id, { status: newStatus } as any)
    load()
  }

  const remove = async (id: number) => {
    if (!confirm('确认删除此任务？')) return
    await deleteTaskApi(id)
    load()
  }

  const runNow = async (id: number) => {
    await runTaskNowApi(id)
    setTimeout(load, 1000)
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">定时任务</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm"
        >
          <Plus className="w-4 h-4" /> 新建任务
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="bg-gray-800 border border-dashed border-gray-600 rounded-xl p-10 text-center text-gray-500">
          暂无定时任务
        </div>
      ) : (
        <div className="space-y-3">
          {tasks.map(task => (
            <div key={task.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-white">{task.name}</h3>
                    <span className={clsx('text-xs px-2 py-0.5 rounded-full', statusBadge[task.status])}>
                      {task.status}
                    </span>
                  </div>
                  <p className="text-sm text-gray-400 mt-1">{task.content}</p>
                  <div className="flex gap-4 mt-2 text-xs text-gray-500">
                    <span>收件人 {task.recipients.length} 个</span>
                    <span>{task.cron_expression ? `CRON: ${task.cron_expression}` : `单次: ${task.send_once_at ? format(new Date(task.send_once_at), 'MM-dd HH:mm') : ''}`}</span>
                    <span>已执行 {task.run_count} 次</span>
                    {task.last_run_at && <span>最近: {format(new Date(task.last_run_at), 'MM-dd HH:mm')}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => runNow(task.id)} title="立即执行" className="text-gray-400 hover:text-green-400">
                    <Play className="w-4 h-4" />
                  </button>
                  <button onClick={() => toggleStatus(task)} title={task.status === 'active' ? '暂停' : '启用'} className="text-gray-400 hover:text-yellow-400">
                    <PauseCircle className="w-4 h-4" />
                  </button>
                  <button onClick={() => remove(task.id)} title="删除" className="text-gray-400 hover:text-red-400">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={load} />}
    </div>
  )
}
