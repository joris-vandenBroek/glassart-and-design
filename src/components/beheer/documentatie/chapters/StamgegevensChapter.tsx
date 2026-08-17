import { Chapter, SubSection, P, DocLink, Screenshot } from '../DocumentatieBlocks';

export function StamgegevensChapter() {
  return (
    <Chapter id="stamgegevens" title="7. Overige stamgegevens">
      <P>
        Deze schermen vul je één keer in en gebruik je daarna overal terug — bij het aanmaken van
        kunstwerken, het filteren op de website, en de prijsopbouw.
      </P>
      <Screenshot
        src="/documentatie/stamgegevens.png"
        alt="Het scherm Materialen als voorbeeld van de stamgegevens-schermen, met het uitgeklapte Stamgegevens-menu ernaast"
        caption="Het scherm Materialen als voorbeeld — alle stamgegevens-schermen werken op dezelfde manier"
      />
      <SubSection id="stamgegevens-materiaalsoorten" title="Materiaalsoorten">
        <P>
          De hoofdcategorie van een materiaal, bijvoorbeeld Glas of Acryl. Voeg toe met de knop
          &quot;Toevoegen&quot;.
        </P>
      </SubSection>
      <SubSection id="stamgegevens-materialen" title="Materialen">
        <P>
          Een specifieke uitvoering binnen een materiaalsoort, met een dikte — bijvoorbeeld &quot;6mm Glas
          — Blank helder&quot;. Elk materiaal hoort bij één materiaalsoort. Vul ook de prijs per m² in — die
          prijs gebruiken we voor elk kunstwerk met dit materiaal dat geen vaste maten heeft, bijvoorbeeld
          &quot;4mm veiligheidsglas, eigen maat&quot;.
        </P>
      </SubSection>
      <SubSection id="stamgegevens-maten" title="Maten">
        <P>De vaste breedte×hoogte-combinaties die je bij een kunstwerk kunt aanvinken.</P>
      </SubSection>
      <SubSection id="stamgegevens-segmenten" title="Segmenten">
        <P>
          De doelgroep of toepassing van een kunstwerk, bijvoorbeeld &quot;Hotel&quot; of
          &quot;Kantoor&quot;. Gebruikt als filter op de website.
        </P>
      </SubSection>
      <SubSection id="stamgegevens-stijlen" title="Stijlen">
        <P>De stijl van een kunstwerk, bijvoorbeeld &quot;Modern&quot; of &quot;Klassiek&quot;.</P>
      </SubSection>
      <SubSection id="stamgegevens-onderwerpen" title="Onderwerpen">
        <P>Waar het kunstwerk over gaat, bijvoorbeeld &quot;Natuur&quot; of &quot;Abstract&quot;.</P>
        <P>
          Segmenten, stijlen en onderwerpen kun je ook meteen aanmaken vanuit het kunstwerk-scherm zelf,
          terwijl je een kunstwerk invult. Let op: dat vult dan alleen de Nederlandse omschrijving. De
          vertalingen voor Engels, Duits en Frans moet je later zelf nog toevoegen, hier in dit scherm.
        </P>
      </SubSection>
      <SubSection id="stamgegevens-prijsgroepen" title="Prijsgroepen">
        <P>
          Een groep klanten die dezelfde korting of opslag krijgen. Kies of het een korting of een opslag
          is, en vul het percentage in; dat percentage wordt automatisch toegepast op elke bestelling van
          een klant in die groep — zie{' '}
          <DocLink anchor="prijsmatrix">Prijzen: de prijsmatrix en het prijsmodel</DocLink> voor de
          volledige berekening. Je koppelt een prijsgroep aan een klant in het klantscherm.
        </P>
      </SubSection>
      <SubSection id="stamgegevens-activiteit" title="Activiteit">
        <P>
          Een logboek van belangrijke acties in beheer: wie heeft wat wanneer gedaan (klant goedgekeurd,
          bestelling gewijzigd, wachtwoord uitgegeven, enzovoort). Puur ter inzage, je maakt hier zelf
          niets aan.
        </P>
      </SubSection>
    </Chapter>
  );
}
