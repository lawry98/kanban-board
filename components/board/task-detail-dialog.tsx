'use client';

import { useEffect, useRef, useState } from 'react';
import { format } from 'date-fns';
import { Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { ConfirmDialog } from '@/components/board/confirm-dialog';
import { updateTask, deleteTask } from '@/app/actions/task-actions';
import { useBoardContext } from '@/contexts/board-context';
import {
  MAX_LABEL_LENGTH,
  MAX_TASK_DESCRIPTION_LENGTH,
  MAX_TASK_TITLE_LENGTH,
  PRIORITY_LABELS,
} from '@/lib/constants';
import { formatCalendarDate } from '@/lib/dates';
import { columnActionsId, focusById, taskCardId } from '@/lib/dom-ids';
import type { UpdateTaskInput } from '@/lib/validations/task';
import type { TaskWithAssignee } from '@/types';

interface TaskDetailDialogProps {
  task: TaskWithAssignee | null;
  onClose: () => void;
}

interface TaskFormProps {
  task: TaskWithAssignee;
  onClose: () => void;
}

function TaskForm({ task, onClose }: TaskFormProps) {
  const { state, dispatch, canEdit } = useBoardContext();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [priority, setPriority] = useState<string>(task.priority);
  const [assigneeId, setAssigneeId] = useState<string>(task.assigneeId ?? 'none');
  const [columnId, setColumnId] = useState(task.columnId);
  const initialDueDate = task.dueDate ? formatCalendarDate(task.dueDate) : '';
  const [dueDate, setDueDate] = useState(initialDueDate);
  const [labelInput, setLabelInput] = useState('');
  const [labels, setLabels] = useState<string[]>(task.labels);
  const [isSaving, setIsSaving] = useState(false);
  // Shown only after a Save with an empty title; cleared as soon as it has text again.
  const [titleError, setTitleError] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const removeLabelButtonsRef = useRef(new Map<string, HTMLButtonElement>());
  const deleteButtonRef = useRef<HTMLButtonElement>(null);
  // Where focus goes when this dialog closes: the card, or a neighbour once it's deleted.
  const returnFocusIdRef = useRef(taskCardId(task.id));
  // The committed board, for a delete to read after its await: by then this render's
  // `state` may be stale (a realtime sync can land mid-request).
  const columnsRef = useRef(state.columns);
  useEffect(() => {
    columnsRef.current = state.columns;
  }, [state.columns]);

  async function handleSave() {
    if (!title.trim()) {
      setTitleError(true);
      titleInputRef.current?.focus();
      return;
    }

    // Only what the user changed: re-sending untouched fields would overwrite a
    // collaborator's concurrent edit with this dialog's stale copy.
    const changes: UpdateTaskInput = {};
    if (title.trim() !== task.title) changes.title = title.trim();
    if (description !== (task.description ?? '')) changes.description = description || null;
    if (priority !== task.priority) changes.priority = priority as TaskWithAssignee['priority'];
    if (labels.length !== task.labels.length || labels.some((l, i) => l !== task.labels[i])) {
      changes.labels = labels;
    }
    if (dueDate !== initialDueDate) changes.dueDate = dueDate || null;
    const nextAssigneeId = assigneeId === 'none' ? null : assigneeId;
    if (nextAssigneeId !== task.assigneeId) changes.assigneeId = nextAssigneeId;
    if (columnId !== task.columnId) changes.columnId = columnId;

    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }

    setIsSaving(true);
    try {
      const result = await updateTask(task.id, changes);
      if (result.error) {
        toast.error(result.error);
        return;
      }
      if (result.data) {
        dispatch({ type: 'UPDATE_TASK', payload: result.data });
      }
      toast.success('Task updated');
      onClose();
    } catch (err) {
      console.error('updateTask failed:', err);
      toast.error('Failed to update task');
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDelete() {
    try {
      const result = await deleteTask(task.id);
      if (result.error) {
        toast.error(result.error);
        return;
      }

      // The card is about to go: the next card in its column takes focus, else the previous,
      // else the column's menu button.
      const siblings = columnsRef.current.find((col) => col.id === task.columnId)?.tasks ?? [];
      const index = siblings.findIndex((t) => t.id === task.id);
      const neighbour = index === -1 ? undefined : (siblings[index + 1] ?? siblings[index - 1]);
      returnFocusIdRef.current = neighbour
        ? taskCardId(neighbour.id)
        : columnActionsId(task.columnId);

      dispatch({ type: 'DELETE_TASK', payload: { taskId: task.id, columnId: task.columnId } });
      toast.success('Task deleted');
      onClose();
    } catch (err) {
      console.error('deleteTask failed:', err);
      toast.error('Failed to delete task');
    }
  }

  function addLabel() {
    const trimmed = labelInput.trim();
    if (trimmed && !labels.includes(trimmed)) {
      setLabels([...labels, trimmed]);
    }
    setLabelInput('');
  }

  function removeLabel(label: string) {
    // Its button is about to unmount: focus the next one, else the previous, else the input.
    const index = labels.indexOf(label);
    const neighbour = labels[index + 1] ?? labels[index - 1];
    (neighbour ? removeLabelButtonsRef.current.get(neighbour) : labelInputRef.current)?.focus();
    setLabels(labels.filter((l) => l !== label));
  }

  const creatorName = task.creator?.fullName ?? 'a deleted user';

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className="max-h-[90vh] max-w-lg overflow-y-auto"
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          focusById(returnFocusIdRef.current);
        }}
      >
        <DialogHeader>
          <DialogTitle className="sr-only">Task details</DialogTitle>
          <DialogDescription className="sr-only">
            {canEdit ? "View and edit this task's details." : "View this task's details."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title */}
          <div className="space-y-1">
            <Label htmlFor="task-title">Title</Label>
            <Input
              ref={titleInputRef}
              id="task-title"
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (e.target.value.trim()) setTitleError(false);
              }}
              disabled={!canEdit}
              required
              maxLength={MAX_TASK_TITLE_LENGTH}
              aria-invalid={titleError || undefined}
              aria-describedby={titleError ? 'task-title-error' : undefined}
              className="text-base font-medium"
            />
            {titleError && (
              <p id="task-title-error" className="text-destructive text-sm">
                Title is required
              </p>
            )}
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label htmlFor="task-description">Description</Label>
            <Textarea
              id="task-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canEdit}
              rows={3}
              maxLength={MAX_TASK_DESCRIPTION_LENGTH}
              placeholder="Add a description…"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Priority */}
            <div className="space-y-1">
              <Label htmlFor="task-priority">Priority</Label>
              <Select value={priority} onValueChange={setPriority} disabled={!canEdit}>
                <SelectTrigger id="task-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRIORITY_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Column */}
            <div className="space-y-1">
              <Label htmlFor="task-column">Column</Label>
              <Select value={columnId} onValueChange={setColumnId} disabled={!canEdit}>
                <SelectTrigger id="task-column">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {state.columns.map((col) => (
                    <SelectItem key={col.id} value={col.id}>
                      {col.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Assignee */}
            <div className="space-y-1">
              <Label htmlFor="task-assignee">Assignee</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId} disabled={!canEdit}>
                <SelectTrigger id="task-assignee">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {state.members.map((member) => {
                    const name = member.profile.fullName ?? member.profile.email;
                    return (
                      <SelectItem key={member.userId} value={member.userId}>
                        <div className="flex items-center gap-2">
                          {/* The name follows; initials would read it twice. */}
                          <Avatar className="h-4 w-4" aria-hidden="true">
                            {member.profile.avatarUrl && (
                              <AvatarImage src={member.profile.avatarUrl} alt={name} />
                            )}
                            <AvatarFallback className="text-foreground text-[8px]">
                              {name.slice(0, 2).toUpperCase()}
                            </AvatarFallback>
                          </Avatar>
                          {name}
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Due date */}
            <div className="space-y-1">
              <Label htmlFor="task-due-date">Due date</Label>
              <Input
                id="task-due-date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={!canEdit}
              />
            </div>
          </div>

          {/* Labels */}
          <div className="space-y-2">
            <Label htmlFor={canEdit ? 'task-label-input' : undefined}>Labels</Label>
            <div className="flex min-h-[28px] flex-wrap gap-1">
              {labels.map((label) => (
                <Badge key={label} variant="secondary" className="gap-1 pr-1">
                  {label}
                  {canEdit && (
                    <button
                      ref={(el) => {
                        if (el) removeLabelButtonsRef.current.set(label, el);
                        return () => {
                          removeLabelButtonsRef.current.delete(label);
                        };
                      }}
                      type="button"
                      onClick={() => removeLabel(label)}
                      aria-label={`Remove label ${label}`}
                      className="hover:bg-muted focus-visible:ring-ring rounded p-1 outline-none focus-visible:ring-2"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <Input
                  ref={labelInputRef}
                  id="task-label-input"
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addLabel();
                    }
                  }}
                  placeholder="Add a label…"
                  maxLength={MAX_LABEL_LENGTH}
                  className="h-8"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={addLabel}
                  disabled={!labelInput.trim()}
                >
                  Add
                </Button>
              </div>
            )}
          </div>

          <Separator />

          {/* Meta */}
          <div className="text-muted-foreground space-y-1 text-xs">
            <p>
              Created by {creatorName} · {format(new Date(task.createdAt), 'MMM d, yyyy')}
            </p>
          </div>

          {/* Actions */}
          {canEdit && (
            <div className="flex justify-between pt-2">
              <Button
                ref={deleteButtonRef}
                variant="destructive"
                size="sm"
                onClick={() => setConfirmDeleteOpen(true)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
              <ConfirmDialog
                open={confirmDeleteOpen}
                onOpenChange={setConfirmDeleteOpen}
                title="Delete this task?"
                description={
                  <>
                    <span className="text-foreground font-medium">{task.title}</span> will be
                    permanently deleted. This cannot be undone.
                  </>
                }
                confirmLabel="Delete task"
                pendingLabel="Deleting…"
                onConfirm={handleDelete}
                onCloseAutoFocus={(event) => {
                  // Cancelled: back to Delete. Once the task is deleted this dialog is gone
                  // too (the ref is null) and its own handler places focus.
                  event.preventDefault();
                  deleteButtonRef.current?.focus();
                }}
              />
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                {/* Enabled with an empty title: pressing it says why it can't save. */}
                <Button size="sm" onClick={handleSave} disabled={isSaving}>
                  {isSaving ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function TaskDetailDialog({ task, onClose }: TaskDetailDialogProps) {
  if (!task) return null;
  return <TaskForm key={task.id} task={task} onClose={onClose} />;
}
