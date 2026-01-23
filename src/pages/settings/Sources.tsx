import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Plus, Trash2, Wifi, WifiOff, CheckCircle, XCircle, Pencil } from 'lucide-react';
import { useStreamSources, StreamSource } from '@/hooks/useStreamSources';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import * as XtreamAPI from '@/lib/xtream-api';

const sourceSchema = z.object({
  name: z.string().min(1, 'Namn krävs').max(50),
  server_url: z.string().min(1, 'Server URL krävs'),
  username: z.string().min(1, 'Användarnamn krävs'),
  password: z.string().min(1, 'Lösenord krävs'),
});

type SourceForm = z.infer<typeof sourceSchema>;

export default function Sources() {
  const { sources, isLoading, addSource, updateSource, deleteSource } = useStreamSources();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<StreamSource | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const form = useForm<SourceForm>({
    resolver: zodResolver(sourceSchema),
    defaultValues: {
      name: '',
      server_url: '',
      username: '',
      password: '',
    },
  });

  // Reset form when editing source changes
  useEffect(() => {
    if (editingSource) {
      form.reset({
        name: editingSource.name,
        server_url: editingSource.server_url,
        username: editingSource.username,
        password: editingSource.password,
      });
      setConnectionStatus('idle');
    }
  }, [editingSource, form]);

  const resetForm = () => {
    form.reset({
      name: '',
      server_url: '',
      username: '',
      password: '',
    });
    setConnectionStatus('idle');
  };

  const testConnection = async () => {
    const values = form.getValues();
    if (!values.server_url || !values.username || !values.password) {
      toast.error('Fyll i alla fält först');
      return;
    }

    setIsTestingConnection(true);
    setConnectionStatus('idle');

    try {
      await XtreamAPI.authenticate({
        serverUrl: values.server_url,
        username: values.username,
        password: values.password,
      });
      setConnectionStatus('success');
      toast.success('Anslutning lyckades!');
    } catch (error: unknown) {
      setConnectionStatus('error');
      const message = error instanceof Error ? error.message : 'Okänt fel';
      toast.error('Anslutning misslyckades: ' + message);
    } finally {
      setIsTestingConnection(false);
    }
  };

  const onSubmitAdd = async (data: SourceForm) => {
    try {
      await addSource.mutateAsync({
        name: data.name,
        server_url: data.server_url,
        username: data.username,
        password: data.password,
        is_active: sources.length === 0,
      });
      setIsAddDialogOpen(false);
      resetForm();
    } catch {
      // Error handled by mutation
    }
  };

  const onSubmitEdit = async (data: SourceForm) => {
    if (!editingSource) return;
    
    try {
      await updateSource.mutateAsync({
        id: editingSource.id,
        name: data.name,
        server_url: data.server_url,
        username: data.username,
        password: data.password,
      });
      setEditingSource(null);
      resetForm();
    } catch {
      // Error handled by mutation
    }
  };

  const handleDelete = async (id: string) => {
    await deleteSource.mutateAsync(id);
  };

  const handleCloseAddDialog = (open: boolean) => {
    setIsAddDialogOpen(open);
    if (!open) {
      resetForm();
    }
  };

  const handleCloseEditDialog = (open: boolean) => {
    if (!open) {
      setEditingSource(null);
      resetForm();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const SourceFormFields = () => (
    <>
      <FormField
        control={form.control}
        name="name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Namn</FormLabel>
            <FormControl>
              <Input placeholder="Min IPTV" {...field} />
            </FormControl>
            <FormDescription>Ett namn för att identifiera denna källa</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="server_url"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Server URL</FormLabel>
            <FormControl>
              <Input placeholder="http://server.example.com:port" {...field} />
            </FormControl>
            <FormDescription>Xtream Codes server-adress</FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="username"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Användarnamn</FormLabel>
            <FormControl>
              <Input placeholder="användarnamn" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="password"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Lösenord</FormLabel>
            <FormControl>
              <Input type="password" placeholder="••••••••" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={testConnection}
          disabled={isTestingConnection}
          className="gap-2"
        >
          {isTestingConnection ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : connectionStatus === 'success' ? (
            <CheckCircle className="h-4 w-4 text-green-500" />
          ) : connectionStatus === 'error' ? (
            <XCircle className="h-4 w-4 text-destructive" />
          ) : (
            <Wifi className="h-4 w-4" />
          )}
          Testa anslutning
        </Button>
      </div>
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Streamkällor</h2>
          <p className="text-muted-foreground">
            Hantera dina Xtream Codes-konton
          </p>
        </div>

        <Dialog open={isAddDialogOpen} onOpenChange={handleCloseAddDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Lägg till källa
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Lägg till streamkälla</DialogTitle>
            </DialogHeader>

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitAdd)} className="space-y-4">
                <SourceFormFields />
                <Button
                  type="submit"
                  disabled={addSource.isPending}
                  className="w-full"
                >
                  {addSource.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Lägg till
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingSource} onOpenChange={handleCloseEditDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redigera streamkälla</DialogTitle>
          </DialogHeader>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitEdit)} className="space-y-4">
              <SourceFormFields />
              <Button
                type="submit"
                disabled={updateSource.isPending}
                className="w-full"
              >
                {updateSource.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Spara ändringar
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Sources list */}
      {sources.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <WifiOff className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 font-semibold">Inga streamkällor</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Lägg till en Xtream Codes-källa för att börja streama.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {sources.map((source) => (
            <Card key={source.id} className={source.is_active ? 'border-primary' : ''}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <div className="flex items-center gap-3">
                  <div className={`rounded-full p-2 ${source.is_active ? 'bg-primary/20' : 'bg-muted'}`}>
                    <Wifi className={`h-4 w-4 ${source.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                  <div>
                    <CardTitle className="text-lg">{source.name}</CardTitle>
                    <CardDescription>{source.server_url}</CardDescription>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {source.is_active && (
                    <span className="rounded-full bg-primary/20 px-2 py-1 text-xs font-medium text-primary">
                      Aktiv
                    </span>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setEditingSource(source)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Ta bort streamkälla?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Detta tar bort "{source.name}" och all tillhörande data (favoriter, historik).
                          Denna åtgärd kan inte ångras.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Avbryt</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() => handleDelete(source.id)}
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                          Ta bort
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </CardHeader>
              <CardContent>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Användarnamn</dt>
                    <dd>{source.username}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Tillagd</dt>
                    <dd>{new Date(source.created_at).toLocaleDateString('sv-SE')}</dd>
                  </div>
                </dl>
                
                {/* Prefer TS toggle */}
                <div className="mt-4 flex items-center justify-between rounded-lg border p-3">
                  <div className="space-y-0.5">
                    <div className="text-sm font-medium">Föredra TS för live</div>
                    <div className="text-xs text-muted-foreground">
                      Använd .ts istället för .m3u8 (kringgår blockering)
                    </div>
                  </div>
                  <Switch
                    checked={source.prefer_ts_live}
                    onCheckedChange={(checked) => {
                      updateSource.mutate({ id: source.id, prefer_ts_live: checked });
                    }}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
