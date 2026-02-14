/**
 * Sync Overlay Component
 * Beautiful full-screen sync progress UI
 * Shows during initial library synchronization
 */

import { useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, CloudDownload, Tv, Film, Clapperboard, Calendar, CheckCircle2, AlertCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import faviconImg from '/favicon.png';
import { SyncProgress, SyncStage } from '@/hooks/useSyncEngine';

interface SyncOverlayProps {
  syncProgress: SyncProgress;
  onRetry?: () => void;
}

const stageIcons: Record<SyncStage, React.ReactNode> = {
  idle: null,
  checking: <CloudDownload className="h-8 w-8" />,
  channels: <Tv className="h-8 w-8" />,
  movies: <Film className="h-8 w-8" />,
  series: <Clapperboard className="h-8 w-8" />,
  epg: <Calendar className="h-8 w-8" />,
  complete: <CheckCircle2 className="h-8 w-8 text-green-500" />,
  error: <AlertCircle className="h-8 w-8 text-destructive" />,
};

const stageLabels: Record<SyncStage, string> = {
  idle: '',
  checking: 'Kontrollerar bibliotek',
  channels: 'Synkroniserar kanaler',
  movies: 'Synkroniserar filmer',
  series: 'Synkroniserar serier',
  epg: 'Hämtar programguide',
  complete: 'Klart!',
  error: 'Ett fel uppstod',
};

export function SyncOverlay({ syncProgress, onRetry }: SyncOverlayProps) {
  const { stage, progress, message, isInitialSync, error } = syncProgress;
  
  // Don't render if idle
  if (stage === 'idle') return null;
  
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-background"
      >
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-background via-background to-primary/10" />
        
        {/* Animated background particles */}
        <div className="absolute inset-0 overflow-hidden">
          {[...Array(20)].map((_, i) => (
            <motion.div
              key={i}
              className="absolute h-1 w-1 rounded-full bg-primary/30"
              initial={{
                x: Math.random() * window.innerWidth,
                y: Math.random() * window.innerHeight,
                scale: Math.random() * 2,
              }}
              animate={{
                y: [null, Math.random() * window.innerHeight],
                opacity: [0.3, 0.6, 0.3],
              }}
              transition={{
                duration: 3 + Math.random() * 2,
                repeat: Infinity,
                ease: 'linear',
              }}
            />
          ))}
        </div>
        
        {/* Content */}
        <div className="relative z-10 flex flex-col items-center gap-8 px-8">
          {/* Logo */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.1 }}
          >
            <img src={faviconImg} alt="Streamify" className="h-24 w-24 rounded-xl shadow-lg shadow-primary/40" />
          </motion.div>
          
          {/* Title */}
          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-3xl font-bold tracking-tight"
          >
            {isInitialSync ? 'Synkroniserar bibliotek' : 'Uppdaterar...'}
          </motion.h1>
          
          {/* Stage indicator */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="flex items-center gap-4"
          >
            <motion.div
              key={stage}
              initial={{ scale: 0.5, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-card text-primary"
            >
              {stage === 'complete' || stage === 'error' ? (
                stageIcons[stage]
              ) : (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                >
                  {stageIcons[stage] || <Loader2 className="h-8 w-8" />}
                </motion.div>
              )}
            </motion.div>
            
            <div className="text-left">
              <p className="text-lg font-medium">{stageLabels[stage]}</p>
              <p className="text-sm text-muted-foreground">{message}</p>
            </div>
          </motion.div>
          
          {/* Progress bar */}
          {stage !== 'error' && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: '100%', opacity: 1 }}
              transition={{ delay: 0.4 }}
              className="w-full max-w-md"
            >
              <Progress value={progress} className="h-2" />
              <p className="mt-2 text-center text-sm text-muted-foreground">
                {progress}% klart
              </p>
            </motion.div>
          )}
          
          {/* Error state */}
          {stage === 'error' && (
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="flex flex-col items-center gap-4"
            >
              <p className="text-destructive">{error}</p>
              {onRetry && (
                <Button onClick={onRetry} variant="outline">
                  Försök igen
                </Button>
              )}
            </motion.div>
          )}
          
          {/* Tips */}
          {isInitialSync && stage !== 'complete' && stage !== 'error' && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1 }}
              className="max-w-md text-center text-sm text-muted-foreground"
            >
              Detta behöver bara göras en gång per spellista. 
              Nästa gång startar appen direkt från minnet.
            </motion.p>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
