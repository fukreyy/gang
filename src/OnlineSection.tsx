import { useState, useEffect, useRef } from 'react';
import {
  TMDBItem,
  TMDBDetails,
  TMDBSeason,
  TMDBEpisode,
  getTrending,
  getPopular,
  getTopRated,
  searchTMDB,
  getDetails,
  getSeasonEpisodes,
  tmdbImage,
  tmdbBackdrop,
  getVidSrcMovieUrl,
  getVidSrcTVUrl,
} from './tmdb';

// ── Icons ──────────────────────────────────────────────────────────────────────
const PlayIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M8 5v14l11-7z" />
  </svg>
);
const CloseIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);
const SearchIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);
const StarIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);
const ChevronLeftIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);
const ChevronRightIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);
const BackIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
  </svg>
);
const FullscreenIcon = () => (
  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
  </svg>
);

// ── Constants & Types ──────────────────────────────────────────────────────────
const VIDEO_SOURCES = [
  {
    name: 'VidSrc',
    emoji: '⚡',
    getMovieUrl: (id: number) => getVidSrcMovieUrl(id.toString()),
    getTvUrl: (id: number, season: number, episode: number) => getVidSrcTVUrl(id.toString(), season, episode),
  },
  // You can add additional fallback sources here if needed
];

type TabType = 'trending' | 'movies' | 'series' | 'search';
type FilterType = 'all' | 'movie' | 'tv';

