'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Link } from '@/i18n/navigation';
import { PasswordInput } from '@/components/PasswordInput';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';

export function ResetPasswordForm() {
  const t = useTranslations('resetPasswordPage');
  const searchParams = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError(t('passwordTooShort'));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t('passwordMismatch'));
      return;
    }
    try {
      const response = await fetch('/api/auth/reset-password/confirm', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      if (!response.ok) {
        setError(t('invalidToken'));
        return;
      }
      setSuccess(true);
    } catch {
      setError(t('genericError'));
    }
  }

  if (!token) {
    return (
      <div data-testid="reset-password-missing-token" className="flex flex-col gap-3 text-sm text-white/80">
        <p>{t('missingToken')}</p>
        <Link href="/inloggen" className="text-xs text-white/60 underline hover:text-white">
          {t('loginLink')}
        </Link>
      </div>
    );
  }

  if (success) {
    return (
      <div data-testid="reset-password-success" className="flex flex-col gap-3 text-sm text-white/80">
        <p>{t('successMessage')}</p>
        <Link href="/inloggen" className="text-xs text-white/60 underline hover:text-white">
          {t('loginLink')}
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-sm text-white/80">
      <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
        <span>
          {t('labelNewPassword')}
          <RequiredMark />
        </span>
        <PasswordInput
          required
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          data-testid="reset-password-new"
          className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
        <span>
          {t('labelConfirmPassword')}
          <RequiredMark />
        </span>
        <PasswordInput
          required
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
          data-testid="reset-password-confirm"
          className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
        />
      </label>

      <RequiredLegend testId="reset-password-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

      {error && (
        <p data-testid="reset-password-error" className="text-xs text-red-400">
          {error}
        </p>
      )}

      <button
        type="submit"
        data-testid="reset-password-submit"
        className="btn-beheer-primary mt-2 rounded-sm bg-silver px-4 py-2.5 text-xs tracking-[0.15em] text-ink"
      >
        {t('submit')}
      </button>
    </form>
  );
}
