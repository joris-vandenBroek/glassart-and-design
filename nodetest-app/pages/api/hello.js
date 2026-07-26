export default function handler(req, res) {
  res.status(200).json({
    message: 'Node.js API-route werkt',
    timestamp: new Date().toISOString(),
    uptimeSeconds: process.uptime(),
  });
}
