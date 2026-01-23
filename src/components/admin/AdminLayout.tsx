import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Users, 
  Ticket, 
  Megaphone, 
  ArrowLeft,
  Shield
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const adminNavItems = [
  { title: 'Översikt', url: '/admin', icon: LayoutDashboard },
  { title: 'Användare', url: '/admin/users', icon: Users },
  { title: 'Support', url: '/admin/tickets', icon: Ticket },
  { title: 'Meddelanden', url: '/admin/announcements', icon: Megaphone },
];

export function AdminLayout() {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/admin') {
      return location.pathname === '/admin';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <div className="flex min-h-screen bg-admin-background">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 z-40 h-screen w-64 border-r border-admin-border bg-admin-sidebar">
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex h-16 items-center gap-3 border-b border-admin-border px-6">
            <Shield className="h-8 w-8 text-admin-primary" />
            <div>
              <h1 className="font-bold text-admin-foreground">Admin Panel</h1>
              <p className="text-xs text-admin-muted-foreground">Channel Chateau</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 space-y-1 p-4">
            {adminNavItems.map((item) => (
              <NavLink
                key={item.url}
                to={item.url}
                end={item.url === '/admin'}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive(item.url)
                    ? 'bg-admin-primary text-admin-primary-foreground'
                    : 'text-admin-muted-foreground hover:bg-admin-accent hover:text-admin-foreground'
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.title}
              </NavLink>
            ))}
          </nav>

          {/* Footer */}
          <div className="border-t border-admin-border p-4">
            <NavLink to="/browse">
              <Button variant="outline" className="w-full gap-2 border-admin-border text-admin-muted-foreground hover:text-admin-foreground">
                <ArrowLeft className="h-4 w-4" />
                Tillbaka till appen
              </Button>
            </NavLink>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-64 flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}
