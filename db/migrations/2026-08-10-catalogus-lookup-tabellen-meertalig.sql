-- Migratie voor meertalige catalogustabellen (2026-08-10)
-- Ontwerp: docs/superpowers/specs/2026-08-10-catalogus-lookup-tabellen-meertalig-design.md
--
-- segmenten, stijlen, onderwerpen, materiaalsoorten en materialen hadden elk één
-- omschrijving-kolom (Nederlands), terwijl kunstenaars/kunstwerken al vier kolommen
-- (omschrijvingNl/Fr/De/En) hebben. Deze migratie brengt deze 5 tabellen naar hetzelfde
-- patroon. VARCHAR(255) blijft staan (korte catalogustermen, geen lopende tekst zoals bij
-- kunstenaars/kunstwerken, die TEXT gebruiken).
--
-- Uitrolvolgorde: draai deze migratie tegen een omgeving VOORDAT de code die hem
-- gebruikt daar gedeployd wordt -- zelfde eis als 2026-08-10-kunstwerk-code.sql. Het
-- faalgedrag in dat venster is hier anders dan bij de kunstwerkcode-migratie, en
-- asymmetrisch tussen lezen en schrijven:
--   - LEZEN blijft gewoon werken: `selectLijst()` in src/lib/server/crud.ts doet
--     `SELECT *` voor deze 5 tabellen (geen entry in VERBORGEN_KOLOMMEN), dus GET-requests
--     leveren gewoon de nieuwe omschrijvingNl/Fr/De/En-vorm. Maar de dan nog draaiende oude
--     frontend leest nog `segment.omschrijving`, wat nu `undefined` is -- dat degradeert
--     stil naar lege filterlabels/chips/productomschrijvingen op de publieke
--     collectiepagina, zonder enige foutmelding.
--   - SCHRIJVEN faalt wel hard in dat venster, maar dan rechtstreeks met een MySQL
--     ER_BAD_FIELD_ERROR (Unknown column 'omschrijving'). `controleerKolommen` in
--     src/lib/server/tableColumns.ts toetst het request af tegen de allowlist van de dan nog
--     draaiende oude bundel, en die bevat `omschrijving` nog gewoon -- de guard laat de
--     schrijfactie dus door, en de fout komt pas van MySQL zelf.
-- Omdat lege labels op de publieke site makkelijk een tijdje onopgemerkt kunnen blijven:
-- draai de productiemigratie vlak vóór het dispatchen van de productiedeploy, met iemand
-- klaar om meteen daarna de RESTART-knop in DirectAdmin te klikken.

ALTER TABLE segmenten CHANGE omschrijving omschrijvingNl VARCHAR(255) NOT NULL;
ALTER TABLE segmenten ADD COLUMN omschrijvingFr VARCHAR(255) AFTER omschrijvingNl;
ALTER TABLE segmenten ADD COLUMN omschrijvingDe VARCHAR(255) AFTER omschrijvingFr;
ALTER TABLE segmenten ADD COLUMN omschrijvingEn VARCHAR(255) AFTER omschrijvingDe;

ALTER TABLE stijlen CHANGE omschrijving omschrijvingNl VARCHAR(255) NOT NULL;
ALTER TABLE stijlen ADD COLUMN omschrijvingFr VARCHAR(255) AFTER omschrijvingNl;
ALTER TABLE stijlen ADD COLUMN omschrijvingDe VARCHAR(255) AFTER omschrijvingFr;
ALTER TABLE stijlen ADD COLUMN omschrijvingEn VARCHAR(255) AFTER omschrijvingDe;

ALTER TABLE onderwerpen CHANGE omschrijving omschrijvingNl VARCHAR(255) NOT NULL;
ALTER TABLE onderwerpen ADD COLUMN omschrijvingFr VARCHAR(255) AFTER omschrijvingNl;
ALTER TABLE onderwerpen ADD COLUMN omschrijvingDe VARCHAR(255) AFTER omschrijvingFr;
ALTER TABLE onderwerpen ADD COLUMN omschrijvingEn VARCHAR(255) AFTER omschrijvingDe;

