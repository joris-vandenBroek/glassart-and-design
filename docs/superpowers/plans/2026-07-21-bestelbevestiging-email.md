# Bestelbevestiging-email Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 21-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When "Bestelling afronden" succeeds, the customer receives a confirmation email in the site's current language, sent via mijn.host's SMTP server through a small PHP relay script hosted on the client's own mijn.host webspace — no Firebase Blaze/Cloud Functions needed.

**Architecture:** A standalone PHP script (`mail-server/`, tracked in git but not part of the Next.js build — the client uploads it to mijn.host via FTP separately) receives `{secret, to, subject, body}` over HTTPS from the browser and relays it via SMTP using the bundled PHPMailer library. `CartPanel.tsx` calls this endpoint, fire-and-forget, right after a successful Firestore write — a failed or slow email call must never affect the already-successful order.

**Tech Stack:** PHP 7.4+/8.x (mijn.host, DirectAdmin), PHPMailer (vendored, no Composer), Next.js 14 (client-side `fetch`), GitHub Actions (env var wiring).

## Global Constraints

- The browser can never open a raw SMTP connection — all SMTP happens server-side in the PHP script. The website only ever makes a normal HTTPS `fetch` call.
- The email body is exactly the existing `cart.orderConfirmation` translation (no new key for the body) — only the subject needs a new key, `cart.orderEmailSubject`, in all 4 locales.
- The email send is fire-and-forget: it must never block, delay, or affect `clear()`/`setOrderPlaced(true)` or the error path in `handlePlaceOrder`. If the mail env vars aren't configured, sending is silently skipped (no crash, no error shown).
- Real SMTP/mail credentials and the shared secret never get committed — `mail-server/config.php` is git-ignored; only `mail-server/config.example.php` (placeholder values) is tracked.
- Spec reference: `docs/superpowers/specs/2026-07-21-bestelbevestiging-email-design.md`.

---

### Task 1: PHP mail-relay script (`mail-server/`)

**Files:**
- Create: `mail-server/PHPMailer/PHPMailer.php` (vendored, unmodified)
- Create: `mail-server/PHPMailer/SMTP.php` (vendored, unmodified)
- Create: `mail-server/PHPMailer/Exception.php` (vendored, unmodified)
- Create: `mail-server/send-order-confirmation.php`
- Create: `mail-server/config.example.php`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: nothing from this repo's TypeScript code.
- Produces: an HTTP endpoint (once uploaded to mijn.host) accepting `POST { secret, to, subject, body }` (JSON), returning `{ success: true }` or `{ success: false, error }`. Task 2 consumes this contract (not the file itself — Task 2 only needs to know the request/response shape, documented here).

There is no PHP toolchain in this environment to run automated tests or even a syntax check (`php -l` is unavailable) — verification for this task is careful reading, not test output. The script only becomes truly verifiable once the client uploads it to mijn.host and it's exercised for real; note this clearly in your report.

- [ ] **Step 1: Vendor the exact PHPMailer v7.1.1 source files**

Run these three commands from the repo root (pinned to the `v7.1.1` tag for reproducibility — do not substitute a different version):

```bash
mkdir -p mail-server/PHPMailer
curl -sL -o mail-server/PHPMailer/PHPMailer.php "https://raw.githubusercontent.com/PHPMailer/PHPMailer/v7.1.1/src/PHPMailer.php"
curl -sL -o mail-server/PHPMailer/SMTP.php "https://raw.githubusercontent.com/PHPMailer/PHPMailer/v7.1.1/src/SMTP.php"
curl -sL -o mail-server/PHPMailer/Exception.php "https://raw.githubusercontent.com/PHPMailer/PHPMailer/v7.1.1/src/Exception.php"
```

Verify each file downloaded correctly (non-trivial size, starts with `<?php`):

```bash
wc -l mail-server/PHPMailer/PHPMailer.php mail-server/PHPMailer/SMTP.php mail-server/PHPMailer/Exception.php
head -3 mail-server/PHPMailer/PHPMailer.php
```

Expected: `PHPMailer.php` ~5500+ lines, `SMTP.php` ~1600+ lines, `Exception.php` ~40 lines; all start with `<?php`. These are the unmodified upstream files — do not edit them.

- [ ] **Step 2: Create `mail-server/config.example.php`**

