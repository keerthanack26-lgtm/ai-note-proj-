import { useState } from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import {
  Activity,
  ClipboardList,
  FileWarning,
  LayoutDashboard,
  ScrollText,
  Settings,
  Shield,
  UserCircle2,
  Users,
  Workflow,
} from 'lucide-react'
import Navbar from '../components/Navbar'
import Sidebar from '../components/Sidebar'

const ADMIN_NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/jobs', label: 'Jobs', icon: Workflow },
  { to: '/admin/analytics', label: 'Analytics', icon: Activity },
  { to: '/admin/health', label: 'Health', icon: Shield },
  { to: '/admin/issues', label: 'Issues', icon: FileWarning },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
  { to: '/admin/audit-logs', label: 'Audit logs', icon: ScrollText },
  { to: '/admin/profile', label: 'Profile', icon: UserCircle2 },
]

const BOTTOM = [
  { to: '/admin/dashboard', label: 'Home', icon: LayoutDashboard },
  { to: '/admin/users', label: 'Users', icon: Users },
  { to: '/admin/jobs', label: 'Jobs', icon: Workflow },
  { to: '/admin/issues', label: 'Issues', icon: ClipboardList },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
]

export default function AdminLayout() {
  const [open, setOpen] = useState(false)

  return (
    <div className="app-shell admin-shell">
      <Sidebar items={ADMIN_NAV} open={open} onClose={() => setOpen(false)} />
      <div className="main-column">
        <Navbar admin onMenu={() => setOpen(true)} />
        <main className="content" id="main">
          <Outlet />
        </main>
        <nav className="bottom-nav" aria-label="Admin mobile">
          {BOTTOM.map((item) => (
            <NavLink key={item.to} to={item.to} end={item.end} className={({ isActive }) => `bottom-link ${isActive ? 'active' : ''}`}>
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  )
}
