# Bestelling afronden schrijft naar Firestore Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 21-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A logged-in, approved customer can complete checkout, writing a real `bestelheaders` document plus one `bestellines` subdocument per cart line to Firestore; an anonymous visitor can still fill the cart but must log in to complete it.

**Architecture:** A new `useCustomerAuth` hook (mirroring the existing `useAdminAuth.tsx` pattern: `onAuthStateChanged` + a Firestore status check) replaces the purely-local `useMockAuth`, giving the whole site a real, persistent Firebase session for customers. Every current `useMockAuth` consumer switches to it in one pass. `CartPanel` then becomes the first new consumer: it gates "Bestelling afronden" on that session and, on success, writes directly to Firestore via the client SDK (same pattern as the existing `klanten` writes) instead of the old mock `useOrders`/localStorage call.

**Tech Stack:** Next.js 14 (App Router), React 18, `firebase` (Auth + Firestore client SDK), `next-intl`, Vitest + Testing Library.

## Global Constraints

- Collections: `bestelheaders` (top-level) and `bestellines` (subcollection: `bestelheaders/{id}/bestellines/{lineId}`).
- `bestelheaders` fields: `klantId` (string, = the Firebase Auth uid), `besteldatum` (Firestore `serverTimestamp()`), `status` (exactly the string `'Te beoordelen'`).
- `bestellines` fields: `kunstwerkId`, `maatId`, `materiaalId` — all `null` for now (the underlying tables don't exist yet); `quantity` (number, from the cart line).
- Security rules: a klant may create/read only their own `bestelheaders`/`bestellines`; a `medewerkers` document holder may read all; nobody may update or delete (no order-management feature exists yet).
- The existing mock order placement (`useOrders`, `useAllOrders`, "Mijn bestellingen" in `/account`) stays exactly as-is as a hook/page, but `CartPanel` no longer calls `useOrders().placeOrder(...)` — checkout only writes to Firestore now.
- `useMockAuth.tsx` and `MockAuthProvider` are deleted entirely once every consumer has switched to `useCustomerAuth`/`CustomerAuthProvider`.
- Spec reference: `docs/superpowers/specs/2026-07-21-bestelling-firestore-design.md`.

---

### Task 1: Add `useCustomerAuth` — real, persistent customer session

**Files:**
- Create: `src/lib/useCustomerAuth.tsx`
- Test: `tests/lib/useCustomerAuth.test.tsx`

**Interfaces:**
- Consumes: nothing new (uses `auth`/`db` from `src/lib/firebase.ts`, already exported).
- Produces: `CustomerAuthProvider` (React context provider) and `useCustomerAuth(): { user: { uid: string; email: string | null } | null; isCustomer: boolean; isHydrated: boolean; logout: () => Promise<void> }`, exported from `src/lib/useCustomerAuth.tsx`. Task 2 consumes both; Task 3 consumes `useCustomerAuth`.

This task only adds the new hook — it does not touch any existing file, so `useMockAuth` keeps working in parallel until Task 2 switches every consumer over.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/useCustomerAuth.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { CustomerAuthProvider, useCustomerAuth } from '@/lib/useCustomerAuth';

const onAuthStateChangedMock = vi.fn();
const signOutMock = vi.fn();
const getDocMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => onAuthStateChangedMock(...args),
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
}));

function TestConsumer() {
  const { user, isCustomer, isHydrated } = useCustomerAuth();
  if (!isHydrated) return <div data-testid="loading" />;
  return (
    <div>
      <div data-testid="user">{user ? user.email : 'none'}</div>
      <div data-testid="is-customer">{String(isCustomer)}</div>
    </div>
  );
}

function renderProvider() {
  return render(
    <CustomerAuthProvider>
      <TestConsumer />
    </CustomerAuthProvider>
  );
}

beforeEach(() => {
  onAuthStateChangedMock.mockReset();
  signOutMock.mockReset();
  getDocMock.mockReset();
});

describe('useCustomerAuth', () => {
  it('reports isHydrated with no user when signed out', async () => {
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback(null);
      return () => {};
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('user')).toBeInTheDocument());
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(screen.getByTestId('is-customer')).toHaveTextContent('false');
  });

  it('reports isCustomer true when the klanten document has status "Goedgekeurd"', async () => {
    getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ status: 'Goedgekeurd' }) });
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-1', email: 'klant@example.com' });
      return () => {};
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('is-customer')).toHaveTextContent('true'));
    expect(screen.getByTestId('user')).toHaveTextContent('klant@example.com');
  });

  it('reports isCustomer false when the klanten document has a different status', async () => {
    getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ status: 'Beoordelen' }) });
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-2', email: 'klant2@example.com' });
      return () => {};
    });
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent('klant2@example.com')
    );
    expect(screen.getByTestId('is-customer')).toHaveTextContent('false');
  });

  it('reports isCustomer false when no klanten document exists', async () => {
    getDocMock.mockResolvedValue({ exists: () => false });
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-3', email: 'klant3@example.com' });
      return () => {};
    });
    renderProvider();
    await waitFor(() =>
      expect(screen.getByTestId('user')).toHaveTextContent('klant3@example.com')
    );
    expect(screen.getByTestId('is-customer')).toHaveTextContent('false');
  });

  it('calls the real signOut', async () => {
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback(null);
      return () => {};
    });
    signOutMock.mockResolvedValue(undefined);
    let hookValue: ReturnType<typeof useCustomerAuth> | null = null;
    function Capture() {
      hookValue = useCustomerAuth();
      return null;
    }
    render(
      <CustomerAuthProvider>
        <Capture />
      </CustomerAuthProvider>
    );
    await waitFor(() => expect(hookValue?.isHydrated).toBe(true));
    await hookValue!.logout();
    expect(signOutMock).toHaveBeenCalledWith({});
  });
});
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx vitest run tests/lib/useCustomerAuth.test.tsx`
Expected: FAIL — `Cannot find module '@/lib/useCustomerAuth'`.

- [ ] **Step 3: Implement the hook**

Create `src/lib/useCustomerAuth.tsx`:

```tsx
'use client';

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { onAuthStateChanged, signOut as firebaseSignOut, type User } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

interface CustomerUser {
  uid: string;
  email: string | null;
}

