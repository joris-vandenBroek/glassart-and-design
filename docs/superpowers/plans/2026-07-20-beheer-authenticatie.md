# Beheer-authenticatie (fundament) Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 20-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Beheer" login button that authenticates the 4 named staff members via Firebase Auth (email/password) and lands them on a bare, secured `/beheer` shell page — the foundation later admin sub-projects (customer approval, orders, catalog) will build on.

**Architecture:** Firebase Auth + Firestore, called directly from the browser via the Firebase JS SDK — no custom backend. New `/beheer` route inside the existing Next.js app (`output: 'export'`, unchanged hosting on GitHub Pages). Authorization is a Firestore `medewerkers/{uid}` document, enforced for real by Firestore Security Rules (the client-side check is UX only).

**Tech Stack:** Next.js 14 (App Router, static export), React 18, next-intl, Tailwind CSS, `firebase` (JS SDK v9+ modular API — `firebase/app`, `firebase/auth`, `firebase/firestore`), Vitest + Testing Library.

## Global Constraints

- Site stays a fully static export (`output: 'export'`) on GitHub Pages — no server code, no API routes, no middleware.
- All Firebase calls happen client-side via the modular SDK (`firebase/app`, `firebase/auth`, `firebase/firestore`), never `firebase-admin`.
- `NEXT_PUBLIC_FIREBASE_*` env vars are not secret (standard for Firebase web apps) — real security is Firestore Security Rules, deny-by-default.
- 4 fixed accounts only, created manually via the Firebase console — no self-service signup: `Julie@glassartanddesign.com`, `Paul@glassartanddesign.com`, `Hem@glassartanddesign.com`, `joris.vandenbroek@gmail.com`.
- Firebase project already created by the user: project ID `glassart-and-design`, Firestore in Standard edition / production mode, Authentication Email/Password provider enabled, all 4 users already added under Authentication → Users.
- Out of scope: customer approval, orders, invoices, returns, catalog management, staff roles/permissions, accounting integration, notifications — later sub-projects build on this foundation.
- Spec: `docs/superpowers/specs/2026-07-20-beheer-authenticatie-design.md`.

---

## Task 1: Firebase SDK setup & config scaffolding

**Files:**
- Modify: `package.json` (adds `firebase` dependency, via `npm install`)
- Create: `.env.local` (not committed)
- Modify: `.gitignore`
- Create: `src/lib/firebase.ts`

**Interfaces:**
- Produces: `auth` (Firebase `Auth` instance) and `db` (Firebase `Firestore` instance), exported from `src/lib/firebase.ts`, imported by Task 2's `useAdminAuth.tsx`.

- [ ] **Step 1: Install the Firebase SDK**

Run: `npm install firebase`

Expected: `package.json` gains a `"firebase": "^11.x.x"`-style entry under `dependencies`, `package-lock.json` updates, no errors.

- [ ] **Step 2: Add `.env.local` to `.gitignore`**

Add this line to `.gitignore` (anywhere, e.g. after the existing `.claude/` line):

```
.env*.local
```

- [ ] **Step 3: Create `.env.local` with the real (non-secret) Firebase web config**

