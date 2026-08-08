# Contactpagina Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 19-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `/contact` page with the real business contact details (address, email, two contact persons) plus placeholder WhatsApp/opening-hours/company-registration info in a left column, and a mock contact form in a right column; retarget the NavBar's "Contact" link to this new page.

**Architecture:** Two new client components carry the actual content — `ContactInfo.tsx` (address, map, both contact persons, email, WhatsApp, opening hours, company registration block, all via `useTranslations`) and `ContactForm.tsx` (the mock form, `preventDefault` + "Verzonden!" button feedback that auto-resets). A new server component `src/app/[locale]/contact/page.tsx` (mirroring the existing `collecties/page.tsx` pattern: `setRequestLocale` + `getTranslations` for just the page title/intro banner) composes them side by side inside two `GlassPanel`s, in a responsive 2-column grid. `NavBar.tsx`'s `nav-contact` link switches from the temporary `#contact` anchor to a real `next-intl` `Link` to `/contact` — `nav-become-client` ("Word klant") is untouched, per the resolved scope decision (it will point to `/word-klant` once the registration page plan lands). The existing homepage `Contact` component (short summary) is not touched.

**Tech Stack:** Same as the existing project — Next.js 14 (App Router) + TypeScript, Tailwind CSS, next-intl v3, Vitest + React Testing Library.

## Global Constraints

- Real business data, not placeholders: address **Den Heuvel 21, 5688 EM Oirschot**; email **info@glassartdesign.nl**; two contact persons — **Paul van den Hout** (06 51404089, for projects/hotels) and **Hem Brekoo** (06 53736756, for B2B) — each rendered separately, not as one generic phone number.
- Still placeholders (client will replace later): WhatsApp number, opening hours, KvK-nummer, BTW-nummer, IBAN.
- The contact form has no real backend — `preventDefault` on submit, no network call, no `localStorage` write. Shows "Verzonden!" on the submit button, then resets the form fields and button text after a delay.
- Required form fields: name, email, subject, message. Optional: company, phone. Use plain HTML5 `required` — no custom validation logic.
- Subject is a `<select>` with exactly 3 options: "Algemene vraag" (general), "Offerte aanvragen" (quote), "Overig" (other) — translated per locale.
- Only the NavBar's "Contact" link (`nav-contact`) is retargeted to `/contact` in this plan. `nav-become-client` ("Word klant") and `BecomeClientCta` (used on `/collecties`) are **not** touched — they stay pointed at the temporary `#contact` anchor until the registration page plan retargets them to `/word-klant`.
- The existing homepage `Contact` component (`src/components/Contact.tsx`, short summary with existing `contact.*` message keys) is unchanged.
- All new text in all 4 locales (NL/EN/DE/FR).

---

## File Structure Overview

```
messages/{nl,en,de,fr}.json                (MODIFY — add `contactPage` translation namespace)
src/components/ContactInfo.tsx             (CREATE — address/map/contacts/email/whatsapp/hours/company)
src/components/ContactForm.tsx             (CREATE — mock contact form)
src/app/[locale]/contact/page.tsx          (CREATE — new /contact route)
src/components/NavBar.tsx                  (MODIFY — nav-contact becomes a real Link to /contact)
tests/components/ContactInfo.test.tsx      (CREATE)
tests/components/ContactForm.test.tsx      (CREATE)
tests/components/NavBar.test.tsx           (MODIFY — update the nav-contact href assertion)
```

No dedicated test file for `src/app/[locale]/contact/page.tsx` itself — following the same convention already used for `src/app/[locale]/collecties/page.tsx` (which also has no direct page-level test): the page's own server-rendered title/intro banner is verified manually in the build-verification task, while all the real, testable content lives in `ContactInfo`/`ContactForm`, which do get full automated tests.

---

### Task 1: `contactPage` translation keys

**Files:**
- Modify: `messages/nl.json`
- Modify: `messages/en.json`
- Modify: `messages/de.json`
- Modify: `messages/fr.json`

