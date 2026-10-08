import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Add paths that don't require authentication
const publicPaths = ['/login', '/register', '/forgot-password', '/set-password'];

// Add paths that should be accessible without authentication
const staticPaths = [
  '/images',
  '/_next',
  '/favicon.ico',
  '/api',
  '/socket.io',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static assets and public paths
  if (staticPaths.some(path => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // Handle public paths (login, register, etc.)
  if (publicPaths.includes(pathname)) {
    return NextResponse.next();
  }

  // For protected routes, we'll handle the auth check on the client side
  // since we're using localStorage
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}; 