const { createClient } = require('@libsql/client');
const path = require('path');
const fs = require('fs');

let client = null;

function rowToObj(row, columns) {
  const obj = {};
  columns.forEach((col, i) => { obj[col] = row[i] ?? null; });
  return obj;
}

function normalizeArgs(args) {
  const p = args.length === 1 && Array.isArray(args[0]) ? args[0] : Array.from(args);
  return p.map(v => (v === undefined ? null : v));
}

// Mirrors the better-sqlite3 API but returns Promises
function prepare(sql) {
  return {
    async run(...args) {
      const result = await client.execute({ sql, args: normalizeArgs(args) });
      return { lastInsertRowid: result.lastInsertRowid ? Number(result.lastInsertRowid) : null };
    },
    async get(...args) {
      const result = await client.execute({ sql, args: normalizeArgs(args) });
      if (!result.rows.length) return undefined;
      return rowToObj(result.rows[0], result.columns);
    },
    async all(...args) {
      const result = await client.execute({ sql, args: normalizeArgs(args) });
      return result.rows.map(row => rowToObj(row, result.columns));
    }
  };
}

async function initDB() {
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

  // Turso cloud if env vars set, otherwise local SQLite file
  const url = process.env.TURSO_DATABASE_URL
    || `file:${path.join(dataDir, 'tracker.db')}`;
  const authToken = process.env.TURSO_AUTH_TOKEN || undefined;

  client = createClient({ url, authToken });

  // Schema — run each statement separately for compatibility
  const schema = [
    `CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      emoji TEXT DEFAULT '💰',
      color TEXT DEFAULT '#6366F1',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      description TEXT,
      date TEXT NOT NULL DEFAULT (date('now')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      date TEXT NOT NULL DEFAULT (date('now')),
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS meal_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meal_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      calories INTEGER DEFAULT 0,
      protein REAL DEFAULT 0,
      carbs REAL DEFAULT 0,
      fat REAL DEFAULT 0,
      fiber REAL DEFAULT 0,
      serving TEXT DEFAULT '1 serving',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )`,
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('calorie_goal', '2000')`,
    `INSERT OR IGNORE INTO settings (key, value) VALUES ('currency', '₹')`,
  ];

  for (const stmt of schema) {
    await client.execute(stmt);
  }

  // Seed default expense categories if table is empty
  const count = await client.execute('SELECT COUNT(*) as c FROM expense_categories');
  const c = Number(count.rows[0][0]);
  if (c === 0) {
    const seeds = [
      ['Food & Dining', '🍜', '#10B981'],
      ['Transport', '🚌', '#3B82F6'],
      ['Groceries', '🛒', '#F59E0B'],
      ['Medical', '💊', '#EF4444'],
      ['Entertainment', '🎬', '#8B5CF6'],
      ['Utilities', '💡', '#6366F1'],
    ];
    for (const [name, emoji, color] of seeds) {
      await client.execute({
        sql: 'INSERT INTO expense_categories (name, emoji, color) VALUES (?, ?, ?)',
        args: [name, emoji, color]
      });
    }
  }

  const mode = process.env.TURSO_DATABASE_URL ? '☁️  Turso cloud' : '📁 local file';
  console.log(`✅ Database initialized (${mode})`);
}

function getDB() {
  return { prepare };
}

module.exports = { initDB, getDB };
