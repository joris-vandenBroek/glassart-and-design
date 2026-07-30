'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { PasswordInput } from '@/components/PasswordInput';

export function CustomerLoginForm() {
  const t = useTranslations('loginPage');
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        setError(t('loginError'));
        return;
      }
      const body = await response.json();
      if (body.status === 'Goedgekeurd') {
        router.replace('/account');
      } else if (body.status === 'Beoordelen') {
        setError(t('pendingMessage'));
      } else if (body.status === 'Afgewezen') {
        setError(t('rejectedMessage'));
      } else {
        setError(t('accountIncompleteMessage'));
      }
    } catch {
      setError(t('loginError'));
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
          data-testid="login-email"
          className={fieldClassName}
        />
      </label>

      <label className={labelClassName}>
        {t('labelPassword')}
        <PasswordInput
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          data-testid="login-password"
          className={fieldClassName}
        />
      </label>

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
    </form>
  );
}
