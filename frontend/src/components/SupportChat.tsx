import { useEffect, useRef, useState, useCallback } from 'react'
import { X, Send, MessageCircle, Paperclip, Image, FileText, Download, XCircle } from 'lucide-react'
import clsx from 'clsx'
import { useAuthStore } from '../store/authStore'
import { useLangStore } from '../store/langStore'
import {
  sendMessageApi, getMessagesApi, markReadApi,
  getConversationsApi, uploadFileApi,
  type SupportMessage, type Conversation,
} from '../api/support'
import { listUsersApi, type UserOut } from '../api/auth'
import { format } from 'date-fns'

interface Props {
  onClose: () => void
  onUnreadChange: (n: number) => void
}

// ── Attachment picker popup ───────────────────────────────────────────────────

function AttachPicker({ onPickImage, onPickFile, onClose }: {
  onPickImage: () => void
  onPickFile: () => void
  onClose: () => void
}) {
  const lang = useLangStore(s => s.lang)
  return (
    <div className="absolute bottom-12 left-0 bg-gray-800 border border-gray-700 rounded-xl shadow-2xl py-1.5 z-10 min-w-[160px]">
      <button onClick={() => { onPickImage(); onClose() }}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-gray-700 transition-colors">
        <Image className="w-4 h-4 text-green-400" />
        {lang === 'zh' ? '图片' : 'Image'}
      </button>
      <button onClick={() => { onPickFile(); onClose() }}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-gray-700 transition-colors">
        <FileText className="w-4 h-4 text-blue-400" />
        {lang === 'zh' ? '文件' : 'File'}
      </button>
    </div>
  )
}

// ── Single message bubble ─────────────────────────────────────────────────────

function Bubble({ msg, mine }: { msg: SupportMessage; mine: boolean }) {
  const hasText = msg.content.trim().length > 0

  return (
    <div className={clsx('max-w-[78%]')}>
      {/* Attachment preview */}
      {msg.attachment_url && msg.attachment_type === 'image' && (
        <div className={clsx('mb-1 rounded-xl overflow-hidden border border-gray-600', mine ? 'ml-auto' : '')}>
          <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer">
            <img src={msg.attachment_url} alt={msg.attachment_name || 'image'}
              className="max-w-full max-h-48 object-cover block" />
          </a>
        </div>
      )}
      {msg.attachment_url && msg.attachment_type === 'file' && (
        <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer"
          className={clsx(
            'flex items-center gap-2.5 px-3 py-2.5 rounded-2xl mb-1 text-sm transition-colors',
            mine ? 'bg-blue-700 hover:bg-blue-600 text-white rounded-br-sm' : 'bg-gray-700 hover:bg-gray-600 text-gray-100 rounded-bl-sm'
          )}>
          <FileText className="w-5 h-5 shrink-0 opacity-70" />
          <span className="truncate max-w-[140px]">{msg.attachment_name || 'file'}</span>
          <Download className="w-3.5 h-3.5 shrink-0 opacity-60" />
        </a>
      )}
      {/* Text bubble */}
      {hasText && (
        <div className={clsx(
          'px-3 py-2 rounded-2xl text-sm leading-relaxed break-words',
          mine ? 'bg-blue-600 text-white rounded-br-sm' : 'bg-gray-700 text-gray-100 rounded-bl-sm'
        )}>
          {msg.content}
        </div>
      )}
      <p className={clsx('text-[10px] text-gray-500 mt-0.5', mine ? 'text-right' : 'text-left')}>
        {format(new Date(msg.created_at), 'HH:mm')}
      </p>
    </div>
  )
}

// ── Message list ──────────────────────────────────────────────────────────────

function MessageList({ msgs, selfIsUser, peerInitial }: {
  msgs: SupportMessage[]; selfIsUser: boolean; peerInitial: string
}) {
  const lang = useLangStore(s => s.lang)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  if (msgs.length === 0) return (
    <div className="flex flex-col items-center justify-center flex-1 text-gray-500">
      <MessageCircle className="w-8 h-8 mb-2 opacity-25" />
      <p className="text-xs">{lang === 'zh' ? '暂无消息' : 'No messages yet'}</p>
    </div>
  )

  return (
    <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
      {msgs.map(msg => {
        const mine = selfIsUser ? msg.is_from_user : !msg.is_from_user
        return (
          <div key={msg.id} className={clsx('flex items-end gap-1.5', mine ? 'justify-end' : 'justify-start')}>
            {!mine && (
              <div className="w-6 h-6 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0 mb-4">
                {peerInitial}
              </div>
            )}
            <Bubble msg={msg} mine={mine} />
          </div>
        )
      })}
      <div ref={bottomRef} />
    </div>
  )
}

// ── Input bar with attachment ─────────────────────────────────────────────────

