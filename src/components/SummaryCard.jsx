export default function SummaryCard({ title, children, actions }) {
  return (
    <section className="card stack">
      <div className="page-header">
        <h2>{title}</h2>
        {actions}
      </div>
      {children}
    </section>
  )
}
