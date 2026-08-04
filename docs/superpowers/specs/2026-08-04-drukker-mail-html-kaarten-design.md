# Drukker-e-mail: HTML-opmaak met regelkaarten (thumbnail, maat, aantal)

Datum: 2026-08-04
Auteur: Joris van den Broek (met Claude)
Status: Approved — klaar voor implementatieplan

## Aanleiding

De e-mail die vanuit "Versturen naar drukker" verstuurd wordt, is vandaag platte tekst (`== Bedrijfsnaam ==` + afleveradres + een tekstregel per bestelregel). De klant wil dat deze e-mail eruitziet als de bestaande "bol.com-stijl" regelkaarten die al gebruikt worden in `BestellingModal.tsx`/`AccountOrderModal.tsx`: een header met o.a. het afleveradres, en daaronder per bestelregel een kaartje met thumbnail, maat en aantal — zonder prijzen.

Dit is de eerste HTML-e-mail in deze codebase; alle bestaande e-mails (orderbevestiging, wachtwoord-reset) gaan via hetzelfde `mail-server/send-mail.php`-endpoint en zijn platte tekst.

## Scope

**Wel:**
- `src/lib/buildDrukkerMail.ts` — bouwt naast de bestaande platte tekst nu ook een HTML-versie.
- `src/components/beheer/VersturenNaarDrukkerDialog.tsx` — preview en verstuur-payload.
- `mail-server/send-mail.php` — ondersteunt optioneel een HTML-body naast de bestaande platte-tekst-body.

**Niet:**
- Orderbevestiging (`CartPanel.tsx` → `send-mail.php`) en wachtwoord-reset (`send-reset-email.php`) blijven platte tekst — ongewijzigd.
- Geen nieuwe npm-dependency (geen react-email/mjml) — losse template-string met inline styles, in lijn met de minimale-dependency-stijl van deze codebase (geen ORM, geen JWT-library, etc.).
- Geen image-embedding/CID — `kunstwerk.foto` is al een publieke HTTPS-URL en wordt direct als `<img src>` gebruikt.
- Geen wijziging aan de groepering-logica (per klant, meerdere bestellingen samengevoegd) — die blijft zoals nu.

## A. `buildDrukkerMail.ts`: tekst én HTML uit dezelfde groepering

`buildDrukkerMail()` retourneert straks `{ subject, text, html }` in plaats van `{ subject, body }`. De bestaande per-klant-groepering (`klantIds.map(...)`) blijft de basis; binnen die loop wordt zowel de bestaande tekstregel (`formatRegel`, ongewijzigd) als een nieuwe HTML-kaart per bestelregel opgebouwd, zodat er geen twee losse groeperings-implementaties naast elkaar ontstaan.

Alle strings die niet door de applicatie zelf gegenereerd zijn (bedrijfsnaam, adres, kunstwerk-naam, materiaal-omschrijving — deels klant-ingevoerd) worden voor gebruik in de HTML-string ge-escaped via een nieuwe `escapeHtml()`-helper in hetzelfde bestand, zodat een `&`, `<` of `"` in bijvoorbeeld een bedrijfsnaam de HTML niet breekt en er geen HTML-injectie mogelijk is.

`text` blijft functioneel identiek aan de huidige `body` (ongewijzigde platte-tekstregel) en dient straks als `AltBody`-fallback voor e-mailclients zonder HTML-weergave.

## B. HTML-structuur: header per klant + regelkaarten

Tabel-gebaseerde layout met inline styles (geen Tailwind-classes — die hebben geen effect in een los verstuurde HTML-string, en Outlook rendert geen flexbox/grid).

- **Header per klant**: bedrijfsnaam vet, afleveradres daaronder gedempt — visueel een blok, functioneel dezelfde inhoud als de huidige `== Bedrijfsnaam ==` + "Afleveradres: ..." regel.
- **Kaart per bestelregel**: thumbnail (64px, `<img src="{kunstwerk.foto}">`), kunstwerk-naam, materiaal-omschrijving, maat (incl. bestaande Liggend/Staand-suffix), aantal. Geen prijs.
- Ontbrekend kunstwerk/materiaal/maat: dezelfde `Onbekend kunstwerk` / `Onbekend materiaal` / `Onbekende maat`-fallbacks als de tekstversie. Ontbrekende thumbnail: een "?"-placeholder-blokje, zoals al gebruikt in `BestellingModal.tsx`.
- Geëmailde afbeeldingen worden door veel clients standaard geblokkeerd tot de ontvanger "afbeeldingen weergeven" kiest — bestaand, algemeen e-mail-gedrag, geen op te lossen probleem hier.

## C. `VersturenNaarDrukkerDialog.tsx`: preview en verzenden

- Preview-element (`data-testid="drukker-versturen-preview"`) wordt een `<div dangerouslySetInnerHTML={{ __html: mail.html }} />` in plaats van de huidige `<pre>`. Bewust een `div` en geen `iframe`: de HTML is al ge-escaped op builder-niveau (zie A), en een `div` houdt de content bevraagbaar voor bestaande/nieuwe testing-library-assertions binnen dezelfde test-omgeving — een `iframe`'s `srcDoc`-inhoud is niet direct bevraagbaar met de bestaande `toHaveTextContent`-aanpak.
- Verstuur-payload naar `send-mail.php` krijgt een extra veld: `{ secret, to, subject, body: mail.text, html: mail.html }`. Het `body`-veld (platte tekst) blijft altijd gevuld, ook al is er nu ook `html` — dat is de `AltBody`-fallback.

## D. `mail-server/send-mail.php`: optionele HTML-body

Nieuw, optioneel `html`-veld in de request. Validatie van `body` (verplicht, niet-leeg) blijft ongewijzigd.

```php
$html = isset($input['html']) ? trim((string) $input['html']) : '';
...
if ($html !== '') {
    $mail->isHTML(true);
    $mail->Body = $html;
    $mail->AltBody = $body;
} else {
    $mail->isHTML(false);
    $mail->Body = $body;
}
```

Bestaande aanroepers die geen `html`-veld meesturen (orderbevestiging via `CartPanel.tsx`, wachtwoord-reset via het losse `send-reset-email.php`) blijven ongewijzigd platte tekst versturen.

## Testing

- `tests/lib/buildDrukkerMail.test.ts`: bestaande assertions op `.body` worden `.text` (ongewijzigd gedrag, alleen veldnaam); nieuwe assertions op `.html` — bevat een `<img src="...">` per regel met een kunstwerk-foto, bevat maat/aantal/materiaal/naam, bevat geen prijs-achtige tekst, en HTML-escaped een bedrijfsnaam die `&`/`<` bevat.
- `tests/components/beheer/VersturenNaarDrukkerDialog.test.tsx`: bestaande `toHaveTextContent`-assertions op de preview blijven werken tegen de gerenderde `div`; nieuwe assertion dat er een `<img>`-element in de preview staat; de bestaande assertion op de verstuur-payload (`body: expect.stringContaining(...)`) wordt uitgebreid met een assertion dat de payload ook een `html`-veld bevat.
- `mail-server/send-mail.php`: geen PHP-testharnas in deze repo (per `CLAUDE.md`) — verificatie via `php -l` (syntax-check) plus handmatige code-review; geen geautomatiseerde test.

## Niet in scope (samenvatting)

- Orderbevestiging en wachtwoord-reset-e-mail (blijven platte tekst).
- Nieuwe npm-dependency voor e-mail-templating.
- Image-embedding/CID (niet nodig, `kunstwerk.foto` is al een publieke URL).
- Wijziging aan de per-klant-groeperingslogica.
