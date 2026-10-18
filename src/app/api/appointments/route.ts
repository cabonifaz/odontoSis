import { z } from 'zod';
import { route, tenantOf } from '@/lib/server/http';
import { listAppointments } from '@/lib/server/services/clinic';

const q = z.object({
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
  doctorId: z.string().uuid().nullish(),
  patientId: z.string().uuid().nullish(),
});

export const GET = route({ platform: false, perm: 'appointments.read' }, async ({ req, user }) => {
  const p = q.parse(Object.fromEntries(req.nextUrl.searchParams));
  return listAppointments(tenantOf(user), new Date(p.from), new Date(p.to), p.doctorId, p.patientId);
});
