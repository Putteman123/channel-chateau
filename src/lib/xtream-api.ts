// Xtream Codes API Types and Functions
import { supabase } from '@/integrations/supabase/client';

export interface XtreamCredentials {
  serverUrl: string;
  username: string;
  password: string;
}

export interface XtreamAuthInfo {
  user_info: {
    username: string;
    password: string;
    message: string;
    auth: number;
    status: string;
    exp_date: string;
    is_trial: string;
    active_cons: string;
    created_at: string;
    max_connections: string;
    allowed_output_formats: string[];
  };
  server_info: {
    url: string;
    port: string;
    https_port: string;
    server_protocol: string;
    rtmp_port: string;
    timezone: string;
    timestamp_now: number;
    time_now: string;
  };
}

export interface XtreamCategory {
  category_id: string;
  category_name: string;
  parent_id: number;
}

export interface XtreamChannel {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon: string;
  epg_channel_id: string;
  added: string;
  category_id: string;
  custom_sid: string;
  tv_archive: number;
  direct_source: string;
  tv_archive_duration: number;
}

export interface XtreamMovie {
  num: number;
  name: string;
  stream_type: string;
  stream_id: number;
  stream_icon: string;
  rating: string;
  rating_5based: number;
  added: string;
  category_id: string;
  container_extension: string;
  custom_sid: string;
  direct_source: string;
}

export interface XtreamSeries {
  num: number;
  name: string;
  series_id: number;
  cover: string;
  plot: string;
  cast: string;
  director: string;
  genre: string;
  releaseDate: string;
  last_modified: string;
  rating: string;
  rating_5based: number;
  backdrop_path: string[];
  youtube_trailer: string;
  episode_run_time: string;
  category_id: string;
}

export interface XtreamSeriesInfo {
  seasons: {
    air_date: string;
    episode_count: number;
    id: number;
    name: string;
    overview: string;
    season_number: number;
    cover: string;
    cover_big: string;
  }[];
  info: {
    name: string;
    cover: string;
    plot: string;
    cast: string;
    director: string;
    genre: string;
    releaseDate: string;
    last_modified: string;
    rating: string;
    rating_5based: number;
    backdrop_path: string[];
    youtube_trailer: string;
    episode_run_time: string;
    category_id: string;
  };
  episodes: {
    [season: string]: {
      id: string;
      episode_num: number;
      title: string;
      container_extension: string;
      info: {
        movie_image: string;
        plot: string;
        releasedate: string;
        rating: number;
        duration_secs: number;
        duration: string;
      };
      custom_sid: string;
      added: string;
      season: number;
      direct_source: string;
    }[];
  };
}

export interface XtreamEPG {
  epg_listings: {
    id: string;
    epg_id: string;
    title: string;
    lang: string;
    start: string;
    end: string;
    description: string;
    channel_id: string;
    start_timestamp: string;
    stop_timestamp: string;
  }[];
}

// Build base URL from credentials
export function buildBaseUrl(creds: XtreamCredentials): string {
  let url = creds.serverUrl.trim();
  // Remove trailing slash
  if (url.endsWith('/')) {
    url = url.slice(0, -1);
  }
  // Ensure protocol
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url;
  }
  return url;
}

// Build API URL
export function buildApiUrl(creds: XtreamCredentials, action?: string): string {
  const base = buildBaseUrl(creds);
  let url = `${base}/player_api.php?username=${encodeURIComponent(creds.username)}&password=${encodeURIComponent(creds.password)}`;
  if (action) {
    url += `&action=${action}`;
  }
  return url;
}

// Import the new Cloudflare rewrite utility
import { transformStreamUrl, isCloudflareUrl } from './cloudflare-rewrite';

/**
 * Check if a URL is already using our proxy
 */
export function isProxiedUrl(url: string): boolean {
  return isCloudflareUrl(url);
}

/**
 * Transform URL to use proxy (handles redirects internally, MITM mode)
 * NOTE: No longer does .ts → .m3u8 conversion - proxy handles everything
 * 
 * @param url - The original stream URL
 */
