# Registratiepagina ("Word klant") Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 19-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a new `/word-klant` registration page with a particulier/zakelijk toggle, shared fields plus business-only fields, an optional delivery-address toggle, and a mock submit that shows a confirmation screen — then retarget every existing "Word klant" CTA (NavBar and `BecomeClientCta` on `/collecties`) to this new page instead of the temporary `#contact` anchor.

**Architecture:** A single client component `RegistrationForm.tsx` (`useTranslations`) owns the whole form: client-type toggle, all fields, the delivery-address checkbox reveal, the business-fields conditional reveal, and a local `isSubmitted` flag that swaps the entire form out for a confirmation message on submit (no auto-reset — unlike the contact form's brief button flash, this is a persistent confirmation screen, matching the spec's "bevestigingsscherm" wording). A new server component `src/app/[locale]/word-klant/page.tsx` mirrors the existing `contact/page.tsx`/`collecties/page.tsx` pattern (`setRequestLocale` + `getTranslations` for the title/intro banner) and renders `RegistrationForm` inside a `GlassPanel`. `BecomeClientCta` drops its `contactHref` prop entirely and hardcodes a `next-intl` `Link` to `/word-klant`; its only caller (`collecties/page.tsx`) is simplified to match. `NavBar`'s `nav-become-client` switches from the temporary anchor to a `Link` to `/word-klant`, and — since this was the last remaining consumer of `contactHref`/`BASE_PATH` in that file — both become fully removable from `NavBar.tsx`.

**Tech Stack:** Same as the existing project — Next.js 14 (App Router) + TypeScript, Tailwind CSS, next-intl v3, Vitest + React Testing Library.

## Global Constraints

