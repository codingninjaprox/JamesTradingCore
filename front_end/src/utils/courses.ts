/**
 * Courses API – types and client for Next.js front-end.
 * API: GET /api/courses, GET /api/courses/{id}
 */

export type CourseEmbedType = 'link' | 'youtube' | 'vimeo' | 'pdf';

export interface Course {
  id: number;
  name: string;
  lang: string;
  url: string | null;
  pdf_path: string | null;
  embed_type: CourseEmbedType;
  sort_order: number;
  /** Use this as the iframe src. */
  embed_url: string | null;
}

export interface CoursesListResponse {
  success: true;
  data: Course[];
  lang: string;
}

const apiBase = () => process.env.NEXT_PUBLIC_API_URL || '';

/**
 * Fetch all courses for a language.
 * @param token - Bearer token (Laravel Sanctum)
 * @param lang - Optional. If omitted, API uses user's lang then app default.
 */
export async function getCourses(token: string, lang?: string): Promise<CoursesListResponse> {
  const url = lang
    ? `${apiBase()}/api/courses?lang=${encodeURIComponent(lang)}`
    : `${apiBase()}/api/courses`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || 'Failed to load courses');
  }
  const data = Array.isArray(json.data) ? json.data : [];
  return { ...json, data } as CoursesListResponse;
}

/**
 * Fetch a single course by ID (optional; list response already has full objects).
 */
export async function getCourse(
  token: string,
  id: number
): Promise<{ success: true; data: Course }> {
  const res = await fetch(`${apiBase()}/api/courses/${id}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.message || 'Failed to load course');
  }
  return json;
}
