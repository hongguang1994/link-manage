import { useState } from 'react'
import { Send, CheckCircle, XCircle } from 'lucide-react'
import { useModemStore } from '../store/modemStore'
import { sendSmsApi } from '../api/sms'
import { useT } from '../i18n'

export default function SmsSend() {
  const modems = useModemStore(s => s.modems)
  const t = useT()
  const [modemId, setModemId] = useState<number | ''>('')
  const [phone, setPhone] = useState('')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle')
  const [errMsg, setErrMsg] = useState('')

  const send = async () => {
    if (!modemId || !phone || !content) return
    setStatus('sending')
    try {
      await sendSmsApi({ modem_id: Number(modemId), phone_number: phone, content })
      setStatus('ok')
      setPhone('')
      setContent('')
      setTimeout(() => setStatus('idle'), 3000)
    } catch (e: any) {
      setErrMsg(e.response?.data?.detail || t('sms_fail_default'))
      setStatus('err')
    }
  }

  return (
    <div className="p-6 max-w-xl space-y-5">
      <h1 className="text-2xl font-bold text-white">{t('sms_title')}</h1>

      <div className="space-y-4 bg-gray-800 rounded-xl p-5 border border-gray-700">
        <div>
          <label className="block text-sm text-gray-400 mb-1">{t('sms_select_sim')}</label>
          <select
            value={modemId}
            onChange={e => setModemId(Number(e.target.value))}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
          >
            <option value="">{t('sms_select_placeholder')}</option>
            {modems.filter(m => m.status === 'connected' || m.status === 'disconnected').map(m => (
              <option key={m.id} value={m.id}>
                {m.alias || `SIM ${m.id}`} — {m.operator || t('sms_operator_unknown')} {m.phone_number ? `(${m.phone_number})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">{t('sms_recipient')}</label>
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+8613800138000"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">{t('sms_content')}</label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={4}
            maxLength={500}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 resize-none"
            placeholder={t('sms_content_ph')}
          />
          <p className="text-xs text-gray-500 mt-1 text-right">{content.length}/500</p>
        </div>

        <button
          onClick={send}
          disabled={status === 'sending' || !modemId || !phone || !content}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg py-2.5 font-medium transition-colors"
        >
          <Send className="w-4 h-4" />
          {status === 'sending' ? t('sms_sending') : t('sms_send')}
        </button>

        {status === 'ok' && (
          <div className="flex items-center gap-2 text-green-400 text-sm">
            <CheckCircle className="w-4 h-4" /> {t('sms_success')}
          </div>
        )}
        {status === 'err' && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <XCircle className="w-4 h-4" /> {errMsg}
          </div>
        )}
      </div>
    </div>
  )
}
