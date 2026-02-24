'use client';

import { useState, useRef } from 'react';
import { Droppable } from '@hello-pangea/dnd';
import { MoreHorizontal, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TaskCard } from '@/components/board/task-card';
import { updateColumn, deleteColumn } from '@/app/actions/column-actions';
import { createTask } from '@/app/actions/task-actions';
import { useBoardContext } from '@/contexts/board-context';
import type { ColumnWithTasks, TaskWithAssignee } from '@/types';

interface ColumnProps {
  column: ColumnWithTasks;
  onTaskClick: (task: TaskWithAssignee) => void;
}

export function Column({ column, onTaskClick }: ColumnProps) {
  const { board, dispatch, canEdit } = useBoardContext();
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(column.title);
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [isCreatingTask, setIsCreatingTask] = useState(false);
  const titleInputRef = useRef<HTMLInputElement>(null);

  async function handleRenameColumn() {
    if (!titleValue.trim() || titleValue === column.title) {
      setIsEditingTitle(false);
      setTitleValue(column.title);
      return;
    }

    const result = await updateColumn(column.id, { title: titleValue.trim() });
    if (result.error) {
      toast.error(result.error);
      setTitleValue(column.title);
    } else {
      dispatch({ type: 'UPDATE_COLUMN', payload: { id: column.id, title: titleValue.trim() } });
    }
    setIsEditingTitle(false);
  }

  async function handleDeleteColumn() {
    const result = await deleteColumn(column.id);
    if (result.error) {
      toast.error(result.error);
      return;
    }
    dispatch({ type: 'DELETE_COLUMN', payload: { columnId: column.id } });
    toast.success('Column deleted');
  }

  async function handleCreateTask() {
    if (!newTaskTitle.trim() || isCreatingTask) return;
    setIsCreatingTask(true);

    const result = await createTask(column.id, board.id, { title: newTaskTitle.trim() });
    setIsCreatingTask(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    if (result.data) {
      dispatch({ type: 'ADD_TASK', payload: result.data });
    }
    setNewTaskTitle('');
    setIsAddingTask(false);
  }

  return (
    <div className="flex w-72 shrink-0 flex-col gap-2">
      {/* Column header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {column.color && (
            <div
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: column.color }}
            />
          )}

          {isEditingTitle && canEdit ? (
            <Input
              ref={titleInputRef}
              value={titleValue}
              onChange={(e) => setTitleValue(e.target.value)}
              onBlur={handleRenameColumn}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleRenameColumn();
                if (e.key === 'Escape') {
                  setIsEditingTitle(false);
                  setTitleValue(column.title);
                }
              }}
              className="h-7 text-sm font-medium px-1"
              autoFocus
            />
          ) : (
            <h3
              className={`text-sm font-medium truncate ${canEdit ? 'cursor-pointer hover:text-foreground/70' : ''}`}
              onClick={() => canEdit && setIsEditingTitle(true)}
            >
              {column.title}
            </h3>
          )}

          <Badge variant="secondary" className="text-xs shrink-0 h-5 px-1.5">
            {column.tasks.length}
          </Badge>
        </div>

        {canEdit && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => {
                  setIsEditingTitle(true);
                  setTimeout(() => titleInputRef.current?.focus(), 50);
                }}
              >
                <Pencil className="mr-2 h-4 w-4" />
                Rename
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleDeleteColumn}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete column
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      {/* Droppable task area */}
      <Droppable droppableId={column.id}>
        {(provided, snapshot) => (
          <ScrollArea
            className={`rounded-lg border bg-muted/30 transition-colors ${
              snapshot.isDraggingOver ? 'bg-muted/60' : ''
            }`}
          >
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className="flex flex-col gap-2 p-2 min-h-[60px]"
            >
              {column.tasks.length === 0 && !snapshot.isDraggingOver && (
                <p className="text-xs text-muted-foreground text-center py-4">No tasks yet</p>
              )}

              {column.tasks.map((task, index) => (
                <TaskCard key={task.id} task={task} index={index} onClick={onTaskClick} />
              ))}

              {provided.placeholder}
            </div>
          </ScrollArea>
        )}
      </Droppable>

      {/* Add task */}
      {canEdit && (
        <div>
          {isAddingTask ? (
            <div className="space-y-2 p-2 rounded-lg border bg-card">
              <Input
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateTask();
                  if (e.key === 'Escape') {
                    setIsAddingTask(false);
                    setNewTaskTitle('');
                  }
                }}
                placeholder="Task title…"
                autoFocus
                disabled={isCreatingTask}
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleCreateTask}
                  disabled={isCreatingTask || !newTaskTitle.trim()}
                >
                  {isCreatingTask ? 'Adding…' : 'Add task'}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setIsAddingTask(false);
                    setNewTaskTitle('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-muted-foreground hover:text-foreground"
              onClick={() => setIsAddingTask(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add task
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
