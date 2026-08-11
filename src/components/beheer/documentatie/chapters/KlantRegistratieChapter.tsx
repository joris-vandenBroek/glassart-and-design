import { Chapter, SubSection, P, DocLink } from '../DocumentatieBlocks';

function RegistratieSchema() {
  const stappen = [
    'Klant registreert zichzelf',
    'Beheer beoordeelt de aanvraag',
    'Prijsgroep koppelen (verplicht)',
    'Kunstenaar koppelen (optioneel)',
    'Klant is goedgekeurd',
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
          of:
        </span>
        <div className="rounded-md border border-charcoal/30 bg-white px-3 py-2 font-body text-ink">
          Beheer wijst de aanvraag af
        </div>
      </div>
    </div>
  );
}

export function KlantRegistratieChapter() {
  return (
    <Chapter id="klant-registratie" title="2. Klant registreren en goedkeuren">
      <P>
        Een nieuwe klant meldt zichzelf aan via &quot;Word klant&quot; op de website. Zijn aanvraag komt
        bij jou in beheer terecht, bij Klanten, met status &quot;Beoordelen&quot;. Jij beoordeelt de
        aanvraag en keurt hem goed of af.
      </P>
      <RegistratieSchema />
      <SubSection id="klant-registratie-goedkeuren" title="Voordat je kunt goedkeuren">
        <P>
          De knop &quot;Goedkeuren&quot; blijft grijs tot twee dingen kloppen: er is een prijsgroep gekozen
          voor deze klant, en er staat een btw-tarief ingesteld voor het land van deze klant.
        </P>
        <P>
          Wil je deze klant ook koppelen aan een kunstenaar — bijvoorbeeld omdat de klant zelf de
          kunstenaar is, of exclusief voor een kunstenaar mag verkopen? Kies die dan in hetzelfde scherm.
          Prijsafspraken en een eventuele opslag voor die kunstenaar stel je niet hier in, maar bij de
          kunstenaar zelf — zie <DocLink anchor="kunstenaars">Een kunstenaar aanmaken</DocLink>.
        </P>
        <P>
          Wijs je de aanvraag af, dan vraagt beheer om een reden; die reden zie je terug in de
          klantgeschiedenis.
        </P>
      </SubSection>
      <SubSection id="klant-registratie-wachtwoord" title="Wachtwoord uitgeven">
        <P>
          Een net goedgekeurde klant heeft nog geen wachtwoord. Klik in het klantscherm op &quot;Wachtwoord
          uitgeven&quot; om er automatisch een aan te maken en te tonen. Geef dit meteen door aan de klant:
          zodra je het venster sluit — met de sluitknop, met Esc of door ernaast te klikken — is het
          wachtwoord weg en kun je het niet opnieuw opvragen. Zolang het venster open staat, zijn de
          knoppen eronder geblokkeerd, want ook die sluiten het venster.
        </P>
      </SubSection>
    </Chapter>
  );
}
