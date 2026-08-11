'use client';

import { useEffect, useRef } from 'react';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { GlassPanel } from '@/components/GlassPanel';
import { AdminLoginForm } from '../AdminLoginForm';
import { Documentatie } from './Documentatie';

export function DocumentatieGate() {
  const { user, isAdmin, isHydrated, logout } = useAdminAuth();
  const hasSignedOutUnauthorized = useRef(false);

  const isUnauthorized = isHydrated && !!user && !isAdmin;

  useEffect(() => {
    if (isUnauthorized && !hasSignedOutUnauthorized.current) {
      hasSignedOutUnauthorized.current = true;
      logout();
    }
    if (!isUnauthorized) {
      hasSignedOutUnauthorized.current = false;
    }
  }, [isUnauthorized, logout]);

  if (!isHydrated) {
    return null;
  }

  if (isUnauthorized) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink px-4">
        <GlassPanel className="mx-auto !max-w-lg">
          <p data-testid="documentatie-unauthorized" className="text-sm text-white/80">
            Je moet ingelogd zijn als medewerker om de gebruikershandleiding te bekijken.
          </p>
        </GlassPanel>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-ink px-4">
        <GlassPanel className="mx-auto !max-w-lg">
          <AdminLoginForm />
        </GlassPanel>
      </main>
    );
  }

  return <Documentatie />;
}
