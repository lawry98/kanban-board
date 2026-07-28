import { z } from 'zod';

/**
 * The only analytics payload that ever crosses the Server Action boundary. The
 * user id is NOT part of it — it comes from `requireAuth()`, never the client.
 */
export const trackSignedUpSchema = z.object({
  method: z.enum(['password', 'github']),
  fromInvite: z.boolean(),
});

export type TrackSignedUpInput = z.infer<typeof trackSignedUpSchema>;
