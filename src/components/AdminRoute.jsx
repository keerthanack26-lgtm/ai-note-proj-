import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import LoadingSpinner from './LoadingSpinner'

export default function AdminRoute() {
  const { session, profile, loading, configured } = useAuth()
  if (!configured) return <Navigate to="/login" replace />
  if (loading) return <LoadingSpinner label="Checking access" large />
  if (!session) return <Navigate to="/login" replace />
  if (profile?.role !== 'admin') return <Navigate to="/unauthorized" replace />
  return <Outlet />
}
