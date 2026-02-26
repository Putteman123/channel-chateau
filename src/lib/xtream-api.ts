// Xtream Codes API Types and Functions
import { supabase } from '@/integrations/supabase/client';
import { Capacitor } from '@capacitor/core';

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

// Import the Hybrid Proxy utility (Cloudflare for domains, Edge Function for IPs)
import { 
  tunnelOrProxy, 
  isCloudflareUrl, 
  isSupabaseProxyUrl,
  isIpAddress,
  getConnectionDisplayName,
  SUPABASE_PROXY_BASE,
} from './cloudflare-rewrite';

/**
 * Check if a URL is already using our proxy system
 */
export function isProxiedUrl(url: string): boolean {
  return isCloudflareUrl(url) || isSupabaseProxyUrl(url);
}

/**
 * Get connection type display name for debug UI
 */
export { getConnectionDisplayName };

/**
 * Transform URL using HYBRID approach:
 * - Domain-based URLs → Cloudflare Tunnel (faster)
 * - IP-based URLs → Supabase Edge Function (universal)
 * 
 * @param url - The original stream URL
 */
function tunnelStreamUrl(url: string): string {
  // Don't double-transform
  if (isProxiedUrl(url)) {
    console.log('[XtreamAPI] URL already proxied, skipping');
    return url;
  }
  
  // Use hybrid approach - automatically chooses best proxy
  const proxied = tunnelOrProxy(url, { convertTs: true });
  return proxied;
}

/**
 * Build Player API URL format - uses /live/play/{token}/{stream_id}
 * This format bypasses IP blocking that affects the standard Xtream format
 */
