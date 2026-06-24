import { useEffect, useState, useCallback } from 'react'
import { format } from 'date-fns'
import { ArrowDownLeft, ArrowUpRight, Copy, Check } from 'lucide-react'
import { getMessagesApi, SmsMessage } from '../api/sms'
import { useModemStore } from '../store/modemStore'
import { useT } from '../i18n'
import clsx from 'clsx'

function fallbackCopy(text: string, done: () => void) {
  const el = document.createElement('textarea')
  el.value = text
  el.style.cssText = 'position:fixed;top:-999px;left:-999px'
  document.body.appendChild(el)
  el.focus()
  el.select()
  try { document.execCommand('copy'); done() } catch {}
  document.body.removeChild(el)
}

function ContentModal({ text, onClose }: { text: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const copy = useCallback(() => {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1500) }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done))
    } else {
      fallbackCopy(text, done)
    }
  }, [text])
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 w-full max-w-lg space-y-3" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">短信内容</span>
          <button onClick={copy} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors">
            {copied ? <><Check className="w-3.5 h-3.5 text-green-400" />已复制</> : <><Copy className="w-3.5 h-3.5" />复制</>}
          </button>
        </div>
        <p className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap break-all">{text}</p>
        <div className="flex justify-end">
          <button onClick={onClose} className="px-4 py-1.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg text-sm">关闭</button>
        </div>
      </div>
    </div>
  )
}

function CopyableContent({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const copy = useCallback(() => {
    const done = () => { setCopied(true); setTimeout(() => setCopied(false), 1500) }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done))
    } else {
      fallbackCopy(text, done)
    }
  }, [text])
  return (
    <>
      <div className="relative flex items-center gap-2 group max-w-xs">
        <span
          className="truncate text-gray-300 cursor-pointer hover:text-white"
          title="点击展开全文"
          onClick={() => setExpanded(true)}
        >{text}</span>
        <button
          onClick={copy}
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-gray-500 hover:text-gray-200"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
        {copied && (
          <span className="absolute -top-7 left-1/2 -translate-x-1/2 bg-gray-900 border border-gray-600 text-green-400 text-xs px-2 py-1 rounded whitespace-nowrap pointer-events-none">
            已复制
          </span>
        )}
      </div>
      {expanded && <ContentModal text={text} onClose={() => setExpanded(false)} />}
    </>
  )
}

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
                  <td className="px-4 py-3"><CopyableContent text={m.content} /></td>
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