interface CustomerAuthValue {
  user: CustomerUser | null;
  isCustomer: boolean;
  isHydrated: boolean;
  logout: () => Promise<void>;
}

const CustomerAuthContext = createContext<CustomerAuthValue | null>(null);

export function CustomerAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CustomerUser | null>(null);
  const [isCustomer, setIsCustomer] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      if (!firebaseUser) {
        setUser(null);
        setIsCustomer(false);
        setIsHydrated(true);
        return;
      }
      const klantDoc = await getDoc(doc(db, 'klanten', firebaseUser.uid));
      const status = klantDoc.exists() ? (klantDoc.data() as { status?: string }).status : null;
      setUser({ uid: firebaseUser.uid, email: firebaseUser.email });
      setIsCustomer(status === 'Goedgekeurd');
      setIsHydrated(true);
    });
  }, []);

  const value = useMemo<CustomerAuthValue>(
    () => ({
      user,
      isCustomer,
      isHydrated,
      logout: async () => {
        await firebaseSignOut(auth);
      },
    }),
    [user, isCustomer, isHydrated]
  );

  return <CustomerAuthContext.Provider value={value}>{children}</CustomerAuthContext.Provider>;
}

export function useCustomerAuth(): CustomerAuthValue {
  const context = useContext(CustomerAuthContext);
  if (!context) {
    throw new Error('useCustomerAuth must be used within a CustomerAuthProvider');
  }
  return context;
}
```

- [ ] **Step 4: Run it to confirm it passes**

Run: `npx vitest run tests/lib/useCustomerAuth.test.tsx`
Expected: PASS — all 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/useCustomerAuth.tsx tests/lib/useCustomerAuth.test.tsx
git commit -m "$(cat <<'EOF'
feat: add useCustomerAuth hook (real, persistent klant session)

Mirrors useAdminAuth: onAuthStateChanged + a klanten/{uid} status
check, exposing isCustomer (status === 'Goedgekeurd'). Additive only
-- no existing consumer switches over yet.
EOF
)"
```

---

### Task 2: Migrate every `useMockAuth` consumer to `useCustomerAuth`, delete `useMockAuth`

**Files:**
- Modify: `src/app/[locale]/layout.tsx`
- Modify: `src/components/NavBar.tsx`
- Modify: `src/components/account/AccountDashboard.tsx`
- Modify: `src/components/account/AccountNav.tsx`
- Modify: `src/components/account/SettingsSection.tsx`
- Modify: `src/components/BecomeClientCta.tsx`
- Modify: `src/components/CustomerLoginForm.tsx`
- Modify: `tests/components/NavBar.test.tsx`
- Modify: `tests/components/account/AccountDashboard.test.tsx`
- Modify: `tests/components/account/AccountNav.test.tsx`
- Modify: `tests/components/account/SettingsSection.test.tsx`
- Modify: `tests/components/BecomeClientCta.test.tsx`
- Modify: `tests/components/CustomerLoginForm.test.tsx`
- Delete: `src/lib/useMockAuth.tsx`
- Delete: `tests/lib/useMockAuth.test.ts`

**Interfaces:**
- Consumes: `useCustomerAuth`/`CustomerAuthProvider` from Task 1.
- Produces: no new exports — every file's public shape (props, rendered testids) stays identical; only the auth source changes.

This is one mechanical migration applied to 7 files: swap the import, swap the destructured fields (`isLoggedIn`→`isCustomer`, `email`/`uid`→`user.email`/`user.uid`), and where `CustomerLoginForm` used to call `useMockAuth().login(...)` then unconditionally sign out, it now keeps the real Firebase session alive for an approved klant and only signs out for every other outcome.

- [ ] **Step 1: Provider wiring**

In `src/app/[locale]/layout.tsx`, replace:

```tsx
import { MockAuthProvider } from '@/lib/useMockAuth';
```

with:

```tsx
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
```

And replace the two `<MockAuthProvider>`/`</MockAuthProvider>` tags with `<CustomerAuthProvider>`/`</CustomerAuthProvider>` (same nesting position, directly inside `<AdminAuthProvider>`):

```tsx
  return (
    <NextIntlClientProvider messages={messages}>
      <AdminAuthProvider>
        <CustomerAuthProvider>
          <CartProvider>
            <OrdersProvider>
              <ReturnsProvider>
                <MockProfileProvider>
                  <NavBar />
                  {children}
                </MockProfileProvider>
              </ReturnsProvider>
            </OrdersProvider>
          </CartProvider>
        </CustomerAuthProvider>
      </AdminAuthProvider>
    </NextIntlClientProvider>
  );
```

- [ ] **Step 2: `NavBar.tsx`**

Replace line 5:

```tsx
import { useMockAuth } from '@/lib/useMockAuth';
```

with:

```tsx
import { useCustomerAuth } from '@/lib/useCustomerAuth';
```

Replace line 12:

```tsx
  const { isLoggedIn, isHydrated } = useMockAuth();
```

with:

```tsx
  const { isCustomer, isHydrated } = useCustomerAuth();
```

Replace line 35:

```tsx
        {isHydrated && isLoggedIn ? (
```

with:

```tsx
        {isHydrated && isCustomer ? (
```

- [ ] **Step 3: `AccountDashboard.tsx`**

Replace line 4:

```tsx
import { useMockAuth } from '@/lib/useMockAuth';
```

with:

```tsx
import { useCustomerAuth } from '@/lib/useCustomerAuth';
```

Replace line 25:

```tsx
  const { isLoggedIn, isHydrated } = useMockAuth();
```

with:

```tsx
  const { isCustomer, isHydrated } = useCustomerAuth();
```

Replace line 30:

```tsx
    if (isHydrated && !isLoggedIn) {
```

with:

```tsx
    if (isHydrated && !isCustomer) {
```

Replace line 35:

```tsx
  if (!isHydrated || !isLoggedIn) {
```

with:

```tsx
  if (!isHydrated || !isCustomer) {
```

- [ ] **Step 4: `AccountNav.tsx`**

Replace line 4:

```tsx
import { useMockAuth } from '@/lib/useMockAuth';
```

with:

```tsx
import { useCustomerAuth } from '@/lib/useCustomerAuth';
```

Replace line 30:

```tsx
  const { logout } = useMockAuth();
```

with:

```tsx
  const { logout } = useCustomerAuth();
```

