'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { RequiredMark, RequiredLegend } from '@/components/RequiredFieldHint';

const SUBMITTED_RESET_MS = 2500;

export function ContactForm() {
  const t = useTranslations('contactPage');
  const [isSubmitted, setIsSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    setIsSubmitted(true);
    setTimeout(() => {
      setIsSubmitted(false);
      form.reset();
    }, SUBMITTED_RESET_MS);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 text-sm text-white/80">
      <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/50">
        {t('formTitle')}
      </p>

      <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
        <span>
          {t('formName')}
          <RequiredMark />
        </span>
        <input
          type="text"
          name="name"
          required
          data-testid="contact-form-name"
          className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
        {t('formCompany')}
        <input
          type="text"
          name="company"
          data-testid="contact-form-company"
          className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
        <span>
          {t('formEmail')}
          <RequiredMark />
        </span>
        <input
          type="email"
          name="email"
          required
          data-testid="contact-form-email"
          className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
        {t('formPhone')}
        <input
          type="tel"
          name="phone"
          data-testid="contact-form-phone"
          className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
        />
      </label>

      <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
        <span>
          {t('formSubject')}
          <RequiredMark />
        </span>
        <select
          name="subject"
          required
          defaultValue=""
          data-testid="contact-form-subject"
          className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
        >
          <option value="" disabled>
            {t('formSubject')}
          </option>
          <option value="general">{t('subjectGeneral')}</option>
          <option value="quote">{t('subjectQuote')}</option>
          <option value="other">{t('subjectOther')}</option>
        </select>
      </label>

      <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
        <span>
          {t('formMessage')}
          <RequiredMark />
        </span>
        <textarea
          name="message"
          required
          rows={4}
          data-testid="contact-form-message"
          className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
        />
      </label>

      <RequiredLegend testId="contact-form-verplicht-legende">{t('verplichtVeldLegende')}</RequiredLegend>

      <button
        type="submit"
        data-testid="contact-form-submit"
        disabled={isSubmitted}
        className="mt-2 rounded-sm bg-silver px-4 py-2.5 text-xs tracking-[0.15em] text-ink disabled:opacity-70"
      >
        {isSubmitted ? t('formSubmitted') : t('formSubmit')}
      </button>
    </form>
  );
}
