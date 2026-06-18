const express = require("express");
const fetch = require("node-fetch");
const path = require("path");
 
const app = express();
const PORT = process.env.PORT || 3000;
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || "175fb95e18a6b2f2aabfe643dfaee5ea";
 
const BASE = "https://v3.football.api-sports.io";
const HEADERS = { "x-apisports-key": FOOTBALL_API_KEY };
 
app.use(express.static(path.join(__dirname, "public")));
 
// Generic proxy helper
async function proxy(url, res) {
  try {
    const r = await fetchWithRetry(url, { headers: HEADERS });
    if (!r.ok) return res.status(r.status).json({ error: `API error ${r.status}` });
    const data = await r.json();
    if (data.errors && Object.keys(data.errors).length > 0) {
      return res.status(401).json({ error: "API error", details: data.errors });
    }
    res.json(data);
  } catch (e) {
    console.error("Proxy error:", e);
    res.status(500).json({ error: e.message });
  }
}

// Retry helper - retries up to 2 times on failure with 500ms delay
async function fetchWithRetry(url, options, retries = 2) {
  for (let i = 0; i <= retries; i++) {
    try {
      const r = await fetch(url, options);
      if (r.ok) return r;
      // Don't retry on auth errors
      if (r.status === 401 || r.status === 403) return r;
    } catch (e) {
      console.error(`Fetch attempt ${i + 1} failed for ${url}:`, e.message);
      if (i === retries) throw e;
      await new Promise(res => setTimeout(res, 500));
    }
  }
}
 
// Current season helper - Pro plan has access to current season
function currentSeason() {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  return month >= 8 ? year : year - 1;
}
 
// ── FIXTURES ──────────────────────────────────────────────────────────────
app.get("/api/fixtures", async (req, res) => {
  const date = req.query.date;
  const utcOffset = parseInt(req.query.utcOffset) || -300;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "Invalid date" });

  const [y, m, d] = date.split('-').map(Number);
  const nextDate = new Date(Date.UTC(y, m - 1, d + 1)).toISOString().split('T')[0];

  try {
    const [r1, r2] = await Promise.all([
      fetchWithRetry(`${BASE}/fixtures?date=${date}`, { headers: HEADERS }),
      fetchWithRetry(`${BASE}/fixtures?date=${nextDate}`, { headers: HEADERS })
    ]);
    const [data1, data2] = await Promise.all([r1.json(), r2.json()]);
    const combined = [...(data1.response || []), ...(data2.response || [])];

    const seen = new Set();
    const filtered = combined.filter(f => {
      if (seen.has(f.fixture.id)) return false;
      seen.add(f.fixture.id);
      const local = new Date(new Date(f.fixture.date).getTime() + utcOffset * 60 * 1000);
      const localDate = `${local.getUTCFullYear()}-${String(local.getUTCMonth()+1).padStart(2,'0')}-${String(local.getUTCDate()).padStart(2,'0')}`;
      return localDate === date;
    });

    res.json({ fixtures: filtered });
  } catch (e) {
    console.error("Fixtures error:", e);
    res.status(500).json({ error: e.message });
  }
});
 
// ── FIXTURE EVENTS ────────────────────────────────────────────────────────
app.get("/api/fixture-events", async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Missing id" });
  await proxy(`${BASE}/fixtures/events?fixture=${id}`, res);
});
 
// ── FIXTURE STATS ─────────────────────────────────────────────────────────
app.get("/api/fixture-stats", async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Missing id" });
  await proxy(`${BASE}/fixtures/statistics?fixture=${id}`, res);
});
 
// ── FIXTURE LINEUPS ───────────────────────────────────────────────────────
app.get("/api/fixture-lineups", async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Missing id" });
  await proxy(`${BASE}/fixtures/lineups?fixture=${id}`, res);
});
 
// ── STANDINGS (current season, with fallback) ─────────────────────────────
app.get("/api/standings", async (req, res) => {
  const { league } = req.query;
  if (!league) return res.status(400).json({ error: "Missing league" });
  const seasons = [currentSeason(), currentSeason() - 1, currentSeason() - 2];
  for (const season of seasons) {
    try {
      const r = await fetchWithRetry(`${BASE}/standings?league=${league}&season=${season}`, { headers: HEADERS });
      if (!r.ok) continue;
      const data = await r.json();
      if (data.errors && Object.keys(data.errors).length > 0) continue;
      const results = data.response || [];
      if (results.length > 0 && results[0].league?.standings?.length > 0) return res.json(data);
    } catch (e) { console.error(e); }
  }
  res.json({ response: [] });
});
 