- [ ] **Step 5: `BecomeClientCta.tsx`**

Replace line 5:

```tsx
import { useMockAuth } from '@/lib/useMockAuth';
```

with:

```tsx
import { useCustomerAuth } from '@/lib/useCustomerAuth';
```

Replace line 9:

```tsx
  const { isHydrated, isLoggedIn } = useMockAuth();
```

with:

```tsx
  const { isHydrated, isCustomer } = useCustomerAuth();
```

Replace line 11:

```tsx
  if (isHydrated && isLoggedIn) {
```

with:

```tsx
  if (isHydrated && isCustomer) {
```

- [ ] **Step 6: `SettingsSection.tsx`**

Replace line 16:

```tsx
import { useMockAuth } from '@/lib/useMockAuth';
```

with:

```tsx
import { useCustomerAuth } from '@/lib/useCustomerAuth';
```

Replace line 21:

```tsx
  const { email: authEmail, uid, logout } = useMockAuth();
```

with:

```tsx
  const { user, logout } = useCustomerAuth();
```

Replace line 79:

```tsx
      response = await signInWithEmailAndPassword(auth, authEmail ?? '', deletePassword);
```

with:

```tsx
      response = await signInWithEmailAndPassword(auth, user?.email ?? '', deletePassword);
```

Replace line 86:

```tsx
      await deleteDoc(doc(db, 'klanten', uid ?? ''));
```

with:

```tsx
      await deleteDoc(doc(db, 'klanten', user?.uid ?? ''));
```

Replace line 101:

```tsx
    logout();
```

with:

```tsx
    await logout();
```

- [ ] **Step 7: `CustomerLoginForm.tsx`**

Replace the full contents of `src/components/CustomerLoginForm.tsx`:

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { useRouter } from '@/i18n/navigation';

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
      const credential = await signInWithEmailAndPassword(auth, email, password);
      const uid = credential.user.uid;
      try {
        const klantDoc = await getDoc(doc(db, 'klanten', uid));
        const status = klantDoc.exists() ? (klantDoc.data() as { status?: string }).status : null;

        if (status === 'Goedgekeurd') {
          router.replace('/account');
          return;
        }

        if (status === 'Beoordelen') {
          setError(t('pendingMessage'));
        } else if (status === 'Afgewezen') {
          setError(t('rejectedMessage'));
        } else if (!klantDoc.exists()) {
          setError(t('accountIncompleteMessage'));
        } else {
          setError(t('loginError'));
        }
        await signOut(auth);
      } catch {
        await signOut(auth);
        throw new Error('klant status check failed');
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

(Behavior change: on `'Goedgekeurd'`, the real Firebase session is now kept alive — no `signOut` and no local flag to set, since `useCustomerAuth`'s `onAuthStateChanged` picks up the already-signed-in session automatically. Every other outcome — `'Beoordelen'`, `'Afgewezen'`, missing document, or a `getDoc` failure — still signs out immediately, unchanged.)

- [ ] **Step 8: Update `tests/components/NavBar.test.tsx`**

Replace the full contents of `tests/components/NavBar.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { NavBar } from '@/components/NavBar';
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import messages from '../../messages/nl.json';

const onAuthStateChangedMock = vi.fn();
const getDocMock = vi.fn();

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

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => onAuthStateChangedMock(...args),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
}));

function renderNavBar() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <NavBar />
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
}

function signedOut() {
  onAuthStateChangedMock.mockImplementation((_auth, callback) => {
    callback(null);
    return () => {};
  });
}

function signedInAsApprovedCustomer() {
  getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ status: 'Goedgekeurd' }) });
  onAuthStateChangedMock.mockImplementation((_auth, callback) => {
    callback({ uid: 'uid-1', email: 'klant@example.com' });
    return () => {};
  });
}

beforeEach(() => {
  onAuthStateChangedMock.mockReset();
  getDocMock.mockReset();
});

describe('NavBar', () => {
  it('shows "Word klant" and "Inloggen" when logged out, no account link', async () => {
    signedOut();
    renderNavBar();
    await waitFor(() => expect(screen.getByTestId('nav-become-client')).toBeInTheDocument());
    expect(screen.getByTestId('nav-login')).toBeInTheDocument();
    expect(screen.queryByTestId('account-icon')).not.toBeInTheDocument();
  });

  it('renders Collecties as a single direct link, no dropdown', async () => {
    signedOut();
    renderNavBar();
    await waitFor(() => expect(screen.getByTestId('nav-become-client')).toBeInTheDocument());
    expect(screen.getByTestId('nav-collections')).toHaveAttribute('href', '/collecties');
    expect(screen.queryByTestId('collections-dropdown')).not.toBeInTheDocument();
  });

  it('shows the "Inloggen" link pointing to /inloggen when logged out', async () => {
    signedOut();
    renderNavBar();
    await waitFor(() => expect(screen.getByTestId('nav-login')).toBeInTheDocument());
    expect(screen.getByTestId('nav-login')).toHaveAttribute('href', '/inloggen');
  });

  it('shows a link to /account instead of "Word klant"/"Inloggen" when already logged in', async () => {
    signedInAsApprovedCustomer();
    renderNavBar();
    await waitFor(() => expect(screen.getByTestId('account-icon')).toBeInTheDocument());
    expect(screen.getByTestId('account-icon')).toHaveAttribute('href', '/account');
    expect(screen.queryByTestId('nav-become-client')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-login')).not.toBeInTheDocument();
  });

  it('points Contact at /contact and Word klant at /word-klant', async () => {
    signedOut();
    renderNavBar();
    await waitFor(() => expect(screen.getByTestId('nav-become-client')).toBeInTheDocument());
    expect(screen.getByTestId('nav-contact')).toHaveAttribute('href', '/contact');
    expect(screen.getByTestId('nav-become-client')).toHaveAttribute('href', '/word-klant');
  });

  it('renders the logo linking to the homepage', async () => {
    signedOut();
    renderNavBar();
    await waitFor(() => expect(screen.getByTestId('logo')).toBeInTheDocument());
    expect(screen.getByTestId('logo')).toHaveAttribute('href', '/');
  });

  it('shows a Beheer link pointing to /beheer', async () => {
    signedOut();
    renderNavBar();
    await waitFor(() => expect(screen.getByTestId('nav-beheer')).toBeInTheDocument());
    expect(screen.getByTestId('nav-beheer')).toHaveAttribute('href', '/beheer');
  });
});
```

- [ ] **Step 9: Update `tests/components/account/AccountDashboard.test.tsx`**

Replace the full contents:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import { OrdersProvider } from '@/lib/useOrders';
import { ReturnsProvider } from '@/lib/useReturns';
import { MockProfileProvider } from '@/lib/useMockProfile';
import { AccountDashboard } from '@/components/account/AccountDashboard';
import messages from '../../../messages/nl.json';

const replaceMock = vi.fn();
const onAuthStateChangedMock = vi.fn();
const getDocMock = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/account',
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => onAuthStateChangedMock(...args),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
}));

