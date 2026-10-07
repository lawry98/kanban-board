/**
 * Ids of the elements a closing dialog hands focus back to. The task, confirm and create-board
 * dialogs open from a card, a menu item or a button, not a Radix `DialogTrigger`, so on close
 * Radix focuses nothing and focus drops to `<body>`. Each dialog's `onCloseAutoFocus` prevents
 * that and focuses one of these instead, looked up when it closes: that survives re-renders
 * and a card remounting in another column.
 */
export function taskCardId(taskId: string): string {
  return `task-card-${taskId}`;
}

export function columnActionsId(columnId: string): string {
  return `column-actions-${columnId}`;
}

/** The boards page's create-board buttons; the dialog returns focus to the one that opened it. */
export const NEW_BOARD_BUTTON_ID = 'new-board-button';
export const NEW_BOARD_CARD_ID = 'new-board-card';
export const CREATE_FIRST_BOARD_BUTTON_ID = 'create-first-board-button';

export function focusById(id: string): void {
  document.getElementById(id)?.focus();
}
