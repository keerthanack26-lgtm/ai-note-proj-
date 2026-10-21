export default function AnalyticsChart({
  title,
  series = [],
  lines = [{ key: 'count', color: '#1769E8', label: 'Count' }],
  emptyMessage = 'No recorded data for this period.',
}) {
  const width = 640
  const height = 220
  const pad = { top: 16, right: 16, bottom: 28, left: 36 }
  const keys = lines.map((line) => line.key)
  const values = series.flatMap((row) => keys.map((key) => Number(row[key]) || 0))
  const max = Math.max(1, ...values)
  const innerW = width - pad.left - pad.right
  const innerH = height - pad.top - pad.bottom
  const pointsFor = (key) => series.map((row, index) => {
    const x = pad.left + (series.length <= 1 ? innerW / 2 : (index / (series.length - 1)) * innerW)
    const y = pad.top + innerH - ((Number(row[key]) || 0) / max) * innerH
    return `${x},${y}`
  }).join(' ')

  return (
    <article className="card analytics-chart">
      <div className="analytics-chart-head">
        <h2>{title}</h2>
        <div className="chart-legend">
          {lines.map((line) => (
            <span key={line.key} className="chart-legend-item">
              <i style={{ background: line.color }} />
              {line.label}
            </span>
          ))}
        </div>
      </div>
      {!series.length ? (
        <p className="hint">{emptyMessage}</p>
      ) : (
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} className="chart-svg">
          {[0, 0.5, 1].map((ratio) => {
            const y = pad.top + innerH - ratio * innerH
            return (
              <g key={ratio}>
                <line x1={pad.left} x2={width - pad.right} y1={y} y2={y} className="chart-grid" />
                <text x={4} y={y + 4} className="chart-axis">{Math.round(max * ratio)}</text>
              </g>
            )
          })}
          {lines.map((line) => (
            <polyline key={line.key} fill="none" stroke={line.color} strokeWidth="2.5" points={pointsFor(line.key)} />
          ))}
          {series.length <= 14
            ? series.map((row, index) => {
              const x = pad.left + (series.length <= 1 ? innerW / 2 : (index / (series.length - 1)) * innerW)
              return (
                <text key={row.date || index} x={x} y={height - 6} textAnchor="middle" className="chart-axis">
                  {String(row.date || '').slice(5)}
                </text>
              )
            })
            : null}
        </svg>
      )}
    </article>
  )
}
