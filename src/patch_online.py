import sys, re

path = sys.argv[1] if len(sys.argv) > 1 else 'App.tsx'
with open(path, 'r') as f:
    src = f.read()

# ─────────────────────────────────────────────────────────────
# 1. Add AnimeSection + updated OnlineSection with mode toggle
#    and more TMDB catalogs (Bollywood, South Indian, K-Drama,
#    trending IN, top rated, now playing, upcoming)
# ─────────────────────────────────────────────────────────────

# --- A. Replace STREAM_PROVIDERS to add animepahe for anime ---
old_providers = '''const STREAM_PROVIDERS = [
  {
    name: "VidZee",
    getMovieUrl: (id: number) => `https://player.vidzee.wtf/embed/movie/${id}`,
    getTVUrl: (id: number, s: number, e: number) => `https://player.vidzee.wtf/embed/tv/${id}/${s}/${e}`,
  },
  {
    name: "Videasy",
    getMovieUrl: (id: number) => `https://player.videasy.net/movie/${id}`,
    getTVUrl: (id: number, s: number, e: number) => `https://player.videasy.net/tv/${id}/${s}/${e}`,
  },
  {
    name: "Vidlink",
    getMovieUrl: (id: number) => `https://vidlink.pro/movie/${id}`,
    getTVUrl: (id: number, s: number, e: number) => `https://vidlink.pro/tv/${id}/${s}/${e}`,
  },
  {
    name: "VidSrc",
    getMovieUrl: (id: number) => `https://vidsrc-embed.ru/embed/movie/${id}`,
    getTVUrl: (id: number, s: number, e: number) => `https://vidsrc-embed.ru/embed/tv/${id}/${s}-${e}`,
  },
  {
    name: "2Embed",
    getMovieUrl: (id: number) => `https://www.2embed.cc/embed/${id}`,
    getTVUrl: (id: number, s: number, e: number) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`,
  },
];'''

new_providers = '''const STREAM_PROVIDERS = [
  {
    name: "VidZee",
    getMovieUrl: (id: number) => `https://player.vidzee.wtf/embed/movie/${id}`,
    getTVUrl: (id: number, s: number, e: number) => `https://player.vidzee.wtf/embed/tv/${id}/${s}/${e}`,
  },
  {
    name: "Videasy",
    getMovieUrl: (id: number) => `https://player.videasy.net/movie/${id}`,
    getTVUrl: (id: number, s: number, e: number) => `https://player.videasy.net/tv/${id}/${s}/${e}`,
  },
  {
    name: "Vidlink",
    getMovieUrl: (id: number) => `https://vidlink.pro/movie/${id}`,
    getTVUrl: (id: number, s: number, e: number) => `https://vidlink.pro/tv/${id}/${s}/${e}`,
  },
  {
    name: "VidSrc",
    getMovieUrl: (id: number) => `https://vidsrc-embed.ru/embed/movie/${id}`,
    getTVUrl: (id: number, s: number, e: number) => `https://vidsrc-embed.ru/embed/tv/${id}/${s}-${e}`,
  },
  {
    name: "2Embed",
    getMovieUrl: (id: number) => `https://www.2embed.cc/embed/${id}`,
    getTVUrl: (id: number, s: number, e: number) => `https://www.2embed.cc/embedtv/${id}&s=${s}&e=${e}`,
  },
];

// ─── Anime Stream Providers ───────────────────────────────────────────────────
const ANIME_PROVIDERS = [
  {
    name: "VidZee",
    getUrl: (anilistId: number, ep: number) => `https://player.vidzee.wtf/embed/tv/${anilistId}/1/${ep}`,
  },
  {
    name: "AnimePahe",
    getUrl: (anilistId: number, ep: number) => `https://animepahe.ru/play/${anilistId}/${ep}`,
  },
  {
    name: "MegaPlay",
    getUrl: (anilistId: number, ep: number) => `https://megaplay.buzz/stream/ani/${anilistId}/${ep}/sub`,
  },
];'''

