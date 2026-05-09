const express = require('express');
const router = express.Router();
const { getDB } = require('../db/database');

const err = (res, e) => res.status(500).json({ error: e.message });

router.get('/categories', async (req, res) => {
  try {
    const { prepare } = getDB();
    const cats = await prepare(`
      SELECT c.id, c.name, c.emoji, c.color,
             COALESCE(SUM(e.amount), 0) as total_spent,
             COUNT(e.id) as expense_count
      FROM expense_categories c
      LEFT JOIN expenses e ON e.category_id = c.id
      GROUP BY c.id ORDER BY c.name
    `).all();
    res.json(cats);
  } catch(e) { err(res, e); }
});

router.post('/categories', async (req, res) => {
  try {
    const { prepare } = getDB();
    const { name, emoji = '💰', color = '#6366F1' } = req.body;
    if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
    const result = await prepare('INSERT INTO expense_categories (name, emoji, color) VALUES (?, ?, ?)').run(name.trim(), emoji, color);
    res.json({ id: result.lastInsertRowid, name, emoji, color });
  } catch(e) { err(res, e); }
});

router.delete('/categories/:id', async (req, res) => {
  try {
    const { prepare } = getDB();
    await prepare('DELETE FROM expenses WHERE category_id = ?').run(req.params.id);
    await prepare('DELETE FROM expense_categories WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { err(res, e); }
});

router.get('/stats', async (req, res) => {
  try {
    const { prepare } = getDB();
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = today.substring(0, 7);

    const [monthTotal, todayTotal, byCategory, last7raw, last6Months] = await Promise.all([
      prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE strftime('%Y-%m', date) = ?`).get(currentMonth),
      prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date = ?`).get(today),
      prepare(`
        SELECT c.name, c.emoji, c.color, COALESCE(SUM(e.amount), 0) as total
        FROM expense_categories c
        LEFT JOIN expenses e ON e.category_id = c.id AND strftime('%Y-%m', e.date) = ?
        GROUP BY c.id ORDER BY total DESC
      `).all(currentMonth),
      prepare(`
        SELECT date, COALESCE(SUM(amount), 0) as total
        FROM expenses WHERE date >= date('now', '-6 days')
        GROUP BY date ORDER BY date
      `).all(),
      prepare(`
        SELECT strftime('%Y-%m', date) as month, COALESCE(SUM(amount), 0) as total
        FROM expenses WHERE date >= date('now', '-6 months')
        GROUP BY month ORDER BY month
      `).all()
    ]);

    const days7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      const found = last7raw.find(x => x.date === ds);
      days7.push({ date: ds, total: found ? found.total : 0 });
    }

    res.json({ month_total: monthTotal?.total || 0, today_total: todayTotal?.total || 0, by_category: byCategory, last_7_days: days7, last_6_months: last6Months });
  } catch(e) { err(res, e); }
});

router.get('/', async (req, res) => {
  try {
    const { prepare } = getDB();
    const { date, month, category_id, limit = 50 } = req.query;
    let where = [], params = [];
    if (date) { where.push('e.date = ?'); params.push(date); }
    if (month) { where.push("strftime('%Y-%m', e.date) = ?"); params.push(month); }
    if (category_id) { where.push('e.category_id = ?'); params.push(category_id); }
    params.push(parseInt(limit));

    const rows = await prepare(`
      SELECT e.id, e.category_id, e.amount, e.description, e.date,
             c.name as category_name, c.emoji as category_emoji, c.color as category_color
      FROM expenses e JOIN expense_categories c ON c.id = e.category_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY e.date DESC, e.created_at DESC LIMIT ?
    `).all(...params);
    res.json(rows);
  } catch(e) { err(res, e); }
});

router.post('/', async (req, res) => {
  try {
    const { prepare } = getDB();
    const { category_id, amount, description, date } = req.body;
    if (!category_id || !amount) return res.status(400).json({ error: 'category_id and amount required' });
    const expDate = date || new Date().toISOString().split('T')[0];
    const result = await prepare('INSERT INTO expenses (category_id, amount, description, date) VALUES (?, ?, ?, ?)').run(category_id, parseFloat(amount), description || '', expDate);
    res.json({ id: result.lastInsertRowid });
  } catch(e) { err(res, e); }
});

router.delete('/:id', async (req, res) => {
  try {
    const { prepare } = getDB();
    await prepare('DELETE FROM expenses WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { err(res, e); }
});

module.exports = router;
