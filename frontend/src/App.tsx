import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider } from './contexts/AuthContext'
import { OrgProvider } from './contexts/OrgContext'
import ChatPage from './pages/ChatPage'
import ContactsPage from './pages/ContactsPage'
import InboxPage from './pages/InboxPage'
import LoginPage from './pages/LoginPage'
import RegisterPage from './pages/RegisterPage'
import SharePage from './pages/SharePage'

function ProtectedChatPage() {
  return (
    <ProtectedRoute>
      <ChatPage />
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <OrgProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/share/:token" element={<SharePage />} />
            <Route path="/contacts" element={<ProtectedRoute><ContactsPage /></ProtectedRoute>} />
            <Route path="/inbox" element={<ProtectedRoute><InboxPage /></ProtectedRoute>} />
            <Route path="/chat/:conversationId/files" element={<ProtectedChatPage />} />
            <Route path="/chat/:conversationId" element={<ProtectedChatPage />} />
            <Route path="/" element={<ProtectedChatPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </OrgProvider>
    </AuthProvider>
  )
}