function renderDashboard() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <OrdersProvider>
          <ReturnsProvider>
            <MockProfileProvider>
              <AccountDashboard />
            </MockProfileProvider>
          </ReturnsProvider>
        </OrdersProvider>
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  replaceMock.mockClear();
  onAuthStateChangedMock.mockReset();
  getDocMock.mockReset();
});

describe('AccountDashboard', () => {
  it('redirects to "/" and renders nothing when not logged in', async () => {
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback(null);
      return () => {};
    });
    renderDashboard();
    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));
    expect(screen.queryByTestId('account-dashboard')).not.toBeInTheDocument();
  });

  it('renders the Bestellingen section by default when logged in', async () => {
    getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ status: 'Goedgekeurd' }) });
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-1', email: 'klant@example.com' });
      return () => {};
    });
    renderDashboard();
    await waitFor(() => expect(screen.getByTestId('orders-section')).toBeInTheDocument());
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('switches to the Instellingen section when its nav button is clicked', async () => {
    getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ status: 'Goedgekeurd' }) });
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-1', email: 'klant@example.com' });
      return () => {};
    });
    renderDashboard();
    await waitFor(() => expect(screen.getByTestId('orders-section')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('account-nav-settings'));
    expect(screen.getByTestId('settings-section')).toBeInTheDocument();
    expect(screen.queryByTestId('orders-section')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 10: Update `tests/components/account/AccountNav.test.tsx`**

Replace the full contents:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import { AccountNav } from '@/components/account/AccountNav';
import messages from '../../../messages/nl.json';

const onAuthStateChangedMock = vi.fn();
const signOutMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => onAuthStateChangedMock(...args),
  signOut: (...args: unknown[]) => signOutMock(...args),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  getDoc: vi.fn().mockResolvedValue({ exists: () => true, data: () => ({ status: 'Goedgekeurd' }) }),
}));

function renderNav(activeSection: 'orders' | 'settings' = 'orders') {
  const onSelect = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <AccountNav activeSection={activeSection} onSelect={onSelect} />
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
  return { onSelect };
}

beforeEach(() => {
  onAuthStateChangedMock.mockReset();
  signOutMock.mockReset();
  onAuthStateChangedMock.mockImplementation((_auth, callback) => {
    callback({ uid: 'uid-1', email: 'klant@example.com' });
    return () => {};
  });
});

