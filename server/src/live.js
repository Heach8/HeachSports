// Canli mac yayini icin basit SSE hub'i
const clients = new Set(); // { res, matchId }

export function sseHandler(req, res) {
  const matchId = req.query.matchId ? Number(req.query.matchId) : null;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive'
  });
  res.write(': baglandi\n\n');
  const client = { res, matchId };
  clients.add(client);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(client);
  });
}

export function broadcast(matchId, payload) {
  const msg = `event: update\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const c of clients) {
    if (c.matchId === null || c.matchId === matchId) c.res.write(msg);
  }
}
