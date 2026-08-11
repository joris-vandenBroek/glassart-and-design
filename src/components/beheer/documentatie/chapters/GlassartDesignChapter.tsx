import { Chapter, P, UL, DocLink } from '../DocumentatieBlocks';

export function GlassartDesignChapter() {
  return (
    <Chapter id="glassart-design" title="9. Glassart and design">
      <P>Hier staan de gegevens van je eigen bedrijf. Ze worden op twee plekken automatisch gebruikt:</P>
      <UL>
        <li>
          Op de Contact-pagina van de website: bezoekadres, e-mailadres, WhatsApp-nummer, openingstijden,
          KvK-nummer en de contactpersonen die je hier invult.
        </li>
        <li>
          In de mail naar de drukker, als vast &quot;factuurvoetje&quot; onderaan: bezoekadres,
          KvK-nummer, btw-nummer en e-mailadres — zie{' '}
          <DocLink anchor="bestelproces-drukker">Naar de drukker sturen</DocLink> voor een voorbeeld.
          Ontbreekt een van die velden, dan kun je geen mail naar de drukker versturen.
        </li>
      </UL>
      <P>IBAN en BIC leg je hier ook vast, als gegevens voor later.</P>
    </Chapter>
  );
}
