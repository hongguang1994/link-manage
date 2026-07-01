import { useEffect, useRef, useState, useCallback } from 'react'
import { Search, MessageCircle, Send, Paperclip, Image, FileText, Download, Users, Clock, XCircle } from 'lucide-react'
import clsx from 'clsx'
import { format, isToday, isYesterday } from 'date-fns'
import { useT } from '../i18n'
import {
  sendMessageApi, getMessagesApi, markReadApi,
  getConversationsApi, uploadFileApi,
  type SupportMessage, type Conversation,
} from '../api/support'
import { listUsersApi, type UserOut } from '../api/auth'

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string, yesterday: string) {
  const d = new Date(iso)
  if (isToday(d)) return format(d, 'HH:mm')
  if (isYesterday(d)) return `${yesterday} ${format(d, 'HH:mm')}`
  return format(d, 'MM-dd HH:mm')
}

// ── Attachment picker ─────────────────────────────────────────────────────────

function AttachPicker({ onPickImage, onPickFile, onClose, labelImage, labelFile }: {
  onPickImage: () => void
  onPickFile: () => void
  onClose: () => void
  labelImage: string
  labelFile: string
}) {
  return (
    <div className="absolute bottom-12 left-0 bg-gray-800 border border-gray-600 rounded-xl shadow-2xl py-1.5 z-10 min-w-[160px]">
      <button onClick={() => { onPickImage(); onClose() }}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-gray-700 transition-colors">
        <Image className="w-4 h-4 text-green-400" />
        {labelImage}
      </button>
      <button onClick={() => { onPickFile(); onClose() }}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-300 hover:text-white hover:bg-gray-700 transition-colors">
        <FileText className="w-4 h-4 text-blue-400" />
        {labelFile}
      </button>
    </div>
  )
}

// ── Bubble ────────────────────────────────────────────────────────────────────

