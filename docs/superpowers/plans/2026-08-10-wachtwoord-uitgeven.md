# Wachtwoord vergeten en wachtwoord uitgeven — implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** De klant kan zelf een resetlink aanvragen vanaf het inlogscherm, en de beheerder kan telefonisch een gegenereerd wachtwoord uitgeven vanuit het klantdossier.

**Architecture:** Twee losse routes naar hetzelfde doel. De klantroute hergebruikt de complete resetflow die al bestaat (`/api/auth/reset-password/request` → mail → `/wachtwoord-resetten`) en voegt alleen de ontbrekende knop toe. De beheerroute is nieuw: `POST /api/klanten/[id]/wachtwoord` genereert server-side een wachtwoord, geeft het één keer terug en ruimt sessies en openstaande resettokens van die klant op.

**Tech Stack:** Next.js 14 App Router, TypeScript, `next-intl`, raw `mysql2`, Vitest + Testing Library.

Ontwerp: [`docs/superpowers/specs/2026-08-10-wachtwoord-uitgeven-design.md`](../specs/2026-08-10-wachtwoord-uitgeven-design.md).

## Global Constraints

- **Geen databasemigratie.** Dit plan raakt het schema niet. `activiteitenlog.type` is
  `VARCHAR(100)` (`db/schema.sql` regel 231), dus een nieuw activiteittype is puur code.
  Wijzigt een taak wél een kolom, dan is er iets misgegaan — stop en meld het.
- **Tests draaien tegen de echte staging-database.** Elke test ruimt uitsluitend zijn eigen
  rijen op, gescoped op een onthouden id of op een `@example.com`-adres. Nooit een
  `DELETE FROM <tabel>` zonder `WHERE`, nooit `TRUNCATE`, nooit een teller resetten.
- **Wachtwoordbeleid:** minimaal 8 tekens, `MINIMALE_WACHTWOORDLENGTE` in
  `src/lib/wachtwoordBeleid.ts`. Het gegenereerde wachtwoord zit daar ruim boven.
- **Anti-enumeratie:** `POST /api/auth/reset-password/request` antwoordt altijd `200`, ook
  bij een onbekend e-mailadres. Geen enkele wijziging in dit plan mag dat verschil aan de
  voorkant alsnog zichtbaar maken.
- **Talen:** klantgerichte teksten in `messages/nl.json`, `en.json`, `de.json` én `fr.json`.
  Beheerteksten alleen in `nl.json` — de `beheer`-namespace bestaat niet in de andere drie.
- **Aanspreekvorm:** klantgerichte NL-teksten gebruiken "u" (zie `loginPage.pendingMessage`:
  "Uw aanvraag wordt nog beoordeeld."), beheerteksten gebruiken "je". Duits gebruikt "Sie",
  Frans "vous".
- **Buiten scope, niet oplossen:** de tekst van de resetmail zelf blijft Nederlands voor
  alle talen (alleen de *link* wordt gelokaliseerd); medewerkers krijgen geen scherm om hun
  eigen wachtwoord te wijzigen; `PATCH /api/klanten/[id]` blijft zijn body ongefilterd
  doorgeven aan `updateRow`.
- **Commando's:** `npx vitest run <pad>` voor één bestand, `npx vitest run -t "<naam>"` voor
  één test, `npm test` voor de hele suite, `npm run lint` voor de linter.

---

## Task 1: Locale in de resetlink

`sendResetEmail()` zet nu altijd `/nl/wachtwoord-resetten` in de link. Zolang alleen
medewerkers die knop hadden was dat prima; zodra klanten hem gaan gebruiken (Task 2) krijgt
een Duitse of Franse klant een Nederlandse pagina.

De locale komt uit de request-body en wordt **gevalideerd** tegen `routing.locales`. Dat is
geen formaliteit: die waarde belandt in een URL in een uitgaande e-mail, dus een
ongecontroleerde string uit de body is een injectiepunt in een bericht dat wij namens
onszelf versturen.

**Files:**
- Modify: `src/lib/server/sendResetEmail.ts`
- Modify: `src/app/api/auth/reset-password/request/route.ts`
- Test: `tests/app/api/auth/reset-password.test.ts` (bestaat al, wordt uitgebreid)

**Interfaces:**
- Consumes: `routing` uit `src/i18n/routing.ts` (`locales: ['nl','en','de','fr']`, `defaultLocale: 'nl'`)
- Produces: `sendResetEmail(email: string, token: string, origin: string, locale: string): Promise<void>` — Task 2 stuurt `locale` mee in de body van `/api/auth/reset-password/request`.

- [ ] **Step 1: Schrijf de falende tests**

Voeg toe aan `tests/app/api/auth/reset-password.test.ts`. Het bestand mockt `sendResetEmail`
al op regel 7, dus dit verstuurt geen echte mail. Zet de import van de gemockte functie
bovenaan bij de bestaande imports:

```ts
import { sendResetEmail } from '@/lib/server/sendResetEmail';
```

En voeg dit blok toe binnen `describe('password reset routes', ...)`:

```ts
  // De locale belandt in een URL in een uitgaande e-mail, dus een waarde uit de
  // request-body mag daar nooit ongecontroleerd in terechtkomen.
  describe('locale in de resetlink', () => {
    async function vraagResetAan(body: Record<string, unknown>) {
      const klant = await insertRow<{ id: string }>('klanten', {
        email: 'reset-locale@example.com',
        wachtwoordHash: await hashPassword('oudwachtwoord'),
        status: 'Goedgekeurd',
      } as never);
      vi.mocked(sendResetEmail).mockClear();
      await requestReset(
        new Request('http://localhost/api', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email: 'reset-locale@example.com', userType: 'klant', ...body }),
        })
      );
      return klant;
    }

    it('geeft een geldige locale door aan de mail', async () => {
      await vraagResetAan({ locale: 'de' });
      expect(vi.mocked(sendResetEmail).mock.calls[0][3]).toBe('de');
    });

    it('valt terug op nl bij een onbekende locale', async () => {
      await vraagResetAan({ locale: 'klingon' });
      expect(vi.mocked(sendResetEmail).mock.calls[0][3]).toBe('nl');
    });

    it('valt terug op nl wanneer er geen locale wordt meegestuurd', async () => {
      await vraagResetAan({});
      expect(vi.mocked(sendResetEmail).mock.calls[0][3]).toBe('nl');
    });

    // Een niet-string mag niet als pad in de URL belanden.
    it('valt terug op nl bij een locale die geen string is', async () => {
      await vraagResetAan({ locale: { toString: 'nee' } });
      expect(vi.mocked(sendResetEmail).mock.calls[0][3]).toBe('nl');
    });
  });
```

De bestaande `afterEach` in dit bestand ruimt `@example.com`-klanten al op, dus deze tests
hebben geen eigen opruiming nodig.

