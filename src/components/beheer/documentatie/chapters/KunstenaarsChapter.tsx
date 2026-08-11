import { Chapter, SubSection, P } from '../DocumentatieBlocks';

export function KunstenaarsChapter() {
  return (
    <Chapter id="kunstenaars" title="5. Een kunstenaar aanmaken">
      <P>
        Werkt een kunstenaar exclusief met jullie samen, of maak je afspraken over een vaste opslag op de
        prijs? Leg dat vast bij Kunstenaars.
      </P>
      <SubSection id="kunstenaars-koppeling" title="Klant koppelen">
        <P>
          Een kunstenaar koppel je aan klanten op twee manieren, en die staan los van elkaar:
        </P>
        <P>
          1) Is de kunstenaar zelf ook klant, bijvoorbeeld om zijn eigen werk te kunnen bestellen? Koppel
          dat bij die klant zelf, in het veld &quot;Kunstenaar&quot; op het klantscherm.
        </P>
        <P>
          2) Heeft een klant het exclusieve verkooprecht voor deze kunstenaar, bijvoorbeeld een galerie die
          als enige zijn werk mag verkopen? Dat regel je hier, bij de kunstenaar.
        </P>
      </SubSection>
      <SubSection id="kunstenaars-opslag" title="Prijsopslag">
        <P>
          Reserveer hier een vast bedrag dat boven op de basisprijs uit de prijsmatrix komt, voor elk
          kunstwerk van deze kunstenaar. Bijvoorbeeld: basisprijs €100 + opslag €15 = €115. Let op: dit is
          een vast bedrag, geen percentage.
        </P>
      </SubSection>
      <SubSection id="kunstenaars-exclusiviteit" title="Exclusiviteit">
        <P>
          Een kunstenaar kan exclusief werken voor precies twee klanten tegelijk — nooit voor precies één.
          Laat je beide velden leeg, dan mag iedereen kunstwerken van deze kunstenaar bestellen. Vul je ze
          in, dan moet minstens één van de twee de klant zijn die zelf al aan deze kunstenaar gekoppeld is
          (dus de kunstenaar zelf).
        </P>
        <P>
          Gevolg voor andere klanten: zodra een kunstenaar exclusief is, kan geen enkele andere klant nog
          een kunstwerk van die kunstenaar bestellen — dat wordt automatisch geblokkeerd, ook als iemand
          een bestaande bestelling probeert aan te passen.
        </P>
      </SubSection>
    </Chapter>
  );
}
