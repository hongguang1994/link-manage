import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, Wifi, WifiOff, AlertCircle, HelpCircle,
  Signal, Radio, Clock, MessageSquare, Upload, Download, Pencil, Check, X,
} from 'lucide-react'
import clsx from 'clsx'
import { getModemDetailApi, updateModemApi, refreshModemApi, type ModemDetail } from '../api/modems'

// ── helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(bytes: number | null | undefined): string {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let u = 0
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u++ }
  return `${v.toFixed(u === 0 ? 0 : 1)} ${units[u]}`
}

function fmtDuration(seconds: number | null | undefined): string {
  if (!seconds) return '—'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (d > 0) return `${d}天 ${h}小时`
  if (h > 0) return `${h}小时 ${m}分钟`
  if (m > 0) return `${m}分钟 ${s}秒`
  return `${s}秒`
}

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('zh-CN')
}

function techLabel(techs: string | null | undefined): string {
  if (!techs) return '—'
  const map: Record<string, string> = {
    lte: '4G LTE', umts: '3G UMTS', gsm: '2G GSM',
    hspa: '3G HSPA', 'hspa+': '3G HSPA+', nr: '5G NR',
  }
  return techs.split(',').map(t => map[t.trim().toLowerCase()] ?? t.trim().toUpperCase()).join(' / ')
}

function regLabel(state: string | null | undefined): string {
  if (!state) return '—'
  const map: Record<string, string> = {
    home: '已注册（归属网络）', roaming: '已注册（漫游）',
    searching: '搜索网络中', denied: '注册被拒', idle: '空闲',
  }
  return map[state.toLowerCase()] ?? state
}

// ── sub-components ────────────────────────────────────────────────────────────

