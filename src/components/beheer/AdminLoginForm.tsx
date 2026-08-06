'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { PasswordInput } from '@/components/PasswordInput';
import { BEDRIJFS_EMAIL_DOMEIN, completeerBedrijfsEmail } from '@/lib/emailDomein';

export function AdminLoginForm() {
  const t = useTranslations('beheer');
  const { login, resetPassword } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError(null);
    try {
      await login(completeerBedrijfsEmail(email), password);
    } catch {
      setLoginError(t('loginError'));
    }
  }

  async function handleForgotPassword() {
    setResetMessage(null);
    const volledigEmail = completeerBedrijfsEmail(email);
    if (!volledigEmail) {
      setResetMessage(t('forgotPasswordMissingEmail'));
      return;
    }
    try {
      await resetPassword(volledigEmail);
      setResetMessage(t('forgotPasswordSent'));
    } catch {
      setResetMessage(t('loginError'));
    }
  }

  const fieldClassName = 'rounded-sm bg-black/40 px-3 py-2 text-sm text-white';
  const labelClassName = 'flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-sm text-white/80">
      <label className={labelClassName}>
        {t('labelEmail')}
        <span className={`flex items-center gap-1 ${fieldClassName}`}>
          {/* Geen type="email": medewerkers typen alleen "hem"/"paul"/"julie", het
              domein wordt bij verzenden aangevuld. Wie een adres buiten het
              bedrijfsdomein heeft, typt het gewoon voluit -- dan valt het
              achtervoegsel weg. */}
          <input
            type="text"
            required
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            data-testid="beheer-login-email"
            className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none"
          />
          {!email.includes('@') && (
            <span
              data-testid="beheer-login-email-domein"
              className="shrink-0 text-sm text-white/50"
            >
              {BEDRIJFS_EMAIL_DOMEIN}
            </span>
          )}
        </span>
      </label>

      <label className={labelClassName}>
        {t('labelPassword')}
        <PasswordInput
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          data-testid="beheer-login-password"
          className={fieldClassName}
        />
      </label>

      {loginError && (
        <p data-testid="beheer-login-error" className="text-xs text-red-400">
          {loginError}
        </p>
      )}

      <button
        type="submit"
        data-testid="beheer-login-submit"
        className="btn-beheer-primary mt-2 rounded-sm bg-silver px-4 py-2.5 text-xs tracking-[0.15em] text-ink"
      >
        {t('submit')}
      </button>

      <button
        type="button"
        onClick={handleForgotPassword}
        data-testid="beheer-forgot-password"
        className="text-left text-xs text-white/60 underline hover:text-white"
      >
        {t('forgotPassword')}
      </button>

      {resetMessage && (
        <p data-testid="beheer-reset-message" className="text-xs text-white/70">
          {resetMessage}
        </p>
      )}
    </form>
  );
}
