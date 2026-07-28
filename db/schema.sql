-- db/schema.sql
CREATE TABLE klanten (
  id CHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  wachtwoordHash VARCHAR(255) NOT NULL,
  companyName VARCHAR(255),
  kvk VARCHAR(50),
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
  status VARCHAR(50) NOT NULL DEFAULT 'Beoordelen',
  prijsgroepId CHAR(36),
  createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
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
  omschrijving VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE materiaalsoorten (
  id CHAR(36) PRIMARY KEY,
  omschrijving VARCHAR(255) NOT NULL,
  staatEigenMaatToe BOOLEAN DEFAULT FALSE,
  maxBreedte INT,
  maxHoogte INT,
  levertijdMaandenEigenMaat INT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE materialen (
  id CHAR(36) PRIMARY KEY,
  materiaalsoortId CHAR(36) NOT NULL,
  materiaaldikte DECIMAL(5,1) NOT NULL,
  omschrijving VARCHAR(255) NOT NULL,
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
  kortingspercentage DECIMAL(5,2) NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE kunstwerken (
  id CHAR(36) PRIMARY KEY,
  foto VARCHAR(500),
  naam VARCHAR(255) NOT NULL DEFAULT '',
  artiest VARCHAR(255) NOT NULL DEFAULT '',
  omschrijvingNl TEXT,
  omschrijvingFr TEXT,
  omschrijvingDe TEXT,
  omschrijvingEn TEXT,
  segmentIds JSON,
  materiaalIds JSON,
  maatIds JSON,
  prijzen JSON
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE instellingen (
  id VARCHAR(50) PRIMARY KEY,
  data JSON NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE counters (
  id VARCHAR(50) PRIMARY KEY,
  value INT NOT NULL DEFAULT 0
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT INTO counters (id, value) VALUES ('bestelnummer', 0);

CREATE TABLE bestelheaders (
  id CHAR(36) PRIMARY KEY,
  klantId CHAR(36) NOT NULL,
  bestelnr VARCHAR(20) NOT NULL,
  besteldatum TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'Te beoordelen',
  FOREIGN KEY (klantId) REFERENCES klanten(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE bestellines (
  id CHAR(36) PRIMARY KEY,
  bestelheaderId CHAR(36) NOT NULL,
  kunstwerkId CHAR(36),
  maatId CHAR(36),
  materiaalId CHAR(36),
  prijs DECIMAL(10,2),
  quantity INT NOT NULL DEFAULT 1,
  breedte INT,
  hoogte INT,
  FOREIGN KEY (bestelheaderId) REFERENCES bestelheaders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE activiteitenlog (
  id CHAR(36) PRIMARY KEY,
  type VARCHAR(100) NOT NULL,
  actorId CHAR(36),
  actorEmail VARCHAR(255),
  actorNaam VARCHAR(255),
  timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