src = src.replace(old_providers, new_providers)

# --- B. Add AnimeSection component before OnlineSection ---
anime_section = '''
// ─── AniList Types ────────────────────────────────────────────────────────────
interface AniListAnime {
  id: number;
  title: { romaji: string; english: string | null; native: string };
  description: string | null;
  coverImage: { large: string; extraLarge: string };
  bannerImage: string | null;
  episodes: number | null;
  status: string;
  averageScore: number | null;
  genres: string[];
  season: string | null;
  seasonYear: number | null;
  format: string;
  nextAiringEpisode: { episode: number } | null;
}

// ─── AniList API ──────────────────────────────────────────────────────────────
const ANILIST_API = 'https://graphql.anilist.co';

async function anilistFetch(query: string, variables: object): Promise<any> {
  const res = await fetch(ANILIST_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  return json.data;
}

const ANIME_LIST_QUERY = `
query ($page: Int, $perPage: Int, $sort: [MediaSort], $season: MediaSeason, $seasonYear: Int, $genre: String, $search: String, $status: MediaStatus) {
  Page(page: $page, perPage: $perPage) {
    pageInfo { hasNextPage total }
    media(type: ANIME, sort: $sort, season: $season, seasonYear: $seasonYear, genre: $genre, search: $search, status: $status, isAdult: false) {
      id
      title { romaji english native }
      description(asHtml: false)
      coverImage { large extraLarge }
      bannerImage
      episodes
      status
      averageScore
      genres
      season
      seasonYear
      format
      nextAiringEpisode { episode }
    }
  }
}`;

// ─── Anime Section ────────────────────────────────────────────────────────────
function AnimeSection({ onGoHome }: { onGoHome: () => void }) {
  const [activeTab, setActiveTab] = useState<'trending' | 'popular' | 'seasonal' | 'search'>('trending');
  const [animeList, setAnimeList] = useState<AniListAnime[]>([]);
  const [searchResults, setSearchResults] = useState<AniListAnime[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [selectedAnime, setSelectedAnime] = useState<AniListAnime | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [playerUrl, setPlayerUrl] = useState('');
  const [iframeKey, setIframeKey] = useState(0);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [selectedEpisode, setSelectedEpisode] = useState(1);
  const [selectedProvider, setSelectedProvider] = useState(0);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => { fetchAnime(1, activeTab); }, [activeTab]);

  const fetchAnime = async (p: number, tab: string) => {
    setIsLoading(true);
    try {
      let variables: any = { page: p, perPage: 24 };
      if (tab === 'trending') variables.sort = ['TRENDING_DESC'];
      else if (tab === 'popular') variables.sort = ['POPULARITY_DESC'];
      else if (tab === 'seasonal') {
        const now = new Date();
        const month = now.getMonth();
        const seasons = ['WINTER','WINTER','SPRING','SPRING','SPRING','SUMMER','SUMMER','SUMMER','FALL','FALL','FALL','WINTER'];
        variables.season = seasons[month];
        variables.seasonYear = now.getFullYear();
        variables.sort = ['POPULARITY_DESC'];
        variables.status = 'RELEASING';
      }
      const data = await anilistFetch(ANIME_LIST_QUERY, variables);
      const items: AniListAnime[] = data.Page.media;
      setAnimeList(prev => p === 1 ? items : [...prev, ...items]);
      setHasMore(data.Page.pageInfo.hasNextPage);
      setPage(p);
    } catch (e) { console.error(e); }
    setIsLoading(false);
  };

  const handleSearch = (q: string) => {
    setSearchQuery(q);
    clearTimeout(searchTimeoutRef.current);
    if (!q.trim()) { setSearchResults([]); return; }
    searchTimeoutRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const data = await anilistFetch(ANIME_LIST_QUERY, { search: q, page: 1, perPage: 24, sort: ['SEARCH_MATCH'] });
        setSearchResults(data.Page.media);
      } catch (e) { console.error(e); }
      setIsLoading(false);
    }, 500);
  };

  const totalEpisodes = (a: AniListAnime) =>
    a.episodes ?? a.nextAiringEpisode?.episode ?? 12;

  const startStream = (anime: AniListAnime, ep: number, providerIdx = selectedProvider) => {
    const url = ANIME_PROVIDERS[providerIdx].getUrl(anime.id, ep);
    setSelectedAnime(anime);
    setSelectedEpisode(ep);
    setSelectedProvider(providerIdx);
    setPlayerUrl(url);
    setIframeKey(k => k + 1);
    setIframeLoaded(false);
    setShowPlayer(true);
  };

  const getTitle = (a: AniListAnime) => a.title.english || a.title.romaji;
  const currentList = activeTab === 'search' ? searchResults : animeList;

  return (
    <div className="px-4 sm:px-8 pb-16 pt-4">
      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto scrollbar-hide pb-1">
        {([
          { key: 'trending', label: '🔥 Trending' },
          { key: 'popular', label: '⭐ Popular' },
          { key: 'seasonal', label: '📅 This Season' },
          { key: 'search', label: '🔍 Search' },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            className={cn('flex-shrink-0 px-4 py-2 rounded-xl font-bold text-sm transition-all',
              activeTab === tab.key
                ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700')}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search bar */}
      {activeTab === 'search' && (
        <div className="mb-6 relative">
          <input type="text" value={searchQuery} onChange={e => handleSearch(e.target.value)}
            placeholder="Search anime..." autoFocus
            className="w-full px-4 py-3 pl-12 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:border-purple-500 text-white" />
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"><SearchIcon /></div>
          {searchQuery && <button onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"><CloseIcon /></button>}
        </div>
      )}

      {/* Loading */}
      {isLoading && currentList.length === 0 && (
        <div className="flex items-center justify-center py-20">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Fetching from AniList...</p>
          </div>
        </div>
      )}

      {/* Grid */}
      {currentList.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {currentList.map(anime => (
            <button key={anime.id} onClick={() => setSelectedAnime(anime)}
              className="group relative flex-shrink-0 text-left hover:scale-105 transition-all duration-300">
              <div className="relative rounded-xl overflow-hidden bg-gray-800 aspect-[2/3]">
                <img src={anime.coverImage.extraLarge || anime.coverImage.large} alt={getTitle(anime)}
                  className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <div className="absolute top-2 left-2 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-lg flex items-center gap-1">
                  <span className="text-yellow-400 text-xs">⭐</span>
                  <span className="text-white text-xs font-bold">{anime.averageScore ? (anime.averageScore/10).toFixed(1) : 'N/A'}</span>
                </div>
                <div className="absolute top-2 right-2 px-2 py-1 bg-purple-500/80 backdrop-blur-sm rounded-lg text-xs font-bold">🎌</div>
                {anime.status === 'RELEASING' && (
                  <div className="absolute bottom-8 left-2 px-2 py-0.5 bg-green-500/90 rounded text-[10px] font-bold">AIRING</div>
                )}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="w-14 h-14 bg-purple-500/90 rounded-full flex items-center justify-center"><PlayIcon /></div>
                </div>
                <div className="absolute bottom-0 left-0 right-0 p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <p className="font-bold text-xs truncate">{getTitle(anime)}</p>
                  <p className="text-[10px] text-gray-300">{anime.seasonYear} • {anime.episodes ? anime.episodes + ' eps' : 'Ongoing'}</p>
                </div>
              </div>
              <p className="mt-1.5 text-xs text-gray-400 truncate px-0.5 sm:hidden">{getTitle(anime)}</p>
            </button>
          ))}
        </div>
      )}

      {/* Empty search */}
      {activeTab === 'search' && !searchQuery && (
        <div className="text-center py-20">
          <div className="text-6xl mb-4">🎌</div>
          <h3 className="text-xl font-bold mb-2" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>Search Anime</h3>
          <p className="text-gray-400">Search from 15,000+ anime titles via AniList</p>
        </div>
      )}

      {/* Load More */}
      {activeTab !== 'search' && hasMore && currentList.length > 0 && (
        <div className="flex justify-center mt-8">
          <button onClick={() => fetchAnime(page + 1, activeTab)} disabled={isLoading}
            className="px-8 py-3 bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl font-bold hover:from-purple-600 disabled:opacity-50 flex items-center gap-2">
            {isLoading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Loading...</> : '🎌 Load More'}
          </button>
        </div>
      )}

      {/* Detail Modal */}
      {selectedAnime && !showPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => setSelectedAnime(null)} />
          <div className="relative bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <button onClick={() => setSelectedAnime(null)} className="absolute top-4 right-4 z-10 w-10 h-10 bg-gray-800/80 rounded-full flex items-center justify-center hover:bg-gray-700"><CloseIcon /></button>
            <div className="relative h-48 sm:h-64">
              {selectedAnime.bannerImage
                ? <img src={selectedAnime.bannerImage} alt={getTitle(selectedAnime)} className="w-full h-full object-cover rounded-t-2xl" />
                : <div className="w-full h-full bg-gradient-to-br from-purple-900 to-pink-900 rounded-t-2xl flex items-center justify-center"><span className="text-7xl">🎌</span></div>}
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent rounded-t-2xl" />
              <div className="absolute bottom-4 left-4 right-12">
                <h2 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>{getTitle(selectedAnime)}</h2>
                <div className="flex items-center gap-2 text-sm text-gray-300 flex-wrap mt-1">
                  <span>{selectedAnime.seasonYear}</span>
                  {selectedAnime.averageScore && <><span className="w-1 h-1 bg-gray-400 rounded-full" /><span>⭐ {(selectedAnime.averageScore/10).toFixed(1)}/10</span></>}
                  <span className="w-1 h-1 bg-gray-400 rounded-full" />
                  <span className="text-purple-400 font-bold">{selectedAnime.format}</span>
                  {selectedAnime.status === 'RELEASING' && <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full text-xs font-bold">AIRING</span>}
                </div>
              </div>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              {selectedAnime.genres.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedAnime.genres.slice(0,5).map(g => <span key={g} className="px-3 py-1 bg-purple-500/20 border border-purple-500/30 rounded-full text-xs">{g}</span>)}
                </div>
              )}
              {selectedAnime.description && (
                <p className="text-gray-300 text-sm leading-relaxed line-clamp-3"
                  dangerouslySetInnerHTML={{ __html: selectedAnime.description.replace(/<[^>]*>/g, '') }} />
              )}
              {/* Episode picker */}
              <div>
                <label className="block text-xs text-gray-400 mb-2">Episode</label>
                <div className="flex items-center gap-2 flex-wrap">
                  <select value={selectedEpisode} onChange={e => setSelectedEpisode(Number(e.target.value))}
                    className="px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-purple-500 text-sm">
                    {Array.from({ length: totalEpisodes(selectedAnime) }, (_, i) => i + 1).map(ep => (
                      <option key={ep} value={ep}>Episode {ep}</option>
                    ))}
                  </select>
                  <span className="text-xs text-gray-500">{selectedAnime.episodes ? `of ${selectedAnime.episodes}` : 'ongoing'}</span>
                </div>
              </div>
              <div className="p-3 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center gap-3">
                <span className="text-xl">🎌</span>
                <div>
                  <p className="text-purple-400 text-sm font-bold">Powered by VidZee & AnimePahe</p>
                  <p className="text-gray-400 text-xs">Switch providers in the player. Use ad blocker for best experience.</p>
                </div>
              </div>
              <button onClick={() => startStream(selectedAnime, selectedEpisode)}
                className="w-full py-4 bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 rounded-xl font-bold text-lg flex items-center justify-center gap-3 hover:from-purple-600 transition-all">
                <PlayIcon /> ▶ Play Episode {selectedEpisode}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Anime Player */}
      {showPlayer && selectedAnime && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col">
          <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 bg-gray-900/95 border-b border-gray-800">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button onClick={() => setShowPlayer(false)} className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-xl text-xs font-semibold">
                <ChevronLeftIcon /><span className="hidden sm:inline">Back</span>
              </button>
              <div className="min-w-0 ml-1">
                <p className="font-bold text-xs sm:text-sm truncate">{getTitle(selectedAnime)}</p>
                <p className="text-[10px] text-purple-400">Episode {selectedEpisode}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide flex-shrink-0" style={{maxWidth:'55vw'}}>
              {ANIME_PROVIDERS.map((p, i) => (
                <button key={i} onClick={() => startStream(selectedAnime, selectedEpisode, i)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                    selectedProvider === i ? 'bg-purple-500 border-purple-400 text-white' : 'bg-gray-800/80 border-gray-700 text-gray-400 hover:text-white'
                  }`}>
                  {selectedProvider === i ? '▶ ' : ''}{p.name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 relative min-h-0">
            {!iframeLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-950 z-10">
                <div className="text-center">
                  <div className="w-14 h-14 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-gray-300 text-sm font-bold">Loading anime...</p>
                </div>
              </div>
            )}
            <iframe key={iframeKey} src={playerUrl} className="w-full h-full border-0 block"
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
              onLoad={() => setIframeLoaded(true)} title={getTitle(selectedAnime)}
              style={{ display: 'block', width: '100%', height: '100%' }} />
          </div>
          {/* Episode strip */}
          <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-gray-900/95 border-t border-gray-800 overflow-x-auto scrollbar-hide" style={{scrollbarWidth:'none'}}>
            <button onClick={() => { if(selectedEpisode>1){ const e=selectedEpisode-1; setSelectedEpisode(e); startStream(selectedAnime,e); } }}
              disabled={selectedEpisode<=1} className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-gray-800 rounded-full disabled:opacity-30"><ChevronLeftIcon /></button>
            <div className="flex items-center gap-1.5 overflow-x-auto flex-1" style={{scrollbarWidth:'none'}}>
              {Array.from({ length: totalEpisodes(selectedAnime) }, (_, i) => i + 1).map(ep => (
                <button key={ep} onClick={() => { setSelectedEpisode(ep); startStream(selectedAnime, ep); }}
                  className={`flex-shrink-0 min-w-[36px] h-8 rounded-full text-xs font-bold border transition-all ${
                    selectedEpisode === ep ? 'bg-purple-500 border-purple-400 text-white' : 'bg-gray-800/80 border-gray-700 text-gray-400'
                  }`}>{ep}</button>
              ))}
            </div>
            <button onClick={() => { const max=totalEpisodes(selectedAnime); if(selectedEpisode<max){ const e=selectedEpisode+1; setSelectedEpisode(e); startStream(selectedAnime,e); } }}
              disabled={selectedEpisode>=totalEpisodes(selectedAnime)} className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-purple-500 rounded-full disabled:opacity-30"><ChevronRightIcon /></button>
          </div>
        </div>
      )}
    </div>
  );
}
'''

