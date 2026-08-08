# Navigatie + Collectiepagina's Implementation Plan

> **Historisch implementatieplan.** Dit is het stap-voor-stap plan zoals het op 18-07-2026 is opgesteld en uitgevoerd, inclusief de codefragmenten van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a real navigation bar, six segment collection pages, a collections overview page, and a purely visual login/order-history mockup to the existing Glassart and Design static site.

**Architecture:** Everything stays within the existing Next.js 14 App Router static-export project (no middleware, no backend). New locale-aware routes (`/[locale]/collecties`, `/[locale]/collecties/[segment]`) are added alongside the existing homepage, all sharing a new `NavBar` client component rendered once in `src/app/[locale]/layout.tsx`. Segment content (title, intro, 6 images) is data-driven from a single `src/data/segments.ts` module plus translated message keys, so the six segment pages share one template instead of being duplicated. The login/order-history feature is an explicitly fake, client-only mockup: a `useMockAuth` hook backed by `localStorage` (no server, no real credentials), and hardcoded example order data — this stands in for the future, separately-architected real B2B portal.

**Tech Stack:** Same as the existing project — Next.js 14 (App Router) + TypeScript, Tailwind CSS, next-intl v3, Vitest + React Testing Library.

## Global Constraints

- 4 talen: Nederlands (standaard/fallback), Engels, Duits, Frans — elke nieuwe pagina volgt hetzelfde `/[locale]/...`-patroon als de bestaande site, geen middleware.
- Zes vaste segmenten met vaste (niet-vertaalde) URL-slugs: `hotel`, `restaurant`, `wellness`, `office`, `abstract`, `artist-collections`.
- Sfeerbeelden zijn rechtenvrije Unsplash-foto's (curated en stuk voor stuk geverifieerd als werkend — zie Task 2), geen downloads, directe hotlink-URL's.
- Login/bestelgeschiedenis is UITSLUITEND een visuele mockup: geen backend, geen echte authenticatie, vaste voorbeelddata, staat opgeslagen in `localStorage` van de browser. Dit vervangt niet het latere, echte B2B-portaal.
- "Contact" en "Word klant" in de navigatiebalk linken tijdelijk naar het bestaande `#contact`-anker op de homepage (`/${locale}/#contact`), omdat de losse contactpagina en registratiepagina nog niet bestaan (aparte, latere deelprojecten). Dit is een bewuste, tijdelijke keuze — geen bug.
- Bestaande visuele stijl ("Glass Reflection": zwart/antraciet gradient, glasmorphism `GlassPanel`, zilver-accenten) wordt hergebruikt, niet opnieuw uitgevonden.
- Statische export (`output: 'export'`, `trailingSlash: true`) moet blijven werken voor alle bestaande én nieuwe routes.

---

## File Structure Overview

```
messages/{nl,en,de,fr}.json          (MODIFY — add nav/collectionsPage/segments/orders keys)
src/data/segments.ts                  (CREATE)
src/data/mockOrders.ts                (CREATE)
src/lib/useMockAuth.ts                (CREATE)
src/components/LanguageSwitcher.tsx   (MODIFY — remove fixed positioning, now embedded in NavBar)
src/components/NavBar.tsx             (CREATE)
src/components/AccountMenu.tsx        (CREATE)
src/app/[locale]/layout.tsx           (MODIFY — render NavBar)
src/app/[locale]/page.tsx             (MODIFY — remove LanguageSwitcher, adjust top padding)
src/app/[locale]/collecties/page.tsx           (CREATE)
src/app/[locale]/collecties/[segment]/page.tsx (CREATE)
tests/data/segments.test.ts           (CREATE)
tests/data/mockOrders.test.ts         (CREATE)
tests/lib/useMockAuth.test.ts         (CREATE)
tests/components/NavBar.test.tsx      (CREATE)
tests/components/AccountMenu.test.tsx (CREATE)
tests/app/locale-page.test.tsx        (MODIFY — remove language-switcher assertion, now a layout concern)
```

**Note on test coverage for the two new page files:** `collecties/page.tsx` and `collecties/[segment]/page.tsx` are async Server Components that call `getTranslations` from `next-intl/server` directly (the same server-side translation API already used successfully in `src/app/[locale]/layout.tsx`). Consistent with this project's established convention (see the previous plan's Task 11), Next.js routing-convention files that rely on `next-intl/server`'s request-scoped caching are verified via the full static-export build (Task 10 here), not isolated Vitest unit tests — that caching mechanism depends on Next's own request lifecycle in ways that are fragile to fake in a bare Vitest environment. The underlying data (`segments.ts`, `mockOrders.ts`) is pure and gets full unit test coverage instead.

---

### Task 1: Extend translation messages (nav, collections, segments, orders)

**Files:**
- Modify: `messages/nl.json`
- Modify: `messages/en.json`
- Modify: `messages/de.json`
- Modify: `messages/fr.json`

**Interfaces:**
- Produces: message keys `nav.{home,collections,contact,becomeClient,login,logout,myOrders}`, `collectionsPage.{title,intro}`, `segments.{hotel,restaurant,wellness,office,abstract,artistCollections}.{title,intro}`, `orders.{reorder,items.{order1,order2,order3,order4}.{description,status}}` — used verbatim by Tasks 2, 5, 6, 8, 9.

- [ ] **Step 1: Replace `messages/nl.json` with this full content**

