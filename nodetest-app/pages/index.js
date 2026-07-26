export async function getServerSideProps() {
  return {
    props: {
      serverTime: new Date().toISOString(),
      uptimeSeconds: process.uptime(),
    },
  };
}

export default function Home({ serverTime, uptimeSeconds }) {
  return (
    <div style={{ fontFamily: 'sans-serif', padding: '2rem', maxWidth: 600 }}>
      <h1>mijn.host Node.js test-app</h1>
      <p>
        Server time (bij elke request opnieuw gerenderd):{' '}
        <strong>{serverTime}</strong>
      </p>
      <p>
        Proces-uptime bij deze request: <strong>{uptimeSeconds.toFixed(1)}s</strong>
        <br />
        Laag getal na een periode van inactiviteit = Passenger heeft het proces
        gestopt en net opnieuw gestart (cold start).
      </p>
      <p>
        <a href="/api/hello">Test de API-route &rarr;</a>
      </p>
    </div>
  );
}
