export default function EmptyState({ title, message, action }) {
  return (
    <div className="empty">
      <h2>{title}</h2>
      <p className="hint">{message}</p>
      {action ? <div className="hero-actions">{action}</div> : null}
    </div>
  )
}
