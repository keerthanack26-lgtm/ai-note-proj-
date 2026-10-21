import { NavLink } from 'react-router-dom'
import { Mic } from 'lucide-react'

export default function Sidebar({ items, open, onClose }) {
  return (
    <>
      {open ? <div className="drawer-backdrop" onClick={onClose} /> : null}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <NavLink to="/" className="brand" onClick={onClose}>
          <span className="brand-mark">
            <Mic size={18} />
          </span>
          VoiceNote AI
        </NavLink>
        <nav aria-label="Primary">
          {items.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) => `side-link ${isActive ? 'active' : ''}`}
              onClick={onClose}
            >
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  )
}
