import { Link } from 'react-router-dom'

export default function NotFoundPage() {
  return (
    <main className="auth-shell">
      <section className="card auth-card">
        <h1>Page not found</h1>
        <p>That address is not part of VoiceNote AI.</p>
        <Link className="btn btn-primary" to="/">
          Go to the home page
        </Link>
      </section>
    </main>
  )
}
