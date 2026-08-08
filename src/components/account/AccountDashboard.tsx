'use client';

import { useEffect, useRef, useState } from 'react';
import { useCustomerAuth } from '@/lib/useCustomerAuth';
import { useRouter } from '@/i18n/navigation';
import { GlassPanel } from '@/components/GlassPanel';
import { logActiviteit } from '@/lib/logActiviteit';
import { AccountNav, type AccountSection } from './AccountNav';
import { OrdersSection } from './OrdersSection';
import { SettingsSection } from './SettingsSection';

const SECTION_COMPONENTS: Record<AccountSection, () => JSX.Element> = {
  orders: OrdersSection,
  settings: SettingsSection,
};

export function AccountDashboard() {
  const { isCustomer, isHydrated, user } = useCustomerAuth();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<AccountSection>('orders');
  const hasLoggedVisit = useRef(false);

  useEffect(() => {
    if (isHydrated && !isCustomer) {
      router.replace('/');
    }
  }, [isHydrated, isCustomer, router]);

  useEffect(() => {
    if (isHydrated && isCustomer && !hasLoggedVisit.current) {
      hasLoggedVisit.current = true;
      void logActiviteit('account_bezocht');
    }
  }, [isHydrated, isCustomer, user]);

  if (!isHydrated || !isCustomer) {
    return null;
  }

  const ActiveSectionComponent = SECTION_COMPONENTS[activeSection];

  return (
    <div
      data-testid="account-dashboard"
      className="mx-auto grid max-w-5xl grid-cols-1 gap-8 lg:grid-cols-[200px_1fr]"
    >
      <GlassPanel className="w-full">
        <AccountNav activeSection={activeSection} onSelect={setActiveSection} />
      </GlassPanel>
      <GlassPanel className="w-full">
        <ActiveSectionComponent />
      </GlassPanel>
    </div>
  );
}
