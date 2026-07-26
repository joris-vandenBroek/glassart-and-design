// Central on/off switch for routes that are hidden behind an Under
// Construction page. Read at build time only (the site is a static
// export) — flipping a value requires a rebuild + redeploy.
export const pageAvailability = {
  collecties: false,
  wordKlant: false,
  inloggen: false,
  beheer: false,
  account: false,
  contact: false,
};
