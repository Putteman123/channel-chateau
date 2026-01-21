// Xtream Codes API Types and Functions

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

// Build stream URL for live channels
export function buildLiveStreamUrl(creds: XtreamCredentials, streamId: number): string {
  const base = buildBaseUrl(creds);
  return `${base}/live/${encodeURIComponent(creds.username)}/${encodeURIComponent(creds.password)}/${streamId}.m3u8`;
}

// Build stream URL for movies
export function buildMovieStreamUrl(creds: XtreamCredentials, streamId: number, extension: string = 'mp4'): string {
  const base = buildBaseUrl(creds);
  return `${base}/movie/${encodeURIComponent(creds.username)}/${encodeURIComponent(creds.password)}/${streamId}.${extension}`;
}

// Build stream URL for series episodes
export function buildSeriesStreamUrl(creds: XtreamCredentials, episodeId: string, extension: string = 'mp4'): string {
  const base = buildBaseUrl(creds);
  return `${base}/series/${encodeURIComponent(creds.username)}/${encodeURIComponent(creds.password)}/${episodeId}.${extension}`;
}

// Authenticate with Xtream Codes server
export async function authenticate(creds: XtreamCredentials): Promise<XtreamAuthInfo> {
  const url = buildApiUrl(creds);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Authentication failed: ${response.statusText}`);
  }
  const data = await response.json();
  if (!data.user_info || data.user_info.auth !== 1) {
    throw new Error('Invalid credentials or account inactive');
  }
  return data;
}

// Get live TV categories
export async function getLiveCategories(creds: XtreamCredentials): Promise<XtreamCategory[]> {
  const url = buildApiUrl(creds, 'get_live_categories');
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to get categories: ${response.statusText}`);
  }
  return response.json();
}

// Get live channels
export async function getLiveStreams(creds: XtreamCredentials, categoryId?: string): Promise<XtreamChannel[]> {
  let url = buildApiUrl(creds, 'get_live_streams');
  if (categoryId) {
    url += `&category_id=${categoryId}`;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to get streams: ${response.statusText}`);
  }
  return response.json();
}

// Get VOD categories
export async function getVodCategories(creds: XtreamCredentials): Promise<XtreamCategory[]> {
  const url = buildApiUrl(creds, 'get_vod_categories');
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to get VOD categories: ${response.statusText}`);
  }
  return response.json();
}

// Get VOD streams (movies)
export async function getVodStreams(creds: XtreamCredentials, categoryId?: string): Promise<XtreamMovie[]> {
  let url = buildApiUrl(creds, 'get_vod_streams');
  if (categoryId) {
    url += `&category_id=${categoryId}`;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to get VOD streams: ${response.statusText}`);
  }
  return response.json();
}

// Get series categories
export async function getSeriesCategories(creds: XtreamCredentials): Promise<XtreamCategory[]> {
  const url = buildApiUrl(creds, 'get_series_categories');
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to get series categories: ${response.statusText}`);
  }
  return response.json();
}

// Get series list
export async function getSeries(creds: XtreamCredentials, categoryId?: string): Promise<XtreamSeries[]> {
  let url = buildApiUrl(creds, 'get_series');
  if (categoryId) {
    url += `&category_id=${categoryId}`;
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to get series: ${response.statusText}`);
  }
  return response.json();
}

// Get series info with episodes
export async function getSeriesInfo(creds: XtreamCredentials, seriesId: number): Promise<XtreamSeriesInfo> {
  const url = buildApiUrl(creds, 'get_series_info') + `&series_id=${seriesId}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to get series info: ${response.statusText}`);
  }
  return response.json();
}

// Get EPG for a channel
export async function getEPG(creds: XtreamCredentials, streamId: number): Promise<XtreamEPG> {
  const url = buildApiUrl(creds, 'get_short_epg') + `&stream_id=${streamId}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to get EPG: ${response.statusText}`);
  }
  return response.json();
}
