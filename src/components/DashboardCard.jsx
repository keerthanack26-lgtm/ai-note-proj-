export default function DashboardCard({ icon, label, value, hint }) {
  return (
    <article className="card stat-card">
      <div className="stat-icon" aria-hidden="true">
        {icon}
      </div>
      <div>
        <span className="hint">{label}</span>
        <strong>{value}</strong>
        {hint ? <span className="hint">{hint}</span> : null}
      </div>
    </article>
  )
}