```php
<?php

// Copy this file to config.php and fill in the real values.
// config.php is git-ignored -- never commit real credentials there.

return [
    'smtp_host' => 'h64.mijn.host',
    'smtp_port' => 587,
    'smtp_username' => 'info@glassartanddesign.com',
    'smtp_password' => 'VUL_HIER_HET_ECHTE_WACHTWOORD_IN',
    'from_email' => 'info@glassartanddesign.com',
    'from_name' => 'Glassart & Design',
    'shared_secret' => 'VUL_HIER_EEN_LANGE_WILLEKEURIGE_SLEUTEL_IN',
    'allowed_origin' => 'https://joris-vandenbroek.github.io',
];
```

- [ ] **Step 3: Create `mail-server/send-order-confirmation.php`**

```php
<?php

declare(strict_types=1);

require __DIR__ . '/PHPMailer/Exception.php';
require __DIR__ . '/PHPMailer/PHPMailer.php';
require __DIR__ . '/PHPMailer/SMTP.php';

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as PHPMailerException;

$config = require __DIR__ . '/config.php';

header('Access-Control-Allow-Origin: ' . $config['allowed_origin']);
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

$input = json_decode(file_get_contents('php://input'), true);

if (!is_array($input) || !hash_equals($config['shared_secret'], (string) ($input['secret'] ?? ''))) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'Forbidden']);
    exit;
}

$to = trim((string) ($input['to'] ?? ''));
$subject = trim((string) ($input['subject'] ?? ''));
$body = trim((string) ($input['body'] ?? ''));

if (!filter_var($to, FILTER_VALIDATE_EMAIL) || $subject === '' || $body === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid input']);
    exit;
}

$mail = new PHPMailer(true);

try {
    $mail->isSMTP();
    $mail->Host = $config['smtp_host'];
    $mail->Port = $config['smtp_port'];
    $mail->SMTPAuth = true;
    $mail->Username = $config['smtp_username'];
    $mail->Password = $config['smtp_password'];
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;

    $mail->setFrom($config['from_email'], $config['from_name']);
    $mail->addAddress($to);
    $mail->Subject = $subject;
    $mail->Body = $body;
    $mail->isHTML(false);

    $mail->send();

    echo json_encode(['success' => true]);
} catch (PHPMailerException $exception) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $mail->ErrorInfo]);
}
```

- [ ] **Step 4: Update `.gitignore`**

