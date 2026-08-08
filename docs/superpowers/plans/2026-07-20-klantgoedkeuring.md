# Klantgoedkeuring Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 20-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full customer-approval lifecycle: a business-only Word-klant form that creates a real Firebase account + Firestore application, a real customer login gate keyed on approval status, admin approve/reject in Beheer with a free-text prijsgroep field, and self-service account deletion.

**Architecture:** Extends the existing Firebase Auth + Firestore foundation (`2026-07-20-beheer-authenticatie-design.md`). Customers get real Firebase Auth accounts (same Auth instance as staff, distinguished by the absence of a `medewerkers` document) and a `klanten` Firestore document. Every Firebase session used for a customer action (register, login-check, delete) is signed out again immediately after — the only persistent customer session remains the existing local `useMockAuth` flag, now carrying the real email/uid. The mock `/account` dashboard (orders, invoices, etc.) is unchanged.

**Tech Stack:** Next.js 14 (App Router, static export), React 18, next-intl, Tailwind CSS, `firebase` (Auth + Firestore, already installed), Vitest + Testing Library.

## Global Constraints

- Site stays a fully static export (`output: 'export'`) on GitHub Pages — no server code, no API routes.
- All Firebase calls are client-side, via the modular SDK already in use (`firebase/auth`, `firebase/firestore`).
- New customer-facing UI (Word-klant changes, `/inloggen`) needs translations in all 4 locales (`nl`/`en`/`de`/`fr`), matching the rest of the customer-facing site. The `beheer` namespace and `/beheer` route stay Dutch-only, per the earlier scope decision.
- Firestore Security Rules are deny-by-default; every new rule must be added to `firestore.rules` and published to the Firebase console (manual step, no CLI in this repo).
- `prijsgroep` is a free-text field — no price-group management system exists yet (separate future sub-project).
- Out of scope: real data for bestellingen/facturen/retouren/gesprekgeschiedenis in `/account` (stays mock), a history view of handled aanvragen in Beheer, customer "forgot password", approval/rejection notifications.
- Spec: `docs/superpowers/specs/2026-07-20-klantgoedkeuring-design.md`.

---

## Task 1: Extend `useMockAuth` with email/uid, update the NavBar "Inloggen" link

**Files:**
- Modify: `src/lib/useMockAuth.tsx`
- Modify: `tests/lib/useMockAuth.test.ts`
- Modify: `src/components/NavBar.tsx`
- Modify: `tests/components/NavBar.test.tsx`

**Interfaces:**
- Produces: `useMockAuth()` → `{ isLoggedIn: boolean; isHydrated: boolean; email: string | null; uid: string | null; login(email: string, uid: string): void; logout(): void }`. Consumed by Task 4 (`CustomerLoginForm`) and Task 5 (`SettingsSection`).

This task changes `login`'s signature from zero to two required arguments, which breaks `NavBar.tsx`'s current `onClick={login}` — both files must change together.

- [ ] **Step 1: Write the failing tests**

Replace `tests/lib/useMockAuth.test.ts` with:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMockAuth, MockAuthProvider } from '@/lib/useMockAuth';

describe('useMockAuth', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts logged out and marks itself hydrated after mount', () => {
    const { result } = renderHook(() => useMockAuth(), { wrapper: MockAuthProvider });
    expect(result.current.isHydrated).toBe(true);
    expect(result.current.isLoggedIn).toBe(false);
    expect(result.current.email).toBeNull();
    expect(result.current.uid).toBeNull();
  });

  it('logs in with an email/uid and persists them to localStorage', () => {
    const { result } = renderHook(() => useMockAuth(), { wrapper: MockAuthProvider });
    act(() => {
      result.current.login('klant@example.com', 'uid-123');
    });
    expect(result.current.isLoggedIn).toBe(true);
    expect(result.current.email).toBe('klant@example.com');
    expect(result.current.uid).toBe('uid-123');
    expect(window.localStorage.getItem('glassart-mock-logged-in')).toBe('true');
    expect(window.localStorage.getItem('glassart-mock-email')).toBe('klant@example.com');
    expect(window.localStorage.getItem('glassart-mock-uid')).toBe('uid-123');
  });

  it('logs out and clears localStorage', () => {
    const { result } = renderHook(() => useMockAuth(), { wrapper: MockAuthProvider });
    act(() => {
      result.current.login('klant@example.com', 'uid-123');
    });
    act(() => {
      result.current.logout();
    });
    expect(result.current.isLoggedIn).toBe(false);
    expect(result.current.email).toBeNull();
    expect(result.current.uid).toBeNull();
    expect(window.localStorage.getItem('glassart-mock-logged-in')).toBeNull();
    expect(window.localStorage.getItem('glassart-mock-email')).toBeNull();
    expect(window.localStorage.getItem('glassart-mock-uid')).toBeNull();
  });

  it('reads a pre-existing logged-in state from localStorage on mount', () => {
    window.localStorage.setItem('glassart-mock-logged-in', 'true');
    window.localStorage.setItem('glassart-mock-email', 'klant@example.com');
    window.localStorage.setItem('glassart-mock-uid', 'uid-123');
    const { result } = renderHook(() => useMockAuth(), { wrapper: MockAuthProvider });
    expect(result.current.isLoggedIn).toBe(true);
    expect(result.current.email).toBe('klant@example.com');
    expect(result.current.uid).toBe('uid-123');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/useMockAuth.test.ts`
Expected: FAIL — `login` is called with 2 arguments but the current implementation takes 0, and `email`/`uid` don't exist on the returned value.

- [ ] **Step 3: Implement the `useMockAuth` change**

Replace `src/lib/useMockAuth.tsx` with:

```tsx
'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

const LOGGED_IN_KEY = 'glassart-mock-logged-in';
const EMAIL_KEY = 'glassart-mock-email';
const UID_KEY = 'glassart-mock-uid';

interface MockAuthValue {
  isLoggedIn: boolean;
  isHydrated: boolean;
  email: string | null;
  uid: string | null;
  login: (email: string, uid: string) => void;
  logout: () => void;
}

const MockAuthContext = createContext<MockAuthValue | null>(null);

export function MockAuthProvider({ children }: { children: ReactNode }) {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [email, setEmail] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsLoggedIn(window.localStorage.getItem(LOGGED_IN_KEY) === 'true');
    setEmail(window.localStorage.getItem(EMAIL_KEY));
    setUid(window.localStorage.getItem(UID_KEY));
    setIsHydrated(true);
  }, []);

  const login = useCallback((newEmail: string, newUid: string) => {
    window.localStorage.setItem(LOGGED_IN_KEY, 'true');
    window.localStorage.setItem(EMAIL_KEY, newEmail);
    window.localStorage.setItem(UID_KEY, newUid);
    setIsLoggedIn(true);
    setEmail(newEmail);
    setUid(newUid);
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(LOGGED_IN_KEY);
    window.localStorage.removeItem(EMAIL_KEY);
    window.localStorage.removeItem(UID_KEY);
    setIsLoggedIn(false);
    setEmail(null);
    setUid(null);
  }, []);

  const value = useMemo(
    () => ({ isLoggedIn, isHydrated, email, uid, login, logout }),
    [isLoggedIn, isHydrated, email, uid, login, logout]
  );

  return <MockAuthContext.Provider value={value}>{children}</MockAuthContext.Provider>;
}

