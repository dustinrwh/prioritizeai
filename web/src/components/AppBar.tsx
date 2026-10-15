import { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { BacklogIcon, DashboardIcon, SubmitIcon, TrophyIcon } from './icons';
import { Avatar, Logo } from './ui';

const tabs = [
  ['/dashboard', 'Dashboard', DashboardIcon],
  ['/backlog', 'Backlog', BacklogIcon],
  ['/wins', 'Wins', TrophyIcon],
  ['/submit', 'Submit Idea', SubmitIcon],
] as const;

export default function AppBar() {
  const { user, signOut } = useAuth();
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <header className="h-14 shrink-0 border-b border-line bg-surface flex items-center px-6 gap-8">
      <Link to="/dashboard" aria-label="Prioritize AI home"><Logo size={24} /></Link>
      <nav className="flex gap-1" aria-label="Main">
        {tabs.map(([to, label, TabIcon]) => (
          <NavLink key={to} to={to} className={({ isActive }) => `flex items-center gap-2 px-3 py-1.5 rounded-md text-sm ${isActive ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'}`}>
            <TabIcon />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="ml-auto relative">
        <button className="flex items-center gap-2 rounded-full" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {user && <Avatar user={user} size={30} />}
        </button>
        {open && user && (
          <div role="menu" className="absolute right-0 mt-2 w-56 rounded-md border border-line bg-surface p-1 z-40" onMouseLeave={() => setOpen(false)}>
            <div className="px-3 py-2 text-xs text-muted truncate">{user.email}</div>
            <button role="menuitem" className="w-full text-left px-3 py-2 text-sm rounded hover:bg-surface-2" onClick={() => { setOpen(false); nav('/settings'); }}>Settings</button>
            <button role="menuitem" className="w-full text-left px-3 py-2 text-sm rounded hover:bg-surface-2" onClick={async () => { await signOut(); nav('/'); }}>Sign out</button>
          </div>
        )}
      </div>
    </header>
  );
}