ALTER TABLE materiaalsoorten CHANGE omschrijving omschrijvingNl VARCHAR(255) NOT NULL;
ALTER TABLE materiaalsoorten ADD COLUMN omschrijvingFr VARCHAR(255) AFTER omschrijvingNl;
ALTER TABLE materiaalsoorten ADD COLUMN omschrijvingDe VARCHAR(255) AFTER omschrijvingFr;
ALTER TABLE materiaalsoorten ADD COLUMN omschrijvingEn VARCHAR(255) AFTER omschrijvingDe;

ALTER TABLE materialen CHANGE omschrijving omschrijvingNl VARCHAR(255) NOT NULL;
ALTER TABLE materialen ADD COLUMN omschrijvingFr VARCHAR(255) AFTER omschrijvingNl;
ALTER TABLE materialen ADD COLUMN omschrijvingDe VARCHAR(255) AFTER omschrijvingFr;
ALTER TABLE materialen ADD COLUMN omschrijvingEn VARCHAR(255) AFTER omschrijvingDe;

-- Vertalingen voor de bestaande catalogusinhoud. Matcht op omschrijvingNl-tekst, niet op
-- id: catalogusrijen zijn per omgeving apart aangemaakt, dus staging/productie delen geen
-- id's. Rijen die niet matchen (andere spelling, of rijen die alleen in productie
-- bestaan) blijven leeg en vallen op de site terug op Nederlands, precies zoals nu.

-- segmenten
UPDATE segmenten SET omschrijvingFr = 'Abstrait', omschrijvingDe = 'Abstrakt', omschrijvingEn = 'Abstract' WHERE omschrijvingNl = 'Abstract';
UPDATE segmenten SET omschrijvingFr = 'Collections d''artistes', omschrijvingDe = 'Künstlerkollektionen', omschrijvingEn = 'Artist Collections' WHERE omschrijvingNl = 'Artist Collections';
UPDATE segmenten SET omschrijvingFr = 'Hôtel', omschrijvingDe = 'Hotel', omschrijvingEn = 'Hotel' WHERE omschrijvingNl = 'Hotel';
UPDATE segmenten SET omschrijvingFr = 'Bureau', omschrijvingDe = 'Büro', omschrijvingEn = 'Office' WHERE omschrijvingNl = 'Office';
UPDATE segmenten SET omschrijvingFr = 'Restaurant', omschrijvingDe = 'Restaurant', omschrijvingEn = 'Restaurant' WHERE omschrijvingNl = 'Restaurant';
UPDATE segmenten SET omschrijvingFr = 'Bien-être', omschrijvingDe = 'Wellness', omschrijvingEn = 'Wellness' WHERE omschrijvingNl = 'Wellness';

