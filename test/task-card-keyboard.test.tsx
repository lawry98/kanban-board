import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DragDropContext, Droppable } from '@hello-pangea/dnd';

vi.mock('@/contexts/board-context', () => ({ useBoardContext: vi.fn() }));

import { TaskCard } from '@/components/board/task-card';
import { useBoardContext } from '@/contexts/board-context';
import { taskCardId } from '@/lib/dom-ids';
import type { TaskWithAssignee } from '@/types';

const USER_ID = '44444444-4444-4444-8444-444444444444';

const TASK: TaskWithAssignee = {
  id: '11111111-1111-4111-8111-111111111111',
  columnId: '22222222-2222-4222-8222-222222222222',
  boardId: '33333333-3333-4333-8333-333333333333',
  title: 'Write launch post',
  description: null,
  position: 1000,
  priority: 'HIGH',
  labels: ['launch', 'copy', 'blog', 'seo'],
  dueDate: null,
  assigneeId: USER_ID,
  createdBy: USER_ID,
  createdAt: new Date('2026-09-01T15:00:00.000Z'),
  updatedAt: new Date('2026-09-01T15:00:00.000Z'),
  assignee: { id: USER_ID, fullName: 'Ada Lovelace', avatarUrl: null },
  creator: { id: USER_ID, fullName: 'Ada Lovelace', avatarUrl: null },
};

function renderCard(canEdit: boolean, task: TaskWithAssignee = TASK) {
  vi.mocked(useBoardContext).mockReturnValue({ canEdit } as unknown as ReturnType<
    typeof useBoardContext
  >);
  const onClick = vi.fn();
  render(
    <DragDropContext onDragEnd={() => {}}>
      <Droppable droppableId="column">
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps}>
            <TaskCard task={task} index={0} onClick={onClick} />
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>,
  );
  return { onClick, card: screen.getByRole('button', { name: 'Write launch post' }) };
}

describe.each([
  ['an editor', true],
  ['a viewer', false],
])('TaskCard for %s', (_, canEdit) => {
  it('is reachable with Tab', async () => {
    const user = userEvent.setup();
    const { card } = renderCard(canEdit);
    await user.tab();
    expect(card).toHaveFocus();
  });

  it('opens with Enter', async () => {
    const user = userEvent.setup();
    const { card, onClick } = renderCard(canEdit);
    card.focus();
    await user.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith(TASK);
  });

  it('carries the id a closing task dialog returns focus to', () => {
    const { card } = renderCard(canEdit);
    expect(card).toHaveAttribute('id', taskCardId(TASK.id));
  });

  it('is named by its title and described by its details', () => {
    const { card } = renderCard(canEdit);
    expect(card).toHaveAccessibleDescription(/High/);
    // Badges are inline spans, so jsdom joins their text without spaces (even the sr-only
    // " more label" loses its leading one); a real browser lays them out as flex items.
    expect(card).toHaveAccessibleDescription(/launch.*copy.*blog.*\+1\s*more label/);
    expect(card).toHaveAccessibleDescription(/Assigned to Ada Lovelace/);
  });

  it('opens once while Enter is held down (auto-repeat is ignored)', () => {
    // A dialog closed by a held Enter returns focus here; its repeats must not reopen it.
    const { card, onClick } = renderCard(canEdit);
    fireEvent.keyDown(card, { key: 'Enter' });
    fireEvent.keyDown(card, { key: 'Enter', repeat: true });
    fireEvent.keyDown(card, { key: 'Enter', repeat: true });
    fireEvent.keyUp(card, { key: 'Enter' });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('ignores an Enter that something else already handled', () => {
    const { card, onClick } = renderCard(canEdit);
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    event.preventDefault(); // what dnd does to Enter mid-drag
    card.dispatchEvent(event);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('TaskCard Space key', () => {
  it('opens a viewer card (a plain button: nothing to drag)', async () => {
    const user = userEvent.setup();
    const { card, onClick } = renderCard(false);
    card.focus();
    await user.keyboard(' ');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  // Like a native button: opening on keydown would move focus into the dialog, and Firefox
  // then clicks whichever dialog button has focus when Space comes back up.
  it('opens a viewer card on keyup, not keydown', async () => {
    const user = userEvent.setup();
    const { card, onClick } = renderCard(false);
    card.focus();

    await user.keyboard('[Space>]');
    expect(onClick).not.toHaveBeenCalled();

    await user.keyboard('[/Space]');
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("stops a viewer card's Space keydown from scrolling the page", () => {
    const { card } = renderCard(false);
    // fireEvent returns false when a handler called preventDefault().
    expect(fireEvent.keyDown(card, { key: ' ' })).toBe(false);
  });

  it('is left to dnd on an editor card and never opens it', async () => {
    const user = userEvent.setup();
    const { card, onClick } = renderCard(true);
    card.focus();
    await user.keyboard(' ');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('gives editors the drag instructions', () => {
    const { card } = renderCard(true);
    expect(card).toHaveAccessibleDescription(/space bar/i);
  });

  it('gives viewers no drag instructions', () => {
    const { card } = renderCard(false);
    expect(card).not.toHaveAccessibleDescription(/space bar/i);
  });
});
