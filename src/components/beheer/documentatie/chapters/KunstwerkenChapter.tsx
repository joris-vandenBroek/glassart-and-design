import { Chapter, SubSection, P, Screenshot, DocLink } from '../DocumentatieBlocks';

export function KunstwerkenChapter() {
  return (
    <Chapter id="kunstwerken" title="4. Een kunstwerk aanmaken">
      <P>Elk product dat een klant kan bestellen, is een &quot;kunstwerk&quot; in beheer.</P>
      <Screenshot
        src="/documentatie/kunstwerken.png"
        alt="Het kunstwerk-formulier van 'Fresh Catch' van kunstenaar Jack Liemburg, met foto, vastgelegde code, kunstenaar en formaat, met live voorbeeld van de collectiepagina ernaast"
        caption="Het kunstwerk-formulier, tabblad Algemeen (hier: &quot;Fresh Catch&quot; van kunstenaar Jack)"
      />
      <SubSection id="kunstwerken-foto" title="Foto">
        <P>Upload een foto van het kunstwerk. Die mag maximaal 8 MB groot zijn.</P>
      </SubSection>
      <SubSection id="kunstwerken-code" title="Code">
        <P>
          Elk kunstwerk krijgt een unieke code — het artikelnummer waar ook de drukker mee werkt (die heeft
          het originele bestand onder diezelfde code). Een code bestaat uit een prefix en een volgnummer,
          bijvoorbeeld GLA-JAC-00001 voor een kunstwerk van kunstenaar Jack, of GLA-AFR-00007 voor een
          kunstwerk uit de collectie &quot;Afrika&quot;. Kies je een prefix die al bestaat, dan stelt
          beheer automatisch het eerstvolgende nummer voor.
        </P>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Screenshot
            src="/documentatie/kunstwerken-code-voor.png"
            alt="Het veld Prefix en Code, nog leeg"
            caption="1. Nog geen prefix gekozen — de code is nog leeg"
          />
          <Screenshot
            src="/documentatie/kunstwerken-code-na.png"
            alt="Het veld Prefix met GLA-JAC gekozen, en de code GLA-JAC-00001 automatisch voorgesteld"
            caption="2. Prefix &quot;GLA-JAC&quot; gekozen — de code GLA-JAC-00001 wordt automatisch voorgesteld"
          />
        </div>
        <P>
          Wijkt de code die je intypt af van dit formaat (drie letters, streepje, drie
          letters, streepje, vijf cijfers) — bijvoorbeeld omdat het product geen los
          artikelnummer heeft, zoals &quot;Akoestische stof&quot; — dan vraagt beheer bij het
          opslaan om een bevestiging. Je kunt gewoon doorgaan; het is alleen een controle
          tegen typefouten, geen harde eis.
        </P>
        <P>
          Zodra een kunstwerk in een bestelling zit, ligt de code vast — dan kun je &apos;m niet meer
          wijzigen, en kun je het kunstwerk ook niet meer verwijderen.
        </P>
        <P>
          <strong>Let op:</strong> wijzig je de code van een kunstwerk waarvan de drukker het masterbestand
          al heeft (dus vóórdat de code vastligt)? Dan moet je zelf actie ondernemen: laat de drukker de
          code bij dat bestand aanpassen, of stuur een nieuw masterbestand onder de nieuwe code. Beheer
          regelt dit niet automatisch voor je.
        </P>
      </SubSection>
      <SubSection id="kunstwerken-kunstenaar" title="Kunstenaar">
        <P>
          Bij het aanmaken van een nieuw kunstwerk is het koppelen van een kunstenaar verplicht.
          Bewerk je een bestaand kunstwerk dat van vóór deze regel stamt en dus nog geen
          kunstenaar heeft, dan hoef je die niet alsnog te koppelen om je wijziging op te slaan.
          Koppel je wél een kunstenaar, dan gelden voor dit kunstwerk meteen diens
          kunstenaarsopslag en exclusiviteitsregels — zie het hoofdstuk over kunstenaars.
        </P>
      </SubSection>
      <SubSection id="kunstwerken-formaat" title="Formaat en maten">
        <P>
          Zodra je een foto uploadt, bepaalt beheer automatisch het formaat: Vierkant, Liggend of Staand —
          op basis van de verhouding tussen breedte en hoogte van de foto. Klopt dat niet, dan pas je het
          formaat zelf aan met de keuzerondjes.
        </P>
        <P>
          Het formaat bepaalt welke maten je kunt aanvinken: bij Vierkant zijn alleen vierkante maten te
          kiezen, bij Liggend en Staand alleen niet-vierkante maten, en bij Alle kun je alles kiezen.
        </P>
        <P>
          Vink geen enkel materiaal aan, dan verschijnt in plaats daarvan een veld &quot;prijs per
          m²&quot; op dit scherm — dat gebruiken we voor producten zonder materiaal, zoals akoestische
          stof. Heb je wél een materiaal gekozen maar geen vaste maat (bijvoorbeeld voor een product
          waarbij de klant zelf zijn breedte en hoogte opgeeft), dan komt de prijs per m² niet van dit
          scherm maar van het gekozen materiaal — zie{' '}
          <DocLink anchor="stamgegevens-materialen">Materialen</DocLink>.
        </P>
      </SubSection>
      <SubSection id="kunstwerken-voorbeeld" title="Live voorbeeld">
        <P>
          Rechts in het scherm zie je meteen een live voorbeeld van hoe het kunstwerk er op de website
          uitziet, met de prijs die een klant op dat moment zou zien — inclusief eventuele
          kunstenaarsopslag en prijsgroep. Zo controleer je meteen of alles klopt voordat je opslaat.
        </P>
      </SubSection>
    </Chapter>
  );
}
