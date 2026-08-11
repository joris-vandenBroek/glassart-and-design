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
    </Chapter>
  );
}
