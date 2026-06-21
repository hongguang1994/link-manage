import { useState } from 'react'
import { Send, CheckCircle, XCircle } from 'lucide-react'
import { useModemStore } from '../store/modemStore'
import { sendSmsApi } from '../api/sms'

export default function SmsSend() {
  const modems = useModemStore(s => s.modems)
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
      setErrMsg(e.response?.data?.detail || '发送失败')
      setStatus('err')
    }
  }

  return (
    <div className="p-6 max-w-xl space-y-5">
      <h1 className="text-2xl font-bold text-white">发送短信</h1>

      <div className="space-y-4 bg-gray-800 rounded-xl p-5 border border-gray-700">
        <div>
          <label className="block text-sm text-gray-400 mb-1">选择 SIM 卡</label>
          <select
            value={modemId}
            onChange={e => setModemId(Number(e.target.value))}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
          >
            <option value="">— 请选择 —</option>
            {modems.filter(m => m.status === 'connected').map(m => (
              <option key={m.id} value={m.id}>
                {m.alias || `SIM ${m.id}`} — {m.operator || '未知运营商'} {m.phone_number ? `(${m.phone_number})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">接收号码</label>
          <input
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="+8613800138000"
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500"
          />
        </div>

        <div>
          <label className="block text-sm text-gray-400 mb-1">短信内容</label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={4}
            maxLength={500}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white placeholder-gray-500 resize-none"
            placeholder="请输入短信内容…"
          />
          <p className="text-xs text-gray-500 mt-1 text-right">{content.length}/500</p>
        </div>

        <button
          onClick={send}
          disabled={status === 'sending' || !modemId || !phone || !content}
          className="w-full flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white rounded-lg py-2.5 font-medium transition-colors"
        >
          <Send className="w-4 h-4" />
          {status === 'sending' ? '发送中…' : '立即发送'}
        </button>

        {status === 'ok' && (
          <div className="flex items-center gap-2 text-green-400 text-sm">
            <CheckCircle className="w-4 h-4" /> 发送成功
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
