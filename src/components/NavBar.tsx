'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useCustomerAuth } from '@/lib/useCustomerAuth';
import { Logo } from './Logo';
import { LanguageSwitcher } from './LanguageSwitcher';
import { CartPanel } from './CartPanel';

export function NavBar() {
  const t = useTranslations('nav');
  const { isCustomer, isHydrated } = useCustomerAuth();

  return (
    <nav
      data-testid="navbar"
      className="fixed left-0 top-0 z-40 flex w-full flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-black/60 px-4 py-3 backdrop-blur-sm sm:px-8"
    >
      <div className="flex items-center gap-8">
        <Logo />
        <div className="flex items-center gap-6 text-xs font-head tracking-[0.15em] text-white/70">
          <Link href="/" data-testid="nav-home" className="hover:text-gold">
            {t('home')}
          </Link>
          <Link href="/collecties" data-testid="nav-collections" className="hover:text-gold">
            {t('collections')}
          </Link>
          <Link href="/contact" data-testid="nav-contact" className="hover:text-gold">
            {t('contact')}
          </Link>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {isHydrated && isCustomer ? (
          <Link
            href="/account"
            data-testid="account-icon"
            aria-label={t('myAccount')}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-silver text-xs font-semibold text-ink"
          >
            GD
          </Link>
        ) : (
          <>
            <Link
              href="/word-klant"
              data-testid="nav-become-client"
              className="hidden text-xs font-head tracking-[0.15em] text-white/70 hover:text-gold sm:inline"
            >
              {t('becomeClient')}
            </Link>
            <Link
              href="/inloggen"
              data-testid="nav-login"
              className="btn-gold rounded-sm px-4 py-2 text-xs font-head tracking-[0.15em]"
            >
              {t('login')}
            </Link>
          </>
        )}
        <CartPanel />
        <LanguageSwitcher />
      </div>
    </nav>
  );
}