// ── TEAM FIXTURES (upcoming + recent) ─────────────────────────────────────
app.get("/api/team-fixtures", async (req, res) => {
  const { team, next, last } = req.query;
  if (!team) return res.status(400).json({ error: "Missing team" });
  const season = currentSeason();
  let url;
  if (next) url = `${BASE}/fixtures?team=${team}&next=${next}&season=${season}`;
  else if (last) url = `${BASE}/fixtures?team=${team}&last=${last}&season=${season}`;
  else url = `${BASE}/fixtures?team=${team}&season=${season}`;
  await proxy(url, res);
});
 
// ── TEAM INFO ─────────────────────────────────────────────────────────────
app.get("/api/team-info", async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Missing id" });
  await proxy(`${BASE}/teams?id=${id}`, res);
});
 
// ── TEAM STATISTICS ───────────────────────────────────────────────────────
app.get("/api/team-stats", async (req, res) => {
  const { team, league } = req.query;
  if (!team || !league) return res.status(400).json({ error: "Missing params" });
  const season = currentSeason();
  await proxy(`${BASE}/teams/statistics?team=${team}&league=${league}&season=${season}`, res);
});
 
// ── TEAM STANDING (just for one team) ────────────────────────────────────
app.get("/api/team-standing", async (req, res) => {
  const { team, league } = req.query;
  if (!team || !league) return res.status(400).json({ error: "Missing params" });
  const seasons = [currentSeason(), currentSeason() - 1];
  for (const season of seasons) {
    try {
      const r = await fetchWithRetry(`${BASE}/standings?league=${league}&season=${season}&team=${team}`, { headers: HEADERS });
      if (!r.ok) continue;
      const data = await r.json();
      if (data.errors && Object.keys(data.errors).length > 0) continue;
      if ((data.response || []).length > 0) return res.json(data);
    } catch (e) { console.error(e); }
  }
  res.json({ response: [] });
});
 
// ── LEAGUE FIXTURES ───────────────────────────────────────────────────────
app.get("/api/league-fixtures", async (req, res) => {
  const { league, next, last, from, to } = req.query;
  if (!league) return res.status(400).json({ error: "Missing league" });
  const season = currentSeason();
  let url = `${BASE}/fixtures?league=${league}&season=${season}`;
  if (next) url += `&next=${next}`;
  else if (last) url += `&last=${last}`;
  else if (from && to) url += `&from=${from}&to=${to}`;
  await proxy(url, res);
});
 
// ── TOP SCORERS ───────────────────────────────────────────────────────────
app.get("/api/top-scorers", async (req, res) => {
  const { league } = req.query;
  if (!league) return res.status(400).json({ error: "Missing league" });
  const season = currentSeason();
  await proxy(`${BASE}/players/topscorers?league=${league}&season=${season}`, res);
});
 
// ── TOP ASSISTERS ─────────────────────────────────────────────────────────
app.get("/api/top-assists", async (req, res) => {
  const { league } = req.query;
  if (!league) return res.status(400).json({ error: "Missing league" });
  const season = currentSeason();
  await proxy(`${BASE}/players/topassists?league=${league}&season=${season}`, res);
});

// ── WORLD CUP GROUP STANDINGS ─────────────────────────────────────────────
app.get("/api/wc-standings", async (req, res) => {
  try {
    const r = await fetchWithRetry(`${BASE}/standings?league=1&season=2026`, { headers: HEADERS });
    if (!r.ok) return res.status(r.status).json({ error: `API error ${r.status}` });
    const data = await r.json();
    if (data.errors && Object.keys(data.errors).length > 0)
      return res.status(401).json({ error: "API error", details: data.errors });
    res.json(data);
  } catch (e) {
    console.error("WC standings error:", e);
    res.status(500).json({ error: e.message });
  }
});
 
// Catch-all
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
 
app.listen(PORT, () => console.log(`Shithouse Football running on port ${PORT}`));