- [ ] **Step 2: Draai de tests en controleer dat ze falen**

```bash
npx vitest run tests/app/api/auth/reset-password.test.ts -t "locale"
```

Verwacht: FAIL. `sendResetEmail` wordt met drie argumenten aangeroepen, dus `mock.calls[0][3]`
is `undefined`.

- [ ] **Step 3: Voeg de locale toe aan `sendResetEmail`**

Vervang de inhoud van `src/lib/server/sendResetEmail.ts`:

```ts
import { verstuurMail } from './mailRelay';

/**
 * De locale komt van de aanroeper en zit al gevalideerd in `locale` -- deze
 * functie bouwt er een pad mee en controleert niets meer. De tekst van de mail
 * blijft bewust Nederlands; alleen de link volgt de taal van de gebruiker.
 */
export async function sendResetEmail(
  email: string,
  token: string,
  origin: string,
  locale: string
): Promise<void> {
  const resetLink = `${origin}/${locale}/wachtwoord-resetten?token=${encodeURIComponent(token)}`;
  const subject = 'Wachtwoord opnieuw instellen — Glassart & Design';
  const body =
    'Er is een verzoek binnengekomen om het wachtwoord van dit account opnieuw in te stellen.\n\n' +
    'Klik op onderstaande link om een nieuw wachtwoord in te stellen. Deze link is 24 uur geldig:\n\n' +
    resetLink +
    '\n\n' +
    'Heb je dit niet zelf aangevraagd? Dan kun je deze e-mail negeren -- er verandert niets aan je account.';
  await verstuurMail({ to: email, subject, body });
}
```

- [ ] **Step 4: Valideer de locale in de route**

Vervang de inhoud van `src/app/api/auth/reset-password/request/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { randomUUID } from 'crypto';
import { sendResetEmail } from '@/lib/server/sendResetEmail';
import { withApiErrorHandling } from '@/lib/server/apiRoute';
import { routing } from '@/i18n/routing';

/**
 * De locale belandt als pad in een link in een uitgaande e-mail. Alles wat niet
 * letterlijk een van onze eigen locales is, wordt `nl` -- niet omdat de gebruiker
 * zich vergist kan hebben, maar omdat een willekeurige string uit de request-body
 * anders in een bericht terechtkomt dat wij namens onszelf versturen.
 */
function veiligeLocale(waarde: unknown): string {
  const locales: readonly string[] = routing.locales;
  return typeof waarde === 'string' && locales.includes(waarde) ? waarde : routing.defaultLocale;
}

export const POST = withApiErrorHandling('POST /api/auth/reset-password/request', async (request: Request) => {
  const { email, userType, locale } = (await request.json()) as {
    email: string;
    userType: 'klant' | 'medewerker';
    locale?: unknown;
  };
  const table = userType === 'klant' ? 'klanten' : 'medewerkers';

  const [rows] = await getPool().query(`SELECT id FROM \`${table}\` WHERE email = ?`, [email]);
  const user = (rows as Array<{ id: string }>)[0];

  if (user) {
    const token = randomUUID();
    await getPool().query(
      'INSERT INTO passwordResetTokens (token, userType, userId, expiresAt) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY))',
      [token, userType, user.id]
    );
    await sendResetEmail(email, token, new URL(request.url).origin, veiligeLocale(locale));
  }

  return NextResponse.json({ ok: true });
});
```

- [ ] **Step 5: Draai de tests en controleer dat ze slagen**

```bash
npx vitest run tests/app/api/auth/reset-password.test.ts
```

Verwacht: PASS, alle tests in het bestand (de vier nieuwe plus de vijf bestaande).

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/sendResetEmail.ts src/app/api/auth/reset-password/request/route.ts tests/app/api/auth/reset-password.test.ts
git commit -m "feat: resetlink volgt de taal van de gebruiker"
```

---

## Task 2: "Wachtwoord vergeten" op het klant-inlogscherm

De hele achterkant bestaat al. Er ontbreekt letterlijk een knop.

Vier nieuwe teksten, niet drie: naast de knop, de "vul eerst je adres in"-melding en de
bevestiging komt er een aparte foutmelding voor een mislukt verzoek. Zonder die vierde zou
een netwerkfout de gebruiker vertellen dat er een mail onderweg is die nooit is verstuurd —
een leugen die een supporttelefoontje kost.

**Files:**
- Modify: `src/components/CustomerLoginForm.tsx`
- Modify: `messages/nl.json`, `messages/en.json`, `messages/de.json`, `messages/fr.json`
- Test: `tests/components/CustomerLoginForm.test.tsx` (bestaat al, wordt uitgebreid)

**Interfaces:**
- Consumes: `POST /api/auth/reset-password/request` met body `{ email, userType: 'klant', locale }` (Task 1)
- Produces: niets voor latere taken

- [ ] **Step 1: Voeg de teksten toe in alle vier de talen**

In `messages/nl.json`, binnen `"loginPage"`, na `"verplichtVeldLegende"`:

```json
    "forgotPassword": "Wachtwoord vergeten?",
    "forgotPasswordMissingEmail": "Vul eerst uw e-mailadres in.",
    "forgotPasswordSent": "Als dit e-mailadres bij ons bekend is, ontvangt u een e-mail om uw wachtwoord opnieuw in te stellen.",
    "forgotPasswordError": "Er ging iets mis. Probeer het later opnieuw."
```

De bevestiging zegt bewust "als dit e-mailadres bij ons bekend is" en niet "er is een
e-mail verstuurd". De API lekt niet of een adres bestaat; die tekst mag dat dan ook niet
alsnog doen.

In `messages/en.json`, binnen `"loginPage"`:

```json
    "forgotPassword": "Forgot your password?",
    "forgotPasswordMissingEmail": "Please enter your email address first.",
    "forgotPasswordSent": "If this email address is known to us, you will receive an email to reset your password.",
    "forgotPasswordError": "Something went wrong. Please try again later."
```

In `messages/de.json`, binnen `"loginPage"`:

```json
    "forgotPassword": "Passwort vergessen?",
    "forgotPasswordMissingEmail": "Bitte geben Sie zuerst Ihre E-Mail-Adresse ein.",
    "forgotPasswordSent": "Wenn diese E-Mail-Adresse bei uns bekannt ist, erhalten Sie eine E-Mail zum Zurücksetzen Ihres Passworts.",
    "forgotPasswordError": "Es ist ein Fehler aufgetreten. Bitte versuchen Sie es später erneut."
```

In `messages/fr.json`, binnen `"loginPage"`:

```json
    "forgotPassword": "Mot de passe oublié ?",
    "forgotPasswordMissingEmail": "Veuillez d'abord saisir votre adresse e-mail.",
    "forgotPasswordSent": "Si cette adresse e-mail nous est connue, vous recevrez un e-mail pour réinitialiser votre mot de passe.",
    "forgotPasswordError": "Une erreur est survenue. Veuillez réessayer plus tard."
```

