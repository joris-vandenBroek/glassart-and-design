// Central on/off switch for routes that are hidden behind an Under
// Construction page. Read at build time only (the site is a static
// export) — flipping a value requires a rebuild + redeploy.
//
// Local builds and the GitHub Pages build (the ongoing development
// environment) always show everything. Only the mijn.host production
// build restricts the launch-scoped routes — build with
// MIJNHOST_BUILD=true to get that behavior. Beheer stays live
// everywhere regardless, since admins need direct-URL access on every
// deploy target.
const isMijnHostBuild = process.env.MIJNHOST_BUILD === 'true';

export const pageAvailability = {
  collecties: !isMijnHostBuild,
  wordKlant: !isMijnHostBuild,
  inloggen: !isMijnHostBuild,
  beheer: true,
  account: !isMijnHostBuild,
  contact: !isMijnHostBuild,
};