# Insert AnimeSection before OnlineSection
src = src.replace(
    '// ─── Online Section ───────────────────────────────────────────────────────────',
    anime_section + '\n// ─── Online Section ───────────────────────────────────────────────────────────'
)

# --- C. Update OnlineSection to add mode toggle + more TMDB catalogs ---
old_online_tabs = """  const [activeTab, setActiveTab] = useState<'trending' | 'movies' | 'series' | 'search' | 'history'>('trending');
  const [trending, setTrending] = useState<TMDBMovie[]>([]);
  const [movies, setMovies] = useState<TMDBMovie[]>([]);
  const [series, setSeries] = useState<TMDBMovie[]>([]);
  const [searchResults, setSearchResults] = useState<TMDBMovie[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<TMDBMovie | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [playerUrl, setPlayerUrl] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);"""

new_online_tabs = """  const [mode, setMode] = useState<'movies' | 'anime'>('movies');
  const [activeTab, setActiveTab] = useState<'trending' | 'movies' | 'series' | 'search' | 'history' | 'bollywood' | 'south' | 'kdrama' | 'toprated' | 'upcoming'>('trending');
  const [trending, setTrending] = useState<TMDBMovie[]>([]);
  const [movies, setMovies] = useState<TMDBMovie[]>([]);
  const [series, setSeries] = useState<TMDBMovie[]>([]);
  const [searchResults, setSearchResults] = useState<TMDBMovie[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedItem, setSelectedItem] = useState<TMDBMovie | null>(null);
  const [showPlayer, setShowPlayer] = useState(false);
  const [playerUrl, setPlayerUrl] = useState('');
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);"""

