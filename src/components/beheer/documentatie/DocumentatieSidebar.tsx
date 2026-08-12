interface TocItem {
  href: string;
  label: string;
  subs?: { href: string; label: string }[];
}

const TOC: TocItem[] = [
  {
    href: '#klant-website',
    label: '1. De klant-website',
    subs: [
      { href: '#klant-website-bestellen', label: 'Een kunstwerk bestellen' },
      { href: '#klant-website-mandje', label: 'Het winkelmandje' },
      { href: '#klant-website-taalkeuze', label: 'Taalkeuze' },
    ],
  },
  {
    href: '#klant-registratie',
    label: '2. Klant registreren en goedkeuren',
    subs: [
      { href: '#klant-registratie-goedkeuren', label: 'Voordat je kunt goedkeuren' },
      { href: '#klant-registratie-wachtwoord', label: 'Wachtwoord uitgeven' },
    ],
  },
  {
    href: '#bestelproces',
    label: '3. Een bestelling verwerken',
    subs: [
      { href: '#bestelproces-bewerken', label: 'Een bestelling bewerken' },
      { href: '#bestelproces-drukker', label: 'Naar de drukker sturen' },
      { href: '#bestelproces-zendingen-terugvinden', label: 'Een verstuurde mail terugvinden' },
      { href: '#bestelproces-zoeken-op-zendingnummer', label: 'Snel zoeken op zendingnummer' },
      { href: '#bestelproces-afronden-zending', label: 'Afronden binnen een zending' },
      { href: '#bestelproces-facturatie', label: 'Facturatie' },
    ],
  },
  {
    href: '#kunstwerken',
    label: '4. Een kunstwerk aanmaken',
    subs: [
      { href: '#kunstwerken-foto', label: 'Foto' },
      { href: '#kunstwerken-code', label: 'Code' },
      { href: '#kunstwerken-formaat', label: 'Formaat en maten' },
      { href: '#kunstwerken-voorbeeld', label: 'Live voorbeeld' },
    ],
  },
  {
    href: '#kunstenaars',
    label: '5. Een kunstenaar aanmaken',
    subs: [
      { href: '#kunstenaars-koppeling', label: 'Klant koppelen' },
      { href: '#kunstenaars-opslag', label: 'Prijsopslag' },
      { href: '#kunstenaars-exclusiviteit', label: 'Exclusiviteit' },
    ],
  },
  { href: '#prijsmatrix', label: '6. Prijzen: de prijsmatrix en het prijsmodel' },
  {
    href: '#stamgegevens',
    label: '7. Overige stamgegevens',
    subs: [
      { href: '#stamgegevens-materiaalsoorten', label: 'Materiaalsoorten' },
      { href: '#stamgegevens-materialen', label: 'Materialen' },
      { href: '#stamgegevens-maten', label: 'Maten' },
      { href: '#stamgegevens-segmenten', label: 'Segmenten' },
      { href: '#stamgegevens-stijlen', label: 'Stijlen' },
      { href: '#stamgegevens-onderwerpen', label: 'Onderwerpen' },
      { href: '#stamgegevens-prijsgroepen', label: 'Prijsgroepen' },
      { href: '#stamgegevens-activiteit', label: 'Activiteit' },
    ],
  },
  { href: '#drukkers', label: '8. Drukkers', subs: [{ href: '#drukkers-standaard', label: 'Standaard-drukker' }] },
  { href: '#glassart-design', label: '9. Glassart and design' },
  {
    href: '#instellingen',
    label: '10. Instellingen',
    subs: [{ href: '#instellingen-btw-tarieven', label: 'Btw-tarieven per land' }],
  },
];

export function DocumentatieSidebar() {
  return (
    <nav aria-label="Inhoudsopgave" data-testid="documentatie-sidebar" className="self-start lg:sticky lg:top-8">
      <ul className="flex flex-col gap-3 font-body text-sm">
        {TOC.map((item) => (
          <li key={item.href}>
            <a href={item.href} className="font-semibold text-ink hover:text-gold">
              {item.label}
            </a>
            {item.subs && (
              <ul className="mt-1 flex flex-col gap-1 border-l border-silver-dim pl-3">
                {item.subs.map((sub) => (
                  <li key={sub.href}>
                    <a href={sub.href} className="text-charcoal/80 hover:text-gold">
                      {sub.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