**Interfaces:**
- Produces: message keys `contactPage.{title,intro,visitLabel,planRoute,contactsLabel,projectsContact,b2bContact,emailLabel,whatsappLabel,hoursLabel,hoursValue,companyLabel,kvkLabel,btwLabel,ibanLabel,formTitle,formName,formCompany,formEmail,formPhone,formSubject,subjectGeneral,subjectQuote,subjectOther,formMessage,formSubmit,formSubmitted}` — used by Tasks 2, 3, 4.

- [ ] **Step 1: Add the `contactPage` namespace to `messages/nl.json`**

Add this new top-level key (after `"cart"`, before the closing `}`):

```json
  "contactPage": {
    "title": "Contact",
    "intro": "Neem op de manier die u het beste uitkomt contact met ons op.",
    "visitLabel": "Bezoekadres",
    "planRoute": "Plan route",
    "contactsLabel": "Contactpersonen",
    "projectsContact": "Voor projecten, hotels etc.",
    "b2bContact": "Voor zakelijke klanten (B2B)",
    "emailLabel": "E-mail",
    "whatsappLabel": "Chat via WhatsApp",
    "hoursLabel": "Openingstijden",
    "hoursValue": "Ma–vr: 09:00 – 17:00",
    "companyLabel": "Bedrijfsgegevens",
    "kvkLabel": "KvK-nummer",
    "btwLabel": "BTW-nummer",
    "ibanLabel": "IBAN",
    "formTitle": "Stuur ons een bericht",
    "formName": "Naam",
    "formCompany": "Bedrijf",
    "formEmail": "E-mailadres",
    "formPhone": "Telefoonnummer",
    "formSubject": "Onderwerp",
    "subjectGeneral": "Algemene vraag",
    "subjectQuote": "Offerte aanvragen",
    "subjectOther": "Overig",
    "formMessage": "Bericht",
    "formSubmit": "Versturen",
    "formSubmitted": "Verzonden!"
  }
```

- [ ] **Step 2: Add the `contactPage` namespace to `messages/en.json`**

```json
  "contactPage": {
    "title": "Contact",
    "intro": "Reach us in whichever way suits you best.",
    "visitLabel": "Visiting address",
    "planRoute": "Get directions",
    "contactsLabel": "Contacts",
    "projectsContact": "For projects, hotels etc.",
    "b2bContact": "For business clients (B2B)",
    "emailLabel": "Email",
    "whatsappLabel": "Chat on WhatsApp",
    "hoursLabel": "Opening hours",
    "hoursValue": "Mon–Fri: 09:00 – 17:00",
    "companyLabel": "Company details",
    "kvkLabel": "Chamber of Commerce no.",
    "btwLabel": "VAT number",
    "ibanLabel": "IBAN",
    "formTitle": "Send us a message",
    "formName": "Name",
    "formCompany": "Company",
    "formEmail": "Email address",
    "formPhone": "Phone number",
    "formSubject": "Subject",
    "subjectGeneral": "General question",
    "subjectQuote": "Request a quote",
    "subjectOther": "Other",
    "formMessage": "Message",
    "formSubmit": "Send",
    "formSubmitted": "Sent!"
  }
```

- [ ] **Step 3: Add the `contactPage` namespace to `messages/de.json`**

```json
  "contactPage": {
    "title": "Kontakt",
    "intro": "Kontaktieren Sie uns auf die für Sie passende Weise.",
    "visitLabel": "Besuchsadresse",
    "planRoute": "Route planen",
    "contactsLabel": "Ansprechpartner",
    "projectsContact": "Für Projekte, Hotels usw.",
    "b2bContact": "Für Geschäftskunden (B2B)",
    "emailLabel": "E-Mail",
    "whatsappLabel": "Über WhatsApp chatten",
    "hoursLabel": "Öffnungszeiten",
    "hoursValue": "Mo–Fr: 09:00 – 17:00 Uhr",
    "companyLabel": "Firmendaten",
    "kvkLabel": "Handelsregisternummer",
    "btwLabel": "USt-IdNr.",
    "ibanLabel": "IBAN",
    "formTitle": "Senden Sie uns eine Nachricht",
    "formName": "Name",
    "formCompany": "Firma",
    "formEmail": "E-Mail-Adresse",
    "formPhone": "Telefonnummer",
    "formSubject": "Betreff",
    "subjectGeneral": "Allgemeine Frage",
    "subjectQuote": "Angebot anfordern",
    "subjectOther": "Sonstiges",
    "formMessage": "Nachricht",
    "formSubmit": "Senden",
    "formSubmitted": "Gesendet!"
  }
```

