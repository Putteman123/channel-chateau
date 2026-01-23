const TMDB_API_KEY = '2a6b4b5486a922140a01d14b821535ac';
const BASE_URL = 'https://api.themoviedb.org/3';

export interface TMDBMetadata {
  poster: string | null;
  backdrop: string | null;
  rating: number;
  description: string;
  year?: string;
}

/**
 * Clean title by removing year, quality tags, and other common suffixes
 */
export function cleanTitle(title: string): string {
  return title
    .replace(/\s*\(\d{4}\)\s*$/, '')           // Remove year: "Movie (2023)" -> "Movie"
    .replace(/\s*-\s*\d{4}\s*$/, '')           // Remove year: "Movie - 2023" -> "Movie"
    .replace(/\s*\[\d{4}\]\s*$/, '')           // Remove year: "Movie [2023]" -> "Movie"
    .replace(/\[.*?\]/g, '')                    // Remove tags: "[4K]", "[HD]"
    .replace(/\s+(4K|HD|UHD|HDR|1080p|720p|2160p)/gi, '') // Remove quality indicators
    .replace(/\s+(S\d{2}E\d{2})/gi, '')        // Remove episode markers
    .replace(/\s+/g, ' ')                       // Normalize whitespace
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
      
      // Extract year from release_date or first_air_date
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
      };
    }
  } catch (error) {
    console.error('TMDB Error:', error);
  }
  
  return null;
}

/**
 * Batch fetch metadata for multiple titles
 * Implements staggered requests to avoid rate limiting
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
      
      // Add delay between requests to avoid rate limiting
      if (i < items.length - 1 && delayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }
  
  return results;
}
