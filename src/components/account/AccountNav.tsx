'use client';

import { useTranslations } from 'next-intl';
import { useCustomerAuth } from '@/lib/useCustomerAuth';

export type AccountSection = 'orders' | 'settings';

interface AccountNavProps {
  activeSection: AccountSection;
  onSelect: (section: AccountSection) => void;
}

const SECTIONS: { id: AccountSection; labelKey: string }[] = [
  { id: 'orders', labelKey: 'navOrders' },
  { id: 'settings', labelKey: 'navSettings' },
];

export function AccountNav({ activeSection, onSelect }: AccountNavProps) {
  const t = useTranslations('accountPage');
  const { logout } = useCustomerAuth();

  return (
    <nav data-testid="account-nav" className="flex flex-col gap-1 text-xs tracking-wide">
      {SECTIONS.map((section) => (
        <button
          key={section.id}
          type="button"
          data-testid={`account-nav-${section.id}`}
          aria-current={activeSection === section.id ? 'true' : undefined}
          onClick={() => onSelect(section.id)}
          className={`rounded-sm px-3 py-2 text-left ${
            activeSection === section.id
              ? 'bg-white/15 text-white'
              : 'text-white/60 hover:bg-white/10 hover:text-white'
          }`}
        >
          {t(section.labelKey)}
        </button>
      ))}
      <button
        type="button"
        data-testid="account-nav-logout"
        onClick={logout}
        className="mt-4 rounded-sm border border-white/20 px-3 py-2 text-left text-white/60 hover:bg-white/10 hover:text-white"
      >
        {t('logout')}
      </button>
    </nav>
  );
}