- [ ] **Step 4: Add the `contactPage` namespace to `messages/fr.json`**

```json
  "contactPage": {
    "title": "Contact",
    "intro": "Contactez-nous de la manière qui vous convient le mieux.",
    "visitLabel": "Adresse de visite",
    "planRoute": "Itinéraire",
    "contactsLabel": "Contacts",
    "projectsContact": "Pour les projets, hôtels, etc.",
    "b2bContact": "Pour les clients professionnels (B2B)",
    "emailLabel": "E-mail",
    "whatsappLabel": "Discuter sur WhatsApp",
    "hoursLabel": "Horaires d'ouverture",
    "hoursValue": "Lun–ven : 09h00 – 17h00",
    "companyLabel": "Coordonnées de l'entreprise",
    "kvkLabel": "Numéro de registre du commerce",
    "btwLabel": "Numéro de TVA",
    "ibanLabel": "IBAN",
    "formTitle": "Envoyez-nous un message",
    "formName": "Nom",
    "formCompany": "Entreprise",
    "formEmail": "Adresse e-mail",
    "formPhone": "Numéro de téléphone",
    "formSubject": "Sujet",
    "subjectGeneral": "Question générale",
    "subjectQuote": "Demande de devis",
    "subjectOther": "Autre",
    "formMessage": "Message",
    "formSubmit": "Envoyer",
    "formSubmitted": "Envoyé !"
  }
```

- [ ] **Step 5: Verify all 4 locale files are valid JSON with identical key structure**

Run: `node -e "const fs=require('fs'); const locales=['nl','en','de','fr']; const keys = locales.map(l => JSON.stringify(Object.keys(JSON.parse(fs.readFileSync('messages/'+l+'.json')).contactPage).sort())); console.log(keys.every(k => k === keys[0]) ? 'MATCH' : 'MISMATCH: ' + keys.join(' | '))"`
Expected: `MATCH`

- [ ] **Step 6: Run the full test suite to confirm nothing broke**

Run: `npm test`
Expected: PASS — all existing tests still green.

- [ ] **Step 7: Commit**

```bash
git add messages/nl.json messages/en.json messages/de.json messages/fr.json
git commit -m "feat: add contactPage translation keys"
```

---

### Task 2: ContactInfo component

**Files:**
- Create: `src/components/ContactInfo.tsx`
- Create: `tests/components/ContactInfo.test.tsx`

**Interfaces:**
- Consumes: message keys `contactPage.{visitLabel,planRoute,contactsLabel,projectsContact,b2bContact,emailLabel,whatsappLabel,hoursLabel,hoursValue,companyLabel,kvkLabel,btwLabel,ibanLabel}` (Task 1).
- Produces: `ContactInfo()` — no props, used by Task 4 (`contact/page.tsx`). Renders `data-testid="contact-address"`, `data-testid="contact-directions"` (link), `data-testid="contact-map"` (iframe), `data-testid="contact-phone-projects"` (tel link), `data-testid="contact-phone-b2b"` (tel link), `data-testid="contact-email"` (mailto link), `data-testid="contact-whatsapp"` (link).

- [ ] **Step 1: Write the failing test**

