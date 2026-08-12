import { Chapter, SubSection, P } from '../DocumentatieBlocks';

export function KunstwerkenChapter() {
  return (
    <Chapter id="kunstwerken" title="4. Een kunstwerk aanmaken">
      <P>Elk product dat een klant kan bestellen, is een &quot;kunstwerk&quot; in beheer.</P>
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
          Vink je geen enkele maat of materiaal aan, dan verschijnt in plaats daarvan een veld &quot;prijs
          per m²&quot; — dat gebruiken we nu voor akoestische stof, maar het werkt voor elk product waarbij
          de klant zelf zijn eigen breedte en hoogte opgeeft.
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
