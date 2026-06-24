import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { LayoutDashboard, Send, Clock, MessageSquare, Cpu, CreditCard, Users, LogOut } from 'lucide-react'
import { useModemStore } from '../store/modemStore'
import { useModemSocket } from '../hooks/useModemSocket'
import { useAuthStore } from '../store/authStore'
import clsx from 'clsx'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '总览' },
  { to: '/sim-cards', icon: CreditCard, label: 'SIM 卡管理' },
  { to: '/send', icon: Send, label: '发送短信' },
  { to: '/history', icon: MessageSquare, label: '短信记录' },
  { to: '/tasks', icon: Clock, label: '定时任务' },
]

export default function Layout() {
  useModemSocket()
  const modems = useModemStore(s => s.modems)
  const connected = modems.filter(m => m.status === 'connected').length
  const { user, clearAuth } = useAuthStore()
  const navigate = useNavigate()

  const logout = () => { clearAuth(); navigate('/login') }

  return (
    <div className="min-h-screen bg-gray-900 flex">
      <aside className="w-56 border-r border-gray-700 flex flex-col py-6 px-3 shrink-0 h-screen sticky top-0 overflow-y-auto" style={{ background: '#111827' }}>
        <div className="flex items-center gap-2 px-3 mb-8">
          <Cpu className="w-6 h-6 text-blue-400" />
          <span className="font-bold text-white text-lg">SimNexus</span>
        </div>

        <nav className="space-y-1 flex-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink key={to} to={to} end={to === '/'}
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                isActive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
              )}>
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
          {user?.role === 'admin' && (
            <NavLink to="/users"
              className={({ isActive }) => clsx(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                isActive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
              )}>
              <Users className="w-4 h-4" />
              用户管理
            </NavLink>
          )}
        </nav>

        <div className="border-t border-gray-700 pt-4 mt-4 px-3 space-y-3">
          <div className="text-xs text-gray-500">
            设备在线: <span className="text-green-400">{connected}</span> / {modems.length}
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-gray-300 font-medium truncate max-w-[110px]">{user?.username}</p>
              <p className="text-xs text-gray-500">{user?.role === 'admin' ? '管理员' : '普通用户'}</p>
            </div>
            <button onClick={logout} title="退出登录"
              className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-800 rounded transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
