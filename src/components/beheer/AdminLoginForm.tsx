'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { PasswordInput } from '@/components/PasswordInput';

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
      await login(email, password);
    } catch {
      setLoginError(t('loginError'));
    }
  }

  async function handleForgotPassword() {
    setResetMessage(null);
    if (!email) {
      setResetMessage(t('forgotPasswordMissingEmail'));
      return;
    }
    try {
      await resetPassword(email);
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
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          data-testid="beheer-login-email"
          className={fieldClassName}
        />
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
