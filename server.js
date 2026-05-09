require('dotenv').config();
const express = require('express');
const path = require('path');
const { initDB, getDB } = require('./db/database');

const app = express();
app.use(express.json());

// Serve static files (used locally; Vercel handles this via vercel.json routes)
app.use(express.static(path.join(__dirname, 'public')));

// Single promise for DB init — runs once per cold start, shared across all requests
const dbReady = initDB().catch(err => {
  console.error('DB init failed:', err);
  process.exit(1);
});

// Ensure DB is initialized before any request reaches a route
app.use(async (req, res, next) => {
  await dbReady;
  next();
});

app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/meals', require('./routes/meals'));
app.use('/api/ai', require('./routes/ai'));
app.get('/api/dashboard', require('./routes/dashboard'));
app.get('/api/pearls', (req, res) => res.json(require('./data/pearls')));

app.get('/api/settings', async (req, res) => {
  try {
    const { prepare } = getDB();
    const rows = await prepare('SELECT key, value FROM settings').all();
    const s = {};
    rows.forEach(r => { s[r.key] = r.value; });
    res.json(s);
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/settings', async (req, res) => {
  try {
    const { prepare } = getDB();
    const { calorie_goal, currency } = req.body;
    if (calorie_goal) await prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('calorie_goal', ?)").run(String(calorie_goal));
    if (currency) await prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('currency', ?)").run(currency);
    res.json({ ok: true });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

// SPA fallback (local dev only — Vercel handles this via vercel.json)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Export for Vercel serverless
module.exports = app;

// Local dev: start the HTTP server when run directly
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`💉 AmulyaTracker → http://localhost:${PORT}`);
  });
}