Add `mail-server/config.php` to the existing `.gitignore` (append as a new line, don't touch anything else in the file):

```
mail-server/config.php
```

- [ ] **Step 5: Self-review**

Re-read `send-order-confirmation.php` line by line against this checklist (no automated test can verify this, so be thorough):
- CORS headers are set before any early `exit`, including on the `OPTIONS` preflight branch.
- `hash_equals` is used for the secret comparison (not `===`), so the check is constant-time.
- Every `exit`/early return path sets an appropriate HTTP status code first.
- `PHPMailer.php`/`SMTP.php`/`Exception.php` are byte-for-byte the downloaded v7.1.1 files — you did not edit them.
- `config.example.php` contains only placeholder values, never a real password or secret.

- [ ] **Step 6: Commit**

```bash
git add mail-server/PHPMailer/PHPMailer.php mail-server/PHPMailer/SMTP.php mail-server/PHPMailer/Exception.php mail-server/send-order-confirmation.php mail-server/config.example.php .gitignore
git commit -m "$(cat <<'EOF'
feat: add PHP mail-relay script for order-confirmation emails

Vendors PHPMailer v7.1.1 (no Composer -- plain require, matching
mijn.host's FTP-only deployment model). send-order-confirmation.php
accepts {secret, to, subject, body} over HTTPS+CORS and relays it via
mijn.host's SMTP server. Real credentials live in config.php (git-
ignored); config.example.php is the tracked template. This script is
not part of the Next.js build -- it's uploaded to mijn.host separately.
EOF
)"
```

---

### Task 2: Website integration (`CartPanel.tsx` + translations + CI)

**Files:**
- Modify: `src/components/CartPanel.tsx`
- Modify: `tests/components/CartPanel.test.tsx`
- Modify: `messages/nl.json`
- Modify: `messages/en.json`
- Modify: `messages/de.json`
- Modify: `messages/fr.json`
- Modify: `.github/workflows/deploy-pages.yml`

**Interfaces:**
- Consumes: the PHP endpoint's request contract from Task 1 (`POST {secret, to, subject, body}` JSON).
- Produces: no new exports — `CartPanel`'s public usage is unchanged.

- [ ] **Step 1: Add the `cart.orderEmailSubject` translation key**

In `messages/nl.json`, line 86 (right after `"orderConfirmation"`), change:

```json
    "orderConfirmation": "Uw bestelling is door ons ontvangen en zal zo spoedig mogelijk worden verwerkt.",
```

to:

```json
    "orderConfirmation": "Uw bestelling is door ons ontvangen en zal zo spoedig mogelijk worden verwerkt.",
    "orderEmailSubject": "Bevestiging van uw bestelling — Glassart & Design",
```

In `messages/en.json`, same position, change:

```json
    "orderConfirmation": "We've received your order and will process it as soon as possible.",
```

to:

```json
    "orderConfirmation": "We've received your order and will process it as soon as possible.",
    "orderEmailSubject": "Order confirmation — Glassart & Design",
```

In `messages/de.json`, same position, change:

```json
    "orderConfirmation": "Wir haben Ihre Bestellung erhalten und werden sie so schnell wie möglich bearbeiten.",
```

to:

```json
    "orderConfirmation": "Wir haben Ihre Bestellung erhalten und werden sie so schnell wie möglich bearbeiten.",
    "orderEmailSubject": "Bestellbestätigung — Glassart & Design",
```

In `messages/fr.json`, same position, change:

```json
    "orderConfirmation": "Nous avons bien reçu votre commande et la traiterons dans les plus brefs délais.",
```

to:

```json
    "orderConfirmation": "Nous avons bien reçu votre commande et la traiterons dans les plus brefs délais.",
    "orderEmailSubject": "Confirmation de votre commande — Glassart & Design",
```

- [ ] **Step 2: Write the failing tests**

Add these to `tests/components/CartPanel.test.tsx`. First, add a `fetch` mock near the top (right after the existing `const addDocMock = vi.fn();`):

```tsx
const fetchMock = vi.fn();
vi.stubGlobal('fetch', fetchMock);
```

Then update the `beforeEach` (currently):

```tsx
beforeEach(() => {
  window.localStorage.clear();
  onAuthStateChangedMock.mockReset();
  getDocMock.mockReset();
  addDocMock.mockReset();
  signedInAsApprovedCustomer();
});
```

to:

```tsx
beforeEach(() => {
  window.localStorage.clear();
  onAuthStateChangedMock.mockReset();
  getDocMock.mockReset();
  addDocMock.mockReset();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true });
  signedInAsApprovedCustomer();
});

afterEach(() => {
  vi.unstubAllEnvs();
});
```

(Add `afterEach` to the existing `import { describe, expect, it, vi, beforeEach } from 'vitest';` — it becomes `import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';`.)

Then append these three tests inside the `describe('CartPanel', ...)` block, after the existing "writes a bestelheader..." test:

```tsx
  it('sends a confirmation email via fetch when the order succeeds and mail env vars are set', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAIL_ENDPOINT_URL', 'https://example.com/mail.php');
    vi.stubEnv('NEXT_PUBLIC_MAIL_SECRET', 'test-secret');
    addDocMock.mockResolvedValueOnce({ id: 'header-1' }).mockResolvedValue({ id: 'line-1' });
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    await screen.findByTestId('cart-order-confirmation');
    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith('https://example.com/mail.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret: 'test-secret',
          to: 'klant@example.com',
          subject: 'Bevestiging van uw bestelling — Glassart & Design',
          body: 'Uw bestelling is door ons ontvangen en zal zo spoedig mogelijk worden verwerkt.',
        }),
      })
    );
  });

  it('does not call fetch when the mail endpoint/secret env vars are not set', async () => {
    addDocMock.mockResolvedValueOnce({ id: 'header-1' }).mockResolvedValue({ id: 'line-1' });
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    await screen.findByTestId('cart-order-confirmation');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still shows the order confirmation even if sending the email fails', async () => {
    vi.stubEnv('NEXT_PUBLIC_MAIL_ENDPOINT_URL', 'https://example.com/mail.php');
    vi.stubEnv('NEXT_PUBLIC_MAIL_SECRET', 'test-secret');
    fetchMock.mockRejectedValue(new Error('network error'));
    addDocMock.mockResolvedValueOnce({ id: 'header-1' }).mockResolvedValue({ id: 'line-1' });
    renderCartPanel();
    fireEvent.click(screen.getByTestId('seed-cart'));
    fireEvent.click(screen.getByTestId('cart-icon'));
    await waitFor(() => expect(screen.getByTestId('cart-place-order')).not.toBeDisabled());
    fireEvent.click(screen.getByTestId('cart-place-order'));

    expect(await screen.findByTestId('cart-order-confirmation')).toBeInTheDocument();
  });
```

- [ ] **Step 3: Run the tests to confirm the new ones fail**

Run: `npx vitest run tests/components/CartPanel.test.tsx`
Expected: FAIL on the 3 new tests (`CartPanel` doesn't call `fetch` yet); the pre-existing tests still pass.

- [ ] **Step 4: Add the email-sending call to `CartPanel.tsx`**

In `src/components/CartPanel.tsx`, add a new function right after `handlePlaceOrder`'s closing brace (before the `return (` of the component):

```tsx
  async function sendConfirmationEmail(email: string) {
    const endpoint = process.env.NEXT_PUBLIC_MAIL_ENDPOINT_URL;
    const secret = process.env.NEXT_PUBLIC_MAIL_SECRET;
    if (!endpoint || !secret) {
      return;
    }
    try {
      await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          secret,
          to: email,
          subject: t('orderEmailSubject'),
          body: t('orderConfirmation'),
        }),
      });
    } catch {
      // Best-effort only -- the order itself already succeeded via Firestore.
    }
  }
```

Then update `handlePlaceOrder` — change:

```tsx
      clear();
      setOrderPlaced(true);
    } catch {
```

to:

```tsx
      clear();
      setOrderPlaced(true);
      if (user.email) {
        void sendConfirmationEmail(user.email);
      }
    } catch {
```

- [ ] **Step 5: Run the tests to confirm they pass**

Run: `npx vitest run tests/components/CartPanel.test.tsx`
Expected: PASS — all 14 tests green (11 existing + 3 new).

- [ ] **Step 6: Wire the two new env vars into CI**

In `.github/workflows/deploy-pages.yml`, in the `Build static export` step's `env:` block, add two lines after the existing `NEXT_PUBLIC_FIREBASE_APP_ID` line:

```yaml
          NEXT_PUBLIC_FIREBASE_APP_ID: ${{ vars.NEXT_PUBLIC_FIREBASE_APP_ID }}
          NEXT_PUBLIC_MAIL_ENDPOINT_URL: ${{ vars.NEXT_PUBLIC_MAIL_ENDPOINT_URL }}
          NEXT_PUBLIC_MAIL_SECRET: ${{ secrets.NEXT_PUBLIC_MAIL_SECRET }}
```

(`NEXT_PUBLIC_MAIL_SECRET` is read from `secrets.*` rather than `vars.*` only so it doesn't appear in the Actions run logs/UI — once built, the value is still present in the public static JS bundle regardless, per the spec's accepted trade-off. Both GitHub Actions values need to be filled in manually by the client, in the repo's Settings → Secrets and variables → Actions, once the PHP script is uploaded to mijn.host and its real URL/secret are known — this plan does not automate that manual step.)

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/CartPanel.tsx tests/components/CartPanel.test.tsx messages/nl.json messages/en.json messages/de.json messages/fr.json .github/workflows/deploy-pages.yml
git commit -m "$(cat <<'EOF'
feat: send an order-confirmation email after checkout

CartPanel calls the mail-relay script (Task 1) with a fire-and-forget
fetch right after a successful Firestore write, using the site's
current-locale translations for subject/body. Skipped silently if the
mail env vars aren't configured; never blocks or affects the order's
own success/error path if the email call fails.
EOF
)"
```

**Manual follow-up (not part of this plan's automated steps):** upload `mail-server/` (minus `config.php`, which doesn't exist yet) to the mijn.host webspace via FTP/DirectAdmin, create `config.php` there from `config.example.php` with the real SMTP password and a freshly generated long random secret, then add `NEXT_PUBLIC_MAIL_ENDPOINT_URL` (the script's real URL) and `NEXT_PUBLIC_MAIL_SECRET` (the same secret) to the GitHub repo's Actions variables/secrets, and redeploy.
