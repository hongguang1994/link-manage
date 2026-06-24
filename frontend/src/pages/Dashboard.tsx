import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { useModemStore } from '../store/modemStore'
import { getModemsApi } from '../api/modems'
import ModemCard from '../components/ModemCard'

export default function Dashboard() {
  const { modems } = useModemStore()
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  const connected = modems.filter(m => m.status === 'connected').length
  const total = modems.length

  useEffect(() => {
    getModemsApi().finally(() => setLoading(false))
  }, [])

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">SimNexus</h1>
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
          在线 {connected} / {total}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: '总设备', value: total, color: 'text-blue-400' },
          { label: '在线', value: connected, color: 'text-green-400' },
          { label: '离线', value: total - connected, color: 'text-gray-400' },
        ].map(s => (
          <div key={s.label} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
            <p className="text-gray-400 text-sm">{s.label}</p>
            <p className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Modem grid */}
      <div>
        <h2 className="text-lg font-semibold text-gray-200 mb-3">设备列表</h2>
        {loading ? (
          <div className="flex items-center gap-2 text-gray-400">
            <RefreshCw className="w-4 h-4 animate-spin" /> 加载中…
          </div>
        ) : modems.length === 0 ? (
          <div className="bg-gray-800 border border-dashed border-gray-600 rounded-xl p-10 text-center text-gray-500">
            未检测到 USB 调制解调器，请插入设备
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
