import { useEffect, useState } from 'react'
import { Plus, Trash2, KeyRound, ShieldCheck, ShieldOff, RefreshCw, X, Check, Settings2, UserCog } from 'lucide-react'
import clsx from 'clsx'
import {
  listUsersApi, createUserApi, updateUserApi, deleteUserApi,
  resetPasswordApi, changePasswordApi, getPermissionsApi, updatePermissionsApi,
  type UserOut, type PermissionOut,
} from '../api/auth'
import { listRolesApi, setUserRolesApi, type RoleOut } from '../api/roles'

const ROLE_NAME_EN: Record<string, string> = {
  '全功能用户': 'Full Access', '只读用户': 'Read-only User',
  '短信操作员': 'SMS Operator', '任务管理员': 'Task Manager', '客服': 'Customer Support',
}
const roleDisplayName = (role: RoleOut, lang: string) =>
  (lang !== 'zh' && role.is_system && ROLE_NAME_EN[role.name]) ? ROLE_NAME_EN[role.name] : role.name
import { getModemsApi, type Modem } from '../api/modems'
import { useAuthStore } from '../store/authStore'
import { useT } from '../i18n'
import { useLangStore } from '../store/langStore'

type Modal =
  | { type: 'create' }
  | { type: 'reset_pwd'; user: UserOut }
  | { type: 'change_pwd' }
  | { type: 'permissions'; user: UserOut }
  | { type: 'assign_role'; user: UserOut }
  | null

const RoleBadge = ({ role, t }: { role: string; t: ReturnType<typeof useT> }) => (
  <span className={clsx(
    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
    role === 'admin' ? 'bg-blue-500/20 text-blue-300' : 'bg-gray-500/20 text-gray-400'
  )}>
    {role === 'admin' ? <ShieldCheck className="w-3 h-3" /> : <ShieldOff className="w-3 h-3" />}
    {role === 'admin' ? t('users_role_admin') : t('users_role_user')}
  </span>
)

const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) => (
  <label className="flex items-center justify-between py-2 border-b border-gray-700/50 last:border-0 cursor-pointer">
    <span className="text-sm text-gray-300">{label}</span>
    <button type="button"
      onClick={() => onChange(!checked)}
      className={clsx('w-10 h-5 rounded-full transition-colors relative flex-shrink-0', checked ? 'bg-blue-600' : 'bg-gray-600')}>
      <span className={clsx('absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all', checked ? 'left-5' : 'left-0.5')} />
    </button>
  </label>
)

