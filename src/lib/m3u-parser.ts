// M3U Playlist Parser
// Enhanced parser inspired by iptv-playlist-parser npm package
// Supports: #EXTM3U headers, #EXTINF metadata, #EXTVLCOPT, #EXTGRP, catchup attributes

export interface M3UChannel {
  num: number;
  name: string;
  stream_type: 'live' | 'movie' | 'series';
  stream_id: number;
  stream_icon: string;
  epg_channel_id: string;
  added: string;
  category_id: string;
  category_name: string;
  custom_sid: string;
  tv_archive: number;
  direct_source: string;
  tv_archive_duration: number;
  stream_url: string;
  // Extended attributes (iptv-playlist-parser style)
  tvg: {
    id: string;
    name: string;
    logo: string;
    url: string;
    shift: string;
    country: string;
    language: string;
    rec: string;
  };
  http: {
    referrer: string;
    'user-agent': string;
  };
  catchup: {
    type: string;
    source: string;
    days: string;
  };
}

export interface M3UCategory {
  category_id: string;
  category_name: string;
  parent_id: number;
}

export interface M3UHeader {
  attrs: Record<string, string>;
  raw: string;
}

export interface M3UParseResult {
  header: M3UHeader;
  channels: M3UChannel[];
  categories: M3UCategory[];
}

interface ExtInfData {
  duration: number;
  attrs: Record<string, string>;
  channelName: string;
}

/**
 * Extract all key="value" or key=value pairs from a string
 * Inspired by iptv-playlist-parser's attribute extraction
 */