function buildPlayerApiUrl(creds: XtreamCredentials, streamId: number): string {
  // Encode credentials as base64 token (same format as standard base64 encoding)
  const credString = `${creds.username}/${creds.password}`;
  const token = btoa(credString);
  
  // Get server from credentials
  let server = creds.serverUrl.trim();
  server = server.replace(/^https?:\/\//, '').replace(/\/$/, '');
  
  // Build Player API URL - always HTTP since provider redirects to direct IP
  return `http://${server}/live/play/${token}/${streamId}`;
}

// Build stream URL for live channels
export function buildLiveStreamUrl(
  creds: XtreamCredentials, 
  streamId: number, 
  options: { useProxy?: boolean; preferTs?: boolean; forceHttp?: boolean; usePlayerApi?: boolean } = {}
): string {
  // CHANGED: usePlayerApi = false as default - standard Xtream format works better with redirect following
  const { useProxy = true, preferTs = true, forceHttp = true, usePlayerApi = false } = options;
  let base = buildBaseUrl(creds);
  
  // CRITICAL: Detect if server_url is incorrectly set to our VPN proxy domain
  // Note: line.premiumvinted.se is the actual IPTV provider domain (Cloudflare DNS),
  // only vpn.premiumvinted.se is our proxy tunnel domain
  const isServerAlreadyProxy = base.includes('vpn.premiumvinted.se');
  if (isServerAlreadyProxy) {
    console.error('[XtreamAPI] ❌ server_url är felaktigt inställd till proxy-domänen!');
    return 'error://server_url_is_proxy_domain';
  }
  
  // 🚀 NATIVE APP: Return raw URL without proxy (ExoPlayer/AVPlayer handle HTTP natively)
  if (Capacitor.isNativePlatform()) {
    // Force HTTP protocol for live streams (many providers block HTTPS from datacenters)
    if (forceHttp && base.startsWith('https://')) {
      base = base.replace('https://', 'http://');
    }
    
    const extension = preferTs ? 'ts' : 'm3u8';
    const directUrl = `${base}/live/${encodeURIComponent(creds.username)}/${encodeURIComponent(creds.password)}/${streamId}.${extension}`;
    console.log('[XtreamAPI] 📱 Native platform - using direct URL:', directUrl.substring(0, 60) + '...');
    return directUrl;
  }
  
  // Player API format (optional) - may be needed for specific providers
  if (usePlayerApi) {
    const playerApiUrl = buildPlayerApiUrl(creds, streamId);
    console.log('[XtreamAPI] Using Player API format:', playerApiUrl.substring(0, 60) + '...');
    
    if (useProxy) {
      return tunnelStreamUrl(playerApiUrl);
    }
    return playerApiUrl;
  }
  
  // Force HTTP protocol for live streams (many providers block HTTPS from datacenters)
  if (forceHttp && base.startsWith('https://')) {
    base = base.replace('https://', 'http://');
    console.log('[XtreamAPI] Forced HTTP for live stream');
  }
  
  // Build stream URL with extension
  // Always use .ts - the tunnel will convert to .m3u8 for browser compatibility
  const extension = preferTs ? 'ts' : 'm3u8';
  const directUrl = `${base}/live/${encodeURIComponent(creds.username)}/${encodeURIComponent(creds.password)}/${streamId}.${extension}`;
  
  // Use Cloudflare Direct Tunnel (IPTV Smarters method)
  // This is faster than Supabase proxy - uses Cloudflare's edge network
  if (useProxy) {
    console.log('[XtreamAPI] Using Cloudflare Direct Tunnel:', directUrl.substring(0, 60) + '...');
    return tunnelStreamUrl(directUrl);
  }
  
  // Even if proxy is disabled, we MUST proxy HTTP URLs in the browser
  // to avoid Mixed Content blocks (HTTPS page can't load HTTP streams)
  if (directUrl.startsWith('http://') && typeof window !== 'undefined' && window.location.protocol === 'https:') {
    console.log('[XtreamAPI] ⚠️ use_proxy=false but HTTP on HTTPS page — forcing proxy to avoid Mixed Content');
    return tunnelStreamUrl(directUrl);
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
  
  // 🚀 NATIVE APP: Return raw URL without proxy
  if (Capacitor.isNativePlatform()) {
    console.log('[XtreamAPI] 📱 Native platform - using direct movie URL:', directUrl.substring(0, 60) + '...');
    return directUrl;
  }
  
  // Use Cloudflare Direct Tunnel for VOD content
  if (useProxy) {
    if (preferTs) {
      const tsUrl = `${base}/movie/${encodeURIComponent(creds.username)}/${encodeURIComponent(creds.password)}/${streamId}.ts`;
      console.log('[XtreamAPI] Using Cloudflare tunnel (ts) for movie');
      return tunnelStreamUrl(tsUrl);
    }
    console.log('[XtreamAPI] Using Cloudflare tunnel for movie');
    return tunnelStreamUrl(directUrl);
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
  
  // 🚀 NATIVE APP: Return raw URL without proxy
  if (Capacitor.isNativePlatform()) {
    console.log('[XtreamAPI] 📱 Native platform - using direct series URL:', directUrl.substring(0, 60) + '...');
    return directUrl;
  }
  
  // Use Cloudflare Direct Tunnel for series content
  if (useProxy) {
    if (preferTs) {
      const tsUrl = `${base}/series/${encodeURIComponent(creds.username)}/${encodeURIComponent(creds.password)}/${episodeId}.ts`;
      console.log('[XtreamAPI] Using Cloudflare tunnel (ts) for series');
      return tunnelStreamUrl(tsUrl);
    }
    console.log('[XtreamAPI] Using Cloudflare tunnel for series');
    return tunnelStreamUrl(directUrl);
  }
  
  return directUrl;
}

/**
 * Direct API call to IPTV server (used on native platforms)
 * No proxy needed — native WebView doesn't have CORS/Mixed Content restrictions
 */
async function directApiCall<T>(
  creds: XtreamCredentials,
  action?: string,
  params?: Record<string, string | number>
): Promise<T> {
  let url = buildApiUrl(creds, action);
  if (params) {
    const searchParams = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      searchParams.set(key, String(value));
    });
    url += '&' + searchParams.toString();
  }
  
  console.log('[XtreamAPI] 📱 Direct API call:', action, url.substring(0, 80) + '...');
  
  const response = await fetch(url, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });
  
  if (!response.ok) {
    throw new Error(`API call failed: HTTP ${response.status}`);
  }
  
  const data = await response.json();
  console.log('[XtreamAPI] 📱 Direct response, length:', Array.isArray(data) ? data.length : 'object');
  return data as T;
}

