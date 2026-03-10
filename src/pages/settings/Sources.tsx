import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Loader2, Plus, Trash2, Wifi, WifiOff, CheckCircle, XCircle, Pencil, List, Radio, Calendar, Wand2, Tv, Film, Clapperboard } from 'lucide-react';
import { useStreamSources, StreamSource, SourceType } from '@/hooks/useStreamSources';
import { useM3UChannelCount } from '@/hooks/useM3UChannelCount';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { SubscriptionBadge } from '@/components/subscription/SubscriptionBadge';
import { parseXtreamExpDate } from '@/lib/subscription-utils';
import { buildXMLTVUrl } from '@/lib/xmltv-parser';

// Component to display M3U channel count
function M3UChannelStats({ m3uUrl }: { m3uUrl: string | null }) {
  const { channelCount, isLoading } = useM3UChannelCount({ m3uUrl, enabled: !!m3uUrl });
  
  if (!m3uUrl) return null;
  
  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Räknar kanaler...
      </div>
    );
  }
  
  if (!channelCount) return null;
  
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <div className="flex items-center gap-1 text-muted-foreground">
        <Tv className="h-3 w-3" />
        <span>{channelCount.liveChannels} live</span>
      </div>
      <div className="flex items-center gap-1 text-muted-foreground">
        <Film className="h-3 w-3" />
        <span>{channelCount.movies} filmer</span>
      </div>
      <div className="flex items-center gap-1 text-muted-foreground">
        <Clapperboard className="h-3 w-3" />
        <span>{channelCount.series} serier</span>
      </div>
    </div>
  );
}

// Xtream schema - with validation to prevent using proxy domain as server URL
const xtreamSchema = z.object({
  name: z.string().min(1, 'Namn krävs').max(50),
  server_url: z.string()
    .min(1, 'Server URL krävs')
    .refine(
      (url) => !url.includes('vpn.premiumvinted.se'),
      'Ange din IPTV-servers URL, inte VPN-proxy-domänen (vpn.premiumvinted.se). Proxy-domänen används automatiskt.'
    ),
  username: z.string().min(1, 'Användarnamn krävs'),
  password: z.string().min(1, 'Lösenord krävs'),
  custom_epg_url: z.string().optional(),
});

// M3U schema
const m3uSchema = z.object({
  name: z.string().min(1, 'Namn krävs').max(50),
  m3u_url: z.string().min(1, 'M3U URL krävs').url('Ange en giltig URL'),
  expires_at: z.string().optional(),
});

type XtreamForm = z.infer<typeof xtreamSchema>;
type M3UForm = z.infer<typeof m3uSchema>;