function InputBar({ onSend, placeholder }: {
  onSend: (text: string, attachment?: { url: string; name: string; type: string }) => Promise<void>
  placeholder: string
}) {
  const lang = useLangStore(s => s.lang)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [showPicker, setShowPicker] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const imgRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const isImage = pendingFile?.type.startsWith('image/') ?? false

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (!f) return
    e.target.value = ''
    setPendingFile(f)
    setPreviewUrl(f.type.startsWith('image/') ? URL.createObjectURL(f) : null)
  }

  const clearFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPendingFile(null)
    setPreviewUrl(null)
  }

  const send = async () => {
    if ((!input.trim() && !pendingFile) || sending) return
    setSending(true)
    try {
      let att: { url: string; name: string; type: string } | undefined
      if (pendingFile) {
        const res = await uploadFileApi(pendingFile)
        att = res.data
      }
      await onSend(input.trim(), att)
      setInput('')
      clearFile()
    } catch (e: any) {
      alert(e.response?.data?.detail || (lang === 'zh' ? '发送失败' : 'Send failed'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="border-t border-gray-700 shrink-0">
      {/* Hidden file inputs — always mounted so onChange fires correctly */}
      <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />

      {/* Pending attachment preview */}
      {pendingFile && (
        <div className="px-2.5 pt-2 flex items-center gap-2">
          <div className="relative">
            {isImage && previewUrl ? (
              <img src={previewUrl} alt="preview"
                className="h-16 w-16 object-cover rounded-lg border border-gray-600" />
            ) : (
              <div className="h-10 w-36 flex items-center gap-2 bg-gray-700 rounded-lg px-2 border border-gray-600">
                <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                <span className="text-xs text-gray-300 truncate">{pendingFile.name}</span>
              </div>
            )}
            <button
              onClick={clearFile}
              className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-gray-900 border border-gray-600 rounded-full flex items-center justify-center text-gray-400 hover:text-red-400 transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" />
            </button>
          </div>
          {isImage && <span className="text-xs text-gray-500 truncate max-w-[100px]">{pendingFile.name}</span>}
        </div>
      )}

      <div className="flex gap-2 items-end p-2.5 relative">
        <div className="relative">
          <button
            onClick={() => setShowPicker(v => !v)}
            className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-blue-400 transition-colors rounded-lg hover:bg-gray-700"
            title={lang === 'zh' ? '附件' : 'Attach'}
          >
            <Paperclip className="w-4 h-4" />
          </button>
          {showPicker && (
            <AttachPicker
              onPickImage={() => imgRef.current?.click()}
              onPickFile={() => fileRef.current?.click()}
              onClose={() => setShowPicker(false)}
            />
          )}
        </div>

        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
          placeholder={placeholder}
          className="flex-1 bg-gray-900 border border-gray-600 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
        />
        <button
          onClick={send}
          disabled={(!input.trim() && !pendingFile) || sending}
          className="w-8 h-8 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl flex items-center justify-center transition-colors shrink-0"
        >
          {sending
            ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <Send className="w-3.5 h-3.5" />
          }
        </button>
      </div>
    </div>
  )
}

// ── User view ─────────────────────────────────────────────────────────────────

function UserView({ onUnreadChange }: { onUnreadChange: (n: number) => void }) {
  const lang = useLangStore(s => s.lang)
  const [msgs, setMsgs] = useState<SupportMessage[]>([])
  const lastIdRef = useRef(0)

  const load = useCallback(async (init = false) => {
    const res = await getMessagesApi(undefined, init ? undefined : lastIdRef.current || undefined)
    if (res.data.length > 0) {
      setMsgs(prev => init ? res.data : [...prev, ...res.data])
      lastIdRef.current = res.data[res.data.length - 1].id
      await markReadApi()
      onUnreadChange(0)
    }
  }, [onUnreadChange])

  useEffect(() => {
    load(true)
    const t = setInterval(() => load(false), 5000)
    return () => clearInterval(t)
  }, [load])

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <MessageList msgs={msgs} selfIsUser peerInitial="A" />
      <InputBar
        placeholder={lang === 'zh' ? '输入消息…' : 'Type a message…'}
        onSend={async (text, att) => {
          const res = await sendMessageApi({
            content: text,
            attachment_url: att?.url,
            attachment_name: att?.name,
            attachment_type: att?.type,
          })
          setMsgs(prev => [...prev, res.data])
          lastIdRef.current = res.data.id
        }}
      />
    </div>
  )
}

// ── Admin view ────────────────────────────────────────────────────────────────

function AdminView() {
  const lang = useLangStore(s => s.lang)
  const [convs, setConvs] = useState<Conversation[]>([])
  const [allUsers, setAllUsers] = useState<UserOut[]>([])
  const [selected, setSelected] = useState<{ user_id: number; username: string } | null>(null)
  const [msgs, setMsgs] = useState<SupportMessage[]>([])
  const lastIdRef = useRef(0)

  useEffect(() => {
    const load = () => getConversationsApi().then(r => setConvs(r.data))
    load()
    const t = setInterval(load, 5000)
    listUsersApi().then(r => setAllUsers(r.data.filter(u => u.role !== 'admin')))
    return () => clearInterval(t)
  }, [])

  const loadMsgs = useCallback(async (init = false) => {
    if (!selected) return
    const res = await getMessagesApi(selected.user_id, init ? undefined : lastIdRef.current || undefined)
    if (res.data.length > 0) {
      setMsgs(prev => init ? res.data : [...prev, ...res.data])
      lastIdRef.current = res.data[res.data.length - 1].id
      await markReadApi(selected.user_id)
      getConversationsApi().then(r => setConvs(r.data))
    }
  }, [selected])

  useEffect(() => {
    if (!selected) return
    setMsgs([]); lastIdRef.current = 0
    loadMsgs(true)
    const t = setInterval(() => loadMsgs(false), 5000)
    return () => clearInterval(t)
  }, [loadMsgs, selected])

  const convUserIds = new Set(convs.map(c => c.user_id))
  const sidebar = [
    ...convs.map(c => ({ user_id: c.user_id, username: c.username, conv: c })),
    ...allUsers.filter(u => !convUserIds.has(u.id)).map(u => ({ user_id: u.id, username: u.username, conv: undefined })),
  ]

  return (
    <div className="flex flex-1 min-h-0">
      {/* Left user list */}
      <div className="w-44 border-r border-gray-700 flex flex-col shrink-0">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider px-3 pt-2.5 pb-1">
          {lang === 'zh' ? '用户' : 'Users'}
        </p>
        <div className="flex-1 overflow-y-auto">
          {sidebar.length === 0 && (
            <p className="text-xs text-gray-600 px-3 py-2">{lang === 'zh' ? '暂无用户' : 'No users'}</p>
          )}
          {sidebar.map(item => {
            const active = selected?.user_id === item.user_id
            return (
              <button key={item.user_id} onClick={() => setSelected(item)}
                className={clsx(
                  'w-full flex items-center gap-2 px-3 py-2.5 transition-colors text-left',
                  active ? 'bg-blue-600/20 border-r-2 border-blue-500' : 'hover:bg-gray-700/40'
                )}>
                <div className={clsx(
                  'w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0',
                  item.conv ? 'bg-indigo-600' : 'bg-gray-600'
                )}>
                  {item.username[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={clsx('text-xs font-medium truncate', active ? 'text-blue-300' : 'text-gray-200')}>
                    {item.username}
                  </p>
                  {item.conv && (
                    <p className="text-[10px] text-gray-500 truncate">{item.conv.last_message}</p>
                  )}
                </div>
                {(item.conv?.unread_count ?? 0) > 0 && (
                  <span className="w-4 h-4 bg-blue-500 rounded-full text-white text-[9px] font-bold flex items-center justify-center shrink-0">
                    {item.conv!.unread_count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Right chat */}
      <div className="flex flex-col flex-1 min-w-0 min-h-0">
        {selected ? (
          <>
            <MessageList msgs={msgs} selfIsUser={false} peerInitial={selected.username[0].toUpperCase()} />
            <InputBar
              placeholder={lang === 'zh' ? `回复 ${selected.username}…` : `Reply to ${selected.username}…`}
              onSend={async (text, att) => {
                const res = await sendMessageApi({
                  content: text, user_id: selected.user_id,
                  attachment_url: att?.url, attachment_name: att?.name, attachment_type: att?.type,
                })
                setMsgs(prev => [...prev, res.data])
                lastIdRef.current = res.data.id
                getConversationsApi().then(r => setConvs(r.data))
              }}
            />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 text-gray-600">
            <MessageCircle className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-xs">{lang === 'zh' ? '选择左侧用户开始聊天' : 'Select a user to start'}</p>
          </div>
        )}
      </div>
    </div>
  )
}

// ── Root panel ────────────────────────────────────────────────────────────────

export default function SupportChat({ onClose, onUnreadChange }: Props) {
  const { user } = useAuthStore()
  const lang = useLangStore(s => s.lang)
  const isAdmin = user?.role === 'admin'

  return (
    <div className={clsx(
      'fixed bottom-20 right-16 z-50 bg-gray-800 border border-gray-700 rounded-2xl shadow-2xl flex flex-col overflow-hidden',
      isAdmin ? 'w-[520px] h-[480px]' : 'w-80 h-[440px]'
    )}>
      <div className="flex items-center justify-between px-4 py-3 bg-blue-600 shrink-0">
        <div className="flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-white" />
          <span className="text-sm font-semibold text-white">
            {lang === 'zh' ? '在线咨询' : 'Support Chat'}
          </span>
          {isAdmin && <span className="text-xs text-blue-200 opacity-80">— {lang === 'zh' ? '管理员' : 'Admin'}</span>}
        </div>
        <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {isAdmin ? <AdminView /> : <UserView onUnreadChange={onUnreadChange} />}
    </div>
  )
}