- [ ] **Step 2: Schrijf de falende tests**

Voeg toe aan `tests/components/CustomerLoginForm.test.tsx`, binnen
`describe('CustomerLoginForm', ...)`:

```ts
  describe('wachtwoord vergeten', () => {
    function vraagResetAan(email: string) {
      fireEvent.change(screen.getByTestId('login-email'), { target: { value: email } });
      fireEvent.click(screen.getByTestId('login-forgot-password'));
    }

    it('vraagt om een e-mailadres wanneer het veld leeg is', async () => {
      renderForm();
      fireEvent.click(screen.getByTestId('login-forgot-password'));

      expect(await screen.findByTestId('login-reset-message')).toHaveTextContent(
        'Vul eerst uw e-mailadres in.'
      );
      // Alleen de /api/auth/me-aanroep van de provider, geen resetverzoek.
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('stuurt het verzoek met userType klant en de huidige locale', async () => {
      fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
      renderForm();
      vraagResetAan('klant@example.com');

      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/auth/reset-password/request',
          expect.objectContaining({
            body: JSON.stringify({
              email: 'klant@example.com',
              userType: 'klant',
              locale: 'nl',
            }),
          })
        )
      );
    });

    // De API lekt niet of een adres bestaat; de melding mag dat ook niet doen.
    it('toont dezelfde bevestiging voor een bekend en een onbekend adres', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
      const verwacht =
        'Als dit e-mailadres bij ons bekend is, ontvangt u een e-mail om uw wachtwoord opnieuw in te stellen.';

      renderForm();
      vraagResetAan('bestaat@example.com');
      expect(await screen.findByTestId('login-reset-message')).toHaveTextContent(verwacht);

      vraagResetAan('bestaatniet@example.com');
      expect(await screen.findByTestId('login-reset-message')).toHaveTextContent(verwacht);
    });

    it('meldt een fout in plaats van een verzonnen bevestiging als het verzoek mislukt', async () => {
      fetchMock.mockRejectedValueOnce(new Error('network error'));
      renderForm();
      vraagResetAan('klant@example.com');

      expect(await screen.findByTestId('login-reset-message')).toHaveTextContent(
        'Er ging iets mis. Probeer het later opnieuw.'
      );
    });

    it('vult een "testN" account aan met het bedrijfsdomein op staging', async () => {
      process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL = 'staging';
      try {
        fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
        renderForm();
        vraagResetAan('test1');

        await waitFor(() =>
          expect(fetchMock).toHaveBeenCalledWith(
            '/api/auth/reset-password/request',
            expect.objectContaining({
              body: JSON.stringify({
                email: 'test1@glassartanddesign.com',
                userType: 'klant',
                locale: 'nl',
              }),
            })
          )
        );
      } finally {
        delete process.env.NEXT_PUBLIC_ENVIRONMENT_LABEL;
      }
    });
  });
```

Die laatste test is er omdat het inloggen `completeerTestKlantEmail()` gebruikt: zonder
dezelfde aanvulling kan een testaccount op staging wél inloggen maar geen resetmail
aanvragen — twee verschillende antwoorden op de vraag wat het adres van deze klant is.

- [ ] **Step 3: Draai de tests en controleer dat ze falen**

```bash
npx vitest run tests/components/CustomerLoginForm.test.tsx -t "wachtwoord vergeten"
```

Verwacht: FAIL, `Unable to find an element by: [data-testid="login-forgot-password"]`.

- [ ] **Step 4: Bouw de knop**

In `src/components/CustomerLoginForm.tsx`, wijzig de import op regel 4 en voeg de locale-hook toe:

```tsx
import { useLocale, useTranslations } from 'next-intl';
```

Voeg binnen de component, na `const t = useTranslations('loginPage');`, toe:

```tsx
  const locale = useLocale();
```

Voeg naast de bestaande `error`-state toe:

```tsx
  const [resetMessage, setResetMessage] = useState<string | null>(null);
```

Voeg na `handleSubmit` deze functie toe:

```tsx
  async function handleWachtwoordVergeten() {
    setError(null);
    setResetMessage(null);
    const volledigEmail = completeerTestKlantEmail(email);
    if (!volledigEmail) {
      setResetMessage(t('forgotPasswordMissingEmail'));
      return;
    }
    try {
      // De response wordt bewust niet uitgelezen: de route antwoordt altijd 200,
      // juist zodat hier geen verschil te zien is tussen een bekend en een
      // onbekend adres. Alleen een mislukt verzoek is het melden waard.
      await fetch('/api/auth/reset-password/request', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: volledigEmail, userType: 'klant', locale }),
      });
      setResetMessage(t('forgotPasswordSent'));
    } catch {
      setResetMessage(t('forgotPasswordError'));
    }
  }
```

Voeg in de JSX, direct ná de submit-knop (regel 83-89) en vóór de sluitende `</form>`, toe:

```tsx
      <button
        type="button"
        onClick={handleWachtwoordVergeten}
        data-testid="login-forgot-password"
        className="text-left text-xs text-white/60 underline hover:text-white"
      >
        {t('forgotPassword')}
      </button>

      {resetMessage && (
        <p data-testid="login-reset-message" className="text-xs text-white/70">
          {resetMessage}
        </p>
      )}
```

- [ ] **Step 5: Draai de tests en controleer dat ze slagen**

```bash
npx vitest run tests/components/CustomerLoginForm.test.tsx
```

Verwacht: PASS, alle tests in het bestand (de vijf nieuwe plus de negen bestaande).

- [ ] **Step 6: Commit**

```bash
git add src/components/CustomerLoginForm.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json tests/components/CustomerLoginForm.test.tsx
git commit -m "feat: wachtwoord vergeten op het klant-inlogscherm"
```

---

## Task 3: Wachtwoordgenerator

Dit wachtwoord wordt door de telefoon voorgelezen, dus de vorm is functioneel: geen tekens
die je moet spellen ("is dat een nul of een o?").

Het alfabet is a–z zonder `l` en `o`, plus 2–9. Dat is precies 32 tekens, dus 5 bits per
teken en 60 bits entropie over 12 tekens. `randomInt()` in plaats van `randomBytes()` met
een modulo — bij 32 zou modulo toevallig ook onvertekend zijn, maar dan hangt die
eigenschap aan de lengte van het alfabet in plaats van aan de code.

**Files:**
- Create: `src/lib/server/genereerWachtwoord.ts`
- Test: `tests/lib/server/genereerWachtwoord.test.ts`

**Interfaces:**
- Produces: `genereerWachtwoord(): string` — geeft 3 blokken van 4 tekens, gescheiden door
  koppeltekens, bijvoorbeeld `k7fp-r2mq-x4tz`. Task 5 slaat de hash daarvan op.