```json
{
  "hero": {
    "eyebrow": "GLASSART & DESIGN",
    "title": "Kunst op glas,",
    "titleAccent": "vakkundig gemonteerd",
    "subtitle": "Gehard veiligheidsglas · 4mm · incl. montagehaken",
    "cta": "Neem contact op"
  },
  "about": {
    "label": "Over ons",
    "text": "Glassart and Design vervaardigt kunstwerken op 4mm veiligheidsglas voor hotels, restaurants, wellness, kantoren en particuliere collecties. Elk werk wordt compleet geleverd met montagehaken, klaar om op te hangen."
  },
  "works": {
    "label": "Uitgelichte werken"
  },
  "contact": {
    "label": "Contact",
    "email": "info@glassartanddesign.nl",
    "phone": "+31 (0)6 12345678"
  },
  "nav": {
    "home": "Home",
    "collections": "Collecties",
    "contact": "Contact",
    "becomeClient": "Word klant",
    "login": "Inloggen",
    "logout": "Uitloggen",
    "myOrders": "Mijn bestellingen"
  },
  "collectionsPage": {
    "title": "Collecties",
    "intro": "Ontdek onze kunstwerken op glas, gerangschikt per toepassing."
  },
  "segments": {
    "hotel": {
      "title": "Hotel",
      "intro": "Kunst op glas voegt een tijdloze uitstraling toe aan lobby's, gangen en gastenkamers, en is bestand tegen intensief gebruik."
    },
    "restaurant": {
      "title": "Restaurant",
      "intro": "Een sfeervol interieur begint bij de details — kunst op glas brengt karakter zonder in te leveren op hygiëne en onderhoud."
    },
    "wellness": {
      "title": "Wellness",
      "intro": "Rustgevende kunstwerken op vochtbestendig glas, speciaal geschikt voor spa's, saunaruimtes en behandelkamers."
    },
    "office": {
      "title": "Office",
      "intro": "Geef kantoorruimtes een professionele en inspirerende uitstraling met kunst op maat, passend bij uw huisstijl."
    },
    "abstract": {
      "title": "Abstract",
      "intro": "Gedurfde kleuren en vormen, gedrukt op 4mm veiligheidsglas — abstracte kunst die in elke ruimte een statement maakt."
    },
    "artistCollections": {
      "title": "Artist Collections",
      "intro": "Samenwerkingen met kunstenaars: exclusieve, in gelimiteerde oplage geproduceerde werken op glas."
    }
  },
  "orders": {
    "reorder": "Bestel opnieuw",
    "items": {
      "order1": {
        "description": "Abstract paneel 60x90cm",
        "status": "In behandeling"
      },
      "order2": {
        "description": "Hotel lobby set – 3 panelen",
        "status": "In productie"
      },
      "order3": {
        "description": "Wellness paneel 40x60cm",
        "status": "Verzonden"
      },
      "order4": {
        "description": "Restaurant wandpaneel 80x120cm",
        "status": "Geleverd"
      }
    }
  }
}
```

- [ ] **Step 2: Replace `messages/en.json` with this full content**

```json
{
  "hero": {
    "eyebrow": "GLASSART & DESIGN",
    "title": "Art on glass,",
    "titleAccent": "expertly mounted",
    "subtitle": "Tempered safety glass · 4mm · mounting hooks included",
    "cta": "Get in touch"
  },
  "about": {
    "label": "About us",
    "text": "Glassart and Design creates artwork on 4mm tempered safety glass for hotels, restaurants, wellness centers, offices and private collections. Every piece is delivered complete with mounting hooks, ready to hang."
  },
  "works": {
    "label": "Featured works"
  },
  "contact": {
    "label": "Contact",
    "email": "info@glassartanddesign.nl",
    "phone": "+31 (0)6 12345678"
  },
  "nav": {
    "home": "Home",
    "collections": "Collections",
    "contact": "Contact",
    "becomeClient": "Become a client",
    "login": "Log in",
    "logout": "Log out",
    "myOrders": "My orders"
  },
  "collectionsPage": {
    "title": "Collections",
    "intro": "Discover our artwork on glass, organized by application."
  },
  "segments": {
    "hotel": {
      "title": "Hotel",
      "intro": "Art on glass adds a timeless look to lobbies, corridors and guest rooms, and withstands heavy daily use."
    },
    "restaurant": {
      "title": "Restaurant",
      "intro": "An inviting interior starts with the details — art on glass adds character without compromising on hygiene or upkeep."
    },
    "wellness": {
      "title": "Wellness",
      "intro": "Calming artwork on moisture-resistant glass, specifically suited for spas, sauna areas and treatment rooms."
    },
    "office": {
      "title": "Office",
      "intro": "Give office spaces a professional, inspiring look with custom artwork that matches your corporate identity."
    },
    "abstract": {
      "title": "Abstract",
      "intro": "Bold colors and shapes, printed on 4mm safety glass — abstract art that makes a statement in any space."
    },
    "artistCollections": {
      "title": "Artist Collections",
      "intro": "Collaborations with artists: exclusive, limited-edition pieces produced on glass."
    }
  },
  "orders": {
    "reorder": "Reorder",
    "items": {
      "order1": {
        "description": "Abstract panel 60x90cm",
        "status": "Pending"
      },
      "order2": {
        "description": "Hotel lobby set – 3 panels",
        "status": "In production"
      },
      "order3": {
        "description": "Wellness panel 40x60cm",
        "status": "Shipped"
      },
      "order4": {
        "description": "Restaurant wall panel 80x120cm",
        "status": "Delivered"
      }
    }
  }
}
```

- [ ] **Step 3: Replace `messages/de.json` with this full content**