export function useMockAuth(): MockAuthValue {
  const context = useContext(MockAuthContext);
  if (!context) {
    throw new Error('useMockAuth must be used within a MockAuthProvider');
  }
  return context;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/useMockAuth.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Update `NavBar.tsx`'s "Inloggen" button to a link**

In `src/components/NavBar.tsx`, replace:

```tsx
            <button
              type="button"
              data-testid="nav-login"
              onClick={login}
              className="btn-gold rounded-sm px-4 py-2 text-xs font-head tracking-[0.15em]"
            >
              {t('login')}
            </button>
```

with:

```tsx
            <Link
              href="/inloggen"
              data-testid="nav-login"
              className="btn-gold rounded-sm px-4 py-2 text-xs font-head tracking-[0.15em]"
            >
              {t('login')}
            </Link>
```

Also update the destructuring line — `login` is no longer used in this component:

```tsx
  const { isLoggedIn, isHydrated } = useMockAuth();
```

- [ ] **Step 6: Update `tests/components/NavBar.test.tsx`**

Replace the test `'shows a link to /account instead of "Word klant"/"Inloggen" after clicking login'` with two tests, and remove the now-unused `fireEvent` import if nothing else in the file uses it:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { NavBar } from '@/components/NavBar';
import { MockAuthProvider } from '@/lib/useMockAuth';
import messages from '../../messages/nl.json';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  usePathname: () => '/',
  useRouter: () => ({ replace: vi.fn() }),
}));

vi.mock('@/components/CartPanel', () => ({
  CartPanel: () => <div data-testid="cart-panel-stub" />,
}));

