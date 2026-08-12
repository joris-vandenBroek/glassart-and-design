import { Chapter, SubSection, P, UL, DocLink } from '../DocumentatieBlocks';

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

interface VoorbeeldRegel {
  naam: string;
  materiaal: string;
  maat: string;
  aantal: number;
}

interface VoorbeeldBestelling {
  nr: string;
  regels: VoorbeeldRegel[];
}

interface VoorbeeldSectie {
  klantKop: string;
  afleveradres: string;
  bestellingen: VoorbeeldBestelling[];
}

// Zelfde 3 klanten/bestellingen als VOORBEELDMAIL hierboven, maar dan als data
// zodat we ze door dezelfde opmaak kunnen renderen als de echte html-mail
// (buildDrukkerMail.ts) — dit is puur de visuele weergave van diezelfde tekst.
const VOORBEELDMAIL_SECTIES: VoorbeeldSectie[] = [
  {
    klantKop: 'Interieurstudio De Vries (KL-00042)',
    afleveradres: 'Molenstraat 12, 3811 EX Amersfoort',
    bestellingen: [
      {
        nr: 'B-2026-0301',
        regels: [
          { naam: 'GLA-JAC-00007', materiaal: '6mm Glas — Blank helder', maat: '60×90 cm (Staand)', aantal: 2 },
          { naam: 'GLA-JAC-00012', materiaal: '6mm Glas — Blank helder', maat: '40×40 cm', aantal: 1 },
        ],
      },
    ],
  },
  {
    klantKop: 'Hotel Boschoord',
    afleveradres: 'Bosweg 3, 7524 AB Enschede',
    bestellingen: [
      {
        nr: 'B-2026-0304',
        regels: [
          { naam: 'GLA-JAC-00007', materiaal: '6mm Glas — Blank helder', maat: '90×60 cm (Liggend)', aantal: 4 },
          { naam: 'GLA-JAC-00019', materiaal: '8mm Acryl — Mat wit', maat: '120×80 cm (Liggend)', aantal: 1 },
        ],
      },
      {
        nr: 'B-2026-0305',
        regels: [{ naam: 'GLA-JAC-00012', materiaal: '6mm Glas — Blank helder', maat: '40×40 cm', aantal: 3 }],
      },
    ],
  },
  {
    klantKop: 'Kantoorpand Zuidas (KL-00108)',
    afleveradres: 'Zuidplein 90, 1077 XV Amsterdam',
    bestellingen: [
      {
        nr: 'B-2026-0309',
        regels: [
          { naam: 'GLA-JAC-00019', materiaal: '8mm Acryl — Mat wit', maat: '120×80 cm (Liggend)', aantal: 2 },
          { naam: 'GLA-JAC-00007', materiaal: '6mm Glas — Blank helder', maat: '60×90 cm (Staand)', aantal: 1 },
        ],
      },
    ],
  },
];

