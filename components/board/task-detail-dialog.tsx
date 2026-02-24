'use client';

import { useState } from 'react';
import { format } from 'date-fns';
import { Trash2, X } from 'lucide-react';
import { toast } from 'sonner';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
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
import { updateTask, deleteTask } from '@/app/actions/task-actions';
import { useBoardContext } from '@/contexts/board-context';
import { PRIORITY_LABELS } from '@/lib/constants';
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
  const { state, dispatch, canEdit, isOwner } = useBoardContext();
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? '');
  const [priority, setPriority] = useState<string>(task.priority);
  const [assigneeId, setAssigneeId] = useState<string>(task.assigneeId ?? 'none');
  const [columnId, setColumnId] = useState(task.columnId);
  const [dueDate, setDueDate] = useState(
    task.dueDate ? format(new Date(task.dueDate), 'yyyy-MM-dd') : '',
  );
  const [labelInput, setLabelInput] = useState('');
  const [labels, setLabels] = useState<string[]>(task.labels);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  async function handleSave() {
    if (!title.trim()) return;
    setIsSaving(true);

    const result = await updateTask(task.id, {
      title: title.trim(),
      description: description || null,
      priority: priority as TaskWithAssignee['priority'],
      labels,
      dueDate: dueDate || null,
      assigneeId: assigneeId === 'none' ? null : assigneeId,
      columnId,
    });

    setIsSaving(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.data) {
      dispatch({ type: 'UPDATE_TASK', payload: result.data });
    }
    toast.success('Task updated');
    onClose();
  }

  async function handleDelete() {
    setIsDeleting(true);

    const result = await deleteTask(task.id);
    setIsDeleting(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    dispatch({ type: 'DELETE_TASK', payload: { taskId: task.id, columnId: task.columnId } });
    toast.success('Task deleted');
    onClose();
  }

  function addLabel() {
    const trimmed = labelInput.trim();
    if (trimmed && !labels.includes(trimmed)) {
      setLabels([...labels, trimmed]);
    }
    setLabelInput('');
  }

  function removeLabel(label: string) {
    setLabels(labels.filter((l) => l !== label));
  }

  const creatorName = task.creator.fullName ?? task.creator.email;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">Task details</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Title */}
          <div className="space-y-1">
            <Label>Title</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={!canEdit}
              className="text-base font-medium"
            />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={!canEdit}
              rows={3}
              placeholder="Add a description…"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* Priority */}
            <div className="space-y-1">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={setPriority} disabled={!canEdit}>
                <SelectTrigger>
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
              <Label>Column</Label>
              <Select value={columnId} onValueChange={setColumnId} disabled={!canEdit}>
                <SelectTrigger>
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
              <Label>Assignee</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId} disabled={!canEdit}>
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {state.members.map((member) => {
                    const name = member.profile.fullName ?? member.profile.email;
                    return (
                      <SelectItem key={member.userId} value={member.userId}>
                        <div className="flex items-center gap-2">
                          <Avatar className="h-4 w-4">
                            {member.profile.avatarUrl && (
                              <AvatarImage src={member.profile.avatarUrl} alt={name} />
                            )}
                            <AvatarFallback className="text-[8px]">
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
              <Label>Due date</Label>
              <Input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                disabled={!canEdit}
              />
            </div>
          </div>

          {/* Labels */}
          <div className="space-y-2">
            <Label>Labels</Label>
            <div className="flex flex-wrap gap-1 min-h-[28px]">
              {labels.map((label) => (
                <Badge key={label} variant="secondary" className="gap-1 pr-1">
                  {label}
                  {canEdit && (
                    <button onClick={() => removeLabel(label)} className="rounded hover:bg-muted">
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
            {canEdit && (
              <div className="flex gap-2">
                <Input
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addLabel();
                    }
                  }}
                  placeholder="Add a label…"
                  className="h-8"
                />
                <Button size="sm" variant="outline" onClick={addLabel} disabled={!labelInput.trim()}>
                  Add
                </Button>
              </div>
            )}
          </div>

          <Separator />

          {/* Meta */}
          <div className="text-xs text-muted-foreground space-y-1">
            <p>
              Created by {creatorName} ·{' '}
              {format(new Date(task.createdAt), 'MMM d, yyyy')}
            </p>
          </div>

          {/* Actions */}
          {canEdit && (
            <div className="flex justify-between pt-2">
              {(canEdit || isOwner) && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleDelete}
                  disabled={isDeleting}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  {isDeleting ? 'Deleting…' : 'Delete'}
                </Button>
              )}
              <div className="flex gap-2 ml-auto">
                <Button variant="outline" size="sm" onClick={onClose}>
                  Cancel
                </Button>
                <Button size="sm" onClick={handleSave} disabled={isSaving || !title.trim()}>
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
