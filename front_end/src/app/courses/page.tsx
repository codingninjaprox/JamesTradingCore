'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { getTranslation } from '@/utils/translation';
import { getCourses, type Course, type CourseEmbedType } from '@/utils/courses';
import { useCallback, useEffect, useState } from 'react';

const COURSES_LIST_CACHE_KEY = (userId: number, lang: string) =>
  `courses_list_${userId}_${lang}`;
const SELECTED_COURSE_CACHE_KEY = (userId: number) => `courses_selected_${userId}`;
const COURSES_CACHE_EXPIRY = 60 * 60 * 1000; // 1 hour

const COURSE_LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'pt', label: 'Português' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'de', label: 'Deutsch' },
  { code: 'it', label: 'Italiano' },
  { code: 'nl', label: 'Nederlands' },
];

/** Extract YouTube video ID from any YouTube URL. */
function getYouTubeVideoId(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0];
      return id || null;
    }
    if (u.hostname === 'www.youtube.com' || u.hostname === 'youtube.com') {
      const id = u.searchParams.get('v') || u.pathname.split('/').filter(Boolean).pop();
      return id || null;
    }
  } catch {
    // ignore
  }
  return null;
}

/** Convert YouTube URL to embed URL. Add autoplay=1 when user has clicked play. */
function toYouTubeEmbedUrl(url: string, autoplay = false): string {
  const id = getYouTubeVideoId(url);
  if (id) {
    const base = `https://www.youtube-nocookie.com/embed/${id}`;
    return autoplay ? `${base}?autoplay=1` : base;
  }
  return url;
}

/** Convert Vimeo page URL to player embed URL. */
function toVimeoEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === 'vimeo.com' || u.hostname === 'www.vimeo.com') {
      // /123456 or /channels/.../123456 or /video/123456
      const parts = u.pathname.split('/').filter(Boolean);
      const id = parts[parts.length - 1];
      if (id && /^\d+$/.test(id)) {
        return `https://player.vimeo.com/video/${id}`;
      }
    }
    if (u.hostname === 'player.vimeo.com') return url;
  } catch {
    // ignore
  }
  return url;
}

/** Lite YouTube: show thumbnail + play button first; load iframe only on click (plays on same page). */
function YouTubeLiteEmbed({
  embedUrl,
  courseName,
  courseId,
  onLoad,
  t,
}: {
  embedUrl: string;
  courseName: string;
  courseId: number;
  onLoad: () => void;
  t: (key: string) => string;
}) {
  const [hasPlayed, setHasPlayed] = useState(false);
  const videoId = getYouTubeVideoId(embedUrl);

  useEffect(() => {
    if (!hasPlayed) onLoad();
  }, [hasPlayed, onLoad]);

  if (!videoId) {
    return (
      <div className="w-full h-full flex items-center justify-center text-gray-400">
        <p>{t('No content available for this course.')}</p>
      </div>
    );
  }

  if (hasPlayed) {
    const src = toYouTubeEmbedUrl(embedUrl, true);
    return (
      <div className="w-full h-full flex flex-col items-center justify-center">
        <div className="w-full max-w-4xl aspect-video rounded-lg overflow-hidden bg-black">
          <iframe
            key={courseId}
            src={src}
            title={courseName}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            className="w-full h-full border-0"
            onLoad={onLoad}
          />
        </div>
      </div>
    );
  }

  const thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
  return (
    <div className="w-full h-full flex flex-col items-center justify-center">
      <div className="w-full max-w-4xl aspect-video rounded-lg overflow-hidden bg-black relative group cursor-pointer">
        <button
          type="button"
          onClick={() => setHasPlayed(true)}
          className="absolute inset-0 w-full h-full flex flex-col items-center justify-center bg-black/30 hover:bg-black/40 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
          aria-label={t('Play video')}
        >
          <img
            src={thumbnailUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
          <div className="relative z-10 w-20 h-20 rounded-full bg-red-600 flex items-center justify-center shadow-lg group-hover:bg-red-700 group-hover:scale-110 transition-all">
            <svg className="w-10 h-10 text-white ml-1" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
          <span className="relative z-10 mt-3 text-white font-medium drop-shadow">{t('Click to play')}</span>
        </button>
      </div>
    </div>
  );
}

function CourseContentView({
  course,
  onLoad,
  t,
}: {
  course: Course;
  onLoad: () => void;
  t: (key: string) => string;
}) {
  const type: CourseEmbedType = course.embed_type || 'link';
  const embedUrl = course.embed_url;

  if (!embedUrl) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400">
        <p>{t('No content available for this course.')}</p>
      </div>
    );
  }

  switch (type) {
    case 'youtube': {
      return (
        <YouTubeLiteEmbed
          embedUrl={embedUrl}
          courseName={course.name}
          courseId={course.id}
          onLoad={onLoad}
          t={t}
        />
      );
    }
    case 'vimeo': {
      const vimeoSrc = toVimeoEmbedUrl(embedUrl);
      return (
        <div className="w-full h-full flex flex-col items-center justify-center">
          <div className="w-full max-w-4xl aspect-video rounded-lg overflow-hidden bg-black">
            <iframe
              key={course.id}
              src={vimeoSrc}
              title={course.name}
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              className="w-full h-full border-0"
              onLoad={onLoad}
            />
          </div>
        </div>
      );
    }
    case 'pdf': {
      return (
        <iframe
          key={course.id}
          src={embedUrl}
          title={course.name}
          className="w-full h-full rounded-lg border-0 bg-white"
          onLoad={onLoad}
        />
      );
    }
    case 'link':
    default: {
      return (
        <div className="w-full h-full min-h-0 rounded-lg overflow-hidden bg-[#1a2234]">
          <iframe
            key={course.id}
            src={embedUrl}
            title={course.name}
            className="w-full h-full border-0"
            onLoad={onLoad}
          />
        </div>
      );
    }
  }
}

