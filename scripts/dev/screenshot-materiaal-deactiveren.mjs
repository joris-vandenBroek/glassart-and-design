/**
 * Maakt een screenshot van de bevestigingsvraag die verschijnt zodra je een materiaal op
 * inactief zet — voor het hoofdstuk Stamgegevens van de gebruikershandleiding.
 *
 * Zelfde aanpak als screenshot-handleiding.mjs: headless Chrome via CDP met een zelf
 * aangemaakte medewerker-sessie, dus zonder wachtwoord, en de sessierij wordt na afloop
 * weer verwijderd.
 *
 * Belangrijk: dit script slaat niets op. Het opent de dialoog, maakt de opname en klikt
 * daarna "Nee, actief laten", zodat de vlag op staging onveranderd blijft.
 *
 * Gebruik:
 *   node scripts/dev/screenshot-materiaal-deactiveren.mjs <uitvoer.png> [zoektekst] [basis-url]
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

const [uitvoer, zoektekst = 'Veiligheidsglas', basisUrl = 'http://localhost:3000'] = process.argv.slice(2);
if (!uitvoer) {
  console.error('Geef een uitvoerpad op, bijvoorbeeld: node scripts/dev/screenshot-materiaal-deactiveren.mjs shot.png');
  process.exit(1);
}

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DEBUG_PORT = 9334;

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const sessieId = randomUUID();
const profielMap = fs.mkdtempSync(path.join(os.tmpdir(), 'handleiding-chrome-'));
let chrome;

let volgnummer = 0;
function cdp(ws, method, params = {}) {
  const id = (volgnummer += 1);
  return new Promise((resolve, reject) => {
    const onMessage = (event) => {
      const bericht = JSON.parse(event.data);
      if (bericht.id !== id) return;
      ws.removeEventListener('message', onMessage);
      if (bericht.error) reject(new Error(`${method}: ${JSON.stringify(bericht.error)}`));
      else resolve(bericht.result);
    };
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

const wacht = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function evalueer(ws, expressie) {
  const { result } = await cdp(ws, 'Runtime.evaluate', {
    expression: expressie,
    awaitPromise: true,
    returnByValue: true,
  });
  return result.value;
}

try {
  const [medewerkers] = await pool.query('SELECT id FROM medewerkers LIMIT 1');
  if (medewerkers.length === 0) throw new Error('geen medewerker gevonden om een sessie voor te maken');
  await pool.query(
    'INSERT INTO sessions (id, userType, userId, expiresAt) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 1 HOUR))',
    [sessieId, 'medewerker', medewerkers[0].id]
  );

  chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profielMap}`,
    '--window-size=1600,1100',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    'about:blank',
  ]);

  let target = null;
  for (let poging = 0; poging < 40 && !target; poging += 1) {
    await wacht(250);
    try {
      const lijst = await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/list`)).json();
      target = lijst.find((item) => item.type === 'page') ?? null;
    } catch {
      // Chrome is nog niet zover; volgende poging.
    }
  }
  if (!target) throw new Error('Chrome-debugger niet bereikbaar');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve, { once: true }));

  await cdp(ws, 'Page.enable');
  await cdp(ws, 'Runtime.enable');
  await cdp(ws, 'Network.enable');
  const { hostname, protocol } = new URL(basisUrl);
  await cdp(ws, 'Network.setCookie', {
    name: 'session_id',
    value: sessieId,
    domain: hostname,
    path: '/',
    secure: protocol === 'https:',
  });

  await cdp(ws, 'Page.navigate', { url: `${basisUrl}/nl/beheer` });
  await wacht(10000);

  // De materialen-sectie zit onder de uitklapbare groep Stamgegevens.
  await evalueer(
    ws,
    `(() => {
       const groep = document.querySelector('[data-testid="beheer-nav-group-stamgegevens"]');
       if (groep && groep.getAttribute('aria-expanded') === 'false') groep.click();
       return 'ok';
     })()`
  );
  await wacht(1500);
  const naarMaterialen = await evalueer(
    ws,
    `(() => {
       const knop = document.querySelector('[data-testid="beheer-nav-materialen"]');
       if (!knop) return 'materialen-navigatie niet gevonden';
       knop.click();
       return 'ok';
     })()`
  );
  if (naarMaterialen !== 'ok') throw new Error(naarMaterialen);
  await wacht(5000);

  const geopend = await evalueer(
    ws,
    `(() => {
       const rijen = [...document.querySelectorAll('[data-testid^="data-table-row-"]')];
       const rij = rijen.find((r) => r.textContent.includes(${JSON.stringify(zoektekst)}));
       if (!rij) return 'materiaal niet gevonden tussen ' + rijen.length + ' rijen';
       rij.click();
       return 'ok';
     })()`
  );
  if (geopend !== 'ok') throw new Error(geopend);
  await wacht(3000);

  // Actief uitvinken en opslaan -- dat opent de bevestigingsvraag zonder al iets te schrijven.
  const gevraagd = await evalueer(
    ws,
    `(() => {
       const vinkje = document.querySelector('[data-testid="materiaal-modal-actief"]');
       if (!vinkje) return 'actief-checkbox niet gevonden';
       if (vinkje.checked) vinkje.click();

       // De opslaanknop blijft uit zolang "prijs per m2" leeg is, en op staging staat dat
       // veld bij elk materiaal nog leeg. Alleen invullen in het formulier -- er wordt niets
       // opgeslagen, want we annuleren de bevestiging hierna.
       const prijs = document.querySelector('[data-testid="materiaal-modal-prijs-per-m2"]');
       if (prijs && !prijs.value) {
         const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
         setter.call(prijs, '85');
         prijs.dispatchEvent(new Event('input', { bubbles: true }));
       }

       const opslaan = document.querySelector('[data-testid="materiaal-modal-opslaan"]');
       if (!opslaan) return 'opslaanknop niet gevonden';
       if (opslaan.disabled) return 'opslaanknop staat uit';
       opslaan.click();
       return 'ok';
     })()`
  );
  if (gevraagd !== 'ok') throw new Error(gevraagd);
  await wacht(2500);

  const kader = await evalueer(
    ws,
    `(() => {
       const tekst = document.querySelector('[data-testid="materialen-deactiveren-dialog"]');
       if (!tekst) return null;
       const el = [...document.querySelectorAll('div')]
         .filter((d) => d.contains(tekst) && d.getBoundingClientRect().width < window.innerWidth - 40)
         .sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0];
       if (!el) return null;
       const r = el.getBoundingClientRect();
       return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
     })()`
  );
  if (!kader) {
    const diagnose = await evalueer(
      ws,
      `(() => ({
         modal: !!document.querySelector('[data-testid="materiaal-modal"]'),
         actiefChecked: document.querySelector('[data-testid="materiaal-modal-actief"]')?.checked ?? null,
         opslaanDisabled: document.querySelector('[data-testid="materiaal-modal-opslaan"]')?.disabled ?? null,
         fout: document.querySelector('[data-testid="materiaal-modal-error"]')?.textContent ?? null,
         dialogen: [...document.querySelectorAll('[data-testid]')].map((e) => e.dataset.testid).filter((t) => t.includes('deactiveren') || t.includes('activeren')),
       }))()`
    );
    throw new Error('bevestigingsdialoog niet gevonden -- ' + JSON.stringify(diagnose));
  }

  const { data } = await cdp(ws, 'Page.captureScreenshot', {
    format: 'png',
    clip: { ...kader, scale: 1 },
    captureBeyondViewport: true,
  });
  fs.writeFileSync(uitvoer, Buffer.from(data, 'base64'));
  console.log('geschreven:', uitvoer, JSON.stringify(kader));

  // Niets opslaan: annuleren, zodat het materiaal actief blijft.
  const geannuleerd = await evalueer(
    ws,
    `(() => {
       const nee = document.querySelector('[data-testid="materialen-deactiveren-annuleren"]');
       if (!nee) return 'annuleerknop niet gevonden';
       nee.click();
       return 'ok';
     })()`
  );
  console.log('annuleren:', geannuleerd);
} finally {
  try {
    await pool.query('DELETE FROM sessions WHERE id = ?', [sessieId]);
  } catch (error) {
    console.error('sessie opruimen mislukt, verwijder handmatig id', sessieId, error.message);
  }
  await pool.end();
  if (chrome) chrome.kill();
}