const StatusBadge = ({ status }: { status: string }) => {
  const cfg = {
    connected: { icon: Wifi, cls: 'bg-green-500/20 text-green-400 border-green-500/30', label: '在线' },
    disconnected: { icon: WifiOff, cls: 'bg-gray-500/20 text-gray-400 border-gray-500/30', label: '离线' },
    error: { icon: AlertCircle, cls: 'bg-red-500/20 text-red-400 border-red-500/30', label: '错误' },
    unknown: { icon: HelpCircle, cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', label: '未知' },
  }[status] ?? { icon: HelpCircle, cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', label: status }
  const Icon = cfg.icon
  return (
    <span className={clsx('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border', cfg.cls)}>
      <Icon className="w-3 h-3" /> {cfg.label}
    </span>
  )
}

const SignalBars = ({ quality }: { quality: number }) => {
  const bars = Math.round((quality / 100) * 5)
  const color = bars >= 4 ? 'bg-green-400' : bars >= 2 ? 'bg-yellow-400' : 'bg-red-400'
  return (
    <div className="flex items-end gap-1 h-5">
      {[1, 2, 3, 4, 5].map(i => (
        <div key={i} className={clsx('w-2 rounded-sm', i <= bars ? color : 'bg-gray-600')}
          style={{ height: `${i * 20}%` }} />
      ))}
      <span className="ml-1 text-sm text-gray-300">{quality}%</span>
    </div>
  )
}

interface InfoRowProps { label: string; value: React.ReactNode }
const InfoRow = ({ label, value }: InfoRowProps) => (
  <div className="flex items-center justify-between py-2.5 border-b border-gray-700/50 last:border-0">
    <span className="text-sm text-gray-400">{label}</span>
    <span className="text-sm text-gray-100 font-medium text-right max-w-[60%]">{value}</span>
  </div>
)

interface StatCardProps { icon: React.ElementType; label: string; value: string; color?: string }
const StatCard = ({ icon: Icon, label, value, color = 'text-blue-400' }: StatCardProps) => (
  <div className="bg-gray-800 rounded-xl p-4 border border-gray-700">
    <div className={clsx('mb-2', color)}><Icon className="w-5 h-5" /></div>
    <p className="text-2xl font-bold text-white">{value}</p>
    <p className="text-xs text-gray-400 mt-1">{label}</p>
  </div>
)

// ── main page ─────────────────────────────────────────────────────────────────

export default function SimDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [modem, setModem] = useState<ModemDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [editingAlias, setEditingAlias] = useState(false)
  const [alias, setAlias] = useState('')

  const load = () => {
    if (!id) return
    setLoading(true)
    getModemDetailApi(Number(id))
      .then(r => { setModem(r.data); setAlias(r.data.alias ?? '') })
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [id])

  const handleRefresh = async () => {
    if (!id) return
    setRefreshing(true)
    try {
      await refreshModemApi(Number(id))
      await load()
    } finally {
      setRefreshing(false)
    }
  }

  const saveAlias = async () => {
    if (!id) return
    await updateModemApi(Number(id), { alias })
    setEditingAlias(false)
    load()
  }

  if (loading) return (
    <div className="p-6 flex items-center gap-2 text-gray-400">
      <RefreshCw className="w-4 h-4 animate-spin" /> 加载中…
    </div>
  )

  if (!modem) return (
    <div className="p-6 text-red-400">未找到该 SIM 卡</div>
  )

  const displayName = modem.alias || `SIM ${modem.id}`

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(-1)}
          className="p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          {editingAlias ? (
            <div className="flex items-center gap-2">
              <input
                className="bg-gray-800 border border-gray-600 rounded-lg px-3 py-1.5 text-white text-lg font-bold focus:outline-none focus:border-blue-500 w-48"
                value={alias}
                onChange={e => setAlias(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && saveAlias()}
                autoFocus
              />
              <button onClick={saveAlias} className="p-1.5 rounded text-green-400 hover:bg-gray-800"><Check className="w-4 h-4" /></button>
              <button onClick={() => setEditingAlias(false)} className="p-1.5 rounded text-gray-400 hover:bg-gray-800"><X className="w-4 h-4" /></button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white truncate">{displayName}</h1>
              <button onClick={() => setEditingAlias(true)}
                className="p-1 rounded text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-colors">
                <Pencil className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <p className="text-sm text-gray-500 mt-0.5">{modem.device_path || modem.mm_object_path || '—'}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={modem.status} />
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw className={clsx('w-4 h-4', refreshing && 'animate-spin')} />
            刷新
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={Signal} label="信号强度" value={`${modem.signal_quality}%`} color="text-green-400" />
        <StatCard icon={Clock} label="在线时长" value={fmtDuration(modem.connection_duration)} color="text-blue-400" />
        <StatCard icon={Upload} label="上行流量" value={fmtBytes(modem.tx_bytes)} color="text-orange-400" />
        <StatCard icon={Download} label="下行流量" value={fmtBytes(modem.rx_bytes)} color="text-purple-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SIM / 设备信息 */}
        <section className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">SIM 卡信息</h2>
          <InfoRow label="手机号码" value={modem.phone_number || '未知'} />
          <InfoRow label="IMEI" value={<span className="font-mono text-xs">{modem.imei || '—'}</span>} />
          <InfoRow label="运营商" value={modem.operator || '—'} />
          <InfoRow label="注册状态" value={regLabel(modem.registration_state)} />
          <InfoRow label="网络制式" value={techLabel(modem.access_technologies)} />
          <InfoRow label="信号强度" value={<SignalBars quality={modem.signal_quality} />} />
        </section>

        {/* 设备硬件 */}
        <section className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">设备信息</h2>
          <InfoRow label="制造商" value={modem.manufacturer || '—'} />
          <InfoRow label="型号" value={modem.model || '—'} />
          <InfoRow label="设备路径" value={<span className="font-mono text-xs">{modem.device_path || '—'}</span>} />
          <InfoRow label="D-Bus 路径" value={<span className="font-mono text-xs truncate block max-w-full">{modem.mm_object_path || '—'}</span>} />
          <InfoRow label="首次接入" value={fmtTime(modem.created_at)} />
          <InfoRow label="最后在线" value={fmtTime(modem.last_seen)} />
        </section>

        {/* 短信统计 */}
        <section className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">短信统计</h2>
          <div className="grid grid-cols-3 gap-4 mt-2">
            {[
              { label: '已发送', value: modem.sms_sent, color: 'text-blue-400', icon: Upload },
              { label: '已接收', value: modem.sms_received, color: 'text-green-400', icon: Download },
              { label: '今日', value: modem.sms_today, color: 'text-orange-400', icon: MessageSquare },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className={clsx('text-3xl font-bold', s.color)}>{s.value}</p>
                <p className="text-xs text-gray-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* 流量详情 */}
        <section className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">流量统计</h2>
          <InfoRow label="上行（发送）" value={fmtBytes(modem.tx_bytes)} />
          <InfoRow label="下行（接收）" value={fmtBytes(modem.rx_bytes)} />
          <InfoRow label="总计" value={fmtBytes((modem.tx_bytes ?? 0) + (modem.rx_bytes ?? 0))} />
          <InfoRow label="连接时长" value={fmtDuration(modem.connection_duration)} />
        </section>
      </div>
    </div>
  )
}
