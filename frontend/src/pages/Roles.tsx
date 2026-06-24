import { useEffect, useState } from 'react'
import { ShieldCheck, Plus, Pencil, Trash2, X, Check, ChevronRight } from 'lucide-react'
import clsx from 'clsx'
import { listRolesApi, createRoleApi, updateRoleApi, deleteRoleApi, type RoleOut, type RoleCreate } from '../api/roles'
import { useLangStore } from '../store/langStore'

// ── System role i18n map ──────────────────────────────────────────────────────
const SYSTEM_ROLE_I18N: Record<string, { name: string; description: string }> = {
  '审批员':   { name: 'Approver',       description: 'View SIM cards, approve requests, view history' },
  '普通用户': { name: 'Regular User',   description: 'View authorized SIM cards only' },
  '只读用户': { name: 'Read-only User', description: 'View only, no write operations' },
  '客服':     { name: 'Support Staff',  description: 'Handle support chats, view SIM cards' },
  '访客':     { name: 'Guest',          description: 'No permissions, admin must assign roles' },
}

function roleLabel(role: RoleOut, lang: string) {
  if (lang === 'zh' || !role.is_system) return { name: role.name, description: role.description }
  return SYSTEM_ROLE_I18N[role.name] ?? { name: role.name, description: role.description }
}

