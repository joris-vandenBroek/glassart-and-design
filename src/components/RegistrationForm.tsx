'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { logActiviteit } from '@/lib/logActiviteit';
import { isBtwNummerVerplicht, normaliseerBtwNummer, valideerBtwNummer } from '@/lib/btwNummer';
import { MINIMALE_WACHTWOORDLENGTE } from '@/lib/wachtwoordBeleid';
import { PasswordInput } from '@/components/PasswordInput';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';
import { Combobox } from '@/components/Combobox';
import { LAND_OPTIONS } from '@/data/landen';

export function RegistrationForm() {
  const t = useTranslations('registrationPage');
  const [showDeliveryAddress, setShowDeliveryAddress] = useState(false);
  const [showInvoiceAddress, setShowInvoiceAddress] = useState(false);
  const [land, setLand] = useState<string | null>('NL');
  const [invoiceLand, setInvoiceLand] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [btwNummerError, setBtwNummerError] = useState<string | null>(null);
  const hasLoggedVisit = useRef(false);

  useEffect(() => {
    if (!hasLoggedVisit.current) {
      hasLoggedVisit.current = true;
      void logActiviteit('word_klant_bezocht');
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (formData.get('password') !== formData.get('passwordConfirm')) {
      setPasswordError(t('passwordMismatch'));
      return;
    }
    // Spiegelt valideerWachtwoord() server-side (register weigert dit sinds kort
    // ook echt); dit is puur om de fout meteen bij het veld te tonen.
    if (((formData.get('password') as string) ?? '').length < MINIMALE_WACHTWOORDLENGTE) {
      setPasswordError(t('passwordTooShort'));
      return;
    }
    setPasswordError(null);
    setSubmitError(null);

    const btwNummerRuw = (formData.get('btwNummer') as string) ?? '';
    const btwNummer = normaliseerBtwNummer(btwNummerRuw);
    if (btwNummer === '' && isBtwNummerVerplicht(land)) {
      setBtwNummerError(t('btwNummerVerplicht'));
      return;
    }
    if (btwNummer !== '' && valideerBtwNummer(btwNummer, land) === 'ongeldig') {
      setBtwNummerError(t('btwNummerOngeldig'));
      return;
    }
    setBtwNummerError(null);

    const email = formData.get('email') as string;
    const password = formData.get('password') as string;
    const companyName = formData.get('companyName') as string;

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          companyName,
          kvk: formData.get('kvk') as string,
          btwNummer,
          contactPerson: formData.get('contactPerson') as string,
          phone: formData.get('phone') as string,
          contactPreference: formData.get('contactPreference') as string,
          address: formData.get('address') as string,
          postcode: formData.get('postcode') as string,
          city: formData.get('city') as string,
          land: land ?? '',
          deliveryAddress: (formData.get('deliveryAddress') as string) || '',
          deliveryPostcode: (formData.get('deliveryPostcode') as string) || '',
          deliveryCity: (formData.get('deliveryCity') as string) || '',
          invoiceAddress: (formData.get('invoiceAddress') as string) || '',
          invoicePostcode: (formData.get('invoicePostcode') as string) || '',
          invoiceCity: (formData.get('invoiceCity') as string) || '',
          invoiceLand: invoiceLand ?? '',
        }),
      });
      if (!response.ok) {
        const body = await response.json();
        setSubmitError(body.error === 'email-in-use' ? t('emailInUseError') : t('submitError'));
        return;
      }
      void logActiviteit('word_klant_aanvraag');
      setIsSubmitted(true);
    } catch {
      setSubmitError(t('submitError'));
    }
  }

  if (isSubmitted) {
    return (
      <div data-testid="word-klant-confirmation" className="text-center text-white/80">
        <p className="text-lg text-white">{t('confirmationTitle')}</p>
        <p className="mt-2 text-sm">{t('confirmationMessage')}</p>
      </div>
    );
  }

  const fieldClassName = 'rounded-sm bg-black/40 px-3 py-2 text-sm text-white';
  const labelClassName = 'flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60';

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-sm text-white/80">
      <label className={labelClassName}>
        <span>
          {t('labelCompanyName')}
          <RequiredMark />
        </span>
        <input
          type="text"
          name="companyName"
          required
          data-testid="word-klant-company-name"
          className={fieldClassName}
        />
      </label>

      <label className={labelClassName}>
        <span>
          {t('labelKvk')}
          <RequiredMark />
        </span>
        <input type="text" name="kvk" required data-testid="word-klant-kvk" className={fieldClassName} />
      </label>

      <label className={labelClassName}>
        <span>
          {t('labelBtwNummer')}
          {isBtwNummerVerplicht(land) && <RequiredMark />}
        </span>
        <input
          type="text"
          name="btwNummer"
          required={isBtwNummerVerplicht(land)}
          data-testid="word-klant-btwnummer"
          className={fieldClassName}
        />
      </label>

      {btwNummerError && (
        <p data-testid="word-klant-btwnummer-error" className="text-xs text-red-400">
          {btwNummerError}
        </p>
      )}

      <label className={labelClassName}>
        <span>
          {t('labelContactPerson')}
          <RequiredMark />
        </span>
        <input
          type="text"
          name="contactPerson"
          required
          data-testid="word-klant-contact-person"
          className={fieldClassName}
        />
      </label>

      <label className={labelClassName}>
        <span>
          {t('labelEmail')}
          <RequiredMark />
        </span>
        <input type="email" name="email" required data-testid="word-klant-email" className={fieldClassName} />
      </label>

      <label className={labelClassName}>
        <span>
          {t('labelPhone')}
          <RequiredMark />
        </span>
        <input type="tel" name="phone" required data-testid="word-klant-phone" className={fieldClassName} />
      </label>

      <label className={labelClassName}>
        {t('labelContactPreference')}
        <select
          name="contactPreference"
          defaultValue=""
          data-testid="word-klant-contact-preference"
          className={fieldClassName}
        >
          <option value="" disabled>
            {t('labelContactPreference')}
          </option>
          <option value="email">{t('contactPreferenceEmail')}</option>
          <option value="phone">{t('contactPreferencePhone')}</option>
          <option value="whatsapp">{t('contactPreferenceWhatsapp')}</option>
        </select>
      </label>

      <label className={labelClassName}>
        <span>
          {t('labelPassword')}
          <RequiredMark />
        </span>
        <PasswordInput
          name="password"
          required
          data-testid="word-klant-password"
          className={fieldClassName}
        />
      </label>

      <label className={labelClassName}>
        <span>
          {t('labelPasswordConfirm')}
          <RequiredMark />
        </span>
        <PasswordInput
          name="passwordConfirm"
          required
          data-testid="word-klant-password-confirm"
          className={fieldClassName}
        />
      </label>

      {passwordError && (
        <p data-testid="word-klant-password-error" className="text-xs text-red-400">
          {passwordError}
        </p>
      )}

      <label className={labelClassName}>
        <span>
          {t('labelAddress')}
          <RequiredMark />
        </span>
        <input type="text" name="address" required data-testid="word-klant-address" className={fieldClassName} />
      </label>

      <label className={labelClassName}>
        <span>
          {t('labelPostcode')}
          <RequiredMark />
        </span>
        <input
          type="text"
          name="postcode"
          required
          data-testid="word-klant-postcode"
          className={fieldClassName}
        />
      </label>

      <label className={labelClassName}>
        <span>
          {t('labelCity')}
          <RequiredMark />
        </span>
        <input type="text" name="city" required data-testid="word-klant-city" className={fieldClassName} />
      </label>

      <label className={labelClassName}>
        <span>
          {t('labelLand')}
          <RequiredMark />
        </span>
        <Combobox
          options={LAND_OPTIONS}
          value={land}
          onChange={setLand}
          placeholder={t('labelLand')}
          noResultsLabel={t('labelLand')}
          testId="word-klant-land"
        />
      </label>

      <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/60">
        <input
          type="checkbox"
          data-testid="word-klant-different-delivery"
          checked={showDeliveryAddress}
          onChange={(event) => setShowDeliveryAddress(event.target.checked)}
        />
        {t('differentDeliveryLabel')}
      </label>

      {showDeliveryAddress && (
        <>
          <label className={labelClassName}>
            {t('labelDeliveryAddress')}
            <input
              type="text"
              name="deliveryAddress"
              data-testid="word-klant-delivery-address"
              className={fieldClassName}
            />
          </label>

          <label className={labelClassName}>
            {t('labelDeliveryPostcode')}
            <input
              type="text"
              name="deliveryPostcode"
              data-testid="word-klant-delivery-postcode"
              className={fieldClassName}
            />
          </label>

          <label className={labelClassName}>
            {t('labelDeliveryCity')}
            <input
              type="text"
              name="deliveryCity"
              data-testid="word-klant-delivery-city"
              className={fieldClassName}
            />
          </label>
        </>
      )}

      <label className="flex items-center gap-2 text-xs uppercase tracking-wide text-white/60">
        <input
          type="checkbox"
          data-testid="word-klant-different-invoice"
          checked={showInvoiceAddress}
          onChange={(event) => setShowInvoiceAddress(event.target.checked)}
        />
        {t('differentInvoiceLabel')}
      </label>

      {showInvoiceAddress && (
        <>
          <label className={labelClassName}>
            {t('labelInvoiceAddress')}
            <input
              type="text"
              name="invoiceAddress"
              data-testid="word-klant-invoice-address"
              className={fieldClassName}
            />
          </label>

          <label className={labelClassName}>
            {t('labelInvoicePostcode')}
            <input
              type="text"
              name="invoicePostcode"
              data-testid="word-klant-invoice-postcode"
              className={fieldClassName}
            />
          </label>

          <label className={labelClassName}>
            {t('labelInvoiceCity')}
            <input
              type="text"
              name="invoiceCity"
              data-testid="word-klant-invoice-city"
              className={fieldClassName}
            />
          </label>

          <label className={labelClassName}>
            {t('labelInvoiceLand')}
            <Combobox
              options={LAND_OPTIONS}
              value={invoiceLand}
              onChange={setInvoiceLand}
              placeholder={t('labelInvoiceLand')}
              noResultsLabel={t('labelInvoiceLand')}
              testId="word-klant-invoice-land"
            />
          </label>
        </>
      )}

      <RequiredLegend testId="word-klant-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

      {submitError && (
        <p data-testid="word-klant-submit-error" className="text-xs text-red-400">
          {submitError}
        </p>
      )}

      <button
        type="submit"
        data-testid="word-klant-submit"
        className="mt-2 rounded-sm bg-silver px-4 py-2.5 text-xs tracking-[0.15em] text-ink"
      >
        {t('submit')}
      </button>
    </form>
  );
}
