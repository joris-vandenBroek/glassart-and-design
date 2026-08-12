import { Chapter, P, UL, DocLink } from '../DocumentatieBlocks';

export function PrijsmatrixChapter() {
  return (
    <Chapter id="prijsmatrix" title="6. Prijzen: de prijsmatrix en het prijsmodel">
      <P>De uiteindelijke prijs van een bestelregel wordt in stappen opgebouwd:</P>
      <UL>
        <li>
          <strong>Basisprijs:</strong> beheer zoekt de prijs op die hoort bij de combinatie van maat en
          materiaal, in de prijsmatrix (bedragen zijn exclusief btw).
        </li>
        <li>
          <strong>Kunstenaarsopslag:</strong> is er bij de kunstenaar een prijsopslag vastgelegd
          (zie <DocLink anchor="kunstenaars-opslag">Prijsopslag</DocLink>)? Dan komt dat bedrag er
          automatisch bij. Bijvoorbeeld: €100 + €15 opslag = €115.
        </li>
        <li>
          <strong>Prijsgroep van de klant:</strong> heeft de klant een prijsgroep met een korting of juist
          een opslag in procenten? Dan wordt dat percentage over het bedrag van de vorige stap berekend.
          Bijvoorbeeld: €115 met 10% korting wordt €103,50. Zie{' '}
          <DocLink anchor="stamgegevens-prijsgroepen">Prijsgroepen</DocLink> voor hoe je een prijsgroep
          aanmaakt.
        </li>
        <li>
          <strong>Korting op de hele bestelling:</strong> heb je bij het bewerken van de bestelling een
          extra korting ingevuld (zie <DocLink anchor="bestelproces-bewerken">Een bestelling bewerken</DocLink>
          )? Die trek je er als vast bedrag nog eens vanaf, als allerlaatste stap.
        </li>
      </UL>
      <P>
        Heeft een kunstwerk geen vaste maten, bijvoorbeeld akoestische stof? Dan komt de prijs niet uit de
        matrix, maar uit de prijs per m² die je bij dat kunstwerk instelt (breedte × hoogte × prijs per
        m²). De prijsgroep-stap geldt daar nog steeds op, de kunstenaarsopslag-stap niet.
      </P>
      <P>
        Staat er geen prijs in de matrix voor een gekozen combinatie, of past de gekozen maat niet bij het
        kunstwerk? Dan wordt de prijs &quot;op aanvraag&quot; en moet iemand &apos;m handmatig vaststellen
        bij het bewerken van de bestelling.
      </P>
    </Chapter>
  );
}
