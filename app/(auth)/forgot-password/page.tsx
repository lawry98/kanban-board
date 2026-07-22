'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';

import { AuthMessageCard } from '@/components/auth/auth-message-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ROUTES } from '@/lib/auth/redirects';
import { createClient } from '@/lib/supabase/client';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    const supabase = createClient();
    // The recovery link returns through the shared /auth/callback, which exchanges
    // the code for a session and forwards to /reset-password to set a new password.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}${ROUTES.authCallback}?next=${encodeURIComponent(ROUTES.resetPassword)}`,
    });
    setIsLoading(false);

    if (error) {
      // Supabase does not reveal whether an address exists, so a returned error is a
      // genuine failure (rate limit, transport) worth surfacing rather than hiding.
      toast.error(error.message);
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <AuthMessageCard
        title="Check your email"
        description={
          <>
            If an account exists for <span className="text-foreground font-medium">{email}</span>, a
            password-reset link is on its way.
          </>
        }
      >
        <Button asChild variant="outline" className="w-full">
          <Link href={ROUTES.login}>Back to sign in</Link>
        </Button>
      </AuthMessageCard>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">Reset your password</CardTitle>
        <CardDescription>
          Enter your email and we will send you a link to set a new password.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>

        <p className="text-muted-foreground text-center text-sm">
          Remembered it?{' '}
          <Link
            href={ROUTES.login}
            className="text-foreground font-medium underline underline-offset-4"
          >
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