describe('AccountNav', () => {
  it('renders all 6 section buttons plus a logout button', () => {
    renderNav();
    expect(screen.getByTestId('account-nav-orders')).toBeInTheDocument();
    expect(screen.getByTestId('account-nav-invoicesDue')).toBeInTheDocument();
    expect(screen.getByTestId('account-nav-invoicesPaid')).toBeInTheDocument();
    expect(screen.getByTestId('account-nav-returns')).toBeInTheDocument();
    expect(screen.getByTestId('account-nav-conversations')).toBeInTheDocument();
    expect(screen.getByTestId('account-nav-settings')).toBeInTheDocument();
    expect(screen.getByTestId('account-nav-logout')).toBeInTheDocument();
  });

  it('marks the active section with aria-current', () => {
    renderNav('settings');
    expect(screen.getByTestId('account-nav-settings')).toHaveAttribute('aria-current', 'true');
    expect(screen.getByTestId('account-nav-orders')).not.toHaveAttribute('aria-current');
  });

  it('calls onSelect with the clicked section id', () => {
    const { onSelect } = renderNav();
    fireEvent.click(screen.getByTestId('account-nav-returns'));
    expect(onSelect).toHaveBeenCalledWith('returns');
  });

  it('calls signOut when the logout button is clicked', () => {
    renderNav();
    fireEvent.click(screen.getByTestId('account-nav-logout'));
    expect(signOutMock).toHaveBeenCalledWith({});
  });
});
```

- [ ] **Step 11: Update `tests/components/account/SettingsSection.test.tsx`**

Replace the full contents:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MockProfileProvider } from '@/lib/useMockProfile';
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import { SettingsSection } from '@/components/account/SettingsSection';
import messages from '../../../messages/nl.json';

const replaceMock = vi.fn();
const onAuthStateChangedMock = vi.fn();
const getDocMock = vi.fn();
const signInMock = vi.fn();
const signOutMock = vi.fn();
const deleteUserMock = vi.fn();
const deleteDocMock = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/account',
  useRouter: () => ({ replace: replaceMock }),
}));

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => onAuthStateChangedMock(...args),
  signInWithEmailAndPassword: (...args: unknown[]) => signInMock(...args),
  signOut: (...args: unknown[]) => signOutMock(...args),
  deleteUser: (...args: unknown[]) => deleteUserMock(...args),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  deleteDoc: (...args: unknown[]) => deleteDocMock(...args),
}));

function renderSection() {
  onAuthStateChangedMock.mockImplementation((_auth, callback) => {
    callback({ uid: 'uid-1', email: 'klant@example.com' });
    return () => {};
  });
  getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ status: 'Goedgekeurd' }) });
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <MockProfileProvider>
          <SettingsSection />
        </MockProfileProvider>
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  replaceMock.mockClear();
  onAuthStateChangedMock.mockReset();
  getDocMock.mockReset();
  signInMock.mockReset();
  signOutMock.mockReset();
  deleteUserMock.mockReset();
  deleteDocMock.mockReset();
});

describe('SettingsSection', () => {
  it('pre-fills fields from the seeded mock profile', async () => {
    renderSection();
    await waitFor(() =>
      expect(screen.getByTestId('settings-company-name')).toHaveValue('Hotel De Zilveren Zwaan')
    );
    expect(screen.getByTestId('settings-email')).toHaveValue('anne@dezilverenzwaan.nl');
    expect(screen.getByTestId('settings-contact-preference')).toHaveValue('email');
    expect(screen.getByTestId('settings-language-preference')).toHaveValue('nl');
  });

  it('shows a password-mismatch error and does not save when passwords differ', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('settings-submit')).toBeInTheDocument());
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

  it('saves profile changes and shows a saved confirmation', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('settings-submit')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('settings-email'), {
      target: { value: 'nieuw@example.com' },
    });
    fireEvent.click(screen.getByTestId('settings-submit'));
    expect(screen.getByTestId('settings-saved')).toBeInTheDocument();
    const stored = JSON.parse(window.localStorage.getItem('glassart-mock-profile') ?? '{}');
    expect(stored.email).toBe('nieuw@example.com');
  });

  it('switches the site locale via router.replace when languagePreference changes', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('settings-submit')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('settings-language-preference'), {
      target: { value: 'en' },
    });
    fireEvent.click(screen.getByTestId('settings-submit'));
    expect(replaceMock).toHaveBeenCalledWith('/account', { locale: 'en' });
  });

  it('does not call router.replace when languagePreference is left unchanged', async () => {
    renderSection();
    await waitFor(() => expect(screen.getByTestId('settings-submit')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('settings-submit'));
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('shows an error and deletes nothing when the confirmation password is wrong', async () => {
    signInMock.mockRejectedValue(new Error('auth/wrong-password'));
    renderSection();
    await waitFor(() => expect(screen.getByTestId('delete-account-submit')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('delete-account-password'), {
      target: { value: 'fout' },
    });
    fireEvent.click(screen.getByTestId('delete-account-submit'));
    expect(await screen.findByTestId('delete-account-error')).toBeInTheDocument();
    expect(deleteDocMock).not.toHaveBeenCalled();
    expect(deleteUserMock).not.toHaveBeenCalled();
  });

  it('shows a distinct partial-error message and stays on the page when deleteDoc succeeds but deleteUser fails', async () => {
    signInMock.mockResolvedValue({ user: { uid: 'uid-1' } });
    deleteDocMock.mockResolvedValue(undefined);
    deleteUserMock.mockRejectedValue(new Error('requires-recent-login'));
    renderSection();
    await waitFor(() => expect(screen.getByTestId('delete-account-submit')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('delete-account-password'), {
      target: { value: 'geheim123' },
    });
    fireEvent.click(screen.getByTestId('delete-account-submit'));

    expect(await screen.findByTestId('delete-account-error')).toHaveTextContent(
      'Uw gegevens zijn verwijderd, maar er ging iets mis bij het volledig verwijderen van uw account. Neem contact met ons op.'
    );
    expect(replaceMock).not.toHaveBeenCalled();
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it('re-authenticates, deletes the klant document and Firebase account, signs out and redirects home', async () => {
    signInMock.mockResolvedValue({ user: { uid: 'uid-1' } });
    deleteDocMock.mockResolvedValue(undefined);
    deleteUserMock.mockResolvedValue(undefined);
    signOutMock.mockResolvedValue(undefined);
    renderSection();
    await waitFor(() => expect(screen.getByTestId('delete-account-submit')).toBeInTheDocument());
    fireEvent.change(screen.getByTestId('delete-account-password'), {
      target: { value: 'geheim123' },
    });
    fireEvent.click(screen.getByTestId('delete-account-submit'));

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/'));

    expect(signInMock).toHaveBeenCalledWith({}, 'klant@example.com', 'geheim123');
    expect(deleteDocMock).toHaveBeenCalledWith({ collection: 'klanten', id: 'uid-1' });
    expect(deleteUserMock).toHaveBeenCalledWith({ uid: 'uid-1' });
    expect(signOutMock).toHaveBeenCalledWith({});
  });
});
```

- [ ] **Step 12: Update `tests/components/BecomeClientCta.test.tsx`**

Replace the full contents:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { BecomeClientCta } from '@/components/BecomeClientCta';
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import messages from '../../messages/nl.json';

const onAuthStateChangedMock = vi.fn();
const getDocMock = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => onAuthStateChangedMock(...args),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
}));

function renderBecomeClientCta() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <BecomeClientCta />
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  onAuthStateChangedMock.mockReset();
  getDocMock.mockReset();
});

describe('BecomeClientCta', () => {
  it('shows the "Word klant" link pointing at /word-klant when logged out', async () => {
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback(null);
      return () => {};
    });
    renderBecomeClientCta();
    await waitFor(() => expect(screen.getByTestId('segment-cta')).toBeInTheDocument());
    expect(screen.getByTestId('segment-cta')).toHaveAttribute('href', '/word-klant');
  });

  it('hides the link when already logged in', async () => {
    getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ status: 'Goedgekeurd' }) });
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-1', email: 'klant@example.com' });
      return () => {};
    });
    renderBecomeClientCta();
    await waitFor(() => expect(screen.queryByTestId('segment-cta')).not.toBeInTheDocument());
  });
});
```

- [ ] **Step 13: Update `tests/components/CustomerLoginForm.test.tsx`**

Replace the full contents:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CustomerLoginForm } from '@/components/CustomerLoginForm';
import messages from '../../messages/nl.json';

const signInMock = vi.fn();
const signOutMock = vi.fn();
const getDocMock = vi.fn();
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
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('grants access, keeps the session alive, and redirects to /account when the klant is "Goedgekeurd"', async () => {
    signInMock.mockResolvedValue({ user: { uid: 'uid-1' } });
    getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ status: 'Goedgekeurd' }) });
    renderForm();
    submitWith('klant@example.com', 'geheim123');

    await waitFor(() => expect(replaceMock).toHaveBeenCalledWith('/account'));
    expect(signOutMock).not.toHaveBeenCalled();
  });

  it('shows a pending message, signs out, and does not grant access when status is "Beoordelen"', async () => {
    signInMock.mockResolvedValue({ user: { uid: 'uid-2' } });
    getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ status: 'Beoordelen' }) });
    signOutMock.mockResolvedValue(undefined);
    renderForm();
    submitWith('klant@example.com', 'geheim123');

    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'Uw aanvraag wordt nog beoordeeld.'
    );
    expect(signOutMock).toHaveBeenCalledWith({});
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('shows a rejected message and signs out when status is "Afgewezen"', async () => {
    signInMock.mockResolvedValue({ user: { uid: 'uid-3' } });
    getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ status: 'Afgewezen' }) });
    signOutMock.mockResolvedValue(undefined);
    renderForm();
    submitWith('klant@example.com', 'geheim123');

    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'Uw aanvraag is helaas afgewezen.'
    );
    expect(signOutMock).toHaveBeenCalledWith({});
  });

  it('shows the accountIncompleteMessage and signs out when the klant document does not exist', async () => {
    signInMock.mockResolvedValue({ user: { uid: 'uid-5' } });
    getDocMock.mockResolvedValue({ exists: () => false });
    signOutMock.mockResolvedValue(undefined);
    renderForm();
    submitWith('klant@example.com', 'geheim123');

    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'Er ging iets mis bij uw eerdere aanvraag. Neem contact met ons op.'
    );
    expect(signOutMock).toHaveBeenCalledWith({});
  });

  it('signs out and shows generic error when getDoc fails after successful sign-in', async () => {
    signInMock.mockResolvedValue({ user: { uid: 'uid-4' } });
    getDocMock.mockRejectedValue(new Error('permission-denied'));
    signOutMock.mockResolvedValue(undefined);
    renderForm();
    submitWith('klant@example.com', 'geheim123');

    expect(await screen.findByTestId('login-error')).toHaveTextContent(
      'E-mailadres of wachtwoord onjuist.'
    );
    expect(signOutMock).toHaveBeenCalledWith({});
  });
});
```

