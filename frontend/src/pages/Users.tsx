import { useEffect, useState } from 'react'
import { Plus, Trash2, KeyRound, ShieldCheck, ShieldOff, RefreshCw, X, Check } from 'lucide-react'
import clsx from 'clsx'
import {
  listUsersApi, createUserApi, updateUserApi, deleteUserApi,
  resetPasswordApi, changePasswordApi, type UserOut,
} from '../api/auth'
import { useAuthStore } from '../store/authStore'

type Modal =
  | { type: 'create' }
  | { type: 'reset_pwd'; user: UserOut }
  | { type: 'change_pwd' }
  | null

const RoleBadge = ({ role }: { role: string }) => (
  <span className={clsx(
    'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium',
    role === 'admin'
      ? 'bg-blue-500/20 text-blue-300'
      : 'bg-gray-500/20 text-gray-400'
  )}>
    {role === 'admin' ? <ShieldCheck className="w-3 h-3" /> : <ShieldOff className="w-3 h-3" />}
    {role === 'admin' ? '管理员' : '普通用户'}
  </span>
)

export default function Users() {
  const { user: me } = useAuthStore()
  const [users, setUsers] = useState<UserOut[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<Modal>(null)
  const [err, setErr] = useState('')

  // create form
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'user'>('user')

  // reset / change pwd form
  const [pwdNew, setPwdNew] = useState('')
  const [pwdOld, setPwdOld] = useState('')

  const load = () => {
    setLoading(true)
    listUsersApi().then(r => setUsers(r.data)).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const closeModal = () => { setModal(null); setErr(''); setPwdNew(''); setPwdOld(''); setNewUsername(''); setNewPassword(''); setNewRole('user') }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('')
    try {
      await createUserApi({ username: newUsername, password: newPassword, role: newRole })
      load(); closeModal()
    } catch (e: any) { setErr(e.response?.data?.detail || '创建失败') }
  }

  const handleToggleActive = async (u: UserOut) => {
    await updateUserApi(u.id, { is_active: !u.is_active })
    load()
  }

  const handleToggleRole = async (u: UserOut) => {
    await updateUserApi(u.id, { role: u.role === 'admin' ? 'user' : 'admin' })
    load()
  }

  const handleDelete = async (u: UserOut) => {
    if (!confirm(`确认删除用户「${u.username}」？`)) return
    await deleteUserApi(u.id)
    load()
  }

  const handleResetPwd = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('')
    if (modal?.type !== 'reset_pwd') return
    try {
      await resetPasswordApi(modal.user.id, pwdNew)
      closeModal()
    } catch (e: any) { setErr(e.response?.data?.detail || '重置失败') }
  }

  const handleChangePwd = async (e: React.FormEvent) => {
    e.preventDefault(); setErr('')
    try {
      await changePasswordApi(pwdOld, pwdNew)
      closeModal()
      alert('密码已修改，请重新登录')
    } catch (e: any) { setErr(e.response?.data?.detail || '修改失败') }
  }

  const inputCls = "w-full bg-gray-900 border border-gray-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
  const labelCls = "block text-xs text-gray-400 mb-1"

  return (
    <div className="p-6 space-y-5 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">用户管理</h1>
          <p className="text-sm text-gray-400 mt-0.5">共 {users.length} 个账号</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setModal({ type: 'change_pwd' })}
            className="px-3 py-2 bg-gray-800 border border-gray-700 text-gray-300 rounded-lg text-sm hover:bg-gray-700 transition-colors">
            修改我的密码
          </button>
          <button onClick={() => setModal({ type: 'create' })}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors">
            <Plus className="w-4 h-4" /> 新建用户
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 py-8 justify-center">
          <RefreshCw className="w-4 h-4 animate-spin" /> 加载中…
        </div>
      ) : (
        <div className="bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-900/60 text-gray-400 text-xs uppercase tracking-wider">
                {['ID', '用户名', '角色', '状态', '创建时间', '操作'].map(h => (
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
                    {u.id === me?.id && <span className="ml-2 text-xs text-blue-400">（我）</span>}
                  </td>
                  <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-4 py-3">
                    <span className={clsx('text-xs font-medium', u.is_active ? 'text-green-400' : 'text-gray-500')}>
                      {u.is_active ? '启用' : '已禁用'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs">
                    {new Date(u.created_at).toLocaleString('zh-CN')}
                  </td>
                  <td className="px-4 py-3">
                    {u.id !== me?.id && (
                      <div className="flex items-center gap-2">
                        <button onClick={() => handleToggleRole(u)} title={u.role === 'admin' ? '降为普通用户' : '升为管理员'}
                          className="p-1.5 text-gray-400 hover:text-blue-400 hover:bg-gray-700 rounded transition-colors">
                          <ShieldCheck className="w-4 h-4" />
                        </button>
                        <button onClick={() => setModal({ type: 'reset_pwd', user: u })} title="重置密码"
                          className="p-1.5 text-gray-400 hover:text-yellow-400 hover:bg-gray-700 rounded transition-colors">
                          <KeyRound className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleToggleActive(u)} title={u.is_active ? '禁用' : '启用'}
                          className="p-1.5 text-gray-400 hover:text-orange-400 hover:bg-gray-700 rounded transition-colors">
                          {u.is_active ? <ShieldOff className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                        </button>
                        <button onClick={() => handleDelete(u)} title="删除"
                          className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-gray-700 rounded transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal overlay */}
      {modal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-800 border border-gray-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-white">
                {modal.type === 'create' && '新建用户'}
                {modal.type === 'reset_pwd' && `重置密码 — ${(modal as any).user.username}`}
                {modal.type === 'change_pwd' && '修改我的密码'}
              </h2>
              <button onClick={closeModal} className="text-gray-500 hover:text-gray-300"><X className="w-5 h-5" /></button>
            </div>

            {modal.type === 'create' && (
              <form onSubmit={handleCreate} className="space-y-4">
                <div><label className={labelCls}>用户名</label>
                  <input className={inputCls} value={newUsername} onChange={e => setNewUsername(e.target.value)} required autoFocus placeholder="3-20 个字符" />
                </div>
                <div><label className={labelCls}>密码</label>
                  <input className={inputCls} type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required placeholder="至少 6 位" />
                </div>
                <div><label className={labelCls}>角色</label>
                  <select className={inputCls} value={newRole} onChange={e => setNewRole(e.target.value as any)}>
                    <option value="user">普通用户</option>
                    <option value="admin">管理员</option>
                  </select>
                </div>
                {err && <p className="text-red-400 text-xs">{err}</p>}
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium transition-colors">创建</button>
              </form>
            )}

            {modal.type === 'reset_pwd' && (
              <form onSubmit={handleResetPwd} className="space-y-4">
                <div><label className={labelCls}>新密码</label>
                  <input className={inputCls} type="password" value={pwdNew} onChange={e => setPwdNew(e.target.value)} required autoFocus placeholder="至少 6 位" />
                </div>
                {err && <p className="text-red-400 text-xs">{err}</p>}
                <button type="submit" className="w-full bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg py-2 text-sm font-medium transition-colors">重置密码</button>
              </form>
            )}

            {modal.type === 'change_pwd' && (
              <form onSubmit={handleChangePwd} className="space-y-4">
                <div><label className={labelCls}>原密码</label>
                  <input className={inputCls} type="password" value={pwdOld} onChange={e => setPwdOld(e.target.value)} required autoFocus />
                </div>
                <div><label className={labelCls}>新密码</label>
                  <input className={inputCls} type="password" value={pwdNew} onChange={e => setPwdNew(e.target.value)} required placeholder="至少 6 位" />
                </div>
                {err && <p className="text-red-400 text-xs">{err}</p>}
                <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg py-2 text-sm font-medium transition-colors">修改密码</button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
