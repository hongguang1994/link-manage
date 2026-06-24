import { NavLink, Outlet } from 'react-router-dom'
import { LayoutDashboard, Send, Clock, MessageSquare, Cpu } from 'lucide-react'
import { useModemStore } from '../store/modemStore'
import { useModemSocket } from '../hooks/useModemSocket'
import clsx from 'clsx'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: '总览' },
  { to: '/send', icon: Send, label: '发送短信' },
  { to: '/history', icon: MessageSquare, label: '短信记录' },
  { to: '/tasks', icon: Clock, label: '定时任务' },
]

export default function Layout() {
  useModemSocket()
  const modems = useModemStore(s => s.modems)
  const connected = modems.filter(m => m.status === 'connected').length

  return (
    <div className="min-h-screen bg-gray-900 flex">
      {/* Sidebar */}
      <aside className="w-56 bg-gray-850 border-r border-gray-700 flex flex-col py-6 px-3 shrink-0" style={{ background: '#111827' }}>
        <div className="flex items-center gap-2 px-3 mb-8">
          <Cpu className="w-6 h-6 text-blue-400" />
          <span className="font-bold text-white text-lg">SimNexus</span>
        </div>

        <nav className="space-y-1 flex-1">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors',
                  isActive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white hover:bg-gray-800'
                )
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="px-3 text-xs text-gray-500 border-t border-gray-700 pt-4 mt-4">
          <p>设备在线: <span className="text-green-400">{connected}</span> / {modems.length}</p>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  )
}
