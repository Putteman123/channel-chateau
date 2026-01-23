import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Users, LogIn, Ticket, Activity, TrendingUp } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';

interface DashboardStats {
  totalUsers: number;
  loggedInToday: number;
  openTickets: number;
  systemStatus: 'online' | 'offline' | 'checking';
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    totalUsers: 0,
    loggedInToday: 0,
    openTickets: 0,
    systemStatus: 'checking',
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        // Fetch total users count
        const { count: totalUsers } = await supabase
          .from('profiles')
          .select('*', { count: 'exact', head: true });

        // Fetch open tickets count
        const { count: openTickets } = await supabase
          .from('support_tickets')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'open');

        // Check system status with a simple query
        const { error: healthError } = await supabase
          .from('profiles')
          .select('id')
          .limit(1);

        setStats({
          totalUsers: totalUsers || 0,
          loggedInToday: 0, // Would need auth.users access
          openTickets: openTickets || 0,
          systemStatus: healthError ? 'offline' : 'online',
        });
      } catch (error) {
        console.error('Error fetching stats:', error);
        setStats(prev => ({ ...prev, systemStatus: 'offline' }));
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  const statCards = [
    {
      title: 'Totalt antal användare',
      value: stats.totalUsers,
      icon: Users,
      description: 'Registrerade konton',
      color: 'text-blue-500',
    },
    {
      title: 'Inloggade idag',
      value: stats.loggedInToday,
      icon: LogIn,
      description: 'Aktiva användare senaste 24h',
      color: 'text-green-500',
    },
    {
      title: 'Öppna ärenden',
      value: stats.openTickets,
      icon: Ticket,
      description: 'Supportärenden att hantera',
      color: 'text-yellow-500',
    },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold text-admin-foreground">Översikt</h1>
        <p className="text-admin-muted-foreground">Välkommen till Channel Chateau Admin</p>
      </div>

      {/* System Status */}
      <Card className="border-admin-border bg-admin-card">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-admin-primary" />
            <CardTitle className="text-lg text-admin-foreground">Systemstatus</CardTitle>
          </div>
          {loading ? (
            <Skeleton className="h-6 w-20" />
          ) : (
            <Badge 
              variant={stats.systemStatus === 'online' ? 'default' : 'destructive'}
              className={stats.systemStatus === 'online' ? 'bg-green-500 hover:bg-green-600' : ''}
            >
              {stats.systemStatus === 'online' ? '● Online' : '● Offline'}
            </Badge>
          )}
        </CardHeader>
        <CardContent>
          <p className="text-sm text-admin-muted-foreground">
            {stats.systemStatus === 'online' 
              ? 'Alla system fungerar normalt. Databasen svarar som förväntat.'
              : 'Det finns problem med anslutningen till databasen.'}
          </p>
        </CardContent>
      </Card>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-3">
        {statCards.map((stat) => (
          <Card key={stat.title} className="border-admin-border bg-admin-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-admin-muted-foreground">
                {stat.title}
              </CardTitle>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-8 w-16" />
              ) : (
                <div className="text-3xl font-bold text-admin-foreground">{stat.value}</div>
              )}
              <p className="text-xs text-admin-muted-foreground mt-1">{stat.description}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Actions */}
      <Card className="border-admin-border bg-admin-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-admin-foreground">
            <TrendingUp className="h-5 w-5 text-admin-primary" />
            Snabbåtgärder
          </CardTitle>
          <CardDescription className="text-admin-muted-foreground">
            Vanliga administrativa uppgifter
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <a href="/admin/users" className="block rounded-lg border border-admin-border p-4 transition-colors hover:bg-admin-accent">
            <h3 className="font-medium text-admin-foreground">Hantera användare</h3>
            <p className="text-sm text-admin-muted-foreground">Se och redigera användarkonton</p>
          </a>
          <a href="/admin/tickets" className="block rounded-lg border border-admin-border p-4 transition-colors hover:bg-admin-accent">
            <h3 className="font-medium text-admin-foreground">Supportärenden</h3>
            <p className="text-sm text-admin-muted-foreground">Hantera inkomna ärenden</p>
          </a>
          <a href="/admin/announcements" className="block rounded-lg border border-admin-border p-4 transition-colors hover:bg-admin-accent">
            <h3 className="font-medium text-admin-foreground">Skapa meddelande</h3>
            <p className="text-sm text-admin-muted-foreground">Informera alla användare</p>
          </a>
        </CardContent>
      </Card>
    </div>
  );
}
