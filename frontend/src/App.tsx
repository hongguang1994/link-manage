import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import SmsSend from './pages/SmsSend'
import SmsHistory from './pages/SmsHistory'
import ScheduledTasks from './pages/ScheduledTasks'
import SimDetail from './pages/SimDetail'
import SimCards from './pages/SimCards'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/sim-cards" element={<SimCards />} />
          <Route path="/modems/:id" element={<SimDetail />} />
          <Route path="/send" element={<SmsSend />} />
          <Route path="/history" element={<SmsHistory />} />
          <Route path="/tasks" element={<ScheduledTasks />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
