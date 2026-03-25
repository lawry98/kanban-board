import { BlurFade } from '@/components/ui/blur-fade';

const TECH_STACK = [
  { name: 'Next.js', detail: 'App Router' },
  { name: 'Supabase', detail: 'Auth + Realtime' },
  { name: 'Prisma', detail: 'Type-safe ORM' },
  { name: 'shadcn/ui', detail: 'UI components' },
  { name: 'TypeScript', detail: 'Strict mode' },
  { name: 'Tailwind CSS', detail: 'Styling' },
] as const;

export function TechStackSection() {
  return (
    <section className="border-y px-4 py-8">
      <div className="mx-auto max-w-4xl">
        <BlurFade delay={0.1} inView>
          <p className="mb-6 text-center text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            Built with
          </p>
          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4">
            {TECH_STACK.map((tech) => (
              <div key={tech.name} className="flex flex-col items-center gap-0.5">
                <span className="text-sm font-semibold text-foreground/80">{tech.name}</span>
                <span className="text-[10px] text-muted-foreground">{tech.detail}</span>
              </div>
            ))}
          </div>
        </BlurFade>
      </div>
    </section>
  );
}
