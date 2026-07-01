import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  ArrowLeft, RefreshCw, Wifi, WifiOff, AlertCircle, HelpCircle,
  Signal, Radio, Clock, MessageSquare, Upload, Download, Pencil, Check, X,
} from 'lucide-react'
import clsx from 'clsx'
import { getModemDetailApi, updateModemApi, refreshModemApi, type ModemDetail } from '../api/modems'
import { useT } from '../i18n'
import { useLangStore } from '../store/langStore'

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
  const s = seconds % 60
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

function techLabel(techs: string | null | undefined): string {
  if (!techs) return '—'
  const map: Record<string, string> = {
    lte: '4G LTE', umts: '3G UMTS', gsm: '2G GSM',
    hspa: '3G HSPA', 'hspa+': '3G HSPA+', nr: '5G NR',
  }
  return techs.split(',').map(t => map[t.trim().toLowerCase()] ?? t.trim().toUpperCase()).join(' / ')
}

const StatusBadge = ({ status, t }: { status: string; t: ReturnType<typeof useT> }) => {
  const cfg = {
    connected:    { icon: Wifi,        cls: 'bg-green-500/20 text-green-400 border-green-500/30',    label: t('status_connected') },
    disconnected: { icon: WifiOff,     cls: 'bg-gray-500/20 text-gray-400 border-gray-500/30',       label: t('status_disconnected') },
    error:        { icon: AlertCircle, cls: 'bg-red-500/20 text-red-400 border-red-500/30',          label: t('status_error') },
    unknown:      { icon: HelpCircle,  cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30', label: t('status_unknown') },
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

export default function SimDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const t = useT()
  const lang = useLangStore(s => s.lang)
  const [modem, setModem] = useState<ModemDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [editingAlias, setEditingAlias] = useState(false)
  const [alias, setAlias] = useState('')

  const fmtTime = (iso: string | null | undefined) => {
    if (!iso) return t('none')
    return new Date(iso).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')
  }

  const regLabel = (state: string | null | undefined): string => {
    if (!state) return t('none')
    const map: Record<string, string> = {
      home: t('detail_reg_home'), roaming: t('detail_reg_roaming'),
      searching: t('detail_reg_searching'), denied: t('detail_reg_denied'), idle: t('detail_reg_idle'),
    }
    return map[state.toLowerCase()] ?? state
  }

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
    try { await refreshModemApi(Number(id)); await load() }
    finally { setRefreshing(false) }
  }

  const saveAlias = async () => {
    if (!id) return
    await updateModemApi(Number(id), { alias })
    setEditingAlias(false)
    load()
  }

  if (loading) return (
    <div className="p-6 flex items-center gap-2 text-gray-400">
      <RefreshCw className="w-4 h-4 animate-spin" /> {t('loading')}
    </div>
  )

  if (!modem) return <div className="p-6 text-red-400">{t('detail_not_found')}</div>

  const displayName = modem.alias || `SIM ${modem.id}`

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
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
                placeholder={t('detail_alias_ph')}
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
          <p className="text-sm text-gray-500 mt-0.5">{modem.device_path || modem.mm_object_path || t('none')}</p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={modem.status} t={t} />
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            <RefreshCw className={clsx('w-4 h-4', refreshing && 'animate-spin')} />
            {refreshing ? t('detail_refreshing') : t('detail_refresh')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard icon={Signal} label={t('detail_signal')} value={`${modem.signal_quality}%`} color="text-green-400" />
        <StatCard icon={Clock} label={t('detail_duration')} value={fmtDuration(modem.connection_duration)} color="text-blue-400" />
        <StatCard icon={Upload} label={t('detail_upload')} value={fmtBytes(modem.tx_bytes)} color="text-orange-400" />
        <StatCard icon={Download} label={t('detail_download')} value={fmtBytes(modem.rx_bytes)} color="text-purple-400" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">{t('detail_sim_info')}</h2>
          <InfoRow label={t('detail_phone')} value={modem.phone_number || t('unknown')} />
          <InfoRow label="IMSI" value={<span className="font-mono text-xs">{(modem as any).imsi || t('none')}</span>} />
          <InfoRow label="ICCID" value={<span className="font-mono text-xs">{(modem as any).iccid || t('none')}</span>} />
          <InfoRow label={t('detail_imei')} value={<span className="font-mono text-xs">{modem.imei || t('none')}</span>} />
          <InfoRow label={t('detail_sim_operator')} value={
            (modem as any).sim_operator_name
              ? `${(modem as any).sim_operator_name}${(modem as any).sim_operator_code ? ` (${(modem as any).sim_operator_code})` : ''}`
              : t('none')
          } />
          <InfoRow label={t('detail_operator')} value={modem.operator || t('none')} />
          <InfoRow label={t('detail_reg')} value={regLabel(modem.registration_state)} />
          <InfoRow label={t('detail_tech')} value={techLabel(modem.access_technologies)} />
          <InfoRow label={t('detail_signal')} value={<SignalBars quality={modem.signal_quality} />} />
        </section>

        <section className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">{t('detail_hardware')}</h2>
          <InfoRow label={t('detail_manufacturer')} value={modem.manufacturer || t('none')} />
          <InfoRow label={t('detail_model')} value={modem.model || t('none')} />
          <InfoRow label={t('detail_firmware')} value={<span className="font-mono text-xs">{(modem as any).firmware_revision || t('none')}</span>} />
          <InfoRow label={t('detail_hw_rev')} value={(modem as any).hardware_revision || t('none')} />
          <InfoRow label={t('detail_plugin')} value={(modem as any).plugin || t('none')} />
          <InfoRow label={t('detail_device')} value={<span className="font-mono text-xs">{modem.device_path || t('none')}</span>} />
          <InfoRow label={t('detail_conn_since')} value={fmtTime(modem.created_at)} />
          <InfoRow label={t('detail_last_seen')} value={fmtTime(modem.last_seen)} />
        </section>

        <section className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">{t('detail_network_mode')}</h2>
          <InfoRow label={t('detail_current_mode')} value={(modem as any).current_modes || t('none')} />
          <InfoRow label={t('detail_ports')} value={<span className="font-mono text-xs">{(modem as any).ports || t('none')}</span>} />
        </section>

        <section className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">{t('detail_bands')}</h2>
          <div className="flex flex-wrap gap-2 mt-1">
            {((modem as any).current_bands || '').split(',').filter(Boolean).map((b: string) => (
              <span key={b} className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs rounded-full font-mono">{b.trim()}</span>
            ))}
            {!(modem as any).current_bands && <span className="text-sm text-gray-500">{t('none')}</span>}
          </div>
        </section>

        <section className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">{t('detail_sms_stats')}</h2>
          <div className="grid grid-cols-3 gap-4 mt-2">
            {[
              { label: t('detail_sms_sent'), value: modem.sms_sent, color: 'text-blue-400', icon: Upload },
              { label: t('detail_sms_recv'), value: modem.sms_received, color: 'text-green-400', icon: Download },
              { label: t('detail_sms_today'), value: modem.sms_today, color: 'text-orange-400', icon: MessageSquare },
            ].map(s => (
              <div key={s.label} className="text-center">
                <p className={clsx('text-3xl font-bold', s.color)}>{s.value}</p>
                <p className="text-xs text-gray-400 mt-1">{s.label}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-gray-800 rounded-xl border border-gray-700 p-4">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">{t('detail_traffic')}</h2>
          <InfoRow label={t('detail_tx')} value={fmtBytes(modem.tx_bytes)} />
          <InfoRow label={t('detail_rx')} value={fmtBytes(modem.rx_bytes)} />
          <InfoRow label="Total" value={fmtBytes((modem.tx_bytes ?? 0) + (modem.rx_bytes ?? 0))} />
          <InfoRow label={t('detail_duration')} value={fmtDuration(modem.connection_duration)} />
        </section>
      </div>
    </div>
  )
}
