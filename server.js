const express = require("express");
const fetch = require("node-fetch");
const path = require("path");
 
const app = express();
const PORT = process.env.PORT || 3000;
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || "175fb95e18a6b2f2aabfe643dfaee5ea";
 
const BASE = "https://v3.football.api-sports.io";
const HEADERS = { "x-apisports-key": FOOTBALL_API_KEY };
 
app.use(express.static(path.join(__dirname, "public")));
 
// Helper: proxy any API-Football endpoint
async function proxyEndpoint(url, res) {
  try {
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) return res.status(response.status).json({ error: `API error ${response.status}` });
    const data = await response.json();
    if (data.errors && Object.keys(data.errors).length > 0) return res.status(401).json({ error: "API key error", details: data.errors });
    res.json(data);
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).json({ error: "Failed to fetch: " + err.message });
  }
}
 
// Fixtures by date
app.get("/api/fixtures", async (req, res) => {
  const date = req.query.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: "Invalid date" });
  const response = await fetch(`${BASE}/fixtures?date=${date}`, { headers: HEADERS });
  if (!response.ok) return res.status(response.status).json({ error: `API error ${response.status}` });
  const data = await response.json();
  if (data.errors && Object.keys(data.errors).length > 0) return res.status(401).json({ error: "API key error" });
  res.json({ fixtures: data.response || [] });
});
 
// Match events
app.get("/api/fixture-events", async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "Missing fixture id" });
  await proxyEndpoint(`${BASE}/fixtures/events?fixture=${id}`, res);
});
 
// Match statistics
app.get("/api/fixture-stats", async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "Missing fixture id" });
  await proxyEndpoint(`${BASE}/fixtures/statistics?fixture=${id}`, res);
});
 
// League standings — tries current season first, falls back to previous years
app.get("/api/standings", async (req, res) => {
  const league = req.query.league;
  if (!league) return res.status(400).json({ error: "Missing league" });
 
  const currentYear = new Date().getFullYear();
  const seasonsToTry = [currentYear, currentYear - 1, currentYear - 2];
 
  for (const season of seasonsToTry) {
    try {
      const response = await fetch(`${BASE}/standings?league=${league}&season=${season}`, { headers: HEADERS });
      if (!response.ok) continue;
      const data = await response.json();
      if (data.errors && Object.keys(data.errors).length > 0) {
        return res.status(401).json({ error: "API key error" });
      }
      const results = data.response || [];
      if (results.length > 0 && results[0].league && results[0].league.standings && results[0].league.standings.length > 0) {
        return res.json(data);
      }
    } catch (err) {
      console.error(`Standings fetch error for season ${season}:`, err);
    }
  }
 
  res.json({ response: [] });
});
 
// DEBUG endpoint — call this in browser to see raw API response
// e.g. https://shithousefootball.onrender.com/api/debug-standings?league=39
app.get("/api/debug-standings", async (req, res) => {
  const league = req.query.league || "39";
  const season = req.query.season || new Date().getFullYear();
  const url = `${BASE}/standings?league=${league}&season=${season}`;
  try {
    const response = await fetch(url, { headers: HEADERS });
    const text = await response.text();
    res.setHeader("Content-Type", "application/json");
    res.send(text);
  } catch (err) {
    res.json({ error: err.message });
  }
});
 
// Catch-all
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
 
app.listen(PORT, () => {
  console.log(`Shithouse Football running on port ${PORT}`);
});
 