function proxyStreamUrl(url: string): string {
  // Don't double-transform
  if (isCloudflareUrl(url)) {
    console.log('[XtreamAPI] URL already proxied, skipping:', url.substring(0, 60) + '...');
    return url;
  }
  
  // Transform through proxy - sends exact URL, no format changes
  const transformed = transformStreamUrl(url);
  console.log('[XtreamAPI] Original:', url);
  console.log('[XtreamAPI] Proxied:', transformed.substring(0, 80) + '...');
  return transformed;
}

// Build stream URL for live channels
export function buildLiveStreamUrl(
  creds: XtreamCredentials, 
  streamId: number, 
  options: { useProxy?: boolean; preferTs?: boolean; forceHttp?: boolean } = {}
): string {
  const { useProxy = true, preferTs = true, forceHttp = false } = options;
  let base = buildBaseUrl(creds);
  
  // CRITICAL: Detect if server_url is incorrectly set to our proxy domain
  const isServerAlreadyProxy = base.includes('vpn.premiumvinted.se') || base.includes('line.premiumvinted.se');
  if (isServerAlreadyProxy) {
    console.error('[XtreamAPI] ❌ server_url är felaktigt inställd till proxy-domänen!');
    return 'error://server_url_is_proxy_domain';
  }
  
  // Force HTTP protocol if requested
  if (forceHttp && base.startsWith('https://')) {
    base = base.replace('https://', 'http://');
    console.log('[XtreamAPI] Forced HTTP for live stream');
  }
  
  // Build stream URL with chosen extension
  // NOTE: We no longer convert .ts to .m3u8 - the proxy handles redirects internally
  const extension = preferTs ? 'ts' : 'm3u8';
  const directUrl = `${base}/live/${encodeURIComponent(creds.username)}/${encodeURIComponent(creds.password)}/${streamId}.${extension}`;
  
  // Use proxy if enabled - handles Mixed Content and redirects (MITM mode)
  if (useProxy) {
    console.log('[XtreamAPI] Using proxy for:', directUrl.substring(0, 60) + '...');
    return proxyStreamUrl(directUrl);
  }
  
  return directUrl;
}

// Build stream URL for movies
export function buildMovieStreamUrl(
  creds: XtreamCredentials, 
  streamId: number, 
  options: { extension?: string; useProxy?: boolean; preferTs?: boolean } = {}
): string {
  const { extension = 'mp4', useProxy = true, preferTs = false } = options;
  const base = buildBaseUrl(creds);
  const directUrl = `${base}/movie/${encodeURIComponent(creds.username)}/${encodeURIComponent(creds.password)}/${streamId}.${extension}`;
  
  // For VOD, use proxy if explicitly enabled - handles CORS and buffering
  if (useProxy) {
    if (preferTs) {
      const tsUrl = `${base}/movie/${encodeURIComponent(creds.username)}/${encodeURIComponent(creds.password)}/${streamId}.ts`;
      console.log('[XtreamAPI] Using stream proxy (ts) for movie:', tsUrl.substring(0, 50) + '...');
      return proxyStreamUrl(tsUrl);
    }
    console.log('[XtreamAPI] Using stream proxy for movie:', directUrl.substring(0, 50) + '...');
    return proxyStreamUrl(directUrl);
  }
  
  return directUrl;
}

// Build stream URL for series episodes
export function buildSeriesStreamUrl(
  creds: XtreamCredentials, 
  episodeId: string, 
  options: { extension?: string; useProxy?: boolean; preferTs?: boolean } = {}
): string {
  const { extension = 'mp4', useProxy = true, preferTs = false } = options;
  const base = buildBaseUrl(creds);
  const directUrl = `${base}/series/${encodeURIComponent(creds.username)}/${encodeURIComponent(creds.password)}/${episodeId}.${extension}`;
  
  // For VOD, use proxy if explicitly enabled - handles CORS and buffering
  if (useProxy) {
    if (preferTs) {
      const tsUrl = `${base}/series/${encodeURIComponent(creds.username)}/${encodeURIComponent(creds.password)}/${episodeId}.ts`;
      console.log('[XtreamAPI] Using stream proxy (ts) for series:', tsUrl.substring(0, 50) + '...');
      return proxyStreamUrl(tsUrl);
    }
    console.log('[XtreamAPI] Using stream proxy for series:', directUrl.substring(0, 50) + '...');
    return proxyStreamUrl(directUrl);
  }
  
  return directUrl;
}