function renderNavBar() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <MockAuthProvider>
        <NavBar />
      </MockAuthProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('NavBar', () => {
  it('shows "Word klant" and "Inloggen" when logged out, no account link', () => {
    renderNavBar();
    expect(screen.getByTestId('nav-become-client')).toBeInTheDocument();
    expect(screen.getByTestId('nav-login')).toBeInTheDocument();
    expect(screen.queryByTestId('account-icon')).not.toBeInTheDocument();
  });

  it('renders Collecties as a single direct link, no dropdown', () => {
    renderNavBar();
    expect(screen.getByTestId('nav-collections')).toHaveAttribute('href', '/collecties');
    expect(screen.queryByTestId('collections-dropdown')).not.toBeInTheDocument();
  });

  it('shows the "Inloggen" link pointing to /inloggen when logged out', () => {
    renderNavBar();
    expect(screen.getByTestId('nav-login')).toHaveAttribute('href', '/inloggen');
  });

  it('shows a link to /account instead of "Word klant"/"Inloggen" when already logged in', () => {
    window.localStorage.setItem('glassart-mock-logged-in', 'true');
    renderNavBar();
    expect(screen.getByTestId('account-icon')).toHaveAttribute('href', '/account');
    expect(screen.queryByTestId('nav-become-client')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-login')).not.toBeInTheDocument();
  });

  it('points Contact at /contact and Word klant at /word-klant', () => {
    renderNavBar();
    expect(screen.getByTestId('nav-contact')).toHaveAttribute('href', '/contact');
    expect(screen.getByTestId('nav-become-client')).toHaveAttribute('href', '/word-klant');
  });

  it('renders the logo linking to the homepage', () => {
    renderNavBar();
    expect(screen.getByTestId('logo')).toHaveAttribute('href', '/');
  });

  it('shows a Beheer link pointing to /beheer', () => {
    renderNavBar();
    expect(screen.getByTestId('nav-beheer')).toHaveAttribute('href', '/beheer');
  });
});
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/components/NavBar.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 8: Commit**

```bash
git add src/lib/useMockAuth.tsx tests/lib/useMockAuth.test.ts src/components/NavBar.tsx tests/components/NavBar.test.tsx
git commit -m "feat: carry email/uid in useMockAuth, link Inloggen to /inloggen"
```

---

## Task 2: Simplify Word-klant to business-only (UI, no Firebase yet)

**Files:**
- Modify: `src/components/RegistrationForm.tsx`
- Modify: `tests/components/RegistrationForm.test.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`

**Interfaces:**
- Produces: `RegistrationForm` still shows companyName/kvk/contactPerson unconditionally; `handleSubmit` still only does client-side password-match validation and flips `isSubmitted` (Firebase wiring lands in Task 3).

- [ ] **Step 1: Write the failing tests**

Replace `tests/components/RegistrationForm.test.tsx` with:

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
  it('shows the 3 business fields as required, with no Particulier/Zakelijk toggle', () => {
    renderForm();
    expect(screen.getByTestId('word-klant-company-name')).toBeRequired();
    expect(screen.getByTestId('word-klant-kvk')).toBeRequired();
    expect(screen.getByTestId('word-klant-contact-person')).toBeRequired();
    expect(screen.queryByTestId('word-klant-type-zakelijk')).not.toBeInTheDocument();
    expect(screen.queryByTestId('word-klant-type-particulier')).not.toBeInTheDocument();
  });

  it('has no separate Naam field', () => {
    renderForm();
    expect(screen.queryByTestId('word-klant-name')).not.toBeInTheDocument();
  });

  it('marks the shared fields as required', () => {
    renderForm();
    expect(screen.getByTestId('word-klant-email')).toBeRequired();
    expect(screen.getByTestId('word-klant-phone')).toBeRequired();
    expect(screen.getByTestId('word-klant-password')).toBeRequired();
    expect(screen.getByTestId('word-klant-password-confirm')).toBeRequired();
    expect(screen.getByTestId('word-klant-address')).toBeRequired();
    expect(screen.getByTestId('word-klant-postcode')).toBeRequired();
    expect(screen.getByTestId('word-klant-city')).toBeRequired();
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

  it('shows the 3 invoice-address fields only when the "different invoice address" checkbox is checked', () => {
    renderForm();
    expect(screen.queryByTestId('word-klant-invoice-address')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('word-klant-different-invoice'));
    expect(screen.getByTestId('word-klant-invoice-address')).toBeInTheDocument();
    expect(screen.getByTestId('word-klant-invoice-postcode')).toBeInTheDocument();
    expect(screen.getByTestId('word-klant-invoice-city')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('word-klant-different-invoice'));
    expect(screen.queryByTestId('word-klant-invoice-address')).not.toBeInTheDocument();
  });

  it('renders the contact-preference select with exactly the 3 options', () => {
    renderForm();
    const select = screen.getByTestId('word-klant-contact-preference') as HTMLSelectElement;
    const optionTexts = Array.from(select.options)
      .map((option) => option.text)
      .filter((text) => text !== 'Hoe wilt u gecontacteerd worden?');
    expect(optionTexts).toEqual(['E-mail', 'Telefonisch', 'WhatsApp']);
  });

  it('shows an error and does not submit when the passwords do not match', () => {
    renderForm();
    fireEvent.change(screen.getByTestId('word-klant-password'), { target: { value: 'geheim123' } });
    fireEvent.change(screen.getByTestId('word-klant-password-confirm'), {
      target: { value: 'anderswoord' },
    });
    fireEvent.submit(screen.getByTestId('word-klant-submit').closest('form')!);
    expect(screen.getByTestId('word-klant-password-error')).toHaveTextContent(
      'Wachtwoorden komen niet overeen.'
    );
    expect(screen.queryByTestId('word-klant-confirmation')).not.toBeInTheDocument();
  });

  it('shows the confirmation screen and hides the form after submit, without a real submission', () => {
    renderForm();
    fireEvent.change(screen.getByTestId('word-klant-company-name'), {
      target: { value: 'Testbedrijf BV' },
    });
    fireEvent.change(screen.getByTestId('word-klant-kvk'), { target: { value: '12345678' } });
    fireEvent.change(screen.getByTestId('word-klant-contact-person'), {
      target: { value: 'Jan Jansen' },
    });
    fireEvent.change(screen.getByTestId('word-klant-email'), {
      target: { value: 'jan@example.com' },
    });
    fireEvent.change(screen.getByTestId('word-klant-phone'), { target: { value: '0612345678' } });
    fireEvent.change(screen.getByTestId('word-klant-password'), {
      target: { value: 'geheim123' },
    });
    fireEvent.change(screen.getByTestId('word-klant-password-confirm'), {
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

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/RegistrationForm.test.tsx`
Expected: FAIL — the toggle-button testids the removed assertions check for still exist (component not changed yet), and/or business fields aren't marked required yet since they're still conditionally rendered under "Zakelijk".

- [ ] **Step 3: Simplify `RegistrationForm.tsx`**

Replace `src/components/RegistrationForm.tsx` with:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';

export function RegistrationForm() {
  const t = useTranslations('registrationPage');
  const [showDeliveryAddress, setShowDeliveryAddress] = useState(false);
  const [showInvoiceAddress, setShowInvoiceAddress] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    if (formData.get('password') !== formData.get('passwordConfirm')) {
      setPasswordError(t('passwordMismatch'));
      return;
    }
    setPasswordError(null);
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
        <input
          type="password"
          name="password"
          required
          data-testid="word-klant-password"
          className={fieldClassName}
        />
      </label>

      <label className={labelClassName}>
        {t('labelPasswordConfirm')}
        <input
          type="password"
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

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/RegistrationForm.test.tsx`
Expected: PASS (8 tests).

- [ ] **Step 5: Remove the unused `typeParticulier`/`typeZakelijk` translation keys**

In `messages/nl.json`, inside `"registrationPage"`, delete these 2 lines:

```json
    "typeParticulier": "Particulier",
    "typeZakelijk": "Zakelijk",
```

In `messages/en.json`, delete:

```json
    "typeParticulier": "Individual",
    "typeZakelijk": "Business",
```

In `messages/de.json`, delete:

```json
    "typeParticulier": "Privat",
    "typeZakelijk": "Geschäftlich",
```

In `messages/fr.json`, delete:

```json
    "typeParticulier": "Particulier",
    "typeZakelijk": "Professionnel",
```

- [ ] **Step 6: Validate the JSON and run the full test suite**

Run: `node -e "['nl','en','de','fr'].forEach(l => JSON.parse(require('fs').readFileSync('messages/'+l+'.json','utf8')))" && npm test`
Expected: no JSON parse errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/RegistrationForm.tsx tests/components/RegistrationForm.test.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json
git commit -m "feat: simplify Word-klant form to business-only, drop Particulier"
```

---

## Task 3: Wire Word-klant submit to Firebase (account + klanten document)

**Files:**
- Modify: `src/components/RegistrationForm.tsx`
- Modify: `tests/components/RegistrationForm.test.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`

**Interfaces:**
- Consumes: `auth`, `db` from `src/lib/firebase.ts` (existing).
- Produces: on successful submit, a Firestore document at `klanten/{uid}` with `status: 'Beoordelen'`, consumed by Task 4 (login gate) and Task 6 (Beheer review).

- [ ] **Step 1: Write the failing tests**

Replace `tests/components/RegistrationForm.test.tsx` with:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { RegistrationForm } from '@/components/RegistrationForm';
import messages from '../../messages/nl.json';

const createUserMock = vi.fn();
const signOutMock = vi.fn();
const setDocMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('firebase/auth', () => ({
  createUserWithEmailAndPassword: (...args: unknown[]) => createUserMock(...args),
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  setDoc: (...args: unknown[]) => setDocMock(...args),
  serverTimestamp: () => 'MOCK_TIMESTAMP',
}));

function renderForm() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <RegistrationForm />
    </NextIntlClientProvider>
  );
}

function fillRequiredFields() {
  fireEvent.change(screen.getByTestId('word-klant-company-name'), {
    target: { value: 'Testbedrijf BV' },
  });
  fireEvent.change(screen.getByTestId('word-klant-kvk'), { target: { value: '12345678' } });
  fireEvent.change(screen.getByTestId('word-klant-contact-person'), {
    target: { value: 'Jan Jansen' },
  });
  fireEvent.change(screen.getByTestId('word-klant-email'), {
    target: { value: 'jan@example.com' },
  });
  fireEvent.change(screen.getByTestId('word-klant-phone'), { target: { value: '0612345678' } });
  fireEvent.change(screen.getByTestId('word-klant-password'), { target: { value: 'geheim123' } });
  fireEvent.change(screen.getByTestId('word-klant-password-confirm'), {
    target: { value: 'geheim123' },
  });
  fireEvent.change(screen.getByTestId('word-klant-address'), {
    target: { value: 'Teststraat 1' },
  });
  fireEvent.change(screen.getByTestId('word-klant-postcode'), { target: { value: '1234 AB' } });
  fireEvent.change(screen.getByTestId('word-klant-city'), { target: { value: 'Teststad' } });
}

beforeEach(() => {
  createUserMock.mockReset();
  signOutMock.mockReset();
  setDocMock.mockReset();
});

describe('RegistrationForm', () => {
  it('shows the 3 business fields as required, with no Particulier/Zakelijk toggle', () => {
    renderForm();
    expect(screen.getByTestId('word-klant-company-name')).toBeRequired();
    expect(screen.getByTestId('word-klant-kvk')).toBeRequired();
    expect(screen.getByTestId('word-klant-contact-person')).toBeRequired();
    expect(screen.queryByTestId('word-klant-type-zakelijk')).not.toBeInTheDocument();
    expect(screen.queryByTestId('word-klant-type-particulier')).not.toBeInTheDocument();
  });

  it('has no separate Naam field', () => {
    renderForm();
    expect(screen.queryByTestId('word-klant-name')).not.toBeInTheDocument();
  });

  it('marks the shared fields as required', () => {
    renderForm();
    expect(screen.getByTestId('word-klant-email')).toBeRequired();
    expect(screen.getByTestId('word-klant-phone')).toBeRequired();
    expect(screen.getByTestId('word-klant-password')).toBeRequired();
    expect(screen.getByTestId('word-klant-password-confirm')).toBeRequired();
    expect(screen.getByTestId('word-klant-address')).toBeRequired();
    expect(screen.getByTestId('word-klant-postcode')).toBeRequired();
    expect(screen.getByTestId('word-klant-city')).toBeRequired();
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

  it('shows the 3 invoice-address fields only when the "different invoice address" checkbox is checked', () => {
    renderForm();
    expect(screen.queryByTestId('word-klant-invoice-address')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('word-klant-different-invoice'));
    expect(screen.getByTestId('word-klant-invoice-address')).toBeInTheDocument();
    expect(screen.getByTestId('word-klant-invoice-postcode')).toBeInTheDocument();
    expect(screen.getByTestId('word-klant-invoice-city')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('word-klant-different-invoice'));
    expect(screen.queryByTestId('word-klant-invoice-address')).not.toBeInTheDocument();
  });

  it('renders the contact-preference select with exactly the 3 options', () => {
    renderForm();
    const select = screen.getByTestId('word-klant-contact-preference') as HTMLSelectElement;
    const optionTexts = Array.from(select.options)
      .map((option) => option.text)
      .filter((text) => text !== 'Hoe wilt u gecontacteerd worden?');
    expect(optionTexts).toEqual(['E-mail', 'Telefonisch', 'WhatsApp']);
  });

  it('shows an error and does not submit when the passwords do not match', () => {
    renderForm();
    fireEvent.change(screen.getByTestId('word-klant-password'), { target: { value: 'geheim123' } });
    fireEvent.change(screen.getByTestId('word-klant-password-confirm'), {
      target: { value: 'anderswoord' },
    });
    fireEvent.submit(screen.getByTestId('word-klant-submit').closest('form')!);
    expect(screen.getByTestId('word-klant-password-error')).toHaveTextContent(
      'Wachtwoorden komen niet overeen.'
    );
    expect(createUserMock).not.toHaveBeenCalled();
  });

  it('creates a Firebase account, saves a "Beoordelen" klanten document, signs out, and shows the confirmation screen', async () => {
    createUserMock.mockResolvedValue({ user: { uid: 'uid-123' } });
    setDocMock.mockResolvedValue(undefined);
    signOutMock.mockResolvedValue(undefined);
    renderForm();
    fillRequiredFields();

    fireEvent.submit(screen.getByTestId('word-klant-submit').closest('form')!);

    await waitFor(() => expect(screen.getByTestId('word-klant-confirmation')).toBeInTheDocument());

    expect(createUserMock).toHaveBeenCalledWith({}, 'jan@example.com', 'geheim123');
    expect(setDocMock).toHaveBeenCalledWith(
      { collection: 'klanten', id: 'uid-123' },
      expect.objectContaining({
        companyName: 'Testbedrijf BV',
        kvk: '12345678',
        contactPerson: 'Jan Jansen',
        email: 'jan@example.com',
        phone: '0612345678',
        address: 'Teststraat 1',
        postcode: '1234 AB',
        city: 'Teststad',
        status: 'Beoordelen',
        prijsgroep: '',
      })
    );
    expect(signOutMock).toHaveBeenCalledWith({});
  });

  it('shows a specific error when the email address is already in use', async () => {
    createUserMock.mockRejectedValue({ code: 'auth/email-already-in-use' });
    renderForm();
    fillRequiredFields();
    fireEvent.submit(screen.getByTestId('word-klant-submit').closest('form')!);
    expect(await screen.findByTestId('word-klant-submit-error')).toHaveTextContent(
      'Dit e-mailadres is al geregistreerd.'
    );
    expect(setDocMock).not.toHaveBeenCalled();
  });

  it('shows a specific error for a weak password', async () => {
    createUserMock.mockRejectedValue({ code: 'auth/weak-password' });
    renderForm();
    fillRequiredFields();
    fireEvent.submit(screen.getByTestId('word-klant-submit').closest('form')!);
    expect(await screen.findByTestId('word-klant-submit-error')).toHaveTextContent(
      'Wachtwoord moet minimaal 6 tekens bevatten.'
    );
  });

  it('shows a generic error for any other failure', async () => {
    createUserMock.mockRejectedValue({ code: 'auth/network-request-failed' });
    renderForm();
    fillRequiredFields();
    fireEvent.submit(screen.getByTestId('word-klant-submit').closest('form')!);
    expect(await screen.findByTestId('word-klant-submit-error')).toHaveTextContent(
      'Er is iets misgegaan, probeer het opnieuw.'
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/RegistrationForm.test.tsx`
Expected: FAIL — `createUserMock`/`setDocMock`/`signOutMock` are never called since `handleSubmit` doesn't call Firebase yet, and the `word-klant-submit-error` testid doesn't exist.

- [ ] **Step 3: Add the Firebase calls to `RegistrationForm.tsx`**

In `src/components/RegistrationForm.tsx`, add these imports at the top:

```tsx
import { createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
```

Add a new state next to `passwordError`:

```tsx
  const [submitError, setSubmitError] = useState<string | null>(null);
```

Replace `handleSubmit` with:

```tsx
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

    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await setDoc(doc(db, 'klanten', credential.user.uid), {
        companyName: formData.get('companyName') as string,
        kvk: formData.get('kvk') as string,
        contactPerson: formData.get('contactPerson') as string,
        email,
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
        status: 'Beoordelen',
        prijsgroep: '',
        createdAt: serverTimestamp(),
      });
      await signOut(auth);
      setIsSubmitted(true);
    } catch (error) {
      const code = (error as { code?: string }).code;
      if (code === 'auth/email-already-in-use') {
        setSubmitError(t('emailInUseError'));
      } else if (code === 'auth/weak-password') {
        setSubmitError(t('weakPasswordError'));
      } else {
        setSubmitError(t('submitError'));
      }
    }
  }
```

Add the error display right before the submit button (after the invoice-address block, before `<button type="submit" ...>`):

```tsx
      {submitError && (
        <p data-testid="word-klant-submit-error" className="text-xs text-red-400">
          {submitError}
        </p>
      )}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/RegistrationForm.test.tsx`
Expected: PASS (10 tests).

- [ ] **Step 5: Add the new translation keys**

In `messages/nl.json`, inside `"registrationPage"`, add after `"confirmationMessage"`:

```json
    "emailInUseError": "Dit e-mailadres is al geregistreerd.",
    "weakPasswordError": "Wachtwoord moet minimaal 6 tekens bevatten.",
    "submitError": "Er is iets misgegaan, probeer het opnieuw."
```

(Remember to add a trailing comma after `"confirmationMessage": "..."` in each file.)

In `messages/en.json`:

```json
    "emailInUseError": "This email address is already registered.",
    "weakPasswordError": "Password must be at least 6 characters.",
    "submitError": "Something went wrong, please try again."
```

In `messages/de.json`:

```json
    "emailInUseError": "Diese E-Mail-Adresse ist bereits registriert.",
    "weakPasswordError": "Das Passwort muss mindestens 6 Zeichen enthalten.",
    "submitError": "Etwas ist schiefgelaufen, bitte versuchen Sie es erneut."
```

In `messages/fr.json`:

```json
    "emailInUseError": "Cette adresse e-mail est déjà utilisée.",
    "weakPasswordError": "Le mot de passe doit contenir au moins 6 caractères.",
    "submitError": "Une erreur s'est produite, veuillez réessayer."
```

- [ ] **Step 6: Validate the JSON and run the full test suite**

Run: `node -e "['nl','en','de','fr'].forEach(l => JSON.parse(require('fs').readFileSync('messages/'+l+'.json','utf8')))" && npm test`
Expected: no JSON parse errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/RegistrationForm.tsx tests/components/RegistrationForm.test.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json
git commit -m "feat: create a real Firebase account + klanten document on Word-klant submit"
```

---

## Task 4: Customer login gate (`/inloggen`)

**Files:**
- Create: `src/components/CustomerLoginForm.tsx`
- Test: `tests/components/CustomerLoginForm.test.tsx`
- Create: `src/app/[locale]/inloggen/page.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`

**Interfaces:**
- Consumes: `useMockAuth()` → `login(email, uid)` (Task 1), `auth`/`db` from `src/lib/firebase.ts`.
- Produces: `CustomerLoginForm` component, consumed by the new `/inloggen` page.

- [ ] **Step 1: Write the failing tests**

Create `tests/components/CustomerLoginForm.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CustomerLoginForm } from '@/components/CustomerLoginForm';
import messages from '../../messages/nl.json';

const signInMock = vi.fn();
const signOutMock = vi.fn();
const getDocMock = vi.fn();
const loginMock = vi.fn();
const replaceMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: (...args: unknown[]) => signInMock(...args),
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
}));

vi.mock('@/lib/useMockAuth', () => ({
  useMockAuth: () => ({ login: loginMock }),
}));

vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ replace: replaceMock }),
}));

