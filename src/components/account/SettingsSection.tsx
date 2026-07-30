'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { routing } from '@/i18n/routing';
import { usePathname, useRouter } from '@/i18n/navigation';
import { LOCALE_META } from '@/lib/localeMeta';
import { useCustomerAuth } from '@/lib/useCustomerAuth';
import { PasswordInput } from '@/components/PasswordInput';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';

type ContactPreference = 'email' | 'phone' | 'whatsapp';

interface KlantProfile {
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  postcode: string;
  city: string;
  contactPreference: ContactPreference;
}

const EMPTY_PROFILE: KlantProfile = {
  companyName: '',
  contactPerson: '',
  email: '',
  phone: '',
  address: '',
  postcode: '',
  city: '',
  contactPreference: 'email',
};

export function SettingsSection() {
  const t = useTranslations('accountPage.settings');
  const activeLocale = useLocale();
  const { user, logout } = useCustomerAuth();
  const pathname = usePathname();
  const router = useRouter();

  const [profile, setProfile] = useState<KlantProfile>(EMPTY_PROFILE);
  const [languagePreference, setLanguagePreference] = useState(activeLocale);
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const response = await fetch('/api/klanten/me');
      if (!response.ok || cancelled) return;
      const klant = (await response.json()) as Partial<KlantProfile>;
      if (cancelled) return;
      setProfile({
        companyName: klant.companyName ?? '',
        contactPerson: klant.contactPerson ?? '',
        email: klant.email ?? '',
        phone: klant.phone ?? '',
        address: klant.address ?? '',
        postcode: klant.postcode ?? '',
        city: klant.city ?? '',
        contactPreference: klant.contactPreference ?? 'email',
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  function setField<K extends keyof KlantProfile>(key: K, value: KlantProfile[K]) {
    setProfile((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaveError(null);
    setIsSaved(false);

    if (password && password !== passwordConfirm) {
      setPasswordError(t('passwordMismatch'));
      return;
    }
    if (password && password.length < 8) {
      setPasswordError(t('passwordTooShort'));
      return;
    }
    setPasswordError(null);

    try {
      const response = await fetch('/api/klanten/me', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...profile, ...(password ? { password } : {}) }),
      });
      if (!response.ok) {
        setSaveError(t('saveError'));
        return;
      }
    } catch {
      setSaveError(t('saveError'));
      return;
    }

    setPassword('');
    setPasswordConfirm('');
    setIsSaved(true);

    if (languagePreference !== activeLocale) {
      router.replace(pathname, { locale: languagePreference });
    }
  }

  async function handleDeleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDeleteError(null);
    try {
      const loginResponse = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: user?.email ?? '', password: deletePassword }),
      });
      if (!loginResponse.ok) {
        setDeleteError(t('deleteAccountError'));
        return;
      }
      const deleteResponse = await fetch(`/api/klanten/${user?.uid ?? ''}`, { method: 'DELETE' });
      if (!deleteResponse.ok) {
        setDeleteError(t('deleteAccountPartialError'));
        return;
      }
    } catch {
      setDeleteError(t('deleteAccountError'));
      return;
    }

    await logout();
    router.replace('/');
  }

  const fieldClassName = 'rounded-sm bg-black/40 px-3 py-2 text-sm text-white';
  const labelClassName = 'flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60';

  return (
    <div className="flex flex-col gap-8">
      <form
        onSubmit={handleSubmit}
        data-testid="settings-section"
        className="flex flex-col gap-4 text-sm text-white/80"
      >
      <label className={labelClassName}>
        <span>
          {t('labelCompanyName')}
          <RequiredMark />
        </span>
        <input
          type="text"
          required
          value={profile.companyName}
          onChange={(e) => setField('companyName', e.target.value)}
          data-testid="settings-company-name"
          className={fieldClassName}
        />
      </label>
      <label className={labelClassName}>
        <span>
          {t('labelContactPerson')}
          <RequiredMark />
        </span>
        <input
          type="text"
          required
          value={profile.contactPerson}
          onChange={(e) => setField('contactPerson', e.target.value)}
          data-testid="settings-contact-person"
          className={fieldClassName}
        />
      </label>
      <label className={labelClassName}>
        <span>
          {t('labelEmail')}
          <RequiredMark />
        </span>
        <input
          type="email"
          required
          value={profile.email}
          onChange={(e) => setField('email', e.target.value)}
          data-testid="settings-email"
          className={fieldClassName}
        />
      </label>
      <label className={labelClassName}>
        <span>
          {t('labelPhone')}
          <RequiredMark />
        </span>
        <input
          type="tel"
          required
          value={profile.phone}
          onChange={(e) => setField('phone', e.target.value)}
          data-testid="settings-phone"
          className={fieldClassName}
        />
      </label>
      <label className={labelClassName}>
        <span>
          {t('labelAddress')}
          <RequiredMark />
        </span>
        <input
          type="text"
          required
          value={profile.address}
          onChange={(e) => setField('address', e.target.value)}
          data-testid="settings-address"
          className={fieldClassName}
        />
      </label>
      <label className={labelClassName}>
        <span>
          {t('labelPostcode')}
          <RequiredMark />
        </span>
        <input
          type="text"
          required
          value={profile.postcode}
          onChange={(e) => setField('postcode', e.target.value)}
          data-testid="settings-postcode"
          className={fieldClassName}
        />
      </label>
      <label className={labelClassName}>
        <span>
          {t('labelCity')}
          <RequiredMark />
        </span>
        <input
          type="text"
          required
          value={profile.city}
          onChange={(e) => setField('city', e.target.value)}
          data-testid="settings-city"
          className={fieldClassName}
        />
      </label>

      <RequiredLegend testId="settings-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

      <label className={labelClassName}>
        {t('labelContactPreference')}
        <select
          value={profile.contactPreference}
          onChange={(e) => setField('contactPreference', e.target.value as ContactPreference)}
          data-testid="settings-contact-preference"
          className={fieldClassName}
        >
          <option value="email">{t('contactPreferenceEmail')}</option>
          <option value="phone">{t('contactPreferencePhone')}</option>
          <option value="whatsapp">{t('contactPreferenceWhatsapp')}</option>
        </select>
      </label>

      <label className={labelClassName}>
        {t('labelLanguagePreference')}
        <select
          value={languagePreference}
          onChange={(e) => setLanguagePreference(e.target.value)}
          data-testid="settings-language-preference"
          className={fieldClassName}
        >
          {routing.locales.map((locale) => (
            <option key={locale} value={locale}>
              {LOCALE_META[locale].flag} {LOCALE_META[locale].label}
            </option>
          ))}
        </select>
      </label>

      <label className={labelClassName}>
        {t('labelPassword')}
        <PasswordInput
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="settings-password"
          className={fieldClassName}
        />
      </label>
      <label className={labelClassName}>
        {t('labelPasswordConfirm')}
        <PasswordInput
          value={passwordConfirm}
          onChange={(e) => setPasswordConfirm(e.target.value)}
          data-testid="settings-password-confirm"
          className={fieldClassName}
        />
      </label>
      {passwordError && (
        <p data-testid="settings-password-error" className="text-xs text-red-400">
          {passwordError}
        </p>
      )}
      {saveError && (
        <p data-testid="settings-save-error" className="text-xs text-red-400">
          {saveError}
        </p>
      )}

      {isSaved && (
        <p data-testid="settings-saved" className="text-xs text-white">
          {t('saved')}
        </p>
      )}

      <button
        type="submit"
        data-testid="settings-submit"
        className="mt-2 rounded-sm bg-silver px-4 py-2.5 text-xs tracking-[0.15em] text-ink"
      >
        {t('save')}
      </button>
      </form>

      <form
        onSubmit={handleDeleteAccount}
        data-testid="delete-account-section"
        className="flex flex-col gap-4 border-t border-white/10 pt-6 text-sm text-white/80"
      >
        <p className="text-white">{t('deleteAccountTitle')}</p>
        <label className={labelClassName}>
          {t('deleteAccountLabelPassword')}
          <PasswordInput
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            data-testid="delete-account-password"
            className={fieldClassName}
          />
        </label>
        {deleteError && (
          <p data-testid="delete-account-error" className="text-xs text-red-400">
            {deleteError}
          </p>
        )}
        <button
          type="submit"
          data-testid="delete-account-submit"
          className="self-start rounded-sm border border-red-400/40 px-4 py-2 text-xs tracking-wide text-red-400 hover:border-red-400 hover:bg-red-400/10"
        >
          {t('deleteAccountSubmit')}
        </button>
      </form>
    </div>
  );
}
