import EmptyState from './EmptyState'

export default function DataTable({ columns, rows, rowKey = 'id', emptyTitle = 'No rows', emptyMessage = 'Nothing matched these filters.' }) {
  if (!rows?.length) {
    return <EmptyState title={emptyTitle} message={emptyMessage} />
  }
  return (
    <div className="table-wrap card">
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[rowKey]}>
              {columns.map((column) => (
                <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
