import { NextResponse } from 'next/server';

export function proxy(request) {
  const path = request.nextUrl.pathname;

  // If they are trying to access the scorer page (but NOT the login page itself)
  if (path.startsWith('/scorer') && path !== '/scorer/login') {
    
    // Check for our secure cookie badge
    const hasAccess = request.cookies.get('scorer_auth');

    // If no badge, redirect to the PIN screen
    if (!hasAccess) {
      return NextResponse.redirect(new URL('/scorer/login', request.url));
    }
  }

  return NextResponse.next();
}

// Only run this middleware on /scorer routes to keep the app fast
export const config = {
  matcher: ['/scorer/:path*'],
};