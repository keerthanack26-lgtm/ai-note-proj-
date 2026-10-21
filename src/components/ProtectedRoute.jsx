import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import ErrorMessage from './ErrorMessage'
import LoadingSpinner from './LoadingSpinner'

export default function ProtectedRoute() {
  const { session, loading, configured, configError } = useAuth()
  if (!configured) {
    return (
      <main className="auth-shell">
        <ErrorMessage message={configError} />
      </main>
    )
  }
  if (loading) return <LoadingSpinner label="Checking your session" large />
  if (!session) return <Navigate to="/login" replace />
  return <Outlet />
}
