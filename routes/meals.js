const express = require('express');
const router = express.Router();
const { getDB } = require('../db/database');

const err = (res, e) => res.status(500).json({ error: e.message });

router.get('/', async (req, res) => {
  try {
    const { prepare } = getDB();
    const date = req.query.date || new Date().toISOString().split('T')[0];

    const [meals, items] = await Promise.all([
      prepare(`
        SELECT m.id, m.type, m.date, m.notes,
               COALESCE(SUM(mi.calories), 0) as total_calories,
               COALESCE(SUM(mi.protein), 0) as total_protein,
               COALESCE(SUM(mi.carbs), 0) as total_carbs,
               COALESCE(SUM(mi.fat), 0) as total_fat
        FROM meals m LEFT JOIN meal_items mi ON mi.meal_id = m.id
        WHERE m.date = ? GROUP BY m.id
        ORDER BY CASE m.type WHEN 'breakfast' THEN 1 WHEN 'lunch' THEN 2 WHEN 'dinner' THEN 3 ELSE 4 END
      `).all(date),
      prepare(`
        SELECT mi.* FROM meal_items mi
        JOIN meals m ON m.id = mi.meal_id WHERE m.date = ?
      `).all(date)
    ]);

    res.json(meals.map(m => ({ ...m, items: items.filter(i => i.meal_id === m.id) })));
  } catch(e) { err(res, e); }
});

router.post('/', async (req, res) => {
  try {
    const { prepare } = getDB();
    const { type, date, notes } = req.body;
    if (!type) return res.status(400).json({ error: 'type required' });
    const mealDate = date || new Date().toISOString().split('T')[0];
    const result = await prepare('INSERT INTO meals (type, date, notes) VALUES (?, ?, ?)').run(type, mealDate, notes || '');
    res.json({ id: result.lastInsertRowid, type, date: mealDate });
  } catch(e) { err(res, e); }
});

router.delete('/:id', async (req, res) => {
  try {
    const { prepare } = getDB();
    await prepare('DELETE FROM meal_items WHERE meal_id = ?').run(req.params.id);
    await prepare('DELETE FROM meals WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { err(res, e); }
});

router.post('/:id/items', async (req, res) => {
  try {
    const { prepare } = getDB();
    const { name, calories = 0, protein = 0, carbs = 0, fat = 0, fiber = 0, serving = '1 serving' } = req.body;
    if (!name) return res.status(400).json({ error: 'name required' });
    const result = await prepare(
      'INSERT INTO meal_items (meal_id, name, calories, protein, carbs, fat, fiber, serving) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(req.params.id, name, calories, protein, carbs, fat, fiber, serving);
    res.json({ id: result.lastInsertRowid, name, calories, protein, carbs, fat, fiber, serving });
  } catch(e) { err(res, e); }
});

router.delete('/items/:id', async (req, res) => {
  try {
    const { prepare } = getDB();
    await prepare('DELETE FROM meal_items WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch(e) { err(res, e); }
});

router.get('/stats', async (req, res) => {
  try {
    const { prepare } = getDB();
    const today = new Date().toISOString().split('T')[0];

    const [todayStats, last7raw, goalRow] = await Promise.all([
      prepare(`
        SELECT COALESCE(SUM(mi.calories), 0) as calories,
               COALESCE(SUM(mi.protein), 0) as protein,
               COALESCE(SUM(mi.carbs), 0) as carbs,
               COALESCE(SUM(mi.fat), 0) as fat
        FROM meal_items mi JOIN meals m ON m.id = mi.meal_id WHERE m.date = ?
      `).get(today),
      prepare(`
        SELECT m.date, COALESCE(SUM(mi.calories), 0) as calories
        FROM meals m LEFT JOIN meal_items mi ON mi.meal_id = m.id
        WHERE m.date >= date('now', '-6 days')
        GROUP BY m.date ORDER BY m.date
      `).all(),
      prepare("SELECT value FROM settings WHERE key = 'calorie_goal'").get()
    ]);

    const days7 = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      const found = last7raw.find(x => x.date === ds);
      days7.push({ date: ds, calories: found ? found.calories : 0 });
    }

    res.json({ today: todayStats, calorie_goal: parseInt(goalRow?.value || 2000), last_7_days: days7 });
  } catch(e) { err(res, e); }
});

router.put('/settings', async (req, res) => {
  try {
    const { prepare } = getDB();
    const { calorie_goal } = req.body;
    if (calorie_goal) await prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('calorie_goal', ?)").run(String(calorie_goal));
    res.json({ ok: true });
  } catch(e) { err(res, e); }
});

module.exports = router;
