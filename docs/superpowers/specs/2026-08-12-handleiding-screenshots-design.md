# Screenshots in de gebruikershandleiding — ontwerp

> **Historisch ontwerpdocument.** Dit beschrijft het ontwerp zoals het op 12-08-2026 is vastgelegd,
> inclusief de afwegingen van dat moment. Het wordt bewust niet bijgewerkt wanneer de code later
> verandert — de waarde zit in het *waarom*.
>
> Voor hoe de applicatie er nú uitziet: [`docs/huidige-staat.md`](../../huidige-staat.md).

Datum: 2026-08-12
Status: ontwerp, goedgekeurd voor implementatie

## Aanleiding

De gebruikershandleiding (`src/app/[locale]/beheer/documentatie/page.tsx` en de hoofdstukken onder
`src/components/beheer/documentatie/chapters/`) is volledig proza — nergens een afbeelding van hoe
een scherm er daadwerkelijk uitziet. Nu Claude rechtstreeks op de staging-omgeving kan inloggen, is
het een goed moment om de eerste screenshots toe te voegen, te beginnen bij een paar kernschermen.

## Uitgangssituatie in de code

`DocumentatieBlocks.tsx` levert de bouwstenen die elk hoofdstuk gebruikt: `Chapter`, `SubSection`,
`P`, `UL`, `DocLink`. Er bestaat nog geen component voor afbeeldingen. De codebase gebruikt overal
gewone `<img>`-tags (geen `next/image`), dus een nieuwe `Screenshot`-component sluit daarbij aan.

Elk hoofdstuk begint met één of meer inleidende `<P>`'s (soms gevolgd door een handgemaakt
schema-component zoals `RegistratieSchema` of `BestelprocesSchema`), en dán pas de eerste
`SubSection`. Die plek — na de inleiding, vóór de eerste subsectie — is waar de screenshot komt.

## Beslissingen

1. **Vier hoofdstukken in deze eerste ronde**, elk met precies één overzichtsscreenshot:
   - `KlantRegistratieChapter` (`klant-registratie`) — de klantmodal op het moment van goedkeuren.
   - `BestelprocesChapter` (`bestelproces`) — de bestelling-bewerken-modal.
   - `KunstwerkenChapter` (`kunstwerken`) — de kunstwerk-modal, tabblad "Algemeen".
   - `KunstenaarsChapter` (`kunstenaars`) — de kunstenaar-modal.

   De overige zes hoofdstukken (klant-website, drukkers, Glassart and design, instellingen,
   prijsmatrix, stamgegevens) krijgen in deze ronde geen screenshot — zie "Niet in scope".

2. **Eén overzichtsscreenshot per hoofdstuk, geen close-ups per subsectie.** Sneller te maken en te
   onderhouden; geeft genoeg context om te herkennen wat het hoofdstuk beschrijft. Geen
   annotaties (kaders/pijlen) op de afbeelding — een gewone schermafbeelding, om te beginnen.

3. **Nieuwe component `Screenshot`** in `DocumentatieBlocks.tsx`:
   ```tsx
   export function Screenshot({ src, alt, caption }: { src: string; alt: string; caption?: string }) {
     return (
       <figure className="overflow-hidden rounded-lg border border-gold/40 shadow-sm">
         <img src={src} alt={alt} className="w-full" />
         {caption && (
           <figcaption className="border-t border-gold/40 bg-silver/40 px-3 py-2 text-sm text-charcoal/70">
             {caption}
           </figcaption>
         )}
       </figure>
     );
   }
   ```
   Elk van de vier hoofdstukken krijgt na de inleiding (en na een eventueel schema-component) één
   `<Screenshot src="/documentatie/<chapter-id>.png" alt="..." caption="..." />`.

4. **Opslag als statische bestanden**, niet via de upload-server. PNG's onder `public/documentatie/`,
   genoemd naar het `Chapter`-id: `klant-registratie.png`, `bestelproces.png`, `kunstwerken.png`,
   `kunstenaars.png`. Next.js serveert `public/` direct; geen build-stap, geen secrets, en later
   handmatig te vervangen door gewoon het bestand te overschrijven.

5. **Screenshots worden nu, tijdens implementatie, gemaakt door in te loggen op de live
   staging-omgeving** (`staging.glassartanddesign.com/nl/beheer`, na de deploy van vandaag) met een
   tijdelijk medewerkersaccount, en met de browserfunctie van Claude vastgelegd. Het tijdelijke
   account wordt na afloop weer verwijderd — zelfde patroon als bij het eerder deze sessie
   uitgevoerde visuele verificatiewerk.

6. **Onderhoud van screenshots volgt de bestaande afspraak** uit `CLAUDE.md` om bij elke
   beheer-wijziging te checken of de handleiding erdoor achterhaald raakt — dat geldt nu ook voor
   screenshots die het gewijzigde scherm tonen. Er komt geen geautomatiseerde
   staleness-detectie (bijvoorbeeld een visuele diff-check in CI): dat is voor vier statische
   afbeeldingen disproportioneel veel machinerie, en er is geen betrouwbare manier om "deze
   screenshot komt niet meer overeen met de huidige UI" automatisch vast te stellen.

## Niet in scope

- Screenshots voor de overige zes hoofdstukken (klant-website, drukkers, Glassart and design,
  instellingen, prijsmatrix, stamgegevens) — mogelijk een latere ronde, geen onderdeel van dit werk.
- Close-ups per subsectie of geannoteerde afbeeldingen (kaders/pijlen).
- Automatische verversing of validatie van screenshots wanneer de onderliggende schermen wijzigen.
- Wijzigingen aan `DocumentatieSidebar.tsx` of de algemene lay-out van de handleidingpagina.

## Testen

Statische content zonder gedragslogica; geen nieuwe geautomatiseerde tests. Verificatie bestaat uit
handmatig (via de browser) controleren dat alle vier afbeeldingen laden en leesbaar zijn, plus de
bestaande `tests/components/beheer/documentatie/anchorIntegrity.test.tsx` en de overige
documentatie-tests die al meelopen in `npm test` blijven ongewijzigd slagen.
