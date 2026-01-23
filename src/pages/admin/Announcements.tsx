import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Megaphone, Plus, Trash2, ToggleLeft, ToggleRight, AlertTriangle, Info } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

interface Announcement {
  id: string;
  message: string;
  type: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export default function AdminAnnouncements() {
  const { user } = useAuth();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  
  // Form state
  const [newMessage, setNewMessage] = useState('');
  const [newType, setNewType] = useState<'info' | 'warning' | 'error'>('info');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchAnnouncements();
  }, []);

  async function fetchAnnouncements() {
    try {
      const { data, error } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAnnouncements(data || []);
    } catch (error) {
      console.error('Error fetching announcements:', error);
      toast.error('Kunde inte hämta meddelanden');
    } finally {
      setLoading(false);
    }
  }

  async function createAnnouncement() {
    if (!newMessage.trim()) {
      toast.error('Meddelandet kan inte vara tomt');
      return;
    }

    setCreating(true);
    try {
      const { error } = await supabase
        .from('announcements')
        .insert({
          message: newMessage.trim(),
          type: newType,
          is_active: true,
          created_by: user?.id,
        });

      if (error) throw error;

      toast.success('Meddelandet har skapats');
      setCreateDialogOpen(false);
      setNewMessage('');
      setNewType('info');
      fetchAnnouncements();
    } catch (error) {
      console.error('Error creating announcement:', error);
      toast.error('Kunde inte skapa meddelandet');
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(announcement: Announcement) {
    try {
      const { error } = await supabase
        .from('announcements')
        .update({ is_active: !announcement.is_active })
        .eq('id', announcement.id);

      if (error) throw error;

      toast.success(announcement.is_active ? 'Meddelandet har inaktiverats' : 'Meddelandet är nu aktivt');
      fetchAnnouncements();
    } catch (error) {
      console.error('Error toggling announcement:', error);
      toast.error('Kunde inte uppdatera meddelandet');
    }
  }

  async function deleteAnnouncement(id: string) {
    try {
      const { error } = await supabase
        .from('announcements')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast.success('Meddelandet har tagits bort');
      fetchAnnouncements();
    } catch (error) {
      console.error('Error deleting announcement:', error);
      toast.error('Kunde inte ta bort meddelandet');
    }
  }

  const activeAnnouncements = announcements.filter(a => a.is_active);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'warning':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
      case 'error':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default:
        return <Info className="h-4 w-4 text-blue-500" />;
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'warning':
        return <Badge className="bg-yellow-500 hover:bg-yellow-600">Varning</Badge>;
      case 'error':
        return <Badge variant="destructive">Kritiskt</Badge>;
      default:
        return <Badge className="bg-blue-500 hover:bg-blue-600">Info</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-admin-foreground">Meddelanden</h1>
          <p className="text-admin-muted-foreground">Skicka globala meddelanden till alla användare</p>
        </div>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2 bg-admin-primary hover:bg-admin-primary/90">
              <Plus className="h-4 w-4" />
              Skapa meddelande
            </Button>
          </DialogTrigger>
          <DialogContent className="bg-admin-card border-admin-border">
            <DialogHeader>
              <DialogTitle className="text-admin-foreground">Nytt meddelande</DialogTitle>
              <DialogDescription className="text-admin-muted-foreground">
                Skapa ett nytt globalt meddelande som visas för alla användare.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label className="text-admin-foreground">Typ</Label>
                <Select value={newType} onValueChange={(v: 'info' | 'warning' | 'error') => setNewType(v)}>
                  <SelectTrigger className="bg-admin-background border-admin-border text-admin-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-admin-card border-admin-border">
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warning">Varning</SelectItem>
                    <SelectItem value="error">Kritiskt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-admin-foreground">Meddelande</Label>
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="T.ex. Serverunderhåll planerat kl 22:00..."
                  className="bg-admin-background border-admin-border text-admin-foreground min-h-[100px]"
                />
              </div>
              {/* Preview */}
              {newMessage && (
                <div className="space-y-2">
                  <Label className="text-admin-muted-foreground">Förhandsvisning</Label>
                  <div className={`rounded-lg p-3 ${
                    newType === 'error' ? 'bg-red-500/10 border border-red-500/20' :
                    newType === 'warning' ? 'bg-yellow-500/10 border border-yellow-500/20' :
                    'bg-blue-500/10 border border-blue-500/20'
                  }`}>
                    <div className="flex items-center gap-2">
                      {getTypeIcon(newType)}
                      <span className="text-sm text-admin-foreground">{newMessage}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
                className="border-admin-border text-admin-foreground"
              >
                Avbryt
              </Button>
              <Button
                onClick={createAnnouncement}
                disabled={creating || !newMessage.trim()}
                className="bg-admin-primary hover:bg-admin-primary/90"
              >
                {creating ? 'Skapar...' : 'Skapa'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Active Banner Preview */}
      {activeAnnouncements.length > 0 && (
        <Card className="border-admin-border bg-admin-card">
          <CardHeader>
            <CardTitle className="text-admin-foreground">Aktiv banner (förhandsgranskning)</CardTitle>
            <CardDescription className="text-admin-muted-foreground">
              Så här ser det ut för användarna
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`rounded-lg p-3 ${
              activeAnnouncements[0].type === 'error' ? 'bg-red-500/10 border border-red-500/20' :
              activeAnnouncements[0].type === 'warning' ? 'bg-yellow-500/10 border border-yellow-500/20' :
              'bg-blue-500/10 border border-blue-500/20'
            }`}>
              <div className="flex items-center gap-2">
                {getTypeIcon(activeAnnouncements[0].type)}
                <span className="text-sm text-admin-foreground">{activeAnnouncements[0].message}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Announcements List */}
      <Card className="border-admin-border bg-admin-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-admin-foreground">
            <Megaphone className="h-5 w-5 text-admin-primary" />
            Alla meddelanden
          </CardTitle>
          <CardDescription className="text-admin-muted-foreground">
            {announcements.length} meddelanden, {activeAnnouncements.length} aktiva
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : announcements.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <Megaphone className="h-12 w-12 text-admin-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-admin-foreground">Inga meddelanden</h3>
              <p className="text-admin-muted-foreground">Skapa ett meddelande för att informera användarna.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {announcements.map((announcement) => (
                <div
                  key={announcement.id}
                  className={`flex items-center justify-between rounded-lg border p-4 transition-colors ${
                    announcement.is_active 
                      ? 'border-admin-primary bg-admin-primary/5' 
                      : 'border-admin-border bg-admin-background opacity-60'
                  }`}
                >
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2">
                      {getTypeBadge(announcement.type)}
                      {announcement.is_active && (
                        <Badge variant="outline" className="border-green-500 text-green-500">
                          Aktiv
                        </Badge>
                      )}
                    </div>
                    <p className="text-admin-foreground">{announcement.message}</p>
                    <p className="text-xs text-admin-muted-foreground">
                      Skapad {format(new Date(announcement.created_at), 'PPP', { locale: sv })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggleActive(announcement)}
                      className="text-admin-muted-foreground hover:text-admin-foreground"
                    >
                      {announcement.is_active ? (
                        <ToggleRight className="h-5 w-5 text-green-500" />
                      ) : (
                        <ToggleLeft className="h-5 w-5" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => deleteAnnouncement(announcement.id)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
