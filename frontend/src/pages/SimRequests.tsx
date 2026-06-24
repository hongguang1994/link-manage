import { useEffect, useState } from 'react'
import { CheckCircle, XCircle, Clock, RefreshCw, CheckCheck, X, Calendar } from 'lucide-react'
import clsx from 'clsx'
import {
  listSimRequestsApi, approveSimRequestApi, rejectSimRequestApi, batchApproveApi,
  type SimAccessRequest,
} from '../api/simRequests'

type FilterStatus = 'pending' | 'approved' | 'rejected' | ''

function StatusBadge({ status, isExpired }: { status: string; isExpired: boolean }) {
  if (status === 'approved' && isExpired) {
    return <span className="inline-flex items-center gap-1 text-xs text-gray-400 bg-gray-700 px-2 py-0.5 rounded-full">已过期</span>
  }
  const cfg = {
    pending:  { cls: 'text-yellow-400 bg-yellow-400/10', icon: Clock,       label: '待审批' },
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

function ApproveModal({
  items,
  onClose,
  onDone,
}: {
  items: SimAccessRequest[]
  onClose: () => void
  onDone: () => void
}) {
  const [permanent, setPermanent] = useState(true)
  const [expiresAt, setExpiresAt] = useState('')
  const [adminNote, setAdminNote] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setLoading(true)
    try {
      const exp = permanent ? null : (expiresAt ? new Date(expiresAt).toISOString() : null)
      if (items.length === 1) {
        await approveSimRequestApi(items[0].id, exp, adminNote || undefined)
      } else {
        await batchApproveApi(items.map(i => i.id), exp, adminNote || undefined)
      }
      onDone()
      onClose()
    } catch {
      alert('操作失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">
            批准申请 {items.length > 1 ? `（${items.length} 条）` : ''}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        {items.length <= 3 && (
          <div className="space-y-1">
            {items.map(r => (
              <p key={r.id} className="text-sm text-gray-300">
                <span className="text-white font-medium">{r.username}</span> → {r.modem_name}
              </p>
            ))}
          </div>
        )}
        {items.length > 3 && (
          <p className="text-sm text-gray-300">共 {items.length} 条申请将被批准</p>
        )}

        <div>
          <p className="text-sm text-gray-400 mb-2">有效期</p>
          <div className="flex gap-3">
            <button
              onClick={() => setPermanent(true)}
              className={clsx('flex-1 py-2 rounded-lg text-sm border transition-colors', permanent
                ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                : 'border-gray-600 text-gray-400 hover:border-gray-500')}
            >
              永久有效
            </button>
            <button
              onClick={() => setPermanent(false)}
              className={clsx('flex-1 py-2 rounded-lg text-sm border transition-colors flex items-center justify-center gap-1.5', !permanent
                ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                : 'border-gray-600 text-gray-400 hover:border-gray-500')}
            >
              <Calendar className="w-3.5 h-3.5" /> 设置期限
            </button>
          </div>
          {!permanent && (
            <input
              type="date"
              value={expiresAt}
              onChange={e => setExpiresAt(e.target.value)}
              min={new Date().toISOString().slice(0, 10)}
              className="mt-2 w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
            />
          )}
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">备注（可选）</label>
          <input
            value={adminNote}
            onChange={e => setAdminNote(e.target.value)}
            placeholder="给用户的备注信息"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
          />
        </div>

        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white text-sm">取消</button>
          <button
            onClick={submit}
            disabled={loading || (!permanent && !expiresAt)}
            className="px-4 py-2 bg-green-600 hover:bg-green-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg text-sm"
          >
            {loading ? '处理中...' : '确认批准'}
          </button>
        </div>
      </div>
    </div>
  )
}

function RejectModal({
  item,
  onClose,
  onDone,
}: {
  item: SimAccessRequest
  onClose: () => void
  onDone: () => void
}) {
  const [adminNote, setAdminNote] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async () => {
    setLoading(true)
    try {
      await rejectSimRequestApi(item.id, adminNote || undefined)
      onDone()
      onClose()
    } catch {
      alert('操作失败')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-md space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">拒绝申请</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        <p className="text-sm text-gray-300">
          拒绝 <span className="text-white font-medium">{item.username}</span> 对 {item.modem_name} 的申请
        </p>
        <div>
          <label className="block text-sm text-gray-400 mb-1">拒绝原因（可选）</label>
          <input
            value={adminNote}
            onChange={e => setAdminNote(e.target.value)}
            placeholder="给用户的说明"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
          />
        </div>
        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white text-sm">取消</button>
          <button
            onClick={submit}
            disabled={loading}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:bg-gray-700 text-white rounded-lg text-sm"
          >
            {loading ? '处理中...' : '确认拒绝'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SimRequests() {
  const [requests, setRequests] = useState<SimAccessRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterStatus>('pending')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [approveItems, setApproveItems] = useState<SimAccessRequest[] | null>(null)
  const [rejectItem, setRejectItem] = useState<SimAccessRequest | null>(null)

  const load = async () => {
    setLoading(true)
    setSelected(new Set())
    try {
      const res = await listSimRequestsApi(filter || undefined)
      setRequests(res.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [filter])

  const pending = requests.filter(r => r.status === 'pending')
  const allPendingSelected = pending.length > 0 && pending.every(r => selected.has(r.id))

  const toggleAll = () => {
    if (allPendingSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(pending.map(r => r.id)))
    }
  }

  const toggle = (id: number) => {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)
  }

  const selectedItems = requests.filter(r => selected.has(r.id))

  const FILTERS: { key: FilterStatus; label: string }[] = [
    { key: 'pending', label: '待审批' },
    { key: 'approved', label: '已批准' },
    { key: 'rejected', label: '已拒绝' },
    { key: '', label: '全部' },
  ]

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">SIM卡申请审批</h1>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} /> 刷新
        </button>
      </div>

      {/* filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={clsx('px-3 py-1.5 rounded-lg text-sm transition-colors', filter === f.key
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-white')}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* batch actions */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-blue-900/30 border border-blue-500/30 rounded-xl px-4 py-3">
          <span className="text-sm text-blue-300">已选 {selected.size} 条</span>
          <button
            onClick={() => setApproveItems(selectedItems)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-500 text-white rounded-lg text-sm"
          >
            <CheckCheck className="w-3.5 h-3.5" /> 批量批准
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="text-sm text-gray-400 hover:text-white"
          >
            取消选择
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 py-10 justify-center">
          <RefreshCw className="w-4 h-4 animate-spin" /> 加载中...
        </div>
      ) : requests.length === 0 ? (
        <div className="bg-gray-800 border border-dashed border-gray-600 rounded-xl p-12 text-center text-gray-500">
          暂无申请记录
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                <th className="px-4 py-3 text-left">
                  {filter === 'pending' && (
                    <input type="checkbox" checked={allPendingSelected} onChange={toggleAll}
                      className="rounded border-gray-600 bg-gray-700 text-blue-500" />
                  )}
                </th>
                <th className="px-4 py-3 text-left">用户</th>
                <th className="px-4 py-3 text-left">申请设备</th>
                <th className="px-4 py-3 text-left">申请理由</th>
                <th className="px-4 py-3 text-left">状态</th>
                <th className="px-4 py-3 text-left">有效期</th>
                <th className="px-4 py-3 text-left">申请时间</th>
                <th className="px-4 py-3 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {requests.map((r, i) => (
                <tr key={r.id} className={clsx('border-t border-gray-700 transition-colors hover:bg-gray-700/50',
                  i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-850',
                  selected.has(r.id) && 'bg-blue-900/20')}>
                  <td className="px-4 py-3">
                    {r.status === 'pending' && (
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)}
                        className="rounded border-gray-600 bg-gray-700 text-blue-500" />
                    )}
                  </td>
                  <td className="px-4 py-3 font-medium text-white">{r.username}</td>
                  <td className="px-4 py-3 text-gray-200">{r.modem_name}</td>
                  <td className="px-4 py-3 text-gray-400 max-w-xs truncate">{r.reason || '—'}</td>
                  <td className="px-4 py-3"><StatusBadge status={r.status} isExpired={r.is_expired} /></td>
                  <td className="px-4 py-3 text-gray-300 text-xs">
                    {r.status === 'approved' && !r.is_expired
                      ? (r.expires_at ? r.expires_at.slice(0, 10) : '永久')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{r.created_at?.slice(0, 16).replace('T', ' ')}</td>
                  <td className="px-4 py-3">
                    {r.status === 'pending' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => setApproveItems([r])}
                          className="flex items-center gap-1 px-2.5 py-1 bg-green-600/20 hover:bg-green-600 text-green-400 hover:text-white rounded-lg text-xs transition-colors"
                        >
                          <CheckCircle className="w-3.5 h-3.5" /> 批准
                        </button>
                        <button
                          onClick={() => setRejectItem(r)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white rounded-lg text-xs transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" /> 拒绝
                        </button>
                      </div>
                    )}
                    {r.admin_note && (
                      <span className="text-xs text-gray-500 italic">{r.admin_note}</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {approveItems && (
        <ApproveModal items={approveItems} onClose={() => setApproveItems(null)} onDone={load} />
      )}
      {rejectItem && (
        <RejectModal item={rejectItem} onClose={() => setRejectItem(null)} onDone={load} />
      )}
    </div>
  )
}
