// M3U Playlist Parser
// Parses M3U/M3U8 playlist content into a standardized channel format

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
  // M3U specific - the actual stream URL
  stream_url: string;
}

export interface M3UCategory {
  category_id: string;
  category_name: string;
  parent_id: number;
}

export interface M3UParseResult {
  channels: M3UChannel[];
  categories: M3UCategory[];
}

interface ExtInfData {
  duration: number;
  tvgId: string;
  tvgName: string;
  tvgLogo: string;
  groupTitle: string;
  channelName: string;
}

/**
 * Parse #EXTINF line to extract metadata
 * Format: #EXTINF:-1 tvg-id="id" tvg-name="name" tvg-logo="url" group-title="group",Channel Name
 */
function parseExtInf(line: string): ExtInfData | null {
  if (!line.startsWith('#EXTINF:')) {
    return null;
  }

  // Extract duration (usually -1 for live streams)
  const durationMatch = line.match(/#EXTINF:(-?\d+)/);
  const duration = durationMatch ? parseInt(durationMatch[1], 10) : -1;

  // Extract attributes using regex
  const tvgIdMatch = line.match(/tvg-id="([^"]*)"/i);
  const tvgNameMatch = line.match(/tvg-name="([^"]*)"/i);
  const tvgLogoMatch = line.match(/tvg-logo="([^"]*)"/i);
  const groupTitleMatch = line.match(/group-title="([^"]*)"/i);

  // Channel name is after the last comma
  const lastCommaIndex = line.lastIndexOf(',');
  const channelName = lastCommaIndex !== -1 
    ? line.substring(lastCommaIndex + 1).trim() 
    : '';

  return {
    duration,
    tvgId: tvgIdMatch?.[1] || '',
    tvgName: tvgNameMatch?.[1] || '',
    tvgLogo: tvgLogoMatch?.[1] || '',
    groupTitle: groupTitleMatch?.[1] || 'Uncategorized',
    channelName,
  };
}

/**
 * Determine stream type from URL and metadata
 */
function determineStreamType(url: string, groupTitle: string): 'live' | 'movie' | 'series' {
  const lowerGroup = groupTitle.toLowerCase();
  const lowerUrl = url.toLowerCase();
  
  // Check for VOD indicators
  if (lowerGroup.includes('vod') || lowerGroup.includes('movie') || lowerGroup.includes('film')) {
    return 'movie';
  }
  if (lowerGroup.includes('series') || lowerGroup.includes('serie')) {
    return 'series';
  }
  
  // Check URL patterns
  if (lowerUrl.includes('/movie/') || lowerUrl.includes('/vod/')) {
    return 'movie';
  }
  if (lowerUrl.includes('/series/')) {
    return 'series';
  }
  
  // Default to live
  return 'live';
}

/**
 * Generate a stable numeric ID from a string (for compatibility with Xtream format)
 */
function generateNumericId(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Parse M3U playlist content into channels and categories
 * Designed to handle large files efficiently
 */
export function parseM3u(content: string): M3UParseResult {
  const lines = content.split(/\r?\n/);
  const channels: M3UChannel[] = [];
  const categoryMap = new Map<string, M3UCategory>();
  
  let currentExtInf: ExtInfData | null = null;
  let channelNum = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    
    // Skip empty lines and #EXTM3U header
    if (!line || line === '#EXTM3U' || line.startsWith('#EXTM3U ')) {
      continue;
    }

    // Parse EXTINF line
    if (line.startsWith('#EXTINF:')) {
      currentExtInf = parseExtInf(line);
      continue;
    }

    // Skip other directives
    if (line.startsWith('#')) {
      continue;
    }

    // This should be a URL line
    if (currentExtInf && (line.startsWith('http://') || line.startsWith('https://'))) {
      const streamUrl = line;
      const categoryName = currentExtInf.groupTitle || 'Uncategorized';
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

      channels.push({
        num: channelNum++,
        name: currentExtInf.channelName || currentExtInf.tvgName || `Channel ${channelNum}`,
        stream_type: streamType,
        stream_id: streamId,
        stream_icon: currentExtInf.tvgLogo,
        epg_channel_id: currentExtInf.tvgId || currentExtInf.tvgName || '',
        added: new Date().toISOString(),
        category_id: categoryId,
        category_name: categoryName,
        custom_sid: '',
        tv_archive: 0,
        direct_source: streamUrl,
        tv_archive_duration: 0,
        stream_url: streamUrl,
      });

      currentExtInf = null;
    }
  }

  // Convert category map to array, sorted by name
  const categories = Array.from(categoryMap.values()).sort((a, b) => 
    a.category_name.localeCompare(b.category_name)
  );

  console.log(`[M3U Parser] Parsed ${channels.length} channels in ${categories.length} categories`);

  return { channels, categories };
}

/**
 * Async wrapper for parsing large M3U files without blocking UI
 */
export async function parseM3uAsync(content: string): Promise<M3UParseResult> {
  return new Promise((resolve) => {
    // Use setTimeout to yield to the event loop
    setTimeout(() => {
      resolve(parseM3u(content));
    }, 0);
  });
}

/**
 * Fetch and parse M3U from URL (uses proxy if needed)
 */
export async function fetchAndParseM3u(
  url: string, 
  useProxy: boolean = true
): Promise<M3UParseResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  
  let fetchUrl = url;
  if (useProxy && supabaseUrl) {
    // Use stream-proxy for fetching M3U content
    fetchUrl = `${supabaseUrl}/functions/v1/stream-proxy?url=${encodeURIComponent(url)}`;
  }

  console.log('[M3U Parser] Fetching M3U from:', fetchUrl.substring(0, 80) + '...');
  
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
    direct_source: ch.stream_url, // Use stream_url as direct_source
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