Create `.env.local` in the project root with exactly this content (values are from the user's already-registered Firebase web app, safe to use directly — Firebase web config is not a secret):

```
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyD1DmZ3N2hV_9FxlZQ824DzwWayJxkPE3k
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=glassart-and-design.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=glassart-and-design
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=glassart-and-design.firebasestorage.app
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=824538894452
NEXT_PUBLIC_FIREBASE_APP_ID=1:824538894452:web:3b74285669475b1c73c121
```

- [ ] **Step 4: Create `src/lib/firebase.ts`**

```ts
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
```

No dedicated test for this file — it's a thin SDK-initialization wrapper with no branching logic, exercised indirectly through Task 2's mocked tests (which mock this module entirely, matching how `tests/components/NavBar.test.tsx` mocks `@/i18n/navigation`).

- [ ] **Step 5: Verify the app still builds**

Run: `npm run build`
Expected: build succeeds (env vars are read from `.env.local` automatically by Next.js in dev; for this local build check that nothing throws — `output: 'export'` build should complete without errors).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .gitignore src/lib/firebase.ts
git commit -m "feat: add Firebase SDK and client config for beheer-authenticatie"
```

(`.env.local` is intentionally not committed — it's gitignored.)

---

## Task 2: `useAdminAuth` hook — Firebase Auth state + Firestore authorization

**Files:**
- Create: `src/lib/useAdminAuth.tsx`
- Test: `tests/lib/useAdminAuth.test.tsx`

**Interfaces:**
- Consumes: `auth`, `db` from `src/lib/firebase.ts` (Task 1).
- Produces: `AdminAuthProvider` (React component) and `useAdminAuth()` hook returning `{ user: { uid: string; email: string | null } | null; isAdmin: boolean; isHydrated: boolean; login(email: string, password: string): Promise<void>; logout(): Promise<void>; resetPassword(email: string): Promise<void> }`. Consumed by Task 3 (`AdminLoginForm`), Task 4 (`AdminDashboard`), and Task 5 (`layout.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `tests/lib/useAdminAuth.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminAuthProvider, useAdminAuth } from '@/lib/useAdminAuth';

const onAuthStateChangedMock = vi.fn();
const signInMock = vi.fn();
const signOutMock = vi.fn();
const resetPasswordMock = vi.fn();
const getDocMock = vi.fn();

vi.mock('@/lib/firebase', () => ({
  auth: {},
  db: {},
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (...args: unknown[]) => onAuthStateChangedMock(...args),
  signInWithEmailAndPassword: (...args: unknown[]) => signInMock(...args),
  signOut: (...args: unknown[]) => signOutMock(...args),
  sendPasswordResetEmail: (...args: unknown[]) => resetPasswordMock(...args),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, collection, id) => ({ collection, id })),
  getDoc: (...args: unknown[]) => getDocMock(...args),
}));

function TestConsumer() {
  const { user, isAdmin, isHydrated } = useAdminAuth();
  if (!isHydrated) return <div data-testid="loading" />;
  return (
    <div>
      <div data-testid="user">{user ? user.email : 'none'}</div>
      <div data-testid="is-admin">{String(isAdmin)}</div>
    </div>
  );
}

function renderProvider() {
  return render(
    <AdminAuthProvider>
      <TestConsumer />
    </AdminAuthProvider>
  );
}

beforeEach(() => {
  onAuthStateChangedMock.mockReset();
  signInMock.mockReset();
  signOutMock.mockReset();
  resetPasswordMock.mockReset();
  getDocMock.mockReset();
});

describe('useAdminAuth', () => {
  it('reports isHydrated with no user when signed out', async () => {
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback(null);
      return () => {};
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('user')).toBeInTheDocument());
    expect(screen.getByTestId('user')).toHaveTextContent('none');
    expect(screen.getByTestId('is-admin')).toHaveTextContent('false');
  });

  it('reports isAdmin true when a medewerkers document exists for the signed-in user', async () => {
    getDocMock.mockResolvedValue({ exists: () => true });
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-1', email: 'paul@glassartanddesign.com' });
      return () => {};
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('is-admin')).toHaveTextContent('true'));
    expect(screen.getByTestId('user')).toHaveTextContent('paul@glassartanddesign.com');
  });

  it('reports isAdmin false when no medewerkers document exists for the signed-in user', async () => {
    getDocMock.mockResolvedValue({ exists: () => false });
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback({ uid: 'uid-2', email: 'onbekend@glassartanddesign.com' });
      return () => {};
    });
    renderProvider();
    await waitFor(() => expect(screen.getByTestId('is-admin')).toHaveTextContent('false'));
  });

  it('calls signInWithEmailAndPassword with the given credentials', async () => {
    onAuthStateChangedMock.mockImplementation((_auth, callback) => {
      callback(null);
      return () => {};
    });
    signInMock.mockResolvedValue(undefined);
    let hookValue: ReturnType<typeof useAdminAuth> | null = null;
    function Capture() {
      hookValue = useAdminAuth();
      return null;
    }
    render(
      <AdminAuthProvider>
        <Capture />
      </AdminAuthProvider>
    );
    await waitFor(() => expect(hookValue?.isHydrated).toBe(true));
    await hookValue!.login('paul@glassartanddesign.com', 'geheim123');
    expect(signInMock).toHaveBeenCalledWith({}, 'paul@glassartanddesign.com', 'geheim123');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/lib/useAdminAuth.test.tsx`
Expected: FAIL — `Cannot find module '@/lib/useAdminAuth'`.

- [ ] **Step 3: Implement `src/lib/useAdminAuth.tsx`**

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
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  type User,
} from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