// Enhanced error messages for common issues
function enhanceErrorMessage(error: string, serverUrl: string): string {
  const lowercaseError = error.toLowerCase();

  // DNS errors
  if (lowercaseError.includes('dns') ||
      lowercaseError.includes('getaddrinfo') ||
      lowercaseError.includes('enotfound') ||
      lowercaseError.includes('name resolution')) {
    return `DNS-fel: Kan inte hitta servern "${serverUrl}". Kontrollera att din IPTV-leverantörs server är tillgänglig och att URL:en är korrekt.`;
  }

  // Connection refused
  if (lowercaseError.includes('econnrefused') || lowercaseError.includes('connection refused')) {
    return `Anslutning nekad: Servern "${serverUrl}" nekar anslutningar. Kontrollera om servern är igång eller prova att ändra mellan HTTP/HTTPS.`;
  }

  // Timeout
  if (lowercaseError.includes('timeout') || lowercaseError.includes('timed out')) {
    return `Timeout: Servern svarar inte i tid. Detta kan bero på att servern är överbelastad, långsam, eller blockerar datacenter-IP-adresser.`;
  }

  // Certificate errors
  if (lowercaseError.includes('certificate') || lowercaseError.includes('ssl')) {
    return `SSL/Certifikatfel: Servern har ett ogiltigt säkerhetscertifikat. Prova att använda HTTP istället för HTTPS.`;
  }

  // Network unreachable
  if (lowercaseError.includes('unreachable') || lowercaseError.includes('network')) {
    return `Nätverksfel: Kan inte nå servern. Kontrollera din internetanslutning eller att servern inte blockerar åtkomst från din region.`;
  }

  // Cloudflare specific errors
  if (lowercaseError.includes('cloudflare') || lowercaseError.includes('error 1016')) {
    return `Cloudflare DNS-fel: Servern använder Cloudflare men har felaktig DNS-konfiguration. Detta är ett problem hos din IPTV-leverantör som de måste åtgärda.`;
  }

  // Generic upstream error
  if (lowercaseError.includes('upstream')) {
    return `Serverfel: Din IPTV-leverantör är för närvarande otillgänglig. Prova igen senare eller kontakta din leverantör.`;
  }

  return error;
}

// Proxy API call through edge function to avoid CORS/Mixed Content issues (web only)
async function proxyApiCall<T>(
  creds: XtreamCredentials,
  action?: string,
  params?: Record<string, string | number>
): Promise<T> {
  // 🚀 NATIVE: Skip proxy entirely, call IPTV server directly
  if (Capacitor.isNativePlatform()) {
    return directApiCall<T>(creds, action, params);
  }

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
    const rawMessage = error.message || 'Unknown error';
    const enhancedMessage = enhanceErrorMessage(rawMessage, creds.serverUrl);

    const extra =
      data && typeof data === 'object'
        ? JSON.stringify(data)
        : typeof data === 'string'
          ? data
          : '';

    throw new Error(extra ? `${enhancedMessage} | ${extra}` : enhancedMessage);
  }

  if (!data) {
    console.error('[XtreamAPI] No data returned from proxy');
    throw new Error('Inget svar från servern. Kontrollera att servern är online och åtkomlig.');
  }

  if (typeof data === 'object' && data !== null && 'error' in data) {
    console.error('[XtreamAPI] API error:', data.error);
    const errorString = String(data.error);
    const enhancedMessage = enhanceErrorMessage(errorString, creds.serverUrl);
    throw new Error(enhancedMessage);
  }

  console.log('[XtreamAPI] Returning data, length:', Array.isArray(data) ? data.length : 'not array');
  return data as T;
}

// ── IndexedDB cache integration ──
import { ChannelCache, VODCache, SeriesCache, SyncMeta } from '@/lib/local-cache';

const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;

