/*
  ΕΛΤΑ Courier Tracking — Cloudflare Worker (CORS Proxy)
  ======================================================
  
  SETUP (5 λεπτά, δωρεάν):
  
  1. Πήγαινε: https://dash.cloudflare.com → Workers & Pages → Create
  2. Πάτα "Create Worker"
  3. Δώσε όνομα π.χ. "elta-track"
  4. Κάνε paste ΟΛΟ αυτό το αρχείο στον editor
  5. Πάτα "Deploy"
  6. Θα πάρεις URL: https://elta-track.YOURNAME.workers.dev
  7. Βάλε αυτό το URL στο HTML αρχείο (WORKER_URL variable)
  
  Free tier: 100,000 requests/day
*/

export default {
  async fetch(request) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    if (request.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'POST only' }), {
        status: 405,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    try {
      const body = await request.text();

      const resp = await fetch('https://www.elta-courier.gr/track.php', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.elta-courier.gr/search',
          'Origin': 'https://www.elta-courier.gr'
        },
        body: body
      });

      const data = await resp.text();

      return new Response(data, {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'no-cache'
        }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }
  }
};
