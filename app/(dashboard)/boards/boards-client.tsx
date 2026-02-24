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
import type { BoardWithMembers } from '@/types';

interface BoardsClientProps {
  boards: (BoardWithMembers & { role: string; updatedAtRelative: string })[];
}

export function BoardsClient({ boards }: BoardsClientProps) {
  const [dialogOpen, setDialogOpen] = useState(false);

  return (
    <div className="mx-auto max-w-screen-xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Boards</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {boards.length === 0
              ? 'Create your first board to get started'
              : `${boards.length} board${boards.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New board
        </Button>
      </div>

      {boards.length === 0 ? (
        <BlurFade delay={0.1}>
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed py-24 text-center">
            <LayoutDashboard className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium">No boards yet</h3>
            <p className="text-sm text-muted-foreground mt-1 mb-6">
              Create your first board to start organizing tasks with your team.
            </p>
            <Button onClick={() => setDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Create your first board
            </Button>
          </div>
        </BlurFade>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {boards.map((board, index) => (
            <BlurFade key={board.id} delay={0.05 * index}>
              <Link href={`/board/${board.id}`} className="block group">
                <Card className="h-full transition-shadow hover:shadow-md cursor-pointer">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-medium leading-tight line-clamp-2">
                        {board.title}
                      </CardTitle>
                      <Badge variant="outline" className="shrink-0 text-xs capitalize">
                        {board.role.toLowerCase()}
                      </Badge>
                    </div>
                    {board.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                        {board.description}
                      </p>
                    )}
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 text-xs text-muted-foreground">
                        <span>
                          <NumberTicker value={board._count.tasks} className="text-xs font-medium text-foreground" />{' '}
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
                            <Avatar key={member.id} className="h-6 w-6 border-2 border-background">
                              {member.profile.avatarUrl && (
                                <AvatarImage src={member.profile.avatarUrl} alt={name} />
                              )}
                              <AvatarFallback className="text-[10px]">{initials}</AvatarFallback>
                            </Avatar>
                          );
                        })}
                        {board.members.length > 4 && (
                          <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-medium">
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
              onClick={() => setDialogOpen(true)}
              className="flex h-full min-h-[140px] w-full items-center justify-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
            >
              <div className="flex flex-col items-center gap-2">
                <Plus className="h-5 w-5" />
                <span className="text-sm font-medium">New board</span>
              </div>
            </button>
          </BlurFade>
        </div>
      )}

      <CreateBoardDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
