import { Search } from 'lucide-react'

export default function SearchBar({ value, onChange, placeholder = 'Search', onSubmit, label = 'Search' }) {
  return (
    <form
      className="search-form"
      onSubmit={(event) => {
        event.preventDefault()
        onSubmit?.(value)
      }}
    >
      <label className="field" style={{ width: '100%' }}>
        <span className="hint">{label}</span>
        <span className="password-wrap">
          <Search size={16} style={{ position: 'absolute', left: 12, top: 14, color: 'var(--muted)' }} />
          <input
            className="input"
            style={{ paddingLeft: 36 }}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            placeholder={placeholder}
          />
        </span>
      </label>
    </form>
  )
}
