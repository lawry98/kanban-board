import { BlurFade } from '@/components/ui/blur-fade';

const HOW_IT_WORKS = [
  {
    step: '01',
    title: 'Create a board',
    description:
      'Name your project and define columns to match your workflow — from Backlog to Done.',
  },
  {
    step: '02',
    title: 'Add tasks',
    description:
      'Break work into cards. Add labels, due dates, assignees, and priority markers.',
  },
  {
    step: '03',
    title: 'Drag & organize',
    description:
      'Move tasks across columns as work progresses. Reorder cards with a simple drag.',
  },
  {
    step: '04',
    title: 'Collaborate live',
    description:
      'Watch updates appear instantly as your team works. Zero conflicts, zero refreshing.',
  },
] as const;

export function HowItWorksSection() {
  return (
    <section id="how-it-works" className="border-t px-4 py-20">
      <div className="mx-auto max-w-4xl">
        <BlurFade delay={0.1} inView>
          <div className="mb-12 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Up and running in minutes
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-base text-muted-foreground">
              No complex setup. Create a board, add tasks, invite your team, and ship.
            </p>
          </div>
        </BlurFade>

        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map((item, index) => (
            <BlurFade key={item.step} delay={0.2 + index * 0.1} inView>
              <div className="flex flex-col gap-3">
                <div className="text-3xl font-bold tabular-nums text-muted-foreground/25">
                  {item.step}
                </div>
                <h3 className="font-semibold">{item.title}</h3>
                <p className="text-sm leading-6 text-muted-foreground">{item.description}</p>
              </div>
            </BlurFade>
          ))}
        </div>
      </div>
    </section>
  );
}
