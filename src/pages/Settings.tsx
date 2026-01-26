import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { User, Wifi, Globe, Play } from 'lucide-react';
import { cn } from '@/lib/utils';

const settingsLinks = [
  { titleKey: 'nav.profile', url: '/settings/profile', icon: User },
  { titleKey: 'nav.sources', url: '/settings/sources', icon: Wifi },
  { titleKey: 'nav.video', url: '/settings/video', icon: Play },
  { titleKey: 'nav.language', url: '/settings/language', icon: Globe },
];

export default function Settings() {
  const { t } = useTranslation();
  const location = useLocation();
  
  // If we're at /settings, redirect to profile
  const isRoot = location.pathname === '/settings';

  return (
    <div className="flex flex-col gap-8 md:flex-row">
      {/* Settings Navigation */}
      <nav className="shrink-0 md:w-48">
        <h1 className="mb-4 text-2xl font-bold">{t('settings.title')}</h1>
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
              {t(link.titleKey)}
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
