'use client';

import { useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useCustomerAuth } from '@/lib/useCustomerAuth';
import { PasswordInput } from '@/components/PasswordInput';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
import { completeerTestKlantEmail, isTestOmgeving } from '@/lib/emailDomein';

export function CustomerLoginForm() {
  const t = useTranslations('loginPage');
  const locale = useLocale();
  const router = useRouter();
  const { login } = useCustomerAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const status = await login(completeerTestKlantEmail(email), password);
      if (status === 'Goedgekeurd') {
        router.replace('/account');
      } else if (status === 'Beoordelen') {
        setError(t('pendingMessage'));
      } else if (status === 'Afgewezen') {
        setError(t('rejectedMessage'));
      } else {
        setError(t('accountIncompleteMessage'));
      }
    } catch {
      setError(t('loginError'));
    }
  }

  async function handleWachtwoordVergeten() {
    setError(null);
    setResetMessage(null);
    const volledigEmail = completeerTestKlantEmail(email);
    if (!volledigEmail) {
      setResetMessage(t('forgotPasswordMissingEmail'));
      return;
    }
    try {
      // De response wordt bewust niet uitgelezen: de route antwoordt altijd 200,
      // juist zodat hier geen verschil te zien is tussen een bekend en een
      // onbekend adres. Alleen een mislukt verzoek is het melden waard.
      await fetch('/api/auth/reset-password/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: volledigEmail, userType: 'klant', locale }),
      });
      setResetMessage(t('forgotPasswordSent'));
    } catch {
      setResetMessage(t('forgotPasswordError'));
    }
  }

  const fieldClassName = 'rounded-sm bg-black/40 px-3 py-2 text-sm text-white';
  const labelClassName = 'flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-sm text-white/80">
      <label className={labelClassName}>
        <span>
          {t('labelEmail')}
          <RequiredMark />
        </span>
        {/* Lokaal en op staging is dit een tekstveld, zodat een testaccount als
            "test1" niet op de browservalidatie van type="email" stukloopt. In
            productie blijft het gewoon een e-mailveld. */}
        <input
          type={isTestOmgeving() ? 'text' : 'email'}
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          data-testid="login-email"
          className={fieldClassName}
        />
      </label>

      <label className={labelClassName}>
        <span>
          {t('labelPassword')}
          <RequiredMark />
        </span>
        <PasswordInput
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          data-testid="login-password"
          className={fieldClassName}
        />
      </label>

      <RequiredLegend testId="login-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

      {error && (
        <p data-testid="login-error" className="text-xs text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        data-testid="login-submit"
        className="mt-2 rounded-sm bg-silver px-4 py-2.5 text-xs tracking-[0.15em] text-ink"
      >
        {t('submit')}
      </button>

      <button
        type="button"
        onClick={handleWachtwoordVergeten}
        data-testid="login-forgot-password"
        className="text-left text-xs text-white/60 underline hover:text-white"
      >
        {t('forgotPassword')}
      </button>

      {resetMessage && (
        <p data-testid="login-reset-message" className="text-xs text-white/70">
          {resetMessage}
        </p>
      )}
    </form>
  );
}
