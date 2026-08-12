import { Chapter, SubSection, P, DocLink } from '../DocumentatieBlocks';

function BestelprocesSchema() {
  const stappen = [
    'Klant bestelt en rondt af',
    'Te beoordelen',
    'Te versturen naar drukker',
    'Verstuurd naar drukker',
    'Te factureren',
    'Betaald en afgerond',
  ];
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-silver/50 p-4">
      <div className="flex flex-wrap items-center gap-3">
        {stappen.map((stap, index) => (
          <div key={stap} className="flex items-center gap-3">
            <div className="rounded-md border border-gold bg-white px-3 py-2 text-sm font-body text-ink">{stap}</div>
            {index < stappen.length - 1 && (
              <span aria-hidden="true" className="text-gold">
                &rarr;
              </span>
            )}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 text-sm text-charcoal/80">
        <span aria-hidden="true" className="text-gold">
          vanuit &quot;Te beoordelen&quot; kan ook:
        </span>
        <div className="rounded-md border border-charcoal/30 bg-white px-3 py-2 font-body text-ink">Afgewezen</div>
      </div>
    </div>
  );
}

const VOORBEELDMAIL = `Onderwerp: Z-2026-014 — Nieuwe order(s) voor de drukker – 11-8-2026

== Interieurstudio De Vries (KL-00042) ==
Afleveradres: Molenstraat 12, 3811 EX Amersfoort

Bestelling B-2026-0301:
- GLA-JAC-00007 — 6mm Glas — Blank helder, maat 60x90 cm (Staand), aantal 2
- GLA-JAC-00012 — 6mm Glas — Blank helder, maat 40x40 cm, aantal 1

== Hotel Boschoord ==
Afleveradres: Bosweg 3, 7524 AB Enschede

Bestelling B-2026-0304:
- GLA-JAC-00007 — 6mm Glas — Blank helder, maat 90x60 cm (Liggend), aantal 4
- GLA-JAC-00019 — 8mm Acryl — Mat wit, maat 120x80 cm (Liggend), aantal 1

Bestelling B-2026-0305:
- GLA-JAC-00012 — 6mm Glas — Blank helder, maat 40x40 cm, aantal 3

== Kantoorpand Zuidas (KL-00108) ==
Afleveradres: Zuidplein 90, 1077 XV Amsterdam

Bestelling B-2026-0309:
- GLA-JAC-00019 — 8mm Acryl — Mat wit, maat 120x80 cm (Liggend), aantal 2
- GLA-JAC-00007 — 6mm Glas — Blank helder, maat 60x90 cm (Staand), aantal 1

--
Glassart & Design
Den Heuvel 21, 5688 EM Oirschot
KVK-nummer: 12345678
Btw-nummer: NL001234567B01
E-mailadres (voor facturen): info@glassartdesign.nl`;

export function BestelprocesChapter() {
  return (
    <Chapter id="bestelproces" title="3. Een bestelling verwerken">
      <P>
        Een klant zet producten in zijn winkelwagen en rondt de bestelling af. Vanaf dat moment beheer jij
        het verdere verloop, van controleren tot en met versturen naar de drukker.
      </P>
      <BestelprocesSchema />
      <SubSection id="bestelproces-bewerken" title="Een bestelling bewerken">
        <P>
          Zolang een bestelling nog niet naar de drukker is verstuurd — dus in status &quot;Te
          beoordelen&quot; of &quot;Te versturen naar drukker&quot; — kun je regels toevoegen, verwijderen
          of wijzigen: materiaal, maat, aantal, en een prijs vaststellen als die nog ontbreekt (&quot;op
          aanvraag&quot;).
        </P>
        <P>
          Je kunt ook een korting instellen voor de hele bestelling — bijvoorbeeld vanwege een
          prijsafspraak met een kunstenaar. Die korting is een vast bedrag in euro&apos;s, dat pas
          helemaal aan het eind wordt afgetrokken van de totaalprijs: ná de prijs per regel, de eventuele
          kunstenaarsopslag en de prijsgroep-korting of -opslag van de klant. Zie{' '}
          <DocLink anchor="prijsmatrix">Prijzen: de prijsmatrix en het prijsmodel</DocLink> voor de
          volledige berekening.
        </P>
        <P>
          Zodra een bestelling naar de drukker is verstuurd, kun je de regels zelf niet meer aanpassen —
          geen regels meer toevoegen, verwijderen, of materiaal/maat/aantal wijzigen. De prijs per regel
          en de korting op de hele bestelling blijf je wél kunnen aanpassen, in elke status. Is de
          bestelling afgewezen, dan zit hij helemaal op slot — dan kan zelfs de prijs of de korting niet
          meer gewijzigd worden.
        </P>
      </SubSection>
      <SubSection id="bestelproces-drukker" title="Naar de drukker sturen">
        <P>
          Klik boven de bestellingenlijst op het filter &quot;Te versturen naar drukker&quot; — dat toont
          in één keer alle bestellingen in die status, en maakt ze meteen selecteerbaar, zodat je ze niet
          één voor één hoeft aan te vinken. Vink de gewenste bestellingen aan en klik op &quot;Versturen
          naar drukker&quot;. Kies de drukker — jouw standaard-drukker staat al
          geselecteerd, zie <DocLink anchor="drukkers-standaard">Standaard-drukker</DocLink> — en bekijk de
          mail voordat je &apos;m verstuurt. Alle aangevinkte bestellingen gaan in één mail, gegroepeerd
          per klant. Bijvoorbeeld (fictief voorbeeld, met kunstwerken van kunstenaar Jack):
        </P>
        <pre className="overflow-x-auto rounded-md bg-silver/60 p-4 font-mono text-xs leading-relaxed text-ink">
          {VOORBEELDMAIL}
        </pre>
        <P>
          Onderaan de mail staan altijd je bedrijfsgegevens als factuurvoetje (adres, KvK-nummer,
          btw-nummer, e-mailadres) — zie <DocLink anchor="glassart-design">Glassart and design</DocLink>.
          Ontbreekt daar iets, dan kun je niet versturen. Na het versturen krijgen alle bestellingen in de
          mail automatisch status &quot;Verstuurd naar drukker&quot; en een gedeeld zendingnummer.
        </P>
      </SubSection>
      <SubSection id="bestelproces-zendingen-terugvinden" title="Een verstuurde mail terugvinden">
        <P>
          Wil je een eerder verstuurde mail naar de drukker terugzien? Open die drukker in het scherm
          Drukkers (zie <DocLink anchor="drukkers">Drukkers</DocLink>) — daar staat een overzicht van alle
          verstuurde zendingen, met het zendingnummer en de verstuurdatum.
        </P>
      </SubSection>
      <SubSection id="bestelproces-zoeken-op-zendingnummer" title="Snel zoeken op zendingnummer">
        <P>
          Typ een zendingnummer in het zoekveld boven de bestellingenlijst. Zo zie je in één keer alle
          bestellingen die in die zending zaten. Zijn ze bij de drukker klaar? Vink ze allemaal aan en zet
          de status in één keer op &quot;Te factureren&quot;.
        </P>
      </SubSection>
      <SubSection id="bestelproces-afronden-zending" title="Afronden binnen een zending">
        <P>
          Een drukker-zending is één verzamelmail die bestellingen van meerdere klanten tegelijk kan
          bevatten. Rond je een bestelling af terwijl er in dezelfde zending nog andere, nog niet
          afgeronde bestellingen zitten? Dan toont het systeem die andere bestellingen (per zending, met
          drukker en verzenddatum) en geef je aan wat je wilt: &quot;Ook deze afronden&quot; rondt ze
          allemaal in één keer af, &quot;Alleen deze afronden&quot; laat de rest ongemoeid, en Annuleren
          rondt niets af. De gedachte hierachter: bestellingen die samen naar de drukker zijn gestuurd,
          zijn vaak ook samen klaar — zo vergeet je er geen, zonder dat het je dwingt.
        </P>
      </SubSection>
      <SubSection id="bestelproces-facturatie" title="Facturatie">
        <P>
          Het factureren zelf, en het verwerken van betaalde facturen, gebeurt buiten dit systeem —
          bijvoorbeeld in je boekhoudpakket. Zodra een factuur is verstuurd en betaald, zet je de
          bestelling zelf op &quot;Betaald en afgerond&quot;.
        </P>
      </SubSection>
    </Chapter>
  );
}
