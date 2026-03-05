const express = require('express');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const rateLimit = require('express-rate-limit');

require('dotenv').config({ path: path.join(__dirname, '.env') });

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── Rate Limiter — 10 concept generations per IP per hour ───────────────────
const generateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '10 briefs/hour limit reached. Franky needs a break — try again later.' },
});

// ─── Giphy Trending Searches Proxy ──────────────────────────────────────────
app.get('/api/giphy/trending-searches', async (req, res) => {
  const apiKey = process.env.GIPHY_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'GIPHY_API_KEY not configured on server' });
  }

  try {
    const response = await axios.get('https://api.giphy.com/v1/trending/searches', {
      params: { api_key: apiKey },
      timeout: 8000,
    });
    res.json(response.data);
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data?.message || 'Failed to fetch trending searches';
    res.status(status).json({ error: message });
  }
});

// ─── Franky GIF Concept Generation ───────────────────────────────────────────
app.post('/api/generate-concept', generateLimiter, async (req, res) => {
  const { topic } = req.body;

  if (!topic || !topic.trim()) {
    return res.status(400).json({ error: 'Topic is required' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY not set in server .env — add it and restart',
    });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are the creative director for Franky the Frog, a brand with a loyal following. The mascot "Franky" is a cool cartoon frog with big expressive eyes, a wide grin, and vibrant green skin. Franky embodies the brand — always current, always fun, perpetually chill.

Brand voice rules:
- Playful, never forced
- Confident but not arrogant
- Meme-aware, self-aware
- Short punchy captions that land
- Keep it fun and on-brand

You generate GIF creative briefs for Franky. Each brief tells an animator exactly what to make.`;

  const userPrompt = `Generate a GIF brief for Franky based on this trending topic: "${topic.trim()}"

Return ONLY valid JSON with no markdown fences, no extra text — just the raw JSON object:
{
  "pose": "Specific body pose and expression for Franky — be visual and precise (1-2 sentences)",
  "animation": "Describe what moves and how in the GIF — body parts, timing, loop behavior (2-3 sentences)",
  "caption": "6 words max. lowercase. fun energy. make it land.",
  "hashtags": ["#FrankyTheFrog", "#Franky", "#ThirdTag", "#FourthTag", "#FifthTag"],
  "giphyTags": ["tag1", "tag2", "tag3", "tag4", "tag5", "tag6"],
  "postTiming": "Best day + time to post with a 1-sentence reason"
}`;

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = message.content[0].text;

    // Extract JSON (handles any accidental surrounding text)
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Could not parse response as JSON');

    const concept = JSON.parse(match[0]);

    // Validate required fields
    const required = ['pose', 'animation', 'caption', 'hashtags', 'giphyTags', 'postTiming'];
    for (const field of required) {
      if (!concept[field]) throw new Error(`Missing field in response: ${field}`);
    }

    res.json({ concept, topic: topic.trim() });
  } catch (err) {
    console.error('Concept generation error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to generate concept' });
  }
});

// ─── TikTok Trending Hashtags Proxy ──────────────────────────────────────────
app.get('/api/tiktok/trending', async (req, res) => {
  const apiKey = (process.env.RAPIDAPI_KEY || '').trim();

  if (!apiKey || apiKey === 'your_rapidapi_key_here') {
    return res.status(500).json({ error: 'RAPIDAPI_KEY not configured. Add it to .env and Railway Variables.' });
  }

  try {
    const response = await axios.get('https://tiktok-api23.p.rapidapi.com/api/post/trending', {
      params: { count: '30' },
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': 'tiktok-api23.p.rapidapi.com',
      },
      timeout: 10000,
    });

    const rawData = response.data;

    // Extract unique hashtags/challenges from trending posts
    const seen = new Set();
    const trends = [];

    const items = rawData?.itemList || rawData?.data?.itemList || rawData?.data || [];

    for (const post of items) {
      // Pull from challenges array on each post
      const challenges = post.challenges || post.textExtra || [];
      for (const c of challenges) {
        const tag = c.title || c.hashtagName || c.name;
        if (tag && !seen.has(tag.toLowerCase())) {
          seen.add(tag.toLowerCase());
          trends.push(tag);
        }
      }
    }

    // Fallback: if no challenges found, return post descriptions as topics
    if (!trends.length && items.length) {
      items.slice(0, 20).forEach((post) => {
        const desc = post.desc || '';
        const tags = [...desc.matchAll(/#(\w+)/g)].map((m) => m[1]);
        tags.forEach((t) => {
          if (!seen.has(t.toLowerCase())) {
            seen.add(t.toLowerCase());
            trends.push(t);
          }
        });
      });
    }

    res.json({ data: trends.slice(0, 30) });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data?.message || err.message || 'Failed to fetch TikTok trending';
    res.status(status).json({ error: message });
  }
});

// ─── TikTok Video Concept Generation ─────────────────────────────────────────
app.post('/api/tiktok/generate-concept', generateLimiter, async (req, res) => {
  const { topic } = req.body;

  if (!topic || !topic.trim()) {
    return res.status(400).json({ error: 'Topic is required' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({
      error: 'ANTHROPIC_API_KEY not set in server .env — add it and restart',
    });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are the creative director for Franky the Frog, a brand with a loyal following. The mascot "Franky" is a cool cartoon frog with big expressive eyes, a wide grin, and vibrant green skin. Franky embodies the brand — always current, always fun, perpetually chill.

Brand voice rules:
- Playful, never forced
- Confident but not arrogant
- Meme-aware, self-aware
- Short punchy captions that land
- Keep it fun and on-brand

You generate TikTok video briefs for Franky. Each brief tells a creator or animator exactly what to film/produce.`;

  const cleanTopic = topic.trim().replace(/^#/, '');
  const userPrompt = `Generate a TikTok video brief for Franky based on this trending topic/hashtag: "#${cleanTopic}"

Return ONLY valid JSON with no markdown fences, no extra text — just the raw JSON object:
{
  "hook": "The first 3 seconds — specific action/text/visual that stops the scroll (1-2 sentences)",
  "concept": "Full video concept — what happens throughout, pacing, key moments (2-4 sentences)",
  "sound": "Exact sound recommendation — trending audio name/style or original audio with brief note on why it fits",
  "caption": "8 words max. lowercase. tiktok energy. make it viral.",
  "hashtags": ["#FrankyTheFrog", "#Franky", "#ThirdTag", "#FourthTag", "#FifthTag", "#SixthTag"],
  "format": "Video format (e.g. POV, Storytime, Tutorial, Day in the Life, Reaction, Duet, Stitch, Green Screen)",
  "postTiming": "Best day + time to post with a 1-sentence reason"
}`;

  try {
    const message = await client.messages.create({
      model: 'claude-opus-4-6',
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const raw = message.content[0].text;

    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Could not parse response as JSON');

    const concept = JSON.parse(match[0]);

    const required = ['hook', 'concept', 'sound', 'caption', 'hashtags', 'format', 'postTiming'];
    for (const field of required) {
      if (!concept[field]) throw new Error(`Missing field in response: ${field}`);
    }

    res.json({ concept, topic: cleanTopic });
  } catch (err) {
    console.error('TikTok concept generation error:', err.message);
    res.status(500).json({ error: err.message || 'Failed to generate TikTok concept' });
  }
});

// ─── Publish — Platform Status Check ─────────────────────────────────────────
app.get('/api/publish/status', (req, res) => {
  res.json({
    giphy:     !!process.env.GIPHY_UPLOAD_KEY,
    instagram: !!process.env.INSTAGRAM_ACCESS_TOKEN,
    tiktok:    !!process.env.TIKTOK_ACCESS_TOKEN,
    youtube:   !!process.env.YOUTUBE_REFRESH_TOKEN,
  });
});

// ─── Publish — Platform Stubs (real logic added per key) ─────────────────────
app.post('/api/publish/giphy', async (req, res) => {
  if (!process.env.GIPHY_UPLOAD_KEY) {
    return res.status(503).json({ status: 'pending', message: 'GIPHY_UPLOAD_KEY not configured — production key pending approval' });
  }
  // TODO: implement Giphy upload with form-data + GIPHY_UPLOAD_KEY
  res.json({ status: 'ok', url: null });
});

app.post('/api/publish/instagram', async (req, res) => {
  if (!process.env.INSTAGRAM_ACCESS_TOKEN) {
    return res.status(503).json({ status: 'pending', message: 'INSTAGRAM_ACCESS_TOKEN not configured' });
  }
  // TODO: implement Meta Graph API media create + publish
  res.json({ status: 'ok', id: null });
});

app.post('/api/publish/tiktok', async (req, res) => {
  if (!process.env.TIKTOK_ACCESS_TOKEN) {
    return res.status(503).json({ status: 'pending', message: 'TIKTOK_ACCESS_TOKEN not configured — app approval pending' });
  }
  // TODO: implement TikTok Content Posting API
  res.json({ status: 'ok', share_id: null });
});

app.post('/api/publish/youtube', async (req, res) => {
  if (!process.env.YOUTUBE_REFRESH_TOKEN) {
    return res.status(503).json({ status: 'pending', message: 'YOUTUBE_REFRESH_TOKEN not configured' });
  }
  // TODO: implement YouTube Data API v3 videos.insert
  res.json({ status: 'ok', video_id: null });
});

app.listen(PORT, () => {
  console.log(`🐸  The GIF Pond → http://localhost:${PORT}`);
});
