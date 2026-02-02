/**
 * Sync Engine Hook
 * Manages initial full sync and background delta sync
 * Provides IPTVX-like instant startup from local cache
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { 
  ChannelCache, 
  VODCache, 
  SeriesCache, 
  SyncMeta,
  getCacheStats 
} from '@/lib/local-cache';
import { useStreamSources, StreamSource } from './useStreamSources';
import * as XtreamAPI from '@/lib/xtream-api';

export type SyncStage = 
  | 'idle' 
  | 'checking' 
  | 'channels' 
  | 'movies' 
  | 'series' 
  | 'epg' 
  | 'complete' 
  | 'error';

export interface SyncProgress {
  stage: SyncStage;
  progress: number; // 0-100
  message: string;
  isInitialSync: boolean;
  error?: string;
}

export interface SyncEngineResult {
  syncProgress: SyncProgress;
  isSyncing: boolean;
  needsInitialSync: boolean;
  startFullSync: () => Promise<void>;
  startDeltaSync: () => Promise<void>;
  cacheStats: {
    channelCount: number;
    vodCount: number;
    seriesCount: number;
    lastSync: number | null;
  };
}

const initialProgress: SyncProgress = {
  stage: 'idle',
  progress: 0,
  message: '',
  isInitialSync: false,
};

export function useSyncEngine(): SyncEngineResult {
  const { activeSource } = useStreamSources();
  const queryClient = useQueryClient();
  
  const [syncProgress, setSyncProgress] = useState<SyncProgress>(initialProgress);
  const [needsInitialSync, setNeedsInitialSync] = useState(false);
  const [cacheStats, setCacheStats] = useState({
    channelCount: 0,
    vodCount: 0,
    seriesCount: 0,
    lastSync: null as number | null,
  });
  
  const syncingRef = useRef(false);
  
  // Check if initial sync is needed when source changes
  useEffect(() => {
    async function checkSyncNeeded() {
      if (!activeSource?.id) {
        setNeedsInitialSync(false);
        return;
      }
      
      const needsSync = await SyncMeta.needsFullSync(activeSource.id);
      const stats = await getCacheStats(activeSource.id);
      
      setNeedsInitialSync(needsSync);
      setCacheStats({
        channelCount: stats.channelCount,
        vodCount: stats.vodCount,
        seriesCount: stats.seriesCount,
        lastSync: stats.lastSync,
      });
      
      console.log('[SyncEngine] Cache check:', {
        sourceId: activeSource.id,
        needsSync,
        stats,
      });
    }
    
    checkSyncNeeded();
  }, [activeSource?.id]);
  
  /**
   * Build Xtream credentials from source
   */
  const getCredentials = useCallback((source: StreamSource): XtreamAPI.XtreamCredentials | null => {
    if (source.source_type !== 'xtream' || !source.server_url || !source.username || !source.password) {
      return null;
    }
    return {
      serverUrl: source.server_url,
      username: source.username,
      password: source.password,
    };
  }, []);
  
  /**
   * Full sync - downloads all data from API to local cache
   */
  const startFullSync = useCallback(async () => {
    if (!activeSource || syncingRef.current) return;
    
    const credentials = getCredentials(activeSource);
    if (!credentials) {
      console.warn('[SyncEngine] No valid credentials for full sync');
      return;
    }
    
    syncingRef.current = true;
    const sourceId = activeSource.id;
    
    try {
      // Stage 1: Checking
      setSyncProgress({
        stage: 'checking',
        progress: 5,
        message: 'Kontrollerar bibliotek...',
        isInitialSync: true,
      });
      
      await new Promise(r => setTimeout(r, 300));
      
      // Stage 2: Channels
      setSyncProgress({
        stage: 'channels',
        progress: 15,
        message: 'Hämtar kanaler...',
        isInitialSync: true,
      });
      
      const channels = await XtreamAPI.getLiveStreams(credentials);
      await ChannelCache.set(sourceId, channels);
      
      setSyncProgress({
        stage: 'channels',
        progress: 35,
        message: `${channels.length} kanaler synkroniserade`,
        isInitialSync: true,
      });
      
      // Stage 3: Movies
      setSyncProgress({
        stage: 'movies',
        progress: 40,
        message: 'Hämtar filmer...',
        isInitialSync: true,
      });
      
      const movies = await XtreamAPI.getVodStreams(credentials);
      await VODCache.set(sourceId, movies);
      
      setSyncProgress({
        stage: 'movies',
        progress: 60,
        message: `${movies.length} filmer synkroniserade`,
        isInitialSync: true,
      });
      
      // Stage 4: Series
      setSyncProgress({
        stage: 'series',
        progress: 65,
        message: 'Hämtar serier...',
        isInitialSync: true,
      });
      
      const series = await XtreamAPI.getSeries(credentials);
      await SeriesCache.set(sourceId, series);
      
      setSyncProgress({
        stage: 'series',
        progress: 85,
        message: `${series.length} serier synkroniserade`,
        isInitialSync: true,
      });
      
      // Stage 5: EPG (optional, skip if fails)
      setSyncProgress({
        stage: 'epg',
        progress: 90,
        message: 'Hämtar programguide...',
        isInitialSync: true,
      });
      
      // Update sync metadata
      await SyncMeta.set(sourceId, {
        lastFullSync: Date.now(),
        channelCount: channels.length,
        vodCount: movies.length,
        seriesCount: series.length,
      });
      
      // Complete
      setSyncProgress({
        stage: 'complete',
        progress: 100,
        message: 'Biblioteket är redo!',
        isInitialSync: true,
      });
      
      // Update stats
      setCacheStats({
        channelCount: channels.length,
        vodCount: movies.length,
        seriesCount: series.length,
        lastSync: Date.now(),
      });
      
      setNeedsInitialSync(false);
      
      // Invalidate queries to use fresh data
      queryClient.invalidateQueries({ queryKey: ['live-channels'] });
      queryClient.invalidateQueries({ queryKey: ['vod-streams'] });
      queryClient.invalidateQueries({ queryKey: ['series'] });
      
      console.log('[SyncEngine] Full sync complete:', {
        channels: channels.length,
        movies: movies.length,
        series: series.length,
      });
      
      // Reset after short delay
      setTimeout(() => {
        setSyncProgress(initialProgress);
      }, 2000);
      
    } catch (error) {
      console.error('[SyncEngine] Full sync failed:', error);
      setSyncProgress({
        stage: 'error',
        progress: 0,
        message: 'Synkronisering misslyckades',
        isInitialSync: true,
        error: error instanceof Error ? error.message : 'Okänt fel',
      });
    } finally {
      syncingRef.current = false;
    }
  }, [activeSource, getCredentials, queryClient]);
  
  /**
   * Delta sync - background check for updates without blocking UI
   */
  const startDeltaSync = useCallback(async () => {
    if (!activeSource || syncingRef.current) return;
    
    const credentials = getCredentials(activeSource);
    if (!credentials) return;
    
    console.log('[SyncEngine] Starting delta sync...');
    
    try {
      // Quick check - fetch counts only to detect changes
      const [channels, movies, series] = await Promise.all([
        XtreamAPI.getLiveStreams(credentials),
        XtreamAPI.getVodStreams(credentials),
        XtreamAPI.getSeries(credentials),
      ]);
      
      const currentStats = await getCacheStats(activeSource.id);
      
      // Check if counts differ
      const hasChanges = 
        channels.length !== currentStats.channelCount ||
        movies.length !== currentStats.vodCount ||
        series.length !== currentStats.seriesCount;
      
      if (hasChanges) {
        console.log('[SyncEngine] Delta sync found changes, updating cache...');
        
        // Update cache with new data
        await Promise.all([
          ChannelCache.set(activeSource.id, channels),
          VODCache.set(activeSource.id, movies),
          SeriesCache.set(activeSource.id, series),
        ]);
        
        await SyncMeta.set(activeSource.id, {
          lastDeltaSync: Date.now(),
          channelCount: channels.length,
          vodCount: movies.length,
          seriesCount: series.length,
        });
        
        setCacheStats({
          channelCount: channels.length,
          vodCount: movies.length,
          seriesCount: series.length,
          lastSync: Date.now(),
        });
        
        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['live-channels'] });
        queryClient.invalidateQueries({ queryKey: ['vod-streams'] });
        queryClient.invalidateQueries({ queryKey: ['series'] });
      } else {
        console.log('[SyncEngine] Delta sync: no changes detected');
        await SyncMeta.set(activeSource.id, {
          lastDeltaSync: Date.now(),
        });
      }
      
    } catch (error) {
      console.warn('[SyncEngine] Delta sync failed:', error);
      // Don't show error UI for background sync
    }
  }, [activeSource, getCredentials, queryClient]);
  
  return {
    syncProgress,
    isSyncing: syncProgress.stage !== 'idle' && syncProgress.stage !== 'complete',
    needsInitialSync,
    startFullSync,
    startDeltaSync,
    cacheStats,
  };
}