function extractAttributes(str: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  
  // Match key="value" (quoted) and key=value (unquoted, until space or comma)
  const quotedRegex = /([a-zA-Z0-9_-]+)="([^"]*)"/gi;
  const unquotedRegex = /([a-zA-Z0-9_-]+)=([^\s",]+)/gi;
  
  let match: RegExpExecArray | null;
  
  // Extract quoted values first
  while ((match = quotedRegex.exec(str)) !== null) {
    attrs[match[1].toLowerCase()] = match[2];
  }
  
  // Extract unquoted values (won't override quoted ones due to lowercase key)
  while ((match = unquotedRegex.exec(str)) !== null) {
    const key = match[1].toLowerCase();
    if (!(key in attrs)) {
      attrs[key] = match[2];
    }
  }
  
  return attrs;
}

/**
 * Parse #EXTM3U header line for global playlist attributes
 * Example: #EXTM3U x-tvg-url="http://epg.xml" url-tvg="http://epg2.xml"
 */
function parseHeader(line: string): M3UHeader {
  const attrs = extractAttributes(line);
  return {
    attrs,
    raw: line,
  };
}

/**
 * Parse #EXTINF line to extract metadata
 * Format: #EXTINF:duration attrs,Channel Name
 * Example: #EXTINF:-1 tvg-id="CNN" tvg-logo="http://logo.png" group-title="News",CNN International
 */
function parseExtInf(line: string): ExtInfData | null {
  if (!line.startsWith('#EXTINF:')) {
    return null;
  }

  // Extract duration
  const durationMatch = line.match(/#EXTINF:(-?\d+\.?\d*)/);
  const duration = durationMatch ? parseFloat(durationMatch[1]) : -1;

  // Extract all attributes
  const attrs = extractAttributes(line);

  // Channel name is after the last comma (but not inside quotes)
  // Find the position after attributes end
  let channelName = '';
  const commaIndex = line.lastIndexOf(',');
  if (commaIndex !== -1) {
    channelName = line.substring(commaIndex + 1).trim();
  }

  return {
    duration,
    attrs,
    channelName,
  };
}

/**
 * Parse #EXTVLCOPT line for VLC-specific options
 * Example: #EXTVLCOPT:http-user-agent=Mozilla/5.0
 * Example: #EXTVLCOPT:http-referrer=http://example.com
 */
function parseVlcOpt(line: string): { key: string; value: string } | null {
  if (!line.startsWith('#EXTVLCOPT:')) {
    return null;
  }
  
  const content = line.substring('#EXTVLCOPT:'.length);
  const eqIndex = content.indexOf('=');
  
  if (eqIndex === -1) {
    return null;
  }
  
  return {
    key: content.substring(0, eqIndex).trim(),
    value: content.substring(eqIndex + 1).trim(),
  };
}

/**
 * Determine stream type from URL and metadata
 */
function determineStreamType(url: string, groupTitle: string): 'live' | 'movie' | 'series' {
  const lowerGroup = groupTitle.toLowerCase();
  const lowerUrl = url.toLowerCase();
  
  // Check group title for VOD indicators
  if (lowerGroup.includes('vod') || lowerGroup.includes('movie') || lowerGroup.includes('film')) {
    return 'movie';
  }
  if (lowerGroup.includes('series') || lowerGroup.includes('serie') || lowerGroup.includes('episode')) {
    return 'series';
  }
  
  // Check URL patterns
  if (lowerUrl.includes('/movie/') || lowerUrl.includes('/vod/')) {
    return 'movie';
  }
  if (lowerUrl.includes('/series/')) {
    return 'series';
  }
  
  return 'live';
}

/**
 * Generate a stable numeric ID from a string
 */
function generateNumericId(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash);
}

/**
 * Create empty TVG object
 */
function createEmptyTvg(): M3UChannel['tvg'] {
  return {
    id: '',
    name: '',
    logo: '',
    url: '',
    shift: '',
    country: '',
    language: '',
    rec: '',
  };
}

/**
 * Create empty HTTP object
 */
function createEmptyHttp(): M3UChannel['http'] {
  return {
    referrer: '',
    'user-agent': '',
  };
}

/**
 * Create empty catchup object
 */
function createEmptyCatchup(): M3UChannel['catchup'] {
  return {
    type: '',
    source: '',
    days: '',
  };
}

/**
 * Parse M3U playlist content into channels and categories
 * Enhanced parser with full attribute support like iptv-playlist-parser
 */
export function parseM3u(content: string): M3UParseResult {
  const lines = content.split(/\r?\n/);
  const channels: M3UChannel[] = [];
  const categoryMap = new Map<string, M3UCategory>();
  
  let header: M3UHeader = { attrs: {}, raw: '' };
  let currentExtInf: ExtInfData | null = null;
  let currentVlcOpts: Record<string, string> = {};
  let currentExtGrp: string | null = null;
  let channelNum = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines
    if (!line) {
      continue;
    }

    // Parse #EXTM3U header
    if (line.startsWith('#EXTM3U')) {
      header = parseHeader(line);
      continue;
    }

    // Parse #EXTINF line
    if (line.startsWith('#EXTINF:')) {
      currentExtInf = parseExtInf(line);
      continue;
    }

    // Parse #EXTVLCOPT line
    if (line.startsWith('#EXTVLCOPT:')) {
      const vlcOpt = parseVlcOpt(line);
      if (vlcOpt) {
        currentVlcOpts[vlcOpt.key] = vlcOpt.value;
      }
      continue;
    }

    // Parse #EXTGRP line (alternative group specification)
    if (line.startsWith('#EXTGRP:')) {
      currentExtGrp = line.substring('#EXTGRP:'.length).trim();
      continue;
    }

    // Skip other directives
    if (line.startsWith('#')) {
      continue;
    }

    // This should be a URL line
    if (currentExtInf && (line.startsWith('http://') || line.startsWith('https://') || line.startsWith('rtmp://') || line.startsWith('rtsp://'))) {
      const streamUrl = line;
      const attrs = currentExtInf.attrs;
      
      // Determine group: prefer EXTINF group-title, fallback to EXTGRP
      const categoryName = attrs['group-title'] || currentExtGrp || 'Uncategorized';
      const categoryId = generateNumericId(categoryName).toString();
      
      // Add category if not exists
      if (!categoryMap.has(categoryId)) {
        categoryMap.set(categoryId, {
          category_id: categoryId,
          category_name: categoryName,
          parent_id: 0,
        });
      }

      const streamType = determineStreamType(streamUrl, categoryName);
      const streamId = generateNumericId(streamUrl);

      // Build TVG object from attributes
      const tvg = createEmptyTvg();
      tvg.id = attrs['tvg-id'] || attrs['channel-id'] || '';
      tvg.name = attrs['tvg-name'] || '';
      tvg.logo = attrs['tvg-logo'] || attrs['logo'] || '';
      tvg.url = attrs['tvg-url'] || attrs['url-tvg'] || header.attrs['x-tvg-url'] || header.attrs['url-tvg'] || '';
      tvg.shift = attrs['tvg-shift'] || '';
      tvg.country = attrs['tvg-country'] || '';
      tvg.language = attrs['tvg-language'] || '';
      tvg.rec = attrs['tvg-rec'] || '';

      // Build HTTP object from VLC options
      const http = createEmptyHttp();
      http.referrer = currentVlcOpts['http-referrer'] || currentVlcOpts['http-origin'] || '';
      http['user-agent'] = currentVlcOpts['http-user-agent'] || '';

      // Build catchup object
      const catchup = createEmptyCatchup();
      catchup.type = attrs['catchup'] || attrs['catchup-type'] || '';
      catchup.source = attrs['catchup-source'] || '';
      catchup.days = attrs['catchup-days'] || '';

      channels.push({
        num: channelNum++,
        name: currentExtInf.channelName || tvg.name || `Channel ${channelNum}`,
        stream_type: streamType,
        stream_id: streamId,
        stream_icon: tvg.logo,
        epg_channel_id: tvg.id || tvg.name || '',
        added: new Date().toISOString(),
        category_id: categoryId,
        category_name: categoryName,
        custom_sid: attrs['tvg-chno'] || '',
        tv_archive: attrs['tvg-rec'] ? 1 : 0,
        direct_source: streamUrl,
        tv_archive_duration: parseInt(catchup.days) || 0,
        stream_url: streamUrl,
        tvg,
        http,
        catchup,
      });

      // Reset state for next channel
      currentExtInf = null;
      currentVlcOpts = {};
      currentExtGrp = null;
    }
  }

  // Convert category map to sorted array
  const categories = Array.from(categoryMap.values()).sort((a, b) => 
    a.category_name.localeCompare(b.category_name)
  );

  console.log(`[M3U Parser] Parsed ${channels.length} channels in ${categories.length} categories`);

  return { header, channels, categories };
}

