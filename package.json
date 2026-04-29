const express = require("express");
const fetch = require("node-fetch");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY || "175fb95e18a6b2f2aabfe643dfaee5ea";

// Serve static frontend files
app.use(express.static(path.join(__dirname, "public")));

// API proxy endpoint - fetches from api-football server-side (no CORS issues)
app.get("/api/fixtures", async (req, res) => {
  const date = req.query.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: "Invalid date format. Use YYYY-MM-DD." });
  }

  try {
    const response = await fetch(`https://v3.football.api-sports.io/fixtures?date=${date}`, {
      headers: {
        "x-apisports-key": FOOTBALL_API_KEY,
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Football API error: ${response.status}` });
    }

    const data = await response.json();

    if (data.errors && Object.keys(data.errors).length > 0) {
      return res.status(401).json({ error: "Invalid API key", details: data.errors });
    }

    res.json({ fixtures: data.response || [] });
  } catch (err) {
    console.error("Fetch error:", err);
    res.status(500).json({ error: "Failed to fetch fixtures: " + err.message });
  }
});

// Catch-all: serve index.html
app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Shithouse Football running on port ${PORT}`);
});
