import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import SmsSend from './pages/SmsSend'
import SmsHistory from './pages/SmsHistory'
import ScheduledTasks from './pages/ScheduledTasks'
import SimDetail from './pages/SimDetail'
import SimCards from './pages/SimCards'
import Users from './pages/Users'
import Login from './pages/Login'
import { useAuthStore } from './store/authStore'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = useAuthStore(s => s.token)
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const user = useAuthStore(s => s.user)
  if (user?.role !== 'admin') return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sim-cards" element={<SimCards />} />
          <Route path="/modems/:id" element={<SimDetail />} />
          <Route path="/send" element={<SmsSend />} />
          <Route path="/history" element={<SmsHistory />} />
          <Route path="/tasks" element={<ScheduledTasks />} />
          <Route path="/users" element={<RequireAdmin><Users /></RequireAdmin>} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
