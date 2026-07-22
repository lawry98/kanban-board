import Link from 'next/link';
import type { Metadata } from 'next';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';

import { JoinButton } from './join-button';

export const metadata: Metadata = {
  title: 'Join board',
};

interface JoinPageProps {
  params: Promise<{ token: string }>;
}

function isActive(invitation: { revokedAt: Date | null; expiresAt: Date | null }): boolean {
  if (invitation.revokedAt) return false;
  if (invitation.expiresAt && invitation.expiresAt.getTime() <= Date.now()) return false;
  return true;
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'an owner',
  EDITOR: 'an editor',
  VIEWER: 'a viewer',
};

export default async function JoinPage({ params }: JoinPageProps) {
  const { token } = await params;

  // Read-only lookup: acceptance is a separate, explicit POST via <JoinButton>,
  // so merely loading (or prefetching) this page never joins anyone.
  const invitation = await prisma.invitation.findUnique({
    where: { token },
    include: {
      board: { select: { title: true } },
      inviter: { select: { fullName: true } },
    },
  });

  if (!invitation || !isActive(invitation)) {
    return (
      <JoinShell>
        <Card>
          <CardHeader>
            <CardTitle>Invite link no longer valid</CardTitle>
            <CardDescription>
              This invite link has been revoked or has expired. Ask the board owner for a new one.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/boards">Go to your boards</Link>
            </Button>
          </CardContent>
        </Card>
      </JoinShell>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const boardTitle = invitation.board.title;
  const roleLabel = ROLE_LABELS[invitation.role] ?? 'a member';
  const inviterName = invitation.inviter.fullName;

  if (!user) {
    // encodeURIComponent so the /join/<token> path survives as a single ?next value;
    // sanitizeNext on the auth pages re-validates it before use.
    const next = encodeURIComponent(`/join/${token}`);
    return (
      <JoinShell>
        <Card>
          <CardHeader>
            <CardTitle>
              Join <span className="font-semibold">{boardTitle}</span>
            </CardTitle>
            <CardDescription>
              {inviterName ? `${inviterName} invited you` : 'You have been invited'} to collaborate
              as {roleLabel}. Sign in or create an account to continue.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild className="w-full">
              <Link href={`/login?next=${next}`}>Sign in</Link>
            </Button>
            <Button asChild variant="outline" className="w-full">
              <Link href={`/register?next=${next}`}>Create an account</Link>
            </Button>
          </CardContent>
        </Card>
      </JoinShell>
    );
  }

  return (
    <JoinShell>
      <Card>
        <CardHeader>
          <CardTitle>
            Join <span className="font-semibold">{boardTitle}</span>
          </CardTitle>
          <CardDescription>
            {inviterName ? `${inviterName} invited you` : 'You have been invited'} to join this
            board as {roleLabel}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <JoinButton token={token} />
          <Button asChild variant="ghost" className="w-full">
            <Link href="/boards">Not now</Link>
          </Button>
        </CardContent>
      </Card>
    </JoinShell>
  );
}

function JoinShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}