/**
 * Async wrapper for parsing large M3U files without blocking UI
 */
export async function parseM3uAsync(content: string): Promise<M3UParseResult> {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(parseM3u(content));
    }, 0);
  });
}

/**
 * Fetch and parse M3U from URL (uses proxy if needed)
 */
/**
 * Normalize M3U URL to ensure HLS format
 * Converts output=ts to output=m3u8 for browser compatibility
 */
export function normalizeM3uUrl(url: string): string {
  // Replace output=ts with output=m3u8 for HLS compatibility
  let normalized = url.replace(/([?&])output=ts(&|$)/i, '$1output=m3u8$2');
  
  // Also handle type=ts or type=m3u_plus scenarios
  normalized = normalized.replace(/([?&])type=ts(&|$)/i, '$1type=m3u_plus$2');
  
  console.log('[M3U Parser] Normalized URL:', url.substring(0, 50), '→', normalized.substring(0, 50));
  return normalized;
}

/**
 * Route HTTP URL through VPN tunnel + Supabase proxy for CORS
 * This solves Mixed Content AND bypasses datacenter IP blocking
 */
function buildProxiedUrl(originalUrl: string, supabaseUrl: string): string {
  // If already HTTPS, just wrap in proxy for CORS headers
  if (originalUrl.startsWith('https://')) {
    return `${supabaseUrl}/functions/v1/stream-proxy?url=${encodeURIComponent(originalUrl)}`;
  }
  
  // For HTTP URLs: Route through VPN tunnel first, then wrap in proxy
  try {
    const urlObj = new URL(originalUrl);
    // Extract path + query (avoids port :80 issue)
    const path = urlObj.pathname + urlObj.search;
    const vpnUrl = `https://vpn.premiumvinted.se${path}`;
    
    console.log('[M3U Parser] Routing HTTP through VPN tunnel:', originalUrl.substring(0, 50), '→ VPN');
    
    // Wrap VPN URL in Supabase proxy to add CORS headers
    return `${supabaseUrl}/functions/v1/stream-proxy?url=${encodeURIComponent(vpnUrl)}`;
  } catch {
    // Fallback: just proxy the original URL
    console.warn('[M3U Parser] Failed to parse URL, using direct proxy');
    return `${supabaseUrl}/functions/v1/stream-proxy?url=${encodeURIComponent(originalUrl)}`;
  }
}