// Proxy API call through edge function to avoid CORS/Mixed Content issues
async function proxyApiCall<T>(
  creds: XtreamCredentials,
  action?: string,
  params?: Record<string, string | number>
): Promise<T> {
  console.log('[XtreamAPI] Calling proxy with action:', action, 'params:', params);
  
  const { data, error } = await supabase.functions.invoke('xtream-proxy', {
    body: {
      serverUrl: creds.serverUrl,
      username: creds.username,
      password: creds.password,
      action,
      params,
    },
  });

  console.log('[XtreamAPI] Proxy response - error:', error, 'data type:', typeof data, 'data:', data);

  if (error) {
    console.error('[XtreamAPI] Function invoke error:', error);
    // When edge function returns non-2xx, Supabase returns `error` and may still include JSON in `data`.
    // Preserve upstream details so the UI can detect proxy blocks (502/ECONNREFUSED) and show proper guidance.
    const extra =
      data && typeof data === 'object'
        ? JSON.stringify(data)
        : typeof data === 'string'
          ? data
          : '';
    throw new Error(extra ? `API call failed: ${error.message} | ${extra}` : `API call failed: ${error.message}`);
  }

  if (!data) {
    console.error('[XtreamAPI] No data returned from proxy');
    throw new Error('No data returned from API');
  }

  // Handle error in response data
  if (typeof data === 'object' && data !== null && 'error' in data) {
    console.error('[XtreamAPI] API error:', data.error);
    throw new Error(data.error as string);
  }

  console.log('[XtreamAPI] Returning data, length:', Array.isArray(data) ? data.length : 'not array');
  return data as T;
}

// Authenticate with Xtream Codes server
export async function authenticate(creds: XtreamCredentials): Promise<XtreamAuthInfo> {
  const data = await proxyApiCall<XtreamAuthInfo>(creds);
  if (!data.user_info || data.user_info.auth !== 1) {
    throw new Error('Invalid credentials or account inactive');
  }
  return data;
}

// Get live TV categories
export async function getLiveCategories(creds: XtreamCredentials): Promise<XtreamCategory[]> {
  return proxyApiCall<XtreamCategory[]>(creds, 'get_live_categories');
}

// Get live channels
export async function getLiveStreams(creds: XtreamCredentials, categoryId?: string): Promise<XtreamChannel[]> {
  const params = categoryId ? { category_id: categoryId } : undefined;
  return proxyApiCall<XtreamChannel[]>(creds, 'get_live_streams', params);
}

// Get VOD categories
export async function getVodCategories(creds: XtreamCredentials): Promise<XtreamCategory[]> {
  return proxyApiCall<XtreamCategory[]>(creds, 'get_vod_categories');
}

// Get VOD streams (movies)
export async function getVodStreams(creds: XtreamCredentials, categoryId?: string): Promise<XtreamMovie[]> {
  const params = categoryId ? { category_id: categoryId } : undefined;
  return proxyApiCall<XtreamMovie[]>(creds, 'get_vod_streams', params);
}

// Get series categories
export async function getSeriesCategories(creds: XtreamCredentials): Promise<XtreamCategory[]> {
  return proxyApiCall<XtreamCategory[]>(creds, 'get_series_categories');
}

// Get series list
export async function getSeries(creds: XtreamCredentials, categoryId?: string): Promise<XtreamSeries[]> {
  const params = categoryId ? { category_id: categoryId } : undefined;
  return proxyApiCall<XtreamSeries[]>(creds, 'get_series', params);
}

// Get series info with episodes
export async function getSeriesInfo(creds: XtreamCredentials, seriesId: number): Promise<XtreamSeriesInfo> {
  return proxyApiCall<XtreamSeriesInfo>(creds, 'get_series_info', { series_id: seriesId });
}

// Get EPG for a channel
export async function getEPG(creds: XtreamCredentials, streamId: number): Promise<XtreamEPG> {
  return proxyApiCall<XtreamEPG>(creds, 'get_short_epg', { stream_id: streamId });
}