Create `tests/components/ContactInfo.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithIntl } from '../test-utils';
import { ContactInfo } from '@/components/ContactInfo';
import messages from '../../messages/nl.json';

describe('ContactInfo', () => {
  it('renders the real visiting address and a directions link', () => {
    renderWithIntl(<ContactInfo />, 'nl', messages);
    expect(screen.getByTestId('contact-address')).toHaveTextContent(
      'Den Heuvel 21, 5688 EM Oirschot'
    );
    expect(screen.getByTestId('contact-directions')).toHaveAttribute(
      'href',
      expect.stringContaining('google.com/maps')
    );
  });

  it('embeds a Google Maps iframe for the address', () => {
    renderWithIntl(<ContactInfo />, 'nl', messages);
    const iframe = screen.getByTestId('contact-map');
    expect(iframe.tagName).toBe('IFRAME');
    expect(iframe).toHaveAttribute('src', expect.stringContaining('output=embed'));
  });

  it('renders both real contact persons with correct tel links', () => {
    renderWithIntl(<ContactInfo />, 'nl', messages);
    expect(screen.getByText('Paul van den Hout')).toBeInTheDocument();
    expect(screen.getByTestId('contact-phone-projects')).toHaveAttribute(
      'href',
      'tel:+31651404089'
    );
    expect(screen.getByText('Hem Brekoo')).toBeInTheDocument();
    expect(screen.getByTestId('contact-phone-b2b')).toHaveAttribute(
      'href',
      'tel:+31653736756'
    );
  });

  it('renders a mailto link with the real email address', () => {
    renderWithIntl(<ContactInfo />, 'nl', messages);
    expect(screen.getByTestId('contact-email')).toHaveAttribute(
      'href',
      'mailto:info@glassartdesign.nl'
    );
  });

  it('renders a WhatsApp link', () => {
    renderWithIntl(<ContactInfo />, 'nl', messages);
    expect(screen.getByTestId('contact-whatsapp')).toHaveAttribute(
      'href',
      expect.stringContaining('wa.me/')
    );
  });

  it('renders opening hours and the company registration block', () => {
    renderWithIntl(<ContactInfo />, 'nl', messages);
    expect(screen.getByText('Openingstijden')).toBeInTheDocument();
    expect(screen.getByText('Bedrijfsgegevens')).toBeInTheDocument();
    expect(screen.getByText(/KvK-nummer/)).toBeInTheDocument();
    expect(screen.getByText(/BTW-nummer/)).toBeInTheDocument();
    expect(screen.getByText(/IBAN/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ContactInfo`
Expected: FAIL — `Cannot find module '@/components/ContactInfo'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/ContactInfo.tsx`:

```tsx
'use client';

import { useTranslations } from 'next-intl';

const ADDRESS = 'Den Heuvel 21, 5688 EM Oirschot';
const DIRECTIONS_URL = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
  ADDRESS
)}`;
const MAP_EMBED_URL = `https://www.google.com/maps?q=${encodeURIComponent(
  ADDRESS
)}&output=embed`;
const WHATSAPP_NUMBER = '31600000000';

