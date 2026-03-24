import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

import { BlurFade } from '@/components/ui/blur-fade';
import { PulsatingButton } from '@/components/ui/pulsating-button';

export function CtaSection() {
  return (
    <section className="border-t px-4 py-24">
      <div className="mx-auto max-w-2xl text-center">
        <BlurFade delay={0.1} inView>
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Ready to ship faster?
          </h2>
          <p className="mx-auto mt-4 max-w-md text-base text-muted-foreground">
            Create your first board in seconds. Free to use, no credit card required.
          </p>
          <div className="mt-8 flex justify-center">
            <Link href="/register">
              <PulsatingButton className="inline-flex h-11 items-center gap-2 px-8 text-sm font-medium" pulseColor="#6366f1">
                Get started for free
                <ArrowRight className="h-4 w-4" />
              </PulsatingButton>
            </Link>
          </div>
        </BlurFade>
      </div>
    </section>
  );
}