-- stijlen
UPDATE stijlen SET omschrijvingFr = 'Expressionnisme abstrait', omschrijvingDe = 'Abstrakter Expressionismus', omschrijvingEn = 'Abstract Expressionism' WHERE omschrijvingNl = 'Abstract Expressionisme';
UPDATE stijlen SET omschrijvingFr = 'Aquarelle', omschrijvingDe = 'Aquarell', omschrijvingEn = 'Watercolor' WHERE omschrijvingNl = 'Aquarel';
UPDATE stijlen SET omschrijvingFr = 'Art numérique', omschrijvingDe = 'Digitale Kunst', omschrijvingEn = 'Digital Art' WHERE omschrijvingNl = 'Digitale Kunst';
UPDATE stijlen SET omschrijvingFr = 'Photoréaliste', omschrijvingDe = 'Fotorealistisch', omschrijvingEn = 'Photorealistic' WHERE omschrijvingNl = 'Fotorealistisch';
UPDATE stijlen SET omschrijvingFr = 'Impressionniste', omschrijvingDe = 'Impressionistisch', omschrijvingEn = 'Impressionist' WHERE omschrijvingNl = 'Impressionistisch';
UPDATE stijlen SET omschrijvingFr = 'Line Art', omschrijvingDe = 'Line Art', omschrijvingEn = 'Line Art' WHERE omschrijvingNl = 'Line Art';
UPDATE stijlen SET omschrijvingFr = 'Minimaliste', omschrijvingDe = 'Minimalistisch', omschrijvingEn = 'Minimalist' WHERE omschrijvingNl = 'Minimalistisch';
UPDATE stijlen SET omschrijvingFr = 'Collage Mixed Media', omschrijvingDe = 'Mixed-Media-Collage', omschrijvingEn = 'Mixed Media Collage' WHERE omschrijvingNl = 'Mixed Media Collage';
UPDATE stijlen SET omschrijvingFr = 'Pop Art', omschrijvingDe = 'Pop Art', omschrijvingEn = 'Pop Art' WHERE omschrijvingNl = 'Pop Art';
UPDATE stijlen SET omschrijvingFr = 'Skyline', omschrijvingDe = 'Skyline', omschrijvingEn = 'Skyline' WHERE omschrijvingNl = 'Skyline';
UPDATE stijlen SET omschrijvingFr = 'Surréaliste', omschrijvingDe = 'Surrealistisch', omschrijvingEn = 'Surrealist' WHERE omschrijvingNl = 'Surrealistisch';
UPDATE stijlen SET omschrijvingFr = 'Noir et blanc', omschrijvingDe = 'Schwarz-Weiß', omschrijvingEn = 'Black & White' WHERE omschrijvingNl = 'Zwart-wit';

-- onderwerpen
UPDATE onderwerpen SET omschrijvingFr = 'Architecture', omschrijvingDe = 'Architektur', omschrijvingEn = 'Architecture' WHERE omschrijvingNl = 'Architectuur';
UPDATE onderwerpen SET omschrijvingFr = 'Montagnes', omschrijvingDe = 'Berge', omschrijvingEn = 'Mountains' WHERE omschrijvingNl = 'Bergen';
UPDATE onderwerpen SET omschrijvingFr = 'Fleurs & Plantes', omschrijvingDe = 'Blumen & Pflanzen', omschrijvingEn = 'Flowers & Plants' WHERE omschrijvingNl = 'Bloemen & Planten';
UPDATE onderwerpen SET omschrijvingFr = 'Forêt & Nature', omschrijvingDe = 'Wald & Natur', omschrijvingEn = 'Forest & Nature' WHERE omschrijvingNl = 'Bos & Natuur';
UPDATE onderwerpen SET omschrijvingFr = 'Animaux', omschrijvingDe = 'Tiere', omschrijvingEn = 'Animals' WHERE omschrijvingNl = 'Dieren';
UPDATE onderwerpen SET omschrijvingFr = 'Paysage onirique', omschrijvingDe = 'Traumhafte Landschaft', omschrijvingEn = 'Dreamy Landscape' WHERE omschrijvingNl = 'Dromerig Landschap';
UPDATE onderwerpen SET omschrijvingFr = 'Formes géométriques', omschrijvingDe = 'Geometrische Formen', omschrijvingEn = 'Geometric Shapes' WHERE omschrijvingNl = 'Geometrische Vormen';
UPDATE onderwerpen SET omschrijvingFr = 'Paysage', omschrijvingDe = 'Landschaft', omschrijvingEn = 'Landscape' WHERE omschrijvingNl = 'Landschap';
UPDATE onderwerpen SET omschrijvingFr = 'Portrait', omschrijvingDe = 'Porträt', omschrijvingEn = 'Portrait' WHERE omschrijvingNl = 'Portret';
UPDATE onderwerpen SET omschrijvingFr = 'Espace & Cosmos', omschrijvingDe = 'Raum & Kosmos', omschrijvingEn = 'Space & Cosmos' WHERE omschrijvingNl = 'Ruimte & Kosmos';
UPDATE onderwerpen SET omschrijvingFr = 'Spiritualité & Zen', omschrijvingDe = 'Spiritualität & Zen', omschrijvingEn = 'Spirituality & Zen' WHERE omschrijvingNl = 'Spiritualiteit & Zen';
UPDATE onderwerpen SET omschrijvingFr = 'Paysage urbain', omschrijvingDe = 'Stadtansicht', omschrijvingEn = 'Cityscape' WHERE omschrijvingNl = 'Stadsgezicht';
UPDATE onderwerpen SET omschrijvingFr = 'Formes & Couleurs', omschrijvingDe = 'Formen & Farben', omschrijvingEn = 'Shapes & Colors' WHERE omschrijvingNl = 'Vormen & Kleuren';
UPDATE onderwerpen SET omschrijvingFr = 'Mer & Plage', omschrijvingDe = 'Meer & Strand', omschrijvingEn = 'Sea & Beach' WHERE omschrijvingNl = 'Zee & Strand';

