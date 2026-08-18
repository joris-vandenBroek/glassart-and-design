/**
 * Maakt een screenshot van het kunstwerk-formulier voor de gebruikershandleiding.
 *
 * Headless Chrome via CDP, met een zelf aangemaakte medewerker-sessie: er is dus geen
 * wachtwoord nodig, en de sessierij wordt na afloop weer verwijderd. De ingebouwde
 * browsertools kunnen wel screenshotten voor visuele controle, maar leveren geen bestand
 * op disk -- vandaar deze omweg.
 *
 * Gebruik:
 *   node scripts/dev/screenshot-handleiding.mjs <uitvoer.png> [kunstwerkcode] [basis-url] [tabblad]
 *
 * `tabblad` is optioneel en is de id uit de ModalTabs: algemeen (standaard), kenmerken,
 * materialen, maten of omschrijvingen.
 *
 * Voorbeeld (staging, zoals de handleiding-screenshot gemaakt is):
 *   node scripts/dev/screenshot-handleiding.mjs shot.png GLA-ANI-0018 https://staging.glassartanddesign.com
 *
 * De opname is het kale modal-frame; crop/schaal daarna naar de kadrering van het
 * bestaande bestand in public/documentatie/ zodat de handleiding niet verspringt.
 */
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';

const [uitvoer, code = 'GLA-ANI-0018', basisUrl = 'http://localhost:3000', tabblad = null] = process.argv.slice(2);
if (!uitvoer) {
  console.error('Geef een uitvoerpad op, bijvoorbeeld: node scripts/dev/screenshot-handleiding.mjs shot.png');
  process.exit(1);
}

const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DEBUG_PORT = 9333;

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

  await evalueer(ws, `document.querySelector('[data-testid="beheer-nav-kunstwerken"]').click()`);
  await wacht(6000);

  const geopend = await evalueer(
    ws,
    `(() => {
       const rijen = [...document.querySelectorAll('[data-testid^="data-table-row-"]')];
       const rij = rijen.find((r) => r.textContent.includes(${JSON.stringify(code)}));
       if (!rij) return 'kunstwerk niet gevonden tussen ' + rijen.length + ' rijen';
       rij.click();
       return 'ok';
     })()`
  );
  if (geopend !== 'ok') throw new Error(geopend);
  await wacht(5000);

  if (tabblad) {
    const gewisseld = await evalueer(
      ws,
      `(() => {
         const testid = 'kunstwerk-modal-tab-' + ${JSON.stringify(tabblad)};
         const knop = document.querySelector('[data-testid="' + testid + '"]');
         if (!knop) return 'tabblad niet gevonden: ' + testid;
         knop.click();
         return 'ok';
       })()`
    );
    if (gewisseld !== 'ok') throw new Error(gewisseld);
    await wacht(1500);
  }

  // Het modal-frame zelf, zonder de donkere backdrop eromheen.
  const kader = await evalueer(
    ws,
    `(() => {
       const veld = document.querySelector('[data-testid="kunstwerk-modal-code"]');
       if (!veld) return null;
       const frame = veld.closest('div[class*="rounded"][class*="border"]:not([class*="fixed"])');
       const el = [...document.querySelectorAll('div')]
         .filter((d) => d.contains(veld) && d.getBoundingClientRect().width < window.innerWidth - 40)
         .sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0] ?? frame;
       if (!el) return null;
       const r = el.getBoundingClientRect();
       return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
     })()`
  );
  if (!kader) throw new Error('modal-frame niet gevonden');

  const { data } = await cdp(ws, 'Page.captureScreenshot', {
    format: 'png',
    clip: { ...kader, scale: 1 },
    captureBeyondViewport: true,
  });
  fs.writeFileSync(uitvoer, Buffer.from(data, 'base64'));
  console.log('geschreven:', uitvoer, JSON.stringify(kader));
} finally {
  try {
    await pool.query('DELETE FROM sessions WHERE id = ?', [sessieId]);
  } catch (error) {
    console.error('sessie opruimen mislukt, verwijder handmatig id', sessieId, error.message);
  }
  await pool.end();
  if (chrome) chrome.kill();
}
