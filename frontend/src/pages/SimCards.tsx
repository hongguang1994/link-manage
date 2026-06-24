import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  RefreshCw, Wifi, WifiOff, AlertCircle, HelpCircle,
  ChevronRight, Upload, Download, MessageSquare,
} from 'lucide-react'
import clsx from 'clsx'
import { getModemDetailApi, getModemsApi, type Modem, type ModemDetail } from '../api/modems'
import { useModemStore } from '../store/modemStore'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number | null | undefined): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes, u = 0
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++ }
  return `${v.toFixed(u === 0 ? 0 : 1)} ${units[u]}`
}

function fmtDuration(seconds: number | null | undefined): string {
  if (!seconds) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (d > 0) return `${d}天${h}时`
  if (h > 0) return `${h}时${m}分`
  return `${m}分${seconds % 60}秒`
}

function techLabel(techs: string | null | undefined): string {
  if (!techs) return '—'
  const map: Record<string, string> = {
    lte: '4G', umts: '3G', gsm: '2G', 'hspa+': 'H+', hspa: 'H', nr: '5G',
  }
  return techs.split(',').map(t => map[t.trim().toLowerCase()] ?? t.trim().toUpperCase()).join('/')
}

function regLabel(state: string | null | undefined): string {
  if (!state) return '—'
  const map: Record<string, string> = {
    home: '归属网络', roaming: '漫游', searching: '搜索中',
    denied: '被拒绝', idle: '空闲',
  }
  return map[state.toLowerCase()] ?? state
}

// ── sub-components ────────────────────────────────────────────────────────────

const StatusBadge = ({ status }: { status: string }) => {
  const cfg = {
    connected:    { icon: Wifi,         cls: 'text-green-400',  label: '在线' },
    disconnected: { icon: WifiOff,      cls: 'text-gray-400',   label: '离线' },
    error:        { icon: AlertCircle,  cls: 'text-red-400',    label: '错误' },
    unknown:      { icon: HelpCircle,   cls: 'text-yellow-400', label: '未知' },
  }[status] ?? { icon: HelpCircle, cls: 'text-yellow-400', label: status }
  const Icon = cfg.icon
  return (
    <span className={clsx('inline-flex items-center gap-1 text-xs font-medium', cfg.cls)}>
      <Icon className="w-3.5 h-3.5" /> {cfg.label}
    </span>
  )
}

const SignalBar = ({ quality }: { quality: number }) => {
  const bars = Math.round((quality / 100) * 5)
  const color = bars >= 4 ? 'bg-green-400' : bars >= 2 ? 'bg-yellow-400' : 'bg-red-400'
  return (
    <div className="flex items-end gap-0.5 h-4">
      {[1,2,3,4,5].map(i => (
        <div key={i} className={clsx('w-1.5 rounded-sm', i <= bars ? color : 'bg-gray-600')}
          style={{ height: `${i * 20}%` }} />
      ))}
      <span className="ml-1 text-xs text-gray-300">{quality}%</span>
    </div>
  )
}

// ── main page ─────────────────────────────────────────────────────────────────

type Row = ModemDetail

export default function SimCards() {
  const navigate = useNavigate()
  const { modems } = useModemStore()
  const [rows, setRows] = useState<Row[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const base = await getModemsApi()
      const details = await Promise.all(
        base.data.map(m => getModemDetailApi(m.id).then(r => r.data).catch(() => ({
          ...m, sms_sent: 0, sms_received: 0, sms_today: 0,
        } as Row)))
      )
      setRows(details)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // re-sync signal/status from WS store without full reload
  useEffect(() => {
    if (modems.length === 0) return
    setRows(prev => prev.map(r => {
      const live = modems.find(m => m.id === r.id)
      if (!live) return r
      return { ...r, signal_quality: live.signal_quality, status: live.status as Row['status'], operator: live.operator }
    }))
  }, [modems])

  const handleRefresh = async () => {
    setRefreshing(true)
    await load()
    setRefreshing(false)
  }

  const connected = rows.filter(r => r.status === 'connected').length

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">SIM 卡管理</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            共 {rows.length} 张卡 · 在线 <span className="text-green-400">{connected}</span>
          </p>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="flex items-center gap-1.5 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors disabled:opacity-50"
        >
          <RefreshCw className={clsx('w-4 h-4', refreshing && 'animate-spin')} />
          刷新
        </button>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: '总 SIM 卡', value: rows.length, color: 'text-blue-400' },
          { label: '网络在线', value: connected, color: 'text-green-400' },
          { label: '今日短信', value: rows.reduce((a, r) => a + r.sms_today, 0), color: 'text-orange-400' },
          { label: '总上行流量', value: fmtBytes(rows.reduce((a, r) => a + (r.tx_bytes ?? 0), 0)), color: 'text-purple-400' },
        ].map(s => (
          <div key={s.label} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <p className="text-xs text-gray-400">{s.label}</p>
            <p className={clsx('text-2xl font-bold mt-1', s.color)}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 py-10 justify-center">
          <RefreshCw className="w-4 h-4 animate-spin" /> 加载中…
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-gray-800 border border-dashed border-gray-600 rounded-xl p-12 text-center text-gray-500">
          未检测到 SIM 卡，请插入 USB 4G 设备
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-800 text-gray-400 text-xs uppercase tracking-wider">
                {['SIM 卡', '状态', '运营商', '网络制式', '注册状态', '信号强度', '上行', '下行', '在线时长', '短信发送', '短信接收', '今日短信', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr
                  key={r.id}
                  onClick={() => navigate(`/modems/${r.id}`)}
                  className={clsx(
                    'border-t border-gray-700 cursor-pointer transition-colors hover:bg-gray-750',
                    i % 2 === 0 ? 'bg-gray-900' : 'bg-gray-850'
                  )}
                  style={{ background: i % 2 === 0 ? '#111827' : '#0f172a' }}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="font-medium text-white">{r.alias || `SIM ${r.id}`}</div>
                    <div className="text-xs text-gray-500 font-mono mt-0.5">{r.phone_number || r.imei || r.device_path || '—'}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap"><StatusBadge status={r.status} /></td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-200">{r.operator || '—'}</td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300 text-xs font-mono">
                      {techLabel(r.access_technologies)}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-300">{regLabel(r.registration_state)}</td>
                  <td className="px-4 py-3"><SignalBar quality={r.signal_quality} /></td>
                  <td className="px-4 py-3 whitespace-nowrap text-orange-300">
                    <span className="flex items-center gap-1"><Upload className="w-3 h-3" />{fmtBytes(r.tx_bytes)}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-purple-300">
                    <span className="flex items-center gap-1"><Download className="w-3 h-3" />{fmtBytes(r.rx_bytes)}</span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-300">{fmtDuration(r.connection_duration)}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-center text-gray-200">{r.sms_sent}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-center text-gray-200">{r.sms_received}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-center">
                    <span className={clsx('px-2 py-0.5 rounded-full text-xs font-medium',
                      r.sms_today > 0 ? 'bg-orange-500/20 text-orange-300' : 'text-gray-500')}>
                      {r.sms_today}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    <ChevronRight className="w-4 h-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
