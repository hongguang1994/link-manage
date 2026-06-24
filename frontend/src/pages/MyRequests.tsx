import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CheckCircle, XCircle, Clock, RefreshCw, Plus, X, Calendar } from 'lucide-react'
import clsx from 'clsx'
import { mySimRequestsApi, createSimRequestApi, type SimAccessRequest, type PermissionLevel } from '../api/simRequests'
import { getAvailableModemsApi, type Modem } from '../api/modems'

function StatusBadge({ status, isExpired }: { status: string; isExpired: boolean }) {
  if (status === 'approved' && isExpired) {
    return <span className="inline-flex items-center gap-1 text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded-full">已过期</span>
  }
  const cfg = {
    pending:  { cls: 'text-yellow-400 bg-yellow-400/10', icon: Clock,       label: '审批中' },
    approved: { cls: 'text-green-400 bg-green-400/10',  icon: CheckCircle,  label: '已批准' },
    rejected: { cls: 'text-red-400 bg-red-400/10',      icon: XCircle,      label: '已拒绝' },
  }[status] ?? { cls: 'text-gray-400 bg-gray-700', icon: Clock, label: status }
  const Icon = cfg.icon
  return (
    <span className={clsx('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full', cfg.cls)}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </span>
  )
}

function ApplyModal({
  modems,
  existingRequests,
  onClose,
  onDone,
}: {
  modems: Modem[]
  existingRequests: SimAccessRequest[]
  onClose: () => void
  onDone: () => void
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [reason, setReason] = useState('')
  const [requestedLevel, setRequestedLevel] = useState<PermissionLevel>('use')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Determine which modems to show: exclude those already approved or pending
  const pendingIds = new Set(existingRequests.filter(r => r.status === 'pending').map(r => r.modem_id))
  const now = new Date()
  const approvedIds = new Set(
    existingRequests
      .filter(r => r.status === 'approved' && (!r.expires_at || new Date(r.expires_at) > now))
      .map(r => r.modem_id)
  )

  const availableModems = modems.filter(m => !approvedIds.has(m.id))

  const toggle = (id: number) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)
  }

  const submit = async () => {
    if (selected.size === 0) { setError('请至少选择一张SIM卡'); return }
    setLoading(true)
    setError('')
    try {
      await Promise.all([...selected].map(id => createSimRequestApi(id, reason || undefined, requestedLevel)))
      onDone()
      onClose()
    } catch (e: any) {
      setError(e.response?.data?.detail || '提交失败')
    } finally {
      setLoading(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center" style={{ zIndex: 9999 }} onClick={onClose}>
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">申请SIM卡使用权限</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div>
          <p className="text-sm text-gray-400 mb-2">选择要申请的SIM卡（可多选）</p>
          {availableModems.length === 0 ? (
            <p className="text-gray-500 text-sm py-4 text-center">所有设备均已有权限或申请中</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {availableModems.map(m => {
                const isPending = pendingIds.has(m.id)
                return (
                  <label
                    key={m.id}
                    className={clsx(
                      'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                      isPending
                        ? 'border-gray-600 opacity-50 cursor-not-allowed'
                        : selected.has(m.id)
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-gray-600 hover:border-gray-500'
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(m.id)}
                      onChange={() => !isPending && toggle(m.id)}
                      disabled={isPending}
                      className="rounded border-gray-600 bg-gray-700 text-blue-500"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white font-medium">{m.alias || `SIM ${m.id}`}</p>
                      <p className="text-xs text-gray-400">{m.operator || '未知运营商'}</p>
                    </div>
                    {isPending && <span className="text-xs text-yellow-400">审批中</span>}
                  </label>
                )
              })}
            </div>
          )}
        </div>

        <div>
          <p className="text-sm text-gray-400 mb-2">申请权限级别</p>
          <div className="flex gap-3">
            <button
              onClick={() => setRequestedLevel('use')}
              className={clsx('flex-1 py-2 rounded-lg text-sm border transition-colors', requestedLevel === 'use'
                ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                : 'border-gray-600 text-gray-400 hover:border-gray-500')}
            >
              使用（发短信/定时任务）
            </button>
            <button
              onClick={() => setRequestedLevel('view')}
              className={clsx('flex-1 py-2 rounded-lg text-sm border transition-colors', requestedLevel === 'view'
                ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                : 'border-gray-600 text-gray-400 hover:border-gray-500')}
            >
              仅查看
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">申请理由（可选）</label>
          <textarea
            value={reason}
            onChange={e => setReason(e.target.value)}
            rows={2}
            placeholder="简单说明使用用途..."
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm resize-none"
          />
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white text-sm">取消</button>
          <button
            onClick={submit}
            disabled={loading || selected.size === 0 || availableModems.length === 0}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm"
          >
            {loading ? '提交中...' : `提交申请${selected.size > 0 ? `（${selected.size}张）` : ''}`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default function MyRequests() {
  const [requests, setRequests] = useState<SimAccessRequest[]>([])
  const [modems, setModems] = useState<Modem[]>([])
  const [loading, setLoading] = useState(true)
  const [showApply, setShowApply] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const [reqRes, modemRes] = await Promise.all([mySimRequestsApi(), getAvailableModemsApi()])
      setRequests(reqRes.data)
      setModems(modemRes.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const activeCount = requests.filter(r => r.status === 'approved' && !r.is_expired).length
  const pendingCount = requests.filter(r => r.status === 'pending').length

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">我的SIM卡权限</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            有效授权 <span className="text-green-400">{activeCount}</span> 张 · 待审批 <span className="text-yellow-400">{pendingCount}</span> 张
          </p>
        </div>
        <button
          onClick={() => setShowApply(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm"
        >
          <Plus className="w-4 h-4" /> 申请使用权限
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 py-10 justify-center">
          <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-gray-800 border border-dashed border-gray-600 rounded-xl p-12 text-center space-y-3">
          <p className="text-gray-500">暂无申请记录</p>
          <button
            onClick={() => setShowApply(true)}
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            立即申请 →
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {requests.map(r => (
            <div key={r.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-white">{r.modem_name}</span>
                    <StatusBadge status={r.status} isExpired={r.is_expired} />
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-700 text-gray-400">
                      {r.status === 'approved' && r.granted_level
                        ? (r.granted_level === 'use' ? '已授权使用' : '已授权查看')
                        : (r.requested_level === 'use' ? '申请使用' : '申请查看')}
                    </span>
                  </div>
                  {r.reason && <p className="text-sm text-gray-400">申请理由：{r.reason}</p>}
                  {r.admin_note && (
                    <p className="text-sm text-gray-400">
                      管理员备注：<span className="text-gray-300">{r.admin_note}</span>
                    </p>
                  )}
                  {r.status === 'approved' && !r.is_expired && (
                    <p className="text-xs text-gray-500 flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {r.expires_at ? `有效期至 ${r.expires_at.slice(0, 10)}` : '永久有效'}
                    </p>
                  )}
                  {r.is_expired && (
                    <p className="text-xs text-red-400">已过期（{r.expires_at?.slice(0, 10)}）</p>
                  )}
                </div>
                <p className="text-xs text-gray-500 shrink-0">{r.created_at?.slice(0, 10)}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {showApply && (
        <ApplyModal
          modems={modems}
          existingRequests={requests}
          onClose={() => setShowApply(false)}
          onDone={load}
        />
      )}
    </div>
  )
}
