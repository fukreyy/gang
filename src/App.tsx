import Hls from 'hls.js';
import { useState, useEffect, useRef, useMemo } from 'react';
    import { cn } from './utils/cn';
    import { uploadToCloudinary } from './cloudinary';
    import { supabase } from './supabase';

    // Types
    interface MediaItem {
      id: string;
      title: string;
      description: string;
      thumbnail: string;
      videoUrl: string;
      category: string;
      category_type?: 'movie' | 'series';
      year: string;
      duration: string;
      languages: string;
      genres: string[];
      rating: string;
      isNew?: boolean;
    }

    interface Episode {
      id: string;
      media_id: string;
      season_number: number;
      episode_number: number;
      title: string;
      description: string;
      video_url: string;
      thumbnail: string;
      duration: string;
    }

    interface TMDBMovie {
      id: number;
      title?: string;
      name?: string;
      poster_path: string;
      backdrop_path: string;
      overview: string;
      release_date?: string;
      first_air_date?: string;
      vote_average: number;
      media_type?: 'movie' | 'tv';
      genre_ids: number[];
    }

    interface TMDBGenre {
      id: number;
      name: string;
    }

    interface CategoryType {
      category_name: string;
      type: 'movie' | 'series';
    }

    interface NavItem {
      icon: React.ReactNode;
      label: string;
      adminOnly?: boolean;
    }

    // ─── Push Notification Types ──────────────────────────────────────────────────
    interface PushNotificationPayload {
      title: string;
      body: string;
      media_id?: string;
      thumbnail?: string;
    }

    const ADMIN_PASSWORD = import.meta.env.VITE_ADMIN_PASSWORD || 'admin123';
    const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
    const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

    // ─── TMDB Config ──────────────────────────────────────────────────────────────
    const TMDB_API_KEY = import.meta.env.VITE_TMDB_API_KEY || '';
    const TMDB_BASE = 'https://api.themoviedb.org/3';
    const TMDB_IMG = 'https://image.tmdb.org/t/p/w500';
    const TMDB_IMG_ORIG = 'https://image.tmdb.org/t/p/original';

    // ── VidSrc with v2/embed ──────────────────────────────────────────────────────
    const STREAM_PROVIDERS = [
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
    name: "SUB",
    getUrl: (anilistId: number, ep: number, _malId?: number | null) =>
      `https://megaplay.buzz/stream/ani/${anilistId}/${ep}/sub`,
  },
  {
    name: "DUB",
    getUrl: (anilistId: number, ep: number, _malId?: number | null) =>
      `https://megaplay.buzz/stream/ani/${anilistId}/${ep}/dub`,
  },
];
    const TMDB_GENRES: { [key: number]: string } = {
      28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy',
      80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family',
      14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music',
      9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 53: 'Thriller',
      10752: 'War', 37: 'Western', 10765: 'Sci-Fi & Fantasy',
      10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News',
      10764: 'Reality', 10766: 'Soap', 10767: 'Talk', 10768: 'War & Politics',
    };

    interface WatchHistoryEntry {
      item: TMDBMovie;
      season: number;
      episode: number;
      watchedAt: number;
      progress?: number;
    }

    const HISTORY_KEY = 'fukrey_watch_history';
    const MAX_HISTORY = 30;

    const WatchHistoryStore = {
      getAll(): WatchHistoryEntry[] {
        try {
          const raw = localStorage.getItem(HISTORY_KEY);
          return raw ? JSON.parse(raw) : [];
        } catch { return []; }
      },
      add(item: TMDBMovie, season: number, episode: number) {
        try {
          const all = this.getAll().filter(e => e.item.id !== item.id);
          const entry: WatchHistoryEntry = { item, season, episode, watchedAt: Date.now() };
          const updated = [entry, ...all].slice(0, MAX_HISTORY);
          localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
        } catch { }
      },
      getEntry(itemId: number): WatchHistoryEntry | null {
        return this.getAll().find(e => e.item.id === itemId) || null;
      },
      remove(itemId: number) {
        try {
          const updated = this.getAll().filter(e => e.item.id !== itemId);
          localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
        } catch { }
      },
      clear() {
        try { localStorage.removeItem(HISTORY_KEY); } catch { }
      },
    };

    // ─── Push Notification Helpers ────────────────────────────────────────────────
    function urlBase64ToUint8Array(base64String: string): Uint8Array {
      const padding = '='.repeat((4 - base64String.length % 4) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
      return outputArray;
    }

    async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
      if (!('serviceWorker' in navigator)) return null;
      try {
        const reg = await navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js');
        return reg;
      } catch (err) {
        console.error('SW registration failed:', err);
        return null;
      }
    }

    async function subscribeToPush(reg: ServiceWorkerRegistration): Promise<PushSubscription | null> {
      if (!VAPID_PUBLIC_KEY) { console.warn('No VAPID public key set'); return null; }
      try {
        const existing = await reg.pushManager.getSubscription();
        if (existing) return existing;
        const subscription = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
        return subscription;
      } catch (err) {
        console.error('Push subscribe failed:', err);
        return null;
      }
    }

    async function savePushSubscription(subscription: PushSubscription): Promise<boolean> {
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert({ subscription: subscription.toJSON() });
      return !error;
    }

    async function removePushSubscription(subscription: PushSubscription): Promise<void> {
      await subscription.unsubscribe();
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('subscription->>endpoint', subscription.endpoint);
    }

    // ─── SVG Icons ────────────────────────────────────────────────────────────────
    const HomeIcon = () => (
      <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 3L4 9v12h5v-7h6v7h5V9l-8-6z"/>
      </svg>
    );
    const SearchIcon = () => (
      <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/>
      </svg>
    );
    const OnlineIcon = () => (
      <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"/>
      </svg>
    );
    const UploadIcon = () => (
      <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"/>
      </svg>
    );
    const DeleteIcon = () => (
      <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
      </svg>
    );
    const EditIcon = () => (
      <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"/>
      </svg>
    );
    const PlayIcon = () => (
      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
        <path d="M8 5v14l11-7z"/>
      </svg>
    );
    const PlusIcon = () => (
      <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4"/>
      </svg>
    );
    const CloseIcon = () => (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
      </svg>
    );
    const ChevronRightIcon = () => (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/>
      </svg>
    );
    const ChevronLeftIcon = () => (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/>
      </svg>
    );
    const PauseIcon = () => (
      <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
        <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
      </svg>
    );
    const VolumeIcon = () => (
      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
      </svg>
    );
    const FullscreenIcon = () => (
      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/>
      </svg>
    );
    const LockIcon = () => (
      <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
      </svg>
    );
    const UnlockIcon = () => (
      <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"/>
      </svg>
    );
    const Skip10BackIcon = () => (
      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M11.99 5V1l-5 5 5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6h-2c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/>
        <text x="12" y="16" textAnchor="middle" fontSize="7" fill="currentColor" fontWeight="bold">10</text>
      </svg>
    );
    const Skip10ForwardIcon = () => (
      <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12.01 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8z"/>
        <text x="12" y="16" textAnchor="middle" fontSize="7" fill="currentColor" fontWeight="bold">10</text>
      </svg>
    );
    const SpeedIcon = () => (
      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/>
      </svg>
    );
    const BackIcon = () => (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18"/>
      </svg>
    );
    // ─── Bell Icon ────────────────────────────────────────────────────────────────
    const BellIcon = ({ active }: { active?: boolean }) => (
      <svg className="w-5 h-5 sm:w-6 sm:h-6" fill={active ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
      </svg>
    );
    // ─── Send Icon ────────────────────────────────────────────────────────────────
    const LiveTVIcon = () => (
      <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/>
      </svg>
    );
    const SendIcon = () => (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"/>
      </svg>
    );

    // ─── App ──────────────────────────────────────────────────────────────────────
    function App() {
      // 🛡️ Block pop-up ads from iframes
      useEffect(() => {
        const origOpen = window.open;
        window.open = function() { console.log("🚫 Popup blocked"); return null; } as typeof window.open;
        const blockExternal = (e: MouseEvent) => {
          const link = (e.target as HTMLElement)?.closest("a") as HTMLAnchorElement | null;
          if (link && link.href && !link.href.includes(location.hostname) && !link.href.startsWith("javascript:")) {
            e.preventDefault();
            e.stopImmediatePropagation();
            console.log("🚫 Blocked link:", link.href);
          }
        };
        document.addEventListener("click", blockExternal, true);
        document.addEventListener("auxclick", blockExternal, true);
        return () => {
          window.open = origOpen;
          document.removeEventListener("click", blockExternal, true);
          document.removeEventListener("auxclick", blockExternal, true);
        };
      }, []);


      const getInitialNav = () => {
        const hash = window.location.hash.replace('#', '').split('/')[0];
        const valid = ['home', 'search', 'online', 'live tv', 'upload', 'edit', 'delete'];
        return valid.includes(decodeURIComponent(hash)) ? decodeURIComponent(hash) : 'home';
      };
      const [activeNav, setActiveNav] = useState(getInitialNav);

      // back button effect moved below state declarations
      const [mediaItems, setMediaItems] = useState<MediaItem[]>([]);
      const [categoryTypes, setCategoryTypes] = useState<CategoryType[]>([]);
      const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
      const [showUploadModal, setShowUploadModal] = useState(false);
      const [showEditModal, setShowEditModal] = useState(false);
      const [editingMedia, setEditingMedia] = useState<MediaItem | null>(null);
      const [showVideoPlayer, setShowVideoPlayer] = useState(false);
      const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
      const [mediaToDelete, setMediaToDelete] = useState<string | null>(null);
      const [isLoading, setIsLoading] = useState(true);
      const [searchQuery, setSearchQuery] = useState('');
      const [showSearch, setShowSearch] = useState(false);
      const contentRowRef = useRef<HTMLDivElement>(null);
      const videoRef = useRef<HTMLVideoElement>(null);
      const hlsRef = useRef<Hls | null>(null);
      const toHlsUrl = (url: string) => {
        if (!url) return url;
        if (url.includes(".m3u8")) return url;
        if (url.includes("cloudinary.com") && url.includes("/video/upload/")) {
          return url.replace("/upload/", "/upload/sp_hd/").replace(/\.(mp4|webm|mkv|avi|mov)$/i, ".m3u8");
        }
        return url;
      };
      const [isPlaying, setIsPlaying] = useState(false);
      const [isVideoLoading, setIsVideoLoading] = useState(false);
      const [currentTime, setCurrentTime] = useState(0);
      const [duration, setDuration] = useState(0);
      const [volume, setVolume] = useState(1);
      const [playbackSpeed, setPlaybackSpeed] = useState(1);
      const [showSpeedMenu, setShowSpeedMenu] = useState(false);
      const [episodes, setEpisodes] = useState<Episode[]>([]);
      const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
      const [showEpisodeManager, setShowEpisodeManager] = useState(false);
      const [currentVideoSrc, setCurrentVideoSrc] = useState<string>('');
      const [isAdmin, setIsAdmin] = useState(false);
      const [showLoginModal, setShowLoginModal] = useState(false);

      // ─── Push Notification State ────────────────────────────────────────────────
      const [pushSupported, setPushSupported] = useState(false);
      const [pushSubscribed, setPushSubscribed] = useState(false);
      const [swRegistration, setSwRegistration] = useState<ServiceWorkerRegistration | null>(null);
      const [showNotifyModal, setShowNotifyModal] = useState(false);
      const [pushLoading, setPushLoading] = useState(false);
      const [pushStatusMsg, setPushStatusMsg] = useState('');
      useEffect(() => {
        document.title = 'Fukrey | Welcome';
        const lockOrientation = async () => {
          try {
            if (!showVideoPlayer && screen.orientation && (screen.orientation as any).lock) {
              await (screen.orientation as any).lock('portrait').catch(() => {});
            }
          } catch (_) {}
        };
        lockOrientation();
      }, [showVideoPlayer]);

      useEffect(() => {
        loadMediaFromSupabase();
        loadCategoryTypes();
        const adminSession = sessionStorage.getItem('fukrey_admin');
        if (adminSession === 'true') setIsAdmin(true);
        initPushNotifications();
      }, []);

      // ─── Init Push ──────────────────────────────────────────────────────────────
      const initPushNotifications = async () => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
          setPushSupported(false);
          return;
        }
        setPushSupported(true);
        const reg = await registerServiceWorker();
        if (reg) {
          setSwRegistration(reg);
          const existing = await reg.pushManager.getSubscription();
          setPushSubscribed(!!existing);
        }
      };

     const handleTogglePushSubscription = async () => {
  setPushLoading(true);
  setPushStatusMsg('');
  
  // Show error if SW not ready
  if (!swRegistration) {
    setPushStatusMsg('❌ Service worker not ready. Try refreshing the page.');
    setPushLoading(false);
    return;
  }

  try {
    if (pushSubscribed) {
      const existing = await swRegistration.pushManager.getSubscription();
      if (existing) {
        await removePushSubscription(existing);
        setPushSubscribed(false);
        setPushStatusMsg('🔕 Notifications disabled.');
      }
    } else {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushStatusMsg('❌ Permission denied. Enable notifications in browser settings.');
        setPushLoading(false);
        return;
      }
      
      // Check VAPID key
      if (!VAPID_PUBLIC_KEY) {
        setPushStatusMsg('❌ VAPID key missing. Add VITE_VAPID_PUBLIC_KEY to your .env file.');
        setPushLoading(false);
        return;
      }

      const sub = await subscribeToPush(swRegistration);
      if (sub) {
        await savePushSubscription(sub);
        setPushSubscribed(true);
        setPushStatusMsg('🔔 Notifications enabled!');
      } else {
        setPushStatusMsg('❌ Subscription failed. Check browser console for details.');
      }
    }
  } catch (err: any) {
    setPushStatusMsg('❌ Error: ' + err.message);
  }
  setPushLoading(false);
};

      useEffect(() => {
        if (selectedMedia) {
          const catType = getCategoryType(selectedMedia.category);
          if (catType === 'series') loadEpisodes(selectedMedia.id);
          else setEpisodes([]);
        }
      }, [selectedMedia, categoryTypes]);

      useEffect(() => {
        if (videoRef.current) videoRef.current.playbackRate = playbackSpeed;
      }, [playbackSpeed, currentVideoSrc]);
      useEffect(() => {
        const video = videoRef.current;
        if (!video || !currentVideoSrc) return;
        setIsVideoLoading(true);
        if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
        if (currentVideoSrc.includes(".m3u8") && Hls.isSupported()) {
          const hls = new Hls();
          hlsRef.current = hls;
          hls.loadSource(currentVideoSrc);
          hls.attachMedia(video);
          hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
        } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
          video.src = currentVideoSrc;
          video.play().catch(() => {});
        } else {
          video.src = currentVideoSrc;
          video.play().catch(() => {});
        }
        return () => { if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; } };
      }, [currentVideoSrc]);

      // ─── Back Button (SPA history) ──────────────────────────────────────────────
      useEffect(() => {
        const handlePopState = (e: PopStateEvent) => {
          const nav = e.state?.nav || 'home';
          if (showVideoPlayer) { setShowVideoPlayer(false); setIsPlaying(false); setCurrentEpisode(null); window.history.pushState({ nav }, '', '#' + encodeURIComponent(nav)); return; }
          if (showEpisodeManager) { setShowEpisodeManager(false); window.history.pushState({ nav: activeNav }, '', '#' + encodeURIComponent(activeNav)); return; }
          if (showUploadModal) { setShowUploadModal(false); window.history.pushState({ nav: activeNav }, '', '#' + encodeURIComponent(activeNav)); return; }
          if (showEditModal) { setShowEditModal(false); setEditingMedia(null); window.history.pushState({ nav: activeNav }, '', '#' + encodeURIComponent(activeNav)); return; }
          if (showDeleteConfirm) { setShowDeleteConfirm(false); window.history.pushState({ nav: activeNav }, '', '#' + encodeURIComponent(activeNav)); return; }
          if (showLoginModal) { setShowLoginModal(false); window.history.pushState({ nav: activeNav }, '', '#' + encodeURIComponent(activeNav)); return; }
          if (showNotifyModal) { setShowNotifyModal(false); window.history.pushState({ nav: activeNav }, '', '#' + encodeURIComponent(activeNav)); return; }
          if (selectedMedia) { setSelectedMedia(null); window.history.pushState({ nav: activeNav }, '', '#' + encodeURIComponent(activeNav)); return; }
          setNav(nav, false);
        };
        window.history.replaceState({ nav: activeNav }, '', '#' + (activeNav === 'home' ? '' : encodeURIComponent(activeNav)));
        window.addEventListener('popstate', handlePopState);
        return () => window.removeEventListener('popstate', handlePopState);
      }, [showVideoPlayer, selectedMedia, showUploadModal, showEditModal, showDeleteConfirm, showEpisodeManager, showLoginModal, showNotifyModal, activeNav]);

      useEffect(() => {
        if (!showVideoPlayer) return;
        const handleKeyDown = (e: KeyboardEvent) => {
          if (!videoRef.current) return;
          if ((e.target as HTMLElement).tagName === 'INPUT') return;
          switch (e.key) {
            case 'ArrowLeft': e.preventDefault(); skipBackward(); break;
            case 'ArrowRight': e.preventDefault(); skipForward(); break;
            case ' ': e.preventDefault(); handleVideoPlay(); break;
            case 'f': case 'F': toggleFullscreen(); break;
            case 'm': case 'M': if (videoRef.current) videoRef.current.muted = !videoRef.current.muted; break;
            case '>': e.preventDefault(); changeSpeed(1); break;
            case '<': e.preventDefault(); changeSpeed(-1); break;
          }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
      }, [showVideoPlayer, isPlaying, playbackSpeed]);

      async function loadCategoryTypes() {
        const { data, error } = await supabase.from('category_types').select('*');
        if (!error && data) setCategoryTypes(data);
      }

      async function loadEpisodes(mediaId: string) {
        const { data, error } = await supabase
          .from('episodes').select('*')
          .eq('media_id', parseInt(mediaId))
          .order('season_number', { ascending: true })
          .order('episode_number', { ascending: true });
        if (!error && data) {
          setEpisodes(data.map((ep: any) => ({
            id: ep.id.toString(), media_id: ep.media_id.toString(),
            season_number: ep.season_number, episode_number: ep.episode_number,
            title: ep.title, description: ep.description || '',
            video_url: ep.video_url || '', thumbnail: ep.thumbnail || '',
            duration: ep.duration || '',
          })));
        } else setEpisodes([]);
      }

      async function loadMediaFromSupabase() {
        setIsLoading(true);
        const { data, error } = await supabase.from('media').select('*').order('created_at', { ascending: false });
        if (!error && data) {
          setMediaItems(data.map((item: any) => ({
            id: item.id.toString(), title: item.title, description: item.description,
            thumbnail: item.thumbnail, videoUrl: item.videoUrl || '',
            category: item.category, year: item.year, duration: item.duration,
            languages: item.languages,
            genres: typeof item.genres === 'string' ? JSON.parse(item.genres || '[]') : (item.genres || []),
            rating: item.rating,
          })));
        }
        setIsLoading(false);
      }

      const getCategoryType = (categoryName: string): 'movie' | 'series' => {
        if (!categoryName) return 'movie';
        const cat = categoryTypes.find(c => c.category_name.toLowerCase().trim() === categoryName.toLowerCase().trim());
        return cat?.type || 'movie';
      };

      const saveCategoryType = async (categoryName: string, type: 'movie' | 'series') => {
        const { error } = await supabase.from('category_types').upsert({ category_name: categoryName, type }).select();
        if (!error) await loadCategoryTypes();
      };

      const handleAdminLogin = (password: string): boolean => {
        if (password === ADMIN_PASSWORD) {
          setIsAdmin(true);
          sessionStorage.setItem('fukrey_admin', 'true');
          setShowLoginModal(false);
          return true;
        }
        return false;
      };

      const handleAdminLogout = () => {
        if (window.confirm('Logout from admin?')) {
          setIsAdmin(false);
          sessionStorage.removeItem('fukrey_admin');
          setActiveNav('home');
        }
      };

      const handleUpload = async (newMedia: MediaItem, categoryType: 'movie' | 'series') => {
        if (!isAdmin) { alert('🔒 Admin access required'); return; }
        await saveCategoryType(newMedia.category, categoryType);
        const { data, error } = await supabase.from('media').insert({
          title: newMedia.title, description: newMedia.description,
          thumbnail: newMedia.thumbnail, videoUrl: newMedia.videoUrl,
          category: newMedia.category, year: newMedia.year,
          duration: newMedia.duration, languages: newMedia.languages,
          genres: JSON.stringify(newMedia.genres), rating: newMedia.rating,
        }).select().single();
        if (error) { alert('Failed to save: ' + error.message); return; }
        const savedItem: MediaItem = { ...newMedia, id: data.id.toString(), isNew: true };
        setMediaItems(prev => [savedItem, ...prev]);
        setShowUploadModal(false);
        if (categoryType === 'series') {
          setSelectedMedia(savedItem);
          setEpisodes([]);
          setTimeout(() => setShowEpisodeManager(true), 100);
        }
      };

      const handleEdit = async (updatedMedia: MediaItem) => {
        if (!isAdmin) { alert('🔒 Admin access required'); return; }
        const { error } = await supabase.from('media').update({
          title: updatedMedia.title, description: updatedMedia.description,
          thumbnail: updatedMedia.thumbnail, videoUrl: updatedMedia.videoUrl,
          category: updatedMedia.category, year: updatedMedia.year,
          duration: updatedMedia.duration, languages: updatedMedia.languages,
          genres: JSON.stringify(updatedMedia.genres), rating: updatedMedia.rating,
        }).eq('id', parseInt(updatedMedia.id));
        if (error) { alert('Failed: ' + error.message); return; }
        setMediaItems(prev => prev.map(item => item.id === updatedMedia.id ? updatedMedia : item));
        setShowEditModal(false);
        setEditingMedia(null);
        if (selectedMedia?.id === updatedMedia.id) setSelectedMedia(updatedMedia);
      };

      const handleDelete = async (id: string) => {
        if (!isAdmin) { alert('🔒 Admin access required'); return; }
        const { error } = await supabase.from('media').delete().eq('id', parseInt(id));
        if (error) { alert('Failed: ' + error.message); return; }
        setMediaItems(prev => prev.filter(item => item.id !== id));
        setShowDeleteConfirm(false);
        setMediaToDelete(null);
        if (selectedMedia?.id === id) setSelectedMedia(null);
      };

      const handleDeleteCategory = async (category: string) => {
        if (!isAdmin) { alert('🔒 Admin access required'); return; }
        const itemsInCategory = mediaItems.filter(item => item.category === category);
        if (itemsInCategory.length === 0) {
          await supabase.from('category_types').delete().eq('category_name', category);
          await loadCategoryTypes();
          return;
        }
        if (!window.confirm(`⚠️ Delete category "${category}"?\n\nThis will permanently delete ${itemsInCategory.length} media item(s)!`)) return;
        const { error } = await supabase.from('media').delete().eq('category', category);
        if (error) { alert('Failed: ' + error.message); return; }
        await supabase.from('category_types').delete().eq('category_name', category);
        setMediaItems(prev => prev.filter(item => item.category !== category));
        await loadCategoryTypes();
      };

      const confirmDelete = (id: string) => {
        if (!isAdmin) { setShowLoginModal(true); return; }
        setMediaToDelete(id);
        setShowDeleteConfirm(true);
      };

      const openEdit = (item: MediaItem) => {
        if (!isAdmin) { setShowLoginModal(true); return; }
        setEditingMedia(item);
        setShowEditModal(true);
      };

      const navItems: NavItem[] = useMemo(() => {
        const items: NavItem[] = [
          { icon: <HomeIcon />, label: 'Home' },
          { icon: <SearchIcon />, label: 'Search' },
          { icon: <OnlineIcon />, label: 'Online' },
          { icon: <LiveTVIcon />, label: 'Live TV' },
        ];
        if (isAdmin) {
          items.push({ icon: <UploadIcon />, label: 'Upload', adminOnly: true });
          items.push({ icon: <EditIcon />, label: 'Edit', adminOnly: true });
          items.push({ icon: <DeleteIcon />, label: 'Delete', adminOnly: true });
        }
        return items;
      }, [isAdmin]);

      const setNav = (nav: string, pushHistory = true) => {
        setActiveNav(nav);
        if (pushHistory) {
          window.history.pushState({ nav }, '', '#' + (nav === 'home' ? '' : encodeURIComponent(nav)));
        }
        if (nav !== 'search') setShowSearch(false);
        if (nav !== 'live tv') {
          try {
            if (screen.orientation && (screen.orientation as any).lock) {
              (screen.orientation as any).lock('portrait').catch(() => {});
            }
          } catch (_) {}
        }
      };
      const handleNavClick = (label: string) => {
        if (['Upload', 'Edit', 'Delete'].includes(label) && !isAdmin) { setShowLoginModal(true); return; }
        const nav = label.toLowerCase();
        setNav(nav);
        if (label === 'Upload') setShowUploadModal(true);
        else if (label === 'Search') setShowSearch(true);
      };

      const handleCardClick = (item: MediaItem) => {
        if (activeNav === 'delete' && isAdmin) confirmDelete(item.id);
        else if (activeNav === 'edit' && isAdmin) openEdit(item);
        else {
          setSelectedMedia(item);
          window.history.pushState({ nav: activeNav, modal: 'detail', id: item.id }, '', '#' + encodeURIComponent(activeNav) + '/detail/' + item.id);
        }
      };

      const scrollLeft = () => contentRowRef.current?.scrollBy({ left: -300, behavior: 'smooth' });
      const scrollRight = () => contentRowRef.current?.scrollBy({ left: 300, behavior: 'smooth' });

      const handleVideoPlay = () => {
        if (videoRef.current) {
          isPlaying ? videoRef.current.pause() : videoRef.current.play();
          setIsPlaying(!isPlaying);
        }
      };

      const skipBackward = () => {
        if (videoRef.current) { videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10); showSkipFeedback('-10s'); }
      };

      const skipForward = () => {
        if (videoRef.current) { videoRef.current.currentTime = Math.min(duration, videoRef.current.currentTime + 10); showSkipFeedback('+10s'); }
      };

      const showSkipFeedback = (text: string) => {
        const el = document.createElement('div');
        el.textContent = text;
        el.className = 'skip-feedback';
        const container = document.querySelector('.video-player-container');
        if (container) { container.appendChild(el); setTimeout(() => el.remove(), 600); }
      };

      const changeSpeed = (direction: number) => {
        const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed);
        const newIndex = Math.max(0, Math.min(PLAYBACK_SPEEDS.length - 1, currentIndex + direction));
        setPlaybackSpeed(PLAYBACK_SPEEDS[newIndex]);
      };

      const handleTimeUpdate = () => { if (videoRef.current) setCurrentTime(videoRef.current.currentTime); };

      const handleLoadedMetadata = () => { setIsVideoLoading(false);
        if (videoRef.current) { setDuration(videoRef.current.duration); videoRef.current.playbackRate = playbackSpeed; }
      };

      const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
        const time = parseFloat(e.target.value);
        if (videoRef.current) { videoRef.current.currentTime = time; setCurrentTime(time); }
      };

      const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const vol = parseFloat(e.target.value);
        setVolume(vol);
        if (videoRef.current) videoRef.current.volume = vol;
      };

      