- No real account creation, password storage, or submission — `preventDefault`, no network call, no `localStorage` write. This form is explicitly **not** coupled to `useMockAuth`.
- Password field is a plain HTML5 `type="password" required` — no strength validation, no custom regex.
- Shared required fields (both client types): name, email, phone, password, address, postcode, city.
- Business-only required fields (only when "Zakelijk" is selected): company name, KvK number, contact person.
- Delivery-address fields (address/postcode/city) appear only when the "different delivery address" checkbox is checked, and are **not** required even when shown (mock form, minimal validation).
- On submit: the entire form is replaced by a confirmation screen — "Aanvraag ontvangen" / "We nemen binnen 2 werkdagen contact met u op." (translated per locale) — with no auto-reset back to the form.
- Every existing "Word klant" CTA (NavBar's `nav-become-client`, `BecomeClientCta` on `/collecties`) is retargeted to `/word-klant`. The NavBar's "Contact" link (already `/contact`, from the prior contact-page plan) is untouched.
- All new text in all 4 locales (NL/EN/DE/FR).

---

## File Structure Overview

```
messages/{nl,en,de,fr}.json                (MODIFY — add `registrationPage` translation namespace)
src/components/RegistrationForm.tsx        (CREATE — the mock registration form)
src/app/[locale]/word-klant/page.tsx       (CREATE — new /word-klant route)
src/components/BecomeClientCta.tsx         (MODIFY — drop contactHref prop, hardcode Link to /word-klant)
src/app/[locale]/collecties/page.tsx       (MODIFY — drop contactHref/BASE_PATH, call BecomeClientCta with no props)
src/components/NavBar.tsx                  (MODIFY — nav-become-client becomes a Link to /word-klant; contactHref/BASE_PATH/useLocale removed, now fully unused)
tests/components/RegistrationForm.test.tsx (CREATE)
tests/components/BecomeClientCta.test.tsx  (MODIFY — mock @/i18n/navigation, drop the contactHref prop, update assertions)
tests/components/NavBar.test.tsx           (MODIFY — update the nav-become-client href assertion)
```

No dedicated test file for `src/app/[locale]/word-klant/page.tsx` itself — following the same established convention as `collecties/page.tsx` and `contact/page.tsx` (neither has a direct page-level test): the page's server-rendered title/intro banner is verified manually in the build-verification task, while the real, testable content lives in `RegistrationForm`, which gets a full automated test.

---

### Task 1: `registrationPage` translation keys

**Files:**
- Modify: `messages/nl.json`
- Modify: `messages/en.json`
- Modify: `messages/de.json`
- Modify: `messages/fr.json`

**Interfaces:**
- Produces: message keys `registrationPage.{title,intro,typeParticulier,typeZakelijk,labelName,labelEmail,labelPhone,labelPassword,labelAddress,labelPostcode,labelCity,differentDeliveryLabel,labelDeliveryAddress,labelDeliveryPostcode,labelDeliveryCity,labelCompanyName,labelKvk,labelContactPerson,submit,confirmationTitle,confirmationMessage}` — used by Tasks 2, 3.

- [ ] **Step 1: Add the `registrationPage` namespace to `messages/nl.json`**

Add this new top-level key (after `"contactPage"`, before the closing `}`):

```json
  "registrationPage": {
    "title": "Word klant",
    "intro": "Vraag een klantaccount aan, wij nemen daarna contact met u op.",
    "typeParticulier": "Particulier",
    "typeZakelijk": "Zakelijk",
    "labelName": "Naam",
    "labelEmail": "E-mailadres",
    "labelPhone": "Telefoonnummer",
    "labelPassword": "Wachtwoord",
    "labelAddress": "Adres",
    "labelPostcode": "Postcode",
    "labelCity": "Plaats",
    "differentDeliveryLabel": "Afwijkend afleveradres",
    "labelDeliveryAddress": "Afleveradres",
    "labelDeliveryPostcode": "Afleverpostcode",
    "labelDeliveryCity": "Afleverplaats",
    "labelCompanyName": "Bedrijfsnaam",
    "labelKvk": "KvK-nummer",
    "labelContactPerson": "Contactpersoon",
    "submit": "Aanvraag versturen",
    "confirmationTitle": "Aanvraag ontvangen",
    "confirmationMessage": "We nemen binnen 2 werkdagen contact met u op."
  }
```

- [ ] **Step 2: Add the `registrationPage` namespace to `messages/en.json`**

```json
  "registrationPage": {
    "title": "Become a client",
    "intro": "Request a customer account, we'll get in touch with you afterwards.",
    "typeParticulier": "Individual",
    "typeZakelijk": "Business",
    "labelName": "Name",
    "labelEmail": "Email address",
    "labelPhone": "Phone number",
    "labelPassword": "Password",
    "labelAddress": "Address",
    "labelPostcode": "Postal code",
    "labelCity": "City",
    "differentDeliveryLabel": "Different delivery address",
    "labelDeliveryAddress": "Delivery address",
    "labelDeliveryPostcode": "Delivery postal code",
    "labelDeliveryCity": "Delivery city",
    "labelCompanyName": "Company name",
    "labelKvk": "Chamber of Commerce no.",
    "labelContactPerson": "Contact person",
    "submit": "Send request",
    "confirmationTitle": "Request received",
    "confirmationMessage": "We'll get in touch within 2 business days."
  }
```

- [ ] **Step 3: Add the `registrationPage` namespace to `messages/de.json`**

```json
  "registrationPage": {
    "title": "Kunde werden",
    "intro": "Beantragen Sie ein Kundenkonto, wir melden uns anschließend bei Ihnen.",
    "typeParticulier": "Privat",
    "typeZakelijk": "Geschäftlich",
    "labelName": "Name",
    "labelEmail": "E-Mail-Adresse",
    "labelPhone": "Telefonnummer",
    "labelPassword": "Passwort",
    "labelAddress": "Adresse",
    "labelPostcode": "Postleitzahl",
    "labelCity": "Ort",
    "differentDeliveryLabel": "Abweichende Lieferadresse",
    "labelDeliveryAddress": "Lieferadresse",
    "labelDeliveryPostcode": "Liefer-Postleitzahl",
    "labelDeliveryCity": "Lieferort",
    "labelCompanyName": "Firmenname",
    "labelKvk": "Handelsregisternummer",
    "labelContactPerson": "Ansprechpartner",
    "submit": "Anfrage senden",
    "confirmationTitle": "Anfrage erhalten",
    "confirmationMessage": "Wir melden uns innerhalb von 2 Werktagen bei Ihnen."
  }
```

- [ ] **Step 4: Add the `registrationPage` namespace to `messages/fr.json`**

```json
  "registrationPage": {
    "title": "Devenir client",
    "intro": "Demandez un compte client, nous vous contacterons ensuite.",
    "typeParticulier": "Particulier",
    "typeZakelijk": "Professionnel",
    "labelName": "Nom",
    "labelEmail": "Adresse e-mail",
    "labelPhone": "Numéro de téléphone",
    "labelPassword": "Mot de passe",
    "labelAddress": "Adresse",
    "labelPostcode": "Code postal",
    "labelCity": "Ville",
    "differentDeliveryLabel": "Adresse de livraison différente",
    "labelDeliveryAddress": "Adresse de livraison",
    "labelDeliveryPostcode": "Code postal de livraison",
    "labelDeliveryCity": "Ville de livraison",
    "labelCompanyName": "Nom de l'entreprise",
    "labelKvk": "Numéro de registre du commerce",
    "labelContactPerson": "Personne de contact",
    "submit": "Envoyer la demande",
    "confirmationTitle": "Demande reçue",
    "confirmationMessage": "Nous vous contacterons sous 2 jours ouvrés."
  }
```

- [ ] **Step 5: Verify all 4 locale files are valid JSON with identical key structure**

Run: `node -e "const fs=require('fs'); const locales=['nl','en','de','fr']; const keys = locales.map(l => JSON.stringify(Object.keys(JSON.parse(fs.readFileSync('messages/'+l+'.json')).registrationPage).sort())); console.log(keys.every(k => k === keys[0]) ? 'MATCH' : 'MISMATCH: ' + keys.join(' | '))"`
Expected: `MATCH`

- [ ] **Step 6: Run the full test suite to confirm nothing broke**

Run: `npm test`
Expected: PASS — all existing tests still green.

- [ ] **Step 7: Commit**

```bash
git add messages/nl.json messages/en.json messages/de.json messages/fr.json
git commit -m "feat: add registrationPage translation keys"
```

---

### Task 2: RegistrationForm component

**Files:**
- Create: `src/components/RegistrationForm.tsx`
- Create: `tests/components/RegistrationForm.test.tsx`

**Interfaces:**
- Consumes: message keys `registrationPage.*` (Task 1).
- Produces: `RegistrationForm()` — no props, used by Task 3 (`word-klant/page.tsx`). Renders (before submit) `data-testid="word-klant-type-particulier"`, `data-testid="word-klant-type-zakelijk"`, `data-testid="word-klant-{name,email,phone,password,address,postcode,city}"`, `data-testid="word-klant-different-delivery"` (checkbox), conditionally `data-testid="word-klant-delivery-{address,postcode,city}"`, conditionally `data-testid="word-klant-{company-name,kvk,contact-person}"`, `data-testid="word-klant-submit"`. After submit, renders `data-testid="word-klant-confirmation"` instead of the form.

- [ ] **Step 1: Write the failing tests**

Create `tests/components/RegistrationForm.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { RegistrationForm } from '@/components/RegistrationForm';
import messages from '../../messages/nl.json';

function renderForm() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <RegistrationForm />
    </NextIntlClientProvider>
  );
}

describe('RegistrationForm', () => {
  it('defaults to "Particulier" selected, with no business fields shown', () => {
    renderForm();
    expect(screen.getByTestId('word-klant-type-particulier')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByTestId('word-klant-type-zakelijk')).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    expect(screen.queryByTestId('word-klant-company-name')).not.toBeInTheDocument();
    expect(screen.queryByTestId('word-klant-kvk')).not.toBeInTheDocument();
    expect(screen.queryByTestId('word-klant-contact-person')).not.toBeInTheDocument();
  });

  it('marks the shared fields as required', () => {
    renderForm();
    expect(screen.getByTestId('word-klant-name')).toBeRequired();
    expect(screen.getByTestId('word-klant-email')).toBeRequired();
    expect(screen.getByTestId('word-klant-phone')).toBeRequired();
    expect(screen.getByTestId('word-klant-password')).toBeRequired();
    expect(screen.getByTestId('word-klant-address')).toBeRequired();
    expect(screen.getByTestId('word-klant-postcode')).toBeRequired();
    expect(screen.getByTestId('word-klant-city')).toBeRequired();
  });

  it('shows the 3 required business fields when "Zakelijk" is selected, hides them again when switching back', () => {
    renderForm();
    fireEvent.click(screen.getByTestId('word-klant-type-zakelijk'));

    expect(screen.getByTestId('word-klant-type-zakelijk')).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByTestId('word-klant-company-name')).toBeRequired();
    expect(screen.getByTestId('word-klant-kvk')).toBeRequired();
    expect(screen.getByTestId('word-klant-contact-person')).toBeRequired();

    fireEvent.click(screen.getByTestId('word-klant-type-particulier'));
    expect(screen.queryByTestId('word-klant-company-name')).not.toBeInTheDocument();
  });

  it('shows the 3 delivery-address fields only when the "different delivery address" checkbox is checked', () => {
    renderForm();
    expect(screen.queryByTestId('word-klant-delivery-address')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('word-klant-different-delivery'));
    expect(screen.getByTestId('word-klant-delivery-address')).toBeInTheDocument();
    expect(screen.getByTestId('word-klant-delivery-postcode')).toBeInTheDocument();
    expect(screen.getByTestId('word-klant-delivery-city')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('word-klant-different-delivery'));
    expect(screen.queryByTestId('word-klant-delivery-address')).not.toBeInTheDocument();
  });

  it('shows the confirmation screen and hides the form after submit, without a real submission', () => {
    renderForm();
    fireEvent.change(screen.getByTestId('word-klant-name'), { target: { value: 'Jan Jansen' } });
    fireEvent.change(screen.getByTestId('word-klant-email'), {
      target: { value: 'jan@example.com' },
    });
    fireEvent.change(screen.getByTestId('word-klant-phone'), { target: { value: '0612345678' } });
    fireEvent.change(screen.getByTestId('word-klant-password'), {
      target: { value: 'geheim123' },
    });
    fireEvent.change(screen.getByTestId('word-klant-address'), {
      target: { value: 'Teststraat 1' },
    });
    fireEvent.change(screen.getByTestId('word-klant-postcode'), {
      target: { value: '1234 AB' },
    });
    fireEvent.change(screen.getByTestId('word-klant-city'), { target: { value: 'Teststad' } });

    fireEvent.submit(screen.getByTestId('word-klant-submit').closest('form')!);

    expect(screen.getByTestId('word-klant-confirmation')).toBeInTheDocument();
    expect(screen.getByText('Aanvraag ontvangen')).toBeInTheDocument();
    expect(screen.queryByTestId('word-klant-submit')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- RegistrationForm`
Expected: FAIL — `Cannot find module '@/components/RegistrationForm'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/RegistrationForm.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';

type ClientType = 'particulier' | 'zakelijk';

export function RegistrationForm() {
  const t = useTranslations('registrationPage');
  const [clientType, setClientType] = useState<ClientType>('particulier');
  const [showDeliveryAddress, setShowDeliveryAddress] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitted(true);
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
      <div className="flex gap-2">
        <button
          type="button"
          data-testid="word-klant-type-particulier"
          aria-pressed={clientType === 'particulier'}
          onClick={() => setClientType('particulier')}
          className={
            clientType === 'particulier'
              ? 'flex-1 rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink'
              : 'flex-1 rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white'
          }
        >
          {t('typeParticulier')}
        </button>
        <button
          type="button"
          data-testid="word-klant-type-zakelijk"
          aria-pressed={clientType === 'zakelijk'}
          onClick={() => setClientType('zakelijk')}
          className={
            clientType === 'zakelijk'
              ? 'flex-1 rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink'
              : 'flex-1 rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white'
          }
        >
          {t('typeZakelijk')}
        </button>
      </div>

      <label className={labelClassName}>
        {t('labelName')}
        <input type="text" name="name" required data-testid="word-klant-name" className={fieldClassName} />
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
        {t('labelPassword')}
        <input
          type="password"
          name="password"
          required
          data-testid="word-klant-password"
          className={fieldClassName}
        />
      </label>

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

      {clientType === 'zakelijk' && (
        <>
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
        </>
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- RegistrationForm`
Expected: PASS — 5 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/RegistrationForm.tsx tests/components/RegistrationForm.test.tsx
git commit -m "feat: add mock RegistrationForm with particulier/zakelijk toggle"
```

---

### Task 3: `/word-klant` page

**Files:**
- Create: `src/app/[locale]/word-klant/page.tsx`

**Interfaces:**
- Consumes: `RegistrationForm` (Task 2, `@/components/RegistrationForm`), `GlassPanel` (existing, `@/components/GlassPanel`), message keys `registrationPage.{title,intro}` (Task 1).
- Produces: the `/[locale]/word-klant` route.

- [ ] **Step 1: Create `src/app/[locale]/word-klant/page.tsx`**

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GlassPanel } from '@/components/GlassPanel';
import { RegistrationForm } from '@/components/RegistrationForm';

export default async function WordKlantPage({
  params,
}: {
  params: { locale: string };
}) {
  const { locale } = params;
  setRequestLocale(locale);
  const t = await getTranslations('registrationPage');

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-ink via-charcoal to-graphite px-4 pb-16 pt-24 sm:px-8">
      <GlassPanel className="mx-auto mb-10 max-w-3xl text-center">
        <h1 className="text-2xl font-light text-white sm:text-3xl">{t('title')}</h1>
        <p className="mt-3 text-sm text-white/70">{t('intro')}</p>
      </GlassPanel>

      <GlassPanel>
        <RegistrationForm />
      </GlassPanel>
    </main>
  );
}
```

- [ ] **Step 2: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests green (this page has no dedicated test, but must not break `RegistrationForm.test.tsx`, which doesn't depend on it).

- [ ] **Step 3: Run the production build to confirm the new route compiles and statically exports**

Run: `npm run build`
Expected: build completes successfully; the route list includes `/[locale]/word-klant` for all 4 locales (`/nl/word-klant`, `/en/word-klant`, `/de/word-klant`, `/fr/word-klant`).

- [ ] **Step 4: Commit**

```bash
git add "src/app/[locale]/word-klant/page.tsx"
git commit -m "feat: add the /word-klant page"
```

---

### Task 4: Retarget BecomeClientCta to /word-klant

**Files:**
- Modify: `src/components/BecomeClientCta.tsx`
- Modify: `src/app/[locale]/collecties/page.tsx`
- Modify: `tests/components/BecomeClientCta.test.tsx`

**Interfaces:**
- Consumes: the new `/word-klant` route (Task 3).
- Produces: `BecomeClientCta()` — **no props anymore** (the `contactHref` prop is removed). Its only caller, `CollectiesPage`, is updated to call it with no props.

- [ ] **Step 1: Update `tests/components/BecomeClientCta.test.tsx`**

Replace the file in full:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BecomeClientCta } from '@/components/BecomeClientCta';
import { MockAuthProvider } from '@/lib/useMockAuth';
import messages from '../../messages/nl.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function renderBecomeClientCta() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <MockAuthProvider>
        <BecomeClientCta />
      </MockAuthProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('BecomeClientCta', () => {
  it('shows the "Word klant" link pointing at /word-klant when logged out', () => {
    renderBecomeClientCta();
    expect(screen.getByTestId('segment-cta')).toHaveAttribute('href', '/word-klant');
  });

  it('hides the link when already logged in', () => {
    window.localStorage.setItem('glassart-mock-logged-in', 'true');
    renderBecomeClientCta();
    expect(screen.queryByTestId('segment-cta')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- BecomeClientCta`
Expected: FAIL — current `BecomeClientCta` requires a `contactHref` prop and renders a plain anchor, not a `Link`.

- [ ] **Step 3: Update `src/components/BecomeClientCta.tsx`**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useMockAuth } from '@/lib/useMockAuth';

export function BecomeClientCta() {
  const t = useTranslations('nav');
  const { isHydrated, isLoggedIn } = useMockAuth();

  if (isHydrated && isLoggedIn) {
    return null;
  }

  return (
    <Link
      href="/word-klant"
      data-testid="segment-cta"
      className="inline-block rounded-sm bg-silver px-6 py-3 text-xs tracking-[0.2em] text-ink"
    >
      {t('becomeClient')}
    </Link>
  );
}
```

- [ ] **Step 4: Update `src/app/[locale]/collecties/page.tsx`**

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GlassPanel } from '@/components/GlassPanel';
import { ProductsGrid } from '@/components/ProductsGrid';
import { BecomeClientCta } from '@/components/BecomeClientCta';

export default async function CollectiesPage({
  params,
}: {
  params: { locale: string };
}) {
  const { locale } = params;
  setRequestLocale(locale);
  const t = await getTranslations('collectionsPage');

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-ink via-charcoal to-graphite px-4 pb-16 pt-24 sm:px-8">
      <GlassPanel className="mx-auto mb-10 max-w-3xl text-center">
        <h1 className="text-2xl font-light text-white sm:text-3xl">{t('title')}</h1>
        <p className="mt-3 text-sm text-white/70">{t('intro')}</p>
      </GlassPanel>

      <ProductsGrid />

      <div className="mx-auto mt-10 max-w-3xl text-center">
        <BecomeClientCta />
      </div>
    </main>
  );
}
```

Note: `BASE_PATH` import and the `contactHref` computation are removed from this file entirely — nothing else in this page used them.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- BecomeClientCta`
Expected: PASS — 2 tests passed.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests green (confirms `ProductsGrid.test.tsx`, which doesn't touch `BecomeClientCta`, is unaffected, and no other file imports `BecomeClientCta` with the old `contactHref` prop).

- [ ] **Step 7: Commit**

```bash
git add src/components/BecomeClientCta.tsx "src/app/[locale]/collecties/page.tsx" tests/components/BecomeClientCta.test.tsx
git commit -m "feat: retarget BecomeClientCta to the /word-klant page"
```

---

### Task 5: Retarget the NavBar "Word klant" link

**Files:**
- Modify: `src/components/NavBar.tsx`
- Modify: `tests/components/NavBar.test.tsx`

**Interfaces:**
- Consumes: the new `/word-klant` route (Task 3).
- Produces: `NavBar`'s `nav-become-client` element becomes a `next-intl` `Link` to `/word-klant` instead of an anchor to the temporary `#contact` fragment. Since this was the last remaining use of `contactHref`/`BASE_PATH`/`useLocale` in this file, all three are removed entirely.

- [ ] **Step 1: Update `tests/components/NavBar.test.tsx`**

Replace this existing test:

```tsx
  it('points Contact at the /contact page, and Word klant at the homepage contact anchor', () => {
    renderNavBar();
    expect(screen.getByTestId('nav-contact')).toHaveAttribute('href', '/contact');
    expect(screen.getByTestId('nav-become-client')).toHaveAttribute('href', '/nl/#contact');
  });
```

with:

```tsx
  it('points Contact at /contact and Word klant at /word-klant', () => {
    renderNavBar();
    expect(screen.getByTestId('nav-contact')).toHaveAttribute('href', '/contact');
    expect(screen.getByTestId('nav-become-client')).toHaveAttribute('href', '/word-klant');
  });
```

No other changes to this file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- NavBar`
Expected: FAIL — `nav-become-client` still has `href="/nl/#contact"`, not `/word-klant`.

- [ ] **Step 3: Update `src/components/NavBar.tsx`**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useMockAuth } from '@/lib/useMockAuth';
import { LanguageSwitcher } from './LanguageSwitcher';
import { AccountMenu } from './AccountMenu';
import { CartPanel } from './CartPanel';

export function NavBar() {
  const t = useTranslations('nav');
  const { isLoggedIn, isHydrated, login } = useMockAuth();

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
            <Link
              href="/word-klant"
              data-testid="nav-become-client"
              className="hidden text-xs tracking-[0.15em] text-white/70 hover:text-white sm:inline"
            >
              {t('becomeClient')}
            </Link>
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

Note: `useLocale`, `BASE_PATH`, and the `contactHref` variable are gone — nothing else in this file used them.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- NavBar`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests green (confirms `NavBarAccountMenuIntegration.test.tsx`, which also renders the real `NavBar`, is unaffected — it doesn't assert on `nav-become-client`'s href).

- [ ] **Step 6: Commit**

```bash
git add src/components/NavBar.tsx tests/components/NavBar.test.tsx
git commit -m "feat: retarget the NavBar Word klant link to /word-klant"
```

---

### Task 6: Static export build verification

**Files:**
- No new files. This task verifies the previous 5 tasks produce a working static export with the full registration flow functional end to end.

- [ ] **Step 1: Run the production build**

Run: `npm run build`
Expected: build completes successfully, no new errors. Route list includes `/[locale]/word-klant` for all 4 locales.

- [ ] **Step 2: Run the full test suite one final time**

Run: `npm test`
Expected: PASS — all tests green.

- [ ] **Step 3: Verify the registration form content is present in the static export**

Run: `grep -o "Word klant\|Particulier\|Zakelijk" out/nl/word-klant/index.html | sort -u`
Expected: all 3 strings found.

- [ ] **Step 4: Manually verify in the browser**

Run: `npx serve out -l 4179` (or reuse whatever static server command was used for previous plans) and open the site, navigating to `/nl/word-klant`.

Check:
- Clicking "Word klant" in the nav bar (visible when logged out) goes to `/nl/word-klant`.
- Clicking "Word klant" on `/nl/collecties` (the `BecomeClientCta` button below the product grid) also goes to `/nl/word-klant`.
- The page defaults to "Particulier" selected; the business-only fields (Bedrijfsnaam, KvK-nummer, Contactpersoon) are not visible.
- Clicking "Zakelijk" reveals the 3 business fields immediately, no page reload; clicking back to "Particulier" hides them again.
- Checking "Afwijkend afleveradres" reveals 3 delivery-address fields immediately; unchecking hides them.
- Submitting the form with all required fields filled in replaces the entire form with the confirmation message ("Aanvraag ontvangen" / "We nemen binnen 2 werkdagen contact met u op.") — the form is gone, not just reset.
- Submitting with a required field empty shows the browser's native required-field validation (no console errors, no page navigation).
- Logging in (mock, via "Inloggen") hides "Word klant" from the nav bar, as before (unrelated to this plan, but confirms nothing regressed).
- Switching languages on `/word-klant` updates all labels, the type-toggle buttons, and the confirmation message correctly.
- Mobile width (375px): the form remains usable, no horizontal overflow.

- [ ] **Step 5: Commit**

No code changes expected in this task. If Steps 1–4 surfaced a fix, commit it with a message describing what was broken, then re-run Steps 1–4.
