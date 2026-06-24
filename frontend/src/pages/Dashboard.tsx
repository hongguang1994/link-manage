import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Cpu, Wifi, WifiOff } from 'lucide-react'
import { useModemStore } from '../store/modemStore'
import { getModemsApi } from '../api/modems'
import ModemCard from '../components/ModemCard'
import { useT } from '../i18n'

export default function Dashboard() {
  const { modems } = useModemStore()
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()
  const t = useT()

  const connected = modems.filter(m => m.status === 'connected').length
  const total = modems.length
  const offline = total - connected

  useEffect(() => {
    getModemsApi().finally(() => setLoading(false))
  }, [])

  const stats = [
    { label: t('dash_total'),   value: total,     icon: Cpu,    color: 'text-blue-400',  glow: 'rgba(59,130,246,0.3)',  border: 'rgba(59,130,246,0.2)' },
    { label: t('dash_online'),  value: connected, icon: Wifi,   color: 'text-emerald-400', glow: 'rgba(52,211,153,0.3)', border: 'rgba(52,211,153,0.2)' },
    { label: t('dash_offline'), value: offline,   icon: WifiOff, color: 'text-slate-400', glow: 'rgba(148,163,184,0.15)', border: 'rgba(148,163,184,0.1)' },
  ]

  return (
    <div className="p-6 space-y-6 animate-fade-up">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white text-glow">{t('dash_title')}</h1>
          <p className="text-sm text-blue-300/60 mt-0.5">
            {connected > 0
              ? <><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 align-middle" style={{ boxShadow: '0 0 6px #34d399' }} />{connected} {t('dash_online')}</>
              : <span className="text-slate-500">暂无在线设备</span>}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {stats.map(s => {
          const Icon = s.icon
          return (
            <div key={s.label}
              className="relative overflow-hidden rounded-2xl p-5 transition-all duration-300 hover:-translate-y-0.5"
              style={{
                background: 'rgba(13,27,48,0.7)',
                backdropFilter: 'blur(20px)',
                border: `1px solid ${s.border}`,
                boxShadow: `0 0 32px ${s.glow}, inset 0 1px 0 rgba(255,255,255,0.04)`,
              }}>
              {/* Shimmer overlay */}
              <div className="absolute inset-0 animate-shimmer pointer-events-none" />
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs text-blue-200/50 uppercase tracking-wider">{s.label}</p>
                  <p className={`text-4xl font-bold mt-2 ${s.color}`}
                    style={{ textShadow: `0 0 20px ${s.glow}` }}>
                    {s.value}
                  </p>
                </div>
                <div className="p-2.5 rounded-xl" style={{ background: `${s.glow}`, border: `1px solid ${s.border}` }}>
                  <Icon className={`w-5 h-5 ${s.color}`} />
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Device list */}
      <div>
        <h2 className="text-sm font-medium text-blue-200/70 uppercase tracking-wider mb-4">{t('dash_device_list')}</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-blue-300/50 py-10 justify-center">
            <RefreshCw className="w-4 h-4 animate-spin" /> {t('loading')}
          </div>
        ) : modems.length === 0 ? (
          <div className="rounded-2xl p-12 text-center border border-dashed border-blue-500/15 text-blue-300/30">
            {t('dash_no_device')}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {modems.map(m => (
              <ModemCard key={m.id} modem={m} onClick={() => navigate(`/modems/${m.id}`)} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