src = src.replace(old_online_tabs, new_online_tabs)

# --- D. Replace the fetchMovies/fetchSeries/fetchTrending block with extended fetch ---
old_fetch = """      const fetchTrending = async () => {
        setIsLoading(true);
        try { const data = await tmdbFetch('/trending/all/week?language=en-US'); setTrending(data.results || []); } catch (e) { console.error(e); }
        setIsLoading(false);
      };

      const fetchMovies = async (p: number) => {
        setIsLoading(true);
        try {
          const data = await tmdbFetch(`/movie/popular?language=en-US&page=${p}`);
          setMovies(prev => p === 1 ? data.results : [...prev, ...data.results]);
          setHasMore(p < data.total_pages); setPage(p);
        } catch (e) { console.error(e); }
        setIsLoading(false);
      };

      const fetchSeries = async (p: number) => {
        setIsLoading(true);
        try {
          const data = await tmdbFetch(`/tv/popular?language=en-US&page=${p}`);
          setSeries(prev => p === 1 ? data.results : [...prev, ...data.results]);
          setHasMore(p < data.total_pages); setPage(p);
        } catch (e) { console.error(e); }
        setIsLoading(false);
      };"""

new_fetch = """      const fetchTrending = async () => {
        setIsLoading(true);
        try { const data = await tmdbFetch('/trending/all/week?language=en-US&region=IN'); setTrending(data.results || []); } catch (e) { console.error(e); }
        setIsLoading(false);
      };

      const fetchMovies = async (p: number) => {
        setIsLoading(true);
        try {
          const data = await tmdbFetch(`/movie/popular?language=en-US&page=${p}&region=IN`);
          setMovies(prev => p === 1 ? data.results : [...prev, ...data.results]);
          setHasMore(p < data.total_pages); setPage(p);
        } catch (e) { console.error(e); }
        setIsLoading(false);
      };

      const fetchSeries = async (p: number) => {
        setIsLoading(true);
        try {
          const data = await tmdbFetch(`/tv/popular?language=en-US&page=${p}&region=IN`);
          setSeries(prev => p === 1 ? data.results : [...prev, ...data.results]);
          setHasMore(p < data.total_pages); setPage(p);
        } catch (e) { console.error(e); }
        setIsLoading(false);
      };

      // Extra catalog fetchers stored in catalogData state
      const [catalogData, setCatalogData] = useState<{[key:string]: TMDBMovie[]}>({});

      const fetchCatalog = async (key: string, endpoint: string, p: number) => {
        setIsLoading(true);
        try {
          const data = await tmdbFetch(endpoint + `&page=${p}`);
          const results = data.results || [];
          setCatalogData(prev => ({ ...prev, [key]: p === 1 ? results : [...(prev[key] || []), ...results] }));
          setHasMore(p < (data.total_pages || 1)); setPage(p);
        } catch (e) { console.error(e); }
        setIsLoading(false);
      };

      const CATALOG_ENDPOINTS: {[key:string]: string} = {
        bollywood: '/discover/movie?language=en-US&sort_by=popularity.desc&with_original_language=hi&region=IN',
        south: '/discover/movie?language=en-US&sort_by=popularity.desc&with_original_language=ta|te|ml|kn&region=IN',
        kdrama: '/discover/tv?language=en-US&sort_by=popularity.desc&with_original_language=ko',
        toprated: '/movie/top_rated?language=en-US&region=IN',
        upcoming: '/movie/upcoming?language=en-US&region=IN',
      };"""

