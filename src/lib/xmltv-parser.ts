/**
 * XMLTV Parser
 * Parses XMLTV/EPG XML data and converts it to the app's internal EPG format
 */

import { XMLParser } from 'fast-xml-parser';

export interface XMLTVProgram {
  channelId: string;
  title: string;
  description?: string;
  start: Date;
  end: Date;
  category?: string;
  icon?: string;
}

export interface XMLTVChannel {
  id: string;
  displayName: string;
  icon?: string;
}

export interface XMLTVData {
  channels: XMLTVChannel[];
  programs: XMLTVProgram[];
}

/**
 * Parse XMLTV date format: YYYYMMDDHHmmss +HHMM
 * Example: "20231215180000 +0100"
 */
function parseXMLTVDate(dateStr: string): Date {
  if (!dateStr) return new Date();
  
  // Remove timezone offset for parsing, then apply it
  const match = dateStr.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\s*([+-]\d{4})?$/);
  
  if (!match) {
    // Try parsing as ISO or other formats
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }
  
  const [, year, month, day, hour, minute, second, tz] = match;
  
  // Build ISO string
  let isoString = `${year}-${month}-${day}T${hour}:${minute}:${second}`;
  
  if (tz) {
    // Convert "+0100" to "+01:00"
    const tzFormatted = tz.slice(0, 3) + ':' + tz.slice(3);
    isoString += tzFormatted;
  } else {
    isoString += 'Z';
  }
  
  return new Date(isoString);
}

/**
 * Extract text value from XMLTV element (can be string or object with #text)
 */
function extractText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    if ('#text' in value) return String((value as { '#text': unknown })['#text']);
    if ('_' in value) return String((value as { '_': unknown })['_']);
  }
  return '';
}

/**
 * Parse XMLTV XML data
 * @param xmlText - Raw XML string
 * @returns Parsed XMLTV data with channels and programs
 */
export function parseXMLTV(xmlText: string): XMLTVData {
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    isArray: (tagName) => ['channel', 'programme', 'display-name', 'title', 'desc', 'category'].includes(tagName),
  });
  
  const result = parser.parse(xmlText);
  const tv = result.tv || result.TV || result;
  
  const channels: XMLTVChannel[] = [];
  const programs: XMLTVProgram[] = [];
  
  // Parse channels
  const channelNodes = tv.channel || [];
  for (const ch of Array.isArray(channelNodes) ? channelNodes : [channelNodes]) {
    if (!ch) continue;
    
    const id = ch['@_id'] || '';
    const displayNames = ch['display-name'] || [];
    const displayNameArr = Array.isArray(displayNames) ? displayNames : [displayNames];
    const displayName = extractText(displayNameArr[0]) || id;
    
    // Extract icon
    let icon: string | undefined;
    if (ch.icon) {
      const iconEl = Array.isArray(ch.icon) ? ch.icon[0] : ch.icon;
      icon = iconEl?.['@_src'] || undefined;
    }
    
    channels.push({ id, displayName, icon });
  }
  
  // Parse programs
  const programNodes = tv.programme || [];
  for (const prog of Array.isArray(programNodes) ? programNodes : [programNodes]) {
    if (!prog) continue;
    
    const channelId = prog['@_channel'] || '';
    const startStr = prog['@_start'] || '';
    const endStr = prog['@_stop'] || '';
    
    // Extract title
    const titles = prog.title || [];
    const titleArr = Array.isArray(titles) ? titles : [titles];
    const title = extractText(titleArr[0]) || 'Okänt program';
    
    // Extract description
    const descs = prog.desc || [];
    const descArr = Array.isArray(descs) ? descs : [descs];
    const description = extractText(descArr[0]) || undefined;
    
    // Extract category
    const categories = prog.category || [];
    const categoryArr = Array.isArray(categories) ? categories : [categories];
    const category = extractText(categoryArr[0]) || undefined;
    
    // Extract icon
    let icon: string | undefined;
    if (prog.icon) {
      const iconEl = Array.isArray(prog.icon) ? prog.icon[0] : prog.icon;
      icon = iconEl?.['@_src'] || undefined;
    }
    
    programs.push({
      channelId,
      title,
      description,
      start: parseXMLTVDate(startStr),
      end: parseXMLTVDate(endStr),
      category,
      icon,
    });
  }
  
  console.log(`[xmltv-parser] Parsed ${channels.length} channels and ${programs.length} programs`);
  
  return { channels, programs };
}

/**
 * Build XMLTV EPG URL from Xtream credentials
 * Format: {protocol}://{domain}/xmltv.php?username={user}&password={pass}
 */
export function buildXMLTVUrl(serverUrl: string, username: string, password: string): string {
  // Parse server URL to extract protocol and domain
  let url = serverUrl.trim();
  
  // Ensure protocol
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'http://' + url;
  }
  
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}/xmltv.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
  } catch {
    // Fallback: simple string manipulation
    const match = url.match(/^(https?:\/\/)?([^\/]+)/);
    if (match) {
      const protocol = match[1] || 'http://';
      const domain = match[2];
      return `${protocol}${domain}/xmltv.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
    }
    return '';
  }
}

/**
 * Match XMLTV channel ID to stream ID
 * Tries multiple matching strategies:
 * 1. Exact match on epg_channel_id
 * 2. Partial match on channel name
 */
export function matchChannelToPrograms(
  streamId: number,
  epgChannelId: string | undefined,
  channelName: string,
  xmltvData: XMLTVData
): XMLTVProgram[] {
  // Strategy 1: Match by EPG channel ID
  if (epgChannelId) {
    const byId = xmltvData.programs.filter(p => 
      p.channelId.toLowerCase() === epgChannelId.toLowerCase()
    );
    if (byId.length > 0) return byId;
  }
  
  // Strategy 2: Match by channel name in XMLTV channels
  const normalizedName = channelName.toLowerCase().replace(/[^a-z0-9]/g, '');
  
  for (const xmlCh of xmltvData.channels) {
    const xmlName = xmlCh.displayName.toLowerCase().replace(/[^a-z0-9]/g, '');
    
    // Check for substantial overlap
    if (
      xmlName.includes(normalizedName) || 
      normalizedName.includes(xmlName) ||
      xmlName === normalizedName
    ) {
      return xmltvData.programs.filter(p => p.channelId === xmlCh.id);
    }
  }
  
  // Strategy 3: Try matching by stream ID in channel ID (e.g., "channel_12345")
  const streamIdStr = String(streamId);
  for (const xmlCh of xmltvData.channels) {
    if (xmlCh.id.includes(streamIdStr)) {
      return xmltvData.programs.filter(p => p.channelId === xmlCh.id);
    }
  }
  
  return [];
}