function renderForm() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerLoginForm />
    </NextIntlClientProvider>
  );
}

function submitWith(email: string, password: string) {
  fireEvent.change(screen.getByTestId('login-email'), { target: { value: email } });
  fireEvent.change(screen.getByTestId('login-password'), { target: { value: password } });
  fireEvent.submit(screen.getByTestId('login-submit').closest('form')!);
}

beforeEach(() => {
  signInMock.mockReset();
  signOutMock.mockReset();
  getDocMock.mockReset();
  loginMock.mockReset();
  replaceMock.mockReset();
});

describe('CustomerLoginForm', () => {
  it('shows a generic error when the credentials are wrong', async () => {
    signInMock.mockRejectedValue(new Error('auth/wrong-password'));
    renderForm();
    submitWith('klant@example.com', 'fout');
    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'E-mailadres of wachtwoord onjuist.'
    );
    expect(loginMock).not.toHaveBeenCalled();
  });

  it('grants access and redirects to /account when the klant is "Goedgekeurd"', async () => {
    signInMock.mockResolvedValue({ user: { uid: 'uid-1' } });
    getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ status: 'Goedgekeurd' }) });
    signOutMock.mockResolvedValue(undefined);
    renderForm();
    submitWith('klant@example.com', 'geheim123');

    await waitFor(() => expect(loginMock).toHaveBeenCalledWith('klant@example.com', 'uid-1'));
    expect(signOutMock).toHaveBeenCalledWith({});
    expect(replaceMock).toHaveBeenCalledWith('/account');
  });

  it('shows a pending message and does not grant access when status is "Beoordelen"', async () => {
    signInMock.mockResolvedValue({ user: { uid: 'uid-2' } });
    getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ status: 'Beoordelen' }) });
    signOutMock.mockResolvedValue(undefined);
    renderForm();
    submitWith('klant@example.com', 'geheim123');

    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'Uw aanvraag wordt nog beoordeeld.'
    );
    expect(loginMock).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('shows a rejected message and does not grant access when status is "Afgewezen"', async () => {
    signInMock.mockResolvedValue({ user: { uid: 'uid-3' } });
    getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ status: 'Afgewezen' }) });
    signOutMock.mockResolvedValue(undefined);
    renderForm();
    submitWith('klant@example.com', 'geheim123');

    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'Uw aanvraag is helaas afgewezen.'
    );
    expect(loginMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/CustomerLoginForm.test.tsx`
Expected: FAIL — `Cannot find module '@/components/CustomerLoginForm'`.

- [ ] **Step 3: Implement `src/components/CustomerLoginForm.tsx`**

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useMockAuth } from '@/lib/useMockAuth';
import { useRouter } from '@/i18n/navigation';

export function CustomerLoginForm() {
  const t = useTranslations('loginPage');
  const { login } = useMockAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    try {
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const uid = credential.user.uid;
      const klantDoc = await getDoc(doc(db, 'klanten', uid));
      const status = klantDoc.exists() ? (klantDoc.data() as { status?: string }).status : null;

      await signOut(auth);

      if (status === 'Goedgekeurd') {
        login(email, uid);
        router.replace('/account');
      } else if (status === 'Beoordelen') {
        setError(t('pendingMessage'));
      } else if (status === 'Afgewezen') {
        setError(t('rejectedMessage'));
      } else {
        setError(t('loginError'));
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
        <input
          type="password"
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/CustomerLoginForm.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Add the `loginPage` translation namespace**

In `messages/nl.json`, add a new top-level key (after `"registrationPage"`'s closing `},`, anywhere at the top level is fine — e.g. right before `"whyUs"`):

```json
  "loginPage": {
    "title": "Inloggen",
    "labelEmail": "E-mailadres",
    "labelPassword": "Wachtwoord",
    "submit": "Inloggen",
    "loginError": "E-mailadres of wachtwoord onjuist.",
    "pendingMessage": "Uw aanvraag wordt nog beoordeeld.",
    "rejectedMessage": "Uw aanvraag is helaas afgewezen."
  },