// ── Main Component ─────────────────────────────────────────────────────────────
export default function OnlineSection() {
  const [activeTab, setActiveTab] = useState<TabType>('trending');
  const [filter, setFilter] = useState<FilterType>('all');
  const [trending, setTrending] = useState<TMDBItem[]>([]);
  const [popularMovies, setPopularMovies] = useState<TMDBItem[]>([]);
  const [popularSeries, setPopularSeries] = useState<TMDBItem[]>([]);
  const [topMovies, setTopMovies] = useState<TMDBItem[]>([]);
  const [topSeries, setTopSeries] = useState<TMDBItem[]>([]);
  const [searchResults, setSearchResults] = useState<TMDBItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedItem, setSelectedItem] = useState<TMDBItem | null>(null);
  const [details, setDetails] = useState<TMDBDetails | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const [playerUrl, setPlayerUrl] = useState('');
  const [playerTitle, setPlayerTitle] = useState('');
  const [heroIndex, setHeroIndex] = useState(0);

  // Player state
  const [playerTmdbId, setPlayerTmdbId] = useState<number>(0);
  const [playerMediaType, setPlayerMediaType] = useState<'movie' | 'tv'>('movie');
  const [playerSeason, setPlayerSeason] = useState<number>(1);
  const [playerEpisode, setPlayerEpisode] = useState<number>(1);

  // Series state
  const [selectedSeason, setSelectedSeason] = useState(1);
  const [episodes, setEpisodes] = useState<TMDBEpisode[]>([]);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();

  // Load initial data
  useEffect(() => {
    loadAll();
  }, []);

  // Auto-rotate hero
  useEffect(() => {
    if (trending.length === 0) return;
    const t = setInterval(() => {
      setHeroIndex((prev) => (prev + 1) % Math.min(trending.length, 8));
    }, 6000);
    return () => clearInterval(t);
  }, [trending.length]);

  // Load episodes when season changes
  useEffect(() => {
    if (selectedItem && getMediaType(selectedItem) === 'tv' && details) {
      loadEpisodes(selectedItem.id, selectedSeason);
    }
  }, [selectedSeason, selectedItem]);

  async function loadAll() {
    setIsLoading(true);
    try {
      const [t, pm, ps, tm, ts] = await Promise.all([
        getTrending('all', 'week'),
        getPopular('movie'),
        getPopular('tv'),
        getTopRated('movie'),
        getTopRated('tv'),
      ]);
      setTrending(t);
      setPopularMovies(pm);
      setPopularSeries(ps);
      setTopMovies(tm);
      setTopSeries(ts);
      setHeroIndex(Math.floor(Math.random() * Math.min(t.length, 8)));
    } catch (err) {
      console.error('Failed to load TMDB data:', err);
    }
    setIsLoading(false);
  }

  async function handleSearch(q: string) {
    setSearchQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const results = await searchTMDB(q);
        setSearchResults(results);
      } catch (err) {
        console.error(err);
      }
      setIsSearching(false);
    }, 400);
  }

  async function handleItemClick(item: TMDBItem) {
    setSelectedItem(item);
    setIsLoadingDetails(true);
    setDetails(null);
    setEpisodes([]);
    setSelectedSeason(1);
    try {
      const type = getMediaType(item);
      const d = await getDetails(item.id, type);
      setDetails(d);
      if (type === 'tv') {
        await loadEpisodes(item.id, 1);
      }
    } catch (err) {
      console.error(err);
    }
    setIsLoadingDetails(false);
  }

  async function loadEpisodes(seriesId: number, season: number) {
    setIsLoadingEpisodes(true);
    try {
      const eps = await getSeasonEpisodes(seriesId, season);
      setEpisodes(eps || []);
    } catch (err) {
      console.error(err);
      setEpisodes([]);
    }
    setIsLoadingEpisodes(false);
  }

  function playMovie(item: TMDBItem) {
    const url = VIDEO_SOURCES[0].getMovieUrl(item.id);
    setPlayerUrl(url);
    setPlayerTitle(item.title || item.name || '');
    setPlayerTmdbId(item.id);
    setPlayerMediaType('movie');
    setShowPlayer(true);
  }

  function playEpisode(seriesId: number, season: number, episode: number, title: string) {
    const url = VIDEO_SOURCES[0].getTvUrl(seriesId, season, episode);
    setPlayerUrl(url);
    setPlayerTitle(title);
    setPlayerTmdbId(seriesId);
    setPlayerMediaType('tv');
    setPlayerSeason(season);
    setPlayerEpisode(episode);
    setShowPlayer(true);
  }

  function getMediaType(item: TMDBItem): 'movie' | 'tv' {
    if (item.media_type) return item.media_type === 'movie' ? 'movie' : 'tv';
    if (item.title) return 'movie';
    return 'tv';
  }

  function getTitle(item: TMDBItem) {
    return item.title || item.name || 'Unknown';
  }

  function getYear(item: TMDBItem) {
    const date = item.release_date || item.first_air_date || '';
    return date.split('-')[0] || '';
  }

  function formatRating(r: number) {
    return r ? r.toFixed(1) : 'N/A';
  }

  const heroItem = trending[heroIndex];

  // ── Tabs ──
  const tabs: { id: TabType; label: string; emoji: string }[] = [
    { id: 'trending', label: 'Trending', emoji: '🔥' },
    { id: 'movies', label: 'Movies', emoji: '🎥' },
    { id: 'series', label: 'Series', emoji: '📺' },
    { id: 'search', label: 'Search', emoji: '🔍' },
  ];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400">Loading online content...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      {/* ── Hero ── */}
      {heroItem && activeTab === 'trending' && !selectedItem && (
        <div className="relative h-[55vh] sm:h-[75vh] overflow-hidden">
          <div
            className="absolute inset-0 bg-cover bg-center transition-all duration-1000"
            style={{ backgroundImage: `url(${tmdbBackdrop(heroItem.backdrop_path)})` }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-gray-950 via-gray-950/70 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-transparent to-gray-950/30" />
          </div>
          <div className="relative z-10 h-full flex items-center px-4 sm:px-12">
            <div className="max-w-xl">
              <div className="flex items-center gap-2 mb-3">
                <span className="px-3 py-1 bg-purple-600 rounded-full text-xs font-bold uppercase tracking-wide">
                  {heroItem.media_type === 'movie' ? '🎬 Movie' : '📺 Series'}
                </span>
                <span className="flex items-center gap-1 text-yellow-400 text-sm font-bold">
                  <StarIcon /> {formatRating(heroItem.vote_average)}
                </span>
              </div>
              <h1
                className="text-3xl sm:text-5xl font-black mb-3 leading-tight"
                style={{
                  fontFamily: "'Comic Sans MS', cursive",
                  background: 'linear-gradient(135deg, #a855f7, #ec4899)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {getTitle(heroItem)}
              </h1>
              <p className="text-gray-300 text-sm sm:text-base mb-6 line-clamp-3">{heroItem.overview}</p>
              <div className="flex gap-3 flex-wrap">
                <button
                  onClick={() => (heroItem.media_type === 'movie' ? playMovie(heroItem) : handleItemClick(heroItem))}
                  className="px-6 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl font-bold flex items-center gap-2 hover:from-purple-700 transition-all"
                >
                  <PlayIcon />
                  {heroItem.media_type === 'movie' ? 'Watch Now' : 'View Episodes'}
                </button>
                <button
                  onClick={() => handleItemClick(heroItem)}
                  className="px-6 py-3 bg-gray-800/80 backdrop-blur-sm rounded-xl font-bold hover:bg-gray-700 transition-all"
                >
                  More Info
                </button>
              </div>
            </div>
          </div>
          {/* Hero dots */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2 z-20">
            {trending.slice(0, 8).map((_, i) => (
              <button
                key={i}
                onClick={() => setHeroIndex(i)}
                className={`h-1.5 rounded-full transition-all ${
                  i === heroIndex ? 'w-6 bg-purple-500' : 'w-1.5 bg-white/40'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Tabs ── */}
      {!selectedItem && (
        <div className="px-4 sm:px-12 mt-6">
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex-shrink-0 px-5 py-2.5 rounded-xl font-bold text-sm transition-all ${
                  activeTab === tab.id
                    ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                }`}
              >
                {tab.emoji} {tab.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Content ── */}
      <div className="px-4 sm:px-12 py-6">
        {/* Detail View */}
        {selectedItem ? (
          <DetailView
            item={selectedItem}
            details={details}
            isLoading={isLoadingDetails}
            episodes={episodes}
            isLoadingEpisodes={isLoadingEpisodes}
            selectedSeason={selectedSeason}
            onSeasonChange={setSelectedSeason}
            onBack={() => {
              setSelectedItem(null);
              setDetails(null);
            }}
            onPlayMovie={() => playMovie(selectedItem)}
            onPlayEpisode={(season, ep, title) => playEpisode(selectedItem.id, season, ep, title)}
            getMediaType={getMediaType}
          />
        ) : (
          <>
            {/* Trending */}
            {activeTab === 'trending' && (
              <div className="space-y-10">
                <ContentRow
                  title="🔥 Trending This Week"
                  items={trending.filter(
                    (i) =>
                      filter === 'all' ||
                      (filter === 'movie' ? i.media_type === 'movie' : i.media_type === 'tv')
                  )}
                  onItemClick={handleItemClick}
                  onPlayClick={(item) => (getMediaType(item) === 'movie' ? playMovie(item) : handleItemClick(item))}
                  getMediaType={getMediaType}
                  getTitle={getTitle}
                  getYear={getYear}
                />
                <ContentRow
                  title="🎬 Popular Movies"
                  items={popularMovies}
                  onItemClick={handleItemClick}
                  onPlayClick={(item) => playMovie(item)}
                  getMediaType={() => 'movie'}
                  getTitle={getTitle}
                  getYear={getYear}
                />
                <ContentRow
                  title="📺 Popular Series"
                  items={popularSeries}
                  onItemClick={handleItemClick}
                  onPlayClick={(item) => handleItemClick(item)}
                  getMediaType={() => 'tv'}
                  getTitle={getTitle}
                  getYear={getYear}
                />
              </div>
            )}

            {/* Movies */}
            {activeTab === 'movies' && (
              <div className="space-y-10">
                <ContentRow
                  title="🎬 Popular Movies"
                  items={popularMovies}
                  onItemClick={handleItemClick}
                  onPlayClick={playMovie}
                  getMediaType={() => 'movie'}
                  getTitle={getTitle}
                  getYear={getYear}
                />
                <ContentRow
                  title="⭐ Top Rated Movies"
                  items={topMovies}
                  onItemClick={handleItemClick}
                  onPlayClick={playMovie}
                  getMediaType={() => 'movie'}
                  getTitle={getTitle}
                  getYear={getYear}
                />
              </div>
            )}

            {/* Series */}
            {activeTab === 'series' && (
              <div className="space-y-10">
                <ContentRow
                  title="📺 Popular Series"
                  items={popularSeries}
                  onItemClick={handleItemClick}
                  onPlayClick={handleItemClick}
                  getMediaType={() => 'tv'}
                  getTitle={getTitle}
                  getYear={getYear}
                />
                <ContentRow
                  title="⭐ Top Rated Series"
                  items={topSeries}
                  onItemClick={handleItemClick}
                  onPlayClick={handleItemClick}
                  getMediaType={() => 'tv'}
                  getTitle={getTitle}
                  getYear={getYear}
                />
              </div>
            )}

            {/* Search */}
            {activeTab === 'search' && (
              <div>
                <div className="relative max-w-xl mb-8">
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => handleSearch(e.target.value)}
                    placeholder="Search movies & series..."
                    autoFocus
                    className="w-full px-5 py-4 pl-12 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:border-purple-500 text-white text-lg"
                  />
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400">
                    <SearchIcon />
                  </div>
                  {searchQuery && (
                    <button
                      onClick={() => {
                        setSearchQuery('');
                        setSearchResults([]);
                      }}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                    >
                      <CloseIcon />
                    </button>
                  )}
                </div>

                {isSearching && (
                  <div className="flex items-center gap-3 text-gray-400 mb-6">
                    <div className="w-5 h-5 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                    Searching...
                  </div>
                )}

                {searchResults.length > 0 && (
                  <div>
                    <p className="text-gray-400 mb-4">
                      Found <span className="text-white font-bold">{searchResults.length}</span> results for "
                      {searchQuery}"
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                      {searchResults.map((item) => (
                        <GridCard
                          key={`${item.id}-${item.media_type}`}
                          item={item}
                          onItemClick={handleItemClick}
                          onPlayClick={(i) => (getMediaType(i) === 'movie' ? playMovie(i) : handleItemClick(i))}
                          getMediaType={getMediaType}
                          getTitle={getTitle}
                          getYear={getYear}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {!isSearching && searchQuery && searchResults.length === 0 && (
                  <div className="text-center py-16 text-gray-400">
                    <div className="text-6xl mb-4">🔍</div>
                    <p className="text-xl">No results found for "{searchQuery}"</p>
                  </div>
                )}

                {!searchQuery && (
                  <div className="text-center py-16 text-gray-400">
                    <div className="text-6xl mb-4">🎬</div>
                    <p className="text-xl">Search for any movie or series</p>
                    <p className="text-sm mt-2">Powered by TMDB</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Video Player Modal ── */}
      {showPlayer && (
        <PlayerModal
          url={playerUrl}
          title={playerTitle}
          onClose={() => setShowPlayer(false)}
          iframeRef={iframeRef}
          tmdbId={playerTmdbId}
          mediaType={playerMediaType}
          season={playerSeason}
          episode={playerEpisode}
        />
      )}
    </div>
  );
}

// ── Content Row ───────────────────────────────────────────────────────────────
function ContentRow({
  title,
  items,
  onItemClick,
  onPlayClick,
  getMediaType,
  getTitle,
  getYear,
}: {
  title: string;
  items: TMDBItem[];
  onItemClick: (item: TMDBItem) => void;
  onPlayClick: (item: TMDBItem) => void;
  getMediaType: (item: TMDBItem) => 'movie' | 'tv';
  getTitle: (item: TMDBItem) => string;
  getYear: (item: TMDBItem) => string;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const scroll = (dir: number) => rowRef.current?.scrollBy({ left: dir * 260, behavior: 'smooth' });

  return (
    <div>
      <h2 className="text-xl sm:text-2xl font-bold mb-4" style={{ fontFamily: "'Comic Sans MS', cursive" }}>
        {title}
      </h2>
      <div className="relative group">
        <button
          onClick={() => scroll(-1)}
          className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-gray-900/90 rounded-full items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-purple-600"
        >
          <ChevronLeftIcon />
        </button>
        <div
          ref={rowRef}
          className="flex gap-3 sm:gap-4 overflow-x-auto pb-2"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {items.map((item) => (
            <RowCard
              key={`${item.id}-${item.media_type || ''}`}
              item={item}
              onItemClick={onItemClick}
              onPlayClick={onPlayClick}
              getMediaType={getMediaType}
              getTitle={getTitle}
              getYear={getYear}
            />
          ))}
        </div>
        <button
          onClick={() => scroll(1)}
          className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 z-10 w-10 h-10 bg-gray-900/90 rounded-full items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-purple-600"
        >
          <ChevronRightIcon />
        </button>
      </div>
    </div>
  );
}

// ── Row Card ──────────────────────────────────────────────────────────────────
function RowCard({
  item,
  onItemClick,
  onPlayClick,
  getMediaType,
  getTitle,
  getYear,
}: {
  item: TMDBItem;
  onItemClick: (item: TMDBItem) => void;
  onPlayClick: (item: TMDBItem) => void;
  getMediaType: (item: TMDBItem) => 'movie' | 'tv';
  getTitle: (item: TMDBItem) => string;
  getYear: (item: TMDBItem) => string;
}) {
  const type = getMediaType(item);
  return (
    <div className="flex-shrink-0 w-32 sm:w-44 group relative cursor-pointer" onClick={() => onItemClick(item)}>
      <div className="relative rounded-xl overflow-hidden aspect-[2/3]">
        <img
          src={tmdbImage(item.poster_path)}
          alt={getTitle(item)}
          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
          loading="lazy"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* Type badge */}
        <div
          className={`absolute top-2 left-2 px-2 py-0.5 rounded text-[10px] font-bold ${
            type === 'movie' ? 'bg-orange-500/90' : 'bg-blue-500/90'
          }`}
        >
          {type === 'movie' ? '🎬' : '📺'}
        </div>

        {/* Rating */}
        {item.vote_average > 0 && (
          <div className="absolute top-2 right-2 flex items-center gap-0.5 bg-black/70 px-2 py-0.5 rounded text-[10px] text-yellow-400 font-bold">
            <StarIcon /> {item.vote_average.toFixed(1)}
          </div>
        )}

        {/* Play button on hover */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlayClick(item);
          }}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg font-bold text-xs flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap hover:from-purple-700"
        >
          <PlayIcon /> {type === 'movie' ? 'Watch' : 'Episodes'}
        </button>
      </div>
      <div className="mt-2 px-1">
        <p className="font-semibold text-xs sm:text-sm truncate">{getTitle(item)}</p>
        <p className="text-xs text-gray-500">{getYear(item)}</p>
      </div>
    </div>
  );
}

// ── Grid Card (for search) ────────────────────────────────────────────────────
function GridCard({
  item,
  onItemClick,
  onPlayClick,
  getMediaType,
  getTitle,
  getYear,
}: {
  item: TMDBItem;
  onItemClick: (item: TMDBItem) => void;
  onPlayClick: (item: TMDBItem) => void;
  getMediaType: (item: TMDBItem) => 'movie' | 'tv';
  getTitle: (item: TMDBItem) => string;
  getYear: (item: TMDBItem) => string;
}) {
  return (
    <RowCard
      item={item}
      onItemClick={onItemClick}
      onPlayClick={onPlayClick}
      getMediaType={getMediaType}
      getTitle={getTitle}
      getYear={getYear}
    />
  );
}

// ── Detail View ───────────────────────────────────────────────────────────────
function DetailView({
  item,
  details,
  isLoading,
  episodes,
  isLoadingEpisodes,
  selectedSeason,
  onSeasonChange,
  onBack,
  onPlayMovie,
  onPlayEpisode,
  getMediaType,
}: {
  item: TMDBItem;
  details: TMDBDetails | null;
  isLoading: boolean;
  episodes: TMDBEpisode[];
  isLoadingEpisodes: boolean;
  selectedSeason: number;
  onSeasonChange: (s: number) => void;
  onBack: () => void;
  onPlayMovie: () => void;
  onPlayEpisode: (season: number, episode: number, title: string) => void;
  getMediaType: (item: TMDBItem) => 'movie' | 'tv';
}) {
  const type = getMediaType(item);
  const title = item.title || item.name || '';
  const backdrop = details?.backdrop_path || item.backdrop_path;
  const poster = details?.poster_path || item.poster_path;

  return (
    <div>
      <button onClick={onBack} className="flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors group">
        <BackIcon />
        <span className="group-hover:underline">Back</span>
      </button>

      {isLoading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-12 h-12 border-4 border-purple-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div>
          {/* Backdrop */}
          <div className="relative h-48 sm:h-72 rounded-2xl overflow-hidden mb-6">
            {backdrop && (
              <img src={`https://image.tmdb.org/t/p/w1280${backdrop}`} alt={title} className="w-full h-full object-cover" />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/40 to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 flex items-end gap-4">
              {poster && (
                <img
                  src={tmdbImage(poster)}
                  alt={title}
                  className="w-20 sm:w-28 rounded-xl shadow-2xl flex-shrink-0 border-2 border-gray-800"
                />
              )}
              <div className="min-w-0 pb-1">
                <h1
                  className="text-2xl sm:text-4xl font-black leading-tight truncate"
                  style={{ fontFamily: "'Comic Sans MS', cursive" }}
                >
                  {title}
                </h1>
                <div className="flex items-center gap-3 mt-1 flex-wrap text-sm text-gray-300">
                  {details?.vote_average && (
                    <span className="flex items-center gap-1 text-yellow-400 font-bold">
                      <StarIcon /> {details.vote_average.toFixed(1)}
                    </span>
                  )}
                  {(details?.release_date || details?.first_air_date) && (
                    <span>{(details.release_date || details.first_air_date || '').split('-')[0]}</span>
                  )}
                  {details?.runtime && <span>{details.runtime}min</span>}
                  {details?.number_of_seasons && (
                    <span>
                      {details.number_of_seasons} Season{details.number_of_seasons > 1 ? 's' : ''}
                    </span>
                  )}
                  {details?.original_language && (
                    <span className="uppercase px-2 py-0.5 bg-gray-700 rounded text-xs">{details.original_language}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Actions */}
              <div className="flex gap-3 flex-wrap">
                {type === 'movie' ? (
                  <button
                    onClick={onPlayMovie}
                    className="px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl font-bold flex items-center gap-2 hover:from-purple-700 transition-all"
                  >
                    <PlayIcon /> Watch Now
                  </button>
                ) : (
                  <div className="flex items-center gap-2 text-gray-400 bg-gray-800 px-4 py-3 rounded-xl">
                    <span>📺 Select episode below to watch</span>
                  </div>
                )}
              </div>

              {/* Overview */}
              {details?.overview && (
                <div>
                  <h3 className="font-bold text-lg mb-2">Overview</h3>
                  <p className="text-gray-300 leading-relaxed">{details.overview}</p>
                </div>
              )}

              {/* Genres */}
              {details?.genres && details.genres.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {details.genres.map((g) => (
                    <span key={g.id} className="px-3 py-1 bg-purple-500/20 border border-purple-500/30 rounded-full text-sm">
                      {g.name}
                    </span>
                  ))}
                </div>
              )}

              {/* Episodes for series */}
              {type === 'tv' && details && (
                <div>
                  <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                    <h3 className="font-bold text-lg">Episodes</h3>
                    {/* Season selector */}
                    {details.seasons && details.seasons.length > 0 && (
                      <div className="flex gap-2 flex-wrap">
                        {details.seasons
                          .filter((s) => s.season_number > 0)
                          .map((s) => (
                            <button
                              key={s.season_number}
                              onClick={() => onSeasonChange(s.season_number)}
                              className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
                                selectedSeason === s.season_number
                                  ? 'bg-purple-600 text-white'
                                  : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                              }`}
                            >
                              S{s.season_number}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>

                  {isLoadingEpisodes ? (
                    <div className="flex items-center gap-3 text-gray-400 py-8">
                      <div className="w-6 h-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
                      Loading episodes...
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
                      {episodes.map((ep) => (
                        <button
                          key={ep.episode_number}
                          onClick={() =>
                            onPlayEpisode(
                              ep.season_number,
                              ep.episode_number,
                              `${title} S${ep.season_number}E${ep.episode_number}: ${ep.name}`
                            )
                          }
                          className="w-full flex items-center gap-3 p-3 bg-gray-800 hover:bg-gray-700 rounded-xl transition-colors text-left group"
                        >
                          {ep.still_path ? (
                            <img
                              src={`https://image.tmdb.org/t/p/w300${ep.still_path}`}
                              alt={ep.name}
                              className="w-24 h-14 object-cover rounded-lg flex-shrink-0"
                            />
                          ) : (
                            <div className="w-24 h-14 bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0 text-gray-500">
                              <PlayIcon />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-purple-400 font-bold">
                              S{ep.season_number}E{ep.episode_number}
                            </p>
                            <p className="font-semibold truncate text-sm">{ep.name}</p>
                            {ep.overview && <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">{ep.overview}</p>}
                            {ep.runtime && <p className="text-xs text-gray-500 mt-0.5">{ep.runtime}min</p>}
                          </div>
                          <div className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center">
                              <PlayIcon />
                            </div>
                          </div>
                        </button>
                      ))}
                      {episodes.length === 0 && !isLoadingEpisodes && (
                        <p className="text-gray-400 text-center py-8">No episodes found for this season.</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right sidebar */}
            <div className="space-y-4">
              {details?.tagline && (
                <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700">
                  <p className="text-gray-400 text-sm italic">"{details.tagline}"</p>
                </div>
              )}
              <div className="p-4 bg-gray-800/50 rounded-xl border border-gray-700 space-y-3 text-sm">
                <h4 className="font-bold text-gray-300">Details</h4>
                {details?.status && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Status</span>
                    <span className="text-white">{details.status}</span>
                  </div>
                )}
                {details?.original_language && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Language</span>
                    <span className="text-white uppercase">{details.original_language}</span>
                  </div>
                )}
                {type === 'tv' && details?.number_of_episodes && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Episodes</span>
                    <span className="text-white">{details.number_of_episodes}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-gray-500">Type</span>
                  <span className="text-white">{type === 'movie' ? '🎬 Movie' : '📺 Series'}</span>
                </div>
              </div>

              {/* TMDB attribution */}
              <div className="p-3 bg-gray-800/30 rounded-xl border border-gray-700/50 text-center">
                <p className="text-xs text-gray-500">Data from</p>
                <p className="text-sm font-bold text-gray-300">🎬 TMDB</p>
                <p className="text-xs text-gray-500 mt-1">Streams via VidSrc</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Player Modal ──────────────────────────────────────────────────────────────
function PlayerModal({
  url,
  title,
  onClose,
  iframeRef,
  tmdbId,
  mediaType,
  season,
  episode,
}: {
  url: string;
  title: string;
  onClose: () => void;
  iframeRef: React.RefObject<HTMLIFrameElement>;
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentSourceIndex, setCurrentSourceIndex] = useState(0);
  const [currentUrl, setCurrentUrl] = useState(url);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Build URL for any source
  const buildUrl = (sourceIndex: number) => {
    const source = VIDEO_SOURCES[sourceIndex];
    if (mediaType === 'movie') {
      return source.getMovieUrl(tmdbId);
    }
    return source.getTvUrl(tmdbId, season || 1, episode || 1);
  };

  const switchSource = (index: number) => {
    setCurrentSourceIndex(index);
    setCurrentUrl(buildUrl(index));
    setIsLoading(true);
    setLoadError(false);
  };

  const handleIframeLoad = () => {
    setIsLoading(false);
    setLoadError(false);
  };

  const handleIframeError = () => {
    setIsLoading(false);
    setLoadError(true);
  };

  const tryNextSource = () => {
    const next = (currentSourceIndex + 1) % VIDEO_SOURCES.length;
    switchSource(next);
  };

  const toggleFullscreen = async () => {
    if (!containerRef.current) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await containerRef.current.requestFullscreen();
        if (screen.orientation && (screen.orientation as any).lock) {
          try {
            await (screen.orientation as any).lock('landscape');
          } catch (e) {
            // Ignore lock failure
          }
        }
      }
    } catch (e) {
      console.log('Fullscreen error:', e);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Auto-set loading timeout (iframes don't always fire onLoad)
  useEffect(() => {
    setIsLoading(true);
    setLoadError(false);
    const timer = setTimeout(() => setIsLoading(false), 4000);
    return () => clearTimeout(timer);
  }, [currentUrl]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-black">
      {/* ── Top Bar ── */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800">
        {/* Title */}
        <p className="font-bold text-sm truncate max-w-[40%] text-white">🎬 {title}</p>

        {/* Source Switcher */}
        <div className="relative flex-1 mx-3">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide">
            {VIDEO_SOURCES.map((source, index) => (
              <button
                key={index}
                onClick={() => switchSource(index)}
                className={`flex-shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  currentSourceIndex === index
                    ? 'bg-purple-600 text-white scale-105 shadow-lg shadow-purple-500/30'
                    : 'bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-white'
                }`}
                title={`Switch to ${source.name}`}
              >
                <span>{source.emoji}</span>
                <span className="hidden sm:inline">{source.name}</span>
                {currentSourceIndex === index && <span className="hidden sm:inline">✓</span>}
              </button>
            ))}
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button
            onClick={toggleFullscreen}
            className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-gray-700 transition-colors"
            title="Fullscreen"
          >
            <FullscreenIcon />
          </button>
          <button
            onClick={onClose}
            className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-red-600 transition-colors"
            title="Close"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* ── Player Area ── */}
      <div ref={containerRef} className="flex-1 relative bg-black">
        {/* Loading Overlay */}
        {isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-950">
            <div className="w-14 h-14 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4" />
            <p className="text-white font-bold text-lg">{title}</p>
            <p className="text-gray-400 text-sm mt-1">
              Loading via {VIDEO_SOURCES[currentSourceIndex].emoji} {VIDEO_SOURCES[currentSourceIndex].name}...
            </p>
            <p className="text-gray-600 text-xs mt-3">If it doesn't load, try another source above</p>
          </div>
        )}

        {/* Error Overlay */}
        {loadError && !isLoading && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-950">
            <div className="text-6xl mb-4">😕</div>
            <p className="text-white font-bold text-xl mb-2">Source not working</p>
            <p className="text-gray-400 text-sm mb-6 text-center max-w-sm">
              {VIDEO_SOURCES[currentSourceIndex].name} isn't available right now. Try another source!
            </p>
            <button
              onClick={tryNextSource}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-xl font-bold transition-colors flex items-center gap-2"
            >
              ⚡ Try Next Source →
            </button>
            <div className="flex gap-2 mt-4 flex-wrap justify-center">
              {VIDEO_SOURCES.map((source, index) => (
                <button
                  key={index}
                  onClick={() => switchSource(index)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                    currentSourceIndex === index ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700'
                  }`}
                >
                  {source.emoji} {source.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* IFrame */}
        <iframe
          key={currentUrl}
          ref={iframeRef}
          src={currentUrl}
          className="w-full h-full border-0"
          allowFullScreen
          allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
          title={title}
          onLoad={handleIframeLoad}
          onError={handleIframeError}
          referrerPolicy="origin"
        />
      </div>

      {/* ── Bottom Hint ── */}
      <div className="flex-shrink-0 px-4 py-1.5 bg-gray-900/90 border-t border-gray-800 flex items-center justify-between">
        <p className="text-xs text-gray-500">
          🎬 Streaming via <span className="text-purple-400 font-bold">{VIDEO_SOURCES[currentSourceIndex].name}</span>
        </p>
        <p className="text-xs text-gray-600">Not working? Switch source above ↑</p>
      </div>
    </div>
  );
}
