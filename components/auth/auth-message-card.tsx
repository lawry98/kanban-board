import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface AuthMessageCardProps {
  title: string;
  /** Node, not just string, so callers can emphasise an email or wrap copy. */
  description: React.ReactNode;
  /** Action buttons (sign-in link, request-a-new-link, …), stacked with spacing. */
  children: React.ReactNode;
}

/**
 * The terminal "here's what happened, here's your way out" panel shared by the
 * auth flows: forgot-password's sent state, register's confirmation state, and the
 * expired-link error page. Keeps the Card/header scaffolding in one place so those
 * three stay visually identical.
 */
export function AuthMessageCard({ title, description, children }: AuthMessageCardProps) {
  return (
    <Card>
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">{children}</CardContent>
    </Card>
  );
}
