-- db/schema.sql
CREATE TABLE klanten (
  id CHAR(36) PRIMARY KEY,
  klantnr VARCHAR(20),
  email VARCHAR(255) NOT NULL UNIQUE,
  wachtwoordHash VARCHAR(255) NOT NULL,
  companyName VARCHAR(255),
  kvk VARCHAR(50),
  btwNummer VARCHAR(20),
  contactPerson VARCHAR(255),
  phone VARCHAR(50),
  contactPreference VARCHAR(50),
  address VARCHAR(255),
  postcode VARCHAR(20),
  city VARCHAR(255),
  deliveryAddress VARCHAR(255),
  deliveryPostcode VARCHAR(20),
  deliveryCity VARCHAR(255),
  invoiceAddress VARCHAR(255),
  invoicePostcode VARCHAR(20),
  invoiceCity VARCHAR(255),
  land VARCHAR(2),
  invoiceLand VARCHAR(2),
  status VARCHAR(50) NOT NULL DEFAULT 'Beoordelen',
  prijsgroepId CHAR(36),
  kunstenaarnr VARCHAR(20),
  minimaleAfname INT,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  afwijsreden TEXT,
  UNIQUE KEY uniq_klanten_kunstenaarnr (kunstenaarnr),
  FOREIGN KEY (kunstenaarnr) REFERENCES kunstenaars(kunstenaarnr),
  UNIQUE KEY uniek_klantnr (klantnr)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE medewerkers (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  wachtwoordHash VARCHAR(255) NOT NULL,
  naam VARCHAR(255),
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE sessions (
  id CHAR(36) PRIMARY KEY,
  userType ENUM('klant','medewerker') NOT NULL,
  userId CHAR(36) NOT NULL,
  expiresAt TIMESTAMP NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE passwordResetTokens (
  token CHAR(36) PRIMARY KEY,
  userType ENUM('klant','medewerker') NOT NULL,
  userId CHAR(36) NOT NULL,
  expiresAt TIMESTAMP NOT NULL,
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE segmenten (
  id CHAR(36) PRIMARY KEY,
  omschrijvingNl VARCHAR(255) NOT NULL,
  omschrijvingFr VARCHAR(255),
  omschrijvingDe VARCHAR(255),
  omschrijvingEn VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE stijlen (
  id CHAR(36) PRIMARY KEY,
  omschrijvingNl VARCHAR(255) NOT NULL,
  omschrijvingFr VARCHAR(255),
  omschrijvingDe VARCHAR(255),
  omschrijvingEn VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE categorieen (
  id CHAR(36) PRIMARY KEY,
  omschrijvingNl VARCHAR(255) NOT NULL,
  omschrijvingFr VARCHAR(255),
  omschrijvingDe VARCHAR(255),
  omschrijvingEn VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE materiaalsoorten (
  id CHAR(36) PRIMARY KEY,
  omschrijvingNl VARCHAR(255) NOT NULL,
  omschrijvingFr VARCHAR(255),
  omschrijvingDe VARCHAR(255),
  omschrijvingEn VARCHAR(255),
  staatEigenMaatToe BOOLEAN DEFAULT FALSE,
  maxBreedte INT,
  maxHoogte INT,
  levertijdMaandenEigenMaat INT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE materialen (
  id CHAR(36) PRIMARY KEY,
  materiaalsoortId CHAR(36) NOT NULL,
  materiaaldikte DECIMAL(5,1) NOT NULL,
  omschrijvingNl VARCHAR(255) NOT NULL,
  omschrijvingFr VARCHAR(255),
  omschrijvingDe VARCHAR(255),
  omschrijvingEn VARCHAR(255),
  FOREIGN KEY (materiaalsoortId) REFERENCES materiaalsoorten(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE maten (
  id CHAR(36) PRIMARY KEY,
  breedte INT NOT NULL,
  hoogte INT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE prijsgroepen (
  id CHAR(36) PRIMARY KEY,
  naam VARCHAR(255) NOT NULL,
  kortingspercentage DECIMAL(5,2) NULL,
  opslagpercentage DECIMAL(5,2) NULL,
  CONSTRAINT chk_prijsgroep_korting_xor_opslag
    CHECK ((kortingspercentage IS NULL) <> (opslagpercentage IS NULL))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE prijsmatrix (
  id CHAR(36) PRIMARY KEY,
  maatId CHAR(36) NOT NULL,
  materiaalId CHAR(36) NOT NULL,
  prijs DECIMAL(10,2),
  UNIQUE KEY unique_maat_materiaal (maatId, materiaalId),
  FOREIGN KEY (maatId) REFERENCES maten(id) ON DELETE CASCADE,
  FOREIGN KEY (materiaalId) REFERENCES materialen(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE kunstenaars (
  id CHAR(36) PRIMARY KEY,
  kunstenaarnr VARCHAR(20) NOT NULL,
  naam VARCHAR(255) NOT NULL,
  foto VARCHAR(500),
  website VARCHAR(500),
  omschrijvingNl TEXT,
  omschrijvingFr TEXT,
  omschrijvingDe TEXT,
  omschrijvingEn TEXT,
  exclusieveKlantIds JSON,
  UNIQUE KEY uniek_kunstenaarnr (kunstenaarnr)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE kunstenaarAfspraken (
  id CHAR(36) PRIMARY KEY,
  prijsafspraken TEXT,
  prijsopslag DECIMAL(10,2) NOT NULL DEFAULT 0,
  FOREIGN KEY (id) REFERENCES kunstenaars(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE drukkers (
  id CHAR(36) PRIMARY KEY,
  drukkernr VARCHAR(20) NOT NULL,
  naam VARCHAR(255) NOT NULL,
  adres VARCHAR(255),
  postcode VARCHAR(20),
  plaats VARCHAR(255),
  email VARCHAR(255),
  prijsafspraken TEXT,
  standaard BOOLEAN DEFAULT FALSE,
  UNIQUE KEY uniek_drukkernr (drukkernr)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE drukkerZendingen (
  id CHAR(36) PRIMARY KEY,
  zendingnummer VARCHAR(20) NOT NULL,
  drukkernr VARCHAR(20) NOT NULL,
  verzondenOp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  onderwerp VARCHAR(255),
  body TEXT,
  aantalKlanten INT NOT NULL DEFAULT 0,
  aantalRegels INT NOT NULL DEFAULT 0,
  verzondDoor VARCHAR(255),
  FOREIGN KEY (drukkernr) REFERENCES drukkers(drukkernr),
  UNIQUE KEY uniek_zendingnummer (zendingnummer)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE drukkerZendingBestellingen (
  zendingnummer VARCHAR(20) NOT NULL,
  bestelnr VARCHAR(20) NOT NULL,
  PRIMARY KEY (zendingnummer, bestelnr),
  FOREIGN KEY (zendingnummer) REFERENCES drukkerZendingen(zendingnummer) ON DELETE CASCADE,
  FOREIGN KEY (bestelnr) REFERENCES bestelheaders(bestelnr)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE kunstwerken (
  id CHAR(36) PRIMARY KEY,
  code VARCHAR(255) NOT NULL DEFAULT '',
  foto VARCHAR(500),
  kunstenaarnr VARCHAR(20),
  formaat VARCHAR(20),
  omschrijvingNl TEXT,
  omschrijvingFr TEXT,
  omschrijvingDe TEXT,
  omschrijvingEn TEXT,
  aiGegenereerd BOOLEAN DEFAULT FALSE,
  prijsPerM2 DECIMAL(10,2),
  UNIQUE KEY uniek_code (code),
  FOREIGN KEY (kunstenaarnr) REFERENCES kunstenaars(kunstenaarnr)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE kunstwerkSegmenten (
  kunstwerkId CHAR(36) NOT NULL,
  segmentId CHAR(36) NOT NULL,
  volgorde INT NOT NULL,
  PRIMARY KEY (kunstwerkId, segmentId),
  FOREIGN KEY (kunstwerkId) REFERENCES kunstwerken(id) ON DELETE CASCADE,
  FOREIGN KEY (segmentId) REFERENCES segmenten(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE kunstwerkMaterialen (
  kunstwerkId CHAR(36) NOT NULL,
  materiaalId CHAR(36) NOT NULL,
  volgorde INT NOT NULL,
  PRIMARY KEY (kunstwerkId, materiaalId),
  FOREIGN KEY (kunstwerkId) REFERENCES kunstwerken(id) ON DELETE CASCADE,
  FOREIGN KEY (materiaalId) REFERENCES materialen(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE kunstwerkMaten (
  kunstwerkId CHAR(36) NOT NULL,
  maatId CHAR(36) NOT NULL,
  volgorde INT NOT NULL,
  PRIMARY KEY (kunstwerkId, maatId),
  FOREIGN KEY (kunstwerkId) REFERENCES kunstwerken(id) ON DELETE CASCADE,
  FOREIGN KEY (maatId) REFERENCES maten(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE kunstwerkStijlen (
  kunstwerkId CHAR(36) NOT NULL,
  stijlId CHAR(36) NOT NULL,
  volgorde INT NOT NULL,
  PRIMARY KEY (kunstwerkId, stijlId),
  FOREIGN KEY (kunstwerkId) REFERENCES kunstwerken(id) ON DELETE CASCADE,
  FOREIGN KEY (stijlId) REFERENCES stijlen(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE kunstwerkCategorieen (
  kunstwerkId CHAR(36) NOT NULL,
  categorieId CHAR(36) NOT NULL,
  volgorde INT NOT NULL,
  PRIMARY KEY (kunstwerkId, categorieId),
  FOREIGN KEY (kunstwerkId) REFERENCES kunstwerken(id) ON DELETE CASCADE,
  FOREIGN KEY (categorieId) REFERENCES categorieen(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE instellingen (
  id VARCHAR(50) PRIMARY KEY,
  data JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Records which files in db/migrations/ have been applied to this database. Created on
-- demand by scripts/db-migrate.ts as well, so an existing database picks it up without a
-- migration of its own (a migration that creates the ledger would be self-referential).
CREATE TABLE schema_migrations (
  filename VARCHAR(255) PRIMARY KEY,
  applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE counters (
  id VARCHAR(50) PRIMARY KEY,
  value INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO counters (id, value) VALUES ('bestelnummer', 0);
INSERT INTO counters (id, value) VALUES ('zendingnummer', 0);
INSERT INTO counters (id, value) VALUES ('klantnummer', 0);
INSERT INTO counters (id, value) VALUES ('kunstenaarnummer', 0);
INSERT INTO counters (id, value) VALUES ('drukkernummer', 0);

CREATE TABLE bestelheaders (
  id CHAR(36) PRIMARY KEY,
  klantnr VARCHAR(20) NOT NULL,
  bestelnr VARCHAR(20) NOT NULL,
  zendingnummer VARCHAR(20),
  besteldatum TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'Te beoordelen',
  korting DECIMAL(10,2),
  afwijsreden TEXT,
  FOREIGN KEY (klantnr) REFERENCES klanten(klantnr),
  UNIQUE KEY uniek_bestelnr (bestelnr)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bestellines (
  id CHAR(36) PRIMARY KEY,
  bestelnr VARCHAR(20) NOT NULL,
  code VARCHAR(255) NOT NULL,
  maatId CHAR(36),
  materiaalId CHAR(36),
  prijs DECIMAL(10,2),
  quantity INT NOT NULL DEFAULT 1,
  breedte INT,
  hoogte INT,
  FOREIGN KEY (bestelnr) REFERENCES bestelheaders(bestelnr) ON DELETE CASCADE,
  INDEX idx_bestellines_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bestelstatusHistorie (
  id CHAR(36) PRIMARY KEY,
  bestelnr VARCHAR(20) NOT NULL,
  status VARCHAR(50) NOT NULL,
  tijdstip TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  FOREIGN KEY (bestelnr) REFERENCES bestelheaders(bestelnr) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE activiteitenlog (
  id CHAR(36) PRIMARY KEY,
  type VARCHAR(100) NOT NULL,
  actorId CHAR(36),
  actorEmail VARCHAR(255),
  actorNaam VARCHAR(255),
  omschrijving VARCHAR(500),
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
