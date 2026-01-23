import { Navigate, Outlet } from 'react-router-dom';
import { useAdminCheck } from '@/hooks/useAdminCheck';
import { Loader2, ShieldX } from 'lucide-react';

export function AdminRoute() {
  const { isAdmin, loading } = useAdminCheck();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-admin-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-admin-primary" />
          <p className="text-admin-muted-foreground">Verifierar behörighet...</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-admin-background">
        <div className="flex flex-col items-center gap-4 text-center p-8">
          <ShieldX className="h-16 w-16 text-destructive" />
          <h1 className="text-2xl font-bold text-foreground">403 - Åtkomst nekad</h1>
          <p className="text-muted-foreground max-w-md">
            Du har inte behörighet att komma åt administratörspanelen.
          </p>
          <Navigate to="/" replace />
        </div>
      </div>
    );
  }

  return <Outlet />;
}