export default function Users() {
  const { user: me } = useAuthStore()
  const t = useT()
  const lang = useLangStore(s => s.lang)
  const [users, setUsers] = useState<UserOut[]>([])
  const [modems, setModems] = useState<Modem[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Modal>(null)
  const [err, setErr] = useState('')

  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user')
  const [pwdNew, setPwdNew] = useState('')
  const [pwdOld, setPwdOld] = useState('')

  const [roles, setRoles] = useState<RoleOut[]>([])
  const [selectedRoleIds, setSelectedRoleIds] = useState<number[]>([])

  const [perm, setPerm] = useState<PermissionOut>({
    can_view_sim: true, can_send_sms: true,
    can_manage_tasks: true, can_view_history: true,
    read_only: false, allowed_modem_ids: null,
  })
  const [allModems, setAllModems] = useState(true)

  const load = () => {
    setLoading(true)
    Promise.all([
      listUsersApi().then(r => setUsers(r.data)),
      getModemsApi().then(r => setModems(r.data)),
    ]).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])
  useEffect(() => { listRolesApi().then(r => setRoles(r.data)) }, [])

  const closeModal = () => {
    setModal(null); setErr('')
    setPwdNew(''); setPwdOld('')
    setNewUsername(''); setNewPassword(''); setNewRole('user')
    setSelectedRoleIds([])
  }

  const openAssignRole = (u: UserOut) => {
    setSelectedRoleIds((u.rbac_roles ?? []).map(r => r.id))
    setModal({ type: 'assign_role', user: u })
  }

  const handleAssignRole = async () => {
    if (modal?.type !== 'assign_role') return
    await setUserRolesApi(modal.user.id, selectedRoleIds)
    load(); closeModal()
  }

  const toggleRoleId = (id: number) =>
    setSelectedRoleIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  const openPermissions = async (u: UserOut) => {
    const res = await getPermissionsApi(u.id)
    const p = res.data
    setPerm(p)
    setAllModems(p.allowed_modem_ids === null)
    setModal({ type: 'permissions', user: u })
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('')
    try {
      await createUserApi({ username: newUsername, password: newPassword, role: newRole })
      load(); closeModal()
    } catch (e: any) { setErr(e.response?.data?.detail || t('create_fail')) }
  }

  const handleToggleActive = async (u: UserOut) => {
    await updateUserApi(u.id, { is_active: !u.is_active }); load()
  }

  const handleToggleRole = async (u: UserOut) => {
    await updateUserApi(u.id, { role: u.role === 'admin' ? 'user' : 'admin' }); load()
  }

  const handleDelete = async (u: UserOut) => {
    if (!confirm(`${t('delete')} 「${u.username}」？`)) return
    await deleteUserApi(u.id); load()
  }

  const handleResetPwd = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('')
    if (modal?.type !== 'reset_pwd') return
    try { await resetPasswordApi(modal.user.id, pwdNew); closeModal() }
    catch (e: any) { setErr(e.response?.data?.detail || t('reset_fail')) }
  }

  const handleChangePwd = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('')
    try {
      await changePasswordApi(pwdOld, pwdNew)
      closeModal()
      alert(lang === 'zh' ? '密码已修改，请重新登录' : 'Password changed. Please log in again.')
    }
    catch (e: any) { setErr(e.response?.data?.detail || t('change_fail')) }
  }

  const handleSavePerm = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('')
    if (modal?.type !== 'permissions') return
    try {
      const payload: PermissionOut = {
        ...perm,
        allowed_modem_ids: allModems ? null : (perm.allowed_modem_ids ?? []),
      }
      await updatePermissionsApi(modal.user.id, payload)
      load(); closeModal()
    } catch (e: any) { setErr(e.response?.data?.detail || t('users_save_fail')) }
  }

  const toggleModem = (id: number) => {
    const cur = perm.allowed_modem_ids ?? []
    setPerm(p => ({
      ...p,
      allowed_modem_ids: cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id],
    }))
  }

  const inputCls = "w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
  const labelCls = "block text-xs text-gray-400 mb-1"

  const modalTitle = () => {
    if (!modal) return ''
    if (modal.type === 'create') return t('create_user_title')
    if (modal.type === 'reset_pwd') return `${t('reset_pwd_title')} — ${(modal as any).user.username}`
    if (modal.type === 'change_pwd') return t('change_pwd_title')
    if (modal.type === 'permissions') return `${t('users_perms_title')} — ${(modal as any).user.username}`
    if (modal.type === 'assign_role') return `${lang === 'zh' ? '分配角色' : 'Assign Role'} — ${(modal as any).user.username}`
    return ''
  }

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{t('users_title')}</h1>
          <p className="text-sm text-gray-400 mt-0.5">{users.length} {lang === 'zh' ? '个账号' : 'accounts'}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setModal({ type: 'change_pwd' })}
            className="px-3 py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition-colors">
            {t('change_pwd_title')}
          </button>
          <button onClick={() => setModal({ type: 'create' })}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors">
            <Plus className="w-4 h-4" /> {t('users_create')}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 py-8 justify-center">
          <RefreshCw className="w-4 h-4 animate-spin" /> {t('users_loading')}
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900/60 text-gray-400 text-xs uppercase tracking-wider">
                {[t('users_col_id'), t('users_col_username'), t('users_col_role'), t('users_col_status'), t('users_col_created'), t('users_col_actions')].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr key={u.id} className={clsx('border-t border-gray-700', i % 2 === 1 && 'bg-gray-900/20')}>
                  <td className="px-4 py-3 text-gray-500 font-mono text-xs">{u.id}</td>
                  <td className="px-4 py-3">
                    <span className="font-medium text-white">{u.username}</span>
                    {u.id === me?.id && <span className="ml-2 text-xs text-blue-400">（{t('users_current_user')}）</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <RoleBadge role={u.role} t={t} />
                      {(u.rbac_roles ?? []).map(r => (
                        <span key={r.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-900/40 text-indigo-300 border border-indigo-700/40">
                          {roleDisplayName(r, lang)}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={clsx('text-xs font-medium', u.is_active ? 'text-green-400' : 'text-gray-500')}>
                      {u.is_active ? t('users_active') : t('users_inactive')}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(u.created_at).toLocaleString(lang === 'zh' ? 'zh-CN' : 'en-US')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      {u.role === 'user' && u.id !== me?.id && (<>
                        <button onClick={() => openAssignRole(u)} title={lang === 'zh' ? '分配角色' : 'Assign Role'}
                          className="p-1.5 text-gray-400 hover:text-indigo-400 hover:bg-gray-700 rounded transition-colors">
                          <UserCog className="w-4 h-4" />
                        </button>
                        <button onClick={() => openPermissions(u)} title={t('users_perms_title')}
                          className="p-1.5 text-gray-400 hover:text-purple-400 hover:bg-gray-700 rounded transition-colors">
                          <Settings2 className="w-4 h-4" />
                        </button>
                      </>)}
                      {u.id !== me?.id && (<>
                        <button onClick={() => handleToggleRole(u)}
                          title={u.role === 'admin' ? t('users_role_user') : t('users_role_admin')}
                          className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded transition-colors">
                          <ShieldCheck className="w-4 h-4" />
                        </button>
                        <button onClick={() => setModal({ type: 'reset_pwd', user: u })} title={t('reset_pwd_title')}
                          className="p-1.5 text-gray-400 hover:text-yellow-400 hover:bg-gray-700 rounded transition-colors">
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleToggleActive(u)}
                          title={u.is_active ? t('users_inactive') : t('users_active')}
                          className="p-1.5 text-gray-400 hover:text-orange-400 hover:bg-gray-700 rounded transition-colors">
                          {u.is_active ? <ShieldOff className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                        </button>
                        <button onClick={() => handleDelete(u)} title={t('delete')}
                          className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>)}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className={clsx(
            'bg-gray-800 border border-gray-700 rounded-2xl p-6 shadow-2xl w-full',
            modal.type === 'permissions' ? 'max-w-md' : 'max-w-sm'
          )}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">{modalTitle()}</h2>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-300"><X className="w-5 h-5" /></button>
            </div>

            {modal.type === 'create' && (
              <form onSubmit={handleCreate} className="space-y-4">
                <div><label className={labelCls}>{t('create_username')}</label>
                  <input className={inputCls} value={newUsername} onChange={e => setNewUsername(e.target.value)} required autoFocus />
                </div>
                <div><label className={labelCls}>{t('create_password')}</label>
                  <input className={inputCls} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required placeholder={lang === 'zh' ? '至少 6 位' : 'At least 6 chars'} />
                </div>
                <div><label className={labelCls}>{t('create_role')}</label>
                  <select className={inputCls} value={newRole} onChange={e => setNewRole(e.target.value as any)}>
                    <option value="user">{t('users_role_user')}</option>
                    <option value="admin">{t('users_role_admin')}</option>
                  </select>
                </div>
                {err && <p className="text-red-400 text-xs">{err}</p>}
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium transition-colors">{t('create_submit')}</button>
              </form>
            )}

            {modal.type === 'reset_pwd' && (
              <form onSubmit={handleResetPwd} className="space-y-4">
                <div><label className={labelCls}>{t('reset_new_pwd')}</label>
                  <input className={inputCls} type="password" value={pwdNew} onChange={e => setPwdNew(e.target.value)} required autoFocus placeholder={t('reset_new_pwd_ph')} />
                </div>
                {err && <p className="text-red-400 text-xs">{err}</p>}
                <button type="submit" className="w-full bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg py-2 text-sm font-medium transition-colors">{t('reset_submit')}</button>
              </form>
            )}

            {modal.type === 'change_pwd' && (
              <form onSubmit={handleChangePwd} className="space-y-4">
                <div><label className={labelCls}>{t('change_old_pwd')}</label>
                  <input className={inputCls} type="password" value={pwdOld} onChange={e => setPwdOld(e.target.value)} required autoFocus placeholder={t('change_old_pwd_ph')} />
                </div>
                <div><label className={labelCls}>{t('change_new_pwd')}</label>
                  <input className={inputCls} type="password" value={pwdNew} onChange={e => setPwdNew(e.target.value)} required placeholder={t('change_new_pwd_ph')} />
                </div>
                {err && <p className="text-red-400 text-xs">{err}</p>}
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium transition-colors">{t('change_submit')}</button>
              </form>
            )}

            {modal.type === 'permissions' && (
              <form onSubmit={handleSavePerm} className="space-y-5">
                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">{t('users_perms_ops')}</p>
                  <div className="bg-gray-900/50 rounded-lg px-3">
                    <Toggle checked={!perm.read_only} onChange={v => setPerm(p => ({ ...p, read_only: !v }))} label={t('users_perms_read_only')} />
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-gray-400 uppercase tracking-wider mb-2">{t('users_perms_modules')}</p>
                  <div className="bg-gray-900/50 rounded-lg px-3">
                    <Toggle checked={perm.can_view_sim} onChange={v => setPerm(p => ({ ...p, can_view_sim: v }))} label={t('users_perm_view_sim')} />
                    <Toggle checked={perm.can_view_history} onChange={v => setPerm(p => ({ ...p, can_view_history: v }))} label={t('users_perm_history')} />
                  </div>
                </div>

                <div className="bg-blue-900/20 border border-blue-500/20 rounded-lg px-4 py-3">
                  <p className="text-xs text-blue-300 font-medium mb-1">
                    {lang === 'zh' ? 'SIM卡使用权限' : 'SIM Card Access'}
                  </p>
                  <p className="text-xs text-gray-400">
                    {lang === 'zh'
                      ? '发短信、定时任务等使用权限须由用户在「SIM卡」页面申请，管理员在「SIM申请审批」页面审批后自动生效。'
                      : 'SMS sending and task management access must be applied by users and approved via SIM Requests.'}
                  </p>
                </div>

                {err && <p className="text-red-400 text-xs">{err}</p>}
                <button type="submit" className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-lg py-2 text-sm font-medium transition-colors">{t('users_save_perms')}</button>
              </form>
            )}

            {modal.type === 'assign_role' && (
              <div className="space-y-4">
                <p className="text-xs text-gray-400">
                  {lang === 'zh'
                    ? '可同时勾选多个角色，权限取所有角色的并集。全部取消勾选则恢复独立权限设置。'
                    : 'Select multiple roles. Permissions are the union of all selected roles. Uncheck all to revert to individual permissions.'}
                </p>

                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {roles.map(r => {
                    const checked = selectedRoleIds.includes(r.id)
                    return (
                      <label key={r.id} className={clsx(
                        'flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
                        checked ? 'border-indigo-500 bg-indigo-900/20' : 'border-gray-700 bg-gray-900/40 hover:border-gray-600'
                      )}>
                        <input type="checkbox" checked={checked} onChange={() => toggleRoleId(r.id)}
                          className="mt-0.5 w-4 h-4 accent-indigo-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-white">{roleDisplayName(r, lang)}</span>
                            {r.read_only && <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-900/60 text-yellow-300">{lang === 'zh' ? '只读' : 'Read-only'}</span>}
                            {r.can_support && <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-900/60 text-purple-300">{lang === 'zh' ? '客服' : 'Support'}</span>}
                          </div>
                          <div className="flex gap-1 mt-1.5 flex-wrap">
                            {[
                              { label: lang === 'zh' ? '查看SIM' : 'SIM', on: r.can_view_sim },
                              { label: lang === 'zh' ? '发短信' : 'SMS', on: r.can_send_sms },
                              { label: lang === 'zh' ? '管理任务' : 'Tasks', on: r.can_manage_tasks },
                              { label: lang === 'zh' ? '查看记录' : 'History', on: r.can_view_history },
                            ].map(p => (
                              <span key={p.label} className={clsx('text-[10px] px-1.5 py-0.5 rounded-full',
                                p.on ? 'bg-green-900/50 text-green-400' : 'bg-gray-700/50 text-gray-600 line-through')}>
                                {p.label}
                              </span>
                            ))}
                          </div>
                        </div>
                      </label>
                    )
                  })}
                </div>

                {selectedRoleIds.length > 0 && (() => {
                  const sel = roles.filter(r => selectedRoleIds.includes(r.id))
                  return (
                    <div className="bg-gray-900/60 rounded-lg p-3 text-xs">
                      <p className="text-gray-500 mb-1.5">{lang === 'zh' ? '合并后有效权限：' : 'Merged permissions:'}</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {[
                          { label: lang === 'zh' ? '查看SIM' : 'View SIM', on: sel.some(r => r.can_view_sim) },
                          { label: lang === 'zh' ? '发短信' : 'SMS', on: sel.some(r => r.can_send_sms) },
                          { label: lang === 'zh' ? '管理任务' : 'Tasks', on: sel.some(r => r.can_manage_tasks) },
                          { label: lang === 'zh' ? '查看记录' : 'History', on: sel.some(r => r.can_view_history) },
                          { label: lang === 'zh' ? '客服' : 'Support', on: sel.some(r => r.can_support) },
                        ].map(p => (
                          <span key={p.label} className={clsx('px-2 py-0.5 rounded-full',
                            p.on ? 'bg-green-900/60 text-green-300' : 'bg-gray-700 text-gray-500 line-through')}>
                            {p.label}
                          </span>
                        ))}
                        {sel.every(r => r.read_only) && <span className="px-2 py-0.5 rounded-full bg-yellow-900/60 text-yellow-300">{lang === 'zh' ? '只读' : 'Read-only'}</span>}
                      </div>
                    </div>
                  )
                })()}

                <button onClick={handleAssignRole}
                  className="w-full bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5">
                  <Check className="w-4 h-4" />
                  {lang === 'zh'
                    ? `确认分配（已选 ${selectedRoleIds.length} 个角色）`
                    : `Confirm (${selectedRoleIds.length} role${selectedRoleIds.length !== 1 ? 's' : ''})`}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
