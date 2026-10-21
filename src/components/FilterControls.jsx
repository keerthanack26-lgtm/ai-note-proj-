export default function FilterControls({ filters }) {
  return (
    <div className="filters">
      {filters.map((filter) => (
        <label className="field" key={filter.label}>
          <span>{filter.label}</span>
          {filter.type === 'date' ? (
            <input className="input" type="date" value={filter.value} onChange={(event) => filter.onChange(event.target.value)} />
          ) : (
            <select className="select" value={filter.value} onChange={(event) => filter.onChange(event.target.value)}>
              {filter.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </label>
      ))}
    </div>
  )
}
