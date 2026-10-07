'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, LayoutDashboard } from 'lucide-react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BlurFade } from '@/components/ui/blur-fade';
import { NumberTicker } from '@/components/ui/number-ticker';
import { CreateBoardDialog } from '@/components/board/create-board-dialog';
import {
  CREATE_FIRST_BOARD_BUTTON_ID,
  NEW_BOARD_BUTTON_ID,
  NEW_BOARD_CARD_ID,
} from '@/lib/dom-ids';
import { cn } from '@/lib/utils';
import type { BoardWithMembers } from '@/types';

interface BoardsClientProps {
  boards: (BoardWithMembers & { role: string; updatedAtRelative: string })[];
}

export function BoardsClient({ boards }: BoardsClientProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  // Outlives the open state: the dialog reads it as it closes.
  const [openerId, setOpenerId] = useState(NEW_BOARD_BUTTON_ID);

  function openDialog(id: string) {
    setOpenerId(id);
    setDialogOpen(true);
  }

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Boards</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {boards.length === 0
              ? 'Create your first board to get started'
              : `${boards.length} board${boards.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <Button id={NEW_BOARD_BUTTON_ID} onClick={() => openDialog(NEW_BOARD_BUTTON_ID)}>
          <Plus className="mr-2 h-4 w-4" />
          New board
        </Button>
      </div>

      {boards.length === 0 ? (
        <BlurFade delay={0.1}>
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
            <LayoutDashboard className="text-muted-foreground/50 mb-4 h-12 w-12" />
            <h2 className="text-lg font-medium">No boards yet</h2>
            <p className="text-muted-foreground mt-1 mb-6 text-sm">
              Create your first board to start organizing tasks with your team.
            </p>
            <Button
              id={CREATE_FIRST_BOARD_BUTTON_ID}
              onClick={() => openDialog(CREATE_FIRST_BOARD_BUTTON_ID)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Create your first board
            </Button>
          </div>
        </BlurFade>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {boards.map((board, index) => (
            <BlurFade key={board.id} delay={0.05 * index}>
              <Link
                href={`/board/${board.id}`}
                aria-labelledby={`board-${board.id}-title`}
                aria-describedby={cn(
                  board.description && `board-${board.id}-description`,
                  `board-${board.id}-summary`,
                )}
                className="group focus-visible:ring-ring block rounded-xl outline-none focus-visible:ring-2"
              >
                <Card className="h-full cursor-pointer transition-shadow hover:shadow-md">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle
                        id={`board-${board.id}-title`}
                        className="line-clamp-2 text-base leading-tight font-medium"
                      >
                        {board.title}
                      </CardTitle>
                      <Badge variant="outline" className="shrink-0 text-xs capitalize">
                        {board.role.toLowerCase()}
                      </Badge>
                    </div>
                    {board.description && (
                      <p
                        id={`board-${board.id}-description`}
                        className="text-muted-foreground mt-1 line-clamp-2 text-xs"
                      >
                        {board.description}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0">
                    {/* The visible NumberTicker animates up from 0, so it can't be the description. */}
                    <span id={`board-${board.id}-summary`} className="sr-only">
                      {`${board.role.toLowerCase()}, ${board._count.tasks} task${board._count.tasks === 1 ? '' : 's'}, updated ${board.updatedAtRelative}`}
                    </span>
                    <div className="flex items-center justify-between">
                      <div className="text-muted-foreground flex items-center gap-3 text-xs">
                        <span>
                          <NumberTicker
                            value={board._count.tasks}
                            className="text-foreground text-xs font-medium"
                          />{' '}
                          task{board._count.tasks !== 1 ? 's' : ''}
                        </span>
                        <span>{board.updatedAtRelative}</span>
                      </div>
                      <div className="flex -space-x-2">
                        {board.members.slice(0, 4).map((member) => {
                          const name = member.profile.fullName ?? member.profile.email;
                          const initials = name
                            .split(' ')
                            .map((n) => n[0])
                            .join('')
                            .toUpperCase()
                            .slice(0, 2);
                          return (
                            <Avatar key={member.id} className="border-background h-6 w-6 border-2">
                              {member.profile.avatarUrl && (
                                <AvatarImage src={member.profile.avatarUrl} alt={name} />
                              )}
                              <AvatarFallback className="text-foreground text-[10px]">
                                {initials}
                              </AvatarFallback>
                            </Avatar>
                          );
                        })}
                        {board.members.length > 4 && (
                          <div className="border-background bg-muted flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-medium">
                            +{board.members.length - 4}
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            </BlurFade>
          ))}

          {/* Create board card */}
          <BlurFade delay={0.05 * boards.length}>
            <button
              id={NEW_BOARD_CARD_ID}
              onClick={() => openDialog(NEW_BOARD_CARD_ID)}
              className="text-muted-foreground hover:border-foreground/30 hover:text-foreground flex h-full min-h-[140px] w-full items-center justify-center rounded-lg border border-dashed transition-colors"
            >
              <div className="flex flex-col items-center gap-2">
                <Plus className="h-5 w-5" />
                <span className="text-sm font-medium">New board</span>
              </div>
            </button>
          </BlurFade>
        </div>
      )}

      <CreateBoardDialog open={dialogOpen} onOpenChange={setDialogOpen} returnFocusId={openerId} />
    </div>
  );
}
