const { createServer } = require('http');
const next = require('next');

const port = process.env.PORT || 3000;
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer((req, res) => {
    handle(req, res);
  });

  server.listen(port, (err) => {
    if (err) throw err;
    console.log(`> glassart-visitekaartje ready on port ${port} (dev=${dev})`);
  });

  // On a Passenger restart/redeploy, stop accepting new connections and let in-flight
  // requests finish (each holds a pooled DB connection only for the duration of its own
  // queries) instead of dropping them mid-request. Process exit closes every remaining
  // MySQL socket at the OS level regardless, but exiting promptly here -- rather than
  // however long Passenger otherwise waits before a hard kill -- keeps the old process
  // from holding onto connections longer than necessary during the handoff to the new one.
  function shutdown(signal) {
    console.log(`> received ${signal}, shutting down gracefully`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
});
