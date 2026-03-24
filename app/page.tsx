import { redirect } from 'next/navigation';

import { DotPattern } from '@/components/ui/dot-pattern';
import { LandingHeader } from '@/components/landing/landing-header';
import { HeroSection } from '@/components/landing/hero-section';
import { PreviewSection } from '@/components/landing/preview-section';
import { TechStackSection } from '@/components/landing/tech-stack-section';
import { FeaturesSection } from '@/components/landing/features-section';
import { HowItWorksSection } from '@/components/landing/how-it-works-section';
import { CtaSection } from '@/components/landing/cta-section';
import { LandingFooter } from '@/components/landing/landing-footer';
import { createClient } from '@/lib/supabase/server';
import { cn } from '@/lib/utils';

export default async function LandingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect('/boards');

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden">
      <DotPattern
        className={cn(
          'absolute inset-0 fill-neutral-300/40 dark:fill-neutral-700/25',
          '[mask-image:radial-gradient(ellipse_80%_55%_at_50%_0%,white,transparent)]',
        )}
      />

      <LandingHeader />

      <main className="relative z-10 flex-1">
        <HeroSection />
        <PreviewSection />
        <TechStackSection />
        <FeaturesSection />
        <HowItWorksSection />
        <CtaSection />
      </main>

      <LandingFooter />
    </div>
  );
}
