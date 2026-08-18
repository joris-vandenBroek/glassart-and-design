-- Sinds "deactiveren koppelt los" (2026-08-18) betekent een rij in kunstwerkMaterialen dat
-- het materiaal aan dat kunstwerk gekoppeld én leverbaar is. Rijen die naar een inactief
-- materiaal wijzen bestaan alleen nog als restant van vóór die regel: het kunstwerkformulier
-- toont ze uitgevinkt en grijs, dus ze zouden bij de eerstvolgende opslag alsnog verdwijnen.
-- Dit ruimt ze in één keer op, zodat scherm en database meteen hetzelfde zeggen.
--
-- Geen schemawijziging. Op productie is dit een lege operatie (daar staat nog geen kunstwerk);
-- hij wordt daar toch toegepast zodat schema_migrations in beide omgevingen gelijk blijft.
--
-- De voorwaarde is precies de regel zelf, niet een lijst ids: wat inactief is, hoort niet
-- gekoppeld te zijn. Kunstwerken raken hierdoor nooit hun laatste materiaal kwijt -- de
-- serverregel weigert het deactiveren van een materiaal dat ergens het enige actieve is,
-- dus elk kunstwerk met koppelingen houdt er minstens één over.
DELETE km FROM kunstwerkMaterialen km
JOIN materialen m ON m.id = km.materiaalId
WHERE m.actief = FALSE;
