import { NextResponse } from 'next/server';

export function proxy(request) {
  const token = request.cookies.get('auth_token')?.value;
  const { pathname } = request.nextUrl;

  // Define paths
  const isAuthPage = ['/login', '/register', '/forgot-password', '/reset-password'].includes(pathname);
  const isLandingPage = pathname === '/';
  const isProtectedRoute = pathname.startsWith('/dashboard') || pathname.startsWith('/checkout');

  // Logged-in users should not visit landing page or login/signup forms
  if (token) {
    if (isLandingPage || isAuthPage) {
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  } else {
    // Guest users cannot access protected routes
    if (isProtectedRoute) {
      return NextResponse.redirect(new URL('/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for:
     * 1. api (API routes)
     * 2. _next/static (static files)
     * 3. _next/image (image optimization files)
     * 4. favicon.ico, images/media (.png, .jpg, .webp, etc.)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)',
  ],
};
