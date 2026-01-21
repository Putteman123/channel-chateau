import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { User, Wifi, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';

const settingsLinks = [
  { title: 'Profil', url: '/settings/profile', icon: User },
  { title: 'Streamkällor', url: '/settings/sources', icon: Wifi },
];

export default function Settings() {
  const location = useLocation();
  
  // If we're at /settings, redirect to profile
  const isRoot = location.pathname === '/settings';

  return (
    <div className="flex flex-col gap-8 md:flex-row">
      {/* Settings Navigation */}
      <nav className="shrink-0 md:w-48">
        <h1 className="mb-4 text-2xl font-bold">Inställningar</h1>
        <div className="flex flex-row gap-2 md:flex-col">
          {settingsLinks.map((link) => (
            <NavLink
              key={link.url}
              to={link.url}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                  isActive || (isRoot && link.url === '/settings/profile')
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted'
                )
              }
            >
              <link.icon className="h-4 w-4" />
              {link.title}
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Settings Content */}
      <div className="flex-1">
        <Outlet />
      </div>
    </div>
  );
}
