const TMDB_BASE = 'https://api.themoviedb.org/3';
const TOKEN = import.meta.env.VITE_TMDB_TOKEN;

if (!TOKEN) {
  console.warn('⚠️ VITE_TMDB_TOKEN is not set. TMDB API calls will fail.');
}

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  Accept: 'application/json',
};

// ─── Generic Fetch Wrapper ───────────────────────────────────────────────────

async function tmdbFetch<T>(url: string): Promise<T> {
  try {
    const res = await fetch(url, { headers });

    if (!res.ok) {
      throw new Error(`TMDB API error: ${res.status} ${res.statusText}`);
    }

    return await res.json();
  } catch (error) {
    console.error(`Failed to fetch: ${url}`, error);
    throw error;
  }
}

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface TMDBItem {
  id: number;
  title?: string;
  name?: string;
  poster_path: string;
  backdrop_path: string;
  overview: string;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  genre_ids: number[];
  media_type?: 'movie' | 'tv';
}

export interface TMDBDetails {
  id: number;
  title?: string;
  name?: string;
  poster_path: string;
  backdrop_path: string;
  overview: string;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  genres: { id: number; name: string }[];
  runtime?: number;
  number_of_seasons?: number;
  number_of_episodes?: number;
  seasons?: TMDBSeason[];
  status: string;
  tagline?: string;
  original_language: string;
}

export interface TMDBSeason {
  id: number;
  season_number: number;
  episode_count: number;
  name: string;
  poster_path: string;
  air_date: string;
}

export interface TMDBEpisode {
  id: number;
  episode_number: number;
  season_number: number;
  name: string;
  overview: string;
  still_path: string;
  runtime: number;
  air_date: string;
}

export interface TMDBSearchResponse {
  results: TMDBItem[];
  total_pages: number;
  total_results: number;
  page: number;
}

export interface TMDBVideoSource {
  name: string;
  emoji: string;
  getMovieUrl: (id: number) => string;
  getTvUrl: (id: number, s: number, e: number) => string;
}

// ─── Genre Map ───────────────────────────────────────────────────────────────

export const TMDB_GENRES: Record<number, string> = {
  // Movies
  28: 'Action',
  12: 'Adventure',
  16: 'Animation',
  35: 'Comedy',
  80: 'Crime',
  99: 'Documentary',
  18: 'Drama',
  10751: 'Family',
  14: 'Fantasy',
  36: 'History',
  27: 'Horror',
  10402: 'Music',
  9648: 'Mystery',
  10749: 'Romance',
  878: 'Sci-Fi',
  10770: 'TV Movie',
  53: 'Thriller',
  10752: 'War',
  37: 'Western',
  // TV
  10759: 'Action & Adventure',
  10762: 'Kids',
  10763: 'News',
  10764: 'Reality',
  10765: 'Sci-Fi & Fantasy',
  10766: 'Soap',
  10767: 'Talk',
  10768: 'War & Politics',
};

// ─── Image Helpers ───────────────────────────────────────────────────────────

export const tmdbImage = (path: string, size = 'w500'): string =>
  path
    ? `https://image.tmdb.org/t/p/${size}${path}`
    : 'https://via.placeholder.com/500x750?text=No+Image';

export const tmdbBackdrop = (path: string): string =>
  path ? `https://image.tmdb.org/t/p/w1280${path}` : '';

// ─── API Functions ───────────────────────────────────────────────────────────

/**
 * Get trending movies/tv/all for day or week
 */
export async function getTrending(
  type: 'movie' | 'tv' | 'all' = 'all',
  time: 'day' | 'week' = 'week'
): Promise<TMDBItem[]> {
  const data = await tmdbFetch<{ results: TMDBItem[] }>(
    `${TMDB_BASE}/trending/${type}/${time}`
  );
  return data.results;
}

/**
 * Get popular movies or tv shows
 */
export async function getPopular(
  type: 'movie' | 'tv',
  page = 1
): Promise<TMDBItem[]> {
  const data = await tmdbFetch<{ results: TMDBItem[] }>(
    `${TMDB_BASE}/${type}/popular?language=en-US&page=${page}`
  );
  return data.results;
}

/**
 * Get top rated movies or tv shows
 */
export async function getTopRated(
  type: 'movie' | 'tv',
  page = 1
): Promise<TMDBItem[]> {
  const data = await tmdbFetch<{ results: TMDBItem[] }>(
    `${TMDB_BASE}/${type}/top_rated?language=en-US&page=${page}`
  );
  return data.results;
}

/**
 * Get now playing movies
 */
export async function getNowPlaying(page = 1): Promise<TMDBItem[]> {
  const data = await tmdbFetch<{ results: TMDBItem[] }>(
    `${TMDB_BASE}/movie/now_playing?language=en-US&page=${page}`
  );
  return data.results;
}

/**
 * Get upcoming movies
 */
export async function getUpcoming(page = 1): Promise<TMDBItem[]> {
  const data = await tmdbFetch<{ results: TMDBItem[] }>(
    `${TMDB_BASE}/movie/upcoming?language=en-US&page=${page}`
  );
  return data.results;
}

