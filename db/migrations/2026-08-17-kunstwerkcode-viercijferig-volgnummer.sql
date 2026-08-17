-- Kunstwerkcodes naar een viercijferig volgnummer (2026-08-17).
-- Ontwerp: docs/superpowers/specs/2026-08-17-opslaanmelding-en-viercijferig-volgnummer-design.md
--
-- Geen schemawijziging: dit is een datamigratie. Op productie is hij een lege operatie,
-- want daar staat nog geen enkel kunstwerk; hij wordt daar toch toegepast zodat
-- schema_migrations in beide omgevingen gelijk blijft.
--
-- Eerst opruimen, dan hernoemen. Dat is geen stijlkeuze maar een noodzaak: zolang
-- kunstenaar Marieke Hoffmann (KU-00007) haar zestien GLA-MAR-000xx-codes heeft, botsen
-- negen zeewerken van Glassart&Design (GLA-MAR-001 t/m 011) met haar nummers zodra beide
-- reeksen vier cijfers breed worden. Zie beslissing 5 in het ontwerp.
--
-- De hernoemingen staan als expliciete regels en niet als REGEXP_REPLACE: een lijst is te
-- lezen en te controleren voordat hij draait. Er is doorgerekend dat geen enkel doel ook
-- een bron is, dus de volgorde van de UPDATE-regels maakt niet uit.

-- 1. Drukkerzending ZD-00090 -- bevat alleen BE-01554; de koppeltabel cascadeert mee.
DELETE FROM drukkerZendingen WHERE zendingnummer = 'ZD-00090';

-- 2. Bestelling BE-01554 -- bestelregels en statushistorie cascaderen mee. Deze bestelling
--    is de enige die een kunstwerk van Marieke gebruikt (GLA-MAR-00016) en blokkeert
--    daarmee stap 3.
DELETE FROM bestelheaders WHERE bestelnr = 'BE-01554';