// Spiegelt de inline stijlen van formatRegelHtml/buildDrukkerMail.ts (html-tak) zo
// letterlijk mogelijk, zodat dit precies toont hoe de echte mail eruitziet.
function VoorbeeldmailHtml() {
  return (
    <div className="overflow-x-auto rounded-md border border-silver-dim bg-white p-4 shadow-sm">
      {VOORBEELDMAIL_SECTIES.map((sectie) => (
        <div key={sectie.klantKop} style={{ marginBottom: 24 }}>
          <div style={{ background: '#f2f2f2', padding: '12px 16px', borderRadius: '4px 4px 0 0' }}>
            <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 15, fontWeight: 'bold', color: '#111111' }}>
              {sectie.klantKop}
            </div>
            <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 13, color: '#555555', marginTop: 2 }}>
              Afleveradres: {sectie.afleveradres}
            </div>
          </div>
          <div style={{ padding: '0 16px' }}>
            {sectie.bestellingen.map((bestelling) => (
              <div key={bestelling.nr}>
                <div
                  style={{
                    padding: '12px 0 4px',
                    fontFamily: 'Arial, sans-serif',
                    fontSize: 13,
                    fontWeight: 'bold',
                    color: '#333333',
                  }}
                >
                  Bestelling {bestelling.nr}
                </div>
                {bestelling.regels.map((regel, index) => (
                  <div
                    key={index}
                    style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: '1px solid #e5e5e5' }}
                  >
                    <div
                      style={{
                        width: 64,
                        height: 64,
                        flexShrink: 0,
                        borderRadius: 4,
                        background: '#f2f2f2',
                        color: '#999999',
                        textAlign: 'center',
                        lineHeight: '64px',
                        fontFamily: 'Arial, sans-serif',
                        fontSize: 20,
                        border: '1px solid #e5e5e5',
                      }}
                    >
                      ?
                    </div>
                    <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 13, color: '#333333' }}>
                      <div style={{ fontWeight: 'bold', marginBottom: 2 }}>{regel.naam}</div>
                      <div style={{ color: '#666666' }}>{regel.materiaal}</div>
                      <div style={{ color: '#666666' }}>
                        Maat: {regel.maat} · Aantal: {regel.aantal}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      ))}
      <div style={{ marginTop: 24, borderTop: '1px solid #e5e5e5', paddingTop: 12 }}>
        <div style={{ fontFamily: 'Arial, sans-serif', fontSize: 12, color: '#666666' }}>
          <div style={{ fontWeight: 'bold', color: '#333333', marginBottom: 2 }}>Glassart &amp; Design</div>
          <div>Den Heuvel 21, 5688 EM Oirschot</div>
          <div>KVK-nummer: 12345678</div>
          <div>Btw-nummer: NL001234567B01</div>
          <div>E-mailadres (voor facturen): info@glassartdesign.nl</div>
        </div>
      </div>
    </div>
  );
}

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
          Bij het toevoegen van een regel wordt ook de minimale afname van de klant bewaakt (zie{' '}
          <DocLink anchor="instellingen">Instellingen</DocLink>): vul je een aantal in dat daaronder zit,
          dan krijg je een foutmelding en wordt de regel niet toegevoegd.
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
          per klant. Zo ziet de mail er in de praktijk uit (fictief voorbeeld, met kunstwerken van
          kunstenaar Jack — de fotominiatuur per regel is hier een grijs vlak, omdat dit fictief is):
        </P>
        <VoorbeeldmailHtml />
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
        <P>
          Je hoeft een zendingnummer niet over te typen: in de kolom Zendingnummer van de bestellingenlijst
          staat naast elk nummer een kopieer-icoon (⧉). Eén klik erop zet het zendingnummer op je
          klembord, klaar om in het zoekveld te plakken.
        </P>
      </SubSection>
      <SubSection id="bestelproces-afronden-zending" title="Afronden binnen een zending">
        <P>
          Een drukker-zending is één verzamelmail die je in één keer naar de drukker stuurt, en die kan
          bestellingen van meerdere klanten tegelijk bevatten. Rond je daarna één bestelling uit die
          zending af, terwijl er nog andere bestellingen uit dezelfde zending nog niet zijn afgerond? Dan
          opent er een bevestigingsscherm dat die andere, nog openstaande bestellingen toont — gegroepeerd
          per zending, met de drukker en de verzenddatum erbij.
        </P>
        <P>Je kiest dan zelf wat er moet gebeuren:</P>
        <UL>
          <li>
            <strong>Ook deze afronden</strong> — rondt in één keer alles af: je oorspronkelijke selectie
            én de andere, nog openstaande bestellingen uit dezelfde zending.
          </li>
          <li>
            <strong>Alleen deze afronden</strong> — rondt alleen je oorspronkelijke selectie af; de rest
            blijft gewoon op &quot;Verstuurd naar drukker&quot; staan.
          </li>
          <li>
            <strong>Annuleren</strong> — er wordt niets afgerond.
          </li>
        </UL>
        <P>
          De gedachte hierachter: bestellingen die samen naar de drukker zijn gestuurd, zijn vaak ook
          samen klaar — zo vergeet je er niet één, zonder dat het je dwingt om ze ook echt samen af te
          ronden.
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