function sourceIdFromCreds(creds: XtreamCredentials): string {
  return `${creds.serverUrl}|${creds.username}`;
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

// Get live channels — with IndexedDB cache
export async function getLiveStreams(creds: XtreamCredentials, categoryId?: string): Promise<XtreamChannel[]> {
  const sid = sourceIdFromCreds(creds);
  // Per-category requests skip cache
  if (!categoryId) {
    const cached = await ChannelCache.get(sid);
    if (cached?.data && Array.isArray(cached.data) && cached.data.length > 0) {
      if (Date.now() - cached.timestamp < THREE_DAYS) {
        console.log(`[XtreamAPI] ⚡ Cache hit: ${cached.data.length} channels`);
        return cached.data as XtreamChannel[];
      }
    }
  }
  const params = categoryId ? { category_id: categoryId } : undefined;
  const fresh = await proxyApiCall<XtreamChannel[]>(creds, 'get_live_streams', params);
  if (!categoryId && fresh.length > 0) {
    ChannelCache.set(sid, fresh).catch(() => {});
    SyncMeta.set(sid, { channelCount: fresh.length }).catch(() => {});
  }
  return fresh;
}

// Get VOD categories
export async function getVodCategories(creds: XtreamCredentials): Promise<XtreamCategory[]> {
  return proxyApiCall<XtreamCategory[]>(creds, 'get_vod_categories');
}

// Get VOD streams — with IndexedDB cache
export async function getVodStreams(creds: XtreamCredentials, categoryId?: string): Promise<XtreamMovie[]> {
  const sid = sourceIdFromCreds(creds);
  if (!categoryId) {
    const cached = await VODCache.get(sid);
    if (cached?.data && Array.isArray(cached.data) && cached.data.length > 0) {
      if (Date.now() - cached.timestamp < THREE_DAYS) {
        console.log(`[XtreamAPI] ⚡ Cache hit: ${cached.data.length} movies`);
        return cached.data as XtreamMovie[];
      }
    }
  }
  const params = categoryId ? { category_id: categoryId } : undefined;
  const fresh = await proxyApiCall<XtreamMovie[]>(creds, 'get_vod_streams', params);
  if (!categoryId && fresh.length > 0) {
    VODCache.set(sid, fresh).catch(() => {});
    SyncMeta.set(sid, { vodCount: fresh.length }).catch(() => {});
  }
  return fresh;
}

// Get series categories
export async function getSeriesCategories(creds: XtreamCredentials): Promise<XtreamCategory[]> {
  return proxyApiCall<XtreamCategory[]>(creds, 'get_series_categories');
}

// Get series list — with IndexedDB cache
export async function getSeries(creds: XtreamCredentials, categoryId?: string): Promise<XtreamSeries[]> {
  const sid = sourceIdFromCreds(creds);
  if (!categoryId) {
    const cached = await SeriesCache.get(sid);
    if (cached?.data && Array.isArray(cached.data) && cached.data.length > 0) {
      if (Date.now() - cached.timestamp < THREE_DAYS) {
        console.log(`[XtreamAPI] ⚡ Cache hit: ${cached.data.length} series`);
        return cached.data as XtreamSeries[];
      }
    }
  }
  const params = categoryId ? { category_id: categoryId } : undefined;
  const fresh = await proxyApiCall<XtreamSeries[]>(creds, 'get_series', params);
  if (!categoryId && fresh.length > 0) {
    SeriesCache.set(sid, fresh).catch(() => {});
    SyncMeta.set(sid, { seriesCount: fresh.length }).catch(() => {});
  }
  return fresh;
}

// Get series info with episodes
export async function getSeriesInfo(creds: XtreamCredentials, seriesId: number): Promise<XtreamSeriesInfo> {
  return proxyApiCall<XtreamSeriesInfo>(creds, 'get_series_info', { series_id: seriesId });
}

// Get EPG for a channel
export async function getEPG(creds: XtreamCredentials, streamId: number): Promise<XtreamEPG> {
  return proxyApiCall<XtreamEPG>(creds, 'get_short_epg', { stream_id: streamId });
}