-- 3. De zestien kunstwerken van Marieke Hoffmann plus GLA-ABS-0028-00001 ("Color
--    Explosion"), dat na opschonen zou botsen met het bestaande GLA-ABS-0028 ("Abstract").
--    De koppeltabellen (segmenten, materialen, maten, stijlen, categorieen) cascaderen mee.
DELETE FROM kunstwerken WHERE kunstenaarnr = 'KU-00007' OR code = 'GLA-ABS-0028-00001';

-- 4. De kunstenaar zelf, nu geen kunstwerk meer naar haar verwijst.
DELETE FROM kunstenaars WHERE kunstenaarnr = 'KU-00007';

-- 5. De overgebleven 64 afwijkende codes naar vier cijfers, in kunstwerken en bestellines.
--    Meegenomen: GLA_ANI_004 (underscores), Gla-MAR-001 (kleine letters), en de twee
--    prefix-ongelukken GLA-ANI-015-00001 en GLA-ABS-0029-00001.
--    "Akoestische stof" blijft ongemoeid: dat product heeft geen artikelnummer.
UPDATE kunstwerken  SET code = 'GLA-ANI-0004' WHERE code = 'GLA_ANI_004';
UPDATE bestellines  SET code = 'GLA-ANI-0004' WHERE code = 'GLA_ANI_004';
UPDATE kunstwerken  SET code = 'GLA-ABS-0029' WHERE code = 'GLA-ABS-0029-00001';
UPDATE bestellines  SET code = 'GLA-ABS-0029' WHERE code = 'GLA-ABS-0029-00001';
UPDATE kunstwerken  SET code = 'GLA-ANI-0005' WHERE code = 'GLA-ANI-005';
UPDATE bestellines  SET code = 'GLA-ANI-0005' WHERE code = 'GLA-ANI-005';
UPDATE kunstwerken  SET code = 'GLA-ANI-0008' WHERE code = 'GLA-ANI-008';
UPDATE bestellines  SET code = 'GLA-ANI-0008' WHERE code = 'GLA-ANI-008';
UPDATE kunstwerken  SET code = 'GLA-ANI-0011' WHERE code = 'GLA-ANI-011';
UPDATE bestellines  SET code = 'GLA-ANI-0011' WHERE code = 'GLA-ANI-011';
UPDATE kunstwerken  SET code = 'GLA-ANI-0013' WHERE code = 'GLA-ANI-013';
UPDATE bestellines  SET code = 'GLA-ANI-0013' WHERE code = 'GLA-ANI-013';
UPDATE kunstwerken  SET code = 'GLA-ANI-0015' WHERE code = 'GLA-ANI-015-00001';
UPDATE bestellines  SET code = 'GLA-ANI-0015' WHERE code = 'GLA-ANI-015-00001';
UPDATE kunstwerken  SET code = 'GLA-ANI-0016' WHERE code = 'GLA-ANI-016';
UPDATE bestellines  SET code = 'GLA-ANI-0016' WHERE code = 'GLA-ANI-016';
UPDATE kunstwerken  SET code = 'GLA-ANI-0017' WHERE code = 'GLA-ANI-017';
UPDATE bestellines  SET code = 'GLA-ANI-0017' WHERE code = 'GLA-ANI-017';
UPDATE kunstwerken  SET code = 'GLA-ANI-0018' WHERE code = 'GLA-ANI-018';
UPDATE bestellines  SET code = 'GLA-ANI-0018' WHERE code = 'GLA-ANI-018';
UPDATE kunstwerken  SET code = 'GLA-ANI-0019' WHERE code = 'GLA-ANI-019';
UPDATE bestellines  SET code = 'GLA-ANI-0019' WHERE code = 'GLA-ANI-019';
UPDATE kunstwerken  SET code = 'GLA-DAA-0001' WHERE code = 'GLA-DAA-00001';
UPDATE bestellines  SET code = 'GLA-DAA-0001' WHERE code = 'GLA-DAA-00001';
UPDATE kunstwerken  SET code = 'GLA-DAA-0002' WHERE code = 'GLA-DAA-00002';
UPDATE bestellines  SET code = 'GLA-DAA-0002' WHERE code = 'GLA-DAA-00002';
UPDATE kunstwerken  SET code = 'GLA-DAA-0003' WHERE code = 'GLA-DAA-00003';
UPDATE bestellines  SET code = 'GLA-DAA-0003' WHERE code = 'GLA-DAA-00003';
UPDATE kunstwerken  SET code = 'GLA-DAA-0004' WHERE code = 'GLA-DAA-00004';
UPDATE bestellines  SET code = 'GLA-DAA-0004' WHERE code = 'GLA-DAA-00004';
UPDATE kunstwerken  SET code = 'GLA-DAA-0005' WHERE code = 'GLA-DAA-00005';
UPDATE bestellines  SET code = 'GLA-DAA-0005' WHERE code = 'GLA-DAA-00005';
UPDATE kunstwerken  SET code = 'GLA-DAA-0006' WHERE code = 'GLA-DAA-00006';
UPDATE bestellines  SET code = 'GLA-DAA-0006' WHERE code = 'GLA-DAA-00006';
UPDATE kunstwerken  SET code = 'GLA-DAA-0007' WHERE code = 'GLA-DAA-00007';
UPDATE bestellines  SET code = 'GLA-DAA-0007' WHERE code = 'GLA-DAA-00007';
UPDATE kunstwerken  SET code = 'GLA-DAA-0008' WHERE code = 'GLA-DAA-00008';
UPDATE bestellines  SET code = 'GLA-DAA-0008' WHERE code = 'GLA-DAA-00008';
UPDATE kunstwerken  SET code = 'GLA-DAA-0009' WHERE code = 'GLA-DAA-00009';
UPDATE bestellines  SET code = 'GLA-DAA-0009' WHERE code = 'GLA-DAA-00009';
UPDATE kunstwerken  SET code = 'GLA-DAA-0010' WHERE code = 'GLA-DAA-00010';
UPDATE bestellines  SET code = 'GLA-DAA-0010' WHERE code = 'GLA-DAA-00010';
UPDATE kunstwerken  SET code = 'GLA-DAA-0011' WHERE code = 'GLA-DAA-00011';
UPDATE bestellines  SET code = 'GLA-DAA-0011' WHERE code = 'GLA-DAA-00011';
UPDATE kunstwerken  SET code = 'GLA-DAA-0012' WHERE code = 'GLA-DAA-00012';
UPDATE bestellines  SET code = 'GLA-DAA-0012' WHERE code = 'GLA-DAA-00012';
UPDATE kunstwerken  SET code = 'GLA-DAA-0013' WHERE code = 'GLA-DAA-00013';
UPDATE bestellines  SET code = 'GLA-DAA-0013' WHERE code = 'GLA-DAA-00013';
UPDATE kunstwerken  SET code = 'GLA-GLA-0001' WHERE code = 'GLA-GLA-00001';
UPDATE bestellines  SET code = 'GLA-GLA-0001' WHERE code = 'GLA-GLA-00001';
UPDATE kunstwerken  SET code = 'GLA-GLA-0002' WHERE code = 'GLA-GLA-00002';
UPDATE bestellines  SET code = 'GLA-GLA-0002' WHERE code = 'GLA-GLA-00002';
UPDATE kunstwerken  SET code = 'GLA-GLA-0003' WHERE code = 'GLA-GLA-00003';
UPDATE bestellines  SET code = 'GLA-GLA-0003' WHERE code = 'GLA-GLA-00003';
UPDATE kunstwerken  SET code = 'GLA-GLA-0004' WHERE code = 'GLA-GLA-00004';
UPDATE bestellines  SET code = 'GLA-GLA-0004' WHERE code = 'GLA-GLA-00004';
UPDATE kunstwerken  SET code = 'GLA-GLA-0005' WHERE code = 'GLA-GLA-00005';
UPDATE bestellines  SET code = 'GLA-GLA-0005' WHERE code = 'GLA-GLA-00005';
UPDATE kunstwerken  SET code = 'GLA-GLA-0006' WHERE code = 'GLA-GLA-00006';
UPDATE bestellines  SET code = 'GLA-GLA-0006' WHERE code = 'GLA-GLA-00006';
UPDATE kunstwerken  SET code = 'GLA-GLA-0007' WHERE code = 'GLA-GLA-00007';
UPDATE bestellines  SET code = 'GLA-GLA-0007' WHERE code = 'GLA-GLA-00007';
UPDATE kunstwerken  SET code = 'GLA-GLA-0008' WHERE code = 'GLA-GLA-00008';
UPDATE bestellines  SET code = 'GLA-GLA-0008' WHERE code = 'GLA-GLA-00008';
UPDATE kunstwerken  SET code = 'GLA-GLA-0009' WHERE code = 'GLA-GLA-00009';
UPDATE bestellines  SET code = 'GLA-GLA-0009' WHERE code = 'GLA-GLA-00009';
UPDATE kunstwerken  SET code = 'GLA-GLA-0010' WHERE code = 'GLA-GLA-00010';
UPDATE bestellines  SET code = 'GLA-GLA-0010' WHERE code = 'GLA-GLA-00010';
UPDATE kunstwerken  SET code = 'GLA-JAC-0001' WHERE code = 'GLA-JAC-00001';
UPDATE bestellines  SET code = 'GLA-JAC-0001' WHERE code = 'GLA-JAC-00001';
UPDATE kunstwerken  SET code = 'GLA-JAC-0002' WHERE code = 'GLA-JAC-00002';
UPDATE bestellines  SET code = 'GLA-JAC-0002' WHERE code = 'GLA-JAC-00002';
UPDATE kunstwerken  SET code = 'GLA-JAC-0003' WHERE code = 'GLA-JAC-00003';
UPDATE bestellines  SET code = 'GLA-JAC-0003' WHERE code = 'GLA-JAC-00003';
UPDATE kunstwerken  SET code = 'GLA-JAC-0004' WHERE code = 'GLA-JAC-00004';
UPDATE bestellines  SET code = 'GLA-JAC-0004' WHERE code = 'GLA-JAC-00004';
UPDATE kunstwerken  SET code = 'GLA-JAC-0005' WHERE code = 'GLA-JAC-00005';
UPDATE bestellines  SET code = 'GLA-JAC-0005' WHERE code = 'GLA-JAC-00005';
UPDATE kunstwerken  SET code = 'GLA-JAC-0006' WHERE code = 'GLA-JAC-00006';
UPDATE bestellines  SET code = 'GLA-JAC-0006' WHERE code = 'GLA-JAC-00006';
UPDATE kunstwerken  SET code = 'GLA-JAC-0007' WHERE code = 'GLA-JAC-00007';
UPDATE bestellines  SET code = 'GLA-JAC-0007' WHERE code = 'GLA-JAC-00007';
UPDATE kunstwerken  SET code = 'GLA-JAC-0008' WHERE code = 'GLA-JAC-00008';
UPDATE bestellines  SET code = 'GLA-JAC-0008' WHERE code = 'GLA-JAC-00008';
UPDATE kunstwerken  SET code = 'GLA-JAC-0009' WHERE code = 'GLA-JAC-00009';
UPDATE bestellines  SET code = 'GLA-JAC-0009' WHERE code = 'GLA-JAC-00009';
UPDATE kunstwerken  SET code = 'GLA-JAC-0010' WHERE code = 'GLA-JAC-00010';
UPDATE bestellines  SET code = 'GLA-JAC-0010' WHERE code = 'GLA-JAC-00010';
UPDATE kunstwerken  SET code = 'GLA-MAR-0001' WHERE code = 'Gla-MAR-001';
UPDATE bestellines  SET code = 'GLA-MAR-0001' WHERE code = 'Gla-MAR-001';
UPDATE kunstwerken  SET code = 'GLA-MAR-0002' WHERE code = 'GLA-MAR-002';
UPDATE bestellines  SET code = 'GLA-MAR-0002' WHERE code = 'GLA-MAR-002';
UPDATE kunstwerken  SET code = 'GLA-MAR-0003' WHERE code = 'GLA-MAR-003';
UPDATE bestellines  SET code = 'GLA-MAR-0003' WHERE code = 'GLA-MAR-003';
UPDATE kunstwerken  SET code = 'GLA-MAR-0004' WHERE code = 'GLA-MAR-004';
UPDATE bestellines  SET code = 'GLA-MAR-0004' WHERE code = 'GLA-MAR-004';
UPDATE kunstwerken  SET code = 'GLA-MAR-0005' WHERE code = 'GLA-MAR-005';
UPDATE bestellines  SET code = 'GLA-MAR-0005' WHERE code = 'GLA-MAR-005';
UPDATE kunstwerken  SET code = 'GLA-MAR-0006' WHERE code = 'GLA-MAR-006';
UPDATE bestellines  SET code = 'GLA-MAR-0006' WHERE code = 'GLA-MAR-006';
UPDATE kunstwerken  SET code = 'GLA-MAR-0007' WHERE code = 'GLA-MAR-007';
UPDATE bestellines  SET code = 'GLA-MAR-0007' WHERE code = 'GLA-MAR-007';
UPDATE kunstwerken  SET code = 'GLA-MAR-0009' WHERE code = 'GLA-MAR-009';
UPDATE bestellines  SET code = 'GLA-MAR-0009' WHERE code = 'GLA-MAR-009';
UPDATE kunstwerken  SET code = 'GLA-MAR-0011' WHERE code = 'GLA-MAR-011';
UPDATE bestellines  SET code = 'GLA-MAR-0011' WHERE code = 'GLA-MAR-011';
UPDATE kunstwerken  SET code = 'GLA-TOM-0001' WHERE code = 'GLA-TOM-00001';
UPDATE bestellines  SET code = 'GLA-TOM-0001' WHERE code = 'GLA-TOM-00001';
UPDATE kunstwerken  SET code = 'GLA-TOM-0002' WHERE code = 'GLA-TOM-00002';
UPDATE bestellines  SET code = 'GLA-TOM-0002' WHERE code = 'GLA-TOM-00002';
UPDATE kunstwerken  SET code = 'GLA-TOM-0003' WHERE code = 'GLA-TOM-00003';
UPDATE bestellines  SET code = 'GLA-TOM-0003' WHERE code = 'GLA-TOM-00003';
UPDATE kunstwerken  SET code = 'GLA-TOM-0004' WHERE code = 'GLA-TOM-00004';
UPDATE bestellines  SET code = 'GLA-TOM-0004' WHERE code = 'GLA-TOM-00004';
UPDATE kunstwerken  SET code = 'GLA-TOM-0005' WHERE code = 'GLA-TOM-00005';
UPDATE bestellines  SET code = 'GLA-TOM-0005' WHERE code = 'GLA-TOM-00005';
UPDATE kunstwerken  SET code = 'GLA-TOM-0006' WHERE code = 'GLA-TOM-00006';
UPDATE bestellines  SET code = 'GLA-TOM-0006' WHERE code = 'GLA-TOM-00006';
UPDATE kunstwerken  SET code = 'GLA-TOM-0007' WHERE code = 'GLA-TOM-00007';
UPDATE bestellines  SET code = 'GLA-TOM-0007' WHERE code = 'GLA-TOM-00007';
UPDATE kunstwerken  SET code = 'GLA-TOM-0008' WHERE code = 'GLA-TOM-00008';
UPDATE bestellines  SET code = 'GLA-TOM-0008' WHERE code = 'GLA-TOM-00008';
UPDATE kunstwerken  SET code = 'GLA-TOM-0009' WHERE code = 'GLA-TOM-00009';
UPDATE bestellines  SET code = 'GLA-TOM-0009' WHERE code = 'GLA-TOM-00009';
UPDATE kunstwerken  SET code = 'GLA-TOM-0010' WHERE code = 'GLA-TOM-00010';
UPDATE bestellines  SET code = 'GLA-TOM-0010' WHERE code = 'GLA-TOM-00010';
UPDATE kunstwerken  SET code = 'GLA-TOM-0011' WHERE code = 'GLA-TOM-00011';
UPDATE bestellines  SET code = 'GLA-TOM-0011' WHERE code = 'GLA-TOM-00011';