- [ ] **Step 1: Schrijf de falende test**

Maak `tests/lib/server/genereerWachtwoord.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { genereerWachtwoord } from '@/lib/server/genereerWachtwoord';
import { MINIMALE_WACHTWOORDLENGTE } from '@/lib/wachtwoordBeleid';

describe('genereerWachtwoord', () => {
  it('levert drie blokken van vier tekens', () => {
    expect(genereerWachtwoord()).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
  });

  // Dit wachtwoord wordt door de telefoon voorgelezen: geen teken mag te
  // verwarren zijn met een ander.
  it('bevat geen dubbelzinnige tekens', () => {
    const alles = Array.from({ length: 200 }, () => genereerWachtwoord()).join('');
    for (const teken of ['l', 'o', '0', '1']) {
      expect(alles).not.toContain(teken);
    }
  });

  it('zit ruim boven de minimale wachtwoordlengte', () => {
    expect(genereerWachtwoord().length).toBeGreaterThan(MINIMALE_WACHTWOORDLENGTE);
  });

  it('geeft niet tweemaal hetzelfde', () => {
    const uniek = new Set(Array.from({ length: 100 }, () => genereerWachtwoord()));
    expect(uniek.size).toBe(100);
  });
});
```

- [ ] **Step 2: Draai de test en controleer dat hij faalt**

```bash
npx vitest run tests/lib/server/genereerWachtwoord.test.ts
```

Verwacht: FAIL, de module bestaat niet.

- [ ] **Step 3: Schrijf de generator**

Maak `src/lib/server/genereerWachtwoord.ts`:

```ts
import { randomInt } from 'crypto';

/**
 * a-z zonder `l` en `o`, plus 2-9. Geen `0`, `1`, hoofdletters of leestekens:
 * dit wachtwoord wordt telefonisch doorgegeven, dus elk teken moet eenduidig
 * uit te spreken en over te typen zijn.
 *
 * Precies 32 tekens, dus 5 bits per teken -- 60 bits over de twaalf tekens.
 */
const ALFABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const BLOKLENGTE = 4;
const AANTAL_BLOKKEN = 3;

export function genereerWachtwoord(): string {
  const blokken = Array.from({ length: AANTAL_BLOKKEN }, () =>
    Array.from({ length: BLOKLENGTE }, () => ALFABET[randomInt(ALFABET.length)]).join('')
  );
  return blokken.join('-');
}
```

- [ ] **Step 4: Draai de test en controleer dat hij slaagt**

```bash
npx vitest run tests/lib/server/genereerWachtwoord.test.ts
```

Verwacht: PASS, vier tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/genereerWachtwoord.ts tests/lib/server/genereerWachtwoord.test.ts
git commit -m "feat: generator voor telefonisch leesbare wachtwoorden"
```

---

## Task 4: Actor-bepaling naar een gedeelde servermodule

`actorUitSessie()` zit nu in `src/app/api/activiteitenlog/route.ts` (regel 17). Task 5 heeft
dezelfde bepaling nodig om server-side een logregel te schrijven.

**Dit is een zuivere verplaatsing: er verandert geen gedrag.** Daarom geen nieuwe test — de
bestaande `tests/app/api/activiteitenlog.test.ts` is precies de regressietest die deze taak
hoort te bewaken. Als die suite na de verplaatsing groen blijft, is de taak klaar.

**Files:**
- Create: `src/lib/server/activiteitActor.ts`
- Modify: `src/app/api/activiteitenlog/route.ts`
- Test: `tests/app/api/activiteitenlog.test.ts` (bestaat al, blijft ongewijzigd)

**Interfaces:**
- Consumes: `ActiviteitActor`, `ActiviteitType`, `ONBEKENDE_ACTOR` uit `src/lib/logActiviteit.ts`
- Produces:
  - `actorUitSessie(request: Request): Promise<ActiviteitActor>`
  - `schrijfActiviteit(type: ActiviteitType, omschrijving: string | null, actor: ActiviteitActor): Promise<void>`

- [ ] **Step 1: Maak de gedeelde module**

Maak `src/lib/server/activiteitActor.ts`:

```ts
import { insertRow } from './crud';
import { getPool } from './db';
import { ONBEKENDE_ACTOR, type ActiviteitActor, type ActiviteitType } from '@/lib/logActiviteit';
import { sessionIdFromRequest, validateSession } from './session';

/**
 * Wie de actie deed, afgeleid uit de sessiecookie -- niet uit de request-body.
 *
 * De client stuurde actorId/actorEmail/actorNaam vroeger zelf mee. Omdat de
 * activiteitenlog-route bewust open staat (ook anonieme bezoekers loggen daar),
 * kon iedereen daarmee een willekeurige gebeurtenis op naam van een willekeurige
 * medewerker in het logboek zetten -- wat precies de waarde van een auditlog
 * wegneemt.
 */
export async function actorUitSessie(request: Request): Promise<ActiviteitActor> {
  const sessionId = sessionIdFromRequest(request);
  if (!sessionId) return ONBEKENDE_ACTOR;
  const session = await validateSession(sessionId);
  if (!session) return ONBEKENDE_ACTOR;

  if (session.userType === 'medewerker') {
    const [rows] = await getPool().query('SELECT email, naam FROM medewerkers WHERE id = ?', [
      session.userId,
    ]);
    const medewerker = (rows as Array<{ email: string | null; naam: string | null }>)[0];
    if (!medewerker) return ONBEKENDE_ACTOR;
    const email = medewerker.email ?? 'Onbekend';
    return { id: session.userId, email, naam: medewerker.naam || email };
  }

  const [rows] = await getPool().query(
    'SELECT email, companyName, contactPerson FROM klanten WHERE id = ?',
    [session.userId]
  );
  const klant = (rows as Array<{
    email: string | null;
    companyName: string | null;
    contactPerson: string | null;
  }>)[0];
  if (!klant) return ONBEKENDE_ACTOR;
  return {
    id: session.userId,
    email: klant.email ?? 'Onbekend',
    naam: klant.companyName || klant.contactPerson || 'Onbekend',
  };
}

/**
 * Schrijft één regel in het activiteitenlog. Het record wordt veld voor veld
 * opgebouwd in plaats van een doorgegeven object: de sleutels van zo'n object
 * worden kolomnamen in de INSERT, en de aanroepende route staat open voor
 * iedereen.
 */
export async function schrijfActiviteit(
  type: ActiviteitType,
  omschrijving: string | null,
  actor: ActiviteitActor
): Promise<void> {
  await insertRow('activiteitenlog', {
    type,
    actorId: actor.id,
    actorEmail: actor.email,
    actorNaam: actor.naam,
    omschrijving,
  } as never);
}
```

- [ ] **Step 2: Laat de bestaande route de gedeelde module gebruiken**

Vervang de inhoud van `src/app/api/activiteitenlog/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { ACTIVITEIT_TYPES, type ActiviteitType } from '@/lib/logActiviteit';
import { actorUitSessie, schrijfActiviteit } from '@/lib/server/activiteitActor';
import { requireMedewerker } from '@/lib/server/requireAuth';
import { withApiErrorHandling } from '@/lib/server/apiRoute';