- [ ] **Step 14: Delete `useMockAuth`**

```bash
git rm src/lib/useMockAuth.tsx tests/lib/useMockAuth.test.ts
```

- [ ] **Step 15: Run the full test suite**

Run: `npm test`
Expected: all tests pass. No remaining reference to `useMockAuth`/`MockAuthProvider` anywhere (verify with a search: `grep -r "useMockAuth\|MockAuthProvider" src tests` should return nothing).

- [ ] **Step 16: Commit**

```bash
git add src/app/[locale]/layout.tsx src/components/NavBar.tsx src/components/account/AccountDashboard.tsx src/components/account/AccountNav.tsx src/components/account/SettingsSection.tsx src/components/BecomeClientCta.tsx src/components/CustomerLoginForm.tsx tests/components/NavBar.test.tsx tests/components/account/AccountDashboard.test.tsx tests/components/account/AccountNav.test.tsx tests/components/account/SettingsSection.test.tsx tests/components/BecomeClientCta.test.tsx tests/components/CustomerLoginForm.test.tsx
git commit -m "$(cat <<'EOF'
feat: migrate every useMockAuth consumer to useCustomerAuth

NavBar, AccountDashboard, AccountNav, SettingsSection, BecomeClientCta
and CustomerLoginForm now run on the real, persistent Firebase session.
An approved klant's session is kept alive after /inloggen instead of
being signed out immediately. useMockAuth is fully removed.
EOF
)"
```

---

### Task 3: CartPanel — require login, write real `bestelheaders`/`bestellines` to Firestore

**Files:**
- Modify: `src/components/CartPanel.tsx`
- Modify: `tests/components/CartPanel.test.tsx`
- Modify: `messages/nl.json:82`
- Modify: `messages/en.json:82`
- Modify: `messages/de.json:82`
- Modify: `messages/fr.json:82`
- Modify: `firestore.rules`

**Interfaces:**
- Consumes: `useCustomerAuth` from Task 1/2.
- Produces: no new exports — `<CartPanel />`'s usage in `NavBar` is unchanged.

- [ ] **Step 1: Add the two new translation keys to all four locale files**

In `messages/nl.json`, line 82-83, change:

```json
    "placeOrder": "Bestelling afronden",
    "clearOrder": "Bestelling leegmaken",
```

to:

```json
    "placeOrder": "Bestelling afronden",
    "clearOrder": "Bestelling leegmaken",
    "loginToOrder": "Inloggen om te bestellen",
    "placeOrderError": "Er ging iets mis bij het plaatsen van de bestelling. Probeer het opnieuw.",
```

In `messages/en.json`, line 82-83, change:

```json
    "placeOrder": "Complete order",
    "clearOrder": "Clear order",
```

to:

```json
    "placeOrder": "Complete order",
    "clearOrder": "Clear order",
    "loginToOrder": "Log in to order",
    "placeOrderError": "Something went wrong placing the order. Please try again.",
```

In `messages/de.json`, line 82-83, change:

```json
    "placeOrder": "Bestellung abschließen",
    "clearOrder": "Bestellung leeren",
```

to:

```json
    "placeOrder": "Bestellung abschließen",
    "clearOrder": "Bestellung leeren",
    "loginToOrder": "Anmelden zum Bestellen",
    "placeOrderError": "Beim Platzieren der Bestellung ist ein Fehler aufgetreten. Bitte versuchen Sie es erneut.",
```

In `messages/fr.json`, line 82-83, change:

```json
    "placeOrder": "Finaliser la commande",
    "clearOrder": "Vider la commande",
```

to:

```json
    "placeOrder": "Finaliser la commande",
    "clearOrder": "Vider la commande",
    "loginToOrder": "Se connecter pour commander",
    "placeOrderError": "Une erreur s'est produite lors de la commande. Veuillez réessayer.",
```

- [ ] **Step 2: Write the failing tests**