```json
{
  "hero": {
    "eyebrow": "GLASSART & DESIGN",
    "title": "Kunst auf Glas,",
    "titleAccent": "fachgerecht montiert",
    "subtitle": "Gehärtetes Sicherheitsglas · 4mm · inkl. Montagehaken",
    "cta": "Kontakt aufnehmen"
  },
  "about": {
    "label": "Über uns",
    "text": "Glassart and Design fertigt Kunstwerke auf 4mm gehärtetem Sicherheitsglas für Hotels, Restaurants, Wellnessbereiche, Büros und private Sammlungen. Jedes Werk wird komplett mit Montagehaken geliefert, bereit zum Aufhängen."
  },
  "works": {
    "label": "Ausgewählte Werke"
  },
  "contact": {
    "label": "Kontakt",
    "email": "info@glassartanddesign.nl",
    "phone": "+31 (0)6 12345678"
  },
  "nav": {
    "home": "Home",
    "collections": "Kollektionen",
    "contact": "Kontakt",
    "becomeClient": "Kunde werden",
    "login": "Anmelden",
    "logout": "Abmelden",
    "myOrders": "Meine Bestellungen"
  },
  "collectionsPage": {
    "title": "Kollektionen",
    "intro": "Entdecken Sie unsere Kunstwerke auf Glas, gegliedert nach Einsatzbereich."
  },
  "segments": {
    "hotel": {
      "title": "Hotel",
      "intro": "Kunst auf Glas verleiht Lobbys, Fluren und Gästezimmern eine zeitlose Ausstrahlung und hält intensiver Nutzung stand."
    },
    "restaurant": {
      "title": "Restaurant",
      "intro": "Ein stimmungsvolles Interieur beginnt mit den Details — Kunst auf Glas bringt Charakter, ohne bei Hygiene und Pflege Kompromisse einzugehen."
    },
    "wellness": {
      "title": "Wellness",
      "intro": "Beruhigende Kunstwerke auf feuchtigkeitsbeständigem Glas, speziell geeignet für Spas, Saunabereiche und Behandlungsräume."
    },
    "office": {
      "title": "Office",
      "intro": "Verleihen Sie Büroräumen mit maßgeschneiderter Kunst, die zu Ihrer Corporate Identity passt, eine professionelle und inspirierende Ausstrahlung."
    },
    "abstract": {
      "title": "Abstrakt",
      "intro": "Kräftige Farben und Formen, gedruckt auf 4mm Sicherheitsglas — abstrakte Kunst, die in jedem Raum ein Statement setzt."
    },
    "artistCollections": {
      "title": "Artist Collections",
      "intro": "Zusammenarbeit mit Künstlern: exklusive, in limitierter Auflage produzierte Werke auf Glas."
    }
  },
  "orders": {
    "reorder": "Erneut bestellen",
    "items": {
      "order1": {
        "description": "Abstraktes Panel 60x90cm",
        "status": "In Bearbeitung"
      },
      "order2": {
        "description": "Hotel-Lobby-Set – 3 Paneele",
        "status": "In Produktion"
      },
      "order3": {
        "description": "Wellness-Panel 40x60cm",
        "status": "Versandt"
      },
      "order4": {
        "description": "Restaurant-Wandpaneel 80x120cm",
        "status": "Geliefert"
      }
    }
  }
}
```

- [ ] **Step 4: Replace `messages/fr.json` with this full content**

```json
{
  "hero": {
    "eyebrow": "GLASSART & DESIGN",
    "title": "L'art sur verre,",
    "titleAccent": "monté avec expertise",
    "subtitle": "Verre de sécurité trempé · 4mm · crochets de fixation inclus",
    "cta": "Nous contacter"
  },
  "about": {
    "label": "À propos",
    "text": "Glassart and Design réalise des œuvres d'art sur verre de sécurité trempé de 4mm pour hôtels, restaurants, espaces bien-être, bureaux et collections privées. Chaque œuvre est livrée complète avec crochets de fixation, prête à être installée."
  },
  "works": {
    "label": "Œuvres en vedette"
  },
  "contact": {
    "label": "Contact",
    "email": "info@glassartanddesign.nl",
    "phone": "+31 (0)6 12345678"
  },
  "nav": {
    "home": "Accueil",
    "collections": "Collections",
    "contact": "Contact",
    "becomeClient": "Devenir client",
    "login": "Connexion",
    "logout": "Déconnexion",
    "myOrders": "Mes commandes"
  },
  "collectionsPage": {
    "title": "Collections",
    "intro": "Découvrez nos œuvres sur verre, classées par application."
  },
  "segments": {
    "hotel": {
      "title": "Hôtel",
      "intro": "L'art sur verre apporte une touche intemporelle aux halls, couloirs et chambres, tout en résistant à un usage intensif."
    },
    "restaurant": {
      "title": "Restaurant",
      "intro": "Un intérieur chaleureux commence par les détails — l'art sur verre apporte du caractère sans compromis sur l'hygiène et l'entretien."
    },
    "wellness": {
      "title": "Bien-être",
      "intro": "Des œuvres apaisantes sur verre résistant à l'humidité, spécialement adaptées aux spas, saunas et salles de soins."
    },
    "office": {
      "title": "Bureaux",
      "intro": "Donnez à vos espaces de bureau une allure professionnelle et inspirante grâce à des œuvres sur mesure, assorties à votre identité visuelle."
    },
    "abstract": {
      "title": "Abstrait",
      "intro": "Couleurs et formes audacieuses, imprimées sur verre de sécurité de 4mm — un art abstrait qui affirme sa présence dans tout espace."
    },
    "artistCollections": {
      "title": "Artist Collections",
      "intro": "Collaborations avec des artistes : œuvres exclusives, produites en édition limitée sur verre."
    }
  },
  "orders": {
    "reorder": "Commander à nouveau",
    "items": {
      "order1": {
        "description": "Panneau abstrait 60x90cm",
        "status": "En cours de traitement"
      },
      "order2": {
        "description": "Ensemble hall d'hôtel – 3 panneaux",
        "status": "En production"
      },
      "order3": {
        "description": "Panneau bien-être 40x60cm",
        "status": "Expédié"
      },
      "order4": {
        "description": "Panneau mural restaurant 80x120cm",
        "status": "Livré"
      }
    }
  }
}
```

- [ ] **Step 5: Verify all 4 files are valid JSON with identical key structure**

Run: `node -e "const fs=require('fs'); const locales=['nl','en','de','fr']; const keys = locales.map(l => JSON.stringify(Object.keys(JSON.parse(fs.readFileSync('messages/'+l+'.json'))).sort())); console.log(keys.every(k => k === keys[0]) ? 'MATCH' : 'MISMATCH: ' + keys.join(' | '))"`
Expected: `MATCH`

- [ ] **Step 6: Commit**

```bash
git add messages/nl.json messages/en.json messages/de.json messages/fr.json
git commit -m "feat: add nav, collections, segment and mock order translation keys"
```

---

### Task 2: Segment and mock order data modules

**Files:**
- Create: `src/data/segments.ts`
- Create: `src/data/mockOrders.ts`
- Create: `tests/data/segments.test.ts`
- Create: `tests/data/mockOrders.test.ts`

**Interfaces:**
- Produces: `SEGMENTS: Segment[]` and `getSegment(slug: string): Segment | undefined` from `@/data/segments` — `Segment = { slug: string; messageKey: string; images: string[] }` — used by Tasks 5, 8, 9.
- Produces: `MOCK_ORDERS: MockOrder[]` from `@/data/mockOrders` — `MockOrder = { id: string; date: string; messageKey: string }` — used by Task 6.

- [ ] **Step 1: Write the failing tests**

