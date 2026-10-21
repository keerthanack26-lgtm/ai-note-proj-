import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function UnauthorizedPage() {
  const { session } = useAuth()
  return (
    <main className="auth-shell">
      <section className="card auth-card">
        <h1>You do not have access</h1>
        <p>This area is limited to administrator accounts. Hiding a link is not what protects it; the server checks the role as well.</p>
        <Link className="btn btn-primary" to={session ? '/dashboard' : '/login'}>
          {session ? 'Back to your dashboard' : 'Log in'}
        </Link>
      </section>
    </main>
  )
}
