# Design: Add-to-cart redesign — click-to-open product modal

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 19-07-2026 is vastgelegd, inclusief de afwegingen en verworpen alternatieven van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

## Context

The winkelmandje (cart) feature shipped with a hover-reveal "Toevoegen aan mandje" button per `ProductsGrid` card, expanding into a small inline panel (size dropdown + qty stepper + confirm) directly on the card. After seeing it live, the client asked for the Zeus (`C:\Temp\Zeus`) pattern instead: clicking the product card itself opens a popup/modal to add it to the order, with nicer-looking buttons, and an accent color adapted from Zeus's orange to fit Glassart's black/silver (+ gold, per the brand brochure) palette.

This replaces the add-to-cart *entry point* only. The cart itself (`CartProvider`/`useCart`, `CartPanel`'s nav dropdown, `OrdersProvider`/`useOrders`, `AccountMenu`'s merged order history) is unaffected and stays exactly as built.

## Goal

Clicking any product card on `/collecties` opens a centered modal with the artwork, a size choice, a quantity stepper, and a confirm button styled in a new gold accent color. Confirming flashes the button green with "Toegevoegd!" briefly, then closes the modal and adds the line to the cart (same merge-by-segment+image+size behavior as today).

## Reference: what Zeus does (`C:\Temp\Zeus`)

- `.prod-modal`: fixed full-screen overlay, `opacity`/`pointer-events` toggle for open/close, backdrop blur + 75% black scrim, centered panel that scales/translates in (`translateY(30px) scale(.97)` → `translateY(0) scale(1)`, `.3s cubic-bezier(.4,0,.2,1)`).
- `.prod-modal__body`: 2-column grid (image | info), collapsing to 1 column under 600px.
- `.qty-control`: pill-shaped, rounded-full container with `−`/input/`+` segments; hover on the qty buttons fills the brand accent color.
- `.btn--primary`: solid accent background, hover lightens + lifts (`translateY(-2px)`) + adds an accent-colored glow shadow.
- `.btn--added`: on confirm, the button briefly becomes solid green (`#22c55e`) with "Toegevoegd" text before the modal closes.
- Closes via: clicking the backdrop, a close (×) button, or the Escape key.
- Zeus's accent is literal orange (`#E87325`/`#ff8c3a`) — Glassart's version uses gold instead, and only for cart/CTA elements (confirmed with client, see Global Constraints).

## Components

### `ProductModal` (new: `src/components/ProductModal.tsx`)

Replaces `AddToCartButton`. Rendered **once** by `ProductsGrid` (not once per card), controlled by which image is currently selected:

- Props: `image: SegmentImage | null`, `onClose: () => void`.
- Renders nothing when `image` is `null`.
- When open: fixed overlay + backdrop (click closes) + centered panel (fade/scale-in transition).
- Panel: close (×) button top-right; two-column body — image on the left (object-cover, matches the site's existing dark theme, no white box like Zeus since these are photographs not product renders), details on the right (segment title in gold, size `<select>`, gold-accented pill quantity stepper, confirm button).
- Escape key closes the modal (new `useEffect` + `keydown` listener, only attached while open).
- Confirm button: on click, calls `useCart().addItem(...)` with the current image's segment/size/qty (same shape as today's `AddToCartButton`), flips to a green "Toegevoegd!" state for ~600ms via local component state + `setTimeout`, then calls `onClose()` and resets its own local size/qty state back to defaults.
- Reuses `STANDARD_SIZES` from `@/data/sizes` and the `cart.*` message keys already in place; needs 2 new keys: `cart.added` ("Toegevoegd!" / etc. per locale) and `cart.close` (accessible label for the × button).

### `ProductsGrid` (modify: `src/components/ProductsGrid.tsx`)

- Adds `selectedImage: SegmentImage | null` state (`useState`).
- Each product-card's root `div` becomes `onClick={() => setSelectedImage(image)}`, plus `cursor-pointer` and a hover tint (subtle darken/lighten overlay on hover, communicating clickability — no separate button rendered on the card anymore).
- Renders `<ProductModal image={selectedImage} onClose={() => setSelectedImage(null)} />` once, alongside the grid.
- The existing filter buttons, grid layout, and per-card segment badge are unchanged.

### `AddToCartButton` — deleted

`src/components/AddToCartButton.tsx` and its test are removed; the hover-reveal-button-per-card pattern goes away entirely, superseded by `ProductModal`.

## Visual style: gold accent

New Tailwind color tokens in `tailwind.config.ts`:
- `gold: '#D4AF37'` (base — confirm button, qty-stepper hover fill, segment-title-in-modal color)
- `gold-bright: '#E8C468'` (hover/lift state for the confirm button, mirroring Zeus's `--c-accent` → `--c-accent2` lightening on hover)

Scope, confirmed with the client: gold is used **only** inside the cart/add-to-cart flow (`ProductModal`'s confirm button, qty-stepper hover, segment title). Everything else on the site — `NavBar`, `LanguageSwitcher`, login button, `CartPanel`'s existing nav dropdown, `AccountMenu` — stays silver, untouched. These exact hex values are a starting point; easy to nudge after seeing it live in the browser.

## Not in scope

- `CartPanel` (the nav icon + badge + dropdown list, and its "Toevoegen aan bestelling" flow) — confirmed to stay exactly as built, not converted to a Zeus-style full sidebar.
- Any change to `useCart`, `useOrders`, `AccountMenu`, or order-placement behavior — the redesign only touches how an item gets *added*, not what happens after.
- Homepage "Uitgelichte werken" placeholders — still no add-to-cart affordance there, unchanged constraint from the original cart spec.
- The actual brand logo / materials-USP homepage section — separate, already-queued work (see `docs/superpowers/specs` brand identity notes), not part of this redesign.

## Risks / notes

- Removing `AddToCartButton` and its test is a deletion, not a deprecation — confirmed acceptable since the component was only added this same day and has no other consumers.
- `ProductsGrid`'s existing tests (filter counts, card rendering) need updating: assertions that counted `add-to-cart-button` per card need replacing with card-click-opens-modal assertions instead.
- The exact gold hex values are a first pass; the plan should treat them as easy-to-adjust constants in one place (Tailwind config), not scattered literals, so a later tweak stays a one-line change.