src = src.replace(old_fetch, new_fetch)

# --- E. Update useEffect to fetch catalogs when tab changes ---
old_effect = """      useEffect(() => {
        if (!isNoApiKey) { fetchTrending(); fetchMovies(1); fetchSeries(1); }
      }, []);"""

new_effect = """      useEffect(() => {
        if (!isNoApiKey) { fetchTrending(); fetchMovies(1); fetchSeries(1); }
      }, []);

      useEffect(() => {
        if (!isNoApiKey && ['bollywood','south','kdrama','toprated','upcoming'].includes(activeTab)) {
          if (!catalogData[activeTab] || catalogData[activeTab].length === 0) {
            fetchCatalog(activeTab, CATALOG_ENDPOINTS[activeTab], 1);
          }
        }
      }, [activeTab]);"""

src = src.replace(old_effect, new_effect)

# --- F. Replace currentList logic to include catalogs ---
old_currentlist = "      const currentList = activeTab === 'trending' ? trending : activeTab === 'movies' ? movies : activeTab === 'series' ? series : searchResults;"
new_currentlist = """      const currentList = activeTab === 'trending' ? trending
        : activeTab === 'movies' ? movies
        : activeTab === 'series' ? series
        : activeTab === 'search' ? searchResults
        : ['bollywood','south','kdrama','toprated','upcoming'].includes(activeTab) ? (catalogData[activeTab] || [])
        : [];"""