Replace the full contents of `tests/components/CartPanel.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { CartPanel } from '@/components/CartPanel';
import { CartProvider, useCart } from '@/lib/useCart';
import { CustomerAuthProvider } from '@/lib/useCustomerAuth';
import messages from '../../messages/nl.json';

const onAuthStateChangedMock = vi.fn();
const getDocMock = vi.fn();
const addDocMock = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => onAuthStateChangedMock(...args),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
  collection: vi.fn((_db, ...path) => ({ path })),
  addDoc: (...args: unknown[]) => addDocMock(...args),
  serverTimestamp: () => 'SERVER_TIMESTAMP',
}));

function Seed() {
  const { addItem } = useCart();
  return (
    <button
      type="button"
      data-testid="seed-cart"
      onClick={() =>
        addItem({
          segmentSlug: 'wellness',
          segmentMessageKey: 'wellness',
          imageSrc: 'https://images.unsplash.com/example.jpg',
          size: '60x90cm',
          quantity: 2,
        })
      }
    >
      Seed
    </button>
  );
}

function renderCartPanel() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <CustomerAuthProvider>
        <CartProvider>
          <Seed />
          <CartPanel />
        </CartProvider>
      </CustomerAuthProvider>
    </NextIntlClientProvider>
  );
}

function signedOut() {
  onAuthStateChangedMock.mockImplementation((_auth, callback) => {
    callback(null);
    return () => {};
  });
}

function signedInAsApprovedCustomer() {
  getDocMock.mockResolvedValue({ exists: () => true, data: () => ({ status: 'Goedgekeurd' }) });
  onAuthStateChangedMock.mockImplementation((_auth, callback) => {
    callback({ uid: 'uid-1', email: 'klant@example.com' });
    return () => {};
  });
}

beforeEach(() => {
  window.localStorage.clear();
  onAuthStateChangedMock.mockReset();
  getDocMock.mockReset();
  addDocMock.mockReset();
  signedInAsApprovedCustomer();
});

describe('CartPanel', () => {
  it('shows no badge when the cart is empty, and an empty message when opened', () => {
    renderCartPanel();
    expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.getByTestId('cart-empty')).toBeInTheDocument();
  });

  it('shows a badge with the total quantity and lists cart items once seeded', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    expect(screen.getByTestId('cart-badge')).toHaveTextContent('2');
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.queryByTestId('cart-empty')).not.toBeInTheDocument();
    expect(screen.getByText('Wellness')).toBeInTheDocument();
    expect(screen.getByText('60x90cm · ×2')).toBeInTheDocument();
  });

  it('removes an item when its remove button is clicked', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    const removeButtons = screen.getAllByLabelText('Verwijderen');
    fireEvent.click(removeButtons[0]);
    expect(screen.getByTestId('cart-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument();
  });

  it('shows a login link instead of the place-order button when not logged in', async () => {
    signedOut();
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-login-to-order')).toBeInTheDocument());
    expect(screen.getByTestId('cart-login-to-order')).toHaveAttribute('href', '/inloggen');
    expect(screen.queryByTestId('cart-place-order')).not.toBeInTheDocument();
  });

  it('writes a bestelheader + one bestelline per cart item, then clears the cart and closes the panel', async () => {
    addDocMock.mockResolvedValueOnce({ id: 'header-1' }).mockResolvedValue({ id: 'line-1' });
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    await waitFor(() => expect(screen.queryByTestId('cart-panel')).not.toBeInTheDocument());
    expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument();

    expect(addDocMock).toHaveBeenNthCalledWith(
      1,
      { path: ['bestelheaders'] },
      { klantId: 'uid-1', besteldatum: 'SERVER_TIMESTAMP', status: 'Te beoordelen' }
    );
    expect(addDocMock).toHaveBeenNthCalledWith(
      2,
      { path: ['bestelheaders', 'header-1', 'bestellines'] },
      { kunstwerkId: null, maatId: null, materiaalId: null, quantity: 2 }
    );
  });

  it('shows an error and keeps the cart intact when the Firestore write fails', async () => {
    addDocMock.mockRejectedValue(new Error('permission-denied'));
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    expect(await screen.findByTestId('cart-place-order-error')).toHaveTextContent(
      'Er ging iets mis bij het plaatsen van de bestelling. Probeer het opnieuw.'
    );
    expect(screen.getByTestId('cart-panel')).toBeInTheDocument();
    expect(screen.getByTestId('cart-badge')).toHaveTextContent('2');
  });

  it('disables the place-order button when the cart is empty', async () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).toBeInTheDocument());
    expect(screen.getByTestId('cart-place-order')).toBeDisabled();
  });

  it('closes the panel when Escape is pressed', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.getByTestId('cart-panel')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('cart-panel')).not.toBeInTheDocument();
  });

  it('closes the panel when the backdrop is clicked', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('cart-icon'));
    fireEvent.click(screen.getByTestId('cart-backdrop'));
    expect(screen.queryByTestId('cart-panel')).not.toBeInTheDocument();
  });

  it('empties the cart via "Bestelling leegmaken" without writing an order, and keeps the panel open', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    fireEvent.click(screen.getByTestId('cart-clear'));

    expect(screen.getByTestId('cart-panel')).toBeInTheDocument();
    expect(screen.getByTestId('cart-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('cart-badge')).not.toBeInTheDocument();
    expect(addDocMock).not.toHaveBeenCalled();
  });

  it('disables "Bestelling leegmaken" when the cart is empty', () => {
    renderCartPanel();
    fireEvent.click(screen.getByTestId('cart-icon'));
    expect(screen.getByTestId('cart-clear')).toBeDisabled();
  });
});
```

- [ ] **Step 3: Run the tests to confirm the new/changed ones fail**

