import { Chapter, DocLink, P, SubSection, UL, Screenshot } from '../DocumentatieBlocks';

export function KlantWebsiteChapter() {
  return (
    <Chapter id="klant-website" title="1. De klant-website">
      <P>
        Dit is een kort overzicht van wat een klant op de website ziet, en waar jij dat in beheer aanpast.
      </P>
      <Screenshot
        src="/documentatie/klant-website.png"
        alt="De Collecties-pagina, gefilterd op kunstenaar Jack Liemburg, met zijn kunstenaarsprofiel en kunstwerken"
        caption="De Collecties-pagina, hier gefilterd op kunstenaar &quot;Jack Liemburg&quot;"
      />
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
        filters op segment, stijl, categorie en materiaal. Alles hier komt rechtstreeks uit{' '}
        <DocLink anchor="kunstwerken">de kunstwerken die jij aanmaakt</DocLink>; de filters komen uit{' '}
        <DocLink anchor="stamgegevens">de overige stamgegevens</DocLink>. Een kunstwerk waarvan geen
        enkel materiaal meer <DocLink anchor="stamgegevens-materialen">actief</DocLink> is, verschijnt
        hier niet meer.
      </P>
      <SubSection id="klant-website-bestellen" title="Een kunstwerk bestellen">
        <P>
          Klikt een klant in Collecties op een kunstwerk? Dan opent een pop-up-scherm met de foto, de
          omschrijving, en de bestelopties: het materiaal, de maat (of een eigen maat, als dat bij dit
          kunstwerk mag), het aantal en de bijbehorende prijs. Met de knop &quot;Toevoegen&quot; komt het
          kunstwerk in het winkelmandje.
        </P>
        <P>In deze gevallen kan een klant een kunstwerk niet toevoegen aan het mandje:</P>
        <UL>
          <li>Er is nog geen (geldige) combinatie van maat en materiaal gekozen.</li>
          <li>
            Voor de gekozen combinatie van maat en materiaal staat nog geen prijs in de{' '}
            <DocLink anchor="prijsmatrix">prijsmatrix</DocLink> (&quot;prijs op aanvraag&quot;) — bij een
            kunstwerk met vaste maten blokkeert dat het toevoegen; kiest de klant zelf een afwijkende maat,
            dan mag dat wél in het mandje, met prijs op aanvraag.
          </li>
          <li>
            Bij een kunstwerk zonder vaste maten (prijs per m², bijvoorbeeld akoestische stof): er is geen
            geldige eigen maat ingevuld, of er staat geen prijs per m² bij dat kunstwerk.
          </li>
          <li>
            Bij een zelf ingevulde maat: breedte of hoogte is leeg of nul, of groter dan het maximum dat
            voor dat materiaal is toegestaan.
          </li>
          <li>
            Het aantal is leeg, geen geheel getal, of lager dan de minimale afname (zie{' '}
            <DocLink anchor="instellingen">Instellingen</DocLink>).
          </li>
          <li>
            Het kunstwerk is exclusief voorbehouden aan een andere klant — zie{' '}
            <DocLink anchor="kunstenaars-exclusiviteit">Exclusiviteit</DocLink>.
          </li>
          <li>
            De kunstenaargegevens zijn nog niet geladen — puur een timing-dingetje: om te weten of een
            kunstwerk exclusief is, moet de browser eerst de kunstenaarslijst binnenhalen. Zolang die nog
            niet binnen is, blokkeert het systeem uit voorzorg. Dit lost vanzelf op zodra de gegevens een
            fractie van een seconde later geladen zijn — er is niets aan te doen of te repareren.
          </li>
          <li>
            Het kunstwerk verwijst naar een kunstenaar die niet meer bestaat — dit is wél een datafout: het
            kunstwerk is nog gekoppeld aan een kunstenaar die in beheer is verwijderd. Omdat het systeem de
            exclusiviteitsregels dan niet meer kan controleren, blokkeert het uit voorzorg volledig, en dit
            lost zichzelf niet op. Meldt een klant dat hij een kunstwerk niet kan bestellen (en het is geen
            exclusiviteit)? Controleer dan bij dat kunstwerk of de kunstenaar-koppeling nog naar een
            bestaande kunstenaar wijst, en herstel of verwijder de koppeling.
          </li>
        </UL>
        <P>
          Let op: alleen ingelogd zijn is op zichzelf geen reden om niet te kunnen toevoegen — ook een
          bezoeker zonder account kan een kunstwerk in zijn mandje leggen. Inloggen (en goedgekeurd zijn)
          is pas nodig om de bestelling af te ronden, zie hieronder.
        </P>
      </SubSection>
      <SubSection id="klant-website-mandje" title="Het winkelmandje">
        <P>
          Het winkelmandje-icoon rechtsboven laat in een badge zien hoeveel artikelen erin zitten. Een
          klik erop toont een overzicht: per regel de foto, het materiaal, de maat, het aantal en de
          prijs (of &quot;prijs op aanvraag&quot; bij een zelf ingevulde maat), met het totaalbedrag
          onderaan. Een regel is met één klik te verwijderen.
        </P>
        <P>
          Het mandje wordt niet in beheer bewaard, maar lokaal in de browser van de klant, per klant
          apart — zo bestelt niemand per ongeluk tegen de prijzen van een andere klant.
        </P>
        <P>
          Om de bestelling af te ronden moet de klant ingelogd én goedgekeurd zijn; is dat niet zo, dan
          ziet hij in plaats van een afrond-knop alleen een link om in te loggen. Vlak vóór het afronden
          wordt nog een laatste keer gecontroleerd of alle artikelen nog wel besteld mogen worden — is
          een kunstwerk intussen bijvoorbeeld exclusief geworden, dan kan de klant niet afronden en moet
          hij dat artikel eerst uit het mandje verwijderen.
        </P>
      </SubSection>
      <SubSection id="klant-website-taalkeuze" title="Taalkeuze">
        <P>
          Rechtsboven kan een klant wisselen tussen Nederlands, Engels, Duits en Frans. Dit vertaalt
          dezelfde pagina naar de gekozen taal — via de vertalingen die je bij kunstwerken, materialen en
          kunstenaars invult — en heeft verder geen invloed op het winkelmandje of de inlogstatus.
        </P>
      </SubSection>
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
        <strong>Inloggen</strong> — hier loggen bestaande klanten in met hun e-mailadres en het wachtwoord
        dat ze zelf bij hun registratie hebben ingesteld. Is een klant dat wachtwoord kwijt, dan zet hij
        via de link &quot;Wachtwoord vergeten?&quot; zelf een nieuw wachtwoord. Jij als beheerder hoeft
        daar niets voor te doen — alleen als een klant hierover contact met jullie opneemt (telefonisch,
        WhatsApp of e-mail) omdat inloggen niet lukt, geef je zelf een wachtwoord uit — zie{' '}
        <DocLink anchor="klant-registratie-wachtwoord">Wachtwoord uitgeven</DocLink>.
      </P>
      <P>
        <strong>Mijn account</strong> — alleen zichtbaar als icoon rechtsboven wanneer een klant is
        ingelogd. Hierachter ziet de klant zijn eigen bestellingen en gegevens.
      </P>
    </Chapter>
  );
}
