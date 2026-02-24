import { redirect } from 'next/navigation';

import { Navbar } from '@/components/layout/navbar';
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

  const displayName = profile?.fullName ?? user.email?.split('@')[0] ?? 'User';
  const email = profile?.email ?? user.email ?? '';

  return (
    <div className="min-h-screen bg-background">
      <Navbar user={{ name: displayName, email, avatarUrl: profile?.avatarUrl }} />
      <main>{children}</main>
    </div>
  );
}
