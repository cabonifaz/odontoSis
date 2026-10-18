import { z } from 'zod';
import { route } from '@/lib/server/http';
import { resetUserPassword } from '@/lib/server/services/users';

const id = z.string().uuid();

export const POST = route<{ id: string; userId: string }>({ platform: true }, async ({ user, ip, params }) =>
  resetUserPassword(id.parse(params.id), { userId: user.userId, ip }, id.parse(params.userId)));
