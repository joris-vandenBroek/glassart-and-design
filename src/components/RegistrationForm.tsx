'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { logActiviteit, ONBEKENDE_ACTOR } from '@/lib/logActiviteit';
import { PasswordInput } from '@/components/PasswordInput';

export function RegistrationForm() {
  const t = useTranslations('registrationPage');
  const [showDeliveryAddress, setShowDeliveryAddress] = useState(false);
  const [showInvoiceAddress, setShowInvoiceAddress] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const hasLoggedVisit = useRef(false);

  useEffect(() => {
    if (!hasLoggedVisit.current) {
      hasLoggedVisit.current = true;
      void logActiviteit('word_klant_bezocht', ONBEKENDE_ACTOR);
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (formData.get('password') !== formData.get('passwordConfirm')) {
      setPasswordError(t('passwordMismatch'));
      return;
    }
    setPasswordError(null);
    setSubmitError(null);

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
          contactPerson: formData.get('contactPerson') as string,
          phone: formData.get('phone') as string,
          contactPreference: formData.get('contactPreference') as string,
          address: formData.get('address') as string,
          postcode: formData.get('postcode') as string,
          city: formData.get('city') as string,
          deliveryAddress: (formData.get('deliveryAddress') as string) || '',
          deliveryPostcode: (formData.get('deliveryPostcode') as string) || '',
          deliveryCity: (formData.get('deliveryCity') as string) || '',
          invoiceAddress: (formData.get('invoiceAddress') as string) || '',
          invoicePostcode: (formData.get('invoicePostcode') as string) || '',
          invoiceCity: (formData.get('invoiceCity') as string) || '',
        }),
      });
      if (!response.ok) {
        const body = await response.json();
        setSubmitError(body.error === 'email-in-use' ? t('emailInUseError') : t('submitError'));
        return;
      }
      void logActiviteit('word_klant_aanvraag', { id: null, email, naam: companyName });
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
        {t('labelCompanyName')}
        <input
          type="text"
          name="companyName"
          required
          data-testid="word-klant-company-name"
          className={fieldClassName}
        />
      </label>

      <label className={labelClassName}>
        {t('labelKvk')}
        <input type="text" name="kvk" required data-testid="word-klant-kvk" className={fieldClassName} />
      </label>

      <label className={labelClassName}>
        {t('labelContactPerson')}
        <input
          type="text"
          name="contactPerson"
          required
          data-testid="word-klant-contact-person"
          className={fieldClassName}
        />
      </label>

      <label className={labelClassName}>
        {t('labelEmail')}
        <input type="email" name="email" required data-testid="word-klant-email" className={fieldClassName} />
      </label>

      <label className={labelClassName}>
        {t('labelPhone')}
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
        {t('labelPassword')}
        <PasswordInput
          name="password"
          required
          data-testid="word-klant-password"
          className={fieldClassName}
        />
      </label>

      <label className={labelClassName}>
        {t('labelPasswordConfirm')}
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
        {t('labelAddress')}
        <input type="text" name="address" required data-testid="word-klant-address" className={fieldClassName} />
      </label>

      <label className={labelClassName}>
        {t('labelPostcode')}
        <input
          type="text"
          name="postcode"
          required
          data-testid="word-klant-postcode"
          className={fieldClassName}
        />
      </label>

      <label className={labelClassName}>
        {t('labelCity')}
        <input type="text" name="city" required data-testid="word-klant-city" className={fieldClassName} />
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
        </>
      )}

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
