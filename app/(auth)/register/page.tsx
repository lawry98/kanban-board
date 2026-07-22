'use client';

import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Github } from 'lucide-react';
import { toast } from 'sonner';

import { AuthMessageCard } from '@/components/auth/auth-message-card';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ROUTES, sanitizeNext } from '@/lib/auth/redirects';
import { createClient } from '@/lib/supabase/client';
import type { Route } from 'next';

export default function RegisterPage() {
  // useSearchParams must sit under a Suspense boundary; the auth layout provides none.
  return (
    <Suspense fallback={<Card className="h-96 animate-pulse" />}>
      <RegisterForm />
    </Suspense>
  );
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Preserved through the email-confirm / OAuth round-trip so a link invitee lands
  // back on the invite after signing up. Sanitised against open redirects.
  const next = sanitizeNext(searchParams.get('next'));
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  // Set only when sign-up succeeds but no session was issued (email confirmation
  // enabled) — drives the "check your email" panel instead of a false redirect.
  const [confirmationEmail, setConfirmationEmail] = useState<string | null>(null);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setIsLoading(true);

    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: `${window.location.origin}${ROUTES.authCallback}?next=${encodeURIComponent(next)}`,
      },
    });

    if (error) {
      toast.error(error.message);
      setIsLoading(false);
      return;
    }

    // With confirmations enabled, Supabase obscures an already-registered email by
    // returning a user with an empty `identities` array and no error. Surface that as
    // a soft failure rather than a misleading "check your email".
    if (data.user && data.user.identities && data.user.identities.length === 0) {
      toast.error('An account with this email already exists. Try signing in instead.');
      setIsLoading(false);
      return;
    }

    if (data.session) {
      // Confirmations disabled (or the address was auto-confirmed): the user has a
      // live session now, so send them on to their destination.
      router.push(next as Route);
      router.refresh();
      return;
    }

    // Confirmations enabled: there is no session yet. Redirecting into a protected
    // route would just bounce back to /login, so show a confirmation panel instead.
    setConfirmationEmail(email);
    setIsLoading(false);
  }

  async function handleOAuthLogin() {
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}${ROUTES.authCallback}?next=${encodeURIComponent(next)}`,
      },
    });
    if (error) toast.error(error.message);
  }

  if (confirmationEmail) {
    return (
      <AuthMessageCard
        title="Check your email"
        description={
          <>
            We sent a confirmation link to{' '}
            <span className="text-foreground font-medium">{confirmationEmail}</span>. Click it to
            activate your account, then sign in.
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
        <CardTitle className="text-2xl">Create an account</CardTitle>
        <CardDescription>Start collaborating with your team today</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button variant="outline" className="w-full" onClick={handleOAuthLogin} type="button">
          <Github className="mr-2 h-4 w-4" />
          Continue with GitHub
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <Separator />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card text-muted-foreground px-2">Or continue with</span>
          </div>
        </div>

        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              type="text"
              placeholder="Jane Smith"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              autoComplete="name"
            />
          </div>
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
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              minLength={8}
            />
          </div>
          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>

        <p className="text-muted-foreground text-center text-sm">
          Already have an account?{' '}
          <Link href="/login" className="text-foreground font-medium underline underline-offset-4">
            Sign in
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