src = src.replace(old_currentlist, new_currentlist)

# --- G. Replace the tabs UI to add mode toggle + new catalog tabs ---
old_tabs_ui = """          {/* ── Tabs ── */}
          <div className="flex items-center gap-2 sm:gap-3 mb-6 overflow-x-auto scrollbar-hide pb-1">
            {([
              { key: 'trending', label: '🔥 Trending' },
              { key: 'movies', label: '🎬 Movies' },
              { key: 'series', label: '📺 Series' },
              { key: 'search', label: '🔍 Search' },
              { key: 'history', label: `🕐 History${watchHistory.length > 0 ? ` (${watchHistory.length})` : ''}` },
            ] as const).map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                className={cn('flex-shrink-0 px-4 py-2 rounded-xl font-bold text-sm transition-all',
                  activeTab === tab.key
                    ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700')}>
                {tab.label}
              </button>
            ))}
          </div>"""

new_tabs_ui = """          {/* ── Mode Toggle ── */}
          <div className="flex items-center gap-3 mb-4">
            <div className="flex bg-gray-800 rounded-xl p-1 border border-gray-700">
              <button onClick={() => { setMode('movies'); setActiveTab('trending'); }}
                className={cn('px-4 py-2 rounded-lg font-bold text-sm transition-all',
                  mode === 'movies' ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white shadow' : 'text-gray-400 hover:text-white')}>
                🎬 Movies & Series
              </button>
              <button onClick={() => setMode('anime')}
                className={cn('px-4 py-2 rounded-lg font-bold text-sm transition-all',
                  mode === 'anime' ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow' : 'text-gray-400 hover:text-white')}>
                🎌 Anime
              </button>
            </div>
          </div>

          {mode === 'anime' ? (
            <AnimeSection onGoHome={onGoHome} />
          ) : (<>

          {/* ── Tabs ── */}
          <div className="flex items-center gap-2 sm:gap-3 mb-6 overflow-x-auto scrollbar-hide pb-1">
            {([
              { key: 'trending', label: '🔥 Trending' },
              { key: 'movies', label: '🎬 Movies' },
              { key: 'series', label: '📺 Series' },
              { key: 'bollywood', label: '🎭 Bollywood' },
              { key: 'south', label: '🌴 South Indian' },
              { key: 'kdrama', label: '🇰🇷 K-Drama' },
              { key: 'toprated', label: '⭐ Top Rated' },
              { key: 'upcoming', label: '🗓️ Upcoming' },
              { key: 'search', label: '🔍 Search' },
              { key: 'history', label: `🕐 History${watchHistory.length > 0 ? ` (${watchHistory.length})` : ''}` },
            ] as const).map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
                className={cn('flex-shrink-0 px-4 py-2 rounded-xl font-bold text-sm transition-all',
                  activeTab === tab.key
                    ? 'bg-gradient-to-r from-orange-500 to-red-500 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700')}>
                {tab.label}
              </button>
            ))}
          </div>"""