export default function Sources() {
  const { sources, isLoading, addSource, updateSource, deleteSource } = useStreamSources();
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingSource, setEditingSource] = useState<StreamSource | null>(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [addSourceType, setAddSourceType] = useState<SourceType>('xtream');

  const xtreamForm = useForm<XtreamForm>({
    resolver: zodResolver(xtreamSchema),
    defaultValues: {
      name: '',
      server_url: '',
      username: '',
      password: '',
      custom_epg_url: '',
    },
  });

  const m3uForm = useForm<M3UForm>({
    resolver: zodResolver(m3uSchema),
    defaultValues: {
      name: '',
      m3u_url: '',
      expires_at: '',
    },
  });

  // Reset forms when editing source changes
  useEffect(() => {
    if (editingSource) {
      if (editingSource.source_type === 'xtream') {
        xtreamForm.reset({
          name: editingSource.name,
          server_url: editingSource.server_url || '',
          username: editingSource.username || '',
          password: editingSource.password || '',
          custom_epg_url: editingSource.custom_epg_url || '',
        });
        setAddSourceType('xtream');
      } else {
        m3uForm.reset({
          name: editingSource.name,
          m3u_url: editingSource.m3u_url || '',
          expires_at: editingSource.expires_at ? editingSource.expires_at.split('T')[0] : '',
        });
        setAddSourceType('m3u');
      }
      setConnectionStatus('idle');
    }
  }, [editingSource, xtreamForm, m3uForm]);

  const resetForms = () => {
    xtreamForm.reset({ name: '', server_url: '', username: '', password: '', custom_epg_url: '' });
    m3uForm.reset({ name: '', m3u_url: '', expires_at: '' });
    setConnectionStatus('idle');
  };

  // Generate XMLTV URL from current form values
  const generateEpgUrl = () => {
    const values = xtreamForm.getValues();
    if (!values.server_url || !values.username || !values.password) {
      return;
    }
    const epgUrl = buildXMLTVUrl(values.server_url, values.username, values.password);
    xtreamForm.setValue('custom_epg_url', epgUrl);
  };

  const [lastAuthResult, setLastAuthResult] = useState<XtreamAPI.XtreamAuthInfo | null>(null);

  const testXtreamConnection = async () => {
    const values = xtreamForm.getValues();
    if (!values.server_url || !values.username || !values.password) {
      toast.error('Fyll i alla fält först');
      return;
    }

    setIsTestingConnection(true);
    setConnectionStatus('idle');
    setLastAuthResult(null);

    try {
      const authResult = await XtreamAPI.authenticate({
        serverUrl: values.server_url,
        username: values.username,
        password: values.password,
      });
      setLastAuthResult(authResult);
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

  const testM3UConnection = async () => {
    const values = m3uForm.getValues();
    if (!values.m3u_url) {
      toast.error('Ange M3U URL först');
      return;
    }

    setIsTestingConnection(true);
    setConnectionStatus('idle');

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const proxyUrl = `${supabaseUrl}/functions/v1/stream-proxy?url=${encodeURIComponent(values.m3u_url)}`;
      const response = await fetch(proxyUrl, { method: 'HEAD' });
      
      if (response.ok || response.status === 200) {
        setConnectionStatus('success');
        toast.success('M3U-länk verifierad!');
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (error: unknown) {
      // Try a GET request instead (some servers don't support HEAD)
      try {
        const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
        const proxyUrl = `${supabaseUrl}/functions/v1/stream-proxy?url=${encodeURIComponent(values.m3u_url)}`;
        const response = await fetch(proxyUrl);
        const text = await response.text();
        
        if (text.includes('#EXTM3U') || text.includes('#EXTINF')) {
          setConnectionStatus('success');
          toast.success('M3U-länk verifierad!');
        } else {
          throw new Error('Inte en giltig M3U-fil');
        }
      } catch (innerError) {
        setConnectionStatus('error');
        const message = innerError instanceof Error ? innerError.message : 'Okänt fel';
        toast.error('Kunde inte verifiera M3U: ' + message);
      }
    } finally {
      setIsTestingConnection(false);
    }
  };

  const onSubmitXtreamAdd = async (data: XtreamForm) => {
    try {
      // Parse expires_at from auth result if available
      let expiresAt: string | undefined;
      if (lastAuthResult?.user_info?.exp_date) {
        const expDate = parseXtreamExpDate(lastAuthResult.user_info.exp_date);
        if (expDate) {
          expiresAt = expDate.toISOString();
        }
      }

      await addSource.mutateAsync({
        source_type: 'xtream',
        name: data.name,
        server_url: data.server_url,
        username: data.username,
        password: data.password,
        custom_epg_url: data.custom_epg_url || null,
        is_active: sources.length === 0,
        expires_at: expiresAt,
      });
      setIsAddDialogOpen(false);
      resetForms();
      setLastAuthResult(null);
    } catch {
      // Error handled by mutation
    }
  };

  const onSubmitM3UAdd = async (data: M3UForm) => {
    try {
      await addSource.mutateAsync({
        source_type: 'm3u',
        name: data.name,
        m3u_url: data.m3u_url,
        is_active: sources.length === 0,
        expires_at: data.expires_at ? new Date(data.expires_at).toISOString() : undefined,
      });
      setIsAddDialogOpen(false);
      resetForms();
    } catch {
      // Error handled by mutation
    }
  };

  const onSubmitXtreamEdit = async (data: XtreamForm) => {
    if (!editingSource) return;
    
    try {
      // Parse expires_at from auth result if a new test was done
      let expiresAt: string | undefined;
      if (lastAuthResult?.user_info?.exp_date) {
        const expDate = parseXtreamExpDate(lastAuthResult.user_info.exp_date);
        if (expDate) {
          expiresAt = expDate.toISOString();
        }
      }

      await updateSource.mutateAsync({
        id: editingSource.id,
        name: data.name,
        server_url: data.server_url,
        username: data.username,
        password: data.password,
        custom_epg_url: data.custom_epg_url || null,
        ...(expiresAt && { expires_at: expiresAt }),
      });
      setEditingSource(null);
      resetForms();
      setLastAuthResult(null);
    } catch {
      // Error handled by mutation
    }
  };

  const onSubmitM3UEdit = async (data: M3UForm) => {
    if (!editingSource) return;
    
    try {
      await updateSource.mutateAsync({
        id: editingSource.id,
        name: data.name,
        m3u_url: data.m3u_url,
        expires_at: data.expires_at ? new Date(data.expires_at).toISOString() : null,
      });
      setEditingSource(null);
      resetForms();
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
      resetForms();
      setAddSourceType('xtream');
    }
  };

  const handleCloseEditDialog = (open: boolean) => {
    if (!open) {
      setEditingSource(null);
      resetForms();
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Streamkällor</h2>
          <p className="text-muted-foreground">
            Hantera dina Xtream Codes- och M3U-källor
          </p>
        </div>

        <Dialog open={isAddDialogOpen} onOpenChange={handleCloseAddDialog}>
          <DialogTrigger asChild>
            <Button className="gap-2">
              <Plus className="h-4 w-4" />
              Lägg till källa
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Lägg till streamkälla</DialogTitle>
            </DialogHeader>

            <Tabs value={addSourceType} onValueChange={(v) => setAddSourceType(v as SourceType)}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="xtream" className="gap-2">
                  <Radio className="h-4 w-4" />
                  Xtream Codes
                </TabsTrigger>
                <TabsTrigger value="m3u" className="gap-2">
                  <List className="h-4 w-4" />
                  M3U Playlist
                </TabsTrigger>
              </TabsList>

              <TabsContent value="xtream" className="mt-4">
                <Form {...xtreamForm}>
                  <form onSubmit={xtreamForm.handleSubmit(onSubmitXtreamAdd)} className="space-y-4">
                    <FormField
                      control={xtreamForm.control}
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
                      control={xtreamForm.control}
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
                      control={xtreamForm.control}
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
                      control={xtreamForm.control}
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

                    {/* Custom EPG URL Field */}
                    <FormField
                      control={xtreamForm.control}
                      name="custom_epg_url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Alternativ EPG URL (Valfritt)</FormLabel>
                          <div className="flex gap-2">
                            <FormControl>
                              <Input 
                                placeholder="http://domain/xmltv.php?username=..." 
                                {...field} 
                              />
                            </FormControl>
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={generateEpgUrl}
                              title="Generera från inloggning"
                            >
                              <Wand2 className="h-4 w-4" />
                            </Button>
                          </div>
                          <FormDescription>
                            XMLTV-länk för utökad programguide. Klicka på trollstaven för att generera automatiskt.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={testXtreamConnection}
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
              </TabsContent>

              <TabsContent value="m3u" className="mt-4">
                <Form {...m3uForm}>
                  <form onSubmit={m3uForm.handleSubmit(onSubmitM3UAdd)} className="space-y-4">
                    <FormField
                      control={m3uForm.control}
                      name="name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Namn</FormLabel>
                          <FormControl>
                            <Input placeholder="Min Sport-lista" {...field} />
                          </FormControl>
                          <FormDescription>Ett namn för att identifiera denna källa</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={m3uForm.control}
                      name="m3u_url"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>M3U URL</FormLabel>
                          <FormControl>
                            <Input placeholder="http://provider.com/get.php?type=m3u..." {...field} />
                          </FormControl>
                          <FormDescription>Komplett länk till M3U-spellistan</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={m3uForm.control}
                      name="expires_at"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="flex items-center gap-2">
                            <Calendar className="h-4 w-4" />
                            Utgångsdatum (valfritt)
                          </FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormDescription>När ditt abonnemang går ut</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={testM3UConnection}
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
                        Verifiera M3U
                      </Button>
                    </div>

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
              </TabsContent>
            </Tabs>
          </DialogContent>
        </Dialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingSource} onOpenChange={handleCloseEditDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Redigera streamkälla</DialogTitle>
          </DialogHeader>

          {editingSource?.source_type === 'xtream' ? (
            <Form {...xtreamForm}>
              <form onSubmit={xtreamForm.handleSubmit(onSubmitXtreamEdit)} className="space-y-4">
                <FormField
                  control={xtreamForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Namn</FormLabel>
                      <FormControl>
                        <Input placeholder="Min IPTV" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={xtreamForm.control}
                  name="server_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Server URL</FormLabel>
                      <FormControl>
                        <Input placeholder="http://server.example.com:port" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={xtreamForm.control}
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
                  control={xtreamForm.control}
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

                {/* Custom EPG URL Field */}
                <FormField
                  control={xtreamForm.control}
                  name="custom_epg_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Alternativ EPG URL (Valfritt)</FormLabel>
                      <div className="flex gap-2">
                        <FormControl>
                          <Input 
                            placeholder="http://domain/xmltv.php?username=..." 
                            {...field} 
                          />
                        </FormControl>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          onClick={generateEpgUrl}
                          title="Generera från inloggning"
                        >
                          <Wand2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <FormDescription>
                        XMLTV-länk för utökad programguide. Klicka på trollstaven för att generera automatiskt.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={testXtreamConnection}
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
          ) : (
            <Form {...m3uForm}>
              <form onSubmit={m3uForm.handleSubmit(onSubmitM3UEdit)} className="space-y-4">
                <FormField
                  control={m3uForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Namn</FormLabel>
                      <FormControl>
                        <Input placeholder="Min Sport-lista" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={m3uForm.control}
                  name="m3u_url"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>M3U URL</FormLabel>
                      <FormControl>
                        <Input placeholder="http://provider.com/get.php?type=m3u..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={m3uForm.control}
                  name="expires_at"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        Utgångsdatum (valfritt)
                      </FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormDescription>När ditt abonnemang går ut</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={testM3UConnection}
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
                    Verifiera M3U
                  </Button>
                </div>

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
          )}
        </DialogContent>
      </Dialog>

      {/* Sources list */}
      {sources.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <WifiOff className="h-12 w-12 text-muted-foreground/50" />
            <h3 className="mt-4 font-semibold">Inga streamkällor</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Lägg till en Xtream Codes- eller M3U-källa för att börja streama.
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
                    {source.source_type === 'm3u' ? (
                      <List className={`h-4 w-4 ${source.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
                    ) : (
                      <Wifi className={`h-4 w-4 ${source.is_active ? 'text-primary' : 'text-muted-foreground'}`} />
                    )}
                  </div>
                  <div>
                    <CardTitle className="text-lg">{source.name}</CardTitle>
                    <CardDescription>
                      {source.source_type === 'm3u' ? (
                        <span className="text-xs">M3U Playlist</span>
                      ) : (
                        source.server_url
                      )}
                    </CardDescription>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {source.is_active && (
                    <span className="rounded-full bg-primary/20 px-2 py-1 text-xs font-medium text-primary">
                      Aktiv
                    </span>
                  )}
                  <span className="rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">
                    {source.source_type === 'm3u' ? 'M3U' : 'Xtream'}
                  </span>

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
                {/* M3U Channel Stats */}
                {source.source_type === 'm3u' && (
                  <div className="mb-4 rounded-lg border p-3">
                    <div className="text-sm font-medium mb-2">Innehåll</div>
                    <M3UChannelStats m3uUrl={source.m3u_url} />
                  </div>
                )}

                {/* Subscription Status - only for Xtream or M3U with expiry set */}
                {(source.source_type === 'xtream' || source.expires_at) && (
                  <div className="mb-4 flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">Abonnemangsstatus</div>
                    </div>
                    <SubscriptionBadge expiresAt={source.expires_at} />
                  </div>
                )}

                <dl className="grid grid-cols-2 gap-2 text-sm">
                  {source.source_type === 'xtream' && source.username && (
                    <div>
                      <dt className="text-muted-foreground">Användarnamn</dt>
                      <dd>{source.username}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-muted-foreground">Tillagd</dt>
                    <dd>{new Date(source.created_at).toLocaleDateString('sv-SE')}</dd>
                  </div>
                </dl>
                
                {/* Stream format toggles */}
                <div className="mt-4 space-y-3">
                  {/* Proxy toggle - available for all sources */}
                  <div className="flex items-center justify-between rounded-lg border p-3">
                    <div className="space-y-0.5">
                      <div className="text-sm font-medium">Använd proxy för streams</div>
                      <div className="text-xs text-muted-foreground">
                        Dirigerar streams via server (kan blockeras av vissa leverantörer)
                      </div>
                    </div>
                    <Switch
                      checked={source.use_proxy ?? true}
                      onCheckedChange={(checked) => {
                        updateSource.mutate({ id: source.id, use_proxy: checked });
                      }}
                    />
                  </div>

                  {/* Xtream-specific toggles */}
                  {source.source_type === 'xtream' && (
                    <>
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <div className="text-sm font-medium">Tvinga HTTP för live</div>
                          <div className="text-xs text-muted-foreground">
                            Konvertera HTTPS till HTTP för live-strömmar (löser ECONNREFUSED)
                          </div>
                        </div>
                        <Switch
                          checked={source.force_http_live ?? false}
                          onCheckedChange={(checked) => {
                            updateSource.mutate({ id: source.id, force_http_live: checked });
                          }}
                        />
                      </div>

                      <div className="flex items-center justify-between rounded-lg border p-3">
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
                      
                      <div className="flex items-center justify-between rounded-lg border p-3">
                        <div className="space-y-0.5">
                          <div className="text-sm font-medium">Föredra TS för VOD</div>
                          <div className="text-xs text-muted-foreground">
                            Använd .ts för filmer/serier (kan hjälpa mot blockeringar)
                          </div>
                        </div>
                        <Switch
                          checked={source.prefer_ts_vod}
                          onCheckedChange={(checked) => {
                            updateSource.mutate({ id: source.id, prefer_ts_vod: checked });
                          }}
                        />
                      </div>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
