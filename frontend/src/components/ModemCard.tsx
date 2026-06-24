import { Wifi, WifiOff, AlertCircle, HelpCircle } from 'lucide-react'
import { useT } from '../i18n'

interface Props {
  modem: {
    id: number
    alias: string | null
    device_path: string
    operator: string | null
    signal_quality: number
    status: string
    phone_number: string | null
  }
  onClick?: () => void
}

const STATUS_CFG = {
  connected:    { icon: Wifi,         color: 'text-emerald-400', dot: '#34d399', glow: 'rgba(52,211,153,0.2)',  label: '在线' },
  disconnected: { icon: WifiOff,      color: 'text-slate-500',   dot: '#64748b', glow: 'rgba(100,116,139,0.1)', label: '离线' },
  error:        { icon: AlertCircle,  color: 'text-red-400',     dot: '#f87171', glow: 'rgba(248,113,113,0.2)', label: '故障' },
  unknown:      { icon: HelpCircle,   color: 'text-amber-400',   dot: '#fbbf24', glow: 'rgba(251,191,36,0.2)',  label: '未知' },
} as const

const SignalBars = ({ quality }: { quality: number }) => {
  const bars = Math.round((quality / 100) * 5)
  const colors = ['#f87171','#fb923c','#facc15','#4ade80','#34d399']
  return (
    <div className="flex items-end gap-0.5 h-4">
      {[1,2,3,4,5].map(i => (
        <div key={i} className="w-1.5 rounded-sm transition-all"
          style={{ height: `${i * 20}%`, background: i <= bars ? (colors[bars - 1] ?? '#34d399') : 'rgba(255,255,255,0.08)' }} />
      ))}
    </div>
  )
}

export default function ModemCard({ modem, onClick }: Props) {
  const t = useT()
  const cfg = STATUS_CFG[modem.status as keyof typeof STATUS_CFG] ?? STATUS_CFG.unknown
  const Icon = cfg.icon
  return (
    <div
      onClick={onClick}
      className="relative overflow-hidden rounded-2xl p-4 cursor-pointer transition-all duration-300 hover:-translate-y-1 group"
      style={{
        background: 'rgba(13,27,48,0.75)',
        backdropFilter: 'blur(20px)',
        border: `1px solid ${cfg.glow}`,
        boxShadow: `0 0 20px ${cfg.glow}, inset 0 1px 0 rgba(255,255,255,0.04)`,
      }}>
      {/* Top glow line */}
      <div className="absolute top-0 left-4 right-4 h-px opacity-50"
        style={{ background: `linear-gradient(90deg, transparent, ${cfg.dot}, transparent)` }} />

      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-white group-hover:text-blue-200 transition-colors">
            {modem.alias || `SIM ${modem.id}`}
          </h3>
          <p className="text-xs text-blue-300/40 mt-0.5 truncate max-w-[120px]">{modem.device_path}</p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Icon className={`w-4 h-4 ${cfg.color}`} style={{ filter: `drop-shadow(0 0 4px ${cfg.dot})` }} />
          <span className="text-[10px]" style={{ color: cfg.dot }}>{cfg.label}</span>
        </div>
      </div>

      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between">
          <span className="text-blue-200/40">{t('card_operator')}</span>
          <span className="text-blue-100/80">{modem.operator || t('none')}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-blue-200/40">{t('card_phone')}</span>
          <span className="text-blue-100/80">{modem.phone_number || t('card_phone_unknown')}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-blue-200/40">{t('card_signal')}</span>
          <SignalBars quality={modem.signal_quality} />
        </div>
      </div>
    </div>
  )
}
