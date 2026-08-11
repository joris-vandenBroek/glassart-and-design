// src/components/beheer/documentatie/chapters/InstellingenChapter.tsx
import { Chapter, P } from '../DocumentatieBlocks';

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
    </Chapter>
  );
}
