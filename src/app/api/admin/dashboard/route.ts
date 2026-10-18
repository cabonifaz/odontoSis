import { route } from '@/lib/server/http';
import { platformDashboard } from '@/lib/server/services/platform';

export const GET = route({ platform: true }, async () => platformDashboard());
