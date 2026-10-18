'use client';
import { Button } from '@/components/ui';
import { logout } from '@/components/shell/app-shell';

export function LogoutButton({ tenantCode }: { tenantCode?: string }) {
  return <Button variant="secondary" className="w-full" onClick={() => logout(tenantCode)}>Cerrar sesión</Button>;
}
