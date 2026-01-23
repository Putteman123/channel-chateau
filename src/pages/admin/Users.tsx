import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  useReactTable,
  getSortedRowModel,
  SortingState,
  getFilteredRowModel,
} from '@tanstack/react-table';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { MoreHorizontal, Search, CalendarIcon, Shield, Ban, Eye, UserCog } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface UserProfile {
  id: string;
  user_id: string;
  display_name: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string | null;
  is_banned: boolean;
  stream_sources_count?: number;
  is_admin?: boolean;
}

export default function AdminUsers() {
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [globalFilter, setGlobalFilter] = useState('');
  
  // Dialog states
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  const [accessDialogOpen, setAccessDialogOpen] = useState(false);
  const [expiryDate, setExpiryDate] = useState<Date | undefined>();

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    try {
      // Fetch profiles
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (profilesError) throw profilesError;

      // Fetch stream sources count per user
      const { data: sourceCounts, error: sourceError } = await supabase
        .from('stream_sources')
        .select('user_id');

      if (sourceError) throw sourceError;

      // Fetch admin roles
      const { data: adminRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin');

      if (rolesError) throw rolesError;

      const adminUserIds = new Set(adminRoles?.map(r => r.user_id) || []);
      const sourceCountMap = new Map<string, number>();
      sourceCounts?.forEach(s => {
        sourceCountMap.set(s.user_id, (sourceCountMap.get(s.user_id) || 0) + 1);
      });

      const enrichedUsers = profiles?.map(profile => ({
        ...profile,
        stream_sources_count: sourceCountMap.get(profile.user_id) || 0,
        is_admin: adminUserIds.has(profile.user_id),
      })) || [];

      setUsers(enrichedUsers);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Kunde inte hämta användare');
    } finally {
      setLoading(false);
    }
  }

  async function toggleBan(user: UserProfile) {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_banned: !user.is_banned })
        .eq('id', user.id);

      if (error) throw error;

      toast.success(user.is_banned ? 'Användaren har avbannats' : 'Användaren har bannats');
      fetchUsers();
    } catch (error) {
      console.error('Error toggling ban:', error);
      toast.error('Kunde inte uppdatera användaren');
    }
  }

  async function setUserAccess() {
    if (!selectedUser || !expiryDate) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ expires_at: expiryDate.toISOString() })
        .eq('id', selectedUser.id);

      if (error) throw error;

      toast.success(`Access förlängd till ${format(expiryDate, 'PPP', { locale: sv })}`);
      setAccessDialogOpen(false);
      setSelectedUser(null);
      setExpiryDate(undefined);
      fetchUsers();
    } catch (error) {
      console.error('Error setting access:', error);
      toast.error('Kunde inte uppdatera access');
    }
  }

  async function toggleAdminRole(user: UserProfile) {
    try {
      if (user.is_admin) {
        // Remove admin role
        const { error } = await supabase
          .from('user_roles')
          .delete()
          .eq('user_id', user.user_id)
          .eq('role', 'admin');

        if (error) throw error;
        toast.success('Admin-rollen har tagits bort');
      } else {
        // Add admin role
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: user.user_id, role: 'admin' });

        if (error) throw error;
        toast.success('Användaren är nu admin');
      }
      fetchUsers();
    } catch (error) {
      console.error('Error toggling admin role:', error);
      toast.error('Kunde inte uppdatera rollen');
    }
  }

  function impersonateUser(user: UserProfile) {
    console.log('Impersonate user:', user.user_id);
    toast.info(`User ID kopierat: ${user.user_id}`, {
      description: 'Full impersonering kräver ytterligare setup',
    });
  }

  const columns: ColumnDef<UserProfile>[] = [
    {
      accessorKey: 'display_name',
      header: 'Namn',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="font-medium text-admin-foreground">
            {row.original.display_name || 'Okänd'}
          </span>
          {row.original.is_admin && (
            <Badge variant="outline" className="border-admin-primary text-admin-primary">
              Admin
            </Badge>
          )}
          {row.original.is_banned && (
            <Badge variant="destructive">Bannad</Badge>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'created_at',
      header: 'Skapad',
      cell: ({ row }) => (
        <span className="text-admin-muted-foreground">
          {format(new Date(row.original.created_at), 'PPP', { locale: sv })}
        </span>
      ),
    },
    {
      accessorKey: 'expires_at',
      header: 'Access utgår',
      cell: ({ row }) => (
        <span className="text-admin-muted-foreground">
          {row.original.expires_at 
            ? format(new Date(row.original.expires_at), 'PPP', { locale: sv })
            : '—'}
        </span>
      ),
    },
    {
      accessorKey: 'stream_sources_count',
      header: 'IPTV-källor',
      cell: ({ row }) => (
        <Badge variant="secondary" className="bg-admin-accent text-admin-foreground">
          {row.original.stream_sources_count}
        </Badge>
      ),
    },
    {
      id: 'actions',
      cell: ({ row }) => (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="h-8 w-8 p-0 text-admin-muted-foreground hover:text-admin-foreground">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="bg-admin-card border-admin-border">
            <DropdownMenuLabel className="text-admin-foreground">Åtgärder</DropdownMenuLabel>
            <DropdownMenuSeparator className="bg-admin-border" />
            <DropdownMenuItem
              onClick={() => {
                setSelectedUser(row.original);
                setAccessDialogOpen(true);
              }}
              className="text-admin-foreground focus:bg-admin-accent"
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              Hantera access
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => toggleAdminRole(row.original)}
              className="text-admin-foreground focus:bg-admin-accent"
            >
              <Shield className="mr-2 h-4 w-4" />
              {row.original.is_admin ? 'Ta bort admin' : 'Gör till admin'}
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => impersonateUser(row.original)}
              className="text-admin-foreground focus:bg-admin-accent"
            >
              <Eye className="mr-2 h-4 w-4" />
              Impersonate
            </DropdownMenuItem>
            <DropdownMenuSeparator className="bg-admin-border" />
            <DropdownMenuItem
              onClick={() => toggleBan(row.original)}
              className={row.original.is_banned ? 'text-green-500 focus:bg-admin-accent' : 'text-destructive focus:bg-admin-accent'}
            >
              <Ban className="mr-2 h-4 w-4" />
              {row.original.is_banned ? 'Avbanna' : 'Banna'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ),
    },
  ];

  const table = useReactTable({
    data: users,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    state: {
      sorting,
      globalFilter,
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-admin-foreground">Användare</h1>
        <p className="text-admin-muted-foreground">Hantera alla registrerade användare</p>
      </div>

      <Card className="border-admin-border bg-admin-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-admin-foreground">
                <UserCog className="h-5 w-5 text-admin-primary" />
                Användarlista
              </CardTitle>
              <CardDescription className="text-admin-muted-foreground">
                {users.length} användare totalt
              </CardDescription>
            </div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-admin-muted-foreground" />
              <Input
                placeholder="Sök användare..."
                value={globalFilter ?? ''}
                onChange={(e) => setGlobalFilter(e.target.value)}
                className="w-64 pl-10 bg-admin-background border-admin-border text-admin-foreground"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-admin-border">
            <Table>
              <TableHeader>
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id} className="border-admin-border hover:bg-admin-accent">
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} className="text-admin-muted-foreground">
                        {header.isPlaceholder
                          ? null
                          : flexRender(header.column.columnDef.header, header.getContext())}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center text-admin-muted-foreground">
                      Laddar...
                    </TableCell>
                  </TableRow>
                ) : table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow key={row.id} className="border-admin-border hover:bg-admin-accent">
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={columns.length} className="h-24 text-center text-admin-muted-foreground">
                      Inga användare hittades.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Access Dialog */}
      <Dialog open={accessDialogOpen} onOpenChange={setAccessDialogOpen}>
        <DialogContent className="bg-admin-card border-admin-border">
          <DialogHeader>
            <DialogTitle className="text-admin-foreground">Hantera access</DialogTitle>
            <DialogDescription className="text-admin-muted-foreground">
              Sätt utgångsdatum för {selectedUser?.display_name || 'användaren'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label className="text-admin-foreground">Utgångsdatum</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      'w-full justify-start text-left font-normal border-admin-border',
                      !expiryDate && 'text-admin-muted-foreground'
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {expiryDate ? format(expiryDate, 'PPP', { locale: sv }) : 'Välj datum'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0 bg-admin-card border-admin-border" align="start">
                  <Calendar
                    mode="single"
                    selected={expiryDate}
                    onSelect={setExpiryDate}
                    initialFocus
                    disabled={(date) => date < new Date()}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpiryDate(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000))}
                className="border-admin-border text-admin-foreground"
              >
                +7 dagar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpiryDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000))}
                className="border-admin-border text-admin-foreground"
              >
                +30 dagar
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setExpiryDate(new Date(Date.now() + 365 * 24 * 60 * 60 * 1000))}
                className="border-admin-border text-admin-foreground"
              >
                +1 år
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setAccessDialogOpen(false)}
              className="border-admin-border text-admin-foreground"
            >
              Avbryt
            </Button>
            <Button
              onClick={setUserAccess}
              disabled={!expiryDate}
              className="bg-admin-primary text-admin-primary-foreground hover:bg-admin-primary/90"
            >
              Spara
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
