import { Chapter, DocLink, P } from '../DocumentatieBlocks';

export function KlantWebsiteChapter() {
  return (
    <Chapter id="klant-website" title="1. De klant-website">
      <P>
        Dit is een kort overzicht van wat een klant op de website ziet, en waar jij dat in beheer aanpast.
      </P>
      <P>
        <strong>Home</strong> — de openingspagina: een korte introductie, waarom-kies-je-ons, een paar
        uitgelichte kunstwerken en de contactgegevens onderaan. De tekst hierop staat vast in de website
        zelf en pas je niet aan via beheer. De uitgelichte kunstwerken worden willekeurig bepaald uit{' '}
        <DocLink anchor="kunstwerken">de kunstwerken die jij aanmaakt</DocLink>, de contactgegevens uit{' '}
        <DocLink anchor="glassart-design">Glassart and design</DocLink>. Er is geen apart menu-item
        &quot;Over ons&quot; — die tekst staat als vast onderdeel op de Home-pagina.
      </P>
      <P>
        <strong>Collecties</strong> — het overzicht van alle kunstwerken die een klant kan bestellen, met
        filters op segment, stijl, onderwerp en materiaal. Alles hier komt rechtstreeks uit{' '}
        <DocLink anchor="kunstwerken">de kunstwerken die jij aanmaakt</DocLink>; de filters komen uit{' '}
        <DocLink anchor="stamgegevens">de overige stamgegevens</DocLink>.
      </P>
      <P>
        <strong>Contact</strong> — adres, e-mailadres, contactpersonen, WhatsApp-nummer en openingstijden,
        plus een contactformulier. Alle gegevens hierop komen uit{' '}
        <DocLink anchor="glassart-design">Glassart and design</DocLink>.
      </P>
      <P>
        <strong>Word klant</strong> — het aanmeldformulier voor nieuwe klanten. Zodra iemand dit invult,
        komt de aanvraag in beheer terecht bij Klanten, met status &quot;Beoordelen&quot; — zie{' '}
        <DocLink anchor="klant-registratie">Klant registreren en goedkeuren</DocLink>.
      </P>
      <P>
        <strong>Inloggen</strong> — hier loggen bestaande klanten in met hun e-mailadres en wachtwoord. Nog
        geen wachtwoord? Dat geef jij als beheerder uit — zie{' '}
        <DocLink anchor="klant-registratie-wachtwoord">Wachtwoord uitgeven</DocLink>.
      </P>
      <P>
        <strong>Mijn account</strong> — alleen zichtbaar als icoon rechtsboven wanneer een klant is
        ingelogd. Hierachter ziet de klant zijn eigen bestellingen en gegevens.
      </P>
    </Chapter>
  );
}