Create `tests/data/segments.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { SEGMENTS, getSegment } from '@/data/segments';

describe('SEGMENTS', () => {
  it('contains exactly the 6 defined segments in order', () => {
    expect(SEGMENTS.map((s) => s.slug)).toEqual([
      'hotel',
      'restaurant',
      'wellness',
      'office',
      'abstract',
      'artist-collections',
    ]);
  });

  it('gives every segment exactly 6 image URLs', () => {
    for (const segment of SEGMENTS) {
      expect(segment.images).toHaveLength(6);
      for (const url of segment.images) {
        expect(url.startsWith('https://images.unsplash.com/')).toBe(true);
      }
    }
  });

  it('has no duplicate image URLs across segments', () => {
    const allImages = SEGMENTS.flatMap((s) => s.images);
    expect(new Set(allImages).size).toBe(allImages.length);
  });
});

describe('getSegment', () => {
  it('returns the matching segment for a valid slug', () => {
    expect(getSegment('wellness')?.messageKey).toBe('wellness');
  });

  it('returns undefined for an unknown slug', () => {
    expect(getSegment('not-a-real-segment')).toBeUndefined();
  });
});
```

Create `tests/data/mockOrders.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { MOCK_ORDERS } from '@/data/mockOrders';

describe('MOCK_ORDERS', () => {
  it('contains exactly 4 mock orders', () => {
    expect(MOCK_ORDERS).toHaveLength(4);
  });

  it('has a unique id for every order', () => {
    const ids = MOCK_ORDERS.map((o) => o.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has a unique messageKey for every order', () => {
    const keys = MOCK_ORDERS.map((o) => o.messageKey);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- segments mockOrders`
Expected: FAIL — `Cannot find module '@/data/segments'` / `'@/data/mockOrders'`.

- [ ] **Step 3: Create `src/data/segments.ts`**

```ts
export interface Segment {
  slug: string;
  messageKey: string;
  images: string[];
}

export const SEGMENTS: Segment[] = [
  {
    slug: 'hotel',
    messageKey: 'hotel',
    images: [
      'https://images.unsplash.com/photo-1625244724120-1fd1d34d00f6?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1677129667171-92abd8740fa3?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1742844552193-2fd3425cd26d?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1758193783649-13371d7fb8dd?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1768346564825-6f90c0b89e2e?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1744782996368-dc5b7e697f4c?q=80&w=1200&auto=format&fit=crop',
    ],
  },
  {
    slug: 'restaurant',
    messageKey: 'restaurant',
    images: [
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1643101570532-88c8ecc07c1f?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1653259038915-7cf0b7a4dd6c?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1551632436-cbf8dd35adfa?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1666032119084-82351976a922?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1703565426315-4209c2e88eea?q=80&w=1200&auto=format&fit=crop',
    ],
  },
  {
    slug: 'wellness',
    messageKey: 'wellness',
    images: [
      'https://images.unsplash.com/photo-1757940556610-a114be4733bf?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1761470575018-135c213340eb?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1773924093206-9a433a14bb44?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1780788745510-6c8433984dfe?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1778331246390-2b91f56864e4?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1776763255459-99ddd8eebbfc?q=80&w=1200&auto=format&fit=crop',
    ],
  },
  {
    slug: 'office',
    messageKey: 'office',
    images: [
      'https://images.unsplash.com/photo-1497366754035-f200968a6e72?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1706074793638-da28b90ea8ae?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1706074740295-d7a79c079562?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1531973576160-7125cd663d86?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1623177623442-979c1e42c255?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1556761175-4b46a572b786?q=80&w=1200&auto=format&fit=crop',
    ],
  },
  {
    slug: 'abstract',
    messageKey: 'abstract',
    images: [
      'https://images.unsplash.com/photo-1605721911519-3dfeb3be25e7?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1618331833071-ce81bd50d300?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1533208087231-c3618eab623c?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1544733422-251e532ca221?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1532640331846-d2da5987c3ee?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1599753894977-bc6c162417e6?q=80&w=1200&auto=format&fit=crop',
    ],
  },
  {
    slug: 'artist-collections',
    messageKey: 'artistCollections',
    images: [
      'https://images.unsplash.com/photo-1740710543611-80b658171bc3?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1752649936574-84227cafab50?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1752649937266-1900d9e176c3?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1698498441161-f1e66acd1cff?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1676742663664-2da16ddcad7a?q=80&w=1200&auto=format&fit=crop',
      'https://images.unsplash.com/photo-1641766860997-53f4b4a68d23?q=80&w=1200&auto=format&fit=crop',
    ],
  },
];

export function getSegment(slug: string): Segment | undefined {
  return SEGMENTS.find((segment) => segment.slug === slug);
}
```

- [ ] **Step 4: Create `src/data/mockOrders.ts`**

```ts
export interface MockOrder {
  id: string;
  date: string;
  messageKey: string;
}

export const MOCK_ORDERS: MockOrder[] = [
  { id: 'GD-10234', date: '2026-06-02', messageKey: 'order1' },
  { id: 'GD-10221', date: '2026-05-18', messageKey: 'order2' },
  { id: 'GD-10198', date: '2026-04-30', messageKey: 'order3' },
  { id: 'GD-10177', date: '2026-04-12', messageKey: 'order4' },
];
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- segments mockOrders`
Expected: PASS — 5 + 3 = 8 tests passed.

- [ ] **Step 6: Commit**

```bash
git add src/data/segments.ts src/data/mockOrders.ts tests/data/segments.test.ts tests/data/mockOrders.test.ts
git commit -m "feat: add segment and mock order data modules"
```

---

### Task 3: useMockAuth hook

**Files:**
- Create: `src/lib/useMockAuth.ts`
- Create: `tests/lib/useMockAuth.test.ts`

**Interfaces:**
- Produces: `useMockAuth(): { isLoggedIn: boolean; isHydrated: boolean; login: () => void; logout: () => void }` from `@/lib/useMockAuth` — used by Tasks 5, 6.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/useMockAuth.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMockAuth } from '@/lib/useMockAuth';

