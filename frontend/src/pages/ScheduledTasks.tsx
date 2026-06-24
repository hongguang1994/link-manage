import { useEffect, useState } from 'react'
import { Plus, Play, Trash2, PauseCircle } from 'lucide-react'
import { format } from 'date-fns'
import {
  getTasksApi, createTaskApi, deleteTaskApi, updateTaskApi, runTaskNowApi, ScheduledTask
} from '../api/sms'
import { useModemStore } from '../store/modemStore'
import { useT } from '../i18n'
import clsx from 'clsx'

const statusBadge: Record<string, string> = {
  active: 'bg-green-900 text-green-300',
  paused: 'bg-yellow-900 text-yellow-300',
  completed: 'bg-gray-700 text-gray-400',
  failed: 'bg-red-900 text-red-300',
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const modems = useModemStore(s => s.modems)
  const t = useT()
  const [form, setForm] = useState({
    name: '', modem_id: '', recipients: '', content: '', cron_expression: '', send_once_at: ''
  })
  const [mode, setMode] = useState<'cron' | 'once'>('cron')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const submit = async () => {
    if (!form.name || !form.modem_id || !form.recipients || !form.content) {
      setError(t('modal_required'))
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
        send_once_at: mode === 'once' && form.send_once_at
          ? new Date(form.send_once_at).toISOString()
          : undefined,
      } as any)
      onCreated()
      onClose()
    } catch (e: any) {
      setError(e.response?.data?.detail || t('modal_create_fail'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-lg space-y-4">
        <h2 className="text-xl font-bold text-white">{t('modal_create_title')}</h2>

        <input
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          placeholder={t('modal_name_ph')}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
        />

        <select
          value={form.modem_id}
          onChange={e => setForm(f => ({ ...f, modem_id: e.target.value }))}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
        >
          <option value="">{t('modal_sim_ph')}</option>
          {modems.map(m => <option key={m.id} value={m.id}>{m.alias || `SIM ${m.id}`}</option>)}
        </select>

        <textarea
          value={form.recipients}
          onChange={e => setForm(f => ({ ...f, recipients: e.target.value }))}
          placeholder={t('modal_recipients_ph')}
          rows={3}
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm resize-none"
        />

        <textarea
          value={form.content}
          onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
          placeholder={t('modal_content_ph')}
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
              {m === 'cron' ? t('modal_cron') : t('modal_once')}
            </button>
          ))}
        </div>

        {mode === 'cron' ? (
          <input
            value={form.cron_expression}
            onChange={e => setForm(f => ({ ...f, cron_expression: e.target.value }))}
            placeholder={t('modal_cron_ph')}
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
          <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white">{t('cancel')}</button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg"
          >
            {saving ? t('modal_creating') : t('modal_create_btn')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ScheduledTasks() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const t = useT()

  const load = () => getTasksApi().then(r => setTasks(r.data))
  useEffect(() => { load() }, [])

  const toggleStatus = async (task: ScheduledTask) => {
    const newStatus = task.status === 'active' ? 'paused' : 'active'
    await updateTaskApi(task.id, { status: newStatus } as any)
    load()
  }

  const remove = async (id: number) => {
    if (!confirm(t('tasks_confirm_delete'))) return
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
        <h1 className="text-2xl font-bold text-white">{t('tasks_title')}</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm"
        >
          <Plus className="w-4 h-4" /> {t('tasks_create')}
        </button>
      </div>

      {tasks.length === 0 ? (
        <div className="bg-gray-800 border border-dashed border-gray-600 rounded-xl p-10 text-center text-gray-500">
          {t('tasks_empty')}
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
                    <span>{t('tasks_recipients')} {task.recipients.length}{t('tasks_recipients_unit')}</span>
                    <span>{task.cron_expression ? `CRON: ${task.cron_expression}` : `${t('modal_once')}: ${task.send_once_at ? format(new Date(task.send_once_at), 'MM-dd HH:mm') : ''}`}</span>
                    <span>{t('tasks_runs')} {task.run_count}{t('tasks_runs_unit')}</span>
                    {task.last_run_at && <span>{t('tasks_last_run')}: {format(new Date(task.last_run_at), 'MM-dd HH:mm')}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => runNow(task.id)} title={t('tasks_run_now')} className="text-gray-400 hover:text-green-400">
                    <Play className="w-4 h-4" />
                  </button>
                  <button onClick={() => toggleStatus(task)} title={task.status === 'active' ? t('tasks_pause') : t('tasks_resume')} className="text-gray-400 hover:text-yellow-400">
                    <PauseCircle className="w-4 h-4" />
                  </button>
                  <button onClick={() => remove(task.id)} title={t('tasks_delete')} className="text-gray-400 hover:text-red-400">
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
