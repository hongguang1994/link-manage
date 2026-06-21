import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import SmsSend from './pages/SmsSend'
import SmsHistory from './pages/SmsHistory'
import ScheduledTasks from './pages/ScheduledTasks'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/send" element={<SmsSend />} />
          <Route path="/history" element={<SmsHistory />} />
          <Route path="/tasks" element={<ScheduledTasks />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