describe('useMockAuth', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('starts logged out and marks itself hydrated after mount', () => {
    const { result } = renderHook(() => useMockAuth());
    expect(result.current.isHydrated).toBe(true);
    expect(result.current.isLoggedIn).toBe(false);
  });

  it('logs in and persists the state to localStorage', () => {
    const { result } = renderHook(() => useMockAuth());
    act(() => {
      result.current.login();
    });
    expect(result.current.isLoggedIn).toBe(true);
    expect(window.localStorage.getItem('glassart-mock-logged-in')).toBe('true');
  });

  it('logs out and clears localStorage', () => {
    const { result } = renderHook(() => useMockAuth());
    act(() => {
      result.current.login();
    });
    act(() => {
      result.current.logout();
    });
    expect(result.current.isLoggedIn).toBe(false);
    expect(window.localStorage.getItem('glassart-mock-logged-in')).toBeNull();
  });

  it('reads a pre-existing logged-in state from localStorage on mount', () => {
    window.localStorage.setItem('glassart-mock-logged-in', 'true');
    const { result } = renderHook(() => useMockAuth());
    expect(result.current.isLoggedIn).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- useMockAuth`
Expected: FAIL — `Cannot find module '@/lib/useMockAuth'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/useMockAuth.ts`:

```ts
'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'glassart-mock-logged-in';

export function useMockAuth() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsLoggedIn(window.localStorage.getItem(STORAGE_KEY) === 'true');
    setIsHydrated(true);
  }, []);

  const login = useCallback(() => {
    window.localStorage.setItem(STORAGE_KEY, 'true');
    setIsLoggedIn(true);
  }, []);

  const logout = useCallback(() => {
    window.localStorage.removeItem(STORAGE_KEY);
    setIsLoggedIn(false);
  }, []);

  return { isLoggedIn, isHydrated, login, logout };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- useMockAuth`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/lib/useMockAuth.ts tests/lib/useMockAuth.test.ts
git commit -m "feat: add useMockAuth localStorage-backed mock login hook"
```

---

### Task 4: Simplify LanguageSwitcher positioning (prerequisite for NavBar)

**Files:**
- Modify: `src/components/LanguageSwitcher.tsx`

**Interfaces:**
- Produces: `LanguageSwitcher()` — same as before (no props, same `data-testid` values), but no longer self-positions with `fixed`/`right-4`/`top-4`/`z-50`. It will be embedded inside `NavBar`'s own fixed bar in Task 5.

- [ ] **Step 1: Update the className**

In `src/components/LanguageSwitcher.tsx`, change the outer `<div>`'s className from:

```tsx
className="fixed right-4 top-4 z-50 flex gap-1 rounded-full border border-white/10 bg-black/40 p-1 backdrop-blur-sm"
```

to:

```tsx
className="flex gap-1 rounded-full border border-white/10 bg-black/40 p-1 backdrop-blur-sm"
```

Nothing else in the file changes.

- [ ] **Step 2: Run the existing LanguageSwitcher test to confirm it still passes**

Run: `npm test -- LanguageSwitcher`
Expected: PASS — 3 tests passed (the tests check `data-testid` and behavior, not this className, so this change doesn't require test changes).

- [ ] **Step 3: Commit**

```bash
git add src/components/LanguageSwitcher.tsx
git commit -m "refactor: remove fixed positioning from LanguageSwitcher, now embedded in NavBar"
```

---

### Task 5: NavBar component

**Files:**
- Create: `src/components/NavBar.tsx`
- Create: `tests/components/NavBar.test.tsx`

**Interfaces:**
- Consumes: `SEGMENTS` (Task 2, `@/data/segments`), `useMockAuth` (Task 3, `@/lib/useMockAuth`), `LanguageSwitcher` (Task 4, `@/components/LanguageSwitcher`), `AccountMenu` (Task 6, `@/components/AccountMenu` — imported here but built in the next task; write this task's test with `AccountMenu` mocked out so Task 5 doesn't depend on Task 6 existing yet), `Link`/`usePathname`/`useRouter` (`@/i18n/navigation`), message keys `nav.*` and `segments.*.title` (Task 1).
- Produces: `NavBar()` — no props, used by Task 7 (`[locale]/layout.tsx`). Renders `data-testid="navbar"`, `data-testid="nav-home"`, `data-testid="nav-collections"`, `data-testid="collections-trigger"` (hover wrapper), `data-testid="collections-dropdown"` (shown on hover), `data-testid="nav-segment-<slug>"` per segment, `data-testid="nav-contact"`, `data-testid="nav-become-client"`, `data-testid="nav-login"` (logged out), or renders `<AccountMenu />` (logged in).

**Note:** this task's test mocks `@/components/AccountMenu` with a trivial stub (`<div data-testid="account-menu-stub" />`) so it can be written and verified independently of Task 6. Task 6 replaces the stub with the real component; nothing here needs to change when Task 6 lands, since `NavBar` only renders `<AccountMenu />` without inspecting its internals.

- [ ] **Step 1: Write the failing test**

Create `tests/components/NavBar.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { NavBar } from '@/components/NavBar';
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

vi.mock('@/components/AccountMenu', () => ({
  AccountMenu: () => <div data-testid="account-menu-stub" />,
}));

function renderNavBar() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <NavBar />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('NavBar', () => {
  it('shows "Word klant" and "Inloggen" when logged out, no account menu', () => {
    renderNavBar();
    expect(screen.getByTestId('nav-become-client')).toBeInTheDocument();
    expect(screen.getByTestId('nav-login')).toBeInTheDocument();
    expect(screen.queryByTestId('account-menu-stub')).not.toBeInTheDocument();
  });

  it('shows all 6 segment links in the collections dropdown on hover', () => {
    renderNavBar();
    fireEvent.mouseEnter(screen.getByTestId('collections-trigger'));
    expect(screen.getByTestId('nav-segment-hotel')).toBeInTheDocument();
    expect(screen.getByTestId('nav-segment-restaurant')).toBeInTheDocument();
    expect(screen.getByTestId('nav-segment-wellness')).toBeInTheDocument();
    expect(screen.getByTestId('nav-segment-office')).toBeInTheDocument();
    expect(screen.getByTestId('nav-segment-abstract')).toBeInTheDocument();
    expect(screen.getByTestId('nav-segment-artist-collections')).toBeInTheDocument();
  });

  it('shows the account menu instead of "Word klant"/"Inloggen" after clicking login', () => {
    renderNavBar();
    fireEvent.click(screen.getByTestId('nav-login'));
    expect(screen.getByTestId('account-menu-stub')).toBeInTheDocument();
    expect(screen.queryByTestId('nav-become-client')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-login')).not.toBeInTheDocument();
  });

  it('points Contact and Word klant at the homepage contact anchor', () => {
    renderNavBar();
    expect(screen.getByTestId('nav-contact')).toHaveAttribute('href', '/nl/#contact');
    expect(screen.getByTestId('nav-become-client')).toHaveAttribute('href', '/nl/#contact');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- NavBar`
Expected: FAIL — `Cannot find module '@/components/NavBar'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/NavBar.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { SEGMENTS } from '@/data/segments';
import { useMockAuth } from '@/lib/useMockAuth';
import { LanguageSwitcher } from './LanguageSwitcher';
import { AccountMenu } from './AccountMenu';

export function NavBar() {
  const locale = useLocale();
  const t = useTranslations('nav');
  const tSegments = useTranslations('segments');
  const [isCollectionsOpen, setIsCollectionsOpen] = useState(false);
  const { isLoggedIn, isHydrated, login } = useMockAuth();
  const contactHref = `/${locale}/#contact`;

  return (
    <nav
      data-testid="navbar"
      className="fixed left-0 top-0 z-40 flex w-full flex-wrap items-center justify-between gap-4 border-b border-white/10 bg-black/60 px-4 py-3 backdrop-blur-sm sm:px-8"
    >
      <div className="flex items-center gap-6 text-xs tracking-[0.15em] text-white/70">
        <Link href="/" data-testid="nav-home" className="hover:text-white">
          {t('home')}
        </Link>
        <div
          data-testid="collections-trigger"
          className="relative"
          onMouseEnter={() => setIsCollectionsOpen(true)}
          onMouseLeave={() => setIsCollectionsOpen(false)}
        >
          <Link href="/collecties" data-testid="nav-collections" className="hover:text-white">
            {t('collections')}
          </Link>
          {isCollectionsOpen && (
            <div
              data-testid="collections-dropdown"
              className="absolute left-0 top-full mt-2 flex flex-col gap-1 rounded-md border border-white/10 bg-black/90 p-2"
            >
              {SEGMENTS.map((segment) => (
                <Link
                  key={segment.slug}
                  href={`/collecties/${segment.slug}`}
                  data-testid={`nav-segment-${segment.slug}`}
                  className="whitespace-nowrap rounded px-3 py-1.5 hover:bg-white/10 hover:text-white"
                >
                  {tSegments(`${segment.messageKey}.title`)}
                </Link>
              ))}
            </div>
          )}
        </div>
        <a href={contactHref} data-testid="nav-contact" className="hover:text-white">
          {t('contact')}
        </a>
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
        <LanguageSwitcher />
      </div>
    </nav>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- NavBar`
Expected: PASS — 4 tests passed.

- [ ] **Step 5: Commit**

```bash
git add src/components/NavBar.tsx tests/components/NavBar.test.tsx
git commit -m "feat: add NavBar with collections dropdown and mock login button"
```

---

### Task 6: AccountMenu component (order history dropdown)

**Files:**
- Create: `src/components/AccountMenu.tsx`
- Create: `tests/components/AccountMenu.test.tsx`

**Interfaces:**
- Consumes: `MOCK_ORDERS` (Task 2, `@/data/mockOrders`), `useMockAuth` (Task 3, `@/lib/useMockAuth`), message keys `nav.myOrders`, `nav.logout`, `orders.*` (Task 1).
- Produces: `AccountMenu()` — no props, used by Task 5 (`NavBar`, already wired against a stub — this task provides the real implementation). Renders `data-testid="account-icon"`, and on click `data-testid="order-history-panel"` containing `data-testid="order-<id>"` per mock order, `data-testid="reorder-<id>"` per order, and `data-testid="nav-logout"`.

- [ ] **Step 1: Write the failing test**

Create `tests/components/AccountMenu.test.tsx`:

```tsx
import { describe, expect, it, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { AccountMenu } from '@/components/AccountMenu';
import messages from '../../messages/nl.json';

function renderAccountMenu() {
  return render(
    <NextIntlClientProvider locale="nl" messages={messages}>
      <AccountMenu />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('AccountMenu', () => {
  it('opens the order history panel with all 4 mock orders and a reorder button each', () => {
    renderAccountMenu();
    fireEvent.click(screen.getByTestId('account-icon'));

    expect(screen.getByTestId('order-history-panel')).toBeInTheDocument();
    expect(screen.getByTestId('order-GD-10234')).toBeInTheDocument();
    expect(screen.getByTestId('order-GD-10221')).toBeInTheDocument();
    expect(screen.getByTestId('order-GD-10198')).toBeInTheDocument();
    expect(screen.getByTestId('order-GD-10177')).toBeInTheDocument();
    expect(screen.getByTestId('reorder-GD-10234')).toBeInTheDocument();
    expect(screen.getByText('Abstract paneel 60x90cm')).toBeInTheDocument();
    expect(screen.getByText('In behandeling')).toBeInTheDocument();
  });

  it('calls logout (clearing localStorage) when "Uitloggen" is clicked', () => {
    window.localStorage.setItem('glassart-mock-logged-in', 'true');
    renderAccountMenu();
    fireEvent.click(screen.getByTestId('account-icon'));
    fireEvent.click(screen.getByTestId('nav-logout'));
    expect(window.localStorage.getItem('glassart-mock-logged-in')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- AccountMenu`
Expected: FAIL — `Cannot find module '@/components/AccountMenu'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/components/AccountMenu.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { MOCK_ORDERS } from '@/data/mockOrders';
import { useMockAuth } from '@/lib/useMockAuth';

export function AccountMenu() {
  const t = useTranslations('nav');
  const tOrders = useTranslations('orders');
  const [isOpen, setIsOpen] = useState(false);
  const { logout } = useMockAuth();

  return (
    <div className="relative">
      <button
        type="button"
        data-testid="account-icon"
        aria-label={t('myOrders')}
        onClick={() => setIsOpen((open) => !open)}
        className="flex h-8 w-8 items-center justify-center rounded-full bg-silver text-xs font-semibold text-ink"
      >
        GD
      </button>
      {isOpen && (
        <div
          data-testid="order-history-panel"
          className="absolute right-0 top-full mt-2 w-72 rounded-md border border-white/10 bg-black/90 p-3"
        >
          <p className="mb-2 text-[0.65rem] uppercase tracking-[0.2em] text-white/50">
            {t('myOrders')}
          </p>
          <ul className="flex flex-col gap-3">
            {MOCK_ORDERS.map((order) => (
              <li key={order.id} data-testid={`order-${order.id}`} className="text-xs text-white/80">
                <div className="flex items-center justify-between">
                  <span>{order.id}</span>
                  <span className="text-white/50">{order.date}</span>
                </div>
                <p>{tOrders(`items.${order.messageKey}.description`)}</p>
                <div className="mt-1 flex items-center justify-between">
                  <span className="text-white/50">
                    {tOrders(`items.${order.messageKey}.status`)}
                  </span>
                  <button
                    type="button"
                    data-testid={`reorder-${order.id}`}
                    className="rounded-sm border border-white/20 px-2 py-1 text-[0.65rem] tracking-wide hover:bg-white/10"
                  >
                    {tOrders('reorder')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            data-testid="nav-logout"
            onClick={logout}
            className="mt-3 w-full rounded-sm border border-white/20 py-1.5 text-xs tracking-wide hover:bg-white/10"
          >
            {t('logout')}
          </button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- AccountMenu`
Expected: PASS — 2 tests passed.

- [ ] **Step 5: Run the full test suite to confirm Task 5 + Task 6 integrate correctly**

Run: `npm test`
Expected: PASS — all tests green (including `NavBar.test.tsx`, which mocked `AccountMenu` and is unaffected by this task's real implementation).

- [ ] **Step 6: Commit**

```bash
git add src/components/AccountMenu.tsx tests/components/AccountMenu.test.tsx
git commit -m "feat: add AccountMenu with mock order history and reorder buttons"
```

---

### Task 7: Wire NavBar into the locale layout; adjust homepage

**Files:**
- Modify: `src/app/[locale]/layout.tsx`
- Modify: `src/app/[locale]/page.tsx`
- Modify: `tests/app/locale-page.test.tsx`

**Interfaces:**
- Consumes: `NavBar` (Task 5).
- Produces: every page rendered under `[locale]` now has the `NavBar` (with embedded `LanguageSwitcher`) available via the layout, so no individual page needs to render it itself.

- [ ] **Step 1: Update `src/app/[locale]/layout.tsx`**

Add the `NavBar` import and render it as the first child inside `NextIntlClientProvider`, before `{children}`:

```tsx
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { routing } from '@/i18n/routing';
import { NavBar } from '@/components/NavBar';

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
      <NavBar />
      {children}
    </NextIntlClientProvider>
  );
}
```

- [ ] **Step 2: Update `src/app/[locale]/page.tsx`**

Remove the `LanguageSwitcher` import and usage (it now lives inside `NavBar`), and change the content wrapper's top padding from `py-16` to `pb-16 pt-24` so content clears the new fixed nav bar:

```tsx
import { Hero } from '@/components/Hero';
import { About } from '@/components/About';
import { FeaturedWorks } from '@/components/FeaturedWorks';
import { Contact } from '@/components/Contact';

export default function LocalePage() {
  return (
    <main className="relative min-h-screen bg-gradient-to-b from-ink via-charcoal to-graphite">
      <div className="flex flex-col gap-10 px-4 pb-16 pt-24 sm:px-8">
        <Hero />
        <About />
        <FeaturedWorks />
        <Contact />
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Update `tests/app/locale-page.test.tsx`**

Remove the now-incorrect assertion that `LocalePage` itself renders the language switcher (it's a layout concern now, not a page concern) — replace the full test with:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import LocalePage from '@/app/[locale]/page';
import messages from '../../messages/nl.json';

describe('LocalePage', () => {
  it('renders all four sections for the nl locale', () => {
    render(
      <NextIntlClientProvider locale="nl" messages={messages}>
        <LocalePage />
      </NextIntlClientProvider>
    );

    expect(screen.getByText('Kunst op glas,')).toBeInTheDocument();
    expect(screen.getByText('Over ons')).toBeInTheDocument();
    expect(screen.getByText('Uitgelichte werken')).toBeInTheDocument();
    expect(screen.getAllByTestId('work-placeholder')).toHaveLength(3);
  });
});
```

- [ ] **Step 4: Run the full test suite**

Run: `npm test`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/app/[locale]/layout.tsx src/app/[locale]/page.tsx tests/app/locale-page.test.tsx
git commit -m "feat: render NavBar from the locale layout, adjust homepage for fixed nav"
```

---

### Task 8: Collections overview page

**Files:**
- Create: `src/app/[locale]/collecties/page.tsx`

**Interfaces:**
- Consumes: `SEGMENTS` (Task 2), `GlassPanel` (existing, `@/components/GlassPanel`), `Link` (`@/i18n/navigation`), message keys `collectionsPage.*`, `segments.*.title` (Task 1).
- Produces: `CollectiesPage()` — async Server Component, no unit test per this plan's stated convention (see File Structure Overview note); verified in Task 10's build.

- [ ] **Step 1: Create `src/app/[locale]/collecties/page.tsx`**

```tsx
import { getTranslations } from 'next-intl/server';
import { GlassPanel } from '@/components/GlassPanel';
import { Link } from '@/i18n/navigation';
import { SEGMENTS } from '@/data/segments';

export default async function CollectiesPage() {
  const t = await getTranslations('collectionsPage');
  const tSegments = await getTranslations('segments');

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-ink via-charcoal to-graphite px-4 pb-16 pt-24 sm:px-8">
      <GlassPanel className="mx-auto mb-10 max-w-3xl text-center">
        <h1 className="text-2xl font-light text-white sm:text-3xl">{t('title')}</h1>
        <p className="mt-3 text-sm text-white/70">{t('intro')}</p>
      </GlassPanel>

      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {SEGMENTS.map((segment) => (
          <Link
            key={segment.slug}
            href={`/collecties/${segment.slug}`}
            data-testid={`collection-tile-${segment.slug}`}
            className="group overflow-hidden rounded-lg border border-white/10 bg-white/5"
          >
            <img
              src={segment.images[0]}
              alt={tSegments(`${segment.messageKey}.title`)}
              className="h-40 w-full object-cover transition group-hover:opacity-80"
            />
            <div className="p-4">
              <h2 className="text-sm font-semibold tracking-wide text-white">
                {tSegments(`${segment.messageKey}.title`)}
              </h2>
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/[locale]/collecties/page.tsx"
git commit -m "feat: add collections overview page with segment tiles"
```

---

### Task 9: Segment page template

**Files:**
- Create: `src/app/[locale]/collecties/[segment]/page.tsx`

**Interfaces:**
- Consumes: `SEGMENTS`, `getSegment` (Task 2), `GlassPanel` (existing), message keys `segments.*.{title,intro}`, `nav.becomeClient` (Task 1).
- Produces: `SegmentPage()` — async Server Component with `generateStaticParams` returning the 6 segment slugs; no unit test per this plan's stated convention; verified in Task 10's build.

- [ ] **Step 1: Create `src/app/[locale]/collecties/[segment]/page.tsx`**

```tsx
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { GlassPanel } from '@/components/GlassPanel';
import { getSegment, SEGMENTS } from '@/data/segments';

export function generateStaticParams() {
  return SEGMENTS.map((segment) => ({ segment: segment.slug }));
}

export default async function SegmentPage({
  params,
}: {
  params: { locale: string; segment: string };
}) {
  const { locale, segment: slug } = params;
  const segment = getSegment(slug);
  if (!segment) {
    notFound();
  }

  const t = await getTranslations(`segments.${segment.messageKey}`);
  const tNav = await getTranslations('nav');
  const contactHref = `/${locale}/#contact`;

  return (
    <main className="relative min-h-screen bg-gradient-to-b from-ink via-charcoal to-graphite px-4 pb-16 pt-24 sm:px-8">
      <GlassPanel className="mx-auto mb-10 max-w-3xl text-center">
        <h1 className="text-2xl font-light text-white sm:text-3xl">{t('title')}</h1>
        <p className="mt-3 text-sm text-white/70">{t('intro')}</p>
      </GlassPanel>

      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-3 sm:grid-cols-3">
        {segment.images.map((src, index) => (
          <img
            key={src}
            src={src}
            alt={`${t('title')} ${index + 1}`}
            data-testid="segment-image"
            className="aspect-square w-full rounded border border-white/10 object-cover"
          />
        ))}
      </div>

      <div className="mx-auto mt-10 max-w-3xl text-center">
        <a
          href={contactHref}
          data-testid="segment-cta"
          className="inline-block rounded-sm bg-silver px-6 py-3 text-xs tracking-[0.2em] text-ink"
        >
          {tNav('becomeClient')}
        </a>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add "src/app/[locale]/collecties/[segment]/page.tsx"
git commit -m "feat: add data-driven segment page template with generateStaticParams"
```

---

### Task 10: Static export build verification

**Files:**
- No new files. This task verifies the previous 9 tasks produce a working static export across all routes, old and new.

- [ ] **Step 1: Run the production build**

Run: `npm run build`
Expected: build completes successfully. The route list should include the existing `/`, `/nl`, `/en`, `/de`, `/fr`, plus new routes for `/[locale]/collecties` and `/[locale]/collecties/[segment]` (24 segment pages + 4 overview pages = 28 new static routes, 33 total including the pre-existing 5).

- [ ] **Step 2: Verify the exported files exist for a sample of new routes**

Run: `ls out/nl/collecties/index.html out/en/collecties/hotel/index.html out/de/collecties/wellness/index.html out/fr/collecties/artist-collections/index.html`
Expected: all 4 files listed, no "No such file" errors.

- [ ] **Step 3: Verify actual page CONTENT, not just file existence**

This project has previously shipped a build that "succeeded" while silently serving Next.js's 404 page as the content for every locale route (caused by a missing `'use client'` directive — see the previous plan's Task 12). Guard against the same failure mode here:

Run: `grep -l "NEXT_NOT_FOUND" out/nl/collecties/index.html out/nl/collecties/hotel/index.html out/en/collecties/hotel/index.html`
Expected: no output (grep finds nothing — if it prints any filename, that file is broken the same way the earlier bug was, and needs the same kind of investigation: check for `'use client'` misuse, but note these two new page files are intentionally Server Components using `getTranslations`, not `useTranslations` — the bug class this guards against was specifically about client hooks in Server Components, which does not apply here as long as `getTranslations`/`getSegment` are used correctly).

Run: `grep -o "Ontdek onze kunstwerken\|Kunst op glas voegt een tijdloze\|Rustgevende kunstwerken" out/nl/collecties/index.html out/nl/collecties/hotel/index.html out/nl/collecties/wellness/index.html`
Expected: each grep finds its expected string, confirming real translated content is present in the collections overview and in two different segment pages, not a 404 shell.

- [ ] **Step 4: Run the full test suite one final time**

Run: `npm test`
Expected: PASS — all tests green (previous suite plus the new tests from Tasks 2, 3, 5, 6, plus the modified Task 7 test).

- [ ] **Step 5: Manually verify in the browser**

Run: `npx serve out -l 4173` (or reuse whatever static server command was used for the previous plan) and open `http://localhost:4173` in a browser.

Check:
- The fixed nav bar appears on the homepage, showing Home / Collecties / Contact, and "Word klant" + "Inloggen" on the right (next to the language switcher).
- Hovering "Collecties" shows a dropdown with all 6 segment names in the current language.
- Clicking a segment name navigates to that segment's page, showing its title, intro text, 6 real images (not broken/broken-looking placeholders), and a "Word klant" button.
- Clicking "Collecties" itself (not hovering) navigates to the overview page with 6 tiles, each showing a real image and title, linking to the right segment.
- Clicking "Inloggen" replaces it and "Word klant" with a round account icon; clicking the icon opens a panel with 4 mock orders (description, date, status) and "Bestel opnieuw" buttons, plus an "Uitloggen" option.
- Clicking "Uitloggen" reverts to the logged-out nav state.
- Reloading the page after logging in keeps you logged in (localStorage persistence); reloading after logging out keeps you logged out.
- Switching languages (NL/EN/DE/FR) updates the nav labels, segment titles/intros, and mock order descriptions/statuses correctly.
- Resize to mobile width (375px): nav bar wraps or stays usable (no horizontal overflow), segment image grids drop to 2 columns, collections overview tiles stack to 1 column.

- [ ] **Step 6: Commit**

No code changes expected in this task. If Steps 1–5 surfaced a fix, commit it with a message describing what was broken, then re-run Steps 1–5.