// Deliberately open -- both anonymous visitors (e.g. word_klant_bezocht) and logged-in
// customers/staff log their own events here, so this can't require a medewerker session.
export const POST = withApiErrorHandling('POST /api/activiteitenlog', async (request: Request) => {
  const body = (await request.json()) as Record<string, unknown>;
  if (typeof body?.type !== 'string' || !ACTIVITEIT_TYPES.includes(body.type as never)) {
    return NextResponse.json({ error: 'invalid-type' }, { status: 400 });
  }

  await schrijfActiviteit(
    body.type as ActiviteitType,
    typeof body.omschrijving === 'string' ? body.omschrijving : null,
    await actorUitSessie(request)
  );
  return NextResponse.json({ ok: true }, { status: 201 });
});

// The log records real actorEmail/actorNaam for every customer and staff action --
// reading it back is a staff-only audit view.
export const GET = withApiErrorHandling('GET /api/activiteitenlog', async (request: Request) => {
  if (!(await requireMedewerker(request))) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const [rows] = await getPool().query(
    'SELECT * FROM activiteitenlog ORDER BY timestamp DESC LIMIT 500'
  );
  return NextResponse.json(rows);
});
```

- [ ] **Step 3: Draai de bestaande tests en controleer dat er niets veranderd is**

```bash
npx vitest run tests/app/api/activiteitenlog.test.ts
```

Verwacht: PASS, precies dezelfde tests als vóór deze taak. Faalt er iets, dan was de
verplaatsing niet zuiver — herstel dat in plaats van de test aan te passen.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/activiteitActor.ts src/app/api/activiteitenlog/route.ts
git commit -m "refactor: actor-bepaling en logregel naar een gedeelde servermodule"
```

---

## Task 5: `POST /api/klanten/[id]/wachtwoord`

De route genereert het wachtwoord server-side, geeft het één keer terug en ruimt op wat
anders naast het nieuwe wachtwoord blijft bestaan: lopende sessies en openstaande
resettokens.

De logregel wordt hier server-side geschreven en niet via `logActiviteit()` uit de browser.
Overal elders in beheer is die aanroep fire-and-forget en verdwijnt een mislukte log
geruisloos (`src/lib/logActiviteit.ts` regel 91). Voor precies deze handeling wil je die
zekerheid wél.

`TYPE_LABEL_KEYS` in `ActiviteitSection.tsx` is getypeerd als `Record<ActiviteitType, string>`,
dus TypeScript dwingt af dat het nieuwe type daar een label krijgt. Dat hoort bij deze taak.

**Files:**
- Create: `src/app/api/klanten/[id]/wachtwoord/route.ts`
- Modify: `src/lib/logActiviteit.ts`
- Modify: `src/components/beheer/ActiviteitSection.tsx`
- Modify: `messages/nl.json`
- Test: `tests/app/api/klanten/wachtwoord.test.ts`

**Interfaces:**
- Consumes: `genereerWachtwoord()` (Task 3), `actorUitSessie()` + `schrijfActiviteit()` (Task 4)
- Produces: `POST /api/klanten/[id]/wachtwoord` → `200 { wachtwoord: string }`, `401 { error: 'unauthorized' }`, `404 { error: 'klant-niet-gevonden' }`. Task 6 roept dit aan.

- [ ] **Step 1: Schrijf de falende tests**

Maak `tests/app/api/klanten/wachtwoord.test.ts`:

```ts
import { describe, expect, it, afterEach } from 'vitest';
import { randomUUID } from 'crypto';
import { getPool } from '@/lib/server/db';
import { insertRow } from '@/lib/server/crud';
import { hashPassword, verifyPassword } from '@/lib/server/password';
import { createSession, validateSession, SESSION_COOKIE_NAME } from '@/lib/server/session';
import { POST as geefWachtwoordUit } from '@/app/api/klanten/[id]/wachtwoord/route';

// Alleen de rijen die deze tests zelf maken worden opgeruimd, op onthouden id --
// nooit een tabelbrede DELETE, want klanten, medewerkers en activiteitenlog
// bevatten op staging echte gegevens.
const createdKlantIds: string[] = [];
const createdMedewerkerIds: string[] = [];

afterEach(async () => {
  if (createdMedewerkerIds.length > 0) {
    await getPool().query("DELETE FROM sessions WHERE userType = 'medewerker' AND userId IN (?)", [createdMedewerkerIds]);
    await getPool().query('DELETE FROM activiteitenlog WHERE actorId IN (?)', [createdMedewerkerIds]);
    await getPool().query('DELETE FROM medewerkers WHERE id IN (?)', [createdMedewerkerIds]);
    createdMedewerkerIds.length = 0;
  }
  if (createdKlantIds.length > 0) {
    await getPool().query("DELETE FROM sessions WHERE userType = 'klant' AND userId IN (?)", [createdKlantIds]);
    await getPool().query("DELETE FROM passwordResetTokens WHERE userType = 'klant' AND userId IN (?)", [createdKlantIds]);
    await getPool().query('DELETE FROM klanten WHERE id IN (?)', [createdKlantIds]);
    createdKlantIds.length = 0;
  }
});

/**
 * Maakt een échte medewerkersrij en logt die in. Een verzonnen userId zonder
 * bijbehorende rij zou hier niet werken: `actorUitSessie()` valt dan terug op
 * ONBEKENDE_ACTOR met `actorId: null`, en juist de logtest hieronder controleert
 * dat de handeling op naam van de medewerker staat.
 */
async function medewerkerCookie(): Promise<{ cookie: string; id: string }> {
  const medewerker = await insertRow<{ id: string }>('medewerkers', {
    email: `staff-${randomUUID()}@example.com`,
    wachtwoordHash: await hashPassword('geheim123'),
    naam: 'Testmedewerker',
  } as never);
  createdMedewerkerIds.push(medewerker.id);
  const sessionId = await createSession('medewerker', medewerker.id);
  return { cookie: `${SESSION_COOKIE_NAME}=${sessionId}`, id: medewerker.id };
}

function req(cookie?: string) {
  return new Request('http://localhost/api', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  });
}

async function maakKlant(oudWachtwoord: string) {
  const klant = await insertRow<{ id: string }>('klanten', {
    email: `wachtwoord-${randomUUID()}@example.com`,
    wachtwoordHash: await hashPassword(oudWachtwoord),
    companyName: 'Testbedrijf BV',
    status: 'Goedgekeurd',
  } as never);
  createdKlantIds.push(klant.id);
  return klant;
}

describe('POST /api/klanten/[id]/wachtwoord', () => {
  it('weigert een verzoek zonder medewerkerssessie', async () => {
    const klant = await maakKlant('oudwachtwoord');
    const response = await geefWachtwoordUit(req(), { params: { id: klant.id } });
    expect(response.status).toBe(401);

    const [rows] = await getPool().query('SELECT wachtwoordHash FROM klanten WHERE id = ?', [klant.id]);
    expect(
      await verifyPassword('oudwachtwoord', (rows as Array<{ wachtwoordHash: string }>)[0].wachtwoordHash)
    ).toBe(true);
  });

  it('geeft 404 voor een onbekende klant', async () => {
    const { cookie } = await medewerkerCookie();
    const response = await geefWachtwoordUit(req(cookie), { params: { id: randomUUID() } });
    expect(response.status).toBe(404);
  });

  it('zet het teruggegeven wachtwoord echt en maakt het oude ongeldig', async () => {
    const klant = await maakKlant('oudwachtwoord');
    const { cookie } = await medewerkerCookie();
    const response = await geefWachtwoordUit(req(cookie), { params: { id: klant.id } });
    expect(response.status).toBe(200);
    const { wachtwoord } = (await response.json()) as { wachtwoord: string };

    const [rows] = await getPool().query('SELECT wachtwoordHash FROM klanten WHERE id = ?', [klant.id]);
    const hash = (rows as Array<{ wachtwoordHash: string }>)[0].wachtwoordHash;
    expect(await verifyPassword(wachtwoord, hash)).toBe(true);
    expect(await verifyPassword('oudwachtwoord', hash)).toBe(false);
  });

  // Wie nog ergens ingelogd stond met het oude wachtwoord, hoort eruit te liggen.
  it('gooit bestaande sessies van de klant weg', async () => {
    const klant = await maakKlant('oudwachtwoord');
    const sessieId = await createSession('klant', klant.id);
    const { cookie } = await medewerkerCookie();

    await geefWachtwoordUit(req(cookie), { params: { id: klant.id } });

    expect(await validateSession(sessieId)).toBeNull();
  });

  // Een eerder gemailde resetlink zou anders 24 uur geldig blijven naast het
  // zojuist uitgegeven wachtwoord.
  it('verwijdert openstaande resettokens van de klant', async () => {
    const klant = await maakKlant('oudwachtwoord');
    await getPool().query(
      'INSERT INTO passwordResetTokens (token, userType, userId, expiresAt) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 DAY))',
      [randomUUID(), 'klant', klant.id]
    );
    const { cookie } = await medewerkerCookie();

    await geefWachtwoordUit(req(cookie), { params: { id: klant.id } });

    const [rows] = await getPool().query('SELECT token FROM passwordResetTokens WHERE userId = ?', [klant.id]);
    expect((rows as unknown[]).length).toBe(0);
  });

  it('logt de handeling op naam van de medewerker, zonder het wachtwoord', async () => {
    const klant = await maakKlant('oudwachtwoord');
    const { cookie, id: medewerkerId } = await medewerkerCookie();
    const response = await geefWachtwoordUit(req(cookie), { params: { id: klant.id } });
    const { wachtwoord } = (await response.json()) as { wachtwoord: string };

    const [rows] = await getPool().query(
      "SELECT type, actorNaam, omschrijving FROM activiteitenlog WHERE type = 'klant_wachtwoord_uitgegeven' AND actorId = ?",
      [medewerkerId]
    );
    const regels = rows as Array<{ type: string; actorNaam: string; omschrijving: string }>;
    expect(regels.length).toBe(1);
    expect(regels[0].actorNaam).toBe('Testmedewerker');
    expect(regels[0].omschrijving).toContain('Testbedrijf BV');
    expect(regels[0].omschrijving).not.toContain(wachtwoord);
  });
});
```

- [ ] **Step 2: Draai de tests en controleer dat ze falen**

```bash
npx vitest run tests/app/api/klanten/wachtwoord.test.ts
```

Verwacht: FAIL, de route bestaat niet.

- [ ] **Step 3: Voeg het activiteittype toe**

In `src/lib/logActiviteit.ts`, voeg toe aan `ACTIVITEIT_TYPES`, direct na
`'klant_minimale_afname_gewijzigd',`:

```ts
  'klant_wachtwoord_uitgegeven',
```

In `src/components/beheer/ActiviteitSection.tsx`, voeg toe aan `TYPE_LABEL_KEYS`, direct na
de regel `klant_prijsgroep_gewijzigd: 'activiteitTypeKlantPrijsgroepGewijzigd',`:

```ts
  klant_wachtwoord_uitgegeven: 'activiteitTypeKlantWachtwoordUitgegeven',
```

In `messages/nl.json`, binnen `"beheer"`, direct na `"activiteitTypeKlantGewijzigd"`:

```json
    "activiteitTypeKlantWachtwoordUitgegeven": "Nieuw wachtwoord uitgegeven",
```

- [ ] **Step 4: Schrijf de route**

Maak `src/app/api/klanten/[id]/wachtwoord/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { getPool } from '@/lib/server/db';
import { hashPassword } from '@/lib/server/password';
import { requireMedewerker } from '@/lib/server/requireAuth';
import { destroySessionsForUser } from '@/lib/server/session';
import { withApiErrorHandling } from '@/lib/server/apiRoute';
import { genereerWachtwoord } from '@/lib/server/genereerWachtwoord';
import { actorUitSessie, schrijfActiviteit } from '@/lib/server/activiteitActor';

/**
 * Geeft een nieuw wachtwoord uit voor een klant die de beheerder aan de telefoon
 * heeft. Bewust een eigen route en niet `PATCH /api/klanten/[id]`: dat is de
 * generieke veldbewerking, terwijl dit een handeling met eigen neveneffecten is.
 *
 * Het wachtwoord ontstaat hier, op de server, en gaat één keer over de lijn --
 * terug naar de beheerder. Er staat daarna alleen nog een hash; opnieuw opvragen
 * kan niet.
 */
export const POST = withApiErrorHandling(
  'POST /api/klanten/[id]/wachtwoord',
  async (request: Request, { params }: { params: { id: string } }) => {
    if (!(await requireMedewerker(request))) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    const [rows] = await getPool().query('SELECT companyName, email FROM klanten WHERE id = ?', [
      params.id,
    ]);
    const klant = (rows as Array<{ companyName: string | null; email: string | null }>)[0];
    if (!klant) {
      return NextResponse.json({ error: 'klant-niet-gevonden' }, { status: 404 });
    }

    const wachtwoord = genereerWachtwoord();
    await getPool().query('UPDATE klanten SET wachtwoordHash = ? WHERE id = ?', [
      await hashPassword(wachtwoord),
      params.id,
    ]);

    // Een eerder gemailde resetlink blijft anders 24 uur geldig náást het zojuist
    // uitgegeven wachtwoord.
    await getPool().query("DELETE FROM passwordResetTokens WHERE userType = 'klant' AND userId = ?", [
      params.id,
    ]);
    // En wie nog ergens ingelogd stond met het oude wachtwoord, ligt eruit.
    await destroySessionsForUser('klant', params.id);

    // Server-side geschreven, niet via logActiviteit() uit de browser: dat is
    // fire-and-forget, en dit is de ene beheerhandeling waarvan de logregel niet
    // geruisloos mag wegvallen. Het wachtwoord zelf staat er nooit in.
    await schrijfActiviteit(
      'klant_wachtwoord_uitgegeven',
      `${klant.companyName || 'Onbekend'} (${klant.email ?? 'geen e-mailadres'})`,
      await actorUitSessie(request)
    );

    return NextResponse.json({ wachtwoord });
  }
);
```

