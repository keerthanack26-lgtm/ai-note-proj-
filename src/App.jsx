import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AdminRoute from './components/AdminRoute'
import ProtectedRoute from './components/ProtectedRoute'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './context/ToastContext'
import AdminLayout from './layouts/AdminLayout'
import AppLayout from './layouts/AppLayout'
import AdminLoginPage from './pages/AdminLoginPage'
import AdminRegisterPage from './pages/AdminRegisterPage'
import AdminAnalyticsPage from './pages/admin/AdminAnalyticsPage'
import AdminAuditLogsPage from './pages/admin/AdminAuditLogsPage'
import AdminHealthPage from './pages/admin/AdminHealthPage'
import AdminIssuesPage from './pages/admin/AdminIssuesPage'
import AdminJobDetailPage from './pages/admin/AdminJobDetailPage'
import AdminJobsPage from './pages/admin/AdminJobsPage'
import AdminOverviewPage from './pages/admin/AdminOverviewPage'
import AdminProfilePage from './pages/admin/AdminProfilePage'
import AdminSettingsPage from './pages/admin/AdminSettingsPage'
import AdminUserDetailPage from './pages/admin/AdminUserDetailPage'
import AdminUsersPage from './pages/admin/AdminUsersPage'
import DashboardPage from './pages/DashboardPage'
import ForgotPasswordPage from './pages/ForgotPasswordPage'
import HistoryPage from './pages/HistoryPage'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import NoteDetailPage from './pages/NoteDetailPage'
import NoteEditorPage from './pages/NoteEditorPage'
import NotesPage from './pages/NotesPage'
import NotFoundPage from './pages/NotFoundPage'
import ProcessingPage from './pages/ProcessingPage'
import RecordPage from './pages/RecordPage'
import RegisterPage from './pages/RegisterPage'
import ReportIssuePage from './pages/ReportIssuePage'
import ResetPasswordPage from './pages/ResetPasswordPage'
import SettingsPage from './pages/SettingsPage'
import TasksPage from './pages/TasksPage'
import UnauthorizedPage from './pages/UnauthorizedPage'
import UploadPage from './pages/UploadPage'

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <BrowserRouter>
          <a className="skip-link" href="#main">
            Skip to content
          </a>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/admin/register" element={<AdminRegisterPage />} />
            <Route path="/admin/login" element={<AdminLoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />
            <Route element={<ProtectedRoute />}>
              <Route element={<AppLayout />}>
                <Route path="/dashboard" element={<DashboardPage />} />
                <Route path="/record" element={<RecordPage />} />
                <Route path="/upload" element={<UploadPage />} />
                <Route path="/processing/:jobId" element={<ProcessingPage />} />
                <Route path="/notes" element={<NotesPage />} />
                <Route path="/notes/:noteId" element={<NoteDetailPage />} />
                <Route path="/notes/:noteId/edit" element={<NoteEditorPage />} />
                <Route path="/tasks" element={<TasksPage />} />
                <Route path="/history" element={<HistoryPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/report-issue" element={<ReportIssuePage />} />
              </Route>
            </Route>
            <Route element={<AdminRoute />}>
              <Route element={<AdminLayout />}>
                <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />
                <Route path="/admin/dashboard" element={<AdminOverviewPage />} />
                <Route path="/admin/users" element={<AdminUsersPage />} />
                <Route path="/admin/users/:userId" element={<AdminUserDetailPage />} />
                <Route path="/admin/jobs" element={<AdminJobsPage />} />
                <Route path="/admin/jobs/:jobId" element={<AdminJobDetailPage />} />
                <Route path="/admin/analytics" element={<AdminAnalyticsPage />} />
                <Route path="/admin/health" element={<AdminHealthPage />} />
                <Route path="/admin/issues" element={<AdminIssuesPage />} />
                <Route path="/admin/settings" element={<AdminSettingsPage />} />
                <Route path="/admin/audit-logs" element={<AdminAuditLogsPage />} />
                <Route path="/admin/profile" element={<AdminProfilePage />} />
              </Route>
            </Route>
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </AuthProvider>
  )
}