```

In `messages/en.json`:

```json
  "loginPage": {
    "title": "Log in",
    "labelEmail": "Email address",
    "labelPassword": "Password",
    "submit": "Log in",
    "loginError": "Email address or password is incorrect.",
    "pendingMessage": "Your application is still being reviewed.",
    "rejectedMessage": "Unfortunately, your application has been rejected."
  },
```

In `messages/de.json`:

```json
  "loginPage": {
    "title": "Anmelden",
    "labelEmail": "E-Mail-Adresse",
    "labelPassword": "Passwort",
    "submit": "Anmelden",
    "loginError": "E-Mail-Adresse oder Passwort falsch.",
    "pendingMessage": "Ihre Anfrage wird noch geprüft.",
    "rejectedMessage": "Ihre Anfrage wurde leider abgelehnt."
  },
```

In `messages/fr.json`:

```json
  "loginPage": {
    "title": "Connexion",
    "labelEmail": "Adresse e-mail",
    "labelPassword": "Mot de passe",
    "submit": "Connexion",
    "loginError": "Adresse e-mail ou mot de passe incorrect.",
    "pendingMessage": "Votre demande est en cours d'examen.",
    "rejectedMessage": "Malheureusement, votre demande a été refusée."
  },
```

- [ ] **Step 6: Create the `/inloggen` route**

Create `src/app/[locale]/inloggen/page.tsx`:

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GlassPanel } from '@/components/GlassPanel';
import { CustomerLoginForm } from '@/components/CustomerLoginForm';

export default async function InloggenPage({
  params,
}: {
  params: { locale: string };
}) {
  const { locale } = params;
  setRequestLocale(locale);
  const t = await getTranslations('loginPage');

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-ink via-charcoal to-graphite px-4 pb-16 pt-24 sm:px-8">
      <GlassPanel className="mx-auto mb-10 !max-w-lg text-center">
        <h1 className="text-2xl font-light text-white sm:text-3xl">{t('title')}</h1>
      </GlassPanel>

      <GlassPanel className="mx-auto !max-w-lg">
        <CustomerLoginForm />
      </GlassPanel>
    </main>
  );
}
```

(No dedicated test for this page — thin server-component wrapper, same pattern as `word-klant/page.tsx`.)

- [ ] **Step 7: Validate JSON, run the full test suite, and verify the build**

Run: `node -e "['nl','en','de','fr'].forEach(l => JSON.parse(require('fs').readFileSync('messages/'+l+'.json','utf8')))" && npm test && npm run build`
Expected: no JSON errors, all tests pass, build succeeds with `/nl/inloggen`, `/en/inloggen`, `/de/inloggen`, `/fr/inloggen` in the route list.

- [ ] **Step 8: Commit**

```bash
git add src/components/CustomerLoginForm.tsx tests/components/CustomerLoginForm.test.tsx src/app/[locale]/inloggen/page.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json
git commit -m "feat: add customer login gate (/inloggen) keyed on klant approval status"
```

---

## Task 5: Account deletion (Instellingen)

**Files:**
- Modify: `src/components/account/SettingsSection.tsx`
- Modify: `tests/components/account/SettingsSection.test.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`

**Interfaces:**
- Consumes: `useMockAuth()` → `email`, `uid`, `logout()` (Task 1).

- [ ] **Step 1: Write the failing tests**

Replace `tests/components/account/SettingsSection.test.tsx` with:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MockProfileProvider } from '@/lib/useMockProfile';
import { MockAuthProvider } from '@/lib/useMockAuth';
import { SettingsSection } from '@/components/account/SettingsSection';
import messages from '../../../messages/nl.json';

const replaceMock = vi.fn();
const signInMock = vi.fn();
const deleteUserMock = vi.fn();
const deleteDocMock = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/account',
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock('@/lib/firebase', () => ({
  auth: { currentUser: { uid: 'uid-1' } },
  db: {},
}));

vi.mock('firebase/auth', () => ({
  signInWithEmailAndPassword: (...args: unknown[]) => signInMock(...args),
  deleteUser: (...args: unknown[]) => deleteUserMock(...args),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
}));

function renderSection() {
  window.localStorage.setItem('glassart-mock-logged-in', 'true');
  window.localStorage.setItem('glassart-mock-email', 'klant@example.com');
  window.localStorage.setItem('glassart-mock-uid', 'uid-1');
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <MockAuthProvider>
        <MockProfileProvider>
          <SettingsSection />
        </MockProfileProvider>
      </MockAuthProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  replaceMock.mockClear();
  signInMock.mockReset();
  deleteUserMock.mockReset();
  deleteDocMock.mockReset();
});

