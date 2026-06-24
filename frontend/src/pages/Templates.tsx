import { useEffect, useState } from 'react'
import { Plus, Trash2, FileText } from 'lucide-react'
import { getTemplatesApi, createTemplateApi, deleteTemplateApi, SmsTemplate } from '../api/sms'
import { useT } from '../i18n'

function extractVars(content: string): string[] {
  const matches = content.match(/\{(\w+)\}/g) || []
  return [...new Set(matches.map(m => m.slice(1, -1)))]
}

function CreateModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const t = useT()
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const vars = extractVars(content)

  const submit = async () => {
    if (!name.trim() || !content.trim()) { setError('名称和内容不能为空'); return }
    setSaving(true)
    try {
      await createTemplateApi({ name: name.trim(), content: content.trim(), variables: vars })
      onCreated()
      onClose()
    } catch {
      setError('创建失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-6 w-full max-w-lg space-y-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-white">新建模板</h2>

        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="模板名称"
          className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white"
        />

        <div>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder={'模板内容，用 {变量名} 表示变量\n例如：你好 {name}，你的验证码是 {code}'}
            rows={5}
            className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-white resize-none"
          />
          {vars.length > 0 && (
            <p className="text-xs text-blue-400 mt-1">
              检测到变量：{vars.map(v => <span key={v} className="mx-1 bg-blue-900/50 px-1.5 py-0.5 rounded">{'{' + v + '}'}</span>)}
            </p>
          )}
        </div>

        {error && <p className="text-red-400 text-sm">{error}</p>}

        <div className="flex gap-3 justify-end">
          <button onClick={onClose} className="px-4 py-2 text-gray-400 hover:text-white">取消</button>
          <button
            onClick={submit}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white rounded-lg"
          >
            {saving ? '创建中...' : '创建'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Templates() {
  const t = useT()
  const [templates, setTemplates] = useState<SmsTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await getTemplatesApi()
      setTemplates(res.data)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const del = async (id: number) => {
    if (!confirm('确认删除该模板？')) return
    await deleteTemplateApi(id)
    setTemplates(ts => ts.filter(t => t.id !== id))
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">短信模板</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm"
        >
          <Plus className="w-4 h-4" /> 新建模板
        </button>
      </div>

      {loading ? (
        <p className="text-gray-400">加载中...</p>
      ) : templates.length === 0 ? (
        <div className="text-center py-16 text-gray-500">
          <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
          <p>暂无模板，点击右上角新建</p>
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(tpl => (
            <div key={tpl.id} className="bg-gray-800 border border-gray-700 rounded-xl p-4 flex gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium text-white">{tpl.name}</span>
                  {tpl.variables && tpl.variables.length > 0 && (
                    <span className="text-xs text-blue-400 bg-blue-900/30 px-2 py-0.5 rounded">
                      {tpl.variables.length} 个变量
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-300 whitespace-pre-wrap break-all">{tpl.content}</p>
                {tpl.variables && tpl.variables.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {tpl.variables.map(v => (
                      <span key={v} className="text-xs bg-gray-700 text-gray-300 px-2 py-0.5 rounded">
                        {'{' + v + '}'}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <button
                onClick={() => del(tpl.id)}
                className="shrink-0 text-gray-500 hover:text-red-400 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreated={load} />}
    </div>
  )
}