export default function CourseShowPage() {
  const { user, token } = useAuth();
  const { translations, currentLanguage } = useLanguage();
  const t = (key: string) => getTranslation(translations, key);

  const [courseLang, setCourseLang] = useState<string>('en');
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isIframeLoading, setIsIframeLoading] = useState(true);

  const lang = courseLang;

  const loadFromCache = useCallback((): Course[] | null => {
    if (!user?.id) return null;
    try {
      const cached = localStorage.getItem(COURSES_LIST_CACHE_KEY(user.id, lang));
      if (!cached) return null;
      const { data, timestamp } = JSON.parse(cached);
      if (Date.now() - timestamp > COURSES_CACHE_EXPIRY) return null;
      return Array.isArray(data) ? data : null;
    } catch {
      return null;
    }
  }, [user?.id, lang]);

  const saveToCache = useCallback(
    (data: Course[]) => {
      if (!user?.id) return;
      try {
        localStorage.setItem(
          COURSES_LIST_CACHE_KEY(user.id, lang),
          JSON.stringify({ data, timestamp: Date.now() })
        );
      } catch (e) {
        console.warn('Failed to cache courses', e);
      }
    },
    [user?.id, lang]
  );

  const fetchCourses = useCallback(async () => {
    if (!token) return;
    setError(null);
    const cached = loadFromCache();
    if (cached && cached.length > 0) {
      setCourses(cached);
    }
    setLoading(true);
    try {
      const res = await getCourses(token, lang);
      const list = Array.isArray(res.data) ? res.data : [];
      setCourses(list);
      saveToCache(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load courses');
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, [token, lang, loadFromCache, saveToCache]);

  useEffect(() => {
    if (!user || !token) return;
    const stored = typeof window !== 'undefined' ? localStorage.getItem('courses_lang') : null;
    if (stored) setCourseLang(stored);
    else if (currentLanguage || user?.lang) setCourseLang(currentLanguage || user?.lang || 'en');
  }, [user, currentLanguage]);

  useEffect(() => {
    if (!user || !token) return;
    fetchCourses();
  }, [user, token, lang, fetchCourses]);

  const handleLanguageChange = (newLang: string) => {
    setCourseLang(newLang);
    try {
      localStorage.setItem('courses_lang', newLang);
    } catch {}
  };

  const courseList = Array.isArray(courses) ? courses : [];

  // Restore selected course from list + localStorage
  useEffect(() => {
    if (!user?.id || courseList.length === 0) return;
    try {
      const savedId = localStorage.getItem(SELECTED_COURSE_CACHE_KEY(user.id));
      if (savedId) {
        const id = parseInt(savedId, 10);
        const course = courseList.find((c) => c.id === id);
        if (course) {
          setSelectedCourse(course);
          return;
        }
      }
      setSelectedCourse(courseList[0]);
    } catch {
      setSelectedCourse(courseList[0]);
    }
  }, [user?.id, courseList]);

  const handleSelectCourse = (course: Course) => {
    setSelectedCourse(course);
    setIsIframeLoading(true);
    if (user?.id) {
      try {
        localStorage.setItem(SELECTED_COURSE_CACHE_KEY(user.id), String(course.id));
      } catch {}
    }
  };

  const handleIframeLoad = () => {
    setIsIframeLoading(false);
  };

  if (!user) {
    return null;
  }

  return (
    <div className="px-4 sm:px-6 lg:px-8 pb-4 md:py-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <h1 className="text-xl md:text-2xl font-bold text-white">
            {t('Course')}
          </h1>
          <div className="flex items-center gap-2">
            <label htmlFor="course-lang" className="text-sm font-medium text-gray-300 whitespace-nowrap">
              {t('Language')}:
            </label>
            <select
              id="course-lang"
              value={courseLang}
              onChange={(e) => handleLanguageChange(e.target.value)}
              className="rounded-md border border-[#2d3748] bg-[#1a2234] text-white text-sm px-3 py-2 focus:border-blue-500 focus:ring-blue-500 min-w-[140px]"
            >
              {COURSE_LANGUAGES.map(({ code, label }) => (
                <option key={code} value={code}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {loading && courseList.length === 0 ? (
          <div className="bg-[#232b3e] border border-[#2d3748] rounded-xl p-8 flex items-center justify-center min-h-[400px]">
            <div className="flex flex-col items-center text-gray-400">
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
              <p>{t('Loading courses...')}</p>
            </div>
          </div>
        ) : error ? (
          <div className="bg-[#232b3e] border border-[#2d3748] rounded-xl p-8 text-center">
            <p className="text-red-400">{error}</p>
            <button
              type="button"
              onClick={() => fetchCourses()}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {t('Retry')}
            </button>
          </div>
        ) : courseList.length === 0 ? (
          <div className="bg-[#232b3e] border border-[#2d3748] rounded-xl p-8 text-center text-gray-400">
            <p>{t('No courses available')}</p>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-6">
            {/* Course list */}
            <div className="lg:w-64 flex-shrink-0">
              <div className="bg-[#232b3e] border border-[#2d3748] rounded-xl p-4">
                <h2 className="text-sm font-semibold text-gray-300 mb-3">
                  {t('Choose a course')}
                </h2>
                <ul className="space-y-1 max-h-[280px] overflow-y-auto">
                  {courseList.map((course) => (
                    <li key={course.id}>
                      <button
                        type="button"
                        onClick={() => handleSelectCourse(course)}
                        className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
                          selectedCourse?.id === course.id
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-300 hover:bg-[#2d3748]'
                        }`}
                      >
                        {course.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Course content viewer - layout depends on embed_type */}
            <div className="flex-1 min-w-0">
              <div className="bg-[#232b3e] border border-[#2d3748] rounded-xl p-6">
                {selectedCourse && (
                  <>
                    <h2 className="text-lg font-semibold text-white mb-4">
                      {selectedCourse.name}
                    </h2>
                    <div className="h-[calc(100vh-280px)] min-h-[400px] relative">
                      {isIframeLoading && (
                        <div className="absolute inset-0 flex items-center justify-center bg-[#232b3e] rounded-lg z-10">
                          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        </div>
                      )}
                      {selectedCourse.embed_url ? (
                        <CourseContentView
                          course={selectedCourse}
                          onLoad={handleIframeLoad}
                          t={t}
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full text-gray-400">
                          <p>{t('No content available for this course.')}</p>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
