# Klant-accountpagina (dashboard) Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 19-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the small "GD" dropdown with a full `/account` dashboard page (left nav + 6 sections: Bestellingen, Te betalen facturen, Betaalde facturen, Retourneren, Gesprekgeschiedenis, Instellingen), backed by new mock data models for invoices, conversations, returns, and a customer profile.

**Architecture:** New localStorage-backed React Context providers (`useReturns`, `useMockProfile`) follow the exact pattern of the existing `useCart`/`useOrders` hooks. A new `useAllOrders` hook centralizes the order-merge logic currently duplicated in `AccountMenu.tsx` and overlays a "Retour aangemeld" status when a return exists. The `/account` page is a Server Component shell (same pattern as `word-klant/page.tsx`) wrapping a client `AccountDashboard` component that holds the active-section tab state and the login-guard redirect.

**Tech Stack:** Next.js 14 App Router (static export), next-intl v3, Tailwind CSS, Vitest + React Testing Library.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-19-account-dashboard-design.md`.
- No backend — every data source is a `src/data/*.ts` seed array or a localStorage-backed React Context, exactly like the existing `useCart`/`useOrders`/`useMockAuth` hooks.
- `GlassPanel` always applies its own `mx-auto max-w-3xl` regardless of the `className` prop. Any `GlassPanel` placed as a sibling in a `flex`/`grid` row **must** include `w-full` in its `className` (auto margins otherwise disable cross-axis stretch — this bit the Contact page and homepage earlier this project).
- All new user-facing text must exist in all 4 locales: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`.
- New translation namespace: `accountPage` (with nested `invoices`, `returns`, `conversations`, `settings` sub-objects). One new key in the existing `nav` namespace: `myAccount`.
- "Download PDF" is a visual-only button — no real file, no new dependency.
- Returns capture reason (select, 4 fixed options) + free-text note; registering a return overlays that order's displayed status to "Retour aangemeld" everywhere it's shown (via `useAllOrders`), it does not mutate the underlying order record.
- Settings' language-preference field, when changed and saved, actually switches the site locale via `router.replace(pathname, { locale })` from `@/i18n/navigation` — the same mechanism `LanguageSwitcher.tsx` already uses.
- `AccountMenu.tsx` and its test file are deleted as part of this plan (superseded by the new page).

---

### Task 1: Mock data files + `accountPage`/`nav.myAccount` translation keys

**Files:**
- Create: `src/data/mockInvoices.ts`
- Create: `src/data/mockConversations.ts`
- Test: `tests/data/mockInvoices.test.ts`
- Test: `tests/data/mockConversations.test.ts`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`

**Interfaces:**
- Produces: `MockInvoice { id: string; date: string; amount: string; status: 'te-betalen' | 'betaald'; messageKey: string }` and `MOCK_INVOICES: MockInvoice[]` (6 items — 3 `te-betalen`, 3 `betaald`).
- Produces: `MockConversation { id: string; date: string; time: string; messageKey: string }` and `MOCK_CONVERSATIONS: MockConversation[]` (4 items).
- Produces: translation keys `nav.myAccount` and the full `accountPage` namespace (see steps below) — every later task's `t('...')`/`tInvoices('...')`/`tConversations('...')`/`tAccount('...')` call resolves against these exact keys.

- [ ] **Step 1: Write the failing data tests**

`tests/data/mockInvoices.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { MOCK_INVOICES } from '@/data/mockInvoices';

describe('MOCK_INVOICES', () => {
  it('contains exactly 6 mock invoices, 3 due and 3 paid', () => {
    expect(MOCK_INVOICES).toHaveLength(6);
    expect(MOCK_INVOICES.filter((invoice) => invoice.status === 'te-betalen')).toHaveLength(3);
    expect(MOCK_INVOICES.filter((invoice) => invoice.status === 'betaald')).toHaveLength(3);
  });

  it('has a unique id and messageKey for every invoice', () => {
    expect(new Set(MOCK_INVOICES.map((i) => i.id)).size).toBe(MOCK_INVOICES.length);
    expect(new Set(MOCK_INVOICES.map((i) => i.messageKey)).size).toBe(MOCK_INVOICES.length);
  });
});
```

`tests/data/mockConversations.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { MOCK_CONVERSATIONS } from '@/data/mockConversations';

describe('MOCK_CONVERSATIONS', () => {
  it('contains exactly 4 mock conversations', () => {
    expect(MOCK_CONVERSATIONS).toHaveLength(4);
  });

  it('has a unique id and messageKey for every conversation', () => {
    expect(new Set(MOCK_CONVERSATIONS.map((c) => c.id)).size).toBe(MOCK_CONVERSATIONS.length);
    expect(new Set(MOCK_CONVERSATIONS.map((c) => c.messageKey)).size).toBe(MOCK_CONVERSATIONS.length);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- mockInvoices mockConversations`
Expected: FAIL — `Cannot find module '@/data/mockInvoices'` (and the conversations equivalent).

- [ ] **Step 3: Create the data files**

`src/data/mockInvoices.ts`:
```ts
export interface MockInvoice {
  id: string;
  date: string;
  amount: string;
  status: 'te-betalen' | 'betaald';
  messageKey: string;
}

export const MOCK_INVOICES: MockInvoice[] = [
  { id: 'INV-3051', date: '2026-06-20', amount: '€ 645,00', status: 'te-betalen', messageKey: 'invoice1' },
  { id: 'INV-3038', date: '2026-06-05', amount: '€ 289,00', status: 'te-betalen', messageKey: 'invoice2' },
  { id: 'INV-3021', date: '2026-05-22', amount: '€ 1.240,00', status: 'te-betalen', messageKey: 'invoice3' },
  { id: 'INV-2987', date: '2026-04-30', amount: '€ 410,00', status: 'betaald', messageKey: 'invoice4' },
  { id: 'INV-2965', date: '2026-04-14', amount: '€ 875,00', status: 'betaald', messageKey: 'invoice5' },
  { id: 'INV-2942', date: '2026-03-28', amount: '€ 320,00', status: 'betaald', messageKey: 'invoice6' },
];
```

`src/data/mockConversations.ts`:
```ts
export interface MockConversation {
  id: string;
  date: string;
  time: string;
  messageKey: string;
}

export const MOCK_CONVERSATIONS: MockConversation[] = [
  { id: 'CONV-1', date: '2026-07-10', time: '14:32', messageKey: 'conversation1' },
  { id: 'CONV-2', date: '2026-06-24', time: '10:05', messageKey: 'conversation2' },
  { id: 'CONV-3', date: '2026-06-02', time: '16:47', messageKey: 'conversation3' },
  { id: 'CONV-4', date: '2026-05-11', time: '09:18', messageKey: 'conversation4' },
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- mockInvoices mockConversations`
Expected: PASS (4 tests)

- [ ] **Step 5: Add the `nav.myAccount` key and the `accountPage` namespace to all 4 message files**

In `messages/nl.json`, add `"myAccount": "Mijn account"` to the existing `"nav"` object, and add this new top-level key (place it after `"whyUs"`):

```json
  "accountPage": {
    "navOrders": "Bestellingen",
    "navInvoicesDue": "Te betalen facturen",
    "navInvoicesPaid": "Betaalde facturen",
    "navReturns": "Retourneren",
    "navConversations": "Gesprekgeschiedenis",
    "navSettings": "Instellingen",
    "logout": "Uitloggen",
    "invoices": {
      "empty": "Geen facturen gevonden.",
      "downloadPdf": "Download PDF",
      "items": {
        "invoice1": { "description": "Hotel lobby set – 3 panelen" },
        "invoice2": { "description": "Abstract paneel 60x90cm" },
        "invoice3": { "description": "Kantoorproject – 5 panelen" },
        "invoice4": { "description": "Wellness paneel 40x60cm" },
        "invoice5": { "description": "Restaurant wandpaneel 80x120cm" },
        "invoice6": { "description": "Losse haken set" }
      }
    },
    "returns": {
      "selectOrderLabel": "Selecteer een bestelling",
      "reasonLabel": "Reden",
      "reasonDamaged": "Beschadigd",
      "reasonNotAsExpected": "Voldoet niet aan verwachting",
      "reasonWrongOrder": "Verkeerd besteld",
      "reasonOther": "Anders",
      "noteLabel": "Toelichting",
      "submit": "Meld aan voor retour",
      "confirmationTitle": "Retour aangemeld",
      "confirmationMessage": "We nemen contact met u op over de afhandeling.",
      "noEligibleOrders": "Er zijn geen bestellingen beschikbaar om te retourneren.",
      "existingReturnsTitle": "Eerder aangemelde retouren",
      "statusRegistered": "Retour aangemeld"
    },
    "conversations": {
      "empty": "Geen gesprekken gevonden.",
      "items": {
        "conversation1": { "topic": "Vraag over levertijd" },
        "conversation2": { "topic": "Offerte hotelproject" },
        "conversation3": { "topic": "Vraag over montage" },
        "conversation4": { "topic": "Wijziging afleveradres" }
      }
    },
    "settings": {
      "labelCompanyName": "Bedrijfsnaam",
      "labelContactPerson": "Contactpersoon",
      "labelEmail": "E-mailadres",
      "labelPhone": "Telefoonnummer",
      "labelAddress": "Adres",
      "labelPostcode": "Postcode",
      "labelCity": "Plaats",
      "labelContactPreference": "Hoe wilt u gecontacteerd worden?",
      "contactPreferenceEmail": "E-mail",
      "contactPreferencePhone": "Telefonisch",
      "contactPreferenceWhatsapp": "WhatsApp",
      "labelLanguagePreference": "Taalvoorkeur",
      "labelPassword": "Wachtwoord",
      "labelPasswordConfirm": "Wachtwoord opnieuw",
      "passwordMismatch": "Wachtwoorden komen niet overeen.",
      "save": "Opslaan",
      "saved": "Opgeslagen!"
    }
  }
```

In `messages/en.json`, add `"myAccount": "My account"` to `"nav"`, and:

```json
  "accountPage": {
    "navOrders": "Orders",
    "navInvoicesDue": "Invoices due",
    "navInvoicesPaid": "Paid invoices",
    "navReturns": "Returns",
    "navConversations": "Conversation history",
    "navSettings": "Settings",
    "logout": "Log out",
    "invoices": {
      "empty": "No invoices found.",
      "downloadPdf": "Download PDF",
      "items": {
        "invoice1": { "description": "Hotel lobby set – 3 panels" },
        "invoice2": { "description": "Abstract panel 60x90cm" },
        "invoice3": { "description": "Office project – 5 panels" },
        "invoice4": { "description": "Wellness panel 40x60cm" },
        "invoice5": { "description": "Restaurant wall panel 80x120cm" },
        "invoice6": { "description": "Loose hooks set" }
      }
    },
    "returns": {
      "selectOrderLabel": "Select an order",
      "reasonLabel": "Reason",
      "reasonDamaged": "Damaged",
      "reasonNotAsExpected": "Not as expected",
      "reasonWrongOrder": "Ordered by mistake",
      "reasonOther": "Other",
      "noteLabel": "Note",
      "submit": "Register for return",
      "confirmationTitle": "Return registered",
      "confirmationMessage": "We'll get in touch about the next steps.",
      "noEligibleOrders": "No orders are available for return.",
      "existingReturnsTitle": "Previously registered returns",
      "statusRegistered": "Return registered"
    },
    "conversations": {
      "empty": "No conversations found.",
      "items": {
        "conversation1": { "topic": "Question about delivery time" },
        "conversation2": { "topic": "Hotel project quote" },
        "conversation3": { "topic": "Question about mounting" },
        "conversation4": { "topic": "Delivery address change" }
      }
    },
    "settings": {
      "labelCompanyName": "Company name",
      "labelContactPerson": "Contact person",
      "labelEmail": "Email address",
      "labelPhone": "Phone number",
      "labelAddress": "Address",
      "labelPostcode": "Postal code",
      "labelCity": "City",
      "labelContactPreference": "How would you like to be contacted?",
      "contactPreferenceEmail": "Email",
      "contactPreferencePhone": "Phone",
      "contactPreferenceWhatsapp": "WhatsApp",
      "labelLanguagePreference": "Language preference",
      "labelPassword": "Password",
      "labelPasswordConfirm": "Confirm password",
      "passwordMismatch": "Passwords do not match.",
      "save": "Save",
      "saved": "Saved!"
    }
  }
```

In `messages/de.json`, add `"myAccount": "Mein Konto"` to `"nav"`, and:

```json
  "accountPage": {
    "navOrders": "Bestellungen",
    "navInvoicesDue": "Offene Rechnungen",
    "navInvoicesPaid": "Bezahlte Rechnungen",
    "navReturns": "Retouren",
    "navConversations": "Gesprächsverlauf",
    "navSettings": "Einstellungen",
    "logout": "Abmelden",
    "invoices": {
      "empty": "Keine Rechnungen gefunden.",
      "downloadPdf": "PDF herunterladen",
      "items": {
        "invoice1": { "description": "Hotel-Lobby-Set – 3 Paneele" },
        "invoice2": { "description": "Abstraktes Panel 60x90cm" },
        "invoice3": { "description": "Büroprojekt – 5 Paneele" },
        "invoice4": { "description": "Wellness-Panel 40x60cm" },
        "invoice5": { "description": "Restaurant-Wandpaneel 80x120cm" },
        "invoice6": { "description": "Lose Haken-Set" }
      }
    },
    "returns": {
      "selectOrderLabel": "Bestellung auswählen",
      "reasonLabel": "Grund",
      "reasonDamaged": "Beschädigt",
      "reasonNotAsExpected": "Entspricht nicht den Erwartungen",
      "reasonWrongOrder": "Versehentlich bestellt",
      "reasonOther": "Sonstiges",
      "noteLabel": "Anmerkung",
      "submit": "Für Retoure anmelden",
      "confirmationTitle": "Retoure angemeldet",
      "confirmationMessage": "Wir melden uns bezüglich der weiteren Schritte.",
      "noEligibleOrders": "Es sind keine Bestellungen für eine Retoure verfügbar.",
      "existingReturnsTitle": "Bisher angemeldete Retouren",
      "statusRegistered": "Retoure angemeldet"
    },
    "conversations": {
      "empty": "Keine Gespräche gefunden.",
      "items": {
        "conversation1": { "topic": "Frage zur Lieferzeit" },
        "conversation2": { "topic": "Angebot Hotelprojekt" },
        "conversation3": { "topic": "Frage zur Montage" },
        "conversation4": { "topic": "Änderung der Lieferadresse" }
      }
    },
    "settings": {
      "labelCompanyName": "Firmenname",
      "labelContactPerson": "Ansprechpartner",
      "labelEmail": "E-Mail-Adresse",
      "labelPhone": "Telefonnummer",
      "labelAddress": "Adresse",
      "labelPostcode": "Postleitzahl",
      "labelCity": "Ort",
      "labelContactPreference": "Wie möchten Sie kontaktiert werden?",
      "contactPreferenceEmail": "E-Mail",
      "contactPreferencePhone": "Telefonisch",
      "contactPreferenceWhatsapp": "WhatsApp",
      "labelLanguagePreference": "Sprachpräferenz",
      "labelPassword": "Passwort",
      "labelPasswordConfirm": "Passwort wiederholen",
      "passwordMismatch": "Die Passwörter stimmen nicht überein.",
      "save": "Speichern",
      "saved": "Gespeichert!"
    }
  }
```

In `messages/fr.json`, add `"myAccount": "Mon compte"` to `"nav"`, and:

```json
  "accountPage": {
    "navOrders": "Commandes",
    "navInvoicesDue": "Factures à payer",
    "navInvoicesPaid": "Factures payées",
    "navReturns": "Retours",
    "navConversations": "Historique des conversations",
    "navSettings": "Paramètres",
    "logout": "Déconnexion",
    "invoices": {
      "empty": "Aucune facture trouvée.",
      "downloadPdf": "Télécharger le PDF",
      "items": {
        "invoice1": { "description": "Ensemble hall d'hôtel – 3 panneaux" },
        "invoice2": { "description": "Panneau abstrait 60x90cm" },
        "invoice3": { "description": "Projet de bureau – 5 panneaux" },
        "invoice4": { "description": "Panneau bien-être 40x60cm" },
        "invoice5": { "description": "Panneau mural restaurant 80x120cm" },
        "invoice6": { "description": "Jeu de crochets supplémentaires" }
      }
    },
    "returns": {
      "selectOrderLabel": "Sélectionnez une commande",
      "reasonLabel": "Motif",
      "reasonDamaged": "Endommagé",
      "reasonNotAsExpected": "Ne correspond pas aux attentes",
      "reasonWrongOrder": "Commandé par erreur",
      "reasonOther": "Autre",
      "noteLabel": "Remarque",
      "submit": "Signaler pour retour",
      "confirmationTitle": "Retour enregistré",
      "confirmationMessage": "Nous vous contacterons pour la suite.",
      "noEligibleOrders": "Aucune commande n'est disponible pour un retour.",
      "existingReturnsTitle": "Retours signalés précédemment",
      "statusRegistered": "Retour enregistré"
    },
    "conversations": {
      "empty": "Aucune conversation trouvée.",
      "items": {
        "conversation1": { "topic": "Question sur le délai de livraison" },
        "conversation2": { "topic": "Devis projet hôtel" },
        "conversation3": { "topic": "Question sur le montage" },
        "conversation4": { "topic": "Changement d'adresse de livraison" }
      }
    },
    "settings": {
      "labelCompanyName": "Nom de l'entreprise",
      "labelContactPerson": "Personne de contact",
      "labelEmail": "Adresse e-mail",
      "labelPhone": "Numéro de téléphone",
      "labelAddress": "Adresse",
      "labelPostcode": "Code postal",
      "labelCity": "Ville",
      "labelContactPreference": "Comment souhaitez-vous être contacté(e) ?",
      "contactPreferenceEmail": "E-mail",
      "contactPreferencePhone": "Téléphone",
      "contactPreferenceWhatsapp": "WhatsApp",
      "labelLanguagePreference": "Préférence linguistique",
      "labelPassword": "Mot de passe",
      "labelPasswordConfirm": "Confirmer le mot de passe",
      "passwordMismatch": "Les mots de passe ne correspondent pas.",
      "save": "Enregistrer",
      "saved": "Enregistré !"
    }
  }
```

- [ ] **Step 6: Verify all 4 files are still valid JSON with matching key sets**

Run:
```bash
node -e "
const nl = require('./messages/nl.json');
const en = require('./messages/en.json');
const de = require('./messages/de.json');
const fr = require('./messages/fr.json');
function keys(obj, prefix = '') {
  return Object.entries(obj).flatMap(([k, v]) =>
    typeof v === 'object' && v !== null ? keys(v, prefix + k + '.') : [prefix + k]
  );
}
const a = keys(nl).sort();
for (const [name, obj] of [['en', en], ['de', de], ['fr', fr]]) {
  const b = keys(obj).sort();
  const diff = a.filter((k) => !b.includes(k)).concat(b.filter((k) => !a.includes(k)));
  console.log(name, diff.length === 0 ? 'OK' : diff);
}
"
```
Expected: `en OK`, `de OK`, `fr OK`

- [ ] **Step 7: Commit**

```bash
git add src/data/mockInvoices.ts src/data/mockConversations.ts tests/data/mockInvoices.test.ts tests/data/mockConversations.test.ts messages/nl.json messages/en.json messages/de.json messages/fr.json
git commit -m "feat: add invoice/conversation mock data and accountPage translations"
```

---

### Task 2: `useReturns` hook + wire into layout

**Files:**
- Create: `src/lib/useReturns.tsx`
- Test: `tests/lib/useReturns.test.ts`
- Modify: `src/app/[locale]/layout.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ReturnRequest { reason: string; note: string; date: string }`, `ReturnsProvider`, `useReturns(): { returnsByOrderId: Record<string, ReturnRequest>; isHydrated: boolean; registerReturn: (orderId: string, reason: string, note: string) => void }`. Task 4 (`useAllOrders`) and Task 8 (`ReturnsSection`) consume this hook directly.

- [ ] **Step 1: Write the failing test**

`tests/lib/useReturns.test.ts`:
```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { ReturnsProvider, useReturns } from '@/lib/useReturns';

beforeEach(() => {
  window.localStorage.clear();
});

describe('useReturns', () => {
  it('starts with no returns, hydrated after mount', () => {
    const { result } = renderHook(() => useReturns(), { wrapper: ReturnsProvider });
    expect(result.current.isHydrated).toBe(true);
    expect(result.current.returnsByOrderId).toEqual({});
  });

  it('registers a return and persists it to localStorage', () => {
    const { result } = renderHook(() => useReturns(), { wrapper: ReturnsProvider });
    act(() => {
      result.current.registerReturn('GD-10234', 'Beschadigd', 'Glas gebarsten bij aankomst');
    });
    expect(result.current.returnsByOrderId['GD-10234']).toMatchObject({
      reason: 'Beschadigd',
      note: 'Glas gebarsten bij aankomst',
    });
    expect(result.current.returnsByOrderId['GD-10234'].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const stored = JSON.parse(window.localStorage.getItem('glassart-returns') ?? '{}');
    expect(stored['GD-10234']).toBeDefined();
  });

  it('keeps existing returns when registering a new one', () => {
    const { result } = renderHook(() => useReturns(), { wrapper: ReturnsProvider });
    act(() => {
      result.current.registerReturn('GD-10234', 'Beschadigd', 'Note A');
    });
    act(() => {
      result.current.registerReturn('GD-10221', 'Anders', 'Note B');
    });
    expect(Object.keys(result.current.returnsByOrderId)).toHaveLength(2);
  });

  it('throws when used outside a ReturnsProvider', () => {
    expect(() => renderHook(() => useReturns())).toThrow(
      'useReturns must be used within a ReturnsProvider'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- useReturns`
Expected: FAIL — `Cannot find module '@/lib/useReturns'`

- [ ] **Step 3: Implement `useReturns.tsx`**

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

const STORAGE_KEY = 'glassart-returns';

export interface ReturnRequest {
  reason: string;
  note: string;
  date: string;
}

interface ReturnsValue {
  returnsByOrderId: Record<string, ReturnRequest>;
  isHydrated: boolean;
  registerReturn: (orderId: string, reason: string, note: string) => void;
}

const ReturnsContext = createContext<ReturnsValue | null>(null);

export function ReturnsProvider({ children }: { children: ReactNode }) {
  const [returnsByOrderId, setReturnsByOrderId] = useState<Record<string, ReturnRequest>>({});
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setReturnsByOrderId(JSON.parse(stored));
      } catch {
        setReturnsByOrderId({});
      }
    }
    setIsHydrated(true);
  }, []);

  const registerReturn = useCallback((orderId: string, reason: string, note: string) => {
    setReturnsByOrderId((current) => {
      const next = {
        ...current,
        [orderId]: { reason, note, date: new Date().toISOString().slice(0, 10) },
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ returnsByOrderId, isHydrated, registerReturn }),
    [returnsByOrderId, isHydrated, registerReturn]
  );

  return <ReturnsContext.Provider value={value}>{children}</ReturnsContext.Provider>;
}

export function useReturns(): ReturnsValue {
  const context = useContext(ReturnsContext);
  if (!context) {
    throw new Error('useReturns must be used within a ReturnsProvider');
  }
  return context;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- useReturns`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire `ReturnsProvider` into the layout**

In `src/app/[locale]/layout.tsx`, add the import:
```tsx
import { ReturnsProvider } from '@/lib/useReturns';
```
and wrap `OrdersProvider`'s children with it:
```tsx
          <OrdersProvider>
            <ReturnsProvider>
              <NavBar />
              {children}
            </ReturnsProvider>
          </OrdersProvider>
```

- [ ] **Step 6: Run the full test suite to confirm nothing else broke**

Run: `npm test`
Expected: all existing tests still PASS, plus the 4 new `useReturns` tests.

- [ ] **Step 7: Commit**

```bash
git add src/lib/useReturns.tsx tests/lib/useReturns.test.ts src/app/[locale]/layout.tsx
git commit -m "feat: add useReturns hook for mock return requests"
```

---

### Task 3: `useMockProfile` hook + wire into layout

**Files:**
- Create: `src/lib/useMockProfile.tsx`
- Test: `tests/lib/useMockProfile.test.ts`
- Modify: `src/app/[locale]/layout.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `ContactPreference = 'email' | 'phone' | 'whatsapp'`, `LanguagePreference = 'nl' | 'en' | 'de' | 'fr'`, `MockProfile { companyName, contactPerson, email, phone, address, postcode, city, contactPreference: ContactPreference, languagePreference: LanguagePreference, password: string }`, `MockProfileProvider`, `useMockProfile(): { profile: MockProfile; isHydrated: boolean; updateProfile: (partial: Partial<MockProfile>) => void }`. Task 10 (`SettingsSection`) consumes this directly.

- [ ] **Step 1: Write the failing test**

`tests/lib/useMockProfile.test.ts`:
```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MockProfileProvider, useMockProfile } from '@/lib/useMockProfile';

beforeEach(() => {
  window.localStorage.clear();
});

describe('useMockProfile', () => {
  it('seeds a default profile and is hydrated after mount', () => {
    const { result } = renderHook(() => useMockProfile(), { wrapper: MockProfileProvider });
    expect(result.current.isHydrated).toBe(true);
    expect(result.current.profile.companyName).toBe('Hotel De Zilveren Zwaan');
    expect(result.current.profile.contactPreference).toBe('email');
    expect(result.current.profile.languagePreference).toBe('nl');
  });

  it('updates and persists a partial profile change', () => {
    const { result } = renderHook(() => useMockProfile(), { wrapper: MockProfileProvider });
    act(() => {
      result.current.updateProfile({ email: 'nieuw@example.com', languagePreference: 'en' });
    });
    expect(result.current.profile.email).toBe('nieuw@example.com');
    expect(result.current.profile.languagePreference).toBe('en');
    expect(result.current.profile.companyName).toBe('Hotel De Zilveren Zwaan');
    const stored = JSON.parse(window.localStorage.getItem('glassart-mock-profile') ?? '{}');
    expect(stored.email).toBe('nieuw@example.com');
  });

  it('restores a previously saved profile from localStorage on mount', () => {
    window.localStorage.setItem(
      'glassart-mock-profile',
      JSON.stringify({ companyName: 'Restored BV' })
    );
    const { result } = renderHook(() => useMockProfile(), { wrapper: MockProfileProvider });
    expect(result.current.profile.companyName).toBe('Restored BV');
  });

  it('throws when used outside a MockProfileProvider', () => {
    expect(() => renderHook(() => useMockProfile())).toThrow(
      'useMockProfile must be used within a MockProfileProvider'
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- useMockProfile`
Expected: FAIL — `Cannot find module '@/lib/useMockProfile'`

- [ ] **Step 3: Implement `useMockProfile.tsx`**

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

const STORAGE_KEY = 'glassart-mock-profile';

export type ContactPreference = 'email' | 'phone' | 'whatsapp';
export type LanguagePreference = 'nl' | 'en' | 'de' | 'fr';

export interface MockProfile {
  companyName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  postcode: string;
  city: string;
  contactPreference: ContactPreference;
  languagePreference: LanguagePreference;
  password: string;
}

const DEFAULT_PROFILE: MockProfile = {
  companyName: 'Hotel De Zilveren Zwaan',
  contactPerson: 'Anne de Vries',
  email: 'anne@dezilverenzwaan.nl',
  phone: '0612345678',
  address: 'Kerkstraat 12',
  postcode: '1234 AB',
  city: 'Amsterdam',
  contactPreference: 'email',
  languagePreference: 'nl',
  password: 'geheim123',
};

interface MockProfileValue {
  profile: MockProfile;
  isHydrated: boolean;
  updateProfile: (partial: Partial<MockProfile>) => void;
}

const MockProfileContext = createContext<MockProfileValue | null>(null);

export function MockProfileProvider({ children }: { children: ReactNode }) {
  const [profile, setProfile] = useState<MockProfile>(DEFAULT_PROFILE);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setProfile({ ...DEFAULT_PROFILE, ...JSON.parse(stored) });
      } catch {
        setProfile(DEFAULT_PROFILE);
      }
    }
    setIsHydrated(true);
  }, []);

  const updateProfile = useCallback((partial: Partial<MockProfile>) => {
    setProfile((current) => {
      const next = { ...current, ...partial };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({ profile, isHydrated, updateProfile }),
    [profile, isHydrated, updateProfile]
  );

  return <MockProfileContext.Provider value={value}>{children}</MockProfileContext.Provider>;
}

export function useMockProfile(): MockProfileValue {
  const context = useContext(MockProfileContext);
  if (!context) {
    throw new Error('useMockProfile must be used within a MockProfileProvider');
  }
  return context;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- useMockProfile`
Expected: PASS (4 tests)

- [ ] **Step 5: Wire `MockProfileProvider` into the layout**

In `src/app/[locale]/layout.tsx`, add the import:
```tsx
import { MockProfileProvider } from '@/lib/useMockProfile';
```
and wrap `ReturnsProvider`'s children with it:
```tsx
            <ReturnsProvider>
              <MockProfileProvider>
                <NavBar />
                {children}
              </MockProfileProvider>
            </ReturnsProvider>
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all existing tests still PASS, plus the 4 new `useMockProfile` tests.

- [ ] **Step 7: Commit**

```bash
git add src/lib/useMockProfile.tsx tests/lib/useMockProfile.test.ts src/app/[locale]/layout.tsx
git commit -m "feat: add useMockProfile hook for mock customer profile"
```

---

### Task 4: `useAllOrders` hook

**Files:**
- Create: `src/lib/useAllOrders.tsx`
- Test: `tests/lib/useAllOrders.test.tsx`

**Interfaces:**
- Consumes: `useOrders()` (from `src/lib/useOrders.tsx`, produces `placedOrders: PlacedOrder[]`), `useReturns()` (Task 2, produces `returnsByOrderId`), `MOCK_ORDERS` (from `src/data/mockOrders.ts`), translations `orders.items.<key>.description` / `.status` and `accountPage.returns.statusRegistered`.
- Produces: `DisplayOrder { id: string; date: string; description: string; status: string; hasReturnRequest: boolean }`, `useAllOrders(): DisplayOrder[]`. Consumed by Task 6 (`OrdersSection`) and Task 8 (`ReturnsSection`).

- [ ] **Step 1: Write the failing test**

`tests/lib/useAllOrders.test.tsx`:
```tsx
import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { OrdersProvider, useOrders } from '@/lib/useOrders';
import { ReturnsProvider, useReturns } from '@/lib/useReturns';
import { useAllOrders } from '@/lib/useAllOrders';
import messages from '../../messages/nl.json';

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="nl" messages={messages}>
      <OrdersProvider>
        <ReturnsProvider>{children}</ReturnsProvider>
      </OrdersProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('useAllOrders', () => {
  it('returns the 4 seed orders with translated description/status when nothing else exists', () => {
    const { result } = renderHook(() => useAllOrders(), { wrapper });
    expect(result.current).toHaveLength(4);
    const seedOrder = result.current.find((o) => o.id === 'GD-10234');
    expect(seedOrder?.description).toBe('Abstract paneel 60x90cm');
    expect(seedOrder?.status).toBe('In behandeling');
    expect(seedOrder?.hasReturnRequest).toBe(false);
  });

  it('places a newly placed order before the seed orders', () => {
    const { result } = renderHook(
      () => ({ orders: useAllOrders(), placeOrder: useOrders().placeOrder }),
      { wrapper }
    );
    act(() => {
      result.current.placeOrder('Nieuwe bestelling', 'Aangevraagd');
    });
    expect(result.current.orders).toHaveLength(5);
    expect(result.current.orders[0].description).toBe('Nieuwe bestelling');
  });

  it('overlays "Retour aangemeld" status for an order with a registered return', () => {
    const { result } = renderHook(
      () => ({ orders: useAllOrders(), registerReturn: useReturns().registerReturn }),
      { wrapper }
    );
    act(() => {
      result.current.registerReturn('GD-10234', 'Beschadigd', 'Kapot aangekomen');
    });
    const order = result.current.orders.find((o) => o.id === 'GD-10234');
    expect(order?.status).toBe('Retour aangemeld');
    expect(order?.hasReturnRequest).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- useAllOrders`
Expected: FAIL — `Cannot find module '@/lib/useAllOrders'`

- [ ] **Step 3: Implement `useAllOrders.tsx`**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { MOCK_ORDERS } from '@/data/mockOrders';
import { useOrders } from './useOrders';
import { useReturns } from './useReturns';

export interface DisplayOrder {
  id: string;
  date: string;
  description: string;
  status: string;
  hasReturnRequest: boolean;
}

export function useAllOrders(): DisplayOrder[] {
  const tOrders = useTranslations('orders');
  const tAccount = useTranslations('accountPage');
  const { placedOrders } = useOrders();
  const { returnsByOrderId } = useReturns();

  return useMemo(() => {
    const placed: DisplayOrder[] = placedOrders.map((order) => ({
      id: order.id,
      date: order.date,
      description: order.description,
      status: order.status,
      hasReturnRequest: false,
    }));

    const seeded: DisplayOrder[] = MOCK_ORDERS.map((order) => ({
      id: order.id,
      date: order.date,
      description: tOrders(`items.${order.messageKey}.description`),
      status: tOrders(`items.${order.messageKey}.status`),
      hasReturnRequest: false,
    }));

    return [...placed, ...seeded].map((order) => {
      const hasReturnRequest = Boolean(returnsByOrderId[order.id]);
      return {
        ...order,
        status: hasReturnRequest ? tAccount('returns.statusRegistered') : order.status,
        hasReturnRequest,
      };
    });
  }, [placedOrders, returnsByOrderId, tOrders, tAccount]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- useAllOrders`
Expected: PASS (3 tests)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/useAllOrders.tsx tests/lib/useAllOrders.test.tsx
git commit -m "feat: add useAllOrders hook merging placed+seed orders with return status overlay"
```

---

### Task 5: `AccountNav` component

**Files:**
- Create: `src/components/account/AccountNav.tsx`
- Test: `tests/components/account/AccountNav.test.tsx`

**Interfaces:**
- Consumes: `useMockAuth()` (for `logout`), translations `accountPage.nav*` and `accountPage.logout`.
- Produces: `AccountSection = 'orders' | 'invoicesDue' | 'invoicesPaid' | 'returns' | 'conversations' | 'settings'`, `AccountNav({ activeSection: AccountSection; onSelect: (section: AccountSection) => void })`. Task 11 (`AccountDashboard`) consumes `AccountSection` and renders `<AccountNav>`.

- [ ] **Step 1: Write the failing test**

`tests/components/account/AccountNav.test.tsx`:
```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MockAuthProvider } from '@/lib/useMockAuth';
import { AccountNav } from '@/components/account/AccountNav';
import messages from '../../../messages/nl.json';

function renderNav(activeSection: 'orders' | 'settings' = 'orders') {
  const onSelect = vi.fn();
  render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <MockAuthProvider>
        <AccountNav activeSection={activeSection} onSelect={onSelect} />
      </MockAuthProvider>
    </NextIntlClientProvider>
  );
  return { onSelect };
}

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

  it('calls logout (clearing localStorage) when the logout button is clicked', () => {
    window.localStorage.setItem('glassart-mock-logged-in', 'true');
    renderNav();
    fireEvent.click(screen.getByTestId('account-nav-logout'));
    expect(window.localStorage.getItem('glassart-mock-logged-in')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- AccountNav`
Expected: FAIL — `Cannot find module '@/components/account/AccountNav'`

- [ ] **Step 3: Implement `AccountNav.tsx`**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useMockAuth } from '@/lib/useMockAuth';

export type AccountSection =
  | 'orders'
  | 'invoicesDue'
  | 'invoicesPaid'
  | 'returns'
  | 'conversations'
  | 'settings';

interface AccountNavProps {
  activeSection: AccountSection;
  onSelect: (section: AccountSection) => void;
}

const SECTIONS: { id: AccountSection; labelKey: string }[] = [
  { id: 'orders', labelKey: 'navOrders' },
  { id: 'invoicesDue', labelKey: 'navInvoicesDue' },
  { id: 'invoicesPaid', labelKey: 'navInvoicesPaid' },
  { id: 'returns', labelKey: 'navReturns' },
  { id: 'conversations', labelKey: 'navConversations' },
  { id: 'settings', labelKey: 'navSettings' },
];

export function AccountNav({ activeSection, onSelect }: AccountNavProps) {
  const t = useTranslations('accountPage');
  const { logout } = useMockAuth();

  return (
    <nav data-testid="account-nav" className="flex flex-col gap-1 text-xs tracking-wide">
      {SECTIONS.map((section) => (
        <button
          key={section.id}
          type="button"
          data-testid={`account-nav-${section.id}`}
          aria-current={activeSection === section.id ? 'true' : undefined}
          onClick={() => onSelect(section.id)}
          className={`rounded-sm px-3 py-2 text-left ${
            activeSection === section.id
              ? 'bg-white/15 text-white'
              : 'text-white/60 hover:bg-white/10 hover:text-white'
          }`}
        >
          {t(section.labelKey)}
        </button>
      ))}
      <button
        type="button"
        data-testid="account-nav-logout"
        onClick={logout}
        className="mt-4 rounded-sm border border-white/20 px-3 py-2 text-left text-white/60 hover:bg-white/10 hover:text-white"
      >
        {t('logout')}
      </button>
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- AccountNav`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/account/AccountNav.tsx tests/components/account/AccountNav.test.tsx
git commit -m "feat: add AccountNav left-menu component"
```

---

### Task 6: `OrdersSection` component

**Files:**
- Create: `src/components/account/OrdersSection.tsx`
- Test: `tests/components/account/OrdersSection.test.tsx`

**Interfaces:**
- Consumes: `useAllOrders()` (Task 4), translation `accountPage.navOrders`.
- Produces: `OrdersSection()`. Consumed by Task 11 (`AccountDashboard`).

- [ ] **Step 1: Write the failing test**

`tests/components/account/OrdersSection.test.tsx`:
```tsx
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { OrdersProvider } from '@/lib/useOrders';
import { ReturnsProvider } from '@/lib/useReturns';
import { OrdersSection } from '@/components/account/OrdersSection';
import messages from '../../../messages/nl.json';

function renderSection() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <OrdersProvider>
        <ReturnsProvider>
          <OrdersSection />
        </ReturnsProvider>
      </OrdersProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('OrdersSection', () => {
  it('renders all 4 seed orders with description and status', () => {
    renderSection();
    expect(screen.getByTestId('account-order-GD-10234')).toBeInTheDocument();
    expect(screen.getByTestId('account-order-GD-10221')).toBeInTheDocument();
    expect(screen.getByTestId('account-order-GD-10198')).toBeInTheDocument();
    expect(screen.getByTestId('account-order-GD-10177')).toBeInTheDocument();
    expect(screen.getByText('Abstract paneel 60x90cm')).toBeInTheDocument();
    expect(screen.getByText('In behandeling')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- OrdersSection`
Expected: FAIL — `Cannot find module '@/components/account/OrdersSection'`

- [ ] **Step 3: Implement `OrdersSection.tsx`**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { useAllOrders } from '@/lib/useAllOrders';

export function OrdersSection() {
  const t = useTranslations('accountPage');
  const orders = useAllOrders();

  return (
    <div data-testid="orders-section">
      <p className="mb-3 text-[0.65rem] uppercase tracking-[0.2em] text-white/50">
        {t('navOrders')}
      </p>
      <ul className="flex flex-col gap-3">
        {orders.map((order) => (
          <li
            key={order.id}
            data-testid={`account-order-${order.id}`}
            className="text-xs text-white/80"
          >
            <div className="flex items-center justify-between">
              <span>{order.id}</span>
              <span className="text-white/50">{order.date}</span>
            </div>
            <p>{order.description}</p>
            <p className="mt-1 text-white/50">{order.status}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- OrdersSection`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/components/account/OrdersSection.tsx tests/components/account/OrdersSection.test.tsx
git commit -m "feat: add OrdersSection component"
```

---

### Task 7: `InvoicesDueSection` + `InvoicesPaidSection` components

**Files:**
- Create: `src/components/account/InvoicesDueSection.tsx`
- Create: `src/components/account/InvoicesPaidSection.tsx`
- Test: `tests/components/account/InvoicesDueSection.test.tsx`
- Test: `tests/components/account/InvoicesPaidSection.test.tsx`

**Interfaces:**
- Consumes: `MOCK_INVOICES` (Task 1), translations `accountPage.navInvoicesDue`/`navInvoicesPaid` and `accountPage.invoices.*`.
- Produces: `InvoicesDueSection()`, `InvoicesPaidSection()`. Consumed by Task 11 (`AccountDashboard`).

- [ ] **Step 1: Write the failing tests**

`tests/components/account/InvoicesDueSection.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { InvoicesDueSection } from '@/components/account/InvoicesDueSection';
import messages from '../../../messages/nl.json';

function renderSection() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <InvoicesDueSection />
    </NextIntlClientProvider>
  );
}

describe('InvoicesDueSection', () => {
  it('renders exactly the 3 "te-betalen" invoices with amount, no download button', () => {
    renderSection();
    expect(screen.getByTestId('invoice-due-INV-3051')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-due-INV-3038')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-due-INV-3021')).toBeInTheDocument();
    expect(screen.queryByTestId('invoice-due-INV-2987')).not.toBeInTheDocument();
    expect(screen.getByText('€ 645,00')).toBeInTheDocument();
    expect(screen.queryByTestId('invoice-download-INV-3051')).not.toBeInTheDocument();
  });
});
```

`tests/components/account/InvoicesPaidSection.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { InvoicesPaidSection } from '@/components/account/InvoicesPaidSection';
import messages from '../../../messages/nl.json';

function renderSection() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <InvoicesPaidSection />
    </NextIntlClientProvider>
  );
}

describe('InvoicesPaidSection', () => {
  it('renders exactly the 3 "betaald" invoices, each with a Download PDF button', () => {
    renderSection();
    expect(screen.getByTestId('invoice-paid-INV-2987')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-paid-INV-2965')).toBeInTheDocument();
    expect(screen.getByTestId('invoice-paid-INV-2942')).toBeInTheDocument();
    expect(screen.queryByTestId('invoice-paid-INV-3051')).not.toBeInTheDocument();
    expect(screen.getByTestId('invoice-download-INV-2987')).toHaveTextContent('Download PDF');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- InvoicesDueSection InvoicesPaidSection`
Expected: FAIL — both modules not found.

- [ ] **Step 3: Implement both components**

`src/components/account/InvoicesDueSection.tsx`:
```tsx
'use client';

import { useTranslations } from 'next-intl';
import { MOCK_INVOICES } from '@/data/mockInvoices';

export function InvoicesDueSection() {
  const t = useTranslations('accountPage');
  const tInvoices = useTranslations('accountPage.invoices');
  const invoices = MOCK_INVOICES.filter((invoice) => invoice.status === 'te-betalen');

  return (
    <div data-testid="invoices-due-section">
      <p className="mb-3 text-[0.65rem] uppercase tracking-[0.2em] text-white/50">
        {t('navInvoicesDue')}
      </p>
      {invoices.length === 0 ? (
        <p className="text-xs text-white/60">{tInvoices('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {invoices.map((invoice) => (
            <li
              key={invoice.id}
              data-testid={`invoice-due-${invoice.id}`}
              className="text-xs text-white/80"
            >
              <div className="flex items-center justify-between">
                <span>{invoice.id}</span>
                <span className="text-white/50">{invoice.date}</span>
              </div>
              <p>{tInvoices(`items.${invoice.messageKey}.description`)}</p>
              <p className="mt-1 text-white/50">{invoice.amount}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

`src/components/account/InvoicesPaidSection.tsx`:
```tsx
'use client';

import { useTranslations } from 'next-intl';
import { MOCK_INVOICES } from '@/data/mockInvoices';

export function InvoicesPaidSection() {
  const t = useTranslations('accountPage');
  const tInvoices = useTranslations('accountPage.invoices');
  const invoices = MOCK_INVOICES.filter((invoice) => invoice.status === 'betaald');

  return (
    <div data-testid="invoices-paid-section">
      <p className="mb-3 text-[0.65rem] uppercase tracking-[0.2em] text-white/50">
        {t('navInvoicesPaid')}
      </p>
      {invoices.length === 0 ? (
        <p className="text-xs text-white/60">{tInvoices('empty')}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {invoices.map((invoice) => (
            <li
              key={invoice.id}
              data-testid={`invoice-paid-${invoice.id}`}
              className="text-xs text-white/80"
            >
              <div className="flex items-center justify-between">
                <span>{invoice.id}</span>
                <span className="text-white/50">{invoice.date}</span>
              </div>
              <p>{tInvoices(`items.${invoice.messageKey}.description`)}</p>
              <div className="mt-1 flex items-center justify-between">
                <span className="text-white/50">{invoice.amount}</span>
                <button
                  type="button"
                  data-testid={`invoice-download-${invoice.id}`}
                  className="rounded-sm border border-white/20 px-2 py-1 text-[0.65rem] tracking-wide hover:bg-white/10"
                >
                  {tInvoices('downloadPdf')}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test -- InvoicesDueSection InvoicesPaidSection`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/account/InvoicesDueSection.tsx src/components/account/InvoicesPaidSection.tsx tests/components/account/InvoicesDueSection.test.tsx tests/components/account/InvoicesPaidSection.test.tsx
git commit -m "feat: add InvoicesDueSection and InvoicesPaidSection components"
```

---

### Task 8: `ReturnsSection` component

**Files:**
- Create: `src/components/account/ReturnsSection.tsx`
- Test: `tests/components/account/ReturnsSection.test.tsx`

**Interfaces:**
- Consumes: `useAllOrders()` (Task 4, needs `hasReturnRequest`), `useReturns()` (Task 2, `returnsByOrderId` + `registerReturn`), translations `accountPage.returns.*`.
- Produces: `ReturnsSection()`. Consumed by Task 11 (`AccountDashboard`).

- [ ] **Step 1: Write the failing test**

`tests/components/account/ReturnsSection.test.tsx`:
```tsx
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { OrdersProvider } from '@/lib/useOrders';
import { ReturnsProvider } from '@/lib/useReturns';
import { ReturnsSection } from '@/components/account/ReturnsSection';
import messages from '../../../messages/nl.json';

function renderSection() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <OrdersProvider>
        <ReturnsProvider>
          <ReturnsSection />
        </ReturnsProvider>
      </OrdersProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('ReturnsSection', () => {
  it('renders the order select, reason select (4 options), note field and submit button', () => {
    renderSection();
    expect(screen.getByTestId('returns-order-select')).toBeInTheDocument();
    const reasonSelect = screen.getByTestId('returns-reason-select') as HTMLSelectElement;
    expect(reasonSelect.options).toHaveLength(4);
    expect(screen.getByTestId('returns-note')).toBeInTheDocument();
    expect(screen.getByTestId('returns-submit')).toBeInTheDocument();
  });

  it('registers a return, shows a confirmation, and removes that order from the select', () => {
    renderSection();
    const orderSelect = screen.getByTestId('returns-order-select') as HTMLSelectElement;
    fireEvent.change(orderSelect, { target: { value: 'GD-10234' } });
    fireEvent.change(screen.getByTestId('returns-reason-select'), {
      target: { value: 'reasonDamaged' },
    });
    fireEvent.change(screen.getByTestId('returns-note'), {
      target: { value: 'Glas gebarsten' },
    });
    fireEvent.click(screen.getByTestId('returns-submit'));

    expect(screen.getByTestId('returns-confirmation')).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /GD-10234/ })).not.toBeInTheDocument();
    expect(screen.getByTestId('return-registered-GD-10234')).toBeInTheDocument();
  });

  it('shows the "no eligible orders" message once every seed order has a return registered', () => {
    renderSection();
    for (const id of ['GD-10234', 'GD-10221', 'GD-10198', 'GD-10177']) {
      fireEvent.change(screen.getByTestId('returns-order-select'), { target: { value: id } });
      fireEvent.click(screen.getByTestId('returns-submit'));
    }
    expect(screen.getByTestId('returns-no-eligible')).toBeInTheDocument();
    expect(screen.queryByTestId('returns-order-select')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ReturnsSection`
Expected: FAIL — `Cannot find module '@/components/account/ReturnsSection'`

- [ ] **Step 3: Implement `ReturnsSection.tsx`**

```tsx
'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { useTranslations } from 'next-intl';
import { useAllOrders } from '@/lib/useAllOrders';
import { useReturns } from '@/lib/useReturns';

const REASON_KEYS = [
  'reasonDamaged',
  'reasonNotAsExpected',
  'reasonWrongOrder',
  'reasonOther',
] as const;

export function ReturnsSection() {
  const t = useTranslations('accountPage.returns');
  const orders = useAllOrders();
  const { returnsByOrderId, registerReturn } = useReturns();
  const eligibleOrders = orders.filter((order) => !order.hasReturnRequest);
  const registeredOrders = orders.filter((order) => order.hasReturnRequest);

  const [selectedOrderId, setSelectedOrderId] = useState(eligibleOrders[0]?.id ?? '');
  const [reason, setReason] = useState<(typeof REASON_KEYS)[number]>('reasonDamaged');
  const [note, setNote] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);

  useEffect(() => {
    if (!eligibleOrders.some((order) => order.id === selectedOrderId)) {
      setSelectedOrderId(eligibleOrders[0]?.id ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eligibleOrders.map((order) => order.id).join(',')]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    registerReturn(selectedOrderId, t(reason), note);
    setIsSubmitted(true);
    setNote('');
  }

  return (
    <div data-testid="returns-section">
      {isSubmitted && (
        <p data-testid="returns-confirmation" className="mb-3 text-xs text-white">
          {t('confirmationTitle')} — {t('confirmationMessage')}
        </p>
      )}

      {eligibleOrders.length === 0 ? (
        <p data-testid="returns-no-eligible" className="text-xs text-white/60">
          {t('noEligibleOrders')}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 text-xs text-white/80">
          <label className="flex flex-col gap-1 uppercase tracking-wide text-white/60">
            {t('selectOrderLabel')}
            <select
              data-testid="returns-order-select"
              value={selectedOrderId}
              onChange={(event) => setSelectedOrderId(event.target.value)}
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            >
              {eligibleOrders.map((order) => (
                <option key={order.id} value={order.id}>
                  {order.id} — {order.description}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 uppercase tracking-wide text-white/60">
            {t('reasonLabel')}
            <select
              data-testid="returns-reason-select"
              value={reason}
              onChange={(event) => setReason(event.target.value as (typeof REASON_KEYS)[number])}
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            >
              {REASON_KEYS.map((key) => (
                <option key={key} value={key}>
                  {t(key)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 uppercase tracking-wide text-white/60">
            {t('noteLabel')}
            <textarea
              data-testid="returns-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              className="rounded-sm bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>

          <button
            type="submit"
            data-testid="returns-submit"
            className="mt-2 rounded-sm bg-silver px-4 py-2.5 text-xs tracking-[0.15em] text-ink"
          >
            {t('submit')}
          </button>
        </form>
      )}

      {registeredOrders.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-[0.65rem] uppercase tracking-[0.2em] text-white/50">
            {t('existingReturnsTitle')}
          </p>
          <ul className="flex flex-col gap-2">
            {registeredOrders.map((order) => (
              <li
                key={order.id}
                data-testid={`return-registered-${order.id}`}
                className="text-xs text-white/80"
              >
                <div className="flex items-center justify-between">
                  <span>{order.id}</span>
                  <span className="text-white/50">{returnsByOrderId[order.id]?.date}</span>
                </div>
                <p className="text-white/50">{returnsByOrderId[order.id]?.reason}</p>
                {returnsByOrderId[order.id]?.note && <p>{returnsByOrderId[order.id]?.note}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ReturnsSection`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/components/account/ReturnsSection.tsx tests/components/account/ReturnsSection.test.tsx
git commit -m "feat: add ReturnsSection component"
```

---

### Task 9: `ConversationsSection` component

**Files:**
- Create: `src/components/account/ConversationsSection.tsx`
- Test: `tests/components/account/ConversationsSection.test.tsx`

**Interfaces:**
- Consumes: `MOCK_CONVERSATIONS` (Task 1), translations `accountPage.navConversations` and `accountPage.conversations.*`.
- Produces: `ConversationsSection()`. Consumed by Task 11 (`AccountDashboard`).

- [ ] **Step 1: Write the failing test**

`tests/components/account/ConversationsSection.test.tsx`:
```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { ConversationsSection } from '@/components/account/ConversationsSection';
import messages from '../../../messages/nl.json';

function renderSection() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <ConversationsSection />
    </NextIntlClientProvider>
  );
}

describe('ConversationsSection', () => {
  it('renders all 4 mock conversations with date, time and topic', () => {
    renderSection();
    expect(screen.getByTestId('conversation-CONV-1')).toBeInTheDocument();
    expect(screen.getByTestId('conversation-CONV-4')).toBeInTheDocument();
    expect(screen.getByText('2026-07-10')).toBeInTheDocument();
    expect(screen.getByText('14:32')).toBeInTheDocument();
    expect(screen.getByText('Vraag over levertijd')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ConversationsSection`
Expected: FAIL — `Cannot find module '@/components/account/ConversationsSection'`

- [ ] **Step 3: Implement `ConversationsSection.tsx`**

```tsx
'use client';

import { useTranslations } from 'next-intl';
import { MOCK_CONVERSATIONS } from '@/data/mockConversations';

export function ConversationsSection() {
  const t = useTranslations('accountPage');
  const tConversations = useTranslations('accountPage.conversations');

  return (
    <div data-testid="conversations-section">
      <p className="mb-3 text-[0.65rem] uppercase tracking-[0.2em] text-white/50">
        {t('navConversations')}
      </p>
      <ul className="flex flex-col gap-3">
        {MOCK_CONVERSATIONS.map((conversation) => (
          <li
            key={conversation.id}
            data-testid={`conversation-${conversation.id}`}
            className="text-xs text-white/80"
          >
            <div className="flex items-center justify-between">
              <span>{conversation.date}</span>
              <span className="text-white/50">{conversation.time}</span>
            </div>
            <p>{tConversations(`items.${conversation.messageKey}.topic`)}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ConversationsSection`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/components/account/ConversationsSection.tsx tests/components/account/ConversationsSection.test.tsx
git commit -m "feat: add ConversationsSection component"
```

---

### Task 10: `localeMeta` extraction + `SettingsSection` component

**Files:**
- Create: `src/lib/localeMeta.ts`
- Modify: `src/components/LanguageSwitcher.tsx`
- Create: `src/components/account/SettingsSection.tsx`
- Test: `tests/components/account/SettingsSection.test.tsx`

**Interfaces:**
- Consumes: `useMockProfile()` (Task 3), `routing.locales` (`src/i18n/routing.ts`), `usePathname`/`useRouter` (`@/i18n/navigation`), translations `accountPage.settings.*`.
- Produces: `LOCALE_META: Record<string, { label: string; flag: string }>` (shared), `SettingsSection()`. Consumed by Task 11 (`AccountDashboard`).

- [ ] **Step 1: Extract `LOCALE_META` into a shared file**

Create `src/lib/localeMeta.ts`:
```ts
export interface LocaleMeta {
  label: string;
  flag: string;
}

export const LOCALE_META: Record<string, LocaleMeta> = {
  nl: { label: 'NL', flag: '🇳🇱' },
  en: { label: 'EN', flag: '🇬🇧' },
  de: { label: 'DE', flag: '🇩🇪' },
  fr: { label: 'FR', flag: '🇫🇷' },
};
```

In `src/components/LanguageSwitcher.tsx`, remove the inline `LOCALE_META` constant and its type, and instead import it:
```tsx
import { LOCALE_META } from '@/lib/localeMeta';
```
(Keep everything else in `LanguageSwitcher.tsx` unchanged.)

- [ ] **Step 2: Run the existing LanguageSwitcher tests to confirm the extraction didn't break it**

Run: `npm test -- LanguageSwitcher`
Expected: PASS (no behavior change, purely a constant relocation)

- [ ] **Step 3: Write the failing test for `SettingsSection`**

`tests/components/account/SettingsSection.test.tsx`:
```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MockProfileProvider } from '@/lib/useMockProfile';
import { SettingsSection } from '@/components/account/SettingsSection';
import messages from '../../../messages/nl.json';

const replaceMock = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/account',
  useRouter: () => ({ replace: replaceMock }),
}));

function renderSection() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <MockProfileProvider>
        <SettingsSection />
      </MockProfileProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  replaceMock.mockClear();
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
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npm test -- SettingsSection`
Expected: FAIL — `Cannot find module '@/components/account/SettingsSection'`

- [ ] **Step 5: Implement `SettingsSection.tsx`**

```tsx
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

export function SettingsSection() {
  const t = useTranslations('accountPage.settings');
  const { profile, updateProfile } = useMockProfile();
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

  const fieldClassName = 'rounded-sm bg-black/40 px-3 py-2 text-sm text-white';
  const labelClassName = 'flex flex-col gap-1 text-xs uppercase tracking-wide text-white/60';

  return (
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
  );
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- SettingsSection`
Expected: PASS (5 tests)

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all tests PASS (including `LanguageSwitcher`, unaffected by the extraction).

- [ ] **Step 8: Commit**

```bash
git add src/lib/localeMeta.ts src/components/LanguageSwitcher.tsx src/components/account/SettingsSection.tsx tests/components/account/SettingsSection.test.tsx
git commit -m "feat: add SettingsSection component, extract shared LOCALE_META"
```

---

### Task 11: `AccountDashboard` component + `/account` page

**Files:**
- Create: `src/components/account/AccountDashboard.tsx`
- Create: `src/app/[locale]/account/page.tsx`
- Test: `tests/components/account/AccountDashboard.test.tsx`

**Interfaces:**
- Consumes: `useMockAuth()` (`isLoggedIn`, `isHydrated`), `useRouter()` (`@/i18n/navigation`), `AccountNav`+`AccountSection` (Task 5), `OrdersSection` (Task 6), `InvoicesDueSection`/`InvoicesPaidSection` (Task 7), `ReturnsSection` (Task 8), `ConversationsSection` (Task 9), `SettingsSection` (Task 10), `GlassPanel` (`src/components/GlassPanel.tsx`).
- Produces: `AccountDashboard()`, the `/account` route. Task 12 (`NavBar`) links to this route.

- [ ] **Step 1: Write the failing test**

`tests/components/account/AccountDashboard.test.tsx`:
```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { MockAuthProvider } from '@/lib/useMockAuth';
import { OrdersProvider } from '@/lib/useOrders';
import { ReturnsProvider } from '@/lib/useReturns';
import { MockProfileProvider } from '@/lib/useMockProfile';
import { AccountDashboard } from '@/components/account/AccountDashboard';
import messages from '../../../messages/nl.json';

const replaceMock = vi.fn();

vi.mock('@/i18n/navigation', () => ({
  usePathname: () => '/account',
  useRouter: () => ({ replace: replaceMock }),
}));

function renderDashboard() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <MockAuthProvider>
        <OrdersProvider>
          <ReturnsProvider>
            <MockProfileProvider>
              <AccountDashboard />
            </MockProfileProvider>
          </ReturnsProvider>
        </OrdersProvider>
      </MockAuthProvider>
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  replaceMock.mockClear();
});

describe('AccountDashboard', () => {
  it('redirects to "/" and renders nothing when not logged in', () => {
    renderDashboard();
    expect(replaceMock).toHaveBeenCalledWith('/');
    expect(screen.queryByTestId('account-dashboard')).not.toBeInTheDocument();
  });

  it('renders the Bestellingen section by default when logged in', () => {
    window.localStorage.setItem('glassart-mock-logged-in', 'true');
    renderDashboard();
    expect(replaceMock).not.toHaveBeenCalled();
    expect(screen.getByTestId('orders-section')).toBeInTheDocument();
  });

  it('switches to the Instellingen section when its nav button is clicked', () => {
    window.localStorage.setItem('glassart-mock-logged-in', 'true');
    renderDashboard();
    fireEvent.click(screen.getByTestId('account-nav-settings'));
    expect(screen.getByTestId('settings-section')).toBeInTheDocument();
    expect(screen.queryByTestId('orders-section')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- AccountDashboard`
Expected: FAIL — `Cannot find module '@/components/account/AccountDashboard'`

- [ ] **Step 3: Implement `AccountDashboard.tsx`**

```tsx
'use client';

import { useEffect, useState } from 'react';
import { useMockAuth } from '@/lib/useMockAuth';
import { useRouter } from '@/i18n/navigation';
import { GlassPanel } from '@/components/GlassPanel';
import { AccountNav, type AccountSection } from './AccountNav';
import { OrdersSection } from './OrdersSection';
import { InvoicesDueSection } from './InvoicesDueSection';
import { InvoicesPaidSection } from './InvoicesPaidSection';
import { ReturnsSection } from './ReturnsSection';
import { ConversationsSection } from './ConversationsSection';
import { SettingsSection } from './SettingsSection';

const SECTION_COMPONENTS: Record<AccountSection, () => JSX.Element> = {
  orders: OrdersSection,
  invoicesDue: InvoicesDueSection,
  invoicesPaid: InvoicesPaidSection,
  returns: ReturnsSection,
  conversations: ConversationsSection,
  settings: SettingsSection,
};

export function AccountDashboard() {
  const { isLoggedIn, isHydrated } = useMockAuth();
  const router = useRouter();
  const [activeSection, setActiveSection] = useState<AccountSection>('orders');

  useEffect(() => {
    if (isHydrated && !isLoggedIn) {
      router.replace('/');
    }
  }, [isHydrated, isLoggedIn, router]);

  if (!isHydrated || !isLoggedIn) {
    return null;
  }

  const ActiveSectionComponent = SECTION_COMPONENTS[activeSection];

  return (
    <div
      data-testid="account-dashboard"
      className="mx-auto grid max-w-5xl grid-cols-1 gap-8 lg:grid-cols-[200px_1fr]"
    >
      <GlassPanel className="w-full">
        <AccountNav activeSection={activeSection} onSelect={setActiveSection} />
      </GlassPanel>
      <GlassPanel className="w-full">
        <ActiveSectionComponent />
      </GlassPanel>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- AccountDashboard`
Expected: PASS (3 tests)

- [ ] **Step 5: Create the `/account` page**

`src/app/[locale]/account/page.tsx`:
```tsx
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { GlassPanel } from '@/components/GlassPanel';
import { AccountDashboard } from '@/components/account/AccountDashboard';

export default async function AccountPage({
  params,
}: {
  params: { locale: string };
}) {
  const { locale } = params;
  setRequestLocale(locale);
  const t = await getTranslations('nav');

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-ink via-charcoal to-graphite px-4 pb-16 pt-24 sm:px-8">
      <GlassPanel className="mx-auto mb-10 !max-w-5xl text-center">
        <h1 className="text-2xl font-light text-white sm:text-3xl">{t('myAccount')}</h1>
      </GlassPanel>

      <AccountDashboard />
    </main>
  );
}
```

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/components/account/AccountDashboard.tsx src/app/[locale]/account/page.tsx tests/components/account/AccountDashboard.test.tsx
git commit -m "feat: add AccountDashboard and /account page"
```

---

### Task 12: Point "GD" at `/account`, remove `AccountMenu`

**Files:**
- Modify: `src/components/NavBar.tsx`
- Modify: `tests/components/NavBar.test.tsx`
- Delete: `src/components/AccountMenu.tsx`
- Delete: `tests/components/AccountMenu.test.tsx`
- Delete: `tests/components/NavBarAccountMenuIntegration.test.tsx`

**Interfaces:**
- Consumes: `nav.myAccount` translation key (Task 1).
- Produces: nothing new — this is the final wiring point; nothing later depends on it.

- [ ] **Step 1: Delete the superseded dropdown component and its tests**

```bash
git rm src/components/AccountMenu.tsx tests/components/AccountMenu.test.tsx tests/components/NavBarAccountMenuIntegration.test.tsx
```

`NavBarAccountMenuIntegration.test.tsx` is a regression test guarding a historical bug where `NavBar` and `AccountMenu` each held their own separate `isLoggedIn` copy that could desync. After this task, `NavBar` makes the only `useMockAuth()` call in this area (no child component with its own auth copy), so that desync is structurally impossible — the test's premise no longer applies and it is deleted rather than adapted.

- [ ] **Step 2: Update `NavBar.tsx` to link "GD" straight to `/account`**

Replace the `import { AccountMenu } from './AccountMenu';` line with nothing (delete it), and replace:
```tsx
        {isHydrated && isLoggedIn ? (
          <AccountMenu />
        ) : (
```
with:
```tsx
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
```

The full resulting file:
```tsx
'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { useMockAuth } from '@/lib/useMockAuth';
import { Logo } from './Logo';
import { LanguageSwitcher } from './LanguageSwitcher';
import { CartPanel } from './CartPanel';

export function NavBar() {
  const t = useTranslations('nav');
  const { isLoggedIn, isHydrated, login } = useMockAuth();

  return (
    <nav
      data-testid="navbar"
      className="fixed left-0 top-0 z-40 flex w-full flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-black/60 px-4 py-3 backdrop-blur-sm sm:px-8"
    >
      <div className="flex items-center gap-8">
        <Logo />
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
      </div>

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

- [ ] **Step 3: Update `NavBar.test.tsx`**

Remove the `vi.mock('@/components/AccountMenu', ...)` block entirely, and replace the two tests that reference `account-menu-stub` so the full file reads:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

  it('shows a link to /account instead of "Word klant"/"Inloggen" after clicking login', () => {
    renderNavBar();
    fireEvent.click(screen.getByTestId('nav-login'));
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
});
```

- [ ] **Step 4: Run the NavBar tests to verify they pass**

Run: `npm test -- NavBar`
Expected: PASS (5 tests)

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests PASS — the removed `AccountMenu.test.tsx` no longer runs, no test anywhere still imports `@/components/AccountMenu`.

- [ ] **Step 6: Commit**

```bash
git add src/components/NavBar.tsx tests/components/NavBar.test.tsx
git commit -m "feat: link GD account icon to /account, remove AccountMenu dropdown"
```

---

### Task 13: Build verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `npm test`
Expected: all tests PASS, 0 failures.

- [ ] **Step 2: Run the production build**

Run: `npm run build`
Expected: build succeeds, static export includes `account/index.html` for every locale (`nl`, `en`, `de`, `fr`).

- [ ] **Step 3: Confirm the key JSON translation files stay in sync**

Run the same key-parity check as Task 1 Step 6 (all 4 locales) — Expected: `en OK`, `de OK`, `fr OK`.

- [ ] **Step 4: Commit (only if the build step required any fixes)**

If Steps 1–3 all pass with no code changes, there is nothing to commit — this task is verification-only.
