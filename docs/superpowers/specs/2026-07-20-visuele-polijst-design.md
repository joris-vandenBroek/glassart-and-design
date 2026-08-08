# Design: Visuele polijst — typography, hover-motion, badges, cart sidebar

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 20-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

## Context

The last item in the original site-build priority queue was "visuele polijst": typography, hover-motion, and badges, inspired by craft techniques the client pointed at in a reference site, `C:\Temp\Zeus`. That brainstorm was paused mid-session and picked back up now. The client also asked, in the same round, for the winkelmandje (cart) to become a full-width/full-length sidebar like Zeus's `.cart-sidebar`, with the primary button renamed "Bestelling afronden" and a secondary "Bestelling leegmaken" option beneath it — reopening a decision from the product-modal-redesign spec that explicitly kept `CartPanel` as a small nav dropdown.

This spec covers the whole visual-polish pass in one go: typography, a broader gold accent, hover-motion, badges, and the cart sidebar rebuild, since they share one design language and reference.

## Goal

Apply a consistent, Zeus-inspired visual layer across the existing site — new fonts, a broader (but still deliberate) use of the gold accent, hover-lift/glow on primary interactive elements, pill-style badges, and a full-height cart sidebar — without inventing new page content, sections, or copy that doesn't exist today.

## Reference: what Zeus does (`C:\Temp\Zeus`)

- Fonts: `--font-head: 'Montserrat', sans-serif` (headings/labels, weight 700–900), `--font-body: 'Open Sans', sans-serif` (body text).
- `.btn--primary`: solid accent background; hover lightens the accent, lifts (`translateY(-2px)`), and adds an accent-colored glow shadow (`box-shadow: 0 8px 32px rgba(accent, .4)`).
- `.product-card__tag`: pill badge — `border-radius: 100px`, thin accent-colored border, accent-tinted translucent background, uppercase bold small text.
- `.cart-sidebar`: `position: fixed; inset: 0`, backdrop (`rgba(0,0,0,.6)` + blur) plus a `.cart-sidebar__panel` fixed to the right edge, full viewport height, `max-width: 400px`, sliding in via `transform: translateX(100%) → translateX(0)` (`.35s cubic-bezier(.4,0,.2,1)`). Structure: header (title + close), scrollable items list (`flex: 1; overflow-y: auto`), footer with a full-width primary button and a smaller text-only "leegmaken" link beneath it that turns red on hover.
- `.product-card`: hover reveals a subtle accent-tinted radial gradient overlay via `::before` opacity transition.

Glassart keeps its own dark/silver/gold palette — only the *techniques* (font pairing, hover-lift+glow, pill badges, sidebar structure) are adopted, not Zeus's literal orange or copy.

## 1. Typography

- Load Montserrat (700, 900) and Open Sans (400, 600) via `next/font/google` in `src/app/layout.tsx`, exposed as CSS variables (`--font-head`, `--font-body`) consumed by `tailwind.config.ts` (`fontFamily.head`, `fontFamily.body`).
- `Open Sans` becomes the base body font (replaces the current default sans stack in `globals.css`).
- `Montserrat` (`font-head`) is applied to: the Hero title (`Hero.tsx`, also upgraded from `font-light` to `font-bold`), section eyebrow labels (`WhyUs`, `FeaturedWorks`), segment/product titles (`ProductModal`), `NavBar` wordmark/nav links, and the `/collecties` filter buttons — i.e. every existing heading or tracked-out uppercase label, not new copy.
- No new headings, sections, or translation keys are introduced for typography alone.

## 2. Broader gold accent + shared hover styles

Two new Tailwind `@layer components` classes in `globals.css`, so the hover-lift+glow and badge treatment live in one place instead of being repeated inline:

- **`.btn-gold`**: `bg-gold text-ink` base; on hover, `bg-gold-bright`, `-translate-y-0.5`, and a gold glow shadow (`shadow-[0_8px_32px_rgba(212,175,55,0.35)]`). Applied to: `NavBar`'s login button, the cart sidebar's "Bestelling afronden" button, and `ProductModal`'s confirm button (already has the lift; gains the glow).
- **`.badge-gold`**: pill shape (`rounded-full`), thin `border-gold/30`, `bg-gold/10`, `text-gold`, uppercase tracked-out small text. Replaces the current `bg-black/70` segment-label block on `ProductsGrid` product cards.
- `NavBar` links and the `/collecties` filter buttons: hover state changes from `hover:text-white` to `hover:text-gold` (filter buttons also get `hover:border-gold/40`).
- `ProductsGrid` product cards: `hover:brightness-110` is replaced by a lift (`hover:-translate-y-1`) plus a gold-tinted gradient overlay (`absolute inset-0` div, `opacity-0 group-hover:opacity-100`, ~300ms transition).
- `WhyUs` USP icons and material cards: gain a hover lift (`hover:-translate-y-1`) and, for material cards, `hover:border-gold/40`; USP icons scale slightly (`group-hover:scale-110`).
- The cart icon's quantity badge (the small silver circle with a count) is **not** restyled gold — it's a neutral counter, not a status/label badge, and stays as-is.

## 3. Cart sidebar rebuild

`CartPanel.tsx` keeps its existing trigger (the cart icon in `NavBar`) and public behavior, but its open-state markup changes from a small `absolute` dropdown to a full-height overlay:

- Backdrop: `fixed inset-0 bg-black/60 backdrop-blur-sm`, click closes the panel.
- Panel: `fixed right-0 top-0 bottom-0 w-full max-w-[400px] bg-charcoal border-l border-white/10`, flex column, slides in from the right (`translate-x-full` → `translate-x-0`, matching `ProductModal`'s transition timing/easing).
- Header: title + close (×) button, bottom border.
- Items: unchanged rendering (image, title, size × qty, remove ×) inside the existing scrollable list, now `flex-1 overflow-y-auto`.
- Footer, bottom border, two stacked controls:
  - **"Bestelling afronden"** — `.btn-gold`, full width; same `handlePlaceOrder` behavior as today (places the order, clears the cart, closes the panel).
  - **"Bestelling leegmaken"** — small text-only button beneath it, `text-white/50 hover:text-red-400`; calls `clear()` only (empties the cart, does **not** place an order, panel stays open so the now-empty state is visible). Disabled/hidden when the cart is already empty.

## 4. Accessibility: reuse, don't duplicate

`ProductModal` already implements Escape-to-close, a focus trap, and focus restore-on-close via inline `useEffect`s. Since the cart sidebar becomes a comparable full-screen overlay, it needs the same behavior. Rather than duplicating that logic, it's extracted into a shared hook, `useOverlayDismiss` (new: `src/lib/useOverlayDismiss.ts`), taking `{ isOpen, onClose, containerRef }` and wiring up Escape/focus-trap/focus-restore. Both `ProductModal` and `CartPanel` use it.

## 5. Text / i18n

In all four locale files (`messages/nl.json`, `en.json`, `de.json`, `fr.json`):
- `cart.placeOrder` text changes to "Bestelling afronden" (and the equivalent EN/DE/FR phrasing).
- New key `cart.clearOrder` added: "Bestelling leegmaken" (+ EN/DE/FR).

## Not in scope

- New section headings, hero copy, or any content that doesn't already exist — this pass restyles existing text/structure, it doesn't add new sections (e.g. no Zeus-style big `h2` section titles where Glassart currently has none).
- Any change to cart/order data model, `useCart`/`useOrders` logic beyond the `clear()` call already used by "Bestelling leegmaken".
- The mandje/quantity-count badge on the nav cart icon — stays silver.
- B2B-portaal/beheeromgeving — separate, already-tracked roadmap (`docs/superpowers/specs/2026-07-18-b2b-portaal-beheeromgeving-roadmap.md`), unrelated to this visual pass.

## Risks / notes

- Reopens a previously "confirmed not in scope" decision (`CartPanel` staying a small dropdown, from the product-modal-redesign spec) — intentional, per this round's explicit client direction.
- `next/font/google` requires network access at build time to fetch font files (self-hosted afterward, no runtime request) — fine for this project's existing build/deploy setup, no new runtime dependency.
- Existing tests to update: `tests/components/CartPanel.test.tsx` (dropdown → overlay structure, new "Bestelling leegmaken" control), `tests/components/ProductsGrid.test.tsx` (badge markup), `tests/components/ProductModal.test.tsx` (shares the new `useOverlayDismiss` hook — verify behavior is unchanged after extraction; note this file currently has unrelated uncommitted changes from a separate background task, per memory — coordinate before touching it).
- Gold hex values and hover/glow shadow values stay as Tailwind config constants / one shared `@layer` class, not scattered literals, so later tweaks stay a one-line change (same principle as the original gold-accent spec).
