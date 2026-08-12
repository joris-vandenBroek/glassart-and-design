import { Chapter, SubSection, P, DocLink } from '../DocumentatieBlocks';

export function DrukkersChapter() {
  return (
    <Chapter id="drukkers" title="8. Drukkers">
      <P>Hier beheer je de drukkers waar je bestellingen naartoe stuurt.</P>
      <SubSection id="drukkers-standaard" title="Standaard-drukker">
        <P>
          Vink &quot;Standaard&quot; aan bij de drukker die je het vaakst gebruikt. Zodra je een bestelling
          naar de drukker stuurt (zie <DocLink anchor="bestelproces-drukker">Naar de drukker sturen</DocLink>
          ), staat deze drukker daar automatisch al geselecteerd — je kunt altijd nog een andere kiezen.
        </P>
      </SubSection>
      <SubSection id="drukkers-zending-bekijken" title="Een verzonden zending bekijken">
        <P>
          Bij een drukker zie je onder &quot;Verzonden mails&quot; alle zendingen die naar deze drukker zijn
          gestuurd. Klik op &quot;Bekijken&quot; om te zien wat er precies verstuurd is: per bestelling in de
          zending de productregels (met foto, materiaal en maat) en de bijbehorende bedragen — dezelfde
          weergave als bij <DocLink anchor="bestelproces-bewerken">een bestelling bewerken</DocLink>, maar
          dan alleen ter inzage, zonder wijzigingsopties.
        </P>
      </SubSection>
    </Chapter>
  );
}
