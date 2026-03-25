import { BlurFade } from '@/components/ui/blur-fade';
import { MockBoardPreview } from '@/components/landing/mock-board-preview';

export function PreviewSection() {
  return (
    <section id="preview" className="px-4 pb-20">
      <div className="mx-auto max-w-5xl">
        <BlurFade delay={0.5}>
          <p className="mb-5 text-center text-sm text-muted-foreground">
            A real kanban board — drag, drop, collaborate in real time
          </p>
          <MockBoardPreview />
        </BlurFade>
      </div>
    </section>
  );
}