Run: `npx vitest run tests/components/CartPanel.test.tsx`
Expected: FAIL on the login-link, Firestore-write and Firestore-error tests (`cart-login-to-order` doesn't exist yet; `CartPanel` still calls the old mock `useOrders().placeOrder`, so `addDocMock` is never invoked).

- [ ] **Step 4: Rewrite `CartPanel.tsx`**

Replace the full contents of `src/components/CartPanel.tsx`:

```tsx
'use client';

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useCart } from '@/lib/useCart';
import { useCustomerAuth } from '@/lib/useCustomerAuth';
import { useOverlayDismiss } from '@/lib/useOverlayDismiss';
import { Link } from '@/i18n/navigation';

export function CartPanel() {
  const t = useTranslations('cart');
  const tSegments = useTranslations('segments');
  const [isOpen, setIsOpen] = useState(false);
  const [placeOrderError, setPlaceOrderError] = useState<string | null>(null);
  const { items, isHydrated, totalQuantity, removeItem, clear } = useCart();
  const { user, isCustomer } = useCustomerAuth();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useOverlayDismiss({
    isOpen,
    onClose: () => setIsOpen(false),
    containerRef: panelRef,
    initialFocusRef: closeButtonRef,
  });

  async function handlePlaceOrder() {
    if (!user) {
      return;
    }
    setPlaceOrderError(null);
    try {
      const headerDoc = await addDoc(collection(db, 'bestelheaders'), {
        klantId: user.uid,
        besteldatum: serverTimestamp(),
        status: 'Te beoordelen',
      });
      await Promise.all(
        items.map((item) =>
          addDoc(collection(db, 'bestelheaders', headerDoc.id, 'bestellines'), {
            kunstwerkId: null,
            maatId: null,
            materiaalId: null,
            quantity: item.quantity,
          })
        )
      );
      clear();
      setIsOpen(false);
    } catch {
      setPlaceOrderError(t('placeOrderError'));
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="cart-icon"
        aria-label={t('title')}
        onClick={() => setIsOpen((open) => !open)}
        className="relative flex h-8 w-8 items-center justify-center rounded-full border border-white/20 text-white/80 hover:text-white"
      >
        <span aria-hidden="true">🛒</span>
        {isHydrated && totalQuantity > 0 && (
          <span
            data-testid="cart-badge"
            className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-silver px-1 text-[0.6rem] font-semibold text-ink"
          >
            {totalQuantity}
          </span>
        )}
      </button>

      {isOpen &&
        createPortal(
          <>
            <div
              data-testid="cart-backdrop"
              onClick={() => setIsOpen(false)}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            />
            <div
              ref={panelRef}
              data-testid="cart-panel"
              role="dialog"
              aria-modal="true"
              className="fixed bottom-0 right-0 top-0 z-50 flex w-full max-w-[400px] flex-col border-l border-white/10 bg-charcoal"
            >
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
                <p className="font-head text-[0.65rem] uppercase tracking-[0.2em] text-white/50">
                  {t('title')}
                </p>
                <button
                  ref={closeButtonRef}
                  type="button"
                  data-testid="cart-close"
                  aria-label={t('close')}
                  onClick={() => setIsOpen(false)}
                  className="flex h-8 w-8 items-center justify-center rounded-full text-white/60 hover:text-white"
                >
                  ×
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-5 py-4">
                {items.length === 0 ? (
                  <p data-testid="cart-empty" className="text-center text-xs text-white/60">
                    {t('empty')}
                  </p>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {items.map((item) => (
                      <li
                        key={item.id}
                        data-testid={`cart-item-${item.id}`}
                        className="flex gap-3 rounded-md border border-white/10 bg-graphite/60 p-3 text-xs text-white/80"
                      >
                        <img src={item.imageSrc} alt="" className="h-12 w-12 rounded object-cover" />
                        <div className="flex-1">
                          <p>{tSegments(`${item.segmentMessageKey}.title`)}</p>
                          <p className="text-white/50">
                            {item.size} · ×{item.quantity}
                          </p>
                        </div>
                        <button
                          type="button"
                          data-testid={`cart-item-remove-${item.id}`}
                          onClick={() => removeItem(item.id)}
                          aria-label={t('remove')}
                          className="text-white/50 hover:text-white"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex flex-col gap-2 border-t border-white/10 px-5 py-4">
                {isCustomer ? (
                  <button
                    type="button"
                    data-testid="cart-place-order"
                    disabled={items.length === 0}
                    onClick={handlePlaceOrder}
                    className="btn-gold w-full rounded-sm px-3 py-2.5 text-center text-xs font-head tracking-wide disabled:opacity-40"
                  >
                    {t('placeOrder')}
                  </button>
                ) : (
                  <Link
                    href="/inloggen"
                    data-testid="cart-login-to-order"
                    className="btn-gold block w-full rounded-sm px-3 py-2.5 text-center text-xs font-head tracking-wide"
                  >
                    {t('loginToOrder')}
                  </Link>
                )}
                {placeOrderError && (
                  <p
                    data-testid="cart-place-order-error"
                    className="text-center text-xs text-red-400"
                  >
                    {placeOrderError}
                  </p>
                )}
                <button
                  type="button"
                  data-testid="cart-clear"
                  disabled={items.length === 0}
                  onClick={clear}
                  className="text-xs text-white/50 transition hover:text-red-400 disabled:opacity-40"
                >
                  {t('clearOrder')}
                </button>
              </div>
            </div>
          </>,
          document.body
        )}
    </div>
  );
}
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `npx vitest run tests/components/CartPanel.test.tsx`
Expected: PASS — all 11 tests green.

- [ ] **Step 6: Add the security rules**

In `firestore.rules`, add a new `match` block inside `match /databases/{database}/documents { ... }`, after the existing `klanten` block (before the final closing braces):

```
    match /bestelheaders/{id} {
      allow create: if request.auth != null && request.auth.uid == request.resource.data.klantId
        && request.resource.data.status == 'Te beoordelen';
      allow read: if request.auth != null &&
        (request.auth.uid == resource.data.klantId ||
         exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid)));
      allow update, delete: if false;

      match /bestellines/{lineId} {
        allow create: if request.auth != null &&
          request.auth.uid == get(/databases/$(database)/documents/bestelheaders/$(id)).data.klantId;
        allow read: if request.auth != null &&
          (request.auth.uid == get(/databases/$(database)/documents/bestelheaders/$(id)).data.klantId ||
           exists(/databases/$(database)/documents/medewerkers/$(request.auth.uid)));
        allow update, delete: if false;
      }
    }
```

There is no automated rules test in this repo (no Firebase emulator setup) — this step is verified by careful reading, not a test run. Note in your report which reviewer should double-check the rule logic by hand.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/CartPanel.tsx tests/components/CartPanel.test.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json firestore.rules
git commit -m "$(cat <<'EOF'
feat: require login for checkout, write bestelheaders/bestellines

Bestelling afronden now needs an approved klant session: logged-out
visitors see a "log in to order" link instead. On confirm, writes a
real bestelheaders document plus one bestellines subdocument per cart
line (kunstwerkId/maatId/materiaalId null for now), instead of the old
mock useOrders placement. Adds matching Firestore security rules.
EOF
)"
```

**Manual follow-up (not part of this plan's automated steps):** `firestore.rules` must be deployed to the actual Firebase project (e.g. `firebase deploy --only firestore:rules`) — this repo's CI (`deploy-pages.yml`) only builds/deploys the static site, it does not deploy Firestore rules.
