const express = require('express');
const router = express.Router();

let anthropic = null;
try {
  const Anthropic = require('@anthropic-ai/sdk');
  if (process.env.ANTHROPIC_API_KEY) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
} catch (e) {}

router.post('/analyze-food', async (req, res) => {
  const { food } = req.body;
  if (!food?.trim()) return res.status(400).json({ error: 'food required' });

  if (!anthropic) {
    // Fallback mock data when API key not configured
    return res.json({
      name: food,
      serving: '1 serving (estimated)',
      calories: 250,
      protein: 10,
      carbs: 30,
      fat: 8,
      fiber: 3,
      note: 'Estimated — add ANTHROPIC_API_KEY for accurate data'
    });
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content: `You are a nutrition database. Analyze this food item and return ONLY a valid JSON object — no explanation, no markdown, just raw JSON.

Food: "${food.trim()}"

Return this exact JSON structure:
{"name":"food name","serving":"typical serving size description","calories":number,"protein":number,"carbs":number,"fat":number,"fiber":number}

All macro values should be in grams. Calories as a whole number. Base on a standard single serving.`
      }]
    });

    const text = message.content[0].text.trim();
    // Strip any potential markdown code blocks
    const clean = text.replace(/^```json?\n?/, '').replace(/\n?```$/, '').trim();
    const data = JSON.parse(clean);
    res.json(data);
  } catch (err) {
    console.error('AI analyze error:', err.message);
    res.status(500).json({ error: 'Failed to analyze food item' });
  }
});

module.exports = router;
