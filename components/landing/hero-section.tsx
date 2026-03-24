import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

import { AnimatedGradientText } from '@/components/ui/animated-gradient-text';
import { Button } from '@/components/ui/button';
import { BlurFade } from '@/components/ui/blur-fade';
import { InteractiveHoverButton } from '@/components/ui/interactive-hover-button';
import { cn } from '@/lib/utils';

export function HeroSection() {
  return (
    <section className="flex flex-col items-center px-4 pb-14 pt-24 text-center">
      <BlurFade delay={0.1}>
        <div className="group relative mb-4 inline-flex items-center justify-center rounded-full px-4 py-1.5 shadow-[inset_0_-8px_10px_#8fdfff1f] transition-shadow duration-500 ease-out hover:shadow-[inset_0_-5px_10px_#8fdfff3f]">
          <span
            className={cn(
              'animate-gradient absolute inset-0 block h-full w-full rounded-[inherit] bg-gradient-to-r from-[#ffaa40]/50 via-[#9c40ff]/50 to-[#ffaa40]/50 bg-[length:300%_100%] p-[1px]',
            )}
            style={{
              WebkitMask:
                'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
              WebkitMaskComposite: 'destination-out',
              mask: 'linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0)',
              maskComposite: 'subtract',
              WebkitClipPath: 'padding-box',
            }}
          />
          <AnimatedGradientText className="text-sm font-medium">
            Real-time collaborative project management
          </AnimatedGradientText>
          <ChevronRight className="ml-1 size-4 stroke-neutral-500 transition-transform duration-300 ease-in-out group-hover:translate-x-0.5" />
        </div>
      </BlurFade>

      <BlurFade delay={0.2}>
        <h1 className="mx-auto max-w-3xl text-5xl font-bold tracking-tight sm:text-6xl lg:text-7xl">
          Ship faster,{' '}
          <span className="bg-gradient-to-r from-indigo-500 via-purple-500 to-violet-500 bg-clip-text text-transparent">
            together
          </span>
        </h1>
      </BlurFade>

      <BlurFade delay={0.3}>
        <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-zinc-600 dark:text-zinc-300 sm:text-lg sm:leading-8">
          Organize tasks in boards, move cards with drag-and-drop, and stay in sync with your
          team in real time — so nothing falls through the cracks.
        </p>
      </BlurFade>

      <BlurFade delay={0.4}>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Link href="/register">
            <InteractiveHoverButton className="h-11 text-sm">
              Get started for free
            </InteractiveHoverButton>
          </Link>
          <Button size="lg" variant="outline" className="h-11 px-7" asChild>
            <a href="#preview">See it in action</a>
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Free to use · No credit card required
        </p>
      </BlurFade>
    </section>
  );
}