- [ ] **Step 5: Draai de tests en controleer dat ze slagen**

```bash
npx vitest run tests/app/api/klanten/wachtwoord.test.ts
```

Verwacht: PASS, zes tests.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/klanten/[id]/wachtwoord/route.ts src/lib/logActiviteit.ts src/components/beheer/ActiviteitSection.tsx messages/nl.json tests/app/api/klanten/wachtwoord.test.ts
git commit -m "feat: route om een nieuw klantwachtwoord uit te geven"
```

---

## Task 6: `KlantWachtwoordSectie` in het klantdossier

Een eigen component, niet nog een blok in `KlantModal.tsx` — dat bestand is 643 regels.

Drie fasen: knop → bevestiging → getoond wachtwoord. De bevestiging is er omdat de actie
onomkeerbaar is en de klant buitensluit als je hem op het verkeerde dossier uitvoert.

`Modal` geeft `null` terug zolang hij dicht is (`src/components/Modal.tsx` regel 42-44), dus
sluiten unmount deze component en wist het wachtwoord vanzelf. Wisselen naar een ándere
klant houdt de modal wél open; daarom krijgt de sectie `key={klant.id}` mee, zodat de state
ook dan opnieuw begint.

**Files:**
- Create: `src/components/beheer/KlantWachtwoordSectie.tsx`
- Modify: `src/components/beheer/KlantModal.tsx` (rond regel 595-597)
- Modify: `messages/nl.json`
- Test: `tests/components/beheer/KlantWachtwoordSectie.test.tsx`

**Interfaces:**
- Consumes: `POST /api/klanten/[id]/wachtwoord` → `{ wachtwoord: string }` (Task 5)
- Produces: `<KlantWachtwoordSectie klantId={string} />`

- [ ] **Step 1: Voeg de beheerteksten toe**

In `messages/nl.json`, binnen `"beheer"`, direct na `"klantenLabelMinimaleAfname"`:

```json
    "klantenWachtwoordTitel": "Wachtwoord",
    "klantenWachtwoordUitgeven": "Nieuw wachtwoord uitgeven",
    "klantenWachtwoordWaarschuwing": "Het huidige wachtwoord van deze klant vervalt en hij wordt overal uitgelogd.",
    "klantenWachtwoordBevestigen": "Ja, wachtwoord uitgeven",
    "klantenWachtwoordUitleg": "Geef dit door aan de klant. Zodra je dit venster sluit, is het niet meer op te vragen.",
    "klantenWachtwoordKopieren": "Kopiëren",
    "klantenWachtwoordFout": "Het uitgeven van een nieuw wachtwoord is mislukt."
```

- [ ] **Step 2: Schrijf de falende tests**

Maak `tests/components/beheer/KlantWachtwoordSectie.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { KlantWachtwoordSectie } from '@/components/beheer/KlantWachtwoordSectie';
import messages from '../../../messages/nl.json';

const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);

