const TMDB_API_KEY = '2a6b4b5486a922140a01d14b821535ac';
const BASE_URL = 'https://api.themoviedb.org/3';

export interface TMDBMetadata {
  poster: string | null;
  backdrop: string | null;
  rating: number;
  description: string;
  year?: string;
  tmdbId?: number;
}

export interface TMDBDetailedMetadata extends TMDBMetadata {
  cast: Array<{ name: string; character: string; profile: string | null }>;
  genres: string[];
  runtime?: number;
  trailerKey?: string; // YouTube video key
  tagline?: string;
}

/**
 * Clean IPTV title by removing country tags, quality indicators, file extensions, etc.
 * Examples:
 *   "SE | Gladiator.II.2024.FHD" -> "Gladiator II"
 *   "EN | The.Matrix.1999.4K.mkv" -> "The Matrix"
 *   "US: Breaking Bad S01E03 720p" -> "Breaking Bad"
 */
export function cleanTitle(title: string): string {
  return title
    // Remove country/language prefixes: "SE |", "EN |", "US:", "SWE -", etc.
    .replace(/^[A-Z]{2,3}\s*[|:\-–]\s*/i, '')
    // Remove file extensions: .mkv, .mp4, .avi, .srt
    .replace(/\.(mkv|mp4|avi|ts|srt|sub|idx)$/gi, '')
    // Remove year in various formats
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .replace(/\s*-\s*\d{4}\s*$/, '')
    .replace(/\s*\[\d{4}\]\s*$/, '')
    .replace(/\.\d{4}\./, ' ') // "Movie.2024.FHD" -> "Movie FHD" (year in middle)
    // Remove quality/resolution tags
    .replace(/\s*(4K|UHD|FHD|HD|SD|HDR|HDR10|DV|REMUX|WEB-?DL|BLU-?RAY|BRRIP|DVDRIP|HDTV|CAM|TS|TC)/gi, '')
    .replace(/\s*(2160p|1080p|720p|480p|360p)/gi, '')
    // Remove codec tags
    .replace(/\s*(x264|x265|H\.?264|H\.?265|HEVC|AVC|AAC|DTS|AC3|ATMOS|DD5\.1|DD2\.0|FLAC)/gi, '')
    // Remove tags in brackets
    .replace(/\[.*?\]/g, '')
    // Remove episode markers
    .replace(/\s+(S\d{2}E\d{2})/gi, '')
    // Replace dots/underscores with spaces (common in IPTV naming)
    .replace(/[._]/g, ' ')
    // Remove extra group/release tags at end (e.g. "-SPARKS", "-YIFY")
    .replace(/\s*-\s*[A-Z]{2,}$/i, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fetch metadata from TMDB API by title
 */
export async function getMetadata(
  title: string,
  type: 'movie' | 'tv' = 'movie'
): Promise<TMDBMetadata | null> {
  try {
    const cleanedTitle = cleanTitle(title);
    if (!cleanedTitle) return null;

    const searchUrl = `${BASE_URL}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanedTitle)}&language=sv-SE`;
    const response = await fetch(searchUrl);
    
    if (!response.ok) {
      console.error('TMDB API error:', response.status);
      return null;
    }

    const data = await response.json();

    if (data.results && data.results.length > 0) {
      const item = data.results[0];
      const dateField = type === 'movie' ? item.release_date : item.first_air_date;
      const year = dateField ? dateField.split('-')[0] : undefined;

      return {
        poster: item.poster_path 
          ? `https://image.tmdb.org/t/p/w500${item.poster_path}` 
          : null,
        backdrop: item.backdrop_path 
          ? `https://image.tmdb.org/t/p/original${item.backdrop_path}` 
          : null,
        rating: item.vote_average || 0,
        description: item.overview || '',
        year,
        tmdbId: item.id,
      };
    }
  } catch (error) {
    console.error('TMDB Error:', error);
  }
  
  return null;
}

/**
 * Fetch detailed metadata including cast, genres, trailer
 */
export async function getDetailedMetadata(
  title: string,
  type: 'movie' | 'tv' = 'movie'
): Promise<TMDBDetailedMetadata | null> {
  try {
    // First get basic search to find TMDB ID
    const basic = await getMetadata(title, type);
    if (!basic?.tmdbId) return null;

    // Fetch details + credits + videos in one call using append_to_response
    const detailUrl = `${BASE_URL}/${type}/${basic.tmdbId}?api_key=${TMDB_API_KEY}&language=sv-SE&append_to_response=credits,videos`;
    const response = await fetch(detailUrl);
    if (!response.ok) return null;

    const data = await response.json();

    // Extract top cast (max 10)
    const cast = (data.credits?.cast || []).slice(0, 10).map((c: any) => ({
      name: c.name,
      character: c.character,
      profile: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : null,
    }));

    // Find YouTube trailer
    const videos = data.videos?.results || [];
    const trailer = videos.find((v: any) => v.type === 'Trailer' && v.site === 'YouTube')
      || videos.find((v: any) => v.site === 'YouTube');

    const genres = (data.genres || []).map((g: any) => g.name);

    return {
      ...basic,
      cast,
      genres,
      runtime: data.runtime || undefined,
      trailerKey: trailer?.key || undefined,
      tagline: data.tagline || undefined,
    };
  } catch (error) {
    console.error('TMDB Detail Error:', error);
    return null;
  }
}

/**
 * Batch fetch metadata for multiple titles
 */
export async function batchGetMetadata(
  items: Array<{ title: string; type: 'movie' | 'tv' }>,
  delayMs: number = 50
): Promise<Map<string, TMDBMetadata | null>> {
  const results = new Map<string, TMDBMetadata | null>();
  
  for (let i = 0; i < items.length; i++) {
    const { title, type } = items[i];
    const key = `${cleanTitle(title)}-${type}`;
    
    if (!results.has(key)) {
      const metadata = await getMetadata(title, type);
      results.set(key, metadata);
      
      if (i < items.length - 1 && delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  return results;
}