interface AdminUser {
  uid: string;
  email: string | null;
}

interface AdminAuthValue {
  user: AdminUser | null;
  isAdmin: boolean;
  isHydrated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuthValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    return onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      if (!firebaseUser) {
        setUser(null);
        setIsAdmin(false);
        setIsHydrated(true);
        return;
      }
      const medewerkerDoc = await getDoc(doc(db, 'medewerkers', firebaseUser.uid));
      setUser({ uid: firebaseUser.uid, email: firebaseUser.email });
      setIsAdmin(medewerkerDoc.exists());
      setIsHydrated(true);
    });
  }, []);

  const value = useMemo<AdminAuthValue>(
    () => ({
      user,
      isAdmin,
      isHydrated,
      login: async (email: string, password: string) => {
        await signInWithEmailAndPassword(auth, email, password);
      },
      logout: async () => {
        await firebaseSignOut(auth);
      },
      resetPassword: async (email: string) => {
        await sendPasswordResetEmail(auth, email);
      },
    }),
    [user, isAdmin, isHydrated]
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth(): AdminAuthValue {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used within an AdminAuthProvider');
  }
  return context;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/lib/useAdminAuth.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/useAdminAuth.tsx tests/lib/useAdminAuth.test.tsx
git commit -m "feat: add useAdminAuth hook (Firebase Auth + medewerkers authorization)"
```

---

## Task 3: `AdminLoginForm` component

**Files:**
- Create: `src/components/beheer/AdminLoginForm.tsx`
- Test: `tests/components/beheer/AdminLoginForm.test.tsx`

**Interfaces:**
- Consumes: `useAdminAuth()` → `{ login, resetPassword }` (Task 2).
- Consumes: translation namespace `beheer` (Task 5 adds the keys; write this task against the keys listed below — they exist by the time Task 5 lands, but this component only needs `useTranslations('beheer')` to resolve at runtime, not at test time, since the test supplies `messages` directly).
- Produces: `AdminLoginForm` component, consumed by Task 4 (`AdminDashboard`).

- [ ] **Step 1: Write the failing tests**

Create `tests/components/beheer/AdminLoginForm.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AdminLoginForm } from '@/components/beheer/AdminLoginForm';
import messages from '../../../messages/nl.json';

const loginMock = vi.fn();
const resetPasswordMock = vi.fn();

vi.mock('@/lib/useAdminAuth', () => ({
  useAdminAuth: () => ({
    login: loginMock,
    resetPassword: resetPasswordMock,
    logout: vi.fn(),
    user: null,
    isAdmin: false,
    isHydrated: true,
  }),
}));

function renderForm() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <AdminLoginForm />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  loginMock.mockReset();
  resetPasswordMock.mockReset();
});