src = src.replace(old_tabs_ui, new_tabs_ui)

# --- H. Close the movies mode conditional at the end of OnlineSection return ---
# Find the closing of the OnlineSection return and wrap it
old_online_close = """          {/* ── Empty search ── */}
          {activeTab === 'search' && !searchQuery && (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">🎬</div>
              <h3 className="text-xl font-bold mb-2" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>Search Millions of Titles</h3>
              <p className="text-gray-400">Movies, TV shows, documentaries and more</p>
            </div>
          )}"""

new_online_close = """          {/* ── Empty search ── */}
          {activeTab === 'search' && !searchQuery && (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">🎬</div>
              <h3 className="text-xl font-bold mb-2" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>Search Millions of Titles</h3>
              <p className="text-gray-400">Movies, TV shows, documentaries and more</p>
            </div>
          )}
          </>)}"""

src = src.replace(old_online_close, new_online_close)

# --- I. Fix load more button to handle catalog tabs ---
old_load_more = """          {/* ── Load More ── */}
          {(activeTab === 'movies' || activeTab === 'series') && hasMore && currentList.length > 0 && (
            <div className="flex justify-center mt-8">
              <button onClick={() => { const nextPage = page + 1; if (activeTab === 'movies') fetchMovies(nextPage); else fetchSeries(nextPage); }}
                disabled={isLoading} className="px-8 py-3 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl font-bold hover:from-orange-600 disabled:opacity-50 flex items-center gap-2">
                {isLoading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Loading...</> : '🎬 Load More'}
              </button>
            </div>
          )}"""