-- materiaalsoorten
UPDATE materiaalsoorten SET omschrijvingFr = 'Acrylique', omschrijvingDe = 'Acryl', omschrijvingEn = 'Acrylic' WHERE omschrijvingNl = 'Acryl';
UPDATE materiaalsoorten SET omschrijvingFr = 'Dibond', omschrijvingDe = 'Dibond', omschrijvingEn = 'Dibond' WHERE omschrijvingNl = 'Dibond';
UPDATE materiaalsoorten SET omschrijvingFr = 'Verre de sécurité', omschrijvingDe = 'Sicherheitsglas', omschrijvingEn = 'Safety Glass' WHERE omschrijvingNl = 'Veiligheidsglas';

-- materialen
UPDATE materialen SET omschrijvingFr = 'Léger et clair, avec un aspect brillant et luxueux.', omschrijvingDe = 'Leicht und klar mit einem edlen, glänzenden Look.', omschrijvingEn = 'Light and clear with a luxurious glossy look.' WHERE omschrijvingNl = 'Licht en helder met een luxe glanzende look.';
UPDATE materialen SET omschrijvingFr = 'Plus de profondeur et de robustesse pour un effet impressionnant.', omschrijvingDe = 'Mehr Tiefe und Stabilität für einen beeindruckenden Effekt.', omschrijvingEn = 'Extra depth and sturdiness for an impressive effect.' WHERE omschrijvingNl = 'Extra diepte en stevigheid voor een indrukwekkend effect.';
UPDATE materialen SET omschrijvingFr = 'Effet de profondeur maximal pour une présentation exclusive.', omschrijvingDe = 'Maximale Tiefenwirkung für eine exklusive Präsentation.', omschrijvingEn = 'Maximum depth effect for an exclusive presentation.' WHERE omschrijvingNl = 'Maximale diepwerking voor exclusieve presentatie.';
UPDATE materialen SET omschrijvingFr = 'Léger, rigide et indéformable, avec une finition mate.', omschrijvingDe = 'Leicht, steif und formstabil mit einer matten Optik.', omschrijvingEn = 'Lightweight, rigid and dimensionally stable with a matte finish.' WHERE omschrijvingNl = 'Lichtgewicht, stijf en vormvast met een matte uitstraling.';
UPDATE materialen SET omschrijvingFr = 'Notre spécialité. Cristallin, résistant et sécurisé.', omschrijvingDe = 'Unsere Spezialität. Kristallklar, stark und sicher.', omschrijvingEn = 'Our specialty. Crystal clear, strong and safe.' WHERE omschrijvingNl = 'Onze specialiteit. Kristalhelder, sterk en veilig.';
