/**
 * Ids of the elements a closing dialog hands focus back to. The task and confirm dialogs
 * open from a card or a menu item, not a Radix `DialogTrigger`, so on close Radix focuses
 * nothing and focus drops to `<body>`. Each dialog's `onCloseAutoFocus` prevents that and
 * focuses one of these instead, looked up when it closes: that survives re-renders and a
 * card remounting in another column.
 */
export function taskCardId(taskId: string): string {
  return `task-card-${taskId}`;
}

export function columnActionsId(columnId: string): string {
  return `column-actions-${columnId}`;
}

export function focusById(id: string): void {
  document.getElementById(id)?.focus();
}
