import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Mic, Send, Loader2, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useWatchHistory } from '@/hooks/useWatchHistory';
import { useStream } from '@/contexts/StreamContext';
import { toast } from 'sonner';

interface AIMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface AIAction {
  action: string;
  message: string;
  parameters?: Record<string, any>;
}

const DEFAULT_CHIPS = [
  'Vad ska jag se?',
  'Överraska mig',
  'Fortsätt titta',
  'Hitta en film',
  'Live TV',
];

const GENRE_CHIPS = [
  'Action', 'Komedi', 'Drama', 'Thriller', 'Sci-Fi', 'Skräck', 'Romantik', 'Dokumentär',
];

interface GeminiCommandCenterProps {
  stats: { channels: number; movies: number; series: number };
}

export function GeminiCommandCenter({ stats }: GeminiCommandCenterProps) {
  const navigate = useNavigate();
  const { activeSource } = useStream();
  const { continueWatching } = useWatchHistory(activeSource?.id);

  const [chips, setChips] = useState<string[]>(DEFAULT_CHIPS);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<AIMessage[]>([]);
  const [aiMessage, setAiMessage] = useState<string | null>(null);

  const sendToGemini = useCallback(async (userText: string) => {
    setIsLoading(true);
    setAiMessage(null);

    const newMessages: AIMessage[] = [...messages, { role: 'user', content: userText }];
    setMessages(newMessages);

    try {
      const watchHistory = continueWatching.slice(0, 5).map(h => ({
        item_name: h.item_name,
        item_type: h.item_type,
      }));

      const resp = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-command`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          },
          body: JSON.stringify({
            messages: newMessages,
            watch_history: watchHistory,
            library_context: {
              channelCount: stats.channels,
              movieCount: stats.movies,
              seriesCount: stats.series,
            },
          }),
        }
      );

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        throw new Error(err.error || 'AI-fel');
      }

      const data: AIAction = await resp.json();
      setAiMessage(data.message);
      setMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
      handleAction(data);
    } catch (e: any) {
      console.error('[GeminiCommand]', e);
      toast.error(e.message || 'Kunde inte nå AI-assistenten');
      setAiMessage('Något gick fel. Försök igen!');
    } finally {
      setIsLoading(false);
      setInput('');
    }
  }, [messages, continueWatching, stats]);

  const handleAction = useCallback((data: AIAction) => {
    const p = data.parameters || {};

    switch (data.action) {
      case 'SHOW_GENRES':
        setChips(GENRE_CHIPS);
        break;
      case 'SHOW_ACTORS':
        setChips(p.suggestions || ['Tom Hanks', 'Brad Pitt', 'Leonardo DiCaprio', 'Margot Robbie']);
        break;
      case 'PLAY_SPECIFIC':
        if (p.query) {
          navigate(`/movies?search=${encodeURIComponent(p.query)}`);
        }
        break;
      case 'FILTER_BY_ACTOR':
        if (p.actor) {
          navigate(`/movies?search=${encodeURIComponent(p.actor)}`);
        }
        break;
      case 'FILTER_BY_GENRE':
        if (p.genre) {
          navigate(`/movies?genre=${encodeURIComponent(p.genre)}`);
        }
        break;
      case 'OPEN_HUB':
        const hubMap: Record<string, string> = {
          movies: '/movies',
          series: '/series',
          live: '/live',
          favorites: '/favorites',
          continue: '/continue',
        };
        navigate(hubMap[p.hub] || '/browse');
        break;
      case 'SURPRISE_ME':
        navigate('/movies?surprise=1');
        break;
      case 'CONTINUE_WATCHING':
        navigate('/continue');
        break;
      case 'SHOW_RECOMMENDATIONS':
        if (p.suggestions?.length) {
          setChips(p.suggestions.map((s: any) => s.title || s));
        }
        break;
      case 'ASK_FOLLOWUP':
        if (p.chips?.length) {
          setChips(p.chips);
        }
        break;
      default:
        setChips(DEFAULT_CHIPS);
    }
  }, [navigate]);

  const handleChipClick = (chip: string) => {
    sendToGemini(chip);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendToGemini(input.trim());
  };

  const handleReset = () => {
    setChips(DEFAULT_CHIPS);
    setMessages([]);
    setAiMessage(null);
  };

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="relative overflow-hidden rounded-2xl border border-white/10 bg-black/40 p-5 backdrop-blur-xl sm:p-6"
    >
      {/* Glassmorphism glow effects */}
      <div className="pointer-events-none absolute -left-20 -top-20 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-blue-500/15 blur-3xl" />

      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 shadow-lg shadow-blue-500/25">
            <Sparkles className="h-5 w-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">Gemini Command Center</h2>
            <p className="text-xs text-muted-foreground">AI-styrd navigation</p>
          </div>
        </div>
        {messages.length > 0 && (
          <button
            onClick={handleReset}
            className="rounded-lg px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          >
            Börja om
          </button>
        )}
      </div>

      {/* AI Message */}
      <AnimatePresence mode="wait">
        {aiMessage && (
          <motion.div
            key={aiMessage}
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="mb-4 rounded-xl bg-white/5 px-4 py-3 text-sm text-foreground"
          >
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
              <p>{aiMessage}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Loading indicator */}
      {isLoading && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="mb-4 flex items-center gap-2 px-1 text-sm text-muted-foreground"
        >
          <Loader2 className="h-4 w-4 animate-spin text-blue-400" />
          <span>Tänker...</span>
        </motion.div>
      )}

      {/* Quick Chips */}
      <div className="mb-4 flex flex-wrap gap-2">
        <AnimatePresence mode="popLayout">
          {chips.map((chip, i) => (
            <motion.button
              key={chip}
              layout
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ delay: i * 0.05 }}
              onClick={() => handleChipClick(chip)}
              disabled={isLoading}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-foreground transition-all hover:border-primary/50 hover:bg-primary/10 hover:shadow-lg hover:shadow-primary/10 focus:outline-none focus:ring-2 focus:ring-primary/50 disabled:opacity-40"
            >
              <span>{chip}</span>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            </motion.button>
          ))}
        </AnimatePresence>
      </div>

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <button
          type="button"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-muted-foreground transition-colors hover:bg-white/10 hover:text-foreground"
          onClick={() => toast.info('Röststyrning kommer snart!')}
        >
          <Mic className="h-4 w-4" />
        </button>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Fråga vad du vill se..."
          disabled={isLoading}
          className="h-10 flex-1 rounded-xl border border-white/10 bg-white/5 px-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/50 focus:outline-none focus:ring-1 focus:ring-primary/50 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!input.trim() || isLoading}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground transition-colors hover:bg-primary/80 disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </motion.section>
  );
}