new_load_more = """          {/* ── Load More ── */}
          {(['movies','series','bollywood','south','kdrama','toprated','upcoming'].includes(activeTab)) && hasMore && currentList.length > 0 && (
            <div className="flex justify-center mt-8">
              <button onClick={() => {
                const next = page + 1;
                if (activeTab === 'movies') fetchMovies(next);
                else if (activeTab === 'series') fetchSeries(next);
                else fetchCatalog(activeTab, CATALOG_ENDPOINTS[activeTab], next);
              }}
                disabled={isLoading} className="px-8 py-3 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl font-bold hover:from-orange-600 disabled:opacity-50 flex items-center gap-2">
                {isLoading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Loading...</> : '🎬 Load More'}
              </button>
            </div>
          )}"""

src = src.replace(old_load_more, new_load_more)

with open(path, 'w') as f:
    f.write(src)

print(f"✅ Patch applied to {path}")
print("Changes made:")
print("  1. Added ANIME_PROVIDERS (VidZee, AnimePahe, MegaPlay)")
print("  2. Added AniList GraphQL types + fetch helper")
print("  3. Added full AnimeSection component")
print("  4. Added mode toggle (Movies & Series ↔ Anime) in OnlineSection")
print("  5. Added catalog tabs: Bollywood, South Indian, K-Drama, Top Rated, Upcoming")
print("  6. Trending/popular now biased to India (region=IN)")
print("  7. Load More works for all catalog tabs")
