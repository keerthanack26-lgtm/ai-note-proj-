export default function StatCard({ label, value, hint }) {
  return (
    <article className="card stat-card">
      <span className="hint">{label}</span>
      <strong>{value ?? '—'}</strong>
      {hint ? <p className="hint">{hint}</p> : null}
    </article>
  )
}