function Bubble({ msg, mine }: { msg: SupportMessage; mine: boolean }) {
  const hasText = msg.content.trim().length > 0
  return (
    <div className="max-w-[70%]">
      {msg.attachment_url && msg.attachment_type === 'image' && (
        <div className={clsx('mb-1 rounded-xl overflow-hidden border border-gray-600', mine ? 'ml-auto' : '')}>
          <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer">
            <img src={msg.attachment_url} alt={msg.attachment_name || 'image'}
              className="max-w-full max-h-56 object-cover block" />
          </a>
        </div>
      )}
      {msg.attachment_url && msg.attachment_type === 'file' && (
        <a href={msg.attachment_url} target="_blank" rel="noopener noreferrer"
          className={clsx(
            'flex items-center gap-2.5 px-3 py-2.5 rounded-2xl mb-1 text-sm transition-colors',
            mine
              ? 'bg-blue-700 hover:bg-blue-600 text-white rounded-br-sm'
              : 'bg-gray-700 hover:bg-gray-600 text-gray-100 rounded-bl-sm'
          )}>
          <FileText className="w-5 h-5 shrink-0 opacity-70" />
          <span className="truncate max-w-[180px]">{msg.attachment_name || 'file'}</span>
          <Download className="w-3.5 h-3.5 shrink-0 opacity-60" />
        </a>
      )}
      {hasText && (
        <div className={clsx(
          'px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words',
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

// ── Input bar ─────────────────────────────────────────────────────────────────

function InputBar({ onSend, placeholder, t }: {
  onSend: (text: string, att?: { url: string; name: string; type: string }) => Promise<void>
  placeholder: string
  t: ReturnType<typeof useT>
}) {
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
      alert(e.response?.data?.detail || t('sup_send_fail'))
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="border-t border-gray-700 shrink-0">
      {/* Hidden file inputs — always mounted */}
      <input ref={imgRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />
      <input ref={fileRef} type="file" className="hidden" onChange={handleFileChange} />

      {/* Pending attachment preview */}
      {pendingFile && (
        <div className="px-3 pt-2.5 flex items-center gap-3">
          <div className="relative">
            {isImage && previewUrl ? (
              <img src={previewUrl} alt="preview"
                className="h-20 w-20 object-cover rounded-xl border border-gray-600" />
            ) : (
              <div className="h-12 w-44 flex items-center gap-2 bg-gray-700 rounded-xl px-3 border border-gray-600">
                <FileText className="w-5 h-5 text-blue-400 shrink-0" />
                <span className="text-xs text-gray-300 truncate">{pendingFile.name}</span>
              </div>
            )}
            <button
              onClick={clearFile}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-900 border border-gray-600 rounded-full flex items-center justify-center text-gray-400 hover:text-red-400 transition-colors"
            >
              <XCircle className="w-4 h-4" />
            </button>
          </div>
          {isImage && (
            <span className="text-xs text-gray-500 truncate max-w-[160px]">{pendingFile.name}</span>
          )}
        </div>
      )}

      <div className="flex gap-2 items-end p-3 relative">
        <div className="relative">
          <button onClick={() => setShowPicker(v => !v)}
            className="w-9 h-9 flex items-center justify-center text-gray-400 hover:text-blue-400 rounded-xl hover:bg-gray-700 transition-colors"
            title={t('sup_attach')}>
            <Paperclip className="w-4 h-4" />
          </button>
          {showPicker && (
            <AttachPicker
              onPickImage={() => imgRef.current?.click()}
              onPickFile={() => fileRef.current?.click()}
              onClose={() => setShowPicker(false)}
              labelImage={t('sup_image')}
              labelFile={t('sup_file')}
            />
          )}
        </div>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && (e.preventDefault(), send())}
          placeholder={placeholder}
          className="flex-1 bg-gray-900 border border-gray-600 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
        />
        <button
          onClick={send}
          disabled={(!input.trim() && !pendingFile) || sending}
          className="w-9 h-9 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white rounded-xl flex items-center justify-center transition-colors shrink-0">
          {sending
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <Send className="w-4 h-4" />
          }
        </button>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

type SidebarItem = {
  user_id: number
  username: string
  conv?: Conversation
}

export default function SupportAdmin() {
  const t = useT()
  const [convs, setConvs] = useState<Conversation[]>([])
  const [allUsers, setAllUsers] = useState<UserOut[]>([])
  const [selected, setSelected] = useState<{ user_id: number; username: string } | null>(null)
  const [msgs, setMsgs] = useState<SupportMessage[]>([])
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'unread' | 'replied'>('all')
  const lastIdRef = useRef(0)
  const bottomRef = useRef<HTMLDivElement>(null)

  // Load conversations + all users
  const loadConvs = useCallback(() =>
    getConversationsApi().then(r => setConvs(r.data)), [])

  useEffect(() => {
    loadConvs()
    listUsersApi().then(r => setAllUsers(r.data.filter(u => u.role !== 'admin')))
    const timer = setInterval(loadConvs, 5000)
    return () => clearInterval(timer)
  }, [loadConvs])

  // Load messages for selected user
  const loadMsgs = useCallback(async (init = false) => {
    if (!selected) return
    const res = await getMessagesApi(selected.user_id, init ? undefined : lastIdRef.current || undefined)
    if (res.data.length > 0) {
      setMsgs(prev => init ? res.data : [...prev, ...res.data])
      lastIdRef.current = res.data[res.data.length - 1].id
      await markReadApi(selected.user_id)
      loadConvs()
    }
  }, [selected, loadConvs])

  useEffect(() => {
    if (!selected) return
    setMsgs([]); lastIdRef.current = 0
    loadMsgs(true)
    const timer = setInterval(() => loadMsgs(false), 5000)
    return () => clearInterval(timer)
  }, [loadMsgs, selected])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [msgs])

  // Build sidebar list
  const convUserIds = new Set(convs.map(c => c.user_id))
  const sidebar: SidebarItem[] = [
    ...convs.map(c => ({ user_id: c.user_id, username: c.username, conv: c })),
    ...allUsers.filter(u => !convUserIds.has(u.id)).map(u => ({ user_id: u.id, username: u.username })),
  ]

  const filtered = sidebar.filter(item => {
    if (search && !item.username.toLowerCase().includes(search.toLowerCase())) return false
    if (filter === 'unread') return (item.conv?.unread_count ?? 0) > 0
    if (filter === 'replied') return item.conv && item.conv.unread_count === 0
    return true
  })

  const totalUnread = convs.reduce((s, c) => s + c.unread_count, 0)

  const FILTERS = [
    { key: 'all' as const, label: t('sup_filter_all') },
    { key: 'unread' as const, label: t('sup_filter_unread') },
    { key: 'replied' as const, label: t('sup_filter_replied') },
  ]

  const yesterday = t('sup_yesterday')

  return (
    <div className="flex h-[calc(100vh-3.5rem)] overflow-hidden">

      {/* ── Left panel: user list ── */}
      <div className="w-72 border-r border-gray-700 bg-gray-800 flex flex-col shrink-0">

        {/* Header */}
        <div className="px-4 pt-4 pb-3 border-b border-gray-700 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold text-white text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-400" />
              {t('sup_title')}
            </h2>
            {totalUnread > 0 && (
              <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('sup_search_ph')}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
          </div>
        </div>

        {/* Filter tabs */}
        <div className="flex border-b border-gray-700 shrink-0">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key)}
              className={clsx(
                'flex-1 text-xs py-2.5 transition-colors font-medium',
                filter === f.key ? 'text-blue-400 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-300'
              )}>
              {f.label}
            </button>
          ))}
        </div>

        {/* User list */}
        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-gray-600">
              <Users className="w-8 h-8 mb-2 opacity-30" />
              <p className="text-xs">{t('sup_no_users')}</p>
            </div>
          )}
          {filtered.map(item => {
            const active = selected?.user_id === item.user_id
            const unread = item.conv?.unread_count ?? 0
            return (
              <button key={item.user_id} onClick={() => setSelected(item)}
                className={clsx(
                  'w-full flex items-center gap-3 px-4 py-3 transition-colors text-left border-b border-gray-700/50',
                  active ? 'bg-blue-600/15 border-l-2 border-l-blue-500' : 'hover:bg-gray-700/40'
                )}>
                {/* Avatar */}
                <div className={clsx(
                  'w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0',
                  item.conv ? 'bg-indigo-600' : 'bg-gray-600'
                )}>
                  {item.username[0].toUpperCase()}
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className={clsx('text-sm font-medium truncate', active ? 'text-blue-300' : 'text-gray-100')}>
                      {item.username}
                    </p>
                    {item.conv?.last_at && (
                      <span className="text-[10px] text-gray-500 shrink-0 ml-1">
                        {fmtTime(item.conv.last_at, yesterday)}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 truncate mt-0.5">
                    {item.conv?.last_message
                      ? item.conv.last_message
                      : t('sup_no_init')}
                  </p>
                </div>
                {/* Unread badge */}
                {unread > 0 && (
                  <span className="w-5 h-5 bg-red-500 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                    {unread > 9 ? '9+' : unread}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {/* Footer stats */}
        <div className="px-4 py-2.5 border-t border-gray-700 shrink-0 flex gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {sidebar.length} {t('sup_users_count')}</span>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {convs.length} {t('sup_conv_count')}</span>
        </div>
      </div>

      {/* ── Right panel: chat ── */}
      <div className="flex-1 flex flex-col min-w-0 bg-gray-900">
        {selected ? (
          <>
            {/* Chat header */}
            <div className="h-14 px-5 border-b border-gray-700 bg-gray-800 flex items-center gap-3 shrink-0">
              <div className="w-9 h-9 rounded-full bg-indigo-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
                {selected.username[0].toUpperCase()}
              </div>
              <div>
                <p className="text-sm font-semibold text-white">{selected.username}</p>
                <p className="text-xs text-gray-400">{t('sup_support_chat')}</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {msgs.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-gray-600">
                  <MessageCircle className="w-10 h-10 mb-2 opacity-25" />
                  <p className="text-sm">{t('sup_no_messages')}</p>
                </div>
              ) : msgs.map(msg => {
                const mine = !msg.is_from_user
                return (
                  <div key={msg.id} className={clsx('flex items-end gap-2', mine ? 'justify-end' : 'justify-start')}>
                    {!mine && (
                      <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-[11px] font-bold shrink-0 mb-4">
                        {selected.username[0].toUpperCase()}
                      </div>
                    )}
                    <Bubble msg={msg} mine={mine} />
                  </div>
                )
              })}
              <div ref={bottomRef} />
            </div>

            <InputBar
              placeholder={`${t('sup_reply_ph')} ${selected.username}…`}
              t={t}
              onSend={async (text, att) => {
                const res = await sendMessageApi({
                  content: text, user_id: selected.user_id,
                  attachment_url: att?.url, attachment_name: att?.name, attachment_type: att?.type,
                })
                setMsgs(prev => [...prev, res.data])
                lastIdRef.current = res.data.id
                loadConvs()
              }}
            />
          </>
        ) : (
          <div className="flex flex-col items-center justify-center flex-1 text-gray-600">
            <MessageCircle className="w-12 h-12 mb-3 opacity-20" />
            <p className="text-base font-medium">{t('sup_select_user')}</p>
            <p className="text-sm mt-1 opacity-60">{t('all')} {sidebar.length} {t('sup_total_users')}</p>
          </div>
        )}
      </div>
    </div>
  )
}