// ── Permission toggle row ─────────────────────────────────────────────────────
function PermRow({ label, checked, onChange, disabled }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean
}) {
  return (
    <label className={clsx('flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0 cursor-pointer', disabled && 'opacity-40 pointer-events-none')}>
      <span className="text-sm text-gray-300">{label}</span>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={clsx('w-10 h-5 rounded-full transition-colors relative flex items-center', checked ? 'bg-indigo-600' : 'bg-gray-600')}
      >
        <span className={clsx('w-4 h-4 bg-white rounded-full shadow absolute transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
    </label>
  )
}

// ── Role form modal ───────────────────────────────────────────────────────────
const EMPTY_FORM: RoleCreate = {
  name: '', description: '',
  can_view_sim: false, can_approve_requests: false, can_view_history: false,
  read_only: false, can_support: false, allowed_modem_ids: null,
}

function RoleModal({ role, onClose, onSaved, lang }: {
  role: RoleOut | null; onClose: () => void; onSaved: () => void; lang: string
}) {
  const zh = lang === 'zh'
  const [form, setForm] = useState<RoleCreate>(
    role ? {
      name: role.name, description: role.description,
      can_view_sim: role.can_view_sim, can_approve_requests: role.can_approve_requests,
      can_view_history: role.can_view_history,
      read_only: role.read_only, can_support: role.can_support, allowed_modem_ids: role.allowed_modem_ids,
    } : EMPTY_FORM
  )
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const set = (k: keyof RoleCreate, v: unknown) => setForm(f => ({ ...f, [k]: v }))

  const save = async () => {
    if (!form.name.trim()) { setErr(zh ? '请填写角色名称' : 'Role name required'); return }
    setSaving(true); setErr('')
    try {
      if (role) await updateRoleApi(role.id, form)
      else await createRoleApi(form)
      onSaved()
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? (zh ? '保存失败' : 'Save failed'))
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-gray-800 border border-gray-700 rounded-xl w-full max-w-md shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
          <h2 className="font-semibold text-white text-lg">
            {role ? (zh ? '编辑角色' : 'Edit Role') : (zh ? '新建角色' : 'New Role')}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">{zh ? '角色名称' : 'Role name'}</label>
            <input
              value={form.name}
              onChange={e => set('name', e.target.value)}
              disabled={!!role?.is_system}
              placeholder={zh ? '输入角色名…' : 'Enter role name…'}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500 disabled:opacity-50"
            />
          </div>
          {/* Description */}
          <div>
            <label className="block text-xs text-gray-400 mb-1">{zh ? '描述' : 'Description'}</label>
            <input
              value={form.description}
              onChange={e => set('description', e.target.value)}
              placeholder={zh ? '角色描述（可选）' : 'Optional description'}
              className="w-full bg-gray-700 border border-gray-600 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Permissions */}
          <div className="bg-gray-750 border border-gray-700 rounded-lg px-4 py-1">
            <PermRow label={zh ? '只读模式（禁止所有写操作）' : 'Read-only (no write)'} checked={form.read_only} onChange={v => set('read_only', v)} />
            <PermRow label={zh ? '查看 SIM 卡' : 'View SIM cards'} checked={form.can_view_sim} onChange={v => set('can_view_sim', v)} />
            <PermRow label={zh ? '审批 SIM 卡申请' : 'Approve SIM requests'} checked={!!form.can_approve_requests} onChange={v => set('can_approve_requests', v)} disabled={form.read_only} />
            <PermRow label={zh ? '查看短信记录' : 'View SMS history'} checked={form.can_view_history} onChange={v => set('can_view_history', v)} />
            <PermRow label={zh ? '回复用户咨询（客服权限）' : 'Reply to support chats'} checked={!!form.can_support} onChange={v => set('can_support', v)} />
          </div>

          {err && <p className="text-red-400 text-xs">{err}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-5 pb-5">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg bg-gray-700 text-gray-300 hover:bg-gray-600">{zh ? '取消' : 'Cancel'}</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-500 disabled:opacity-50 flex items-center gap-1.5">
            <Check className="w-4 h-4" />
            {saving ? (zh ? '保存中…' : 'Saving…') : (zh ? '保存' : 'Save')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Role card ─────────────────────────────────────────────────────────────────
function RoleCard({ role, onEdit, onDelete, lang }: {
  role: RoleOut; onEdit: () => void; onDelete: () => void; lang: string
}) {
  const zh = lang === 'zh'
  const { name: displayName, description: displayDesc } = roleLabel(role, lang)
  const perms = [
    { label: zh ? '查看SIM' : 'View SIM', on: role.can_view_sim },
    { label: zh ? '审批申请' : 'Approve', on: role.can_approve_requests },
    { label: zh ? '查看记录' : 'History', on: role.can_view_history },
    { label: zh ? '客服' : 'Support', on: role.can_support },
  ]
  return (
    <div className="bg-gray-800 border border-gray-700 rounded-xl p-4 hover:border-indigo-500/50 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-white">{displayName}</h3>
            {role.is_system && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">
                {zh ? '系统' : 'System'}
              </span>
            )}
            {role.read_only && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-900/60 text-yellow-300 border border-yellow-700/50">
                {zh ? '只读' : 'Read-only'}
              </span>
            )}
          </div>
          {displayDesc && <p className="text-xs text-gray-500 mt-0.5">{displayDesc}</p>}
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-2">
          <button onClick={onEdit} className="text-gray-500 hover:text-indigo-400 transition-colors p-1">
            <Pencil className="w-3.5 h-3.5" />
          </button>
          {!role.is_system && (
            <button onClick={onDelete} className="text-gray-500 hover:text-red-400 transition-colors p-1">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Permission chips */}
      <div className="flex flex-wrap gap-1.5">
        {perms.map(p => (
          <span key={p.label} className={clsx('text-[11px] px-2 py-0.5 rounded-full',
            p.on ? 'bg-green-900/50 text-green-300' : 'bg-gray-700 text-gray-500 line-through')}>
            {p.label}
          </span>
        ))}
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function Roles() {
  const lang = useLangStore(s => s.lang)
  const zh = lang === 'zh'
  const [roles, setRoles] = useState<RoleOut[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<{ open: boolean; role: RoleOut | null }>({ open: false, role: null })

  const load = () => {
    setLoading(true)
    listRolesApi().then(r => setRoles(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleDelete = async (role: RoleOut) => {
    if (!confirm(zh ? `确认删除角色「${role.name}」？` : `Delete role "${role.name}"?`)) return
    await deleteRoleApi(role.id)
    load()
  }

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <ShieldCheck className="w-6 h-6 text-indigo-400" />
          {zh ? '角色管理' : 'Role Management'}
        </h1>
        <button
          onClick={() => setModal({ open: true, role: null })}
          className="flex items-center gap-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-sm rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
          {zh ? '新建角色' : 'New Role'}
        </button>
      </div>

      {/* RBAC explanation banner */}
      <div className="bg-indigo-900/20 border border-indigo-700/40 rounded-xl p-4 flex items-start gap-3 text-sm text-indigo-300">
        <ChevronRight className="w-4 h-4 mt-0.5 shrink-0" />
        <span>
          {zh
            ? '角色定义了用户的功能权限。在「用户管理」中为每位用户分配角色。管理员账号（系统角色）始终拥有全部权限。'
            : 'Roles define what users can access. Assign roles in User Management. Admin accounts always have full access.'}
        </span>
      </div>

      {/* Role grid */}
      {loading ? (
        <p className="text-gray-500 text-sm">{zh ? '加载中…' : 'Loading…'}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map(role => (
            <RoleCard
              key={role.id}
              role={role}
              lang={lang}
              onEdit={() => setModal({ open: true, role })}
              onDelete={() => handleDelete(role)}
            />
          ))}
        </div>
      )}

      {modal.open && (
        <RoleModal
          role={modal.role}
          lang={lang}
          onClose={() => setModal({ open: false, role: null })}
          onSaved={() => { setModal({ open: false, role: null }); load() }}
        />
      )}
    </div>
  )
}
