import { NextResponse, type NextRequest } from 'next/server';
import { getClient } from '@/lib/supabase/server';

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '/business-live';
  const code = searchParams.get('code');
  if (code) {
    const client = await getClient();
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(`${origin}${base}/dashboard`);
  }
  return NextResponse.redirect(`${origin}${base}/login`);
}
