import { NextResponse } from 'next/server';

export function proxy(request) {
  const path = request.nextUrl.pathname;

  // 1. Referee Zone Protection
  if (path.startsWith('/scorer') && path !== '/scorer/login') {
    const hasScorerAccess = request.cookies.get('scorer_auth');
    if (!hasScorerAccess) {
      return NextResponse.redirect(new URL('/scorer/login', request.url));
    }
  }

  // 2. Organizer Zone Protection
  if (path.startsWith('/admin') && path !== '/admin/login') {
    const hasAdminAccess = request.cookies.get('admin_auth');
    if (!hasAdminAccess) {
      return NextResponse.redirect(new URL('/admin/login', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  // Ensure the proxy runs on both route groups
  matcher: ['/scorer/:path*', '/admin/:path*'],
};