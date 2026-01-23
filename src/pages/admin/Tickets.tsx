import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Ticket, Mail, CheckCircle, Clock, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';

interface SupportTicket {
  id: string;
  user_id: string;
  subject: string;
  message: string;
  status: string;
  created_at: string;
  updated_at: string;
  user_email?: string;
  user_name?: string;
}

export default function AdminTickets() {
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);

  useEffect(() => {
    fetchTickets();
  }, []);

  async function fetchTickets() {
    try {
      const { data: ticketsData, error: ticketsError } = await supabase
        .from('support_tickets')
        .select('*')
        .order('created_at', { ascending: false });

      if (ticketsError) throw ticketsError;

      // Fetch profile info for each ticket
      const userIds = [...new Set(ticketsData?.map(t => t.user_id) || [])];
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', userIds);

      const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);

      const enrichedTickets = ticketsData?.map(ticket => ({
        ...ticket,
        user_name: profileMap.get(ticket.user_id)?.display_name || 'Okänd',
      })) || [];

      setTickets(enrichedTickets);
    } catch (error) {
      console.error('Error fetching tickets:', error);
      toast.error('Kunde inte hämta ärenden');
    } finally {
      setLoading(false);
    }
  }

  async function closeTicket(ticketId: string) {
    try {
      const { error } = await supabase
        .from('support_tickets')
        .update({ status: 'closed' })
        .eq('id', ticketId);

      if (error) throw error;

      toast.success('Ärendet har stängts');
      setDetailDialogOpen(false);
      setSelectedTicket(null);
      fetchTickets();
    } catch (error) {
      console.error('Error closing ticket:', error);
      toast.error('Kunde inte stänga ärendet');
    }
  }

  async function reopenTicket(ticketId: string) {
    try {
      const { error } = await supabase
        .from('support_tickets')
        .update({ status: 'open' })
        .eq('id', ticketId);

      if (error) throw error;

      toast.success('Ärendet har öppnats igen');
      fetchTickets();
    } catch (error) {
      console.error('Error reopening ticket:', error);
      toast.error('Kunde inte öppna ärendet');
    }
  }

  const openTickets = tickets.filter(t => t.status === 'open');
  const closedTickets = tickets.filter(t => t.status === 'closed');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-admin-foreground">Support</h1>
        <p className="text-admin-muted-foreground">Hantera inkomna supportärenden</p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-admin-border bg-admin-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-admin-muted-foreground">Öppna ärenden</CardTitle>
            <Clock className="h-5 w-5 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-admin-foreground">{openTickets.length}</div>
          </CardContent>
        </Card>
        <Card className="border-admin-border bg-admin-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-admin-muted-foreground">Lösta ärenden</CardTitle>
            <CheckCircle className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-admin-foreground">{closedTickets.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* Tickets List */}
      <Card className="border-admin-border bg-admin-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-admin-foreground">
            <Ticket className="h-5 w-5 text-admin-primary" />
            Ärenden
          </CardTitle>
          <CardDescription className="text-admin-muted-foreground">
            {tickets.length} ärenden totalt
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : tickets.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <MessageSquare className="h-12 w-12 text-admin-muted-foreground mb-4" />
              <h3 className="text-lg font-medium text-admin-foreground">Inga ärenden</h3>
              <p className="text-admin-muted-foreground">Det finns inga supportärenden att hantera.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {tickets.map((ticket) => (
                <div
                  key={ticket.id}
                  className="flex items-center justify-between rounded-lg border border-admin-border p-4 transition-colors hover:bg-admin-accent cursor-pointer"
                  onClick={() => {
                    setSelectedTicket(ticket);
                    setDetailDialogOpen(true);
                  }}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-admin-foreground">{ticket.subject}</h3>
                      <Badge
                        variant={ticket.status === 'open' ? 'default' : 'secondary'}
                        className={ticket.status === 'open' ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-green-500 hover:bg-green-600'}
                      >
                        {ticket.status === 'open' ? 'Öppen' : 'Löst'}
                      </Badge>
                    </div>
                    <p className="text-sm text-admin-muted-foreground">
                      Från: {ticket.user_name} · {format(new Date(ticket.created_at), 'PPP', { locale: sv })}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-admin-muted-foreground hover:text-admin-foreground"
                  >
                    Visa
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Ticket Detail Dialog */}
      <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
        <DialogContent className="bg-admin-card border-admin-border max-w-2xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <DialogTitle className="text-admin-foreground">{selectedTicket?.subject}</DialogTitle>
              {selectedTicket && (
                <Badge
                  variant={selectedTicket.status === 'open' ? 'default' : 'secondary'}
                  className={selectedTicket.status === 'open' ? 'bg-yellow-500' : 'bg-green-500'}
                >
                  {selectedTicket.status === 'open' ? 'Öppen' : 'Löst'}
                </Badge>
              )}
            </div>
            <DialogDescription className="text-admin-muted-foreground">
              Från: {selectedTicket?.user_name} · {selectedTicket && format(new Date(selectedTicket.created_at), 'PPPpp', { locale: sv })}
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <div className="rounded-lg bg-admin-background p-4 border border-admin-border">
              <p className="text-admin-foreground whitespace-pre-wrap">{selectedTicket?.message}</p>
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setDetailDialogOpen(false)}
              className="border-admin-border text-admin-foreground"
            >
              Stäng
            </Button>
            <a
              href={`mailto:?subject=Re: ${selectedTicket?.subject}&body=%0A%0A---%0AOriginal message:%0A${selectedTicket?.message}`}
              className="inline-flex"
            >
              <Button variant="outline" className="gap-2 border-admin-border text-admin-foreground">
                <Mail className="h-4 w-4" />
                Svara via e-post
              </Button>
            </a>
            {selectedTicket?.status === 'open' ? (
              <Button
                onClick={() => selectedTicket && closeTicket(selectedTicket.id)}
                className="gap-2 bg-green-600 hover:bg-green-700 text-white"
              >
                <CheckCircle className="h-4 w-4" />
                Markera som löst
              </Button>
            ) : (
              <Button
                onClick={() => selectedTicket && reopenTicket(selectedTicket.id)}
                variant="outline"
                className="gap-2 border-admin-border text-admin-foreground"
              >
                Öppna igen
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
