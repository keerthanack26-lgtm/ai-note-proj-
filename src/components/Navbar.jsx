import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Menu, Search } from 'lucide-react'
import { useAuth } from '../context/AuthContext'

export default function Navbar({ onMenu, admin = false }) {
  const { profile, signOut } = useAuth()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  return (
    <header className="topbar">
      <button className="icon-btn menu-toggle" type="button" aria-label="Open menu" onClick={onMenu}>
        <Menu size={18} />
      </button>
      <form
        className="search-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (admin) navigate(`/admin/users?q=${encodeURIComponent(query)}`)
          else navigate(`/notes?q=${encodeURIComponent(query)}`)
        }}
      >
        <label className="password-wrap" style={{ width: '100%' }}>
          <span className="sr-only" style={{ position: 'absolute', left: -9999 }}>
            Search
          </span>
          <Search size={16} style={{ position: 'absolute', left: 12, top: 12 }} />
          <input
            className="input"
            style={{ paddingLeft: 36 }}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={admin ? 'Search users' : 'Search notes'}
            aria-label={admin ? 'Search users' : 'Search notes'}
          />
        </label>
      </form>
      <div className="profile-pop">
        <button className="btn btn-ghost btn-small" type="button" onClick={() => setOpen((value) => !value)}>
          {profile?.full_name || 'Account'}
        </button>
        {open ? (
          <div className="profile-menu">
            <Link to="/settings" onClick={() => setOpen(false)}>
              Profile and settings
            </Link>
            {profile?.role === 'admin' ? (
              <Link to={admin ? '/admin/profile' : '/admin/dashboard'} onClick={() => setOpen(false)}>
                {admin ? 'Admin profile' : 'Admin dashboard'}
              </Link>
            ) : null}
            <button
              type="button"
              onClick={async () => {
                await signOut()
                navigate(admin ? '/admin/login' : '/login')
              }}
            >
              Log out
            </button>
          </div>
        ) : null}
      </div>
    </header>
  )
}