const lockLandscape = async () => {
  try {
    if (screen.orientation && (screen.orientation as any).lock) {
      await (screen.orientation as any).lock('landscape');
    }
  } catch (_) {}
};

const unlockOrientation = () => {
  try {
    if (screen.orientation && (screen.orientation as any).unlock) {
      (screen.orientation as any).unlock();
    }
  } catch (_) {}
};

const toggleFullscreen = async () => {
        const container = document.querySelector('.video-player-container') as HTMLElement;
        const video = videoRef.current;
        if (!container || !video) return;
        try {
          if (document.fullscreenElement) {
            await document.exitFullscreen();
            if (screen.orientation && (screen.orientation as any).unlock) (screen.orientation as any).unlock();
          } else {
            if ((video as any).webkitEnterFullscreen) (video as any).webkitEnterFullscreen();
            else if (container.requestFullscreen) await container.requestFullscreen();
            else if ((container as any).webkitRequestFullscreen) (container as any).webkitRequestFullscreen();
            if (screen.orientation && (screen.orientation as any).lock) {
              try { await (screen.orientation as any).lock('landscape'); } catch (_) { }
            }
          }
        } catch (err) { console.log('Fullscreen error:', err); }
      };

      const handleVideoEnded = () => {
        setIsPlaying(false);
        if (currentEpisode && episodes.length > 0) {
          const currentIndex = episodes.findIndex(ep => ep.id === currentEpisode.id);
          if (currentIndex !== -1 && currentIndex < episodes.length - 1) {
            const nextEpisode = episodes[currentIndex + 1];
            setCurrentEpisode(nextEpisode);
            setCurrentVideoSrc(toHlsUrl(nextEpisode.video_url));
            setCurrentTime(0);
          }
        }
      };

      const startWatching = async (item: MediaItem) => {
        setSelectedMedia(item);
        setCurrentEpisode(null);
        const catType = getCategoryType(item.category);
        if (catType === 'series') {
          const { data } = await supabase.from('episodes').select('*')
            .eq('media_id', parseInt(item.id))
            .order('season_number', { ascending: true })
            .order('episode_number', { ascending: true });
          if (data && data.length > 0) {
            const eps: Episode[] = data.map((ep: any) => ({
              id: ep.id.toString(), media_id: ep.media_id.toString(),
              season_number: ep.season_number, episode_number: ep.episode_number,
              title: ep.title, description: ep.description || '',
              video_url: ep.video_url || '', thumbnail: ep.thumbnail || '',
              duration: ep.duration || '',
            }));
            setEpisodes(eps);
            const firstEp = eps[0];
            setCurrentEpisode(firstEp);
            setCurrentVideoSrc(toHlsUrl(firstEp.video_url));
            setShowVideoPlayer(true);
          } else {
            if (isAdmin) { const go = window.confirm('📺 No episodes yet! Click OK to add episodes now.'); if (go) setShowEpisodeManager(true); }
            else alert('📺 No episodes available yet. Check back soon!');
          }
        } else {
          if (!item.videoUrl) { alert('No video uploaded for this item yet.'); return; }
          setCurrentVideoSrc(toHlsUrl(item.videoUrl));
          setShowVideoPlayer(true);
          window.location.hash = encodeURIComponent(activeNav) + '/player';
        }
      };

      const formatTime = (time: number) => {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds.toString().padStart(2, '0')}`;
      };

      const filteredMedia = useMemo(() => {
        if (!searchQuery.trim()) return mediaItems;
        const q = searchQuery.toLowerCase();
        return mediaItems.filter(item =>
          item.title.toLowerCase().includes(q) || item.description.toLowerCase().includes(q) ||
          item.category.toLowerCase().includes(q) || item.year.toLowerCase().includes(q) ||
          item.languages.toLowerCase().includes(q) || item.genres.some(g => g.toLowerCase().includes(q))
        );
      }, [mediaItems, searchQuery]);

      const categorizedMedia = useMemo(() => {
        const groups: { [key: string]: MediaItem[] } = {};
        filteredMedia.forEach(item => { if (!groups[item.category]) groups[item.category] = []; groups[item.category].push(item); });
        return groups;
      }, [filteredMedia]);

      const existingCategories = useMemo(() => {
        const cats = new Set<string>();
        categoryTypes.forEach(c => cats.add(c.category_name));
        mediaItems.forEach(item => cats.add(item.category));
        if (cats.size === 0) { cats.add('Movies'); cats.add('Series'); }
        return Array.from(cats);
      }, [mediaItems, categoryTypes]);

const isSelectedSeries = useMemo(() => {
        if (!selectedMedia) return false;
        return getCategoryType(selectedMedia.category) === 'series';
      }, [selectedMedia, categoryTypes]);

      const getCategoryEmoji = (cat: string) => {
        const lower = cat.toLowerCase();
        const type = getCategoryType(cat);
        if (type === 'series') return '📺';
        if (lower.includes('movie')) return '🎥';
        if (lower.includes('anime')) return '🎌';
        if (lower.includes('document')) return '🎞️';
        if (lower.includes('cartoon')) return '🎨';
        if (lower.includes('music')) return '🎵';
        if (lower.includes('sport')) return '⚽';
        if (lower.includes('comedy')) return '😂';
        if (lower.includes('horror')) return '👻';
        if (lower.includes('kids')) return '🧸';
        if (lower.includes('action')) return '💥';
        if (lower.includes('romantic') || lower.includes('romance')) return '💕';
        return '🎬';
      };

      return (
        <div className="min-h-screen bg-gray-950 text-white">

          {/* ── Mobile Bottom Nav ── */}
          <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-900/95 backdrop-blur-sm z-50 border-t border-gray-800">
            <div className="flex items-center justify-around py-2">
              {navItems.map((item, index) => (
                <button key={index} onClick={() => handleNavClick(item.label)}
                  className={cn('flex flex-col items-center gap-1 p-2 rounded-lg transition-all',
                    activeNav === item.label.toLowerCase() ? 'text-orange-500' : 'text-gray-400')}>
                  {item.icon}
                  <span className="text-[10px]" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>{item.label}</span>
                </button>
              ))}
              {/* Bell button — mobile */}
              {pushSupported && (
                <button
                  onClick={() => setShowNotifyModal(true)}
                  className={cn('flex flex-col items-center gap-1 p-2 rounded-lg transition-all relative',
                    pushSubscribed ? 'text-orange-400' : 'text-gray-400')}
                >
                  <BellIcon active={pushSubscribed} />
                  {pushSubscribed && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-orange-500 rounded-full border border-gray-900" />
                  )}
                  <span className="text-[10px]" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>Notify</span>
                </button>
              )}
              <button onClick={() => isAdmin ? handleAdminLogout() : setShowLoginModal(true)}
                className={cn('flex flex-col items-center gap-1 p-2 rounded-lg transition-all',
                  isAdmin ? 'text-green-500' : 'text-gray-400')}>
                {isAdmin ? <UnlockIcon /> : <LockIcon />}
                <span className="text-[10px]" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>{isAdmin ? 'Admin' : 'Login'}</span>
              </button>
            </div>
          </nav>

          {/* ── Desktop Side Nav ── */}
          <aside className="hidden md:flex fixed right-0 top-0 h-full w-20 bg-gray-900/90 backdrop-blur-sm z-50 flex-col items-center py-6 border-l border-gray-800">
            <div className="mb-8">
              <div className="w-12 h-12 bg-gradient-to-br from-orange-500 via-red-500 to-pink-600 rounded-full flex items-center justify-center transform rotate-12 hover:rotate-0 transition-transform">
                <span className="text-2xl font-black text-white">🎬</span>
              </div>
            </div>
            <nav className="flex-1 flex flex-col gap-4">
              {navItems.map((item, index) => (
                <button key={index} onClick={() => handleNavClick(item.label)}
                  className={cn('w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 relative',
                    activeNav === item.label.toLowerCase()
                      ? 'bg-gradient-to-br from-orange-500 via-red-500 to-pink-600 text-white scale-110'
                      : 'text-gray-400 hover:text-white hover:bg-gray-800')}
                  title={item.label}>
                  {item.icon}
                  {item.adminOnly && <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full border-2 border-gray-900" />}
                </button>
              ))}
            </nav>

            {/* Bell button — desktop */}
            {pushSupported && (
              <button
                onClick={() => setShowNotifyModal(true)}
                className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 mb-2 relative',
                  pushSubscribed
                    ? 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                )}
                title={pushSubscribed ? 'Notifications ON' : 'Enable Notifications'}
              >
                <BellIcon active={pushSubscribed} />
                {pushSubscribed && (
                  <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-orange-500 rounded-full border-2 border-gray-900" />
                )}
              </button>
            )}

            <button
              onClick={() => isAdmin ? handleAdminLogout() : setShowLoginModal(true)}
              className={cn('w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 mb-2',
                isAdmin ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30' : 'text-gray-400 hover:text-white hover:bg-gray-800')}
              title={isAdmin ? 'Admin Mode — Click to Logout' : 'Admin Login'}>
              {isAdmin ? <UnlockIcon /> : <LockIcon />}
            </button>
            {(activeNav === 'delete' || activeNav === 'edit') && isAdmin && (
              <div className="mb-4 px-2">
                <p className="text-xs text-orange-400 text-center">Click cards to {activeNav}</p>
              </div>
            )}
          </aside>

          {/* ── Main ── */}
          <main className="md:mr-20 pb-24 md:pb-0">
            <header className="relative z-40 p-4 sm:p-8 flex justify-between items-start flex-wrap gap-4">
              <div className="transform -rotate-2 hover:rotate-0 transition-transform">
                <h1 className="text-4xl sm:text-6xl font-black tracking-tight"
                  style={{
                    fontFamily: "'Nunito', 'Comic Sans MS', cursive",
                    background: 'linear-gradient(135deg, #ff6b35, #f7931e, #ffd23f, #ee4266, #540d6e)',
                    backgroundSize: '200% 200%',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                    animation: 'gradient 3s ease infinite',
                  }}>
                  FUKREY
                </h1>
                <p className="text-sm sm:text-lg text-gray-400 mt-1" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>
                  🍿 Your Crazy Entertainment Hub 🎉
                  {isAdmin && <span className="ml-2 px-2 py-0.5 bg-green-500/20 text-green-400 rounded-full text-xs">👑 ADMIN</span>}
                </p>
              </div>
              {showSearch && (
                <div className="w-full sm:w-auto flex-1 max-w-md">
                  <div className="relative">
                    <input type="text" placeholder="Search movies, series..." value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)} autoFocus
                      className="w-full px-4 py-3 pl-12 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:border-orange-500 text-white" />
                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"><SearchIcon /></div>
                    {searchQuery && (
                      <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
                        <CloseIcon />
                      </button>
                    )}
                  </div>
                  {searchQuery && <p className="text-sm text-gray-400 mt-2">Found {filteredMedia.length} result{filteredMedia.length !== 1 ? 's' : ''}</p>}
                </div>
              )}
            </header>

            {/* ── Online Section OR Home Content ── */}
            {activeNav === 'live tv' ? (
              <div>
                <header className="p-4 sm:p-8 pb-0 flex items-center gap-4">
                  <button
                    onClick={() => { setActiveNav('home'); setShowSearch(false); }}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-orange-500 rounded-xl transition-all text-sm font-semibold text-gray-300 hover:text-white flex-shrink-0">
                    <BackIcon />
                    <span className="hidden sm:inline">Home</span>
                  </button>
                  <div>
                    <h2 className="text-3xl sm:text-5xl font-black"
                      style={{
                        fontFamily: "'Nunito', 'Comic Sans MS', cursive",
                        background: 'linear-gradient(135deg, #ff6b35, #f7931e, #ffd23f)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                      }}>
                      📡 Live TV
                    </h2>
                    <p className="text-gray-400 mt-1 mb-0 text-sm">500+ channels · Ad-blocked streams</p>
                  </div>
                </header>
                <LiveTVSection />
              </div>

            ) : activeNav === 'online' ? (
              <div>
                <header className="p-4 sm:p-8 pb-0 flex items-center gap-4">
                  <button
                    onClick={() => { setActiveNav('home'); setShowSearch(false); }}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-orange-500 rounded-xl transition-all text-sm font-semibold text-gray-300 hover:text-white flex-shrink-0">
                    <BackIcon />
                    <span className="hidden sm:inline">Home</span>
                  </button>
                  <div>
                    <h2 className="text-3xl sm:text-5xl font-black"
                      style={{
                        fontFamily: "'Nunito', 'Comic Sans MS', cursive",
                        background: 'linear-gradient(135deg, #ff6b35, #f7931e, #ffd23f)',
                        WebkitBackgroundClip: 'text',
                        WebkitTextFillColor: 'transparent',
                      }}>
                      🌐 Online Stream
                    </h2>
                    <p className="text-gray-400 mt-1 mb-0 text-sm">Powered by TMDB · Streamed via VidSrc</p>
                  </div>
                </header>
                <OnlineSection onGoHome={() => { setActiveNav('home'); setShowSearch(false); }} />
              </div>

            ) : isLoading ? (
              <section className="h-[60vh] flex items-center justify-center">
                <div className="text-center">
                  <div className="w-20 h-20 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                  <p className="text-xl text-gray-400">Loading...</p>
                </div>
              </section>

            ) : mediaItems.length === 0 ? (
              <section className="h-[60vh] flex items-center justify-center">
                <div className="text-center px-8">
                  <div className="w-24 h-24 sm:w-32 sm:h-32 bg-gradient-to-br from-orange-500 via-red-500 to-pink-600 rounded-full flex items-center justify-center mx-auto mb-8 animate-pulse">
                    <span className="text-5xl sm:text-6xl">🎬</span>
                  </div>
                  <h2 className="text-2xl sm:text-4xl font-bold mb-4" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>
                    Welcome to <span style={{ background: 'linear-gradient(135deg, #ff6b35, #f7931e, #ffd23f)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Fukrey!</span>
                  </h2>
                  {isAdmin ? (
                    <button onClick={() => setShowUploadModal(true)}
                      className="px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-orange-500 via-red-500 to-pink-600 rounded-xl font-bold text-base sm:text-lg flex items-center gap-3 mx-auto hover:from-orange-600 transition-all">
                      <UploadIcon /> Upload Your First Video
                    </button>
                  ) : <p className="text-gray-400 text-lg">No content yet. Check back soon!</p>}
                </div>
              </section>

            ) : filteredMedia.length === 0 ? (
              <section className="h-[60vh] flex items-center justify-center">
                <div className="text-center px-8">
                  <div className="text-6xl mb-4">🔍</div>
                  <h2 className="text-2xl font-bold mb-2">No results found</h2>
                  <p className="text-gray-400">Try a different search term</p>
                </div>
              </section>

            ) : (
              <>
                {!searchQuery && (
                  <HeroSection
                    mediaItems={filteredMedia}
                    onWatch={(item) => { setSelectedMedia(item); startWatching(item); }}
                    onShowDetails={(item) => setSelectedMedia(item)}
                  />
                )}
                <section className="px-4 sm:px-16 pb-16">
                  <div className="mb-12 mt-6">
                    <div className="flex items-center justify-between mb-4 sm:mb-6">
                      <h2 className="text-xl sm:text-2xl font-bold" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>
                        {searchQuery ? '🔍 Search Results' : '🎞️ Your Collection'}
                      </h2>
                      {!searchQuery && isAdmin && (
                        <button onClick={() => setShowUploadModal(true)} className="text-orange-400 hover:text-orange-300 flex items-center gap-1 text-sm sm:text-base">
                          <PlusIcon /> <span className="hidden sm:inline">Add More</span>
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <button onClick={scrollLeft} className="hidden sm:flex absolute left-0 top-1/2 -translate-y-1/2 z-20 w-12 h-full bg-gradient-to-r from-gray-950 to-transparent items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <ChevronLeftIcon />
                      </button>
                      <div ref={contentRowRef} className="flex gap-3 sm:gap-4 overflow-x-auto scrollbar-hide scroll-smooth pb-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                        {filteredMedia.map((item) => (
                          <MediaCard key={item.id} item={item} onClick={() => handleCardClick(item)} mode={activeNav} categoryType={getCategoryType(item.category)} />
                        ))}
                      </div>
                      <button onClick={scrollRight} className="hidden sm:flex absolute right-0 top-1/2 -translate-y-1/2 z-20 w-12 h-full bg-gradient-to-l from-gray-950 to-transparent items-center justify-center opacity-0 hover:opacity-100 transition-opacity">
                        <ChevronRightIcon />
                      </button>
                    </div>
                  </div>

                  {!searchQuery && Object.entries(categorizedMedia).map(([category, items]) => (
                    <div key={category} className="mb-12">
                      <div className="flex items-center justify-between mb-4 sm:mb-6">
                        <h2 className="text-xl sm:text-2xl font-bold" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>
                          {getCategoryEmoji(category)} {category}
                          <span className="text-sm text-gray-500 ml-2 font-normal">({items.length})</span>
                        </h2>
                        {isAdmin && (
                          <button onClick={() => handleDeleteCategory(category)}
                            className="text-red-400 hover:text-red-300 hover:bg-red-500/10 p-2 rounded-lg transition-colors flex items-center gap-1 text-xs sm:text-sm">
                            <DeleteIcon /><span className="hidden sm:inline">Delete Category</span>
                          </button>
                        )}
                      </div>
                      <div className="flex gap-3 sm:gap-4 overflow-x-auto scrollbar-hide pb-2" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
                        {items.map((item) => (
                          <MediaCard key={item.id} item={item} onClick={() => handleCardClick(item)} mode={activeNav} categoryType={getCategoryType(item.category)} />
                        ))}
                      </div>
                    </div>
                  ))}
                </section>
              </>
            )}
          </main>

          {/* ── Media Detail Modal ── */}
          {selectedMedia && !showVideoPlayer && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
              <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => setSelectedMedia(null)} />
              <div className="relative bg-gray-900 rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                <button onClick={() => setSelectedMedia(null)} className="absolute top-4 right-4 z-10 w-10 h-10 bg-gray-800/80 rounded-full flex items-center justify-center hover:bg-gray-700">
                  <CloseIcon />
                </button>
                <div className="relative h-48 sm:h-80">
                  <img src={selectedMedia.thumbnail} alt={selectedMedia.title} className="w-full h-full object-cover rounded-t-2xl" />
                  <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent rounded-t-2xl" />
                  <div className="absolute bottom-4 sm:bottom-6 left-4 sm:left-6 right-4 sm:right-6">
                    <h2 className="text-2xl sm:text-4xl font-bold mb-2" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>{selectedMedia.title}</h2>
                    <div className="flex items-center gap-2 sm:gap-3 text-gray-300 text-xs sm:text-base flex-wrap">
                      <span>{selectedMedia.year}</span><span className="w-1 h-1 bg-gray-400 rounded-full" />
                      <span>{selectedMedia.rating}</span><span className="w-1 h-1 bg-gray-400 rounded-full" />
                      <span>{selectedMedia.duration}</span><span className="w-1 h-1 bg-gray-400 rounded-full" />
                      <span>{selectedMedia.languages}</span>
                      {isSelectedSeries && (<><span className="w-1 h-1 bg-gray-400 rounded-full" /><span className="text-orange-400">{episodes.length > 0 ? `${episodes.length} Episodes` : 'Series'}</span></>)}
                    </div>
                  </div>
                </div>
                <div className="p-4 sm:p-6">
                  <div className="flex items-center gap-2 sm:gap-4 mb-6 flex-wrap">
                    <button onClick={() => startWatching(selectedMedia)}
                      className="px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-orange-500 via-red-500 to-pink-600 rounded-xl font-bold flex items-center gap-2 sm:gap-3 hover:from-orange-600 transition-all text-sm sm:text-base">
                      <PlayIcon />
                      {isSelectedSeries && episodes.length > 0 ? `Play S${episodes[0].season_number}E${episodes[0].episode_number}` : 'Watch Now'}
                    </button>
                    {isSelectedSeries && (
                      <button onClick={() => setShowEpisodeManager(true)}
                        className="px-4 sm:px-6 py-3 sm:py-4 bg-blue-600/20 border border-blue-600 rounded-xl font-bold flex items-center gap-2 hover:bg-blue-600 transition-all text-sm sm:text-base">
                        📺 {isAdmin ? 'Manage Episodes' : 'All Episodes'}{episodes.length > 0 && ` (${episodes.length})`}
                      </button>
                    )}
                    {isAdmin && (
                      <>
                        <button onClick={() => { const m = selectedMedia; setSelectedMedia(null); openEdit(m); }}
                          className="w-12 h-12 sm:w-14 sm:h-14 bg-blue-600/20 border border-blue-600 rounded-xl flex items-center justify-center hover:bg-blue-600 transition-all" title="Edit">
                          <EditIcon />
                        </button>
                        <button onClick={() => confirmDelete(selectedMedia.id)}
                          className="w-12 h-12 sm:w-14 sm:h-14 bg-red-600/20 border border-red-600 rounded-xl flex items-center justify-center hover:bg-red-600 transition-all" title="Delete">
                          <DeleteIcon />
                        </button>
                      </>
                    )}
                  </div>
                  <p className="text-gray-300 text-base sm:text-lg mb-6">{selectedMedia.description}</p>
                  <div className="flex items-center gap-2 mb-6 flex-wrap">
                    {selectedMedia.genres.map((genre, index) => (
                      <span key={index} className="px-3 sm:px-4 py-1 sm:py-2 bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/30 rounded-full text-xs sm:text-sm">{genre}</span>
                    ))}
                  </div>
                  {isSelectedSeries && episodes.length > 0 && (
                    <div className="mt-6">
                      <h3 className="text-lg font-bold mb-3" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>📺 Episodes</h3>
                      <div className="space-y-2 max-h-60 overflow-y-auto">
                        {episodes.slice(0, 5).map((ep) => (
                          <button key={ep.id} onClick={() => { setCurrentEpisode(ep); setCurrentVideoSrc(toHlsUrl(ep.video_url)); setShowVideoPlayer(true); }}
                            className="w-full flex items-center gap-3 p-3 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors text-left">
                            <div className="w-12 h-12 bg-orange-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                              <span className="text-orange-400 font-bold text-sm">S{ep.season_number}E{ep.episode_number}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold truncate">{ep.title}</p>
                              {ep.duration && <p className="text-xs text-gray-400">{ep.duration}</p>}
                            </div>
                            <PlayIcon />
                          </button>
                        ))}
                        {episodes.length > 5 && (
                          <button onClick={() => setShowEpisodeManager(true)} className="w-full p-3 text-orange-400 hover:bg-orange-500/10 rounded-lg transition-colors text-sm">
                            View all {episodes.length} episodes →
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                  {isSelectedSeries && episodes.length === 0 && isAdmin && (
                    <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                      <p className="text-blue-400 text-sm">📺 No episodes yet! Click <strong>"Manage Episodes"</strong> above to add episodes.</p>
                    </div>
                  )}
                  {isSelectedSeries && episodes.length === 0 && !isAdmin && (
                    <div className="mt-6 p-4 bg-gray-800 rounded-xl">
                      <p className="text-gray-400 text-sm text-center">📺 Episodes coming soon!</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── Modals ── */}
          {showUploadModal && isAdmin && (
            <UploadModal onClose={() => setShowUploadModal(false)} onUpload={handleUpload} existingCategories={existingCategories} categoryTypes={categoryTypes} />
          )}
          {showEditModal && editingMedia && isAdmin && (
            <EditModal media={editingMedia} onClose={() => { setShowEditModal(false); setEditingMedia(null); }} onSave={handleEdit} existingCategories={existingCategories} categoryTypes={categoryTypes} />
          )}
          {showLoginModal && <LoginModal onClose={() => setShowLoginModal(false)} onLogin={handleAdminLogin} />}
          {showEpisodeManager && selectedMedia && (
            <EpisodeManager media={selectedMedia} episodes={episodes} isAdmin={isAdmin}
              onClose={() => setShowEpisodeManager(false)}
              onEpisodesChange={() => loadEpisodes(selectedMedia.id)}
              onPlayEpisode={(ep) => { setCurrentEpisode(ep); setCurrentVideoSrc(toHlsUrl(ep.video_url)); setShowEpisodeManager(false); setShowVideoPlayer(true); }} />
          )}

          {/* ── Push Notification Modal ── */}
          {showNotifyModal && (
            <NotifyModal
              isAdmin={isAdmin}
              pushSubscribed={pushSubscribed}
              pushLoading={pushLoading}
              pushStatusMsg={pushStatusMsg}
              mediaItems={mediaItems}
              onClose={() => { setShowNotifyModal(false); setPushStatusMsg(''); }}
              onToggleSubscription={handleTogglePushSubscription}
            />
          )}

          {/* ── Video Player ── */}
          {showVideoPlayer && selectedMedia && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black p-0 sm:p-4">
              <button onClick={() => { setShowVideoPlayer(false); setIsPlaying(false); setCurrentEpisode(null); setShowSpeedMenu(false); }}
                className="absolute top-4 right-4 z-50 w-12 h-12 bg-gray-800/80 rounded-full flex items-center justify-center hover:bg-gray-700">
                <CloseIcon />
              </button>
              {currentEpisode && (
                <div className="absolute top-4 left-4 z-50 bg-gray-900/80 backdrop-blur-sm px-4 py-2 rounded-lg max-w-[60%]">
                  <p className="text-xs text-gray-400">S{currentEpisode.season_number}E{currentEpisode.episode_number}</p>
                  <p className="font-bold text-sm truncate">{currentEpisode.title}</p>
                </div>
              )}
              <div className="video-player-container w-full max-w-6xl">
                {currentVideoSrc ? (
                  <div className="relative">
                    {isVideoLoading && <div className="absolute inset-0 flex items-center justify-center bg-black z-10 rounded-xl"><div className="text-center"><div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div><p className="text-gray-300 text-sm font-bold">Loading video...</p></div></div>}
                    <video ref={videoRef} className="w-full aspect-video sm:rounded-xl"
                      onPlay={() => setIsPlaying(true)} onPause={() => setIsPlaying(false)}
                      onTimeUpdate={handleTimeUpdate} onLoadedMetadata={handleLoadedMetadata}
                      onEnded={handleVideoEnded} autoPlay playsInline key={currentVideoSrc} />
                    <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 to-transparent p-2 sm:p-4 sm:rounded-b-xl">
                      <input type="range" min="0" max={duration || 100} value={currentTime} onChange={handleSeek}
                        className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer mb-2 sm:mb-4 accent-orange-500" />
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <button onClick={skipBackward} className="w-9 h-9 sm:w-10 sm:h-10 bg-gray-800 rounded-full flex items-center justify-center hover:bg-gray-700"><Skip10BackIcon /></button>
                          <button onClick={handleVideoPlay} className="w-10 h-10 sm:w-12 sm:h-12 bg-orange-500 rounded-full flex items-center justify-center hover:bg-orange-600">
                            {isPlaying ? <PauseIcon /> : <PlayIcon />}
                          </button>
                          <button onClick={skipForward} className="w-9 h-9 sm:w-10 sm:h-10 bg-gray-800 rounded-full flex items-center justify-center hover:bg-gray-700"><Skip10ForwardIcon /></button>
                          <span className="text-xs sm:text-sm text-gray-300">{formatTime(currentTime)} / {formatTime(duration)}</span>
                          <div className="hidden sm:flex items-center gap-2">
                            <VolumeIcon />
                            <input type="range" min="0" max="1" step="0.1" value={volume} onChange={handleVolumeChange}
                              className="w-24 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-orange-500" />
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="relative">
                            <button onClick={() => setShowSpeedMenu(!showSpeedMenu)}
                              className={cn('h-10 px-3 rounded-full flex items-center gap-1 text-xs sm:text-sm font-bold',
                                playbackSpeed !== 1 ? 'bg-orange-500 hover:bg-orange-600' : 'bg-gray-800 hover:bg-gray-700')}>
                              <SpeedIcon /><span>{playbackSpeed}x</span>
                            </button>
                            {showSpeedMenu && (
                              <div className="absolute bottom-full right-0 mb-2 bg-gray-900 border border-gray-700 rounded-lg overflow-hidden shadow-xl">
                                {PLAYBACK_SPEEDS.map((speed) => (
                                  <button key={speed} onClick={() => { setPlaybackSpeed(speed); setShowSpeedMenu(false); }}
                                    className={cn('block w-full px-4 py-2 text-sm text-left hover:bg-gray-800',
                                      playbackSpeed === speed ? 'text-orange-400 bg-orange-500/10' : 'text-white')}>
                                    {speed}x {playbackSpeed === speed && '✓'}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          <button onClick={toggleFullscreen} className="w-10 h-10 bg-gray-800 rounded-full flex items-center justify-center hover:bg-gray-700"><FullscreenIcon /></button>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="w-full aspect-video bg-gray-900 rounded-xl flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-20 h-20 bg-gradient-to-br from-orange-500 via-red-500 to-pink-600 rounded-full flex items-center justify-center mx-auto mb-6"><PlayIcon /></div>
                      <p className="text-xl text-gray-400">No video available</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Delete Confirm ── */}
          {showDeleteConfirm && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
              <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={() => setShowDeleteConfirm(false)} />
              <div className="relative bg-gray-900 rounded-2xl max-w-md w-full p-6 sm:p-8">
                <h3 className="text-xl sm:text-2xl font-bold mb-4" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>🗑️ Delete Media?</h3>
                <p className="text-gray-400 mb-6">This action cannot be undone.</p>
                <div className="flex gap-4">
                  <button onClick={() => setShowDeleteConfirm(false)} className="flex-1 py-3 bg-gray-800 rounded-xl font-semibold hover:bg-gray-700">Cancel</button>
                  <button onClick={() => mediaToDelete && handleDelete(mediaToDelete)} className="flex-1 py-3 bg-gradient-to-r from-red-500 to-pink-600 rounded-xl font-semibold hover:from-red-600">Delete</button>
                </div>
              </div>
            </div>
          )}

          <style>{`
            * { font-family: 'Comic Sans MS', cursive !important; }
  @keyframes gradient { 0%, 100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
            .scrollbar-hide::-webkit-scrollbar { display: none; }
            input[type="range"]::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 16px; height: 16px; border-radius: 50%; background: #f97316; cursor: pointer; }
            input[type="range"]::-moz-range-thumb { width: 16px; height: 16px; border-radius: 50%; background: #f97316; cursor: pointer; border: none; }
            .line-clamp-3 { display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; }
            .hero-3d-container { perspective: 1500px; transform-style: preserve-3d; }
            @keyframes slideInFromRight { 0% { transform: translateX(100%) rotateY(-45deg) scale(0.8); opacity: 0; } 100% { transform: translateX(0) rotateY(0) scale(1); opacity: 1; } }
            @keyframes slideInFromLeft { 0% { transform: translateX(-100%) rotateY(45deg) scale(0.8); opacity: 0; } 100% { transform: translateX(0) rotateY(0) scale(1); opacity: 1; } }
            @keyframes slideOutToLeft { 0% { transform: translateX(0) rotateY(0) scale(1); opacity: 1; } 100% { transform: translateX(-100%) rotateY(45deg) scale(0.8); opacity: 0; } }
            @keyframes slideOutToRight { 0% { transform: translateX(0) rotateY(0) scale(1); opacity: 1; } 100% { transform: translateX(100%) rotateY(-45deg) scale(0.8); opacity: 0; } }
            .hero-slide-in-next { animation: slideInFromRight 0.6s ease-out; }
            .hero-slide-in-prev { animation: slideInFromLeft 0.6s ease-out; }
            .hero-slide-out-left { animation: slideOutToLeft 0.6s ease-in forwards; }
            .hero-slide-out-right { animation: slideOutToRight 0.6s ease-in forwards; }
            .video-player-container:fullscreen { display: flex; align-items: center; justify-content: center; background: black; width: 100vw; height: 100vh; max-width: 100vw; padding: 0; }
            .video-player-container:fullscreen video { width: 100%; height: 100%; max-height: 100vh; object-fit: contain; border-radius: 0; aspect-ratio: unset; }
            .video-player-container:-webkit-full-screen { display: flex; align-items: center; justify-content: center; background: black; width: 100vw; height: 100vh; }
            .video-player-container:-webkit-full-screen video { width: 100%; height: 100%; object-fit: contain; border-radius: 0; }
            @keyframes skipFade { 0% { opacity: 0; transform: translate(-50%, -50%) scale(0.5); } 50% { opacity: 1; transform: translate(-50%, -50%) scale(1.2); } 100% { opacity: 0; transform: translate(-50%, -50%) scale(1); } }
            .skip-feedback { position: absolute; top: 50%; left: 50%; background: rgba(249, 115, 22, 0.9); color: white; padding: 16px 32px; border-radius: 50px; font-size: 24px; font-weight: bold; z-index: 100; pointer-events: none; animation: skipFade 0.6s ease-out forwards; }
          `}</style>
        </div>
      );
    }

    // ─── Notify Modal ─────────────────────────────────────────────────────────────
    function NotifyModal({
      isAdmin, pushSubscribed, pushLoading, pushStatusMsg, mediaItems,
      onClose, onToggleSubscription,
    }: {
      isAdmin: boolean;
      pushSubscribed: boolean;
      pushLoading: boolean;
      pushStatusMsg: string;
      mediaItems: MediaItem[];
      onClose: () => void;
      onToggleSubscription: () => void;
    }) {
      // Admin send-notification form state
      const [notifTitle, setNotifTitle] = useState('🎬 New on Fukrey!');
      const [notifBody, setNotifBody] = useState('');
      const [notifMediaId, setNotifMediaId] = useState('');
      const [sending, setSending] = useState(false);
      const [sendResult, setSendResult] = useState('');

      const selectedMediaItem = mediaItems.find(m => m.id === notifMediaId);

      // Auto-fill body when media selected
      useEffect(() => {
        if (selectedMediaItem) {
          setNotifBody(`${selectedMediaItem.title} is now available on Fukrey!`);
          setNotifTitle('🎬 New on Fukrey!');
        }
      }, [notifMediaId]);

      const handleSendNotification = async () => {
        if (!notifTitle.trim() || !notifBody.trim()) {
          setSendResult('❌ Title and message are required.');
          return;
        }
        setSending(true);
        setSendResult('');
        try {
          // Save notification record to Supabase
          const payload: PushNotificationPayload = {
            title: notifTitle,
            body: notifBody,
            media_id: notifMediaId || undefined,
            thumbnail: selectedMediaItem?.thumbnail || undefined,
          };
          const { error } = await supabase.from('notifications').insert({
            title: payload.title,
            body: payload.body,
            media_id: payload.media_id || null,
            thumbnail: payload.thumbnail || null,
          });
          if (error) throw new Error(error.message);

          // Fetch all subscriptions and send push via fetch to your push endpoint
          // NOTE: actual push delivery requires a server-side function (Edge Function / backend).
          // This saves the notification to Supabase so your Edge Function / cron can pick it up.
          // If you have a push endpoint, call it here:
          // await fetch('/api/send-push', { method: 'POST', body: JSON.stringify(payload) });

          setSendResult('✅ Notification saved! Your server/Edge Function will deliver it to subscribers.');
          setNotifTitle('🎬 New on Fukrey!');
          setNotifBody('');
          setNotifMediaId('');
        } catch (err: any) {
          setSendResult('❌ Failed: ' + err.message);
        }
        setSending(false);
      };

      return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
          <div className="relative bg-gray-900 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <button onClick={onClose} className="absolute top-4 right-4 z-10 w-10 h-10 bg-gray-800/80 rounded-full flex items-center justify-center hover:bg-gray-700">
              <CloseIcon />
            </button>

            <div className="p-6 sm:p-8">
              {/* Header */}
              <div className="text-center mb-6">
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-3 ${pushSubscribed ? 'bg-orange-500/20' : 'bg-gray-800'}`}>
                  <span className="text-3xl">{pushSubscribed ? '🔔' : '🔕'}</span>
                </div>
                <h2 className="text-2xl font-bold" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>
                  Push Notifications
                </h2>
                <p className="text-gray-400 text-sm mt-1">
                  {pushSubscribed ? 'You\'ll get notified when new content drops!' : 'Subscribe to get notified about new movies & series.'}
                </p>
              </div>

              {/* Subscribe / Unsubscribe */}
              <button
                onClick={onToggleSubscription}
                disabled={pushLoading}
                className={cn(
                  'w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all mb-3',
                  pushSubscribed
                    ? 'bg-gray-700 hover:bg-gray-600 text-white'
                    : 'bg-gradient-to-r from-orange-500 via-red-500 to-pink-600 hover:from-orange-600 text-white',
                  pushLoading && 'opacity-60 cursor-not-allowed'
                )}
              >
                {pushLoading ? (
                  <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Processing...</>
                ) : pushSubscribed ? (
                  <><BellIcon /> Disable Notifications</>
                ) : (
                  <><BellIcon /> Enable Notifications</>
                )}
              </button>

              {pushStatusMsg && (
                <div className={cn(
                  'p-3 rounded-xl text-sm text-center mb-4',
                  pushStatusMsg.startsWith('✅') || pushStatusMsg.startsWith('🔔')
                    ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
                )}>
                  {pushStatusMsg}
                </div>
              )}

              {/* Info box */}
              <div className="p-3 bg-gray-800 rounded-xl text-xs text-gray-400 mb-6">
                <p className="font-semibold text-gray-300 mb-1">ℹ️ How it works</p>
                <p>Notifications are delivered via Web Push. Your browser will show a notification even when Fukrey isn't open. You can unsubscribe anytime.</p>
              </div>

              {/* ── Admin: Send Notification ── */}
              {isAdmin && (
                <div className="border-t border-gray-800 pt-6">
                  <h3 className="text-lg font-bold mb-4 flex items-center gap-2" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>
                    <SendIcon /> Send Notification
                    <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-normal">Admin</span>
                  </h3>

                  <div className="space-y-3">
                    {/* Link to media (optional) */}
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Link to Media (optional)</label>
                      <select
                        value={notifMediaId}
                        onChange={e => setNotifMediaId(e.target.value)}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-orange-500 text-sm"
                      >
                        <option value="">— None —</option>
                        {mediaItems.map(m => (
                          <option key={m.id} value={m.id}>{m.title} ({m.category})</option>
                        ))}
                      </select>
                    </div>

                    {/* Preview thumbnail */}
                    {selectedMediaItem && (
                      <div className="flex items-center gap-3 p-2 bg-gray-800 rounded-lg">
                        <img src={selectedMediaItem.thumbnail} alt={selectedMediaItem.title} className="w-10 h-14 object-cover rounded" />
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">{selectedMediaItem.title}</p>
                          <p className="text-xs text-gray-400">{selectedMediaItem.category} · {selectedMediaItem.year}</p>
                        </div>
                      </div>
                    )}

                    {/* Title */}
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Notification Title *</label>
                      <input
                        type="text"
                        value={notifTitle}
                        onChange={e => setNotifTitle(e.target.value)}
                        placeholder="e.g. 🎬 New on Fukrey!"
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-orange-500 text-sm"
                      />
                    </div>

                    {/* Body */}
                    <div>
                      <label className="block text-xs text-gray-400 mb-1">Message *</label>
                      <textarea
                        value={notifBody}
                        onChange={e => setNotifBody(e.target.value)}
                        placeholder="e.g. Avengers: Endgame is now available!"
                        rows={3}
                        className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-orange-500 text-sm resize-none"
                      />
                    </div>

                    {/* Preview */}
                    {(notifTitle || notifBody) && (
                      <div className="p-3 bg-gray-950 border border-gray-700 rounded-xl">
                        <p className="text-xs text-gray-500 mb-2">Preview</p>
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
                            <span className="text-lg">🎬</span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-white truncate">{notifTitle || 'Notification Title'}</p>
                            <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{notifBody || 'Your message here...'}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Send button */}
                    <button
                      onClick={handleSendNotification}
                      disabled={sending || !notifTitle.trim() || !notifBody.trim()}
                      className="w-full py-3 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl font-bold flex items-center justify-center gap-2 hover:from-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                    >
                      {sending
                        ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Sending...</>
                        : <><SendIcon /> Send to All Subscribers</>
                      }
                    </button>

                    {sendResult && (
                      <div className={cn(
                        'p-3 rounded-xl text-sm text-center',
                        sendResult.startsWith('✅')
                          ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                          : 'bg-red-500/10 text-red-400 border border-red-500/20'
                      )}>
                        {sendResult}
                      </div>
                    )}

                    <p className="text-xs text-gray-600 text-center">
                      Notification is saved to Supabase. Your Edge Function / backend will deliver it to all subscribers.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // ─── Episode Manager ──────────────────────────────────────────────────────────
    function EpisodeManager({ media, episodes, isAdmin, onClose, onEpisodesChange, onPlayEpisode }: {
      media: MediaItem; episodes: Episode[]; isAdmin: boolean;
      onClose: () => void; onEpisodesChange: () => void; onPlayEpisode: (ep: Episode) => void;
    }) {
      const [showAddForm, setShowAddForm] = useState(false);
      const [editingEpisode, setEditingEpisode] = useState<Episode | null>(null);

      useEffect(() => { if (isAdmin && episodes.length === 0) setShowAddForm(true); }, []);

      const handleDeleteEpisode = async (id: string) => {
        if (!isAdmin) return;
        if (!window.confirm('Delete this episode?')) return;
        const { error } = await supabase.from('episodes').delete().eq('id', parseInt(id));
        if (error) alert('Failed: ' + error.message);
        else onEpisodesChange();
      };

      const seasonGroups = episodes.reduce((acc, ep) => {
        if (!acc[ep.season_number]) acc[ep.season_number] = [];
        acc[ep.season_number].push(ep);
        return acc;
      }, {} as { [key: number]: Episode[] });

      return (
        <div className="fixed inset-0 z-[55] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
          <div className="relative bg-gray-900 rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <button onClick={onClose} className="absolute top-4 right-4 z-10 w-10 h-10 bg-gray-800/80 rounded-full flex items-center justify-center hover:bg-gray-700"><CloseIcon /></button>
            <div className="p-4 sm:p-6">
              <h2 className="text-2xl sm:text-3xl font-bold mb-1" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>📺 {media.title}</h2>
              <p className="text-gray-400 mb-6">{episodes.length} episode{episodes.length !== 1 ? 's' : ''}</p>
              {isAdmin && (
                <button onClick={() => { setEditingEpisode(null); setShowAddForm(true); }}
                  className="mb-6 px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl font-bold flex items-center gap-2 hover:from-orange-600 transition-all">
                  <PlusIcon /> Add Episode
                </button>
              )}
              {showAddForm && isAdmin && (
                <EpisodeForm mediaId={media.id} episode={editingEpisode}
                  onClose={() => { setShowAddForm(false); setEditingEpisode(null); }}
                  onSave={() => { setShowAddForm(false); setEditingEpisode(null); onEpisodesChange(); }}
                  suggestedEpisodeNumber={episodes.length > 0 ? Math.max(...episodes.map(e => e.episode_number)) + 1 : 1} />
              )}
              {Object.entries(seasonGroups).sort(([a], [b]) => Number(a) - Number(b)).map(([season, eps]) => (
                <div key={season} className="mb-6">
                  <h3 className="text-lg font-bold mb-3 text-orange-400">Season {season}</h3>
                  <div className="space-y-2">
                    {eps.map((ep) => (
                      <div key={ep.id} className="flex items-center gap-3 p-3 bg-gray-800 rounded-lg">
                        <button onClick={() => onPlayEpisode(ep)} className="flex items-center gap-3 flex-1 min-w-0 text-left">
                          <div className="w-12 h-12 bg-orange-500/20 rounded-lg flex items-center justify-center flex-shrink-0">
                            <span className="text-orange-400 font-bold text-sm">E{ep.episode_number}</span>
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold truncate">{ep.title}</p>
                            {ep.description && <p className="text-xs text-gray-400 truncate">{ep.description}</p>}
                            {ep.duration && <p className="text-xs text-gray-500">{ep.duration}</p>}
                          </div>
                          <PlayIcon />
                        </button>
                        {isAdmin && (
                          <div className="flex gap-1">
                            <button onClick={() => { setEditingEpisode(ep); setShowAddForm(true); }} className="w-8 h-8 bg-blue-600/20 hover:bg-blue-600 rounded flex items-center justify-center transition-colors"><EditIcon /></button>
                            <button onClick={() => handleDeleteEpisode(ep.id)} className="w-8 h-8 bg-red-600/20 hover:bg-red-600 rounded flex items-center justify-center transition-colors"><DeleteIcon /></button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {episodes.length === 0 && !showAddForm && (
                <div className="text-center py-12 text-gray-400">
                  <div className="text-6xl mb-4">📺</div>
                  <p className="text-lg">No episodes yet</p>
                  {isAdmin ? <p className="text-sm mt-2">Click "Add Episode" above to get started!</p> : <p className="text-sm mt-2">Episodes coming soon!</p>}
                </div>
              )}
            </div>
          </div>
        </div>
      );
    }

    // ─── Episode Form ─────────────────────────────────────────────────────────────
    function EpisodeForm({ mediaId, episode, onClose, onSave, suggestedEpisodeNumber }: {
      mediaId: string; episode: Episode | null; onClose: () => void; onSave: () => void; suggestedEpisodeNumber: number;
    }) {
      const [formData, setFormData] = useState({
        title: episode?.title || '', description: episode?.description || '',
        season_number: episode?.season_number ?? 1,
        episode_number: episode?.episode_number ?? suggestedEpisodeNumber,
        duration: episode?.duration || '',
      });
      const [videoFile, setVideoFile] = useState<File | null>(null);
      const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
      const [thumbnail, setThumbnail] = useState(episode?.thumbnail || '');
      const [isUploading, setIsUploading] = useState(false);
      const [progress, setProgress] = useState('');

      useEffect(() => {
        setFormData({
          title: episode?.title || '', description: episode?.description || '',
          season_number: episode?.season_number ?? 1,
          episode_number: episode?.episode_number ?? suggestedEpisodeNumber,
          duration: episode?.duration || '',
        });
        setVideoFile(null); setThumbnailFile(null);
        setThumbnail(episode?.thumbnail || ''); setProgress('');
      }, [episode]);

      const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!episode && !videoFile) { alert('Please select a video file!'); return; }
        setIsUploading(true);
        try {
          let videoUrl = episode?.video_url || '';
          let thumbnailUrl = thumbnail;
          if (thumbnailFile) { setProgress('Uploading thumbnail...'); const r = await uploadToCloudinary(thumbnailFile); thumbnailUrl = r.url; }
          if (videoFile) { setProgress('Uploading video...'); const r = await uploadToCloudinary(videoFile); videoUrl = r.url; }
          setProgress('Saving...');
          const payload = {
            media_id: parseInt(mediaId), season_number: formData.season_number,
            episode_number: formData.episode_number, title: formData.title,
            description: formData.description, video_url: videoUrl,
            thumbnail: thumbnailUrl, duration: formData.duration,
          };
          if (episode) { const { error } = await supabase.from('episodes').update(payload).eq('id', parseInt(episode.id)); if (error) throw error; }
          else { const { error } = await supabase.from('episodes').insert(payload); if (error) throw error; }
          onSave();
        } catch (err: any) { alert('Failed: ' + err.message); }
        finally { setIsUploading(false); setProgress(''); }
      };

      return (
        <div className="bg-gray-800 rounded-xl p-4 mb-6 border border-orange-500/30">
          <h3 className="text-lg font-bold mb-4">{episode ? '✏️ Edit Episode' : '➕ Add New Episode'}</h3>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs mb-1 text-gray-400">Season *</label>
                <input type="number" min="1" value={formData.season_number}
                  onChange={(e) => setFormData({ ...formData, season_number: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:border-orange-500" required />
              </div>
              <div>
                <label className="block text-xs mb-1 text-gray-400">Episode # *</label>
                <input type="number" min="1" value={formData.episode_number}
                  onChange={(e) => setFormData({ ...formData, episode_number: parseInt(e.target.value) || 1 })}
                  className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:border-orange-500" required />
              </div>
            </div>
            <div>
              <label className="block text-xs mb-1 text-gray-400">Title *</label>
              <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="Episode title" className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:border-orange-500" required />
            </div>
            <div>
              <label className="block text-xs mb-1 text-gray-400">Description</label>
              <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="What happens in this episode?" rows={2}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:border-orange-500 resize-none" />
            </div>
            <div>
              <label className="block text-xs mb-1 text-gray-400">Duration</label>
              <input type="text" value={formData.duration} onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                placeholder="e.g. 45m" className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded-lg focus:outline-none focus:border-orange-500" />
            </div>
            <div>
              <label className="block text-xs mb-1 text-gray-400">Video File {!episode ? '*' : '(leave blank to keep)'}</label>
              <label className="block w-full p-3 border border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-orange-500 transition-colors">
                <div className="flex items-center gap-2"><UploadIcon /><span className="text-sm text-gray-400 truncate">{videoFile ? videoFile.name : 'Click to select video'}</span></div>
                <input type="file" accept="video/*" onChange={(e) => setVideoFile(e.target.files?.[0] || null)} className="hidden" />
              </label>
              {videoFile && <p className="text-xs text-orange-400 mt-1">📹 {videoFile.name} ({(videoFile.size / 1024 / 1024).toFixed(1)} MB)</p>}
            </div>
            <div>
              <label className="block text-xs mb-1 text-gray-400">Thumbnail (optional)</label>
              {thumbnail ? (
                <div className="relative w-full h-24 rounded-lg overflow-hidden group">
                  <img src={thumbnail} alt="thumb" className="w-full h-full object-cover" />
                  <label className="absolute inset-0 bg-black/0 hover:bg-black/60 cursor-pointer flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span className="text-white text-sm font-bold">📷 Change</span>
                    <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setThumbnailFile(f); const r = new FileReader(); r.onloadend = () => setThumbnail(r.result as string); r.readAsDataURL(f); } }} className="hidden" />
                  </label>
                </div>
              ) : (
                <label className="block w-full p-3 border border-dashed border-gray-600 rounded-lg cursor-pointer hover:border-orange-500 transition-colors">
                  <div className="flex items-center gap-2"><UploadIcon /><span className="text-sm text-gray-400">Click to select thumbnail</span></div>
                  <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (f) { setThumbnailFile(f); const r = new FileReader(); r.onloadend = () => setThumbnail(r.result as string); r.readAsDataURL(f); } }} className="hidden" />
                </label>
              )}
            </div>
            {progress && (
              <div className="flex items-center gap-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-lg">
                <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                <p className="text-orange-400 text-sm">{progress}</p>
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button type="button" onClick={onClose} disabled={isUploading} className="flex-1 py-2 bg-gray-700 rounded-lg hover:bg-gray-600 disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={isUploading || !formData.title}
                className="flex-1 py-2 bg-gradient-to-r from-orange-500 to-red-500 rounded-lg font-bold hover:from-orange-600 disabled:opacity-50 disabled:cursor-not-allowed">
                {isUploading ? 'Uploading...' : episode ? '💾 Update' : '➕ Add Episode'}
              </button>
            </div>
          </form>
        </div>
      );
    }

    // ─── Login Modal ──────────────────────────────────────────────────────────────
    function LoginModal({ onClose, onLogin }: { onClose: () => void; onLogin: (password: string) => boolean }) {
      const [password, setPassword] = useState('');
      const [error, setError] = useState('');
      const [showPassword, setShowPassword] = useState(false);

      const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!password.trim()) { setError('Please enter password'); return; }
        if (!onLogin(password)) { setError('❌ Wrong password!'); setPassword(''); }
      };

      return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
          <div className="relative bg-gray-900 rounded-2xl max-w-md w-full p-6 sm:p-8">
            <button onClick={onClose} className="absolute top-4 right-4 z-10 w-10 h-10 bg-gray-800/80 rounded-full flex items-center justify-center hover:bg-gray-700"><CloseIcon /></button>
            <div className="text-center mb-6">
              <div className="w-20 h-20 bg-gradient-to-br from-orange-500 via-red-500 to-pink-600 rounded-full flex items-center justify-center mx-auto mb-4"><LockIcon /></div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-2" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>🔐 Admin Login</h2>
              <p className="text-gray-400 text-sm">Enter password to access admin features</p>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="relative">
                <input type={showPassword ? 'text' : 'password'} value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(''); }}
                  placeholder="Enter admin password" autoFocus
                  className="w-full px-4 py-3 pr-12 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:border-orange-500 text-white" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white text-sm">
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
              {error && <div className="text-red-400 text-sm text-center bg-red-500/10 py-2 rounded-lg">{error}</div>}
              <button type="submit" className="w-full py-3 bg-gradient-to-r from-orange-500 via-red-500 to-pink-600 rounded-xl font-bold hover:from-orange-600">🔓 Login</button>
            </form>
          </div>
        </div>
      );
    }

    // ─── Hero Section ─────────────────────────────────────────────────────────────
    function HeroSection({ mediaItems, onWatch, onShowDetails }: {
      mediaItems: MediaItem[]; onWatch: (item: MediaItem) => void; onShowDetails: (item: MediaItem) => void;
    }) {
      const [currentIndex, setCurrentIndex] = useState(0);
      const [animationClass, setAnimationClass] = useState('');
      const [isAnimating, setIsAnimating] = useState(false);

      useEffect(() => {
        if (mediaItems.length > 0) { setCurrentIndex(Math.floor(Math.random() * mediaItems.length)); setAnimationClass('hero-slide-in-next'); }
      }, [mediaItems.length]);

      useEffect(() => {
        if (mediaItems.length <= 1) return;
        const timer = setInterval(() => goNext(), 8000);
        return () => clearInterval(timer);
      }, [currentIndex, mediaItems.length]);

      const goNext = () => {
        if (isAnimating || mediaItems.length <= 1) return;
        setIsAnimating(true); setAnimationClass('hero-slide-out-left');
        setTimeout(() => { setCurrentIndex((prev) => (prev + 1) % mediaItems.length); setAnimationClass('hero-slide-in-next'); setIsAnimating(false); }, 600);
      };

      const goPrev = () => {
        if (isAnimating || mediaItems.length <= 1) return;
        setIsAnimating(true); setAnimationClass('hero-slide-out-right');
        setTimeout(() => { setCurrentIndex((prev) => (prev - 1 + mediaItems.length) % mediaItems.length); setAnimationClass('hero-slide-in-prev'); setIsAnimating(false); }, 600);
      };

      const goToIndex = (index: number) => {
        if (isAnimating || index === currentIndex) return;
        setIsAnimating(true);
        setAnimationClass(index > currentIndex ? 'hero-slide-out-left' : 'hero-slide-out-right');
        setTimeout(() => { setCurrentIndex(index); setAnimationClass(index > currentIndex ? 'hero-slide-in-next' : 'hero-slide-in-prev'); setIsAnimating(false); }, 600);
      };

      if (mediaItems.length === 0) return null;
      const currentItem = mediaItems[currentIndex];

      return (
        <section className="relative h-[55vh] sm:h-[85vh] overflow-hidden hero-3d-container">
          <div key={currentItem.id} className={cn('absolute inset-0', animationClass)}>
            <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: `url(${currentItem.thumbnail})` }}>
              <div className="absolute inset-0 bg-gradient-to-r from-gray-950 via-gray-950/80 to-transparent" />
              <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-transparent to-gray-950/50" />
            </div>
            <div className="relative z-10 h-full flex items-center px-4 sm:px-16">
              <div className="max-w-2xl">
                <h1 className="text-3xl sm:text-6xl font-bold mb-4"
                  style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive", background: 'linear-gradient(135deg, #ff6b35, #f7931e)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                  {currentItem.title}
                </h1>
                <div className="flex items-center gap-2 sm:gap-3 text-gray-300 mb-4 sm:mb-6 flex-wrap text-sm sm:text-lg">
                  <span>{currentItem.year}</span><span className="w-1 h-1 bg-gray-400 rounded-full" />
                  <span>{currentItem.rating}</span><span className="w-1 h-1 bg-gray-400 rounded-full" />
                  <span>{currentItem.duration}</span>
                  <span className="w-1 h-1 bg-gray-400 rounded-full hidden sm:inline-block" />
                  <span className="hidden sm:inline">{currentItem.languages}</span>
                </div>
                <p className="text-sm sm:text-lg text-gray-300 mb-4 sm:mb-6 leading-relaxed line-clamp-3">{currentItem.description}</p>
                <div className="flex items-center gap-2 mb-6 sm:mb-8 flex-wrap">
                  {currentItem.genres.slice(0, 4).map((genre, index) => (
                    <span key={index} className="px-2 sm:px-3 py-1 bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-500/30 rounded-full text-xs sm:text-sm">{genre}</span>
                  ))}
                </div>
                <div className="flex items-center gap-3 sm:gap-4">
                  <button onClick={() => { onWatch(currentItem); }} className="px-6 sm:px-8 py-3 sm:py-4 bg-gradient-to-r from-orange-500 via-red-500 to-pink-600 rounded-xl font-bold text-sm sm:text-lg flex items-center gap-2 sm:gap-3 hover:from-orange-600">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg> Watch Now
                  </button>
                </div>
              </div>
            </div>
          </div>
          {mediaItems.length > 1 && (
            <>
              <button onClick={goPrev} disabled={isAnimating} className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 z-20 w-10 h-10 sm:w-12 sm:h-12 bg-black/50 hover:bg-orange-500 rounded-full flex items-center justify-center disabled:opacity-50 transition-colors"><ChevronLeftIcon /></button>
              <button onClick={goNext} disabled={isAnimating} className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 z-20 w-10 h-10 sm:w-12 sm:h-12 bg-black/50 hover:bg-orange-500 rounded-full flex items-center justify-center disabled:opacity-50 transition-colors"><ChevronRightIcon /></button>
              <div className="absolute bottom-4 sm:bottom-6 left-1/2 -translate-x-1/2 z-20 flex gap-2 items-center">
                {mediaItems.slice(0, Math.min(mediaItems.length, 8)).map((_, index) => (
                  <button key={index} onClick={() => goToIndex(index)}
                    className={cn('h-2 rounded-full transition-all', index === currentIndex ? 'w-8 bg-orange-500' : 'w-2 bg-white/40 hover:bg-white/60')} />
                ))}
                {mediaItems.length > 8 && <span className="text-white/60 text-xs ml-2">+{mediaItems.length - 8}</span>}
              </div>
            </>
          )}
        </section>
      );
    }

    // ─── Media Card ───────────────────────────────────────────────────────────────
    function MediaCard({ item, onClick, mode, categoryType }: {
      item: MediaItem; onClick: () => void; mode: string; categoryType: 'movie' | 'series';
    }) {
      const isDeleteMode = mode === 'delete';
      const isEditMode = mode === 'edit';
      return (
        <button onClick={onClick}
          className={cn('flex-shrink-0 group relative transition-all duration-300',
            isDeleteMode ? 'hover:ring-2 hover:ring-red-500' : isEditMode ? 'hover:ring-2 hover:ring-blue-500' : 'hover:scale-105')}>
          <div className="relative w-36 h-52 sm:w-48 sm:h-72 rounded-xl overflow-hidden">
            <img src={item.thumbnail} alt={item.title} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity" />
            {item.isNew && <div className="absolute top-2 right-2 sm:top-3 sm:right-3 px-2 py-1 bg-gradient-to-r from-orange-500 to-red-500 rounded text-xs font-bold">NEW</div>}
            {categoryType === 'series' && <div className="absolute top-2 left-2 sm:top-3 sm:left-3 px-2 py-1 bg-blue-500/80 backdrop-blur-sm rounded text-xs font-bold">📺 Series</div>}
            {isDeleteMode && <div className="absolute inset-0 bg-red-600/50 flex items-center justify-center"><DeleteIcon /></div>}
            {isEditMode && <div className="absolute inset-0 bg-blue-600/50 flex items-center justify-center"><EditIcon /></div>}
            <div className="absolute bottom-0 left-0 right-0 p-2 sm:p-4 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
              <h3 className="text-xs sm:text-base font-bold mb-1 truncate" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>{item.title}</h3>
              <p className="text-[10px] sm:text-sm text-gray-400">{item.year} • {item.duration}</p>
            </div>
          </div>
        </button>
      );
    }

    // ─── Upload Modal ─────────────────────────────────────────────────────────────
    function UploadModal({ onClose, onUpload, existingCategories, categoryTypes }: {
      onClose: () => void; onUpload: (media: MediaItem, type: 'movie' | 'series') => void;
      existingCategories: string[]; categoryTypes: CategoryType[];
    }) {
      const [step, setStep] = useState<'category' | 'form'>('category');
      const [selectedCategory, setSelectedCategory] = useState('');
      const [selectedType, setSelectedType] = useState<'movie' | 'series'>('movie');
      const [showCustomCategory, setShowCustomCategory] = useState(false);
      const [customCategoryName, setCustomCategoryName] = useState('');
      const [showTypeChooser, setShowTypeChooser] = useState(false);
      const [formData, setFormData] = useState({ title: '', description: '', year: new Date().getFullYear().toString(), duration: '', languages: '', genres: '', rating: 'U' });
      const [thumbnail, setThumbnail] = useState('');
      const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
      const [videoFile, setVideoFile] = useState<File | null>(null);
      const [isUploading, setIsUploading] = useState(false);
      const [uploadProgress, setUploadProgress] = useState('');

      const getTypeForCategory = (catName: string): 'movie' | 'series' => {
        const cat = categoryTypes.find(c => c.category_name.toLowerCase().trim() === catName.toLowerCase().trim());
        return cat?.type || 'movie';
      };

      const handleCategorySelect = (cat: string) => { setSelectedCategory(cat); setSelectedType(getTypeForCategory(cat)); setStep('form'); };
      const handleCreateCustomCategory = () => { if (!customCategoryName.trim()) { alert('Please enter a category name'); return; } setShowTypeChooser(true); };
      const handleConfirmCustomCategory = (type: 'movie' | 'series') => { setSelectedCategory(customCategoryName.trim()); setSelectedType(type); setShowTypeChooser(false); setShowCustomCategory(false); setStep('form'); };

      const handleThumbnailUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) { setThumbnailFile(file); const reader = new FileReader(); reader.onloadend = () => setThumbnail(reader.result as string); reader.readAsDataURL(file); }
      };

      const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!thumbnail) { alert('Please upload a thumbnail!'); return; }
        if (selectedType === 'movie' && !videoFile) { alert('Please upload a video file!'); return; }
        setIsUploading(true);
        try {
          let thumbnailUrl = '';
          let videoUrl = '';
          if (thumbnailFile) { setUploadProgress('Uploading thumbnail...'); const r = await uploadToCloudinary(thumbnailFile); thumbnailUrl = r.url; }
          if (videoFile && selectedType === 'movie') { setUploadProgress('Uploading video...'); const r = await uploadToCloudinary(videoFile); videoUrl = r.url; }
          setUploadProgress('Saving...');
          const newMedia: MediaItem = {
            id: Date.now().toString(), title: formData.title, description: formData.description,
            thumbnail: thumbnailUrl, videoUrl, category: selectedCategory, year: formData.year,
            duration: formData.duration || (selectedType === 'series' ? 'Ongoing' : ''),
            languages: formData.languages || '',
            genres: formData.genres.split(',').map(g => g.trim()).filter(g => g),
            rating: formData.rating, isNew: true,
          };
          await onUpload(newMedia, selectedType);
        } catch (err: any) { alert('Upload failed: ' + err.message); }
        finally { setIsUploading(false); setUploadProgress(''); }
      };

      if (step === 'category') {
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
            <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <button onClick={onClose} className="absolute top-4 right-4 z-10 w-10 h-10 bg-gray-800/80 rounded-full flex items-center justify-center hover:bg-gray-700"><CloseIcon /></button>
              <div className="p-6 sm:p-8">
                <h2 className="text-2xl sm:text-3xl font-bold mb-2" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>📁 Choose Category</h2>
                <p className="text-gray-400 mb-6">Select where to add your content</p>
                {showTypeChooser ? (
                  <div className="space-y-4">
                    <h3 className="text-lg font-bold">Is <span className="text-orange-400">"{customCategoryName}"</span> Movies or Series?</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <button onClick={() => handleConfirmCustomCategory('movie')} className="p-6 bg-gradient-to-br from-orange-500/20 to-red-500/20 border-2 border-orange-500 hover:border-orange-400 rounded-xl text-left transition-all">
                        <div className="text-4xl mb-2">🎥</div><h4 className="font-bold text-lg">Movie Format</h4><p className="text-sm text-gray-400 mt-1">Single video per item</p>
                      </button>
                      <button onClick={() => handleConfirmCustomCategory('series')} className="p-6 bg-gradient-to-br from-blue-500/20 to-purple-500/20 border-2 border-blue-500 hover:border-blue-400 rounded-xl text-left transition-all">
                        <div className="text-4xl mb-2">📺</div><h4 className="font-bold text-lg">Series Format</h4><p className="text-sm text-gray-400 mt-1">Multiple episodes per item</p>
                      </button>
                    </div>
                    <button onClick={() => setShowTypeChooser(false)} className="w-full py-2 bg-gray-800 rounded-lg hover:bg-gray-700">← Back</button>
                  </div>
                ) : showCustomCategory ? (
                  <div className="space-y-3">
                    <label className="block text-sm font-medium text-gray-300">New category name</label>
                    <input type="text" value={customCategoryName} onChange={(e) => setCustomCategoryName(e.target.value)}
                      placeholder="e.g. Anime, Documentary" autoFocus
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateCustomCategory(); } }}
                      className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:border-orange-500" />
                    <div className="flex gap-2">
                      <button onClick={() => { setShowCustomCategory(false); setCustomCategoryName(''); }} className="flex-1 py-3 bg-gray-800 rounded-xl hover:bg-gray-700">← Back</button>
                      <button onClick={handleCreateCustomCategory} className="flex-1 py-3 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl font-bold hover:from-orange-600">Next →</button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {existingCategories.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {existingCategories.map(cat => {
                          const type = getTypeForCategory(cat);
                          return (
                            <button key={cat} onClick={() => handleCategorySelect(cat)} className="flex items-center gap-3 p-4 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-orange-500 rounded-xl transition-all text-left">
                              <div className="text-2xl">{type === 'series' ? '📺' : '🎥'}</div>
                              <div className="flex-1 min-w-0"><p className="font-bold truncate">{cat}</p><p className="text-xs text-gray-400 capitalize">{type}</p></div>
                              <ChevronRightIcon />
                            </button>
                          );
                        })}
                      </div>
                    )}
                    <button onClick={() => setShowCustomCategory(true)} className="w-full p-4 border-2 border-dashed border-gray-700 hover:border-orange-500 rounded-xl text-orange-400 hover:bg-orange-500/10 transition-all flex items-center justify-center gap-2 font-bold">
                      <PlusIcon /> Create New Category
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      }

      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
          <div className="relative bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <button onClick={onClose} className="absolute top-4 right-4 z-10 w-10 h-10 bg-gray-800/80 rounded-full flex items-center justify-center hover:bg-gray-700"><CloseIcon /></button>
            <div className="p-4 sm:p-8">
              <button onClick={() => setStep('category')} className="text-orange-400 hover:text-orange-300 mb-4 flex items-center gap-1 text-sm">← Change Category</button>
              <h2 className="text-2xl sm:text-3xl font-bold mb-2" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>
                {selectedType === 'series' ? '📺 Create Series' : '🎬 Upload Movie'}
              </h2>
              <p className="text-gray-400 mb-6 text-sm">Category: <span className="text-orange-400 font-bold">{selectedCategory}</span>{selectedType === 'series' && <span className="text-gray-500"> • Episodes added after</span>}</p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">{selectedType === 'series' ? 'Series Poster *' : 'Thumbnail *'}</label>
                  {thumbnail ? (
                    <div className="relative w-full h-48 rounded-xl overflow-hidden group">
                      <img src={thumbnail} alt="preview" className="w-full h-full object-cover" />
                      <label className="absolute inset-0 bg-black/0 hover:bg-black/60 cursor-pointer flex items-center justify-center opacity-0 group-hover:opacity-100 transition-colors">
                        <span className="text-white font-bold">📷 Click to change</span>
                        <input type="file" accept="image/*" onChange={handleThumbnailUpload} className="hidden" />
                      </label>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-gray-700 rounded-xl cursor-pointer hover:border-orange-500 hover:bg-orange-500/5 transition-all">
                      <UploadIcon /><span className="mt-2 text-gray-400 text-sm">Upload {selectedType === 'series' ? 'poster' : 'thumbnail'}</span>
                      <span className="text-xs text-gray-600 mt-1">JPG, PNG, WebP</span>
                      <input type="file" accept="image/*" onChange={handleThumbnailUpload} className="hidden" />
                    </label>
                  )}
                </div>
                {selectedType === 'movie' && (
                  <div>
                    <label className="block text-sm font-medium mb-2">Video File *</label>
                    <label className="flex items-center gap-3 w-full p-4 border border-gray-700 rounded-xl cursor-pointer hover:border-orange-500 transition-colors">
                      <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0"><UploadIcon /></div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate text-sm">{videoFile ? videoFile.name : 'Click to upload video'}</p>
                        <p className="text-xs text-gray-500">{videoFile ? `${(videoFile.size / 1024 / 1024).toFixed(1)} MB` : 'MP4, WebM, MKV'}</p>
                      </div>
                      <input type="file" accept="video/*" onChange={(e) => setVideoFile(e.target.files?.[0] || null)} className="hidden" />
                    </label>
                  </div>
                )}
                {selectedType === 'series' && (
                  <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                    <p className="text-blue-400 text-sm">📺 After creating the series, you'll be taken directly to add episodes.</p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-2">Title *</label>
                  <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                    placeholder={selectedType === 'series' ? 'Series name' : 'Movie title'}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:border-orange-500" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Description *</label>
                  <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    placeholder="What's it about?" className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:border-orange-500 resize-none" rows={3} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-2">Year</label>
                    <input type="text" value={formData.year} onChange={(e) => setFormData({ ...formData, year: e.target.value })} className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:border-orange-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Rating</label>
                    <select value={formData.rating} onChange={(e) => setFormData({ ...formData, rating: e.target.value })} className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:border-orange-500">
                      <option value="U">U</option><option value="U/A">U/A</option><option value="A">A</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-2">{selectedType === 'series' ? 'Seasons' : 'Duration'}</label>
                    <input type="text" value={formData.duration} onChange={(e) => setFormData({ ...formData, duration: e.target.value })}
                      placeholder={selectedType === 'series' ? '2 Seasons' : '2h 15m'} className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:border-orange-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Languages</label>
                    <input type="text" value={formData.languages} onChange={(e) => setFormData({ ...formData, languages: e.target.value })}
                      placeholder="English, Hindi" className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:border-orange-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Genres (comma separated)</label>
                  <input type="text" value={formData.genres} onChange={(e) => setFormData({ ...formData, genres: e.target.value })}
                    placeholder="Action, Comedy, Drama" className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:border-orange-500" />
                </div>
                {isUploading && uploadProgress && (
                  <div className="flex items-center gap-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl">
                    <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    <p className="text-orange-400 text-sm">{uploadProgress}</p>
                  </div>
                )}
                <button type="submit" disabled={isUploading || !formData.title || !formData.description || !thumbnail || (selectedType === 'movie' && !videoFile)}
                  className="w-full py-3 sm:py-4 bg-gradient-to-r from-orange-500 via-red-500 to-pink-600 rounded-xl font-bold text-base hover:from-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all">
                  {isUploading ? 'Uploading...' : selectedType === 'series' ? '📺 Create Series & Add Episodes →' : '🚀 Upload Movie'}
                </button>
              </form>
            </div>
          </div>
        </div>
      );
    }

    // ─── Edit Modal ───────────────────────────────────────────────────────────────
    function EditModal({ media, onClose, onSave, existingCategories, categoryTypes }: {
      media: MediaItem; onClose: () => void; onSave: (m: MediaItem) => void;
      existingCategories: string[]; categoryTypes: CategoryType[];
    }) {
      const getTypeForCategory = (catName: string): 'movie' | 'series' => {
        const cat = categoryTypes.find(c => c.category_name.toLowerCase().trim() === catName.toLowerCase().trim());
        return cat?.type || 'movie';
      };

      const [formData, setFormData] = useState({
        title: media.title, description: media.description, category: media.category,
        year: media.year, duration: media.duration, languages: media.languages,
        genres: media.genres.join(', '), rating: media.rating,
      });
      const [thumbnail, setThumbnail] = useState(media.thumbnail);
      const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
      const [videoFile, setVideoFile] = useState<File | null>(null);
      const [isUploading, setIsUploading] = useState(false);
      const [uploadProgress, setUploadProgress] = useState('');
      const isSeries = getTypeForCategory(formData.category) === 'series';

      const handleThumbnailUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) { setThumbnailFile(file); const reader = new FileReader(); reader.onloadend = () => setThumbnail(reader.result as string); reader.readAsDataURL(file); }
      };

      const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsUploading(true);
        try {
          let thumbnailUrl = media.thumbnail;
          let videoUrl = media.videoUrl;
          if (thumbnailFile) { setUploadProgress('Uploading thumbnail...'); const r = await uploadToCloudinary(thumbnailFile); thumbnailUrl = r.url; }
          if (videoFile && !isSeries) { setUploadProgress('Uploading video...'); const r = await uploadToCloudinary(videoFile); videoUrl = r.url; }
          setUploadProgress('Saving...');
          const updatedMedia: MediaItem = {
            ...media, title: formData.title, description: formData.description,
            thumbnail: thumbnailUrl, videoUrl, category: formData.category,
            year: formData.year, duration: formData.duration, languages: formData.languages,
            genres: formData.genres.split(',').map(g => g.trim()).filter(g => g), rating: formData.rating,
          };
          await onSave(updatedMedia);
        } catch (err: any) { alert('Update failed: ' + err.message); }
        finally { setIsUploading(false); setUploadProgress(''); }
      };

      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
          <div className="relative bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <button onClick={onClose} className="absolute top-4 right-4 z-10 w-10 h-10 bg-gray-800/80 rounded-full flex items-center justify-center hover:bg-gray-700"><CloseIcon /></button>
            <div className="p-4 sm:p-8">
              <h2 className="text-2xl sm:text-3xl font-bold mb-2" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>✏️ Edit Media</h2>
              <p className="text-gray-400 mb-6 text-sm">{isSeries ? '📺 Series' : '🎥 Movie'} • <span className="text-orange-400">{formData.category}</span></p>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Thumbnail (click to change)</label>
                  <div className="relative w-full h-48 rounded-xl overflow-hidden group">
                    <img src={thumbnail} alt="preview" className="w-full h-full object-cover" />
                    <label className="absolute inset-0 bg-black/0 hover:bg-black/60 cursor-pointer flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <span className="text-white font-bold">📷 Change</span>
                      <input type="file" accept="image/*" onChange={handleThumbnailUpload} className="hidden" />
                    </label>
                  </div>
                </div>
                {!isSeries && (
                  <div>
                    <label className="block text-sm font-medium mb-2">Video (leave blank to keep)</label>
                    <label className="flex items-center gap-3 w-full p-4 border border-gray-700 rounded-xl cursor-pointer hover:border-orange-500 transition-colors">
                      <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center flex-shrink-0"><UploadIcon /></div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium truncate text-sm">{videoFile ? videoFile.name : 'Click to change video'}</p>
                        <p className="text-xs text-gray-500">{videoFile ? `${(videoFile.size / 1024 / 1024).toFixed(1)} MB` : 'Leave blank to keep current'}</p>
                      </div>
                      <input type="file" accept="video/*" onChange={(e) => setVideoFile(e.target.files?.[0] || null)} className="hidden" />
                    </label>
                  </div>
                )}
                {isSeries && (
                  <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl">
                    <p className="text-blue-400 text-sm">📺 To manage episodes, close this and click <strong>"Manage Episodes"</strong>.</p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium mb-2">Title *</label>
                  <input type="text" value={formData.title} onChange={(e) => setFormData({ ...formData, title: e.target.value })} className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:border-orange-500" required />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Description *</label>
                  <textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:border-orange-500 resize-none" rows={3} required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-2">Category</label>
                    <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })} className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:border-orange-500">
                      {existingCategories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Rating</label>
                    <select value={formData.rating} onChange={(e) => setFormData({ ...formData, rating: e.target.value })} className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:border-orange-500">
                      <option value="U">U</option><option value="U/A">U/A</option><option value="A">A</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-2">Year</label>
                    <input type="text" value={formData.year} onChange={(e) => setFormData({ ...formData, year: e.target.value })} className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:border-orange-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">Duration</label>
                    <input type="text" value={formData.duration} onChange={(e) => setFormData({ ...formData, duration: e.target.value })} className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:border-orange-500" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Languages</label>
                  <input type="text" value={formData.languages} onChange={(e) => setFormData({ ...formData, languages: e.target.value })} placeholder="English, Hindi" className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:border-orange-500" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Genres (comma separated)</label>
                  <input type="text" value={formData.genres} onChange={(e) => setFormData({ ...formData, genres: e.target.value })} placeholder="Action, Comedy" className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:border-orange-500" />
                </div>
                {isUploading && uploadProgress && (
                  <div className="flex items-center gap-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl">
                    <div className="w-4 h-4 border-2 border-orange-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    <p className="text-orange-400 text-sm">{uploadProgress}</p>
                  </div>
                )}
                <button type="submit" disabled={isUploading} className="w-full py-3 bg-gradient-to-r from-orange-500 via-red-500 to-pink-600 rounded-xl font-bold hover:from-orange-600 disabled:opacity-50 disabled:cursor-not-allowed">
                  {isUploading ? 'Saving...' : '💾 Save Changes'}
                </button>
              </form>
            </div>
          </div>
        </div>
      );
    }

    
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
  idMal: number | null;
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
      idMal
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
        const data = await anilistFetch(ANIME_LIST_QUERY, { search: q, page: 1, perPage: 30, sort: ['SEARCH_MATCH'] });
        setSearchResults(data.Page.media || []);
      } catch (e) { console.error(e); }
      setIsLoading(false);
    }, 500);
  };

  const totalEpisodes = (a: AniListAnime) => {
    if (a.status === 'RELEASING' && a.nextAiringEpisode?.episode) {
      return Math.max(1, a.nextAiringEpisode.episode - 1);
    }
    if (a.episodes && a.episodes > 0) return a.episodes;
    return 12;
  };

  const [dubAvailable, setDubAvailable] = useState<{[id:number]: boolean}>({});

  const checkDubAvailable = async (anime: AniListAnime) => {
    if (dubAvailable[anime.id] !== undefined) return;
    try {
      const url = `https://megaplay.buzz/stream/ani/${anime.id}/1/dub`;
      const res = await fetch(url, { method: 'HEAD', mode: 'no-cors' });
      // no-cors always succeeds if server responds, fails on network error
      setDubAvailable(prev => ({ ...prev, [anime.id]: true }));
    } catch(e) {
      setDubAvailable(prev => ({ ...prev, [anime.id]: false }));
    }
  };

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

  // Auto-check dub when anime detail opens
  useEffect(() => {
    if (selectedAnime) checkDubAvailable(selectedAnime);
  }, [selectedAnime]);

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
            <button key={anime.id} onClick={() => { setSelectedAnime(anime); setSelectedEpisode(1); }}
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
                  <select value={selectedEpisode || 1} onChange={e => setSelectedEpisode(Number(e.target.value))}
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
              <button onClick={() => startStream(selectedAnime, selectedEpisode || 1)}
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
              <span className="text-[10px] text-gray-500 flex-shrink-0">Server:</span>
              {ANIME_PROVIDERS.filter(p =>
                p.name !== 'DUB' || dubAvailable[selectedAnime.id] === true
              ).map((p, i) => (
                <button key={i} onClick={() => startStream(selectedAnime, selectedEpisode, i)}
                  className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                    selectedProvider === i
                      ? (p.name === 'DUB' ? 'bg-blue-500 border-blue-400 text-white' : 'bg-purple-500 border-purple-400 text-white')
                      : 'bg-gray-800/80 border-gray-700 text-gray-400 hover:text-white'
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
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
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

// ─── Catalog Endpoints (module level to avoid hoisting issues) ───────────────
// CATALOG_ENDPOINTS moved to module level

// ─── Online Section ───────────────────────────────────────────────────────────
    const CATALOG_ENDPOINTS: {[key:string]: string} = {
  bollywood: '/discover/movie?language=en-US&sort_by=popularity.desc&with_original_language=hi&region=IN',
  south: '/discover/movie?language=en-US&sort_by=popularity.desc&with_original_language=ta%7Cte%7Cml%7Ckn&region=IN',
  kdrama: '/discover/tv?language=en-US&sort_by=popularity.desc&with_original_language=ko',
  toprated: '/movie/top_rated?language=en-US&region=IN',
  upcoming: '/movie/upcoming?language=en-US&region=IN',
};

function OnlineSection({ onGoHome }: { onGoHome: () => void }) {
      const [mode, setMode] = useState<'movies' | 'anime'>('movies');
      const [catalogData, setCatalogData] = useState<{[key:string]: TMDBMovie[]}>({});
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
      const [hasMore, setHasMore] = useState(true);
      const [seasons, setSeasons] = useState<any[]>([]);
      const [selectedSeason, setSelectedSeason] = useState(1);
      const [selectedEpisode, setSelectedEpisode] = useState(1);
      const [episodeCount, setEpisodeCount] = useState(1);
      const [showTVControls, setShowTVControls] = useState(false);
      const [iframeKey, setIframeKey] = useState(0);
      const [selectedProvider, setSelectedProvider] = useState(0);
      const [watchHistory, setWatchHistory] = useState<WatchHistoryEntry[]>([]);
      const searchTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
      const isNoApiKey = !TMDB_API_KEY;

      useEffect(() => {
        setWatchHistory(WatchHistoryStore.getAll());
      }, [activeTab]);

      useEffect(() => {
        if (!isNoApiKey) { fetchTrending(); fetchMovies(1); fetchSeries(1); }
      }, []);

      useEffect(() => {
        if (!isNoApiKey && ['bollywood','south','kdrama','toprated','upcoming'].includes(activeTab)) {
          if (!catalogData[activeTab] || catalogData[activeTab].length === 0) {
            fetchCatalog(activeTab, CATALOG_ENDPOINTS[activeTab], 1);
          }
        }
      }, [activeTab]);

      const tmdbFetch = async (url: string) => {
        const res = await fetch(`${TMDB_BASE}${url}&api_key=${TMDB_API_KEY}`);
        if (!res.ok) throw new Error('TMDB fetch failed');
        return res.json();
      };

      const fetchTrending = async () => {
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

      // CATALOG_ENDPOINTS moved to module level

      const handleSearch = (q: string) => {
        setSearchQuery(q);
        clearTimeout(searchTimeoutRef.current);
        if (!q.trim()) { setSearchResults([]); return; }
        searchTimeoutRef.current = setTimeout(async () => {
          setIsLoading(true);
          try {
            const data = await tmdbFetch(`/search/multi?query=${encodeURIComponent(q)}&language=en-US&page=1`);
            setSearchResults((data.results || []).filter((r: TMDBMovie) => r.media_type === 'movie' || r.media_type === 'tv'));
          } catch (e) { console.error(e); }
          setIsLoading(false);
        }, 500);
      };

      const fetchTVDetails = async (id: number) => {
        try {
          const data = await tmdbFetch(`/tv/${id}?language=en-US`);
          setSeasons(data.seasons?.filter((s: any) => s.season_number > 0) || []);
          const s1 = data.seasons?.find((s: any) => s.season_number === 1);
          setEpisodeCount(s1?.episode_count || 1);
        } catch (e) { console.error(e); }
      };

      const fetchEpisodeCount = async (id: number, season: number) => {
        try {
          const data = await tmdbFetch(`/tv/${id}/season/${season}?language=en-US`);
          setEpisodeCount(data.episodes?.length || 1);
        } catch (e) { console.error(e); }
      };

      const isTV = (item: TMDBMovie) => item.media_type === 'tv' || (!item.title && !!item.name);

      const openItem = async (item: TMDBMovie) => {
        setSelectedItem(item);
        const prev = WatchHistoryStore.getEntry(item.id);
        const s = prev?.season ?? 1;
        const e = prev?.episode ?? 1;
        setSelectedSeason(s);
        setSelectedEpisode(e);
        if (isTV(item)) {
          await fetchTVDetails(item.id);
          if (prev && prev.season > 1) await fetchEpisodeCount(item.id, prev.season);
          setShowTVControls(true);
        } else {
          setShowTVControls(false);
          setSeasons([]);
        }
      };

      const buildStreamUrl = (item: TMDBMovie, season = 1, episode = 1, providerIndex = selectedProvider) => {
  const p = STREAM_PROVIDERS[providerIndex];
  return isTV(item) ? p.getTVUrl(item.id, season, episode) : p.getMovieUrl(item.id);
};
const startStream = (item: TMDBMovie, season = selectedSeason, episode = selectedEpisode, providerIndex = selectedProvider) => {
  WatchHistoryStore.add(item, season, episode);
  setWatchHistory(WatchHistoryStore.getAll());
  const url = buildStreamUrl(item, season, episode, providerIndex);
        setSelectedItem(item);
        setPlayerUrl(url);
        setIframeKey(prev => prev + 1);
        setShowPlayer(true);
      };

      const handleSeasonChange = async (s: number) => {
        setSelectedSeason(s); setSelectedEpisode(1);
        if (selectedItem) await fetchEpisodeCount(selectedItem.id, s);
      };

      const getTitle = (item: TMDBMovie) => item.title || item.name || 'Unknown';
      const getYear = (item: TMDBMovie) => (item.release_date || item.first_air_date || '').slice(0, 4);
      const getGenres = (item: TMDBMovie) => (item.genre_ids || []).slice(0, 3).map(id => TMDB_GENRES[id]).filter(Boolean);
      const currentList = activeTab === 'trending' ? trending
        : activeTab === 'movies' ? movies
        : activeTab === 'series' ? series
        : activeTab === 'search' ? searchResults
        : ['bollywood','south','kdrama','toprated','upcoming'].includes(activeTab) ? (catalogData[activeTab] || [])
        : [];

      const timeAgo = (ts: number) => {
        const diff = Date.now() - ts;
        const m = Math.floor(diff / 60000);
        const h = Math.floor(diff / 3600000);
        const d = Math.floor(diff / 86400000);
        if (m < 1) return 'Just now';
        if (m < 60) return `${m}m ago`;
        if (h < 24) return `${h}h ago`;
        return `${d}d ago`;
      };

      if (isNoApiKey) {
        return (
          <div className="min-h-[60vh] flex items-center justify-center px-4">
            <div className="text-center max-w-lg">
              <div className="text-7xl mb-6">🔑</div>
              <h2 className="text-3xl font-bold mb-4" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>TMDB API Key Required</h2>
              <div className="bg-gray-800 rounded-2xl p-6 text-left space-y-3 mb-6">
                <p className="text-orange-400 font-bold">📋 Setup Steps:</p>
                <ol className="space-y-2 text-gray-300 text-sm list-decimal list-inside">
                  <li>Go to <a href="https://www.themoviedb.org/" target="_blank" rel="noreferrer" className="text-orange-400 underline">themoviedb.org</a> and create a free account</li>
                  <li>Navigate to Settings → API → Create API Key</li>
                  <li>Copy your API key (v3 auth)</li>
                  <li>Add to your <code className="bg-gray-900 px-1 rounded">.env</code> file:</li>
                </ol>
                <div className="bg-gray-900 rounded-lg p-3 font-mono text-sm text-green-400 select-all">VITE_TMDB_API_KEY=your_api_key_here</div>
                <p className="text-gray-300 text-sm">5. Restart your dev server</p>
              </div>
              <p className="text-gray-500 text-sm">TMDB API is completely free for non-commercial use 🎉</p>
            </div>
          </div>
        );
      }

      return (
        <div className="px-4 sm:px-8 pb-16 pt-4">
          {/* ── Mode Toggle ── */}
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
          </div>

          {/* ── Continue Watching strip ── */}
          {activeTab !== 'history' && watchHistory.length > 0 && (
            <div className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-bold flex items-center gap-2"><span>▶️</span> Continue Watching</h3>
                <button onClick={() => setActiveTab('history')} className="text-xs text-orange-400 hover:text-orange-300 transition-colors">See all →</button>
              </div>
              <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2" style={{ scrollbarWidth: 'none' }}>
                {watchHistory.slice(0, 10).map((entry) => (
                  <div key={entry.item.id} className="flex-shrink-0 w-36 sm:w-44 group relative">
                    <button onClick={() => openItem(entry.item)} className="w-full relative rounded-xl overflow-hidden bg-gray-800 block" style={{ aspectRatio: '2/3' }}>
                      {entry.item.poster_path ? (
                        <img src={`${TMDB_IMG}${entry.item.poster_path}`} alt={getTitle(entry.item)} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800">
                          <span className="text-3xl">{isTV(entry.item) ? '📺' : '🎬'}</span>
                        </div>
                      )}
                      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-12 h-12 bg-orange-500/90 rounded-full flex items-center justify-center"><PlayIcon /></div>
                      </div>
                      {isTV(entry.item) && (
                        <div className="absolute top-2 left-2 px-2 py-0.5 bg-orange-500/90 rounded text-xs font-bold">S{entry.season}E{entry.episode}</div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-gray-700">
                        <div className="h-full bg-orange-500 rounded-full" style={{ width: '40%' }} />
                      </div>
                    </button>
                    <div className="mt-1.5 px-0.5">
                      <p className="text-xs font-semibold truncate">{getTitle(entry.item)}</p>
                      <div className="flex items-center justify-between mt-0.5">
                        <p className="text-[10px] text-gray-500">{timeAgo(entry.watchedAt)}</p>
                        <button onClick={(e) => { e.stopPropagation(); WatchHistoryStore.remove(entry.item.id); setWatchHistory(WatchHistoryStore.getAll()); }} className="text-[10px] text-gray-600 hover:text-red-400 transition-colors" title="Remove">✕</button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── History Tab ── */}
          {activeTab === 'history' && (
            <div>
              {watchHistory.length === 0 ? (
                <div className="text-center py-24">
                  <div className="text-6xl mb-4">🕐</div>
                  <h3 className="text-xl font-bold mb-2" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>No watch history yet</h3>
                  <p className="text-gray-400 text-sm">Start watching something and it'll appear here</p>
                  <button onClick={() => setActiveTab('trending')} className="mt-6 px-6 py-3 bg-gradient-to-r from-orange-500 to-red-500 rounded-xl font-bold hover:from-orange-600 transition-all">🔥 Browse Trending</button>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-xl font-bold">🕐 Watch History<span className="text-sm text-gray-500 font-normal ml-2">({watchHistory.length} titles)</span></h3>
                    <button onClick={() => { if (window.confirm('Clear all watch history?')) { WatchHistoryStore.clear(); setWatchHistory([]); } }} className="text-xs text-red-400 hover:text-red-300 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-all">🗑️ Clear All</button>
                  </div>
                  <div className="space-y-3">
                    {watchHistory.map((entry) => (
                      <div key={`${entry.item.id}-${entry.watchedAt}`} className="flex items-center gap-3 sm:gap-4 p-3 bg-gray-800/60 hover:bg-gray-800 rounded-2xl transition-colors group">
                        <button onClick={() => openItem(entry.item)} className="flex-shrink-0 w-14 h-20 sm:w-16 sm:h-24 rounded-xl overflow-hidden bg-gray-700 relative">
                          {entry.item.poster_path ? (
                            <img src={`${TMDB_IMG}${entry.item.poster_path}`} alt={getTitle(entry.item)} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center"><span className="text-2xl">{isTV(entry.item) ? '📺' : '🎬'}</span></div>
                          )}
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 flex items-center justify-center transition-all">
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity"><PlayIcon /></div>
                          </div>
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-sm sm:text-base truncate">{getTitle(entry.item)}</p>
                          <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <span className="text-xs text-gray-400">{getYear(entry.item)}</span>
                            {isTV(entry.item) && <span className="text-xs bg-orange-500/20 text-orange-400 px-2 py-0.5 rounded-full font-semibold">S{entry.season}E{entry.episode}</span>}
                            <span className="text-xs text-gray-400">{isTV(entry.item) ? '📺 Series' : '🎬 Movie'}</span>
                          </div>
                          <p className="text-xs text-gray-600 mt-1">{timeAgo(entry.watchedAt)}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button onClick={() => startStream(entry.item, entry.season, entry.episode)} className="px-3 py-2 bg-orange-500 hover:bg-orange-600 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors">
                            <PlayIcon /><span className="hidden sm:inline">{isTV(entry.item) ? `S${entry.season}E${entry.episode}` : 'Play'}</span>
                          </button>
                          <button onClick={() => { WatchHistoryStore.remove(entry.item.id); setWatchHistory(WatchHistoryStore.getAll()); }} className="w-8 h-8 flex items-center justify-center text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all" title="Remove from history">✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Search Bar ── */}
          {activeTab === 'search' && (
            <div className="mb-6">
              <div className="relative">
                <input type="text" value={searchQuery} onChange={e => handleSearch(e.target.value)} placeholder="Search movies & TV shows..." autoFocus
                  className="w-full px-4 py-3 pl-12 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:border-orange-500 text-white" />
                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"><SearchIcon /></div>
                {searchQuery && (<button onClick={() => { setSearchQuery(''); setSearchResults([]); }} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"><CloseIcon /></button>)}
              </div>
              {searchQuery && !isLoading && (<p className="text-sm text-gray-400 mt-2">{searchResults.length > 0 ? `Found ${searchResults.length} result${searchResults.length !== 1 ? 's' : ''}` : 'No results found'}</p>)}
            </div>
          )}

          {/* ── Loading ── */}
          {isLoading && currentList.length === 0 && activeTab !== 'history' && (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="w-16 h-16 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-400">Fetching from TMDB...</p>
              </div>
            </div>
          )}

          {/* ── Grid ── */}
          {activeTab !== 'history' && currentList.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
              {currentList.map(item => {
                const histEntry = WatchHistoryStore.getEntry(item.id);
                return (
                  <div key={`${item.id}-${item.media_type}`} className="relative">
                    <TMDBCard item={item} isTV={isTV(item)} getTitle={getTitle} getYear={getYear} getGenres={getGenres} onClick={() => openItem(item)} />
                    {histEntry && (
                      <div className="absolute top-2 left-2 right-2 pointer-events-none">
                        <div className="bg-orange-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full text-center truncate">
                          {isTV(item) ? `▶ S${histEntry.season}E${histEntry.episode}` : '▶ Resume'}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Load More ── */}
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
          )}

          {/* ── Empty search ── */}
          {activeTab === 'search' && !searchQuery && (
            <div className="text-center py-20">
              <div className="text-6xl mb-4">🎬</div>
              <h3 className="text-xl font-bold mb-2" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>Search Millions of Titles</h3>
              <p className="text-gray-400">Movies, TV shows, documentaries and more</p>
            </div>
          )}
          </>)}

          {/* ── Detail Modal ── */}
          {selectedItem && !showPlayer && (
            <TMDBDetailModal
              item={selectedItem} isTV={isTV(selectedItem)} seasons={seasons}
              selectedSeason={selectedSeason} selectedEpisode={selectedEpisode} episodeCount={episodeCount}
              getTitle={getTitle} getYear={getYear} getGenres={getGenres}
              onClose={() => { setSelectedItem(null); setShowTVControls(false); }}
              onWatch={() => startStream(selectedItem!)}
              onSeasonChange={handleSeasonChange} onEpisodeChange={setSelectedEpisode}
              showTVControls={showTVControls}
              watchHistoryEntry={WatchHistoryStore.getEntry(selectedItem.id)}
              onResume={(entry) => startStream(entry.item, entry.season, entry.episode)}
            />
          )}

          {/* ── Player ── */}
          {showPlayer && selectedItem && (
            <TMDBPlayer
              item={selectedItem} playerUrl={playerUrl} iframeKey={iframeKey}
              isTV={isTV(selectedItem)} selectedSeason={selectedSeason}
              selectedEpisode={selectedEpisode} episodeCount={episodeCount} seasons={seasons}
              getTitle={getTitle}
              onClose={() => { setShowPlayer(false); setPlayerUrl(''); }}
              onSeasonChange={async (s) => { setSelectedSeason(s); setSelectedEpisode(1); await fetchEpisodeCount(selectedItem.id, s); startStream(selectedItem, s, 1); }}
              onEpisodeChange={(e) => { setSelectedEpisode(e); startStream(selectedItem, selectedSeason, e); }}
              onPrevEpisode={() => { if (selectedEpisode > 1) { const e = selectedEpisode - 1; setSelectedEpisode(e); startStream(selectedItem, selectedSeason, e); } }}
              onNextEpisode={() => { if (selectedEpisode < episodeCount) { const e = selectedEpisode + 1; setSelectedEpisode(e); startStream(selectedItem, selectedSeason, e); } }}
              onGoHome={onGoHome}
              selectedProvider={selectedProvider}
              onProviderChange={(i) => { setSelectedProvider(i); startStream(selectedItem, selectedSeason, selectedEpisode, i); }}
            />
          )}
        </div>
      );
    }

    // ─── TMDB Card ────────────────────────────────────────────────────────────────
    function TMDBCard({ item, isTV, getTitle, getYear, getGenres, onClick }: {
      item: TMDBMovie; isTV: boolean;
      getTitle: (i: TMDBMovie) => string; getYear: (i: TMDBMovie) => string;
      getGenres: (i: TMDBMovie) => string[]; onClick: () => void;
    }) {
      const [imgError, setImgError] = useState(false);
      const rating = item.vote_average?.toFixed(1);
      return (
        <button onClick={onClick} className="group relative flex-shrink-0 text-left hover:scale-105 transition-all duration-300">
          <div className="relative rounded-xl overflow-hidden bg-gray-800 aspect-[2/3]">
            {item.poster_path && !imgError ? (
              <img src={`${TMDB_IMG}${item.poster_path}`} alt={getTitle(item)} className="w-full h-full object-cover" onError={() => setImgError(true)} />
            ) : (
              <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-700 to-gray-800"><span className="text-4xl">{isTV ? '📺' : '🎬'}</span></div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="absolute top-2 left-2 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-lg flex items-center gap-1">
              <span className="text-yellow-400 text-xs">⭐</span><span className="text-white text-xs font-bold">{rating}</span>
            </div>
            <div className="absolute top-2 right-2 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-lg text-xs font-bold">{isTV ? '📺' : '🎬'}</div>
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <div className="w-14 h-14 bg-orange-500/90 rounded-full flex items-center justify-center"><PlayIcon /></div>
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-3 opacity-0 group-hover:opacity-100 transition-opacity">
              <p className="font-bold text-sm truncate" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>{getTitle(item)}</p>
              <p className="text-xs text-gray-300">{getYear(item)}</p>
              {getGenres(item).length > 0 && <p className="text-xs text-orange-400 truncate">{getGenres(item).join(' • ')}</p>}
            </div>
          </div>
          <p className="mt-1.5 text-xs text-gray-400 truncate px-0.5 sm:hidden">{getTitle(item)}</p>
        </button>
      );
    }

    // ─── TMDB Detail Modal ────────────────────────────────────────────────────────
    function TMDBDetailModal({
      item, isTV, seasons, selectedSeason, selectedEpisode, episodeCount,
      getTitle, getYear, getGenres,
      onClose, onWatch, onSeasonChange, onEpisodeChange, showTVControls,
      watchHistoryEntry, onResume,
    }: {
      item: TMDBMovie; isTV: boolean; seasons: any[];
      selectedSeason: number; selectedEpisode: number; episodeCount: number;
      getTitle: (i: TMDBMovie) => string; getYear: (i: TMDBMovie) => string; getGenres: (i: TMDBMovie) => string[];
      onClose: () => void; onWatch: () => void; onSeasonChange: (s: number) => void;
      onEpisodeChange: (e: number) => void; showTVControls: boolean;
      watchHistoryEntry?: WatchHistoryEntry | null;
      onResume?: (entry: WatchHistoryEntry) => void;
    }) {
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" onClick={onClose} />
          <div className="relative bg-gray-900 rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <button onClick={onClose} className="absolute top-4 right-4 z-10 w-10 h-10 bg-gray-800/80 rounded-full flex items-center justify-center hover:bg-gray-700"><CloseIcon /></button>
            <div className="relative h-48 sm:h-64">
              {item.backdrop_path ? (
                <img src={`${TMDB_IMG_ORIG}${item.backdrop_path}`} alt={getTitle(item)} className="w-full h-full object-cover rounded-t-2xl" />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-gray-700 to-gray-800 rounded-t-2xl flex items-center justify-center"><span className="text-7xl">{isTV ? '📺' : '🎬'}</span></div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-gray-900 to-transparent rounded-t-2xl" />
              <div className="absolute bottom-4 left-4 right-12">
                <h2 className="text-2xl sm:text-3xl font-bold" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>{getTitle(item)}</h2>
                <div className="flex items-center gap-2 text-sm text-gray-300 flex-wrap mt-1">
                  <span>{getYear(item)}</span>
                  {item.vote_average > 0 && (<><span className="w-1 h-1 bg-gray-400 rounded-full" /><span>⭐ {item.vote_average.toFixed(1)}/10</span></>)}
                  <span className="w-1 h-1 bg-gray-400 rounded-full" />
                  <span className="text-orange-400 font-bold">{isTV ? '📺 Series' : '🎬 Movie'}</span>
                </div>
              </div>
            </div>
            <div className="p-4 sm:p-6 space-y-4">
              {getGenres(item).length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {getGenres(item).map(g => <span key={g} className="px-3 py-1 bg-orange-500/20 border border-orange-500/30 rounded-full text-xs">{g}</span>)}
                </div>
              )}
              {item.overview && <p className="text-gray-300 text-sm leading-relaxed">{item.overview}</p>}
              {watchHistoryEntry && onResume && (
                <div className="flex items-center gap-3 p-3 bg-orange-500/10 border border-orange-500/30 rounded-xl">
                  <span className="text-2xl">▶️</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-orange-400 text-sm font-bold">Continue Watching</p>
                    <p className="text-gray-400 text-xs">{isTV ? `Last watched S${watchHistoryEntry.season}E${watchHistoryEntry.episode}` : 'You watched this before'}</p>
                  </div>
                  <button onClick={() => onResume(watchHistoryEntry)} className="px-4 py-2 bg-orange-500 hover:bg-orange-600 rounded-xl text-sm font-bold transition-colors flex items-center gap-1.5 flex-shrink-0">
                    <PlayIcon /> Resume
                  </button>
                </div>
              )}
              {isTV && showTVControls && seasons.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Season</label>
                    <select value={selectedSeason} onChange={e => onSeasonChange(Number(e.target.value))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-orange-500 text-sm">
                      {seasons.map(s => <option key={s.season_number} value={s.season_number}>Season {s.season_number} ({s.episode_count} eps)</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-gray-400 mb-1">Episode</label>
                    <select value={selectedEpisode} onChange={e => onEpisodeChange(Number(e.target.value))} className="w-full px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg focus:outline-none focus:border-orange-500 text-sm">
                      {Array.from({ length: episodeCount }, (_, i) => <option key={i + 1} value={i + 1}>Episode {i + 1}</option>)}
                    </select>
                  </div>
                </div>
              )}
             <div className="flex items-center gap-3 p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
  <span className="text-xl">🎬</span>
                <div>
                  <p className="text-green-400 text-sm font-bold">Powered by VidSrc & 2Embed</p>
                  <p className="text-gray-400 text-xs">You can switch servers inside the player. Use an ad blocker for best experience.</p>
                </div>
              </div>
              <button onClick={onWatch} className="w-full py-4 bg-gradient-to-r from-orange-500 via-red-500 to-pink-600 rounded-xl font-bold text-lg flex items-center justify-center gap-3 hover:from-orange-600 transition-all">
                <PlayIcon />
                {isTV ? `▶ Play S${selectedSeason}E${selectedEpisode}` : (watchHistoryEntry ? '▶ Watch Again' : '▶ Watch Now')}
              </button>
              <p className="text-gray-600 text-xs text-center">⚠️ Content is provided by third-party embed services. For educational/personal use only.</p>
            </div>
          </div>
        </div>
      );
    }

    // ─── TMDB Player ──────────────────────────────────────────────────────────────
    function TMDBPlayer({
  item, playerUrl, iframeKey, isTV, selectedSeason, selectedEpisode,
  episodeCount, seasons, getTitle, selectedProvider, onProviderChange,
  onClose, onSeasonChange, onEpisodeChange, onPrevEpisode, onNextEpisode, onGoHome,
}: {
  item: TMDBMovie; playerUrl: string; iframeKey: number; isTV: boolean;
  selectedSeason: number; selectedEpisode: number; episodeCount: number;
  seasons: any[]; selectedProvider: number;
  getTitle: (i: TMDBMovie) => string; onClose: () => void;
  onProviderChange: (i: number) => void;
  onSeasonChange: (s: number) => Promise<void>;
  onEpisodeChange: (e: number) => void; onPrevEpisode: () => void; onNextEpisode: () => void;
  onGoHome: () => void;
}) {
      const [isFullscreen, setIsFullscreen] = useState(false);
      const [iframeLoaded, setIframeLoaded] = useState(false);
      const [showTopBar, setShowTopBar] = useState(true);
      const topBarTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
      const playerContainerRef = useRef<HTMLDivElement>(null);

      // Block popups from iframe
      useEffect(() => {
        const origOpen = window.open;
        window.open = () => { console.log("🚫 Online player popup blocked"); return null; };
        const blockNav = (e: MouseEvent) => {
          const a = (e.target as HTMLElement)?.closest("a") as HTMLAnchorElement | null;
          if (a && a.target === "_blank") { e.preventDefault(); e.stopImmediatePropagation(); }
        };
        document.addEventListener("click", blockNav, true);
        return () => {
          window.open = origOpen;
          document.removeEventListener("click", blockNav, true);
        };
      }, []);

      useEffect(() => { setIframeLoaded(false); }, [iframeKey]);

      useEffect(() => {
        const handleFsChange = () => {
          const fse = !!(document.fullscreenElement || (document as any).webkitFullscreenElement || (document as any).mozFullScreenElement);
          setIsFullscreen(fse);
          setShowTopBar(true);
        };
        document.addEventListener('fullscreenchange', handleFsChange);
        document.addEventListener('webkitfullscreenchange', handleFsChange);
        document.addEventListener('mozfullscreenchange', handleFsChange);
        return () => {
          document.removeEventListener('fullscreenchange', handleFsChange);
          document.removeEventListener('webkitfullscreenchange', handleFsChange);
          document.removeEventListener('mozfullscreenchange', handleFsChange);
        };
      }, []);

      const resetTopBarTimer = () => {
        setShowTopBar(true);
        clearTimeout(topBarTimeoutRef.current);
        topBarTimeoutRef.current = setTimeout(() => setShowTopBar(false), 3000);
      };

      useEffect(() => {
        resetTopBarTimer();
        return () => clearTimeout(topBarTimeoutRef.current);
      }, []);

      
const lockLandscape = async () => {
  try {
    if (screen.orientation && (screen.orientation as any).lock) {
      await (screen.orientation as any).lock('landscape');
    }
  } catch (_) {}
};

const unlockOrientation = () => {
  try {
    if (screen.orientation && (screen.orientation as any).unlock) {
      (screen.orientation as any).unlock();
    }
  } catch (_) {}
};

const toggleFullscreen = async () => {
        const el = playerContainerRef.current;
        if (!el) return;
        try {
          if (document.fullscreenElement || (document as any).webkitFullscreenElement) {
            if (document.exitFullscreen) await document.exitFullscreen();
            else if ((document as any).webkitExitFullscreen) (document as any).webkitExitFullscreen();
          } else {
            if (el.requestFullscreen) await el.requestFullscreen();
            else if ((el as any).webkitRequestFullscreen) (el as any).webkitRequestFullscreen();
            else if ((el as any).mozRequestFullScreen) (el as any).mozRequestFullScreen();
          }
        } catch (err) { console.log('Fullscreen error:', err); }
      };

      return (
        <div ref={playerContainerRef} className="fixed inset-0 z-[60] bg-black flex flex-col" onMouseMove={resetTopBarTimer} onTouchStart={resetTopBarTimer} style={{ touchAction: 'manipulation' }}>
          <div className="flex-shrink-0 flex items-center justify-between px-3 py-2 sm:px-4 transition-all duration-300 overflow-hidden"
            style={{ background: 'rgba(0,0,0,0.90)', maxHeight: showTopBar ? '60px' : '0px', opacity: showTopBar ? 1 : 0, pointerEvents: showTopBar ? 'auto' : 'none', padding: showTopBar ? undefined : '0' }}>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <button onClick={isFullscreen ? toggleFullscreen : onClose} className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 sm:px-3 sm:py-2 bg-gray-800 hover:bg-gray-700 rounded-xl transition-all text-xs sm:text-sm font-semibold">
                <ChevronLeftIcon /><span className="hidden sm:inline">{isFullscreen ? 'Exit FS' : 'Back'}</span>
              </button>
              {!isFullscreen && (
                <button onClick={onGoHome} className="flex-shrink-0 flex items-center gap-1 px-2 py-1.5 sm:px-3 sm:py-2 bg-gray-800 hover:bg-orange-500/80 rounded-xl transition-all text-xs sm:text-sm font-semibold">
                  <HomeIcon /><span className="hidden sm:inline">Home</span>
                </button>
              )}
              <div className="min-w-0 ml-1">
                <p className="font-bold text-xs sm:text-sm truncate max-w-[120px] sm:max-w-xs">{getTitle(item)}</p>
                {isTV && <p className="text-[10px] sm:text-xs text-orange-400">S{selectedSeason} · E{selectedEpisode}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button onClick={toggleFullscreen} className="p-1.5 sm:p-2 bg-gray-800 hover:bg-gray-700 rounded-xl transition-all" title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}>
                {isFullscreen ? (
                  <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>
                ) : <FullscreenIcon />}
              </button>
              <div className="flex items-center gap-1 overflow-x-auto scrollbar-hide" style={{scrollbarWidth:'none',maxWidth:'60vw'}}>
                {STREAM_PROVIDERS.map((p, i) => (
                  <button
                    key={i}
                    onClick={() => onProviderChange(i)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                      selectedProvider === i
                        ? 'bg-orange-500 border-orange-400 text-white'
                        : 'bg-gray-800/80 border-gray-700 text-gray-400 hover:text-white hover:bg-gray-700'
                    }`}
                  >
                    {selectedProvider === i ? '▶ ' : ''}{p.name}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {!showTopBar && (
            <div className="absolute top-0 left-0 right-0 h-12 z-30" style={{ pointerEvents: 'auto' }} onClick={resetTopBarTimer} />
          )}

          <div className="flex-1 relative min-h-0">
            {!iframeLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-950 z-10">
                <div className="text-center">
                  <div className="w-14 h-14 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-gray-300 text-sm font-bold">Loading stream...</p>
                  <p className="text-gray-500 text-xs mt-1">Via VidSrc</p>
                </div>
              </div>
            )}
            <iframe key={iframeKey} id="vidsrc-iframe" src={playerUrl} className="w-full h-full border-0 block"
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope"
              onLoad={() => setIframeLoaded(true)} title={getTitle(item)}
              style={{ display: 'block', width: '100%', height: '100%' }} />
          </div>

          {isTV && (
            <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2" style={{ background: 'rgba(0,0,0,0.92)' }}>
              <button onClick={onPrevEpisode} disabled={selectedEpisode <= 1} className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-gray-800 rounded-full disabled:opacity-30 active:bg-gray-700">
                <ChevronLeftIcon />
              </button>
              {seasons.length > 0 && (
                <select value={selectedSeason} onChange={e => onSeasonChange(Number(e.target.value))} className="px-2 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs focus:outline-none focus:border-orange-500 flex-shrink-0">
                  {seasons.map(s => <option key={s.season_number} value={s.season_number}>S{s.season_number}</option>)}
                </select>
              )}
              <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide flex-1" style={{scrollbarWidth:'none'}}>
                {Array.from({ length: episodeCount }, (_, i) => i + 1).map(ep => (
                  <button key={ep} onClick={() => onEpisodeChange(ep)}
                    className={`flex-shrink-0 min-w-[36px] h-8 rounded-full text-xs font-bold border transition-all ${
                      selectedEpisode === ep
                        ? 'bg-orange-500 border-orange-400 text-white'
                        : 'bg-gray-800/80 border-gray-700 text-gray-400 active:bg-gray-700'
                    }`}>
                    {ep}
                  </button>
                ))}
              </div>
              <button onClick={onNextEpisode} disabled={selectedEpisode >= episodeCount} className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-orange-500 rounded-full disabled:opacity-30 active:bg-orange-600">
                <ChevronRightIcon />
              </button>
            </div>
          )}
        </div>
      );
    }

    
// ─── Live TV Data ─────────────────────────────────────────────────────────────
const LIVE_CHANNELS = [
  { name: "ABC USA", id: 51 }, { name: "AHC (American Heroes Channel)", id: 206 },
  { name: "Antenna TV USA", id: 283 }, { name: "A&E USA", id: 302 },
  { name: "AMC USA", id: 303 }, { name: "Animal Planet", id: 304 },
  { name: "beIN Sports MENA English 1", id: 61 }, { name: "beIN Sports MENA English 2", id: 90 },
  { name: "beIN Sports 1 Arabic", id: 91 }, { name: "beIN Sports 2 Arabic", id: 92 },
  { name: "beIN Sports 3 Arabic", id: 93 }, { name: "beIN Sports 4 Arabic", id: 94 },
  { name: "beIN Sports 5 Arabic", id: 95 }, { name: "beIN Sports 6 Arabic", id: 96 },
  { name: "beIN SPORTS 1 France", id: 116 }, { name: "beIN SPORTS 2 France", id: 117 },
  { name: "beIN SPORTS 3 France", id: 118 }, { name: "beIN SPORTS 1 Turkey", id: 62 },
  { name: "beIN SPORTS 2 Turkey", id: 63 }, { name: "beIN SPORTS 3 Turkey", id: 64 },
  { name: "beIN SPORTS USA", id: 425 }, { name: "BeIN Sports HD Qatar", id: 578 },
  { name: "CBS USA", id: 52 }, { name: "CW USA", id: 300 },
  { name: "CNBC USA", id: 309 }, { name: "Comedy Central", id: 310 },
  { name: "Cartoon Network", id: 339 }, { name: "CNN USA", id: 345 },
  { name: "Canal+ France", id: 121 }, { name: "Canal+ Sport France", id: 122 },
  { name: "Canal+ Sport Poland", id: 48 }, { name: "Canal+ Sport 2 Poland", id: 73 },
  { name: "DAZN 1 Spain", id: 445 }, { name: "DAZN 2 Spain", id: 446 },
  { name: "DAZN 3 Spain", id: 447 }, { name: "DAZN 4 Spain", id: 448 },
  { name: "ESPN USA", id: 44 }, { name: "ESPN2 USA", id: 45 },
  { name: "ESPN Brasil", id: 81 }, { name: "ESPN2 Brasil", id: 82 },
  { name: "ESPN Argentina", id: 149 }, { name: "ESPN2 Argentina", id: 150 },
  { name: "ESPN Deportes", id: 375 }, { name: "EuroSport 1 Greece", id: 41 },
  { name: "EuroSport 2 Greece", id: 42 }, { name: "EuroSport 1 Poland", id: 57 },
  { name: "EuroSport 2 Poland", id: 58 }, { name: "Eurosport 1 SW", id: 231 },
  { name: "Eurosport 2 SW", id: 232 }, { name: "Fox Sports 1 USA", id: 39 },
  { name: "FOX USA", id: 54 }, { name: "Fox News", id: 347 },
  { name: "Fox Sports Argentina", id: 787 }, { name: "Fox Sports 2 Argentina", id: 788 },
  { name: "GOLF Channel USA", id: 318 }, { name: "HBO USA", id: 321 },
  { name: "History USA", id: 322 }, { name: "ITV 1 UK", id: 350 },
  { name: "ITV 2 UK", id: 351 }, { name: "ITV 3 UK", id: 352 },
  { name: "ITV 4 UK", id: 353 }, { name: "LaLigaTV UK", id: 276 },
  { name: "Lifetime Network", id: 326 }, { name: "Match Football 1 Russia", id: 136 },
  { name: "Match Football 2 Russia", id: 137 }, { name: "Match Football 3 Russia", id: 138 },
  { name: "Match TV Russia", id: 127 }, { name: "Movistar Laliga", id: 84 },
  { name: "Movistar Liga de Campeones", id: 435 }, { name: "MLB Network USA", id: 399 },
  { name: "MSNBC", id: 327 }, { name: "MTV USA", id: 371 },
  { name: "NBC USA", id: 53 }, { name: "NBA TV USA", id: 404 },
  { name: "NFL Network", id: 405 }, { name: "NHL Network USA", id: 663 },
  { name: "National Geographic (NGC)", id: 328 }, { name: "Nova Sports 1 Greece", id: 631 },
  { name: "Nova Sports 2 Greece", id: 632 }, { name: "Nova Sports 3 Greece", id: 633 },
  { name: "Nova Sports 4 Greece", id: 634 }, { name: "Nova Sports 5 Greece", id: 635 },
  { name: "Nova Sports 6 Greece", id: 636 }, { name: "PDC TV", id: 43 },
  { name: "PTV Sports", id: 450 }, { name: "Polsat Poland", id: 562 },
  { name: "Polsat Sport Poland", id: 47 }, { name: "Polsat Sport 2 Poland", id: 50 },
  { name: "RMC Sport 1 France", id: 119 }, { name: "RMC Sport 2 France", id: 120 },
  { name: "RTE 1", id: 364 }, { name: "RTE 2", id: 365 },
  { name: "Rai Sport Italy", id: 882 }, { name: "Sky Sports Football UK", id: 35 },
  { name: "Sky Sports Main Event", id: 38 }, { name: "Sky Sports F1 UK", id: 60 },
  { name: "Sky Sports Cricket", id: 65 }, { name: "Sky Sports Golf UK", id: 70 },
  { name: "Sky sports Premier League", id: 130 }, { name: "Sky Sports News UK", id: 366 },
  { name: "Sky Sport UNO Italy", id: 461 }, { name: "Sky Sport MAX Italy", id: 460 },
  { name: "Sky Sport F1 Italy", id: 577 }, { name: "Sky Sport MotoGP Italy", id: 575 },
  { name: "SONY TEN 1", id: 885 }, { name: "SONY TEN 2", id: 886 },
  { name: "SONY TEN 3", id: 887 }, { name: "Sport TV1 Portugal", id: 49 },
  { name: "Sport TV2 Portugal", id: 74 }, { name: "Sport TV3 Portugal", id: 454 },
  { name: "Sport TV4 Portugal", id: 289 }, { name: "Sport TV5 Portugal", id: 290 },
  { name: "SporTV Brasil", id: 78 }, { name: "SporTV2 Brasil", id: 79 },
  { name: "SporTV3 Brasil", id: 80 }, { name: "SuperSport Premier league", id: 414 },
  { name: "SuperSport LaLiga", id: 415 }, { name: "SuperSport Rugby", id: 421 },
  { name: "SuperSport Cricket", id: 368 }, { name: "SuperSport Football", id: 56 },
  { name: "SuperSport Grandstand", id: 412 }, { name: "TBS USA", id: 336 },
  { name: "TNT USA", id: 338 }, { name: "TF1 France", id: 469 },
  { name: "Tennis Channel", id: 40 }, { name: "TNT Sports 1 UK", id: 31 },
  { name: "TNT Sports 2 UK", id: 32 }, { name: "TNT Sports 3 UK", id: 33 },
  { name: "TNT Sports 4 UK", id: 34 }, { name: "TSN1", id: 111 },
  { name: "TSN2", id: 112 }, { name: "TSN3", id: 113 },
  { name: "TSN4", id: 114 }, { name: "TSN5", id: 115 },
  { name: "TYC Sports Argentina", id: 746 }, { name: "TVP Sport Poland", id: 128 },
  { name: "TUDN USA", id: 66 }, { name: "Telemundo", id: 131 },
  { name: "USA Network", id: 343 }, { name: "Viaplay Sports 1 UK", id: 451 },
  { name: "Viaplay Sports 2 UK", id: 550 }, { name: "VH1 USA", id: 344 },
  { name: "Willow Cricket", id: 346 }, { name: "Willow 2 Cricket", id: 598 },
  { name: "WWE Network", id: 376 }, { name: "YES Network USA", id: 763 },
  { name: "Ziggo Sport NL", id: 393 }, { name: "Ziggo Sport 2 NL", id: 398 },
  { name: "Star Sports 1 IN", id: 267 }, { name: "Star Sports Hindi IN", id: 268 },
  { name: "A Sport PK", id: 269 }, { name: "T Sports BD", id: 270 },
  { name: "Ten Sports PK", id: 741 }, { name: "BBC One UK", id: 356 },
  { name: "BBC Two UK", id: 357 }, { name: "BBC Four UK", id: 359 },
  { name: "BBC News Channel HD", id: 349 }, { name: "Channel 4 UK", id: 354 },
  { name: "Channel 5 UK", id: 355 }, { name: "CBS Sports Network", id: 308 },
  { name: "BIG TEN Network USA", id: 397 }, { name: "SEC Network USA", id: 385 },
  { name: "OnTime Sports", id: 611 }, { name: "SSC Sport 1", id: 614 },
  { name: "SSC Sport 2", id: 615 }, { name: "SSC Sport 3", id: 616 },
  { name: "SSC Sport 4", id: 617 }, { name: "SSC Sport 5", id: 618 },
  { name: "Cosmote Sport 1 HD", id: 622 }, { name: "Cosmote Sport 2 HD", id: 623 },
  { name: "Cosmote Sport 3 HD", id: 624 }, { name: "Cosmote Sport 4 HD", id: 625 },
  { name: "Cosmote Sport 5 HD", id: 626 }, { name: "Arena Sport 1 Premium", id: 134 },
  { name: "Arena Sport 2 Premium", id: 135 }, { name: "Arena Sport 3 Premium", id: 139 },
  { name: "Abu Dhabi Sports 1 UAE", id: 600 }, { name: "Abu Dhabi Sports 2 UAE", id: 601 },
  { name: "Dubai Sports 1 UAE", id: 604 }, { name: "Dubai Sports 2 UAE", id: 605 },
  { name: "Dubai Sports 3 UAE", id: 606 }, { name: "Alkass One", id: 781 },
  { name: "Alkass Two", id: 782 }, { name: "Alkass Three", id: 783 },
  { name: "Alkass Four", id: 784 }, { name: "M4 Sports Hungary", id: 265 },
  { name: "Digi Sport 1 Romania", id: 400 }, { name: "Digi Sport 2 Romania", id: 401 },
  { name: "Digi Sport 3 Romania", id: 402 }, { name: "Digi Sport 4 Romania", id: 403 },
  { name: "Orange Sport 1 Romania", id: 439 }, { name: "Orange Sport 2 Romania", id: 440 },
  { name: "Orange Sport 3 Romania", id: 441 }, { name: "Orange Sport 4 Romania", id: 442 },
  { name: "TRT Spor TR", id: 889 }, { name: "beIN SPORTS 4 Turkey", id: 67 },
  { name: "bein Sports 5 Turkey", id: 1010 }, { name: "A Spor Turkey", id: 1011 },
  { name: "NOW TV Turkey", id: 1003 }, { name: "Eleven Sports 1 Portugal", id: 455 },
  { name: "Eleven Sports 2 Portugal", id: 456 }, { name: "Eleven Sports 3 Portugal", id: 457 },
  { name: "Eleven Sports 4 Portugal", id: 458 }, { name: "Eleven Sports 5 Portugal", id: 459 },
  { name: "beIN Sports 1 Malaysia", id: 712 }, { name: "beIN Sports 2 Malaysia", id: 713 },
  { name: "beIN Sports 3 Malaysia", id: 714 }, { name: "Astro SuperSport 1", id: 123 },
  { name: "Astro SuperSport 2", id: 124 }, { name: "Astro SuperSport 3", id: 125 },
  { name: "Astro SuperSport 4", id: 126 }, { name: "NBC Sports Bay Area", id: 753 },
  { name: "NBC Sports Boston", id: 754 }, { name: "NBC Sports California", id: 755 },
  { name: "NFL RedZone", id: 667 }, { name: "FOX Soccer Plus", id: 756 },
  { name: "Pac-12 Network USA", id: 287 }, { name: "ACC Network USA", id: 664 },
  { name: "Sportsnet Ontario", id: 406 }, { name: "Sportsnet One", id: 411 },
  { name: "Sportsnet West", id: 407 }, { name: "Sportsnet East", id: 408 },
  { name: "Sportsnet 360", id: 409 }, { name: "CTV Canada", id: 602 },
  { name: "TVA Sports", id: 833 }, { name: "TVA Sports 2", id: 834 },
  { name: "RDS CA", id: 839 }, { name: "RDS 2 CA", id: 840 },
  { name: "DR1 Denmark", id: 801 }, { name: "DR2 Denmark", id: 802 },
  { name: "TV2 Sport Denmark", id: 810 }, { name: "TV2 Sport X Denmark", id: 808 },
  { name: "TV3 Sport Denmark", id: 809 }, { name: "Sport 1 Israel", id: 140 },
  { name: "Sport 2 Israel", id: 141 }, { name: "Sport 3 Israel", id: 142 },
  { name: "Sport 4 Israel", id: 143 }, { name: "Sport 5 Israel", id: 144 },
  { name: "Sport 5 PLUS Israel", id: 145 }, { name: "Sport 5 Live Israel", id: 146 },
  { name: "Sport 5 Star Israel", id: 147 }, { name: "ONE 1 HD Israel", id: 541 },
  { name: "ONE 2 HD Israel", id: 542 }, { name: "TV4 Sportkanalen", id: 707 },
  { name: "TV4 Football Sweden", id: 747 }, { name: "TV4 Hockey", id: 700 },
  { name: "TV4 Tennis", id: 701 }, { name: "TV4 Motor", id: 702 },
  { name: "Rai 1 Italy", id: 850 }, { name: "Rai 2 Italy", id: 851 },
  { name: "Rai 3 Italy", id: 852 }, { name: "Italia 1 Italy", id: 854 },
  { name: "TVI Portugal", id: 723 }, { name: "RTP 1 Portugal", id: 719 },
  { name: "RTP 2 Portugal", id: 720 }, { name: "TVE La 1 Spain", id: 533 },
  { name: "TVE La 2 Spain", id: 536 }, { name: "Telecinco Spain", id: 532 },
  { name: "Cuatro Spain", id: 535 }, { name: "Antena 3 Spain", id: 531 },
  { name: "La Sexta Spain", id: 534 }, { name: "L'Equipe France", id: 645 },
  { name: "M6 France", id: 470 }, { name: "France 2", id: 950 },
  { name: "France 3", id: 951 }, { name: "France 4", id: 952 },
  { name: "France 5", id: 953 }, { name: "BFM TV France", id: 957 },
  { name: "ZDF DE", id: 727 }, { name: "RTL DE", id: 740 },
  { name: "ProSieben DE", id: 730 }, { name: "SAT.1 DE", id: 729 },
  { name: "Sport1 Germany", id: 641 }, { name: "Combate Brasil", id: 89 },
  { name: "TNT Brasil", id: 87 }, { name: "Premier Brasil", id: 88 },
  { name: "Bandsports Brasil", id: 275 }, { name: "PBS USA", id: 210 },
  { name: "Adult Swim", id: 295 }, { name: "Boomerang", id: 648 },
  { name: "Disney Channel", id: 312 }, { name: "Disney XD", id: 314 },
  { name: "Nick", id: 330 }, { name: "Nick JR", id: 329 },
  { name: "Fashion TV", id: 744 },
  { name: "502", id: 502 },
  { name: "503", id: 503 },
  { name: "504", id: 504 },
  { name: "505", id: 505 },
  { name: "506", id: 506 },
  { name: "507", id: 507 },
  { name: "508", id: 508 },
  { name: "509", id: 509 },
  { name: "510", id: 510 },
  { name: "511", id: 511 },
  { name: "512", id: 512 },
  { name: "513", id: 513 },
  { name: "514", id: 514 },
  { name: "515", id: 515 },
  { name: "516", id: 516 },
  { name: "517", id: 517 },
  { name: "518", id: 518 },
  { name: "519", id: 519 },
  { name: "520", id: 520 },
  { name: "501", id: 501 },



  { name: "20 Mediaset Italy", id: 857 },
  { name: "3sat DE", id: 726 },
  { name: "5 USA", id: 360 },
  { name: "6'eren Denmark", id: 800 },
  { name: "6ter France", id: 963 },
  { name: "ABC NY USA", id: 766 },
  { name: "ATV Turkey", id: 1000 },
  { name: "AXN Movies Portugal", id: 717 },
  { name: "AXS TV USA", id: 742 },
  { name: "Abu Dhabi Sports 1 Premium", id: 609 },
  { name: "Abu Dhabi Sports 2 Premium", id: 610 },
  { name: "Altitude Sports", id: 923 },
  { name: "Arena Sport 1 BiH", id: 579 },
  { name: "Arena Sport 1 Croatia", id: 432 },
  { name: "Arena Sport 1 Serbia", id: 429 },
  { name: "Arena Sport 10 Serbia", id: 945 },
  { name: "Arena Sport 2 Croatia", id: 433 },
  { name: "Arena Sport 2 Serbia", id: 430 },
  { name: "Arena Sport 3 Croatia", id: 434 },
  { name: "Arena Sport 3 Serbia", id: 431 },
  { name: "Arena Sport 4 Croatia", id: 580 },
  { name: "Arena Sport 4 Serbia", id: 581 },
  { name: "Arena Sport 5 Serbia", id: 940 },
  { name: "Arena Sport 6 Serbia", id: 941 },
  { name: "Arena Sport 7 Serbia", id: 942 },
  { name: "Arena Sport 8 Serbia", id: 943 },
  { name: "Arena Sport 9 Serbia", id: 944 },
  { name: "Arena Sports Tenis Serbia", id: 612 },
  { name: "Arte DE", id: 725 },
  { name: "Arte France", id: 958 },
  { name: "Astro Cricket", id: 370 },
  { name: "Automoto La chaîne", id: 961 },
  { name: "Azteca 7 MX", id: 844 },
  { name: "Azteca Uno MX", id: 934 },
  { name: "BBC America (BBCA)", id: 305 },
  { name: "BBC Three UK", id: 358 },
  { name: "BET USA", id: 306 },
  { name: "BNT 1 Bulgaria", id: 476 },
  { name: "BNT 2 Bulgaria", id: 477 },
  { name: "BNT 3 Bulgaria", id: 478 },
  { name: "BR Fernsehen DE", id: 737 },
  { name: "Barca TV Spain", id: 522 },
  { name: "Benfica TV PT", id: 380 },
  { name: "Bravo USA", id: 307 },
  { name: "C More First Sweden", id: 812 },
  { name: "C More Hits Sweden", id: 813 },
  { name: "C More Series Sweden", id: 814 },
  { name: "C SPAN 1", id: 750 },
  { name: "C8 France", id: 956 },
  { name: "CANAL 9 Denmark", id: 805 },
  { name: "CBC CA", id: 832 },
  { name: "CBS Sports Golazo", id: 910 },
  { name: "CBSNY USA", id: 767 },
  { name: "CMT USA", id: 647 },
  { name: "CMTV Portugal", id: 790 },
  { name: "CNews France", id: 964 },
  { name: "COZI TV USA", id: 748 },
  { name: "CT Sport CZ", id: 1033 },
  { name: "CT1 HD CZ", id: 1035 },
  { name: "CT2 HD CZ", id: 1036 },
  { name: "CTV 2 Canada", id: 838 },
  { name: "CW PIX 11 USA", id: 280 },
  { name: "CW Philly", id: 866 },
  { name: "Canal 11 Portugal", id: 540 },
  { name: "Canal+ Extra 1 Poland", id: 983 },
  { name: "Canal+ Extra 2 Poland", id: 984 },
  { name: "Canal+ Extra 3 Poland", id: 985 },
  { name: "Canal+ Extra 4 Poland", id: 986 },
  { name: "Canal+ Extra 5 Poland", id: 987 },
  { name: "Canal+ Extra 6 Poland", id: 988 },
  { name: "Canal+ Extra 7 Poland", id: 989 },
  { name: "Canal+ Family Poland", id: 567 },
  { name: "Canal+ Foot France", id: 463 },
  { name: "Canal+ Formula 1", id: 273 },
  { name: "Canal+ MotoGP France", id: 271 },
  { name: "Canal+ Premium Poland", id: 566 },
  { name: "Canal+ Seriale Poland", id: 570 },
  { name: "Canal+ Sport 1 Afrique", id: 486 },
  { name: "Canal+ Sport 2 Afrique", id: 487 },
  { name: "Canal+ Sport 2 CZ", id: 1043 },
  { name: "Canal+ Sport 2 SK", id: 1064 },
  { name: "Canal+ Sport 3 Afrique", id: 488 },
  { name: "Canal+ Sport 3 CZ", id: 1044 },
  { name: "Canal+ Sport 3 Poland", id: 259 },
  { name: "Canal+ Sport 3 SK", id: 1065 },
  { name: "Canal+ Sport 4 Afrique", id: 489 },
  { name: "Canal+ Sport 4 CZ", id: 1045 },
  { name: "Canal+ Sport 4 SK", id: 1066 },
  { name: "Canal+ Sport 5 Afrique", id: 490 },
  { name: "Canal+ Sport 5 CZ", id: 1046 },
  { name: "Canal+ Sport 5 Poland", id: 75 },
  { name: "Canal+ Sport 6 CZ", id: 1047 },
  { name: "Canal+ Sport 7 CZ", id: 1048 },
  { name: "Canal+ Sport 8 CZ", id: 1049 },
  { name: "Canal+ Sport CZ", id: 1020 },
  { name: "Canal+ Sport SK", id: 1063 },
  { name: "Canal+ Sport360", id: 464 },
  { name: "Canal5 MX", id: 936 },
  { name: "Channel 10 Israel", id: 547 },
  { name: "Channel 11 Israel", id: 548 },
  { name: "Channel 12 Israel", id: 549 },
  { name: "Channel 13 Israel", id: 551 },
  { name: "Channel 14 Israel", id: 552 },
  { name: "Channel 9 Israel", id: 546 },
  { name: "Chicago Sports Network", id: 776 },
  { name: "Cinemax USA", id: 374 },
  { name: "Citytv", id: 831 },
  { name: "Claro Sports MX", id: 933 },
  { name: "Cleo TV", id: 715 },
  { name: "Comet USA", id: 696 },
  { name: "Cooking Channel USA", id: 697 },
  { name: "Cosmote Sport 6 HD", id: 627 },
  { name: "Cosmote Sport 7 HD", id: 628 },
  { name: "Cosmote Sport 8 HD", id: 629 },
  { name: "Cosmote Sport 9 HD", id: 630 },
  { name: "Court TV USA", id: 281 },
  { name: "Crime+ Investigation USA", id: 669 },
  { name: "Cytavision Sports 1 Cyprus", id: 911 },
  { name: "Cytavision Sports 2 Cyprus", id: 912 },
  { name: "Cytavision Sports 3 Cyprus", id: 913 },
  { name: "Cytavision Sports 4 Cyprus", id: 914 },
  { name: "Cytavision Sports 5 Cyprus", id: 915 },
  { name: "Cytavision Sports 6 Cyprus", id: 916 },
  { name: "Cytavision Sports 7 Cyprus", id: 917 },
  { name: "DAZN 1 Bar DE", id: 426 },
  { name: "DAZN 1 UK", id: 230 },
  { name: "DAZN 2 Bar DE", id: 427 },
  { name: "DAZN F1 ES", id: 537 },
  { name: "DAZN LaLiga", id: 538 },
  { name: "DAZN Ligue 1 France", id: 960 },
  { name: "DAZN Portugal FIFA Mundial de Clubes", id: 918 },
  { name: "DAZN ZONA Italy", id: 877 },
  { name: "DSTV M-Net", id: 827 },
  { name: "DSTV Mzansi Magic", id: 786 },
  { name: "DSTV kykNET & kie", id: 828 },
  { name: "Dajto SK", id: 1051 },
  { name: "Dave", id: 348 },
  { name: "Destination America", id: 651 },
  { name: "Diema Bulgaria", id: 482 },
  { name: "Diema Family Bulgaria", id: 485 },
  { name: "Diema Sport 2 Bulgaria", id: 466 },
  { name: "Diema Sport 3 Bulgaria", id: 467 },
  { name: "Diema Sport Bulgaria", id: 465 },
  { name: "Discovery Channel", id: 313 },
  { name: "Discovery Family", id: 657 },
  { name: "Discovery Life Channel", id: 311 },
  { name: "Discovery Turbo", id: 661 },
  { name: "Discovery Velocity CA", id: 285 },
  { name: "Disney JR", id: 652 },
  { name: "Dubai Racing 2 UAE", id: 608 },
  { name: "E! Entertainment Television", id: 315 },
  { name: "E4 Channel", id: 363 },
  { name: "ERT 1 Greece", id: 774 },
  { name: "ESPN 1 MX", id: 925 },
  { name: "ESPN 1 NL", id: 379 },
  { name: "ESPN 2 MX", id: 926 },
  { name: "ESPN 2 NL", id: 386 },
  { name: "ESPN 3 MX", id: 927 },
  { name: "ESPN 3 NL", id: 888 },
  { name: "ESPN 4 MX", id: 928 },
  { name: "ESPN Premium Argentina", id: 387 },
  { name: "ESPN3 Argentina", id: 798 },
  { name: "ESPN3 Brasil", id: 83 },
  { name: "ESPN4 Brasil", id: 85 },
  { name: "ESPNU USA", id: 316 },
  { name: "ESPNews", id: 288 },
  { name: "Eleven Sports 1 Poland", id: 71 },
  { name: "Eleven Sports 2 Poland", id: 72 },
  { name: "Eleven Sports 3 Poland", id: 428 },
  { name: "Eleven Sports 4 Poland", id: 999 },
  { name: "EuroSport 1 Italy", id: 878 },
  { name: "EuroSport 1 Spain", id: 524 },
  { name: "EuroSport 2 Italy", id: 879 },
  { name: "EuroSport 2 Spain", id: 525 },
  { name: "Eurosport 1 France", id: 772 },
  { name: "Eurosport 1 NL", id: 233 },
  { name: "Eurosport 2 France", id: 773 },
  { name: "Eurosport 2 NL", id: 234 },
  { name: "FETV - Family Entertainment Television", id: 751 },
  { name: "FOX Deportes USA", id: 643 },
  { name: "FOX HD Bulgaria", id: 483 },
  { name: "FOX Sports 502 AU", id: 820 },
  { name: "FOX Sports 503 AU", id: 821 },
  { name: "FOX Sports 504 AU", id: 822 },
  { name: "FOX Sports 505 AU", id: 823 },
  { name: "FOX Sports 506 AU", id: 824 },
  { name: "FOX Sports 507 AU", id: 825 },
  { name: "FOXNY USA", id: 768 },
  { name: "FUSE TV USA", id: 279 },
  { name: "FX Movie Channel", id: 381 },
  { name: "FX USA", id: 317 },
  { name: "FXX USA", id: 298 },
  { name: "FYI", id: 665 },
  { name: "FanDuel Sports Network Arizona", id: 890 },
  { name: "FanDuel Sports Network Detroit", id: 891 },
  { name: "FanDuel Sports Network Florida", id: 892 },
  { name: "FanDuel Sports Network Great Lakes", id: 893 },
  { name: "FanDuel Sports Network Indiana", id: 894 },
  { name: "FanDuel Sports Network Kansas City", id: 895 },
  { name: "FanDuel Sports Network Midwest", id: 896 },
  { name: "FanDuel Sports Network New Orleans", id: 897 },
  { name: "FanDuel Sports Network North", id: 898 },
  { name: "FanDuel Sports Network Ohio", id: 899 },
  { name: "FanDuel Sports Network Oklahoma", id: 900 },
  { name: "FanDuel Sports Network SoCal", id: 902 },
  { name: "FanDuel Sports Network South", id: 903 },
  { name: "FanDuel Sports Network Southeast", id: 904 },
  { name: "FanDuel Sports Network Sun", id: 905 },
  { name: "FanDuel Sports Network West", id: 906 },
  { name: "FanDuel Sports Network Wisconsin", id: 907 },
  { name: "Fight Network", id: 757 },
  { name: "Film4 UK", id: 688 },
  { name: "FilmBox Premium Poland", id: 568 },
  { name: "Fox Business", id: 297 },
  { name: "Fox Cricket", id: 369 },
  { name: "Fox Sports 1 MX", id: 929 },
  { name: "Fox Sports 2 MX", id: 930 },
  { name: "Fox Sports 2 USA", id: 758 },
  { name: "Fox Sports 3 Argentina", id: 789 },
  { name: "Fox Sports 3 MX", id: 931 },
  { name: "Fox Sports Premium MX", id: 830 },
  { name: "Fox Weather Channel", id: 775 },
  { name: "Freeform", id: 301 },
  { name: "GOL PLAY Spain", id: 530 },
  { name: "Galavision USA", id: 743 },
  { name: "Game Show Network", id: 319 },
  { name: "Global CA", id: 836 },
  { name: "Globo RIO", id: 761 },
  { name: "Globo SP", id: 760 },
  { name: "Gold UK", id: 687 },
  { name: "Great American Family Channel (GAC)", id: 699 },
  { name: "Grit Channel", id: 752 },
  { name: "HBO Comedy USA", id: 690 },
  { name: "HBO Family USA", id: 691 },
  { name: "HBO Latino USA", id: 692 },
  { name: "HBO Poland", id: 569 },
  { name: "HBO Signature USA", id: 693 },
  { name: "HBO Zone USA", id: 694 },
  { name: "HBO2 USA", id: 689 },
  { name: "HGTV", id: 382 },
  { name: "HOT3 Israel", id: 553 },
  { name: "Hallmark Movies & Mysteries", id: 296 },
  { name: "Happy TV Serbia", id: 846 },
  { name: "Headline News", id: 323 },
  { name: "Heroes & Icons (H&I) USA", id: 282 },
  { name: "IFC TV USA", id: 656 },
  { name: "ION USA", id: 325 },
  { name: "ITV Quiz", id: 876 },
  { name: "Investigation Discovery (ID USA)", id: 324 },
  { name: "JOJ SK", id: 1050 },
  { name: "JOJ Sport SK", id: 1052 },
  { name: "Kabel Eins (Kabel 1) DE", id: 731 },
  { name: "Kanal 4 Denmark", id: 803 },
  { name: "Kanal 5 Denmark", id: 804 },
  { name: "Kanal D Turkey", id: 1001 },
  { name: "LA7d HD+ Italy", id: 856 },
  { name: "LCI France", id: 962 },
  { name: "La7 Italy", id: 855 },
  { name: "LaLiga SmartBank TV", id: 539 },
  { name: "Las Estrellas", id: 924 },
  { name: "Law & Crime Network", id: 278 },
  { name: "Lifetime Movies Network", id: 389 },
  { name: "Liverpool TV (LFC TV)", id: 826 },
  { name: "Logo TV USA", id: 849 },
  { name: "MASN USA", id: 829 },
  { name: "MDR DE", id: 733 },
  { name: "METV USA", id: 662 },
  { name: "MGM+ USA / Epix", id: 791 },
  { name: "MSG USA", id: 765 },
  { name: "MTV Denmark", id: 806 },
  { name: "MTV Poland", id: 990 },
  { name: "MTV UK", id: 367 },
  { name: "MUTV UK", id: 377 },
  { name: "MY9TV USA", id: 654 },
  { name: "Magnolia Network", id: 299 },
  { name: "Marquee Sports Network", id: 770 },
  { name: "Match Premier Russia", id: 573 },
  { name: "Max Sport 1 Bulgaria", id: 472 },
  { name: "Max Sport 1 Croatia", id: 779 },
  { name: "Max Sport 2 Bulgaria", id: 473 },
  { name: "Max Sport 2 Croatia", id: 780 },
  { name: "Max Sport 3 Bulgaria", id: 474 },
  { name: "Max Sport 4 Bulgaria", id: 475 },
  { name: "Monumental Sports Network", id: 778 },
  { name: "Motowizja Poland", id: 563 },
  { name: "Movistar Deportes 2 Spain", id: 438 },
  { name: "Movistar Deportes 3 Spain", id: 526 },
  { name: "Movistar Deportes 4 Spain", id: 527 },
  { name: "Movistar Deportes Spain", id: 436 },
  { name: "Movistar Golf Spain", id: 528 },
  { name: "Movistar Supercopa de Espana", id: 437 },
  { name: "Mundotoro TV Spain", id: 749 },
  { name: "NBC Sports Philadelphia", id: 777 },
  { name: "NBC Universo", id: 845 },
  { name: "NBC10 Philadelphia", id: 277 },
  { name: "NBCNY USA", id: 769 },
  { name: "NDR DE", id: 736 },
  { name: "NESN USA", id: 762 },
  { name: "Nat Geo Wild USA", id: 745 },
  { name: "NewsNation USA", id: 292 },
  { name: "Newsmax USA", id: 613 },
  { name: "Nick Music", id: 666 },
  { name: "Nicktoons", id: 649 },
  { name: "Noovo CA", id: 835 },
  { name: "Nova HD CZ", id: 1034 },
  { name: "Nova S Serbia", id: 847 },
  { name: "Nova Sport 1 CZ", id: 1021 },
  { name: "Nova Sport 2 CZ", id: 1022 },
  { name: "Nova Sport 3 CZ", id: 1023 },
  { name: "Nova Sport 3 SK", id: 1060 },
  { name: "Nova Sport 4 CZ", id: 1024 },
  { name: "Nova Sport 4 SK", id: 1061 },
  { name: "Nova Sport 5 CZ", id: 1025 },
  { name: "Nova Sport 5 SK", id: 1062 },
  { name: "Nova Sport 6 CZ", id: 1026 },
  { name: "Nova Sport Bulgaria", id: 468 },
  { name: "Nova Sport Serbia", id: 582 },
  { name: "Nova Sports News Greece", id: 639 },
  { name: "Nova Sports Premier League Greece", id: 599 },
  { name: "Nova Sports Prime Greece", id: 638 },
  { name: "Nova Sports Start Greece", id: 637 },
  { name: "Nova TV Bulgaria", id: 480 },
  { name: "OnePlay MD2 CZ", id: 1039 },
  { name: "OnePlay MD3 CZ", id: 1040 },
  { name: "OnePlay MD4 CZ", id: 1041 },
  { name: "OnePlay Sport 4 CZ", id: 1038 },
  { name: "Oneplay Sport 1 CZ", id: 1027 },
  { name: "Oneplay Sport 2 CZ", id: 1028 },
  { name: "Oneplay Sport 3 CZ", id: 1029 },
  { name: "Oprah Winfrey Network (OWN)", id: 331 },
  { name: "Outdoor Channel USA", id: 848 },
  { name: "Oxygen True Crime", id: 332 },
  { name: "POP TV USA", id: 653 },
  { name: "Paramount Network", id: 334 },
  { name: "Polsat Film Poland", id: 564 },
  { name: "Polsat News Poland", id: 443 },
  { name: "Polsat Sport 3 Poland", id: 129 },
  { name: "Polsat Sport Extra 1 HD Poland", id: 993 },
  { name: "Polsat Sport Extra 2 HD Poland", id: 994 },
  { name: "Polsat Sport Extra 3 HD Poland", id: 995 },
  { name: "Polsat Sport Extra 4 HD Poland", id: 996 },
  { name: "Polsat Sport Fight HD Poland", id: 997 },
  { name: "Polsat Sport NEWS HD Poland", id: 998 },
  { name: "Polsat Sport Premium 1 Super HD PL", id: 991 },
  { name: "Polsat Sport Premium 2 Super HD PL", id: 992 },
  { name: "Porto Canal Portugal", id: 718 },
  { name: "Premier Sport 1 CZ", id: 1030 },
  { name: "Premier Sport 2 CZ", id: 1031 },
  { name: "Premier Sport 3 CZ", id: 1032 },
  { name: "Premier Sports Ireland 1", id: 771 },
  { name: "Premier Sports Ireland 2", id: 799 },
  { name: "Prima Sport 1", id: 583 },
  { name: "Prima Sport 2", id: 584 },
  { name: "Prima Sport 3", id: 585 },
  { name: "Prima Sport 4", id: 586 },
  { name: "Prima TV RO", id: 843 },
  { name: "RDS Info CA", id: 841 },
  { name: "RMC Story France", id: 954 },
  { name: "RTL7 Netherland", id: 390 },
  { name: "RTP 3 Portugal", id: 721 },
  { name: "Racer TV USA", id: 646 },
  { name: "Racing Tv UK", id: 555 },
  { name: "Rai 4 Italy", id: 853 },
  { name: "Rai Premium Italy", id: 858 },
  { name: "Rally Tv", id: 607 },
  { name: "Real Madrid TV Spain", id: 523 },
  { name: "Reelz Channel", id: 293 },
  { name: "Ring Bulgaria", id: 471 },
  { name: "Root Sports Northwest", id: 920 },
  { name: "S4C UK", id: 670 },
  { name: "SBS6 NL", id: 883 },
  { name: "SEE Denmark", id: 811 },
  { name: "SIC Portugal", id: 722 },
  { name: "SR Fernsehen DE", id: 739 },
  { name: "SSC Sport Extra 1", id: 619 },
  { name: "SSC Sport Extra 2", id: 620 },
  { name: "SSC Sport Extra 3", id: 621 },
  { name: "SUPER RTL DE", id: 738 },
  { name: "SWR DE", id: 735 },
  { name: "SYFY USA", id: 373 },
  { name: "Science Channel", id: 294 },
  { name: "Show TV Turkey", id: 1002 },
  { name: "Showtime 2 USA", id: 792 },
  { name: "Showtime Extreme USA", id: 794 },
  { name: "Showtime Family Zone USA", id: 795 },
  { name: "Showtime Next USA", id: 796 },
  { name: "Showtime SHOxBET USA", id: 695 },
  { name: "Showtime Showcase USA", id: 793 },
  { name: "Showtime USA", id: 333 },
  { name: "Showtime Women USA", id: 797 },
  { name: "Sixx DE", id: 732 },
  { name: "Sky Arts UK", id: 683 },
  { name: "Sky Atlantic", id: 362 },
  { name: "Sky Calcio 1 Italy", id: 871 },
  { name: "Sky Calcio 2 Italy", id: 872 },
  { name: "Sky Calcio 3 Italy", id: 873 },
  { name: "Sky Calcio 4 Italy", id: 874 },
  { name: "Sky Cinema Action Italy", id: 861 },
  { name: "Sky Cinema Action UK", id: 677 },
  { name: "Sky Cinema Animation UK", id: 675 },
  { name: "Sky Cinema Collection Italy", id: 859 },
  { name: "Sky Cinema Comedy Italy", id: 862 },
  { name: "Sky Cinema Comedy UK", id: 678 },
  { name: "Sky Cinema Drama Italy", id: 867 },
  { name: "Sky Cinema Drama UK", id: 680 },
  { name: "Sky Cinema Family Italy", id: 865 },
  { name: "Sky Cinema Family UK", id: 676 },
  { name: "Sky Cinema Greats UK", id: 674 },
  { name: "Sky Cinema Hits UK", id: 673 },
  { name: "Sky Cinema Premiere UK", id: 671 },
  { name: "Sky Cinema Romance Italy", id: 864 },
  { name: "Sky Cinema Sci-Fi Horror UK", id: 681 },
  { name: "Sky Cinema Select UK", id: 672 },
  { name: "Sky Cinema Suspense Italy", id: 868 },
  { name: "Sky Cinema Thriller UK", id: 679 },
  { name: "Sky Cinema Uno +24 Italy", id: 863 },
  { name: "Sky Cinema Uno Italy", id: 860 },
  { name: "Sky Comedy UK", id: 684 },
  { name: "Sky Crime", id: 685 },
  { name: "Sky History", id: 686 },
  { name: "Sky MAX UK", id: 708 },
  { name: "Sky Serie Italy", id: 880 },
  { name: "Sky Showcase UK", id: 682 },
  { name: "Sky Sport 1 NZ", id: 588 },
  { name: "Sky Sport 2 NZ", id: 589 },
  { name: "Sky Sport 24 Italy", id: 869 },
  { name: "Sky Sport 3 NZ", id: 590 },
  { name: "Sky Sport 4 NZ", id: 591 },
  { name: "Sky Sport 5 NZ", id: 592 },
  { name: "Sky Sport 6 NZ", id: 593 },
  { name: "Sky Sport 7 NZ", id: 594 },
  { name: "Sky Sport 8 NZ", id: 595 },
  { name: "Sky Sport 9 NZ", id: 596 },
  { name: "Sky Sport Arena Italy", id: 462 },
  { name: "Sky Sport Austria 1 HD", id: 559 },
  { name: "Sky Sport Basket Italy", id: 875 },
  { name: "Sky Sport Bundesliga 1 HD", id: 558 },
  { name: "Sky Sport Bundesliga 2", id: 946 },
  { name: "Sky Sport Bundesliga 3", id: 947 },
  { name: "Sky Sport Bundesliga 4", id: 948 },
  { name: "Sky Sport Bundesliga 5", id: 949 },
  { name: "Sky Sport Calcio Italy", id: 870 },
  { name: "Sky Sport Mix DE", id: 557 },
  { name: "Sky Sport Select NZ", id: 587 },
  { name: "Sky Sport Tennis Italy", id: 576 },
  { name: "Sky Sport Top Event DE", id: 556 },
  { name: "Sky Sports 1 DE", id: 240 },
  { name: "Sky Sports 2 DE", id: 241 },
  { name: "Sky Sports Action UK", id: 37 },
  { name: "Sky Sports F1 DE", id: 274 },
  { name: "Sky Sports Golf DE", id: 785 },
  { name: "Sky Sports Golf Italy", id: 574 },
  { name: "Sky Sports MIX UK", id: 449 },
  { name: "Sky Sports Racing UK", id: 554 },
  { name: "Sky Sports Tennis DE", id: 884 },
  { name: "Sky Sports Tennis UK", id: 46 },
  { name: "Sky Sports+ Plus", id: 36 },
  { name: "Sky UNO Italy", id: 881 },
  { name: "Sky Witness HD", id: 361 },
  { name: "Smithsonian Channel", id: 603 },
  { name: "Space City Home Network", id: 921 },
  { name: "Spectrum SportsNet USA", id: 982 },
  { name: "Spectrum Sportsnet LA", id: 764 },
  { name: "Sport 1 CZ", id: 1042 },
  { name: "Sport 5 Gold Israel", id: 148 },
  { name: "Sport KLUB Golf Croatia", id: 710 },
  { name: "Sport Klub 1 Croatia", id: 101 },
  { name: "Sport Klub 2 Croatia", id: 102 },
  { name: "Sport Klub 3 Croatia", id: 103 },
  { name: "Sport Klub 4 Croatia", id: 104 },
  { name: "Sport Klub HD Croatia", id: 453 },
  { name: "Sport TV6 Portugal", id: 291 },
  { name: "Sport en France", id: 965 },
  { name: "SportDigital Fussball", id: 571 },
  { name: "Sportdigital1+ Germany", id: 640 },
  { name: "Sporting TV Portugal", id: 716 },
  { name: "SportsNet New York (SNY)", id: 759 },
  { name: "SportsNet Pittsburgh", id: 922 },
  { name: "Sportsnet World", id: 410 },
  { name: "Star TV Turkey", id: 1004 },
  { name: "Starz", id: 335 },
  { name: "Starz Cinema", id: 970 },
  { name: "Starz Comedy", id: 971 },
  { name: "Starz Edge", id: 972 },
  { name: "Starz Encore", id: 975 },
  { name: "Starz Encore Action", id: 976 },
  { name: "Starz Encore Black", id: 977 },
  { name: "Starz Encore Classic", id: 978 },
  { name: "Starz Encore Family", id: 979 },
  { name: "Starz Encore Suspense", id: 980 },
  { name: "Starz Encore Westerns", id: 981 },
  { name: "Starz In Black", id: 973 },
  { name: "Starz Kids & Family", id: 974 },
  { name: "StarzPlay CricLife 1 HD", id: 284 },
  { name: "Sundance TV", id: 658 },
  { name: "SuperSport Action", id: 420 },
  { name: "SuperSport Golf", id: 422 },
  { name: "SuperSport MaXimo 1", id: 572 },
  { name: "SuperSport Motorsport", id: 424 },
  { name: "SuperSport PSL", id: 413 },
  { name: "SuperSport Tennis", id: 423 },
  { name: "SuperSport Variety 1", id: 416 },
  { name: "SuperSport Variety 2", id: 417 },
  { name: "SuperSport Variety 3", id: 418 },
  { name: "SuperSport Variety 4", id: 419 },
  { name: "TCM USA", id: 644 },
  { name: "TLC", id: 337 },
  { name: "TMC Channel USA", id: 698 },
  { name: "TMC France", id: 955 },
  { name: "TN Live CZ", id: 1037 },
  { name: "TNT Sports Argentina", id: 388 },
  { name: "TNT Sports HD Chile", id: 642 },
  { name: "TUDN MX", id: 935 },
  { name: "TV ONE USA", id: 660 },
  { name: "TV2 Bornholm Denmark", id: 807 },
  { name: "TV2 Denmark", id: 817 },
  { name: "TV2 Zulu", id: 818 },
  { name: "TV3 Max Denmark", id: 223 },
  { name: "TV3+ Denmark", id: 819 },
  { name: "TV4 Sport Live 1", id: 703 },
  { name: "TV4 Sport Live 2", id: 704 },
  { name: "TV4 Sport Live 3", id: 705 },
  { name: "TV4 Sport Live 4", id: 706 },
  { name: "TV8 Turkey", id: 1005 },
  { name: "TVC Deportes MX", id: 932 },
  { name: "TVI Reality Portugal", id: 724 },
  { name: "TVLAND", id: 342 },
  { name: "TVN HD Poland", id: 565 },
  { name: "TVN24 Poland", id: 444 },
  { name: "TVO CA", id: 842 },
  { name: "TVP INFO", id: 452 },
  { name: "TVP1 Poland", id: 560 },
  { name: "TVP2 Poland", id: 561 },
  { name: "TeenNick", id: 650 },
  { name: "Teledeporte Spain (TDP)", id: 529 },
  { name: "Tennis+ 10", id: 709 },
  { name: "Tennis+ 12", id: 711 },
  { name: "The Food Network", id: 384 },
  { name: "The Hallmark Channel", id: 320 },
  { name: "The Weather Channel", id: 394 },
  { name: "Travel Channel", id: 340 },
  { name: "TruTV USA", id: 341 },
  { name: "Unimas", id: 133 },
  { name: "Universal Kids USA", id: 668 },
  { name: "Univision", id: 132 },
  { name: "V Film Family", id: 816 },
  { name: "V Film Premiere", id: 815 },
  { name: "V Sport Motor Sweden", id: 272 },
  { name: "VICE TV", id: 659 },
  { name: "VTV+ Uruguay", id: 391 },
  { name: "Vamos Spain", id: 521 },
  { name: "Veronica NL Netherland", id: 378 },
  { name: "Vodafone Sport", id: 260 },
  { name: "Voyo Special 1 SK", id: 1053 },
  { name: "Voyo Special 2 SK", id: 1054 },
  { name: "Voyo Special 3 SK", id: 1055 },
  { name: "Voyo Special 4 SK", id: 1056 },
  { name: "Voyo Special 7 SK", id: 1057 },
  { name: "Voyo Special 8 SK", id: 1058 },
  { name: "Voyo Special 9 SK", id: 1059 },
  { name: "W9 France", id: 959 },
  { name: "WDR DE", id: 734 },
  { name: "WETV USA", id: 655 },
  { name: "Win Sports+ Columbia", id: 392 },
  { name: "YTV CA", id: 286 },
  { name: "Yes Movies Action Israel", id: 543 },
  { name: "Yes Movies Comedy Israel", id: 545 },
  { name: "Yes Movies Kids Israel", id: 544 },
  { name: "Yes TV CA", id: 837 },
  { name: "ZDF Info DE", id: 728 },
  { name: "Ziggo Sport 3 NL", id: 919 },
  { name: "Ziggo Sport 4 NL", id: 396 },
  { name: "Ziggo Sport 5 NL", id: 383 },
  { name: "Ziggo Sport 6 NL", id: 901 },
  { name: "bTV Action Bulgaria", id: 481 },
  { name: "bTV Bulgaria", id: 479 },
  { name: "bTV Lady Bulgaria", id: 484 },
  { name: "beIN SPORTS Australia 1", id: 491 },
  { name: "beIN SPORTS Australia 2", id: 492 },
  { name: "beIN SPORTS Australia 3", id: 493 },
  { name: "beIN SPORTS MAX AR", id: 597 },
  { name: "beIN SPORTS XTRA 1", id: 100 },
  { name: "beIN SPORTS en Espanol", id: 372 },
  { name: "beIN Sports 7 Arabic", id: 97 },
  { name: "beIN Sports 8 Arabic", id: 98 },
  { name: "beIN Sports 9 Arabic", id: 99 },
  { name: "beIN Sports MAX 10 France", id: 500 },
  { name: "beIN Sports MAX 4 France", id: 494 },
  { name: "beIN Sports MAX 5 France", id: 495 },
  { name: "beIN Sports MAX 6 France", id: 496 },
  { name: "beIN Sports MAX 7 France", id: 497 },
  { name: "beIN Sports MAX 8 France", id: 498 },
  { name: "beIN Sports MAX 9 France", id: 499 },
];

const LIVE_TV_CATEGORIES: { label: string; filter: (name: string) => boolean }[] = [
  { label: "All", filter: () => true },
  { label: "⚽ Sports", filter: (n) => /sport|beIN|sky sport|TNT sport|ESPN|NBA|NFL|NHL|MLB|golf|tennis|cricket|rugby|laliga|soccer|premier|champions|copa|supersport|dazn|eurosport|arena|cosmote|SSC|ziggo|sportsnet|polsat sport|canal\+ sport|eleven|fox sports|match football|PTV|TYC|win sports|viaplay|PDC|willow/i.test(n) },
  { label: "📰 News", filter: (n) => /news|CNN|MSNBC|Fox News|CNBC|BFM|LCI|CNews|BBC News/i.test(n) },
  { label: "🎬 Movies & TV", filter: (n) => /HBO|Showtime|Starz|AMC|FX|TNT|TBS|USA Network|ITV|Channel 4|Channel 5|BBC|Rai|Arte|Film/i.test(n) },
  { label: "🎮 Entertainment", filter: (n) => /Comedy Central|MTV|VH1|E!|Bravo|Cartoon|Disney|Nick|Boomerang|Adult Swim|Fashion/i.test(n) },
  { label: "🌍 Middle East", filter: (n) => /Arabic|Qatar|UAE|Dubai|Abu Dhabi|Saudi|Alkass|SSC|OnTime|beIN.*MENA/i.test(n) },
  { label: "🇮🇳 South Asia", filter: (n) => /SONY TEN|Star Sports|T Sports|PTV|Willow|Astro Cricket|A Sport PK|Ten Sports/i.test(n) },
  { label: "🇧🇷 Latin America", filter: (n) => /Brasil|Brazil|Argentina|Mexico|MX|ESPN Premium|TYC|TNT Sports.*Chile|SporTV|Combate|Bandsports|Premier Brasil|Claro|TUDN|Telemundo|Azteca/i.test(n) },
];

// ─── Live TV Section ──────────────────────────────────────────────────────────
function LiveTVSection() {
  const [activeCategory, setActiveCategory] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedChannel, setSelectedChannel] = useState<{ name: string; id: number } | null>(null);
  const [iframeKey, setIframeKey] = useState(0);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [showPlayer, setShowPlayer] = useState(false);
  const STREAM_FOLDERS = ["stream", "cast", "watch", "plus", "casting", "player"];
  const [activeFolder, setActiveFolder] = useState("stream");
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const origOpen = window.open;
    window.open = () => null;
    return () => { window.open = origOpen; };
  }, []);

  const blockAds = () => {
    try {
      const iframeEl = iframeRef.current;
      if (!iframeEl) return;
      const win = (iframeEl as any).contentWindow;
      if (!win) return;
      win.open = () => null;
      const doc = win.document;
      if (!doc) return;
      const style = doc.createElement("style");
      style.textContent = `
        iframe[src*="ad"], iframe[id*="ad"], iframe[class*="ad"],
        div[class*="ad-"], div[id*="ad-"], div[class*="popup"],
        div[class*="overlay"], .ad-container, #ad-container,
        [data-ad], [class*="advertisement"] { display:none!important; }
      `;
      doc.head?.appendChild(style);
    } catch (_) {}
  };

  const openChannel = (ch: { name: string; id: number }) => {
    setSelectedChannel(ch);
    setIframeLoaded(false);
    setIframeKey(k => k + 1);
    setShowPlayer(true);
    try {
      if (screen.orientation && (screen.orientation as any).lock) {
        (screen.orientation as any).lock('landscape').catch(() => {});
      }
    } catch (_) {}
  };

  const closePlayer = () => {
    setShowPlayer(false);
    setSelectedChannel(null);
    try {
      if (screen.orientation && (screen.orientation as any).unlock) {
        (screen.orientation as any).unlock();
      }
      if (screen.orientation && (screen.orientation as any).lock) {
        (screen.orientation as any).lock('portrait').catch(() => {});
      }
    } catch (_) {}
  };

  const filtered = useMemo(() => {
    const catFilter = LIVE_TV_CATEGORIES.find(c => c.label === activeCategory)?.filter ?? (() => true);
    const q = searchQuery.toLowerCase().trim();
    return LIVE_CHANNELS.filter(ch => catFilter(ch.name) && (!q || ch.name.toLowerCase().includes(q)));
  }, [activeCategory, searchQuery]);

  const getCategoryColor = (name: string) => {
    if (/sport|ESPN|NBA|NFL|NHL|MLB|golf|tennis|cricket|rugby|soccer|premier|champions/i.test(name)) return "bg-green-500/20 text-green-400 border-green-500/30";
    if (/news|CNN|MSNBC|BBC News/i.test(name)) return "bg-blue-500/20 text-blue-400 border-blue-500/30";
    if (/HBO|Showtime|Starz|AMC|BBC|ITV|Channel/i.test(name)) return "bg-purple-500/20 text-purple-400 border-purple-500/30";
    if (/Comedy|MTV|Disney|Nick|Cartoon|Adult/i.test(name)) return "bg-yellow-500/20 text-yellow-400 border-yellow-500/30";
    return "bg-gray-500/20 text-gray-400 border-gray-500/30";
  };

  return (
    <div className="px-4 sm:px-8 pb-16 pt-4">
      <div className="relative mb-4">
        <input
          type="text"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Search channels..."
          className="w-full px-4 py-3 pl-12 bg-gray-800 border border-gray-700 rounded-xl focus:outline-none focus:border-orange-500 text-white"
        />
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400"><SearchIcon /></div>
        {searchQuery && (
          <button onClick={() => setSearchQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white">
            <CloseIcon />
          </button>
        )}
      </div>

      <div className="flex gap-2 overflow-x-auto pb-2 mb-6" style={{ scrollbarWidth: "none" }}>
        {LIVE_TV_CATEGORIES.map(cat => (
          <button
            key={cat.label}
            onClick={() => setActiveCategory(cat.label)}
            className={cn(
              "flex-shrink-0 px-4 py-2 rounded-xl font-bold text-sm transition-all",
              activeCategory === cat.label
                ? "bg-gradient-to-r from-orange-500 to-red-500 text-white"
                : "bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700"
            )}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <p className="text-sm text-gray-500 mb-4">{filtered.length} channel{filtered.length !== 1 ? "s" : ""}</p>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
        {filtered.map(ch => (
          <button
            key={ch.id}
            onClick={() => openChannel(ch)}
            className="group relative flex flex-col items-center justify-center gap-2 p-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-orange-500 rounded-xl transition-all hover:scale-105 text-center"
          >
            <div className={cn("w-10 h-10 rounded-full flex items-center justify-center text-lg font-black border", getCategoryColor(ch.name))}>
              📡
            </div>
            <p className="text-xs font-semibold leading-tight line-clamp-2">{ch.name}</p>
            <p className="text-[10px] text-gray-500">ID: {ch.id}</p>
            <div className="absolute inset-0 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-orange-500/10">
              <div className="w-8 h-8 bg-orange-500 rounded-full flex items-center justify-center"><PlayIcon /></div>
            </div>
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20">
          <div className="text-6xl mb-4">📡</div>
          <h3 className="text-xl font-bold mb-2" style={{ fontFamily: "'Nunito', 'Comic Sans MS', cursive" }}>No channels found</h3>
          <p className="text-gray-400">Try a different search or category</p>
        </div>
      )}

      {showPlayer && selectedChannel && (
        <div className="fixed inset-0 z-[60] bg-black flex flex-col">
          <div className="flex-shrink-0 bg-gray-900/95 border-b border-gray-800 z-10">
            {/* Row 1: back + channel info + reload */}
            <div className="flex items-center justify-between px-3 py-2 gap-2">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <button onClick={closePlayer} className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-gray-800 hover:bg-gray-700 rounded-xl transition-all">
                  <ChevronLeftIcon />
                </button>
                <div className="min-w-0">
                  <p className="font-bold text-sm truncate">{selectedChannel.name}</p>
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <p className="text-[10px] text-red-400 font-bold">LIVE</p>
                    <p className="text-[10px] text-gray-500">#{selectedChannel.id}</p>
                  </div>
                </div>
              </div>
              <button
                onClick={() => { setIframeLoaded(false); setIframeKey(k => k + 1); }}
                className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-gray-800 hover:bg-gray-700 rounded-xl transition-all text-sm"
              >
                🔄
              </button>
            </div>
            {/* Row 2: scrollable server pills */}
            <div className="flex items-center gap-2 px-3 pb-2 overflow-x-auto scrollbar-hide" style={{scrollbarWidth:'none'}}>
              <span className="flex-shrink-0 text-[10px] text-gray-500 font-semibold uppercase tracking-wider">Server</span>
              {STREAM_FOLDERS.map(folder => (
                <button
                  key={folder}
                  onClick={() => { setActiveFolder(folder); setIframeLoaded(false); setIframeKey(k => k + 1); }}
                  className={`flex-shrink-0 px-3 py-1 rounded-full text-xs font-bold border transition-all ${
                    activeFolder === folder
                      ? "bg-orange-500 border-orange-400 text-white"
                      : "bg-gray-800/80 border-gray-700 text-gray-400 active:bg-gray-700"
                  }`}
                >
                  {activeFolder === folder ? '▶ ' : ''}{folder}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-shrink-0 flex items-center gap-2 px-4 py-2 bg-orange-500/10 border-b border-orange-500/20">
            <span className="text-xs text-orange-400 font-semibold">🛡️ Ad blocker active · Popups blocked</span>
            <span className="text-xs text-gray-500">· Use uBlock Origin for best results</span>
          </div>

          <div className="flex-1 relative min-h-0">
            {!iframeLoaded && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-950 z-10">
                <div className="text-center">
                  <div className="w-14 h-14 border-4 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-gray-300 text-sm font-bold">Loading stream...</p>
                  <p className="text-gray-500 text-xs mt-1">{selectedChannel.name}</p>
                </div>
              </div>
            )}
            <iframe
              ref={iframeRef}
              key={iframeKey}
              src={`https://dlhd.pk/${activeFolder}/stream-${selectedChannel.id}.php`}
              className="w-full h-full border-0 block"
              sandbox="allow-scripts allow-same-origin allow-forms"
              allowFullScreen
              referrerPolicy="no-referrer-when-downgrade"
              allow="autoplay; fullscreen; picture-in-picture; encrypted-media; accelerometer; gyroscope"
              onLoad={() => { setIframeLoaded(true); blockAds(); }}
              title={selectedChannel.name}
              style={{ display: "block", width: "100%", height: "100%" }}
            />
          </div>

          <div className="flex-shrink-0 flex items-center gap-2 px-3 py-2 bg-gray-900/95 border-t border-gray-800 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: "none" }}>
            <span className="text-[10px] text-gray-500 flex-shrink-0 font-semibold uppercase tracking-wider">Switch</span>
            {filtered.slice(0, 20).map(ch => (
              <button
                key={ch.id}
                onClick={() => openChannel(ch)}
                className={cn(
                  "flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                  selectedChannel.id === ch.id
                    ? "bg-orange-500 border-orange-400 text-white"
                    : "bg-gray-800/80 border-gray-700 text-gray-400 active:bg-gray-700"
                )}
              >
                {ch.name.length > 16 ? ch.name.slice(0, 16) + "…" : ch.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
