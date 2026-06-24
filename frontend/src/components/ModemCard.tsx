import { Signal, Wifi, WifiOff, AlertCircle, HelpCircle } from 'lucide-react'
import clsx from 'clsx'
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

const StatusIcon = ({ status }: { status: string }) => {
  switch (status) {
    case 'connected': return <Wifi className="w-4 h-4 text-green-400" />
    case 'disconnected': return <WifiOff className="w-4 h-4 text-gray-400" />
    case 'error': return <AlertCircle className="w-4 h-4 text-red-400" />
    default: return <HelpCircle className="w-4 h-4 text-yellow-400" />
  }
}

const SignalBars = ({ quality }: { quality: number }) => {
  const bars = Math.round((quality / 100) * 5)
  return (
    <div className="flex items-end gap-0.5 h-4">
      {[1,2,3,4,5].map(i => (
        <div
          key={i}
          className={clsx('w-1.5 rounded-sm', i <= bars ? 'bg-green-400' : 'bg-gray-600')}
          style={{ height: `${i * 20}%` }}
        />
      ))}
    </div>
  )
}

export default function ModemCard({ modem, onClick }: Props) {
  const t = useT()
  return (
    <div
      onClick={onClick}
      className="bg-gray-800 border border-gray-700 rounded-xl p-4 cursor-pointer hover:border-blue-500 transition-colors"
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-white">
            {modem.alias || `SIM ${modem.id}`}
          </h3>
          <p className="text-xs text-gray-400 mt-0.5">{modem.device_path}</p>
        </div>
        <StatusIcon status={modem.status} />
      </div>
      <div className="space-y-1.5">
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">{t('card_operator')}</span>
          <span className="text-gray-200">{modem.operator || t('none')}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">{t('card_phone')}</span>
          <span className="text-gray-200">{modem.phone_number || t('card_phone_unknown')}</span>
        </div>
        <div className="flex justify-between text-sm items-center">
          <span className="text-gray-400">{t('card_signal')}</span>
          <SignalBars quality={modem.signal_quality} />
        </div>
      </div>
    </div>
  )
}