export function ContactInfo() {
  const t = useTranslations('contactPage');

  return (
    <div className="flex flex-col gap-6 text-sm text-white/80">
      <div>
        <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/50">
          {t('visitLabel')}
        </p>
        <p data-testid="contact-address" className="mt-2">
          {ADDRESS}
        </p>
        <a
          href={DIRECTIONS_URL}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="contact-directions"
          className="mt-1 inline-block text-xs underline decoration-white/30"
        >
          {t('planRoute')}
        </a>
        <iframe
          data-testid="contact-map"
          src={MAP_EMBED_URL}
          title={t('visitLabel')}
          loading="lazy"
          className="mt-4 h-48 w-full rounded border border-white/10"
        />
      </div>

      <div>
        <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/50">
          {t('contactsLabel')}
        </p>
        <p className="mt-2">
          <strong className="text-white">Paul van den Hout</strong> — {t('projectsContact')}
          <br />
          <a
            href="tel:+31651404089"
            data-testid="contact-phone-projects"
            className="underline decoration-white/30"
          >
            06 51404089
          </a>
        </p>
        <p className="mt-3">
          <strong className="text-white">Hem Brekoo</strong> — {t('b2bContact')}
          <br />
          <a
            href="tel:+31653736756"
            data-testid="contact-phone-b2b"
            className="underline decoration-white/30"
          >
            06 53736756
          </a>
        </p>
      </div>

      <div>
        <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/50">
          {t('emailLabel')}
        </p>
        <a
          href="mailto:info@glassartdesign.nl"
          data-testid="contact-email"
          className="mt-2 inline-block underline decoration-white/30"
        >
          info@glassartdesign.nl
        </a>
      </div>

      <div>
        <a
          href={`https://wa.me/${WHATSAPP_NUMBER}`}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="contact-whatsapp"
          className="inline-block rounded-sm bg-silver px-4 py-2 text-xs tracking-[0.15em] text-ink"
        >
          {t('whatsappLabel')}
        </a>
      </div>

      <div>
        <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/50">
          {t('hoursLabel')}
        </p>
        <p className="mt-2">{t('hoursValue')}</p>
      </div>

      <div>
        <p className="text-[0.65rem] uppercase tracking-[0.2em] text-white/50">
          {t('companyLabel')}
        </p>
        <p className="mt-2">
          {t('kvkLabel')}: 12345678
          <br />
          {t('btwLabel')}: NL123456789B01
          <br />
          {t('ibanLabel')}: NL00 BANK 0123 4567 89
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ContactInfo`
Expected: PASS — 6 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/ContactInfo.tsx tests/components/ContactInfo.test.tsx
git commit -m "feat: add ContactInfo with real business contact details"
```

---

### Task 3: ContactForm component

**Files:**
- Create: `src/components/ContactForm.tsx`
- Create: `tests/components/ContactForm.test.tsx`

**Interfaces:**
- Consumes: message keys `contactPage.{formTitle,formName,formCompany,formEmail,formPhone,formSubject,subjectGeneral,subjectQuote,subjectOther,formMessage,formSubmit,formSubmitted}` (Task 1).
- Produces: `ContactForm()` — no props, used by Task 4 (`contact/page.tsx`). Renders `data-testid="contact-form-{name,company,email,phone,subject,message,submit}"`.

- [ ] **Step 1: Write the failing test**

Create `tests/components/ContactForm.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ContactForm } from '@/components/ContactForm';
import messages from '../../messages/nl.json';

function renderForm() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <ContactForm />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('ContactForm', () => {
  it('marks name, email, subject, and message as required; company and phone as optional', () => {
    renderForm();
    expect(screen.getByTestId('contact-form-name')).toBeRequired();
    expect(screen.getByTestId('contact-form-company')).not.toBeRequired();
    expect(screen.getByTestId('contact-form-email')).toBeRequired();
    expect(screen.getByTestId('contact-form-phone')).not.toBeRequired();
    expect(screen.getByTestId('contact-form-subject')).toBeRequired();
    expect(screen.getByTestId('contact-form-message')).toBeRequired();
  });

  it('offers exactly the 3 subject options', () => {
    renderForm();
    const select = screen.getByTestId('contact-form-subject') as HTMLSelectElement;
    const optionTexts = Array.from(select.options)
      .map((option) => option.text)
      .filter((text) => text !== 'Onderwerp');
    expect(optionTexts).toEqual(['Algemene vraag', 'Offerte aanvragen', 'Overig']);
  });

  it('shows "Verzonden!" and disables the button on submit, then resets after the delay', () => {
    renderForm();
    fireEvent.change(screen.getByTestId('contact-form-name'), {
      target: { value: 'Jan Jansen' },
    });
    fireEvent.change(screen.getByTestId('contact-form-email'), {
      target: { value: 'jan@example.com' },
    });
    fireEvent.change(screen.getByTestId('contact-form-subject'), {
      target: { value: 'general' },
    });
    fireEvent.change(screen.getByTestId('contact-form-message'), {
      target: { value: 'Hallo, ik heb een vraag.' },
    });

    fireEvent.submit(screen.getByTestId('contact-form-submit').closest('form')!);

    expect(screen.getByTestId('contact-form-submit')).toHaveTextContent('Verzonden!');
    expect(screen.getByTestId('contact-form-submit')).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(2500);
    });

    expect(screen.getByTestId('contact-form-submit')).toHaveTextContent('Versturen');
    expect(screen.getByTestId('contact-form-submit')).not.toBeDisabled();
    expect(screen.getByTestId('contact-form-name')).toHaveValue('');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ContactForm`
Expected: FAIL — `Cannot find module '@/components/ContactForm'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/ContactForm.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';

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
        {t('formName')}
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
        {t('formEmail')}
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
        {t('formSubject')}
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
        {t('formMessage')}
        <textarea
          name="message"
          required
          rows={4}
          data-testid="contact-form-message"
          className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
        />
      </label>

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ContactForm`
Expected: PASS — 3 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/ContactForm.tsx tests/components/ContactForm.test.tsx
git commit -m "feat: add mock ContactForm"
```

---

### Task 4: `/contact` page

**Files:**
- Create: `src/app/[locale]/contact/page.tsx`

**Interfaces:**
- Consumes: `ContactInfo` (Task 2, `@/components/ContactInfo`), `ContactForm` (Task 3, `@/components/ContactForm`), `GlassPanel` (existing, `@/components/GlassPanel`), message keys `contactPage.{title,intro}` (Task 1).
- Produces: the `/[locale]/contact` route.

- [ ] **Step 1: Create `src/app/[locale]/contact/page.tsx`**

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GlassPanel } from '@/components/GlassPanel';
import { ContactInfo } from '@/components/ContactInfo';
import { ContactForm } from '@/components/ContactForm';

export default async function ContactPage({
  params,
}: {
  params: { locale: string };
}) {
  const { locale } = params;
  setRequestLocale(locale);
  const t = await getTranslations('contactPage');

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-ink via-charcoal to-graphite px-4 pb-16 pt-24 sm:px-8">
      <GlassPanel className="mx-auto mb-10 max-w-3xl text-center">
        <h1 className="text-2xl font-light text-white sm:text-3xl">{t('title')}</h1>
        <p className="mt-3 text-sm text-white/70">{t('intro')}</p>
      </GlassPanel>

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 lg:grid-cols-2">
        <GlassPanel>
          <ContactInfo />
        </GlassPanel>
        <GlassPanel>
          <ContactForm />
        </GlassPanel>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests green (this page has no dedicated test, but must not break `ContactInfo.test.tsx`/`ContactForm.test.tsx`, which don't depend on it).

- [ ] **Step 3: Run the production build to confirm the new route compiles and statically exports**

Run: `npm run build`
Expected: build completes successfully; the route list includes `/[locale]/contact` for all 4 locales (`/nl/contact`, `/en/contact`, `/de/contact`, `/fr/contact`).

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/contact/page.tsx"
git commit -m "feat: add the /contact page"
```

---

### Task 5: Retarget the NavBar "Contact" link

**Files:**
- Modify: `src/components/NavBar.tsx`
- Modify: `tests/components/NavBar.test.tsx`

**Interfaces:**
- Consumes: the new `/contact` route (Task 4).
- Produces: `NavBar`'s `nav-contact` element becomes a `next-intl` `Link` to `/contact` (locale-prefixed automatically, matching `nav-home`/`nav-collections`) instead of an anchor to the temporary `#contact` fragment. `nav-become-client` is unchanged.

- [ ] **Step 1: Update `tests/components/NavBar.test.tsx`**

Replace this existing test:

```tsx
  it('points Contact and Word klant at the homepage contact anchor', () => {
    renderNavBar();
    expect(screen.getByTestId('nav-contact')).toHaveAttribute('href', '/nl/#contact');
    expect(screen.getByTestId('nav-become-client')).toHaveAttribute('href', '/nl/#contact');
  });
```

with:

```tsx
  it('points Contact at the /contact page, and Word klant at the homepage contact anchor', () => {
    renderNavBar();
    expect(screen.getByTestId('nav-contact')).toHaveAttribute('href', '/contact');
    expect(screen.getByTestId('nav-become-client')).toHaveAttribute('href', '/nl/#contact');
  });
```

No other changes to this file — the existing `@/i18n/navigation` mock (which renders `Link` as a plain `<a href>`, no locale prefixing) already supports asserting a bare `/contact` href, the same way `nav-collections`' test already asserts a bare `/collecties` href.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- NavBar`
Expected: FAIL — `nav-contact` still has `href="/nl/#contact"`, not `/contact`.

- [ ] **Step 3: Update `src/components/NavBar.tsx`**

Change the `nav-contact` element from an anchor tag to a `Link` (matching `nav-home`/`nav-collections`):

```tsx
'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useMockAuth } from '@/lib/useMockAuth';
import { BASE_PATH } from '@/lib/basePath';
import { LanguageSwitcher } from './LanguageSwitcher';
import { AccountMenu } from './AccountMenu';
import { CartPanel } from './CartPanel';

export function NavBar() {
  const locale = useLocale();
  const t = useTranslations('nav');
  const { isLoggedIn, isHydrated, login } = useMockAuth();
  const contactHref = `${BASE_PATH}/${locale}/#contact`;

  return (
    <nav
      data-testid="navbar"
      className="fixed left-0 top-0 z-40 flex w-full flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-black/60 px-4 py-3 backdrop-blur-sm sm:px-8"
    >
      <div className="flex items-center gap-6 text-xs tracking-[0.15em] text-white/70">
        <Link href="/" data-testid="nav-home" className="hover:text-white">
          {t('home')}
        </Link>
        <Link href="/collecties" data-testid="nav-collections" className="hover:text-white">
          {t('collections')}
        </Link>
        <Link href="/contact" data-testid="nav-contact" className="hover:text-white">
          {t('contact')}
        </Link>
      </div>

      <div className="flex items-center gap-3">
        {isHydrated && isLoggedIn ? (
          <AccountMenu />
        ) : (
          <>
            <a
              href={contactHref}
              data-testid="nav-become-client"
              className="hidden text-xs tracking-[0.15em] text-white/70 hover:text-white sm:inline"
            >
              {t('becomeClient')}
            </a>
            <button
              type="button"
              data-testid="nav-login"
              onClick={login}
              className="rounded-sm bg-silver px-4 py-2 text-xs tracking-[0.15em] text-ink"
            >
              {t('login')}
            </button>
          </>
        )}
        <CartPanel />
        <LanguageSwitcher />
      </div>
    </nav>
  );
}
```

Note: `contactHref` stays — it's still used by `nav-become-client`, which is deliberately unchanged in this task.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- NavBar`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests green (confirms `NavBarAccountMenuIntegration.test.tsx`, which also renders the real `NavBar`, is unaffected — it doesn't assert on `nav-contact`'s href).

- [ ] **Step 6: Commit**

```bash
git add src/components/NavBar.tsx tests/components/NavBar.test.tsx
git commit -m "feat: retarget the NavBar Contact link to the new /contact page"
```

---

### Task 6: Static export build verification

**Files:**
- No new files. This task verifies the previous 5 tasks produce a working static export with the full contact page functional end to end.

- [ ] **Step 1: Run the production build**

Run: `npm run build`
Expected: build completes successfully, no new errors. Route list includes `/[locale]/contact` for all 4 locales.

- [ ] **Step 2: Run the full test suite one final time**

Run: `npm test`
Expected: PASS — all tests green.

- [ ] **Step 3: Verify real business content is present in the static export**

Run: `grep -o "Den Heuvel 21\|info@glassartdesign.nl\|Paul van den Hout\|Hem Brekoo" out/nl/contact/index.html | sort -u`
Expected: all 4 strings found — confirms the real address, email, and both contact persons are present in the pre-rendered static HTML (since `ContactInfo` is a client component but still server-rendered at build time for the initial HTML payload, same as other client components on this site).

- [ ] **Step 4: Manually verify in the browser**

Run: `npx serve out -l 4177` (or reuse whatever static server command was used for previous plans) and open the site, navigating to `/nl/contact`.

Check:
- Clicking "Contact" in the nav bar goes to `/nl/contact` (not the homepage anchor).
- The page shows two columns on desktop: business details on the left, the contact form on the right.
- Left column: the real address, a working "Plan route" link (opens Google Maps directions in a new tab), an embedded Google Maps iframe showing the address area, both contact persons with clickable phone numbers, the corrected email (`info@glassartdesign.nl`) as a working mailto link, a WhatsApp button, opening hours, and the company registration block (KvK/BTW/IBAN placeholders).
- Right column: filling in the required fields and clicking "Versturen" shows "Verzonden!" briefly, then the form resets and the button returns to "Versturen".
- Submitting the form with required fields empty shows the browser's native required-field validation (no console errors, no page navigation).
- The existing homepage's short Contact section (bottom of `/nl`) is unchanged and still shows `info@glassartdesign.nl`.
- Switching languages on `/contact` updates all labels correctly, including the WhatsApp button, the subject dropdown options, and the "Verzonden!" text.
- Mobile width (375px): the two columns stack to one, the map iframe and form remain usable, no horizontal overflow.

- [ ] **Step 5: Commit**

No code changes expected in this task. If Steps 1–4 surfaced a fix, commit it with a message describing what was broken, then re-run Steps 1–4.
