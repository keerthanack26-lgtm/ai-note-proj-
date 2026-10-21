import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { AudioLines, FileText, LayoutDashboard, ListChecks, Mic, Settings, Shield, Upload } from 'lucide-react'
import Navbar from '../components/Navbar'
import Sidebar from '../components/Sidebar'
import { useAuth } from '../context/AuthContext'

const USER_NAV = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/record', label: 'Record', icon: Mic },
  { to: '/upload', label: 'Upload', icon: Upload },
  { to: '/notes', label: 'Notes', icon: FileText },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/history', label: 'History', icon: AudioLines },
  { to: '/settings', label: 'Settings', icon: Settings },
]

const BOTTOM = [
  { to: '/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/record', label: 'Record', icon: Mic },
  { to: '/notes', label: 'Notes', icon: FileText },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export default function AppLayout() {
  const [open, setOpen] = useState(false)
  const { profile } = useAuth()
  const items = profile?.role === 'admin' ? [...USER_NAV, { to: '/admin/dashboard', label: 'Admin', icon: Shield }] : USER_NAV

  return (
    <div className="app-shell">
      <Sidebar items={items} open={open} onClose={() => setOpen(false)} />
      <div className="main-column">
        <Navbar onMenu={() => setOpen(true)} />
        <main className="content" id="main">
          <Outlet />
        </main>
        <nav className="bottom-nav" aria-label="Mobile">
          {BOTTOM.map((item) => (
            <NavLink key={item.to} to={item.to} className={({ isActive }) => `bottom-link ${isActive ? 'active' : ''}`}>
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
