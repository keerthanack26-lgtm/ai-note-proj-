import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ConfirmationModal from '../../components/ConfirmationModal'
import ErrorMessage from '../../components/ErrorMessage'
import LoadingSpinner from '../../components/LoadingSpinner'
import StatCard from '../../components/StatCard'
import StatusBadge from '../../components/StatusBadge'
import { useToast } from '../../context/ToastContext'
import { adminAction } from '../../services/admin'
import { errorText } from '../../utils/errors'
import { formatDateTime } from '../../utils/format'

export default function AdminUserDetailPage() {
  const { userId } = useParams()
  const toast = useToast()
  const [user, setUser] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [confirm, setConfirm] = useState(false)
  const [confirmRole, setConfirmRole] = useState(false)
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    setError('')
    try {
      setUser(await adminAction('get-user', { userId }))
    } catch (err) {
      setError(errorText(err, 'This user could not be loaded.'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
  }, [userId])

  async function toggleStatus() {
    setBusy(true)
    try {
      const next = user.account_status === 'active' ? 'deactivated' : 'active'
      await adminAction('set-status', { userId, accountStatus: next })
      toast.push(`Account ${next}.`, 'success')
      setConfirm(false)
      await load()
    } catch (err) {
      toast.push(errorText(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  async function toggleRole() {
    setBusy(true)
    try {
      const next = user.role === 'admin' ? 'user' : 'admin'
      await adminAction('set-role', { userId, role: next })
      toast.push(next === 'admin' ? 'Account promoted to administrator.' : 'Administrator role removed.', 'success')
      setConfirmRole(false)
      await load()
    } catch (err) {
      toast.push(errorText(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <LoadingSpinner label="Loading user" large />

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <Link className="hint" to="/admin/users">← Users</Link>
          <h1>{user?.full_name || 'User'}</h1>
          <p className="lede">Account metadata only. Note content is not available here.</p>
        </div>
        {user ? (
          <div className="card-actions">
            {user.role !== 'admin' ? (
              <button className="btn btn-secondary" type="button" onClick={() => setConfirmRole(true)}>
                Make administrator
              </button>
            ) : null}
            <button className={`btn ${user.account_status === 'active' ? 'btn-danger' : 'btn-secondary'}`} type="button" onClick={() => setConfirm(true)}>
              {user.account_status === 'active' ? 'Deactivate' : 'Activate'}
            </button>
          </div>
        ) : null}
      </header>
      <ErrorMessage message={error} onRetry={load} />
      {user ? (
        <>
          <div className="stat-grid">
            <StatCard label="Status" value={<StatusBadge value={user.account_status} />} />
            <StatCard label="Role" value={user.role} />
            <StatCard label="Recordings" value={user.recordings} />
            <StatCard label="Notes" value={user.notes} />
            <StatCard label="Tasks" value={user.tasks} />
            <StatCard label="Jobs" value={user.jobs} />
          </div>
          <article className="card stack">
            <p><strong>Email:</strong> {user.email}</p>
            <p><strong>User ID:</strong> <span className="mono">{user.id}</span></p>
            <p><strong>Registered:</strong> {formatDateTime(user.created_at)}</p>
            <p><strong>Last sign-in:</strong> {formatDateTime(user.lastSignInAt)}</p>
            <p><strong>Email confirmed:</strong> {formatDateTime(user.emailConfirmedAt)}</p>
          </article>
        </>
      ) : null}
      <ConfirmationModal
        open={confirm}
        title={user?.account_status === 'active' ? 'Deactivate account?' : 'Activate account?'}
        message="Deactivation bans the Auth session. Activation clears the ban and restores access."
        confirmLabel={user?.account_status === 'active' ? 'Deactivate' : 'Activate'}
        danger={user?.account_status === 'active'}
        busy={busy}
        onConfirm={toggleStatus}
        onClose={() => setConfirm(false)}
      />
      <ConfirmationModal
        open={confirmRole}
        title="Make this account an administrator?"
        message="They will be able to open the admin panel. Private notes stay hidden from admins."
        confirmLabel="Make administrator"
        busy={busy}
        onConfirm={toggleRole}
        onClose={() => setConfirmRole(false)}
      />
    </div>
  )
}
