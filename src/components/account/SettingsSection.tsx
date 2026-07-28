'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { routing } from '@/i18n/routing';
import { usePathname, useRouter } from '@/i18n/navigation';
import { LOCALE_META } from '@/lib/localeMeta';
import {
  useMockProfile,
  type ContactPreference,
  type LanguagePreference,
} from '@/lib/useMockProfile';
import { useCustomerAuth } from '@/lib/useCustomerAuth';

export function SettingsSection() {
  const t = useTranslations('accountPage.settings');
  const { profile, updateProfile } = useMockProfile();
  const { user, logout } = useCustomerAuth();
  const pathname = usePathname();
  const router = useRouter();

  const [companyName, setCompanyName] = useState(profile.companyName);
  const [contactPerson, setContactPerson] = useState(profile.contactPerson);
  const [email, setEmail] = useState(profile.email);
  const [phone, setPhone] = useState(profile.phone);
  const [address, setAddress] = useState(profile.address);
  const [postcode, setPostcode] = useState(profile.postcode);
  const [city, setCity] = useState(profile.city);
  const [contactPreference, setContactPreference] = useState<ContactPreference>(
    profile.contactPreference
  );
  const [languagePreference, setLanguagePreference] = useState<LanguagePreference>(
    profile.languagePreference
  );
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isSaved, setIsSaved] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (password && password !== passwordConfirm) {
      setPasswordError(t('passwordMismatch'));
      setIsSaved(false);
      return;
    }
    setPasswordError(null);

    updateProfile({
      companyName,
      contactPerson,
      email,
      phone,
      address,
      postcode,
      city,
      contactPreference,
      languagePreference,
      ...(password ? { password } : {}),
    });
    setIsSaved(true);

    if (languagePreference !== profile.languagePreference) {
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
        {t('labelCompanyName')}
        <input
          type="text"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          data-testid="settings-company-name"
          className={fieldClassName}
        />
      </label>
      <label className={labelClassName}>
        {t('labelContactPerson')}
        <input
          type="text"
          value={contactPerson}
          onChange={(e) => setContactPerson(e.target.value)}
          data-testid="settings-contact-person"
          className={fieldClassName}
        />
      </label>
      <label className={labelClassName}>
        {t('labelEmail')}
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          data-testid="settings-email"
          className={fieldClassName}
        />
      </label>
      <label className={labelClassName}>
        {t('labelPhone')}
        <input
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          data-testid="settings-phone"
          className={fieldClassName}
        />
      </label>
      <label className={labelClassName}>
        {t('labelAddress')}
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          data-testid="settings-address"
          className={fieldClassName}
        />
      </label>
      <label className={labelClassName}>
        {t('labelPostcode')}
        <input
          type="text"
          value={postcode}
          onChange={(e) => setPostcode(e.target.value)}
          data-testid="settings-postcode"
          className={fieldClassName}
        />
      </label>
      <label className={labelClassName}>
        {t('labelCity')}
        <input
          type="text"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          data-testid="settings-city"
          className={fieldClassName}
        />
      </label>

      <label className={labelClassName}>
        {t('labelContactPreference')}
        <select
          value={contactPreference}
          onChange={(e) => setContactPreference(e.target.value as ContactPreference)}
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
          onChange={(e) => setLanguagePreference(e.target.value as LanguagePreference)}
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
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          data-testid="settings-password"
          className={fieldClassName}
        />
      </label>
      <label className={labelClassName}>
        {t('labelPasswordConfirm')}
        <input
          type="password"
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
          <input
            type="password"
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
