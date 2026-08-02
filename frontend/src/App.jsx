import { Routes, Route, Navigate } from 'react-router-dom'
import Chatbot from './pages/Chatbot.jsx'
import Landing from './pages/Landing.jsx'
import AdminDashboard from './pages/admin/Dashboard.jsx'
import AdminUsers from './pages/admin/Users.jsx'
import AdminChats from './pages/admin/Chats.jsx'
import AdminChatDetail from './pages/admin/ChatDetail.jsx'
import AdminLayout from './components/AdminLayout.jsx'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/info/main" element={<Landing />} />
      <Route path="/home" element={<Navigate to="/chatbot" replace />} />
      <Route path="/chatbot" element={<Chatbot />} />
      <Route path="/chatbot/:chatId" element={<Chatbot />} />
      <Route path="/chat/:chatId" element={<Chatbot />} />

      <Route path="/admin" element={<AdminLayout />}>
        <Route index element={<Navigate to="/admin/dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="chats" element={<AdminChats />} />
        <Route path="chat-detail/:chatId" element={<AdminChatDetail />} />
      </Route>

      <Route path="/dashboard" element={<Navigate to="/admin/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
