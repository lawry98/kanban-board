import { redirect } from 'next/navigation';

import { Navbar } from '@/components/layout/navbar';
import { dailyActiveKey } from '@/lib/analytics/events';
import { trackEvent } from '@/lib/analytics/track';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect('/login');
  }

  const profile = await prisma.profile.findUnique({
    where: { id: user.id },
    select: { fullName: true, email: true, avatarUrl: true },
  });

  // Rides the profile lookup that already runs here. The UTC-dated dedupe key
  // collapses every dashboard navigation in a day into a single row, so this is
  // at most one extra insert per user per day.
  await trackEvent({
    name: 'daily_active',
    userId: user.id,
    boardId: null,
    dedupeKey: dailyActiveKey(user.id, new Date()),
  });

  const displayName = profile?.fullName ?? user.email?.split('@')[0] ?? 'User';
  const email = profile?.email ?? user.email ?? '';

  return (
    <div className="bg-background min-h-screen">
      <Navbar user={{ name: displayName, email, avatarUrl: profile?.avatarUrl }} />
      <main>{children}</main>
    </div>
  );
}
