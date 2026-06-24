import { useState, useEffect } from 'react'
import { Send, CheckCircle, XCircle, FileText, X } from 'lucide-react'
import { useModemStore } from '../store/modemStore'
import { sendSmsApi, getTemplatesApi, SmsTemplate } from '../api/sms'
import { useT } from '../i18n'
import { useAuthStore } from '../store/authStore'
import { mySimRequestsApi, type SimAccessRequest } from '../api/simRequests'

function extractVars(content: string): string[] {
  const matches = content.match(/\{(\w+)\}/g) || []
  return [...new Set(matches.map(m => m.slice(1, -1)))]
}

function applyVars(content: string, vals: Record<string, string>): string {
  return content.replace(/\{(\w+)\}/g, (_, k) => vals[k] ?? `{${k}}`)
}

function TemplatePicker({
  templates,
  onSelect,
  onClose,
}: {
  templates: SmsTemplate[]
  onSelect: (tpl: SmsTemplate) => void
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 w-full max-w-lg space-y-3 max-h-[70vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">选择模板</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>
        {templates.length === 0 ? (
          <p className="text-gray-400 text-sm py-4 text-center">暂无模板</p>
        ) : (
          <div className="overflow-y-auto space-y-2">
            {templates.map(tpl => (
              <button
                key={tpl.id}
                onClick={() => onSelect(tpl)}
                className="w-full text-left bg-gray-700 hover:bg-gray-600 rounded-lg p-3 transition-colors"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-white text-sm">{tpl.name}</span>
                  {tpl.variables && tpl.variables.length > 0 && (
                    <span className="text-xs text-blue-400 bg-blue-900/30 px-1.5 py-0.5 rounded">
                      {tpl.variables.length} 个变量
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 truncate">{tpl.content}</p>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function VarFillModal({
  template,
  onConfirm,
  onClose,
}: {
  template: SmsTemplate
  onConfirm: (content: string) => void
  onClose: () => void
}) {
  const vars = template.variables && template.variables.length > 0
    ? template.variables
    : extractVars(template.content)
  const [vals, setVals] = useState<Record<string, string>>(
    Object.fromEntries(vars.map(v => [v, '']))
  )

  const preview = applyVars(template.content, vals)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-5 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-white">填写变量</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-4 h-4" /></button>
        </div>

        <div className="space-y-3">
          {vars.map(v => (
            <div key={v}>
              <label className="block text-sm text-gray-400 mb-1">{'{' + v + '}'}</label>
              <input
                value={vals[v] || ''}
                onChange={e => setVals(prev => ({ ...prev, [v]: e.target.value }))}
                placeholder={`请输入 ${v}`}
                className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm"
              />
            </div>
          ))}
        </div>

        <div className="bg-gray-900 rounded-lg p-3">
          <p className="text-xs text-gray-500 mb-1">预览</p>
          <p className="text-sm text-gray-200 whitespace-pre-wrap break-all">{preview}</p>
        </div>

        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white text-sm">取消</button>
          <button
            onClick={() => onConfirm(preview)}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm"
          >
            使用此内容
          </button>
        </div>
      </div>
    </div>
  )
}

export default function SmsSend() {
  const allModems = useModemStore(s => s.modems)
  const { user } = useAuthStore()
  const isAdmin = user?.role === 'admin'
  const t = useT()
  const [modemId, setModemId] = useState<number | ''>('')
  const [phone, setPhone] = useState('')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<'idle' | 'sending' | 'ok' | 'err'>('idle')
  const [errMsg, setErrMsg] = useState('')
  const [templates, setTemplates] = useState<SmsTemplate[]>([])
  const [showPicker, setShowPicker] = useState(false)
  const [pendingTpl, setPendingTpl] = useState<SmsTemplate | null>(null)
  const [myRequests, setMyRequests] = useState<SimAccessRequest[]>([])

  useEffect(() => {
    getTemplatesApi().then(r => setTemplates(r.data)).catch(() => {})
    if (!isAdmin) {
      mySimRequestsApi().then(r => setMyRequests(r.data)).catch(() => {})
    }
  }, [isAdmin])

  const now = new Date()
  const useGrantedIds = new Set(
    myRequests
      .filter(r => r.status === 'approved' && r.granted_level === 'use' && (!r.expires_at || new Date(r.expires_at) > now))
      .map(r => r.modem_id)
  )

  // Approvers automatically have use-level access to their managed cards
  // Returns: 'all' = unrestricted approver, Set = specific managed IDs, null = not an approver
  const approverManagedIds: Set<number> | 'all' | null = (() => {
    const roles = user?.rbac_roles ?? []
    const approverRoles = roles.filter((r: any) => r.can_approve_requests)
    if (approverRoles.length === 0) return null
    if (approverRoles.some((r: any) => r.allowed_modem_ids == null)) return 'all'
    const ids = new Set<number>()
    approverRoles.forEach((r: any) => (r.allowed_modem_ids ?? []).forEach((id: number) => ids.add(id)))
    return ids
  })()

  const modems = isAdmin || approverManagedIds === 'all'
    ? allModems
    : allModems.filter(m => useGrantedIds.has(m.id) || (approverManagedIds !== null && approverManagedIds.has(m.id)))

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

  const onPickTemplate = (tpl: SmsTemplate) => {
    setShowPicker(false)
    const vars = tpl.variables && tpl.variables.length > 0
      ? tpl.variables
      : extractVars(tpl.content)
    if (vars.length > 0) {
      setPendingTpl(tpl)
    } else {
      setContent(tpl.content)
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
          <div className="flex items-center justify-between mb-1">
            <label className="text-sm text-gray-400">{t('sms_content')}</label>
            <button
              onClick={() => setShowPicker(true)}
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              <FileText className="w-3.5 h-3.5" /> 从模板选择
            </button>
          </div>
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

      {showPicker && (
        <TemplatePicker
          templates={templates}
          onSelect={onPickTemplate}
          onClose={() => setShowPicker(false)}
        />
      )}
      {pendingTpl && (
        <VarFillModal
          template={pendingTpl}
          onConfirm={text => { setContent(text); setPendingTpl(null) }}
          onClose={() => setPendingTpl(null)}
        />
      )}
    </div>
  )
}
