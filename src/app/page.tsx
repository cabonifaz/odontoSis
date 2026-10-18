import { redirect } from 'next/navigation';
import { getSession } from '@/lib/server/session';
import { homeFor } from '@/lib/server/guard';

export default async function Home() {
  const s = await getSession();
  redirect(s ? homeFor(s) : '/login');
}