export async function fetchAndParseM3u(
  url: string, 
  useProxy: boolean = true
): Promise<M3UParseResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  
  // Normalize URL to ensure HLS format (output=m3u8 instead of ts)
  const normalizedUrl = normalizeM3uUrl(url);
  
  let fetchUrl = normalizedUrl;
  if (useProxy && supabaseUrl) {
    // Route through VPN tunnel + proxy for CORS + bypass datacenter blocking
    fetchUrl = buildProxiedUrl(normalizedUrl, supabaseUrl);
  }

  console.log('[M3U Parser] Fetching M3U from:', fetchUrl.substring(0, 100) + '...');
  
  const response = await fetch(fetchUrl);
  if (!response.ok) {
    throw new Error(`Failed to fetch M3U: ${response.status} ${response.statusText}`);
  }

  const content = await response.text();
  console.log(`[M3U Parser] Received ${content.length} bytes`);
  
  return parseM3uAsync(content);
}

/**
 * Filter channels by category
 */
export function filterChannelsByCategory(
  channels: M3UChannel[], 
  categoryId?: string
): M3UChannel[] {
  if (!categoryId) {
    return channels;
  }
  return channels.filter(ch => ch.category_id === categoryId);
}

/**
 * Filter channels by stream type
 */
export function filterChannelsByType(
  channels: M3UChannel[], 
  type: 'live' | 'movie' | 'series'
): M3UChannel[] {
  return channels.filter(ch => ch.stream_type === type);
}

/**
 * Search channels by name (case-insensitive)
 */
export function searchChannels(
  channels: M3UChannel[],
  query: string
): M3UChannel[] {
  if (!query.trim()) {
    return channels;
  }
  const lowerQuery = query.toLowerCase();
  return channels.filter(ch => 
    ch.name.toLowerCase().includes(lowerQuery) ||
    ch.tvg.name.toLowerCase().includes(lowerQuery)
  );
}

/**
 * Convert M3U channels to Xtream-compatible format for seamless UI integration
 */
export function m3uToXtreamChannels(channels: M3UChannel[]) {
  return channels.map(ch => ({
    num: ch.num,
    name: ch.name,
    stream_type: ch.stream_type,
    stream_id: ch.stream_id,
    stream_icon: ch.stream_icon,
    epg_channel_id: ch.epg_channel_id,
    added: ch.added,
    category_id: ch.category_id,
    custom_sid: ch.custom_sid,
    tv_archive: ch.tv_archive,
    direct_source: ch.stream_url,
    tv_archive_duration: ch.tv_archive_duration,
  }));
}

/**
 * Convert M3U categories to Xtream-compatible format
 */
export function m3uToXtreamCategories(categories: M3UCategory[]) {
  return categories.map(cat => ({
    category_id: cat.category_id,
    category_name: cat.category_name,
    parent_id: cat.parent_id,
  }));
}

/**
 * Get EPG URL from playlist header or first channel with tvg-url
 */
export function getEpgUrl(result: M3UParseResult): string | null {
  // Check header first
  if (result.header.attrs['x-tvg-url']) {
    return result.header.attrs['x-tvg-url'];
  }
  if (result.header.attrs['url-tvg']) {
    return result.header.attrs['url-tvg'];
  }
  
  // Check first channel with tvg.url
  for (const channel of result.channels) {
    if (channel.tvg.url) {
      return channel.tvg.url;
    }
  }
  
  return null;
}
