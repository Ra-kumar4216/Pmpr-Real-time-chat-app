import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { ProfileProvider } from './auth/ProfileContext'
import { ProfileGate, ProtectedRoute, PublicOnlyRoute } from './auth/RouteGuards'
import AppShell from './components/AppShell'
import { ToastProvider } from './components/Toast'
import { isSupabaseConfigured } from './lib/supabase'
import ChatPage from './pages/ChatPage'
import ConfigMissing from './pages/ConfigMissing'
import DashboardPage from './pages/DashboardPage'
import LoginPage from './pages/LoginPage'
import SettingsPage from './pages/SettingsPage'
import SetupPage from './pages/SetupPage'
import SignUpPage from './pages/SignUpPage'

export default function App() {
  if (!isSupabaseConfigured) return <ConfigMissing />

  return (
    <AuthProvider>
      <ProfileProvider>
        <ToastProvider>
          <Routes>
            <Route path="/login" element={<PublicOnlyRoute><LoginPage /></PublicOnlyRoute>} />
            <Route path="/signup" element={<PublicOnlyRoute><SignUpPage /></PublicOnlyRoute>} />
            <Route path="/setup" element={<ProtectedRoute><ProfileGate allowIncomplete><SetupPage /></ProfileGate></ProtectedRoute>} />
            <Route path="/app" element={<ProtectedRoute><ProfileGate><AppShell /></ProfileGate></ProtectedRoute>}>
              <Route index element={<DashboardPage view="chats" />} />
              <Route path="contacts" element={<DashboardPage view="contacts" />} />
              <Route path="chat/:partnerId" element={<ChatPage />} />
              <Route path="settings" element={<SettingsPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/app" replace />} />
          </Routes>
        </ToastProvider>
      </ProfileProvider>
    </AuthProvider>
  )
}