function renderSectie() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <KlantWachtwoordSectie klantId="uid-1" />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe('KlantWachtwoordSectie', () => {
  // De actie is onomkeerbaar en sluit de klant buiten, dus hij mag nooit op één
  // klik gebeuren.
  it('vraagt eerst om bevestiging en stuurt nog niets', () => {
    renderSectie();
    fireEvent.click(screen.getByTestId('klant-wachtwoord-uitgeven'));

    expect(screen.getByTestId('klant-wachtwoord-waarschuwing')).toHaveTextContent(
      'Het huidige wachtwoord van deze klant vervalt en hij wordt overal uitgelogd.'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('annuleren sluit de bevestiging zonder iets te versturen', () => {
    renderSectie();
    fireEvent.click(screen.getByTestId('klant-wachtwoord-uitgeven'));
    fireEvent.click(screen.getByTestId('klant-wachtwoord-annuleren'));

    expect(screen.queryByTestId('klant-wachtwoord-waarschuwing')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('toont het wachtwoord na bevestiging', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ wachtwoord: 'k7fp-r2mq-x4tz' }) });
    renderSectie();
    fireEvent.click(screen.getByTestId('klant-wachtwoord-uitgeven'));
    fireEvent.click(screen.getByTestId('klant-wachtwoord-bevestigen'));

    expect(await screen.findByTestId('klant-wachtwoord-waarde')).toHaveTextContent('k7fp-r2mq-x4tz');
    expect(fetchMock).toHaveBeenCalledWith('/api/klanten/uid-1/wachtwoord', { method: 'POST' });
  });

  it('meldt een mislukte poging en toont geen wachtwoord', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false });
    renderSectie();
    fireEvent.click(screen.getByTestId('klant-wachtwoord-uitgeven'));
    fireEvent.click(screen.getByTestId('klant-wachtwoord-bevestigen'));

    expect(await screen.findByTestId('klant-wachtwoord-fout')).toHaveTextContent(
      'Het uitgeven van een nieuw wachtwoord is mislukt.'
    );
    expect(screen.queryByTestId('klant-wachtwoord-waarde')).toBeNull();
  });

  // Sluiten van de modal unmount deze component; daarna mag er niets bewaard zijn.
  it('toont het wachtwoord niet meer na opnieuw monteren', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ wachtwoord: 'k7fp-r2mq-x4tz' }) });
    const { unmount } = renderSectie();
    fireEvent.click(screen.getByTestId('klant-wachtwoord-uitgeven'));
    fireEvent.click(screen.getByTestId('klant-wachtwoord-bevestigen'));
    await screen.findByTestId('klant-wachtwoord-waarde');

    unmount();
    renderSectie();

    await waitFor(() => expect(screen.queryByTestId('klant-wachtwoord-waarde')).toBeNull());
    expect(screen.getByTestId('klant-wachtwoord-uitgeven')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Draai de tests en controleer dat ze falen**

```bash
npx vitest run tests/components/beheer/KlantWachtwoordSectie.test.tsx
```

Verwacht: FAIL, de component bestaat niet.

- [ ] **Step 4: Bouw de component**

Maak `src/components/beheer/KlantWachtwoordSectie.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';

type Fase = 'rust' | 'bevestigen' | 'getoond';

/**
 * Geeft telefonisch een nieuw wachtwoord uit aan een klant die niet meer bij
 * zijn mail kan. De hoofdroute blijft de "wachtwoord vergeten"-link op het
 * inlogscherm; dit is de noodroute.
 *
 * Het wachtwoord staat alleen in deze component-state. De omliggende Modal
 * unmount bij sluiten, dus het verdwijnt vanzelf en is daarna nergens meer op
 * te vragen -- op de server staat alleen een hash.
 */
export function KlantWachtwoordSectie({ klantId }: { klantId: string }) {
  const t = useTranslations('beheer');
  const [fase, setFase] = useState<Fase>('rust');
  const [wachtwoord, setWachtwoord] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  async function handleBevestigen() {
    setFout(null);
    try {
      const response = await fetch(`/api/klanten/${klantId}/wachtwoord`, { method: 'POST' });
      if (!response.ok) throw new Error('uitgeven mislukt');
      const body = (await response.json()) as { wachtwoord: string };
      setWachtwoord(body.wachtwoord);
      setFase('getoond');
    } catch {
      setFout(t('klantenWachtwoordFout'));
      setFase('rust');
    }
  }

  return (
    <div className="flex flex-col gap-2 border-t border-white/10 pt-4">
      <span className="text-xs uppercase tracking-wide text-white/60">
        {t('klantenWachtwoordTitel')}
      </span>

      {fase === 'rust' && (
        <button
          type="button"
          onClick={() => setFase('bevestigen')}
          data-testid="klant-wachtwoord-uitgeven"
          className="btn-beheer-secondary self-start rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
        >
          {t('klantenWachtwoordUitgeven')}
        </button>
      )}

      {fase === 'bevestigen' && (
        <div className="flex flex-col gap-2">
          <p data-testid="klant-wachtwoord-waarschuwing" className="text-xs text-amber-300">
            {t('klantenWachtwoordWaarschuwing')}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleBevestigen}
              data-testid="klant-wachtwoord-bevestigen"
              className="btn-beheer-primary rounded-sm bg-silver px-4 py-2 text-xs tracking-wide text-ink"
            >
              {t('klantenWachtwoordBevestigen')}
            </button>
            <button
              type="button"
              onClick={() => setFase('rust')}
              data-testid="klant-wachtwoord-annuleren"
              className="btn-beheer-secondary rounded-sm border border-white/20 px-4 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
            >
              {t('annuleren')}
            </button>
          </div>
        </div>
      )}

      {fase === 'getoond' && wachtwoord && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <code
              data-testid="klant-wachtwoord-waarde"
              className="rounded-sm bg-black/40 px-3 py-2 font-mono text-lg tracking-[0.2em] text-white"
            >
              {wachtwoord}
            </code>
            <button
              type="button"
              // Buiten een beveiligde context (en in de testomgeving) bestaat
              // navigator.clipboard niet; het voorlezen blijft dan gewoon werken.
              onClick={() => void navigator.clipboard?.writeText(wachtwoord)}
              data-testid="klant-wachtwoord-kopieren"
              className="btn-beheer-secondary rounded-sm border border-white/20 px-3 py-2 text-xs tracking-wide text-white/70 hover:border-white/40 hover:text-white"
            >
              {t('klantenWachtwoordKopieren')}
            </button>
          </div>
          <p className="text-xs text-white/60">{t('klantenWachtwoordUitleg')}</p>
        </div>
      )}

      {fout && (
        <p data-testid="klant-wachtwoord-fout" className="text-xs text-red-400">
          {fout}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Draai de tests en controleer dat ze slagen**

```bash
npx vitest run tests/components/beheer/KlantWachtwoordSectie.test.tsx
```

Verwacht: PASS, vijf tests.

- [ ] **Step 6: Haak de sectie in KlantModal**

In `src/components/beheer/KlantModal.tsx`, voeg toe bij de imports (na regel 10):

```tsx
import { KlantWachtwoordSectie } from './KlantWachtwoordSectie';
```

En voeg in de JSX de sectie toe tussen het `minimaleAfname`-blok (dat eindigt met `</div>`
op regel 595) en de `RequiredLegend` op regel 597:

```tsx
          <KlantWachtwoordSectie key={klant.id} klantId={klant.id} />
```

De `key` is er niet voor de lijstrendering maar om de state te resetten: wisselt de
beheerder binnen een open modal naar een andere klant, dan mag het wachtwoord van de vorige
niet blijven staan.

- [ ] **Step 7: Draai de KlantModal-tests en de linter**

```bash
npx vitest run tests/components/beheer/KlantModal.test.tsx
```

Verwacht: PASS, alle bestaande tests ongewijzigd.

```bash
npm run lint
```

Verwacht: geen fouten.

- [ ] **Step 8: Commit**

```bash
git add src/components/beheer/KlantWachtwoordSectie.tsx src/components/beheer/KlantModal.tsx messages/nl.json tests/components/beheer/KlantWachtwoordSectie.test.tsx
git commit -m "feat: nieuw wachtwoord uitgeven vanuit het klantdossier"
```

---

## Task 7: Volledige suite en handmatige controle

**Files:** geen wijzigingen, tenzij er iets faalt.

- [ ] **Step 1: Draai de hele testsuite**

```bash
npm test
```

Verwacht: PASS. `vitest.config.ts` zet `fileParallelism: false`, dus dit duurt even. Faalt er
een bestand dat niets met dit plan te maken heeft, controleer dan eerst of een opruimstap uit
Task 5 te breed was.

- [ ] **Step 2: Controleer het resultaat in de draaiende app**

Start de dev-server en loop deze drie dingen na:

1. `/nl/inloggen` toont "Wachtwoord vergeten?"; klikken met een leeg veld vraagt om een
   e-mailadres, klikken met een adres geeft de neutrale bevestiging.
2. `/de/inloggen` en `/fr/inloggen` tonen de vertaalde tekst — niet de Nederlandse.
3. Beheer → Klanten → een klant openen: onderin staat "Wachtwoord" met de knop, de
   bevestiging verschijnt vóór er iets gebeurt, en na bevestigen staat er een wachtwoord in
   beeld dat na sluiten weg is.

- [ ] **Step 3: Controleer het activiteitenlog**

Open in beheer het activiteitenlog en controleer dat de handeling uit stap 2 er staat als
"Nieuw wachtwoord uitgegeven", op naam van de ingelogde medewerker, met de bedrijfsnaam in
de omschrijving en **zonder** het wachtwoord.

- [ ] **Step 4: Commit als er nog losse wijzigingen zijn**

```bash
git status
```

Is de werkmap schoon, dan is het plan af.
