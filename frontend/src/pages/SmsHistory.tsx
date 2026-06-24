import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { getMessagesApi, SmsMessage } from '../api/sms'
import { useModemStore } from '../store/modemStore'
import { useT } from '../i18n'
import clsx from 'clsx'

const statusColors: Record<string, string> = {
  sent: 'text-green-400',
  received: 'text-blue-400',
  failed: 'text-red-400',
  pending: 'text-yellow-400',
}

export default function SmsHistory() {
  const modems = useModemStore(s => s.modems)
  const t = useT()
  const [messages, setMessages] = useState<SmsMessage[]>([])
  const [filterModem, setFilterModem] = useState<number | ''>('')
  const [filterDir, setFilterDir] = useState<string>('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    getMessagesApi({
      modem_id: filterModem || undefined,
      direction: filterDir || undefined,
      limit: 100,
    })
      .then(r => setMessages(r.data))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [filterModem, filterDir])

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold text-white">{t('hist_title')}</h1>

      <div className="flex gap-3">
        <select
          value={filterModem}
          onChange={e => setFilterModem(e.target.value ? Number(e.target.value) : '')}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
        >
          <option value="">{t('hist_all_devices')}</option>
          {modems.map(m => <option key={m.id} value={m.id}>{m.alias || `SIM ${m.id}`}</option>)}
        </select>
        <select
          value={filterDir}
          onChange={e => setFilterDir(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
        >
          <option value="">{t('hist_all_dir')}</option>
          <option value="inbound">{t('hist_inbound')}</option>
          <option value="outbound">{t('hist_outbound')}</option>
        </select>
        <button onClick={load} className="ml-auto text-sm text-blue-400 hover:text-blue-300">{t('refresh')}</button>
      </div>

      <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">{t('loading')}</div>
        ) : messages.length === 0 ? (
          <div className="p-8 text-center text-gray-500">{t('hist_empty')}</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-gray-700 text-gray-400">
              <tr>
                <th className="px-4 py-3 text-left">{t('hist_col_dir')}</th>
                <th className="px-4 py-3 text-left">{t('hist_col_phone')}</th>
                <th className="px-4 py-3 text-left">{t('hist_col_content')}</th>
                <th className="px-4 py-3 text-left">{t('hist_col_status')}</th>
                <th className="px-4 py-3 text-left">{t('hist_col_time')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {messages.map(m => (
                <tr key={m.id} className="hover:bg-gray-750">
                  <td className="px-4 py-3">
                    {m.direction === 'inbound'
                      ? <ArrowDownLeft className="w-4 h-4 text-blue-400" />
                      : <ArrowUpRight className="w-4 h-4 text-green-400" />
                    }
                  </td>
                  <td className="px-4 py-3 text-gray-200">{m.phone_number}</td>
                  <td className="px-4 py-3 text-gray-300 max-w-xs truncate">{m.content}</td>
                  <td className={clsx('px-4 py-3', statusColors[m.status])}>{m.status}</td>
                  <td className="px-4 py-3 text-gray-400">
                    {format(new Date(m.created_at), 'MM-dd HH:mm')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
