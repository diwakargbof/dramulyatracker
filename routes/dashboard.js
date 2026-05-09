const { getDB } = require('../db/database');

module.exports = async (req, res) => {
  try {
    const { prepare } = getDB();
    const today = new Date().toISOString().split('T')[0];
    const currentMonth = today.substring(0, 7);

    const [todayExp, monthExp, todayCal, goalRow, recentExp] = await Promise.all([
      prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE date = ?`).get(today),
      prepare(`SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE strftime('%Y-%m', date) = ?`).get(currentMonth),
      prepare(`
        SELECT COALESCE(SUM(mi.calories), 0) as calories,
               COALESCE(SUM(mi.protein), 0) as protein,
               COALESCE(SUM(mi.carbs), 0) as carbs,
               COALESCE(SUM(mi.fat), 0) as fat,
               COUNT(DISTINCT m.id) as meal_count
        FROM meal_items mi JOIN meals m ON m.id = mi.meal_id WHERE m.date = ?
      `).get(today),
      prepare("SELECT value FROM settings WHERE key = 'calorie_goal'").get(),
      prepare(`
        SELECT e.id, e.amount, e.description, e.date,
               c.name as category_name, c.emoji as category_emoji, c.color as category_color
        FROM expenses e JOIN expense_categories c ON c.id = e.category_id
        ORDER BY e.date DESC, e.created_at DESC LIMIT 5
      `).all()
    ]);

    res.json({
      today_expenses: todayExp?.total || 0,
      month_expenses: monthExp?.total || 0,
      today_calories: todayCal?.calories || 0,
      today_protein: todayCal?.protein || 0,
      today_carbs: todayCal?.carbs || 0,
      today_fat: todayCal?.fat || 0,
      meal_count: todayCal?.meal_count || 0,
      calorie_goal: parseInt(goalRow?.value || 2000),
      recent_expenses: recentExp || []
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
};