describe('AdminLoginForm', () => {
  it('calls login with the entered email and password on submit', async () => {
    loginMock.mockResolvedValue(undefined);
    renderForm();
    fireEvent.change(screen.getByTestId('beheer-login-email'), {
      target: { value: 'paul@glassartanddesign.com' },
    });
    fireEvent.change(screen.getByTestId('beheer-login-password'), {
      target: { value: 'geheim123' },
    });
    fireEvent.click(screen.getByTestId('beheer-login-submit'));
    await waitFor(() =>
      expect(loginMock).toHaveBeenCalledWith('paul@glassartanddesign.com', 'geheim123')
    );
  });

  it('shows a generic error message when login fails', async () => {
    loginMock.mockRejectedValue(new Error('auth/wrong-password'));
    renderForm();
    fireEvent.change(screen.getByTestId('beheer-login-email'), {
      target: { value: 'paul@glassartanddesign.com' },
    });
    fireEvent.change(screen.getByTestId('beheer-login-password'), {
      target: { value: 'fout' },
    });
    fireEvent.click(screen.getByTestId('beheer-login-submit'));
    expect(await screen.findByTestId('beheer-login-error')).toBeInTheDocument();
  });

  it('shows a validation message when requesting a password reset without an email', async () => {
    renderForm();
    fireEvent.click(screen.getByTestId('beheer-forgot-password'));
    expect(await screen.findByTestId('beheer-reset-message')).toBeInTheDocument();
    expect(resetPasswordMock).not.toHaveBeenCalled();
  });

  it('calls resetPassword and shows a confirmation when an email is filled in', async () => {
    resetPasswordMock.mockResolvedValue(undefined);
    renderForm();
    fireEvent.change(screen.getByTestId('beheer-login-email'), {
      target: { value: 'paul@glassartanddesign.com' },
    });
    fireEvent.click(screen.getByTestId('beheer-forgot-password'));
    await waitFor(() =>
      expect(resetPasswordMock).toHaveBeenCalledWith('paul@glassartanddesign.com')
    );
    expect(await screen.findByTestId('beheer-reset-message')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/AdminLoginForm.test.tsx`
Expected: FAIL — `Cannot find module '@/components/beheer/AdminLoginForm'`.

- [ ] **Step 3: Implement `src/components/beheer/AdminLoginForm.tsx`**

```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminAuth } from '@/lib/useAdminAuth';

export function AdminLoginForm() {
  const t = useTranslations('beheer');
  const { login, resetPassword } = useAdminAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError(null);
    try {
      await login(email, password);
    } catch {
      setLoginError(t('loginError'));
    }
  }

  async function handleForgotPassword() {
    setResetMessage(null);
    if (!email) {
      setResetMessage(t('forgotPasswordMissingEmail'));
      return;
    }
    try {
      await resetPassword(email);
      setResetMessage(t('forgotPasswordSent'));
    } catch {
      setResetMessage(t('loginError'));
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
          data-testid="beheer-login-email"
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
          data-testid="beheer-login-password"
          className={fieldClassName}
        />
      </label>

      {loginError && (
        <p data-testid="beheer-login-error" className="text-xs text-red-400">
          {loginError}
        </p>
      )}

      <button
        type="submit"
        data-testid="beheer-login-submit"
        className="mt-2 rounded-sm bg-silver px-4 py-2.5 text-xs tracking-[0.15em] text-ink"
      >
        {t('submit')}
      </button>

      <button
        type="button"
        onClick={handleForgotPassword}
        data-testid="beheer-forgot-password"
        className="text-left text-xs text-white/60 underline hover:text-white"
      >
        {t('forgotPassword')}
      </button>

      {resetMessage && (
        <p data-testid="beheer-reset-message" className="text-xs text-white/70">
          {resetMessage}
        </p>
      )}
    </form>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/AdminLoginForm.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/AdminLoginForm.tsx tests/components/beheer/AdminLoginForm.test.tsx
git commit -m "feat: add AdminLoginForm component"
```

---

## Task 4: `AdminDashboard` component (auth gate + authenticated shell)

**Files:**
- Create: `src/components/beheer/AdminDashboard.tsx`
- Test: `tests/components/beheer/AdminDashboard.test.tsx`

**Interfaces:**
- Consumes: `useAdminAuth()` → `{ user, isAdmin, isHydrated, logout }` (Task 2), `AdminLoginForm` (Task 3).
- Produces: `AdminDashboard` component, consumed by Task 5 (`src/app/[locale]/beheer/page.tsx`).

- [ ] **Step 1: Write the failing tests**

Create `tests/components/beheer/AdminDashboard.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AdminDashboard } from '@/components/beheer/AdminDashboard';
import messages from '../../../messages/nl.json';

const logoutMock = vi.fn();
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

function renderDashboard() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <AdminDashboard />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  logoutMock.mockReset();
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

  it('shows the dashboard shell with the logged-in email when authorized', () => {
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

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/components/beheer/AdminDashboard.test.tsx`
Expected: FAIL — `Cannot find module '@/components/beheer/AdminDashboard'`.

- [ ] **Step 3: Implement `src/components/beheer/AdminDashboard.tsx`**

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { useAdminAuth } from '@/lib/useAdminAuth';
import { AdminLoginForm } from './AdminLoginForm';

export function AdminDashboard() {
  const t = useTranslations('beheer');
  const { user, isAdmin, isHydrated, logout } = useAdminAuth();
  const hasSignedOutUnauthorized = useRef(false);

  const isUnauthorized = isHydrated && !!user && !isAdmin;

  useEffect(() => {
    if (isUnauthorized && !hasSignedOutUnauthorized.current) {
      hasSignedOutUnauthorized.current = true;
      logout();
    }
    if (!isUnauthorized) {
      hasSignedOutUnauthorized.current = false;
    }
  }, [isUnauthorized, logout]);

  if (!isHydrated) {
    return null;
  }

  if (isUnauthorized) {
    return (
      <p data-testid="beheer-unauthorized" className="text-sm text-white/80">
        {t('unauthorized')}
      </p>
    );
  }

  if (!user) {
    return <AdminLoginForm />;
  }

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
    </div>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/components/beheer/AdminDashboard.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/beheer/AdminDashboard.tsx tests/components/beheer/AdminDashboard.test.tsx
git commit -m "feat: add AdminDashboard component (auth gate + authenticated shell)"
```

---

## Task 5: Route, NavBar link, provider wiring, translations

**Files:**
- Create: `src/app/[locale]/beheer/page.tsx`
- Modify: `src/app/[locale]/layout.tsx`
- Modify: `src/components/NavBar.tsx`
- Modify: `tests/components/NavBar.test.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`

**Interfaces:**
- Consumes: `AdminAuthProvider` (Task 2), `AdminDashboard` (Task 4).

- [ ] **Step 1: Add the `beheer` translation namespace and `nav.beheer` key to `messages/nl.json`**

In `messages/nl.json`, add `"beheer": "Beheer"` to the existing `"nav"` object (after `"myAccount": "Mijn account"`):

```json
  "nav": {
    "home": "Home",
    "collections": "Collecties",
    "contact": "Contact",
    "becomeClient": "Word klant",
    "login": "Inloggen",
    "logout": "Uitloggen",
    "myOrders": "Mijn bestellingen",
    "myAccount": "Mijn account",
    "beheer": "Beheer"
  },
```

Then replace the file's final 3 lines:

```json
    }
  }
}
```

with:

```json
    }
  },
  "beheer": {
    "title": "Beheer",
    "labelEmail": "E-mailadres",
    "labelPassword": "Wachtwoord",
    "submit": "Inloggen",
    "loginError": "E-mailadres of wachtwoord onjuist.",
    "forgotPassword": "Wachtwoord vergeten?",
    "forgotPasswordMissingEmail": "Vul eerst je e-mailadres in.",
    "forgotPasswordSent": "Er is een e-mail verstuurd om je wachtwoord opnieuw in te stellen.",
    "unauthorized": "Dit account heeft geen toegang tot de beheeromgeving.",
    "loggedInAs": "Ingelogd als {email}",
    "logout": "Uitloggen"
  }
}
```

- [ ] **Step 2: Add the same keys to `messages/en.json`**

In `messages/en.json`, add `"beheer": "Admin"` to the existing `"nav"` object (after `"myAccount": "My account"`):

```json
  "nav": {
    "home": "Home",
    "collections": "Collections",
    "contact": "Contact",
    "becomeClient": "Become a client",
    "login": "Log in",
    "logout": "Log out",
    "myOrders": "My orders",
    "myAccount": "My account",
    "beheer": "Admin"
  },
```

Replace the file's final 3 lines (`    }\n  }\n}`) with:

```json
    }
  },
  "beheer": {
    "title": "Admin",
    "labelEmail": "Email address",
    "labelPassword": "Password",
    "submit": "Log in",
    "loginError": "Email address or password is incorrect.",
    "forgotPassword": "Forgot password?",
    "forgotPasswordMissingEmail": "Please fill in your email address first.",
    "forgotPasswordSent": "An email has been sent to reset your password.",
    "unauthorized": "This account does not have access to the admin area.",
    "loggedInAs": "Logged in as {email}",
    "logout": "Log out"
  }
}
```

- [ ] **Step 3: Add the same keys to `messages/de.json`**

In `messages/de.json`, add `"beheer": "Verwaltung"` to the existing `"nav"` object (after `"myAccount": "Mein Konto"`):

```json
  "nav": {
    "home": "Home",
    "collections": "Kollektionen",
    "contact": "Kontakt",
    "becomeClient": "Kunde werden",
    "login": "Anmelden",
    "logout": "Abmelden",
    "myOrders": "Meine Bestellungen",
    "myAccount": "Mein Konto",
    "beheer": "Verwaltung"
  },
```

Replace the file's final 3 lines with:

```json
    }
  },
  "beheer": {
    "title": "Verwaltung",
    "labelEmail": "E-Mail-Adresse",
    "labelPassword": "Passwort",
    "submit": "Anmelden",
    "loginError": "E-Mail-Adresse oder Passwort falsch.",
    "forgotPassword": "Passwort vergessen?",
    "forgotPasswordMissingEmail": "Bitte zuerst deine E-Mail-Adresse eingeben.",
    "forgotPasswordSent": "Es wurde eine E-Mail zum Zurücksetzen deines Passworts gesendet.",
    "unauthorized": "Dieses Konto hat keinen Zugriff auf den Verwaltungsbereich.",
    "loggedInAs": "Angemeldet als {email}",
    "logout": "Abmelden"
  }
}
```

- [ ] **Step 4: Add the same keys to `messages/fr.json`**

In `messages/fr.json`, add `"beheer": "Gestion"` to the existing `"nav"` object (after `"myAccount": "Mon compte"`):

```json
  "nav": {
    "home": "Accueil",
    "collections": "Collections",
    "contact": "Contact",
    "becomeClient": "Devenir client",
    "login": "Connexion",
    "logout": "Déconnexion",
    "myOrders": "Mes commandes",
    "myAccount": "Mon compte",
    "beheer": "Gestion"
  },
```

Replace the file's final 3 lines with:

```json
    }
  },
  "beheer": {
    "title": "Gestion",
    "labelEmail": "Adresse e-mail",
    "labelPassword": "Mot de passe",
    "submit": "Connexion",
    "loginError": "Adresse e-mail ou mot de passe incorrect.",
    "forgotPassword": "Mot de passe oublié ?",
    "forgotPasswordMissingEmail": "Veuillez d'abord saisir votre adresse e-mail.",
    "forgotPasswordSent": "Un e-mail a été envoyé pour réinitialiser votre mot de passe.",
    "unauthorized": "Ce compte n'a pas accès à l'espace de gestion.",
    "loggedInAs": "Connecté en tant que {email}",
    "logout": "Déconnexion"
  }
}
```

- [ ] **Step 5: Create `src/app/[locale]/beheer/page.tsx`**

```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GlassPanel } from '@/components/GlassPanel';
import { AdminDashboard } from '@/components/beheer/AdminDashboard';

export default async function BeheerPage({
  params,
}: {
  params: { locale: string };
}) {
  const { locale } = params;
  setRequestLocale(locale);
  const t = await getTranslations('beheer');

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-ink via-charcoal to-graphite px-4 pb-16 pt-24 sm:px-8">
      <GlassPanel className="mx-auto mb-10 !max-w-lg text-center">
        <h1 className="text-2xl font-light text-white sm:text-3xl">{t('title')}</h1>
      </GlassPanel>

      <GlassPanel className="mx-auto !max-w-lg">
        <AdminDashboard />
      </GlassPanel>
    </main>
  );
}
```

(No dedicated test file for this page — it's a thin server-component wrapper, same pattern as `src/app/[locale]/account/page.tsx` and `src/app/[locale]/word-klant/page.tsx`, neither of which has its own test file; the logic lives in `AdminDashboard`, already tested in Task 4.)

- [ ] **Step 6: Wire `AdminAuthProvider` into `src/app/[locale]/layout.tsx`**

Modify `src/app/[locale]/layout.tsx`:

```tsx
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { NavBar } from '@/components/NavBar';
import { MockAuthProvider } from '@/lib/useMockAuth';
import { AdminAuthProvider } from '@/lib/useAdminAuth';
import { CartProvider } from '@/lib/useCart';
import { OrdersProvider } from '@/lib/useOrders';
import { ReturnsProvider } from '@/lib/useReturns';
import { MockProfileProvider } from '@/lib/useMockProfile';

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  const { locale } = params;
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider messages={messages}>
      <AdminAuthProvider>
        <MockAuthProvider>
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
        </MockAuthProvider>
      </AdminAuthProvider>
    </NextIntlClientProvider>
  );
}
```

(Only the `AdminAuthProvider` import and wrapping `<AdminAuthProvider>...</AdminAuthProvider>` tags are new — everything inside is unchanged.)

- [ ] **Step 7: Add the "Beheer" link to `src/components/NavBar.tsx`**

Modify the right-side group in `src/components/NavBar.tsx` — add a `Link` to `/beheer` right before `<CartPanel />`, so it's always visible regardless of customer login state:

```tsx
      <div className="flex items-center gap-3">
        {isHydrated && isLoggedIn ? (
          <Link
            href="/account"
            data-testid="account-icon"
            aria-label={t('myAccount')}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-silver text-xs font-semibold text-ink"
          >
            GD
          </Link>
        ) : (
          <>
            <Link
              href="/word-klant"
              data-testid="nav-become-client"
              className="hidden text-xs font-head tracking-[0.15em] text-white/70 hover:text-gold sm:inline"
            >
              {t('becomeClient')}
            </Link>
            <button
              type="button"
              data-testid="nav-login"
              onClick={login}
              className="btn-gold rounded-sm px-4 py-2 text-xs font-head tracking-[0.15em]"
            >
              {t('login')}
            </button>
          </>
        )}
        <Link
          href="/beheer"
          data-testid="nav-beheer"
          className="hidden text-xs font-head tracking-[0.15em] text-white/50 hover:text-white sm:inline"
        >
          {t('beheer')}
        </Link>
        <CartPanel />
        <LanguageSwitcher />
      </div>
```

- [ ] **Step 8: Add a NavBar test for the Beheer link**

In `tests/components/NavBar.test.tsx`, add a new test inside the `describe('NavBar', ...)` block:

```tsx
  it('shows a Beheer link pointing to /beheer', () => {
    renderNavBar();
    expect(screen.getByTestId('nav-beheer')).toHaveAttribute('href', '/beheer');
  });
```

- [ ] **Step 9: Run the full test suite**

Run: `npm test`
Expected: all tests pass, including the new NavBar test and all Task 2–4 tests.

- [ ] **Step 10: Verify the production build still succeeds**

Run: `npm run build`
Expected: build succeeds, `out/` contains a `beheer/` directory per locale (e.g. `out/nl/beheer/index.html`).

- [ ] **Step 11: Commit**

```bash
git add src/app/[locale]/beheer/page.tsx src/app/[locale]/layout.tsx src/components/NavBar.tsx tests/components/NavBar.test.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json
git commit -m "feat: add /beheer route, NavBar link, provider wiring and translations"
```

---

## Task 6: Firestore Security Rules + manual Firebase/GitHub setup

This task has no automated test cycle — it's real infrastructure configuration in services outside this repo (Firebase console, GitHub repo settings), following the same manual, console-driven pattern already used earlier in this project to create the Firebase project, enable Authentication, and create the Firestore database.

**Files:**
- Create: `firestore.rules` (version-controlled source of truth; not auto-deployed — pasted into the console manually per Step 2 below, since this repo has no Firebase CLI/`firebase.json` setup and none is being introduced for this foundation)
- Modify: `.github/workflows/deploy-pages.yml`

- [ ] **Step 1: Create `firestore.rules`**

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /medewerkers/{uid} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow write: if false;
    }
  }
}
```

This is deny-by-default: a signed-in user may only read their *own* `medewerkers` document (used by `useAdminAuth` to determine `isAdmin`), and nothing may be written through the client SDK — `medewerkers` documents are created manually via the Firebase console (Step 3 below), matching the no-self-service-signup decision in the design.

```bash
git add firestore.rules
git commit -m "docs: add Firestore security rules for medewerkers collection"
```

- [ ] **Step 2: Paste the rules into the Firebase console (manual step)**

- Go to [console.firebase.google.com](https://console.firebase.google.com/project/glassart-and-design/firestore) → **Firestore Database** → tab **"Rules"**.
- Replace the existing content with the contents of `firestore.rules` above.
- Click **"Publish"**.

- [ ] **Step 3: Create the 4 `medewerkers` documents (manual step)**

For each of the 4 accounts:
- Go to **Authentication → Users**, copy that user's **UID** (shown in the Users table).
- Go to **Firestore Database → Data**, click **"Start collection"** (or "+" next to an existing `medewerkers` collection after the first one), collection ID `medewerkers`.
- Document ID: paste the UID exactly.
- Add fields: `naam` (string, e.g. `"Paul van den Hout"`) and `email` (string, matching the account's login email).
- Repeat for Julie, Paul, Hem, and Joris.

- [ ] **Step 4: Add the Firebase config as GitHub repository variables (manual step)**

In the GitHub repo → **Settings → Secrets and variables → Actions → Variables tab → "New repository variable"**, add these 6 (values are the same non-secret ones from `.env.local` in Task 1):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIzaSyD1DmZ3N2hV_9FxlZQ824DzwWayJxkPE3k` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `glassart-and-design.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `glassart-and-design` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `glassart-and-design.firebasestorage.app` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `824538894452` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:824538894452:web:3b74285669475b1c73c121` |

- [ ] **Step 5: Update `.github/workflows/deploy-pages.yml` to pass those variables at build time**

Modify the `env:` block of the `"Build static export"` step:

```yaml
      - name: Build static export
        run: npm run build
        env:
          GITHUB_PAGES: 'true'
          NEXT_PUBLIC_FIREBASE_API_KEY: ${{ vars.NEXT_PUBLIC_FIREBASE_API_KEY }}
          NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: ${{ vars.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN }}
          NEXT_PUBLIC_FIREBASE_PROJECT_ID: ${{ vars.NEXT_PUBLIC_FIREBASE_PROJECT_ID }}
          NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: ${{ vars.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET }}
          NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: ${{ vars.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID }}
          NEXT_PUBLIC_FIREBASE_APP_ID: ${{ vars.NEXT_PUBLIC_FIREBASE_APP_ID }}
```

```bash
git add .github/workflows/deploy-pages.yml
git commit -m "ci: pass Firebase config to the static export build"
```

- [ ] **Step 6: End-to-end manual verification**

- Run `npm run dev`, open `/beheer`.
- Log in with one of the 4 accounts (e.g. `joris.vandenbroek@gmail.com`) — expect to land on the "Ingelogd als ..." shell with a working logout button.
- Log out, try an intentionally wrong password — expect the generic error message, no crash.
- Click "Wachtwoord vergeten?" with an email filled in — expect a confirmation message, and check that a reset email actually arrives.
- Confirm `/beheer` is reachable from the "Beheer" link in the nav bar.
