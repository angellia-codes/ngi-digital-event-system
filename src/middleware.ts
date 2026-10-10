import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/** Keeps the admin's Supabase session fresh. Authorisation is checked again in every page and route. */
export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  if (!req.cookies.getAll().some((c) => c.name.startsWith('sb-'))) return res;
  const supabase = createServerClient(process.env.SUPABASE_URL!, process.env.SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) req.cookies.set(name, value);
        res = NextResponse.next({ request: req });
        for (const { name, value, options } of list) res.cookies.set(name, value, options);
      },
    },
  });
  await supabase.auth.getUser();
  return res;
}

export const config = { matcher: ['/admin/:path*', '/api/admin/:path*'] };