describe('SettingsSection', () => {
  it('pre-fills fields from the seeded mock profile', () => {
    renderSection();
    expect(screen.getByTestId('settings-company-name')).toHaveValue('Hotel De Zilveren Zwaan');
    expect(screen.getByTestId('settings-email')).toHaveValue('anne@dezilverenzwaan.nl');
    expect(screen.getByTestId('settings-contact-preference')).toHaveValue('email');
    expect(screen.getByTestId('settings-language-preference')).toHaveValue('nl');
  });

  it('shows a password-mismatch error and does not save when passwords differ', () => {
    renderSection();
    fireEvent.change(screen.getByTestId('settings-password'), { target: { value: 'nieuw123' } });
    fireEvent.change(screen.getByTestId('settings-password-confirm'), {
      target: { value: 'anders123' },
    });
    fireEvent.click(screen.getByTestId('settings-submit'));
    expect(screen.getByTestId('settings-password-error')).toHaveTextContent(
      'Wachtwoorden komen niet overeen.'
    );
    expect(screen.queryByTestId('settings-saved')).not.toBeInTheDocument();
  });

  it('saves profile changes and shows a saved confirmation', () => {
    renderSection();
    fireEvent.change(screen.getByTestId('settings-email'), {
      target: { value: 'nieuw@example.com' },
    });
    fireEvent.click(screen.getByTestId('settings-submit'));
    expect(screen.getByTestId('settings-saved')).toBeInTheDocument();
    const stored = JSON.parse(window.localStorage.getItem('glassart-mock-profile') ?? '{}');
    expect(stored.email).toBe('nieuw@example.com');
  });

  it('switches the site locale via router.replace when languagePreference changes', () => {
    renderSection();
    fireEvent.change(screen.getByTestId('settings-language-preference'), {
      target: { value: 'en' },
    });
    fireEvent.click(screen.getByTestId('settings-submit'));
    expect(replaceMock).toHaveBeenCalledWith('/account', { locale: 'en' });
  });

  it('does not call router.replace when languagePreference is left unchanged', () => {
    renderSection();
    fireEvent.click(screen.getByTestId('settings-submit'));
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('shows an error and deletes nothing when the confirmation password is wrong', async () => {
    signInMock.mockRejectedValue(new Error('auth/wrong-password'));
    renderSection();
    fireEvent.change(screen.getByTestId('delete-account-password'), {
      target: { value: 'fout' },
    });
    fireEvent.click(screen.getByTestId('delete-account-submit'));
    expect(await screen.findByTestId('delete-account-error')).toBeInTheDocument();
    expect(deleteDocMock).not.toHaveBeenCalled();
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it('re-authenticates, deletes the klant document and Firebase account, logs out and redirects home', async () => {
    signInMock.mockResolvedValue({ user: { uid: 'uid-1' } });
    deleteDocMock.mockResolvedValue(undefined);
    deleteUserMock.mockResolvedValue(undefined);
    renderSection();
    fireEvent.change(screen.getByTestId('delete-account-password'), {
      target: { value: 'geheim123' },
    });
    fireEvent.click(screen.getByTestId('delete-account-submit'));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));

    expect(signInMock).toHaveBeenCalledWith({}, 'klant@example.com', 'geheim123');
    expect(deleteDocMock).toHaveBeenCalledWith({ collection: 'klanten', id: 'uid-1' });
    expect(deleteUserMock).toHaveBeenCalledWith({ uid: 'uid-1' });
    expect(window.localStorage.getItem('glassart-mock-logged-in')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/account/SettingsSection.test.tsx`
Expected: FAIL — the `delete-account-*` testids don't exist yet, and rendering fails because `MockAuthProvider` isn't wrapped around the component yet in the source (the test wraps it, but `SettingsSection` doesn't call `useMockAuth()` yet, so that part alone won't fail — the missing testids are what fail).

- [ ] **Step 3: Add the delete-account subsection to `SettingsSection.tsx`**

Add these imports at the top of `src/components/account/SettingsSection.tsx`:

```tsx
import { signInWithEmailAndPassword, deleteUser } from 'firebase/auth';
import { doc, deleteDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useMockAuth } from '@/lib/useMockAuth';
```

Inside the `SettingsSection` function, add right after the existing `useMockProfile()` line:

```tsx
  const { email: authEmail, uid, logout } = useMockAuth();
```

Add new state, right after `isSaved`:

```tsx
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteError, setDeleteError] = useState<string | null>(null);
```

Add a new handler, right after `handleSubmit`:

```tsx
  async function handleDeleteAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setDeleteError(null);
    try {
      await signInWithEmailAndPassword(auth, authEmail ?? '', deletePassword);
      await deleteDoc(doc(db, 'klanten', uid ?? ''));
      if (auth.currentUser) {
        await deleteUser(auth.currentUser);
      }
      logout();
      router.replace('/');
    } catch {
      setDeleteError(t('deleteAccountError'));
    }
  }
```

Change the component's `return` to wrap the existing form and a new one in a fragment, and add the new form after the existing one:

```tsx
  return (
    <div className="flex flex-col gap-8">
      <form
        onSubmit={handleSubmit}
        data-testid="settings-section"
        className="flex flex-col gap-4 text-sm text-white/80"
      >
```

(everything currently inside the form stays exactly as-is up to its closing `</form>`), then immediately after that closing `</form>` add:

```tsx
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
```

(The closing `</div>` replaces what was previously the final `</form>` of the whole component — the first `</form>` now closes only the settings form.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/account/SettingsSection.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 5: Add the new translation keys**

In `messages/nl.json`, inside `"accountPage"."settings"`, add after `"saved": "Opgeslagen!"` (remember the trailing comma):

```json
      "deleteAccountTitle": "Account verwijderen",
      "deleteAccountLabelPassword": "Wachtwoord (ter bevestiging)",
      "deleteAccountSubmit": "Definitief verwijderen",
      "deleteAccountError": "Wachtwoord onjuist, account niet verwijderd."
```

In `messages/en.json`:

```json
      "deleteAccountTitle": "Delete account",
      "deleteAccountLabelPassword": "Password (to confirm)",
      "deleteAccountSubmit": "Permanently delete",
      "deleteAccountError": "Incorrect password, account not deleted."
```

In `messages/de.json`:

```json
      "deleteAccountTitle": "Konto löschen",
      "deleteAccountLabelPassword": "Passwort (zur Bestätigung)",
      "deleteAccountSubmit": "Endgültig löschen",
      "deleteAccountError": "Falsches Passwort, Konto wurde nicht gelöscht."
```

In `messages/fr.json`:

```json
      "deleteAccountTitle": "Supprimer le compte",
      "deleteAccountLabelPassword": "Mot de passe (pour confirmer)",
      "deleteAccountSubmit": "Supprimer définitivement",
      "deleteAccountError": "Mot de passe incorrect, compte non supprimé."
```

- [ ] **Step 6: Validate the JSON and run the full test suite**

Run: `node -e "['nl','en','de','fr'].forEach(l => JSON.parse(require('fs').readFileSync('messages/'+l+'.json','utf8')))" && npm test`
Expected: no JSON errors, all tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/account/SettingsSection.tsx tests/components/account/SettingsSection.test.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json
git commit -m "feat: add re-authenticated account deletion to Instellingen"
```

---

## Task 6: Beheer — klantaanvragen beoordelen

**Files:**
- Create: `src/components/beheer/KlantAanvragenSection.tsx`
- Test: `tests/components/beheer/KlantAanvragenSection.test.tsx`
- Modify: `src/components/beheer/AdminDashboard.tsx`
- Modify: `tests/components/beheer/AdminDashboard.test.tsx`
- Modify: `messages/nl.json` (Dutch-only `beheer` namespace)

**Interfaces:**
- Consumes: `db` from `src/lib/firebase.ts`.
- Produces: `KlantAanvragenSection` component, rendered inside `AdminDashboard`'s authorized branch.

- [ ] **Step 1: Write the failing tests**

Create `tests/components/beheer/KlantAanvragenSection.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { KlantAanvragenSection } from '@/components/beheer/KlantAanvragenSection';
import messages from '../../../messages/nl.json';

const getDocsMock = vi.fn();
const updateDocMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ name })),
  query: vi.fn((ref, whereClause) => ({ ref, whereClause })),
  where: vi.fn((field, op, value) => ({ field, op, value })),
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  updateDoc: (...args: unknown[]) => updateDocMock(...args),
}));

function makeSnapshot(docsData: Array<{ id: string; data: Record<string, unknown> }>) {
  return {
    docs: docsData.map(({ id, data }) => ({
      id,
      data: () => data,
    })),
  };
}

function renderSection() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <KlantAanvragenSection />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  getDocsMock.mockReset();
  updateDocMock.mockReset();
});

describe('KlantAanvragenSection', () => {
  it('shows an empty-state message when there are no pending aanvragen', async () => {
    getDocsMock.mockResolvedValue(makeSnapshot([]));
    renderSection();
    expect(await screen.findByTestId('klantaanvragen-empty')).toBeInTheDocument();
  });

  it('shows each pending aanvraag with its data', async () => {
    getDocsMock.mockResolvedValue(
      makeSnapshot([
        {
          id: 'uid-1',
          data: {
            companyName: 'Testbedrijf BV',
            kvk: '12345678',
            contactPerson: 'Jan Jansen',
            email: 'jan@example.com',
            phone: '0612345678',
            contactPreference: 'email',
            address: 'Teststraat 1',
            postcode: '1234 AB',
            city: 'Teststad',
          },
        },
      ])
    );
    renderSection();
    expect(await screen.findByTestId('klantaanvraag-uid-1')).toHaveTextContent('Testbedrijf BV');
  });

  it('disables Goedkeuren until a prijsgroep is filled in, then approves and removes the row', async () => {
    getDocsMock.mockResolvedValue(
      makeSnapshot([
        {
          id: 'uid-1',
          data: {
            companyName: 'Testbedrijf BV',
            kvk: '12345678',
            contactPerson: 'Jan Jansen',
            email: 'jan@example.com',
            phone: '0612345678',
            contactPreference: 'email',
            address: 'Teststraat 1',
            postcode: '1234 AB',
            city: 'Teststad',
          },
        },
      ])
    );
    updateDocMock.mockResolvedValue(undefined);
    renderSection();
    await screen.findByTestId('klantaanvraag-uid-1');

    expect(screen.getByTestId('klantaanvraag-goedkeuren-uid-1')).toBeDisabled();

    fireEvent.change(screen.getByTestId('klantaanvraag-prijsgroep-uid-1'), {
      target: { value: 'Standaard' },
    });
    expect(screen.getByTestId('klantaanvraag-goedkeuren-uid-1')).not.toBeDisabled();

    fireEvent.click(screen.getByTestId('klantaanvraag-goedkeuren-uid-1'));

    await waitFor(() =>
      expect(updateDocMock).toHaveBeenCalledWith(
        { collectionName: 'klanten', id: 'uid-1' },
        { status: 'Goedgekeurd', prijsgroep: 'Standaard' }
      )
    );
    await waitFor(() => expect(screen.queryByTestId('klantaanvraag-uid-1')).not.toBeInTheDocument());
  });

  it('rejects and removes the row when Afwijzen is clicked', async () => {
    getDocsMock.mockResolvedValue(
      makeSnapshot([
        {
          id: 'uid-2',
          data: {
            companyName: 'Ander Bedrijf',
            kvk: '87654321',
            contactPerson: 'Piet Pietersen',
            email: 'piet@example.com',
            phone: '0698765432',
            contactPreference: 'phone',
            address: 'Anderstraat 2',
            postcode: '4321 BA',
            city: 'Anderstad',
          },
        },
      ])
    );
    updateDocMock.mockResolvedValue(undefined);
    renderSection();
    await screen.findByTestId('klantaanvraag-uid-2');

    fireEvent.click(screen.getByTestId('klantaanvraag-afwijzen-uid-2'));

    await waitFor(() =>
      expect(updateDocMock).toHaveBeenCalledWith(
        { collectionName: 'klanten', id: 'uid-2' },
        { status: 'Afgewezen' }
      )
    );
    await waitFor(() => expect(screen.queryByTestId('klantaanvraag-uid-2')).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/KlantAanvragenSection.test.tsx`
Expected: FAIL — `Cannot find module '@/components/beheer/KlantAanvragenSection'`.

- [ ] **Step 3: Implement `src/components/beheer/KlantAanvragenSection.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { collection, doc, getDocs, query, updateDoc, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

interface KlantAanvraag {
  id: string;
  companyName: string;
  kvk: string;
  contactPerson: string;
  email: string;
  phone: string;
  contactPreference: string;
  address: string;
  postcode: string;
  city: string;
}

export function KlantAanvragenSection() {
  const t = useTranslations('beheer');
  const [aanvragen, setAanvragen] = useState<KlantAanvraag[] | null>(null);
  const [prijsgroepen, setPrijsgroepen] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    async function loadAanvragen() {
      const snapshot = await getDocs(
        query(collection(db, 'klanten'), where('status', '==', 'Beoordelen'))
      );
      if (cancelled) return;
      setAanvragen(
        snapshot.docs.map((docSnapshot) => {
          const data = docSnapshot.data();
          return {
            id: docSnapshot.id,
            companyName: data.companyName,
            kvk: data.kvk,
            contactPerson: data.contactPerson,
            email: data.email,
            phone: data.phone,
            contactPreference: data.contactPreference,
            address: data.address,
            postcode: data.postcode,
            city: data.city,
          };
        })
      );
    }
    loadAanvragen();
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleGoedkeuren(id: string) {
    const prijsgroep = prijsgroepen[id] ?? '';
    await updateDoc(doc(db, 'klanten', id), { status: 'Goedgekeurd', prijsgroep });
    setAanvragen((current) => (current ?? []).filter((aanvraag) => aanvraag.id !== id));
  }

  async function handleAfwijzen(id: string) {
    await updateDoc(doc(db, 'klanten', id), { status: 'Afgewezen' });
    setAanvragen((current) => (current ?? []).filter((aanvraag) => aanvraag.id !== id));
  }

  if (aanvragen === null) {
    return null;
  }

  if (aanvragen.length === 0) {
    return (
      <p data-testid="klantaanvragen-empty" className="text-sm text-white/60">
        {t('klantaanvragenEmpty')}
      </p>
    );
  }

  return (
    <div data-testid="klantaanvragen-section" className="flex flex-col gap-6">
      <h2 className="text-lg text-white">{t('klantaanvragenTitle')}</h2>
      {aanvragen.map((aanvraag) => (
        <div
          key={aanvraag.id}
          data-testid={`klantaanvraag-${aanvraag.id}`}
          className="flex flex-col gap-2 rounded-sm border border-white/10 p-4 text-sm text-white/80"
        >
          <p>
            {aanvraag.companyName} — {aanvraag.kvk}
          </p>
          <p>{aanvraag.contactPerson}</p>
          <p>
            {aanvraag.email} — {aanvraag.phone}
          </p>
          <p>
            {aanvraag.address}, {aanvraag.postcode} {aanvraag.city}
          </p>
          <p>
            {t('klantaanvragenContactPreference')}: {aanvraag.contactPreference}
          </p>

          <label className="flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60">
            {t('klantaanvragenLabelPrijsgroep')}
            <input
              type="text"
              value={prijsgroepen[aanvraag.id] ?? ''}
              onChange={(event) =>
                setPrijsgroepen((current) => ({ ...current, [aanvraag.id]: event.target.value }))
              }
              data-testid={`klantaanvraag-prijsgroep-${aanvraag.id}`}
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleGoedkeuren(aanvraag.id)}
              disabled={!prijsgroepen[aanvraag.id]}
              data-testid={`klantaanvraag-goedkeuren-${aanvraag.id}`}
              className="rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink disabled:opacity-40"
            >
              {t('klantaanvragenGoedkeuren')}
            </button>
            <button
              type="button"
              onClick={() => handleAfwijzen(aanvraag.id)}
              data-testid={`klantaanvraag-afwijzen-${aanvraag.id}`}
              className="rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
            >
              {t('klantaanvragenAfwijzen')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/KlantAanvragenSection.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire `KlantAanvragenSection` into `AdminDashboard.tsx`**

In `src/components/beheer/AdminDashboard.tsx`, add the import:

```tsx
import { KlantAanvragenSection } from './KlantAanvragenSection';
```

Add `<KlantAanvragenSection />` right after the logout button, still inside the authorized `return`:

```tsx
  return (
    <div data-testid="beheer-dashboard" className="flex flex-col gap-4 text-sm text-white/80">
      <p data-testid="beheer-logged-in-as">{t('loggedInAs', { email: user.email ?? '' })}</p>
      <button
        type="button"
        onClick={() => logout()}
        data-testid="beheer-logout"
        className="self-start rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
      >
        {t('logout')}
      </button>
      <KlantAanvragenSection />
    </div>
  );
```

- [ ] **Step 6: Update `AdminDashboard.test.tsx` to mock Firestore**

Replace `tests/components/beheer/AdminDashboard.test.tsx` with:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AdminDashboard } from '@/components/beheer/AdminDashboard';
import messages from '../../../messages/nl.json';

const logoutMock = vi.fn();
const getDocsMock = vi.fn();
let mockAuthState: {
  user: { uid: string; email: string | null } | null;
  isAdmin: boolean;
  isHydrated: boolean;
};

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({
    ...mockAuthState,
    login: vi.fn(),
    resetPassword: vi.fn(),
    logout: logoutMock,
  }),
}));

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ name })),
  query: vi.fn((ref, whereClause) => ({ ref, whereClause })),
  where: vi.fn((field, op, value) => ({ field, op, value })),
  doc: vi.fn((_db, collectionName, id) => ({ collectionName, id })),
  getDocs: (...args: unknown[]) => getDocsMock(...args),
  updateDoc: vi.fn(),
}));

function renderDashboard() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <AdminDashboard />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  logoutMock.mockReset();
  getDocsMock.mockReset();
  getDocsMock.mockResolvedValue({ docs: [] });
});

describe('AdminDashboard', () => {
  it('renders nothing while not hydrated', () => {
    mockAuthState = { user: null, isAdmin: false, isHydrated: false };
    renderDashboard();
    expect(screen.queryByTestId('beheer-login-email')).not.toBeInTheDocument();
    expect(screen.queryByTestId('beheer-dashboard')).not.toBeInTheDocument();
  });

  it('shows the login form when hydrated with no user', () => {
    mockAuthState = { user: null, isAdmin: false, isHydrated: true };
    renderDashboard();
    expect(screen.getByTestId('beheer-login-email')).toBeInTheDocument();
  });

  it('shows the dashboard shell with the logged-in email when authorized', async () => {
    mockAuthState = {
      user: { uid: 'uid-1', email: 'paul@glassartanddesign.com' },
      isAdmin: true,
      isHydrated: true,
    };
    renderDashboard();
    expect(screen.getByTestId('beheer-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('beheer-logged-in-as')).toHaveTextContent(
      'paul@glassartanddesign.com'
    );
    await waitFor(() => expect(getDocsMock).toHaveBeenCalled());
  });

  it('shows an access-denied message and signs out when logged in without a medewerkers document', async () => {
    mockAuthState = {
      user: { uid: 'uid-2', email: 'onbekend@glassartanddesign.com' },
      isAdmin: false,
      isHydrated: true,
    };
    renderDashboard();
    expect(screen.getByTestId('beheer-unauthorized')).toBeInTheDocument();
    expect(screen.queryByTestId('beheer-login-email')).not.toBeInTheDocument();
    await waitFor(() => expect(logoutMock).toHaveBeenCalled());
  });
});
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/`
Expected: PASS (all tests in both `AdminDashboard.test.tsx` and `KlantAanvragenSection.test.tsx`).

- [ ] **Step 8: Add the new (Dutch-only) `beheer` translation keys**

In `messages/nl.json`, inside `"beheer"`, add after `"logout": "Uitloggen"` (remember the trailing comma):

```json
    "klantaanvragenTitle": "Klantaanvragen",
    "klantaanvragenEmpty": "Geen openstaande klantaanvragen.",
    "klantaanvragenContactPreference": "Contactvoorkeur",
    "klantaanvragenLabelPrijsgroep": "Prijsgroep",
    "klantaanvragenGoedkeuren": "Goedkeuren",
    "klantaanvragenAfwijzen": "Afwijzen"
```

- [ ] **Step 9: Validate the JSON and run the full test suite**

Run: `node -e "JSON.parse(require('fs').readFileSync('messages/nl.json','utf8'))" && npm test`
Expected: no JSON errors, all tests pass.

- [ ] **Step 10: Commit**

```bash
git add src/components/beheer/KlantAanvragenSection.tsx tests/components/beheer/KlantAanvragenSection.test.tsx src/components/beheer/AdminDashboard.tsx tests/components/beheer/AdminDashboard.test.tsx messages/nl.json
git commit -m "feat: add klantaanvragen review (goedkeuren/afwijzen) to Beheer"
```

---

## Task 7: Firestore Security Rules + final verification

**Files:**
- Modify: `firestore.rules`

- [ ] **Step 1: Add the `klanten` rules**

Replace `firestore.rules` with:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /medewerkers/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow write: if false;
    }
    match /klanten/{uid} {
      allow create: if request.auth != null && request.auth.uid == uid;
      allow read: if request.auth != null &&
        (request.auth.uid == uid || exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid)));
      allow update: if request.auth != null && exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid));
      allow delete: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

```bash
git add firestore.rules
git commit -m "docs: add Firestore security rules for the klanten collection"
```

- [ ] **Step 2: Paste the rules into the Firebase console (manual step)**

- Go to [console.firebase.google.com](https://console.firebase.google.com/project/glassart-and-design/firestore) → **Firestore Database** → tab **"Rules"**.
- Replace the existing content with the contents of `firestore.rules` above (this adds the `klanten` block alongside the existing `medewerkers` block — don't remove the latter).
- Click **"Publish"**.

- [ ] **Step 3: Run the full test suite and a production build**

Run: `npm test && npm run build`
Expected: all tests pass, build succeeds, and the route list includes `/nl/inloggen`, `/en/inloggen`, `/de/inloggen`, `/fr/inloggen` (all 4 locales) alongside the unchanged Dutch-only `/nl/beheer`.

- [ ] **Step 4: End-to-end manual verification (after deploying)**

- On the live Word-klant page: submit a business application with a real email/password — confirm the confirmation screen shows and a `klanten` document with `status: "Beoordelen"` appears in the Firebase console.
- On `/beheer`: confirm the new application shows up, that "Goedkeuren" stays disabled until a prijsgroep is typed in, and that clicking it flips the status to "Goedgekeurd" in Firestore.
- On `/inloggen`, with that same account: confirm login now succeeds and lands on `/account` (the existing mock dashboard).
- In Instellingen: confirm "Definitief verwijderen" with the correct password removes the `klanten` document and the Firebase Auth user, and returns to the homepage logged out.