/**
 * Get currently airing TV shows
 */
export async function getOnAir(page = 1): Promise<TMDBItem[]> {
  const data = await tmdbFetch<{ results: TMDBItem[] }>(
    `${TMDB_BASE}/tv/on_the_air?language=en-US&page=${page}`
  );
  return data.results;
}

/**
 * Search movies and TV shows
 */
export async function searchTMDB(
  query: string,
  page = 1
): Promise<TMDBItem[]> {
  if (!query.trim()) return [];

  const data = await tmdbFetch<TMDBSearchResponse>(
    `${TMDB_BASE}/search/multi?query=${encodeURIComponent(query)}&include_adult=false&language=en-US&page=${page}`
  );

  return data.results.filter(
    (item) => item.media_type === 'movie' || item.media_type === 'tv'
  );
}

/**
 * Get full details for a movie or TV show
 */
export async function getDetails(
  id: number,
  type: 'movie' | 'tv'
): Promise<TMDBDetails> {
  return tmdbFetch<TMDBDetails>(
    `${TMDB_BASE}/${type}/${id}?language=en-US`
  );
}

/**
 * Get similar movies or TV shows
 */
export async function getSimilar(
  id: number,
  type: 'movie' | 'tv',
  page = 1
): Promise<TMDBItem[]> {
  const data = await tmdbFetch<{ results: TMDBItem[] }>(
    `${TMDB_BASE}/${type}/${id}/similar?language=en-US&page=${page}`
  );
  return data.results;
}

/**
 * Get recommendations for a movie or TV show
 */
export async function getRecommendations(
  id: number,
  type: 'movie' | 'tv',
  page = 1
): Promise<TMDBItem[]> {
  const data = await tmdbFetch<{ results: TMDBItem[] }>(
    `${TMDB_BASE}/${type}/${id}/recommendations?language=en-US&page=${page}`
  );
  return data.results;
}

/**
 * Get all episodes for a specific season of a TV show
 */
export async function getSeasonEpisodes(
  seriesId: number,
  seasonNumber: number
): Promise<TMDBEpisode[]> {
  const data = await tmdbFetch<{ episodes: TMDBEpisode[] }>(
    `${TMDB_BASE}/tv/${seriesId}/season/${seasonNumber}?language=en-US`
  );
  return data.episodes;
}

/**
 * Discover movies or TV shows by genre
 */
export async function discoverByGenre(
  type: 'movie' | 'tv',
  genreId: number,
  page = 1
): Promise<TMDBItem[]> {
  const data = await tmdbFetch<{ results: TMDBItem[] }>(
    `${TMDB_BASE}/discover/${type}?with_genres=${genreId}&language=en-US&page=${page}&sort_by=popularity.desc`
  );
  return data.results;
}

// ─── Video Sources ───────────────────────────────────────────────────────────

export const VIDEO_SOURCES: TMDBVideoSource[] = [
  {
    name: 'VidSrc.pro',
    emoji: '🟢',
    getMovieUrl: (id) => `https://vidsrc.pro/embed/movie/${id}`,
    getTvUrl: (id, s, e) => `https://vidsrc.pro/embed/tv/${id}/${s}/${e}`,
  },
  {
    name: 'AutoEmbed',
    emoji: '🔵',
    getMovieUrl: (id) => `https://player.autoembed.cc/embed/movie/${id}`,
    getTvUrl: (id, s, e) =>
      `https://player.autoembed.cc/embed/tv/${id}/${s}/${e}`,
  },
  {
    name: 'Embed.su',
    emoji: '🟣',
    getMovieUrl: (id) => `https://embed.su/embed/movie/${id}`,
    getTvUrl: (id, s, e) => `https://embed.su/embed/tv/${id}/${s}/${e}`,
  },
  {
    name: 'VidSrc.xyz',
    emoji: '🟡',
    getMovieUrl: (id) => `https://vidsrc.xyz/embed/movie?tmdb=${id}`,
    getTvUrl: (id, s, e) =>
      `https://vidsrc.xyz/embed/tv?tmdb=${id}&season=${s}&episode=${e}`,
  },
  {
    name: 'MultiEmbed',
    emoji: '🟠',
    getMovieUrl: (id) => `https://multiembed.mov/?video_id=${id}&tmdb=1`,
    getTvUrl: (id, s, e) =>
      `https://multiembed.mov/?video_id=${id}&tmdb=1&s=${s}&e=${e}`,
  },
  {
    name: '2Embed',
    emoji: '⚪',
    getMovieUrl: (id) => `https://www.2embed.cc/embed/${id}`,
    // ✅ Fixed: was using & before s=, should be ?
    getTvUrl: (id, s, e) =>
      `https://www.2embed.cc/embedtv/${id}?s=${s}&e=${e}`,
  },
];

// ─── Backward Compatibility ──────────────────────────────────────────────────

export const getVidSrcMovieUrl = (id: number): string =>
  VIDEO_SOURCES[0].getMovieUrl(id);

export const getVidSrcTVUrl = (id: number, s: number, e: number): string =>
  VIDEO_SOURCES[0].getTvUrl(id, s, e);
