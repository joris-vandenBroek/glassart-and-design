import { Chapter, SubSection, P } from '../DocumentatieBlocks';

export function InstellingenChapter() {
  return (
    <Chapter id="instellingen" title="10. Instellingen">
      <P>Algemene instellingen die voor de hele webshop gelden.</P>
      <P>
        <strong>Minimale afname</strong> — het aantal stuks dat een klant minimaal van één kunstwerk moet
        bestellen. Dit geldt standaard voor alle klanten. Wil je voor één specifieke klant een andere
        minimale afname? Vul dat dan in bij die klant zelf, in het klantscherm — die waarde overschrijft
        dan deze algemene instelling, alleen voor die klant.
      </P>
      <SubSection id="instellingen-btw-tarieven" title="Btw-tarieven per land">
        <P>
          Hier leg je per land een btw-percentage vast: kies het land en vul het percentage in. Voeg met
          &quot;Toevoegen&quot; een nieuw land toe, of verwijder een regel die je niet meer nodig hebt.
        </P>
        <P>
          Bij het berekenen van een bestelling zoekt het systeem het tarief op dat bij het land van de
          klant hoort. Staat er nog geen tarief voor dat land? Dan kan die klant niet worden goedgekeurd —
          zie &quot;Voordat je kunt goedkeuren&quot; in het hoofdstuk over klanten registreren.
        </P>
      </SubSection>
    </Chapter>
  );
}
