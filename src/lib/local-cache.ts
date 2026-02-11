/**
 * High-Performance Local Cache System
 * Uses IndexedDB via idb-keyval for fast read/write operations
 * Similar to MMKV performance characteristics for web
 */

import { get, set, del, createStore, UseStore } from 'idb-keyval';

// Create separate stores for different data types
const channelStore = createStore('streamify-channels', 'channels');
const vodStore = createStore('streamify-vod', 'movies');
const seriesStore = createStore('streamify-series', 'series');
const epgStore = createStore('streamify-epg', 'epg');
const metaStore = createStore('streamify-meta', 'metadata');

export interface CachedData<T> {
  data: T;
  timestamp: number;
  sourceId: string;
  version: number;
}

export interface SyncMetadata {
  sourceId: string;
  lastFullSync: number;
  lastDeltaSync: number;
  channelCount: number;
  vodCount: number;
  seriesCount: number;
  version: number;
}

const CACHE_VERSION = 1;
const CACHE_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days for full refresh

/**
 * Generic cache operations
 */
async function getCached<T>(
  key: string, 
  store: UseStore
): Promise<CachedData<T> | null> {
  try {
    const cached = await get<CachedData<T>>(key, store);
    return cached || null;
  } catch (error) {
    console.error('[LocalCache] Read error:', error);
    return null;
  }
}

async function setCached<T>(
  key: string, 
  data: T, 
  sourceId: string,
  store: UseStore
): Promise<void> {
  try {
    const cached: CachedData<T> = {
      data,
      timestamp: Date.now(),
      sourceId,
      version: CACHE_VERSION,
    };
    await set(key, cached, store);
  } catch (error) {
    console.error('[LocalCache] Write error:', error);
  }
}

async function deleteCached(key: string, store: UseStore): Promise<void> {
  try {
    await del(key, store);
  } catch (error) {
    console.error('[LocalCache] Delete error:', error);
  }
}

/**
 * Channel cache operations
 */
export const ChannelCache = {
  async get(sourceId: string) {
    return getCached<unknown[]>(`channels_${sourceId}`, channelStore);
  },
  
  async set(sourceId: string, channels: unknown[]) {
    await setCached(`channels_${sourceId}`, channels, sourceId, channelStore);
    console.log(`[ChannelCache] Saved ${channels.length} channels for source ${sourceId}`);
  },
  
  async clear(sourceId: string) {
    await deleteCached(`channels_${sourceId}`, channelStore);
  },
  
  async isValid(sourceId: string): Promise<boolean> {
    const cached = await this.get(sourceId);
    if (!cached) return false;
    return (Date.now() - cached.timestamp) < CACHE_EXPIRY_MS;
  },
};

/**
 * VOD (Movies) cache operations
 */
export const VODCache = {
  async get(sourceId: string) {
    return getCached<unknown[]>(`vod_${sourceId}`, vodStore);
  },
  
  async set(sourceId: string, movies: unknown[]) {
    await setCached(`vod_${sourceId}`, movies, sourceId, vodStore);
    console.log(`[VODCache] Saved ${movies.length} movies for source ${sourceId}`);
  },
  
  async clear(sourceId: string) {
    await deleteCached(`vod_${sourceId}`, vodStore);
  },
  
  async isValid(sourceId: string): Promise<boolean> {
    const cached = await this.get(sourceId);
    if (!cached) return false;
    return (Date.now() - cached.timestamp) < CACHE_EXPIRY_MS;
  },
};

/**
 * Series cache operations
 */
export const SeriesCache = {
  async get(sourceId: string) {
    return getCached<unknown[]>(`series_${sourceId}`, seriesStore);
  },
  
  async set(sourceId: string, series: unknown[]) {
    await setCached(`series_${sourceId}`, series, sourceId, seriesStore);
    console.log(`[SeriesCache] Saved ${series.length} series for source ${sourceId}`);
  },
  
  async clear(sourceId: string) {
    await deleteCached(`series_${sourceId}`, seriesStore);
  },
  
  async isValid(sourceId: string): Promise<boolean> {
    const cached = await this.get(sourceId);
    if (!cached) return false;
    return (Date.now() - cached.timestamp) < CACHE_EXPIRY_MS;
  },
};

/**
 * EPG cache operations
 */
export const EPGCache = {
  async get(sourceId: string) {
    return getCached<unknown>(`epg_${sourceId}`, epgStore);
  },
  
  async set(sourceId: string, epg: unknown) {
    await setCached(`epg_${sourceId}`, epg, sourceId, epgStore);
    console.log(`[EPGCache] Saved EPG data for source ${sourceId}`);
  },
  
  async clear(sourceId: string) {
    await deleteCached(`epg_${sourceId}`, epgStore);
  },
};

/**
 * Sync metadata operations
 */
export const SyncMeta = {
  async get(sourceId: string): Promise<SyncMetadata | null> {
    const cached = await getCached<SyncMetadata>(`sync_${sourceId}`, metaStore);
    return cached?.data || null;
  },
  
  async set(sourceId: string, meta: Partial<SyncMetadata>) {
    const existing = await this.get(sourceId);
    const updated: SyncMetadata = {
      sourceId,
      lastFullSync: meta.lastFullSync ?? existing?.lastFullSync ?? 0,
      lastDeltaSync: meta.lastDeltaSync ?? Date.now(),
      channelCount: meta.channelCount ?? existing?.channelCount ?? 0,
      vodCount: meta.vodCount ?? existing?.vodCount ?? 0,
      seriesCount: meta.seriesCount ?? existing?.seriesCount ?? 0,
      version: CACHE_VERSION,
    };
    await setCached(`sync_${sourceId}`, updated, sourceId, metaStore);
  },
  
  async needsFullSync(sourceId: string): Promise<boolean> {
    const meta = await this.get(sourceId);
    if (!meta) return true;
    // Need full sync if never synced or cache expired
    return !meta.lastFullSync || (Date.now() - meta.lastFullSync) > CACHE_EXPIRY_MS;
  },
  
  async clear(sourceId: string) {
    await deleteCached(`sync_${sourceId}`, metaStore);
  },
};

/**
 * Clear all cached data for a specific source
 */
export async function clearSourceCache(sourceId: string): Promise<void> {
  await Promise.all([
    ChannelCache.clear(sourceId),
    VODCache.clear(sourceId),
    SeriesCache.clear(sourceId),
    EPGCache.clear(sourceId),
    SyncMeta.clear(sourceId),
  ]);
  console.log(`[LocalCache] Cleared all cache for source ${sourceId}`);
}

/**
 * Get cache statistics for a source
 */
export async function getCacheStats(sourceId: string) {
  const [channels, vod, series, meta] = await Promise.all([
    ChannelCache.get(sourceId),
    VODCache.get(sourceId),
    SeriesCache.get(sourceId),
    SyncMeta.get(sourceId),
  ]);
  
  return {
    hasCache: !!(channels || vod || series),
    channelCount: Array.isArray(channels?.data) ? channels.data.length : 0,
    vodCount: Array.isArray(vod?.data) ? vod.data.length : 0,
    seriesCount: Array.isArray(series?.data) ? series.data.length : 0,
    lastSync: meta?.lastFullSync || null,
    cacheAge: channels?.timestamp ? Date.now() - channels.timestamp : null,
  };
}
