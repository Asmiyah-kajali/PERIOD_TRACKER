const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const bcrypt = require('bcryptjs');
const Database = require('better-sqlite3');
const cookieParser = require('cookie-parser');
const OpenAI = require('openai');

// Load local development settings without exposing them to browser code.
// Environment variables supplied by the host always take precedence.
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    const value = match[2].replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, '$1$2');
    process.env[match[1]] = value;
  }
}

const app = express();
const db = new Database(process.env.DB_PATH || path.join(__dirname, 'rythora.db'));
// Groq provides an OpenAI-compatible API; this client only runs on the server.
const groq = process.env.GROQ_API_KEY ? new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' }) : null;
db.pragma('journal_mode = WAL');
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL, age INTEGER, last_period TEXT,
    cycle_length INTEGER NOT NULL DEFAULT 28, period_length INTEGER NOT NULL DEFAULT 5,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS tracker_data (
    user_id INTEGER PRIMARY KEY, data TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, role TEXT NOT NULL, text TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

app.use(express.json({ limit: '32kb' }));
app.use(cookieParser());
app.use(express.static(__dirname, { index: 'login.html' }));
app.get('/healthz', (req, res) => res.status(200).json({ status: 'ok' }));

function publicUser(user) { return { id: user.id, name: user.name, email: user.email, age: user.age, lastPeriod: user.last_period, cycleLength: user.cycle_length, periodLength: user.period_length }; }
function createSession(userId, res) {
  const token = crypto.randomBytes(32).toString('hex');
  const expires = Date.now() + 1000 * 60 * 60 * 24 * 30;
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expires);
  res.cookie('rythora_session', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 24 * 30 });
}
function requireUser(req, res, next) {
  const session = db.prepare('SELECT user_id FROM sessions WHERE token = ? AND expires_at > ?').get(req.cookies.rythora_session, Date.now());
  if (!session) return res.status(401).json({ error: 'Please sign in to continue.' });
  req.userId = session.user_id; next();
}
function validProfile(data) { return data && data.name && data.email && data.password && data.password.length >= 8 && Number(data.age) >= 13 && Number(data.age) <= 100 && Number(data.cycleLength) >= 15 && Number(data.cycleLength) <= 60 && Number(data.periodLength) >= 1 && Number(data.periodLength) <= 14; }

app.post('/api/auth/signup', async (req, res) => {
  const data = req.body;
  if (!validProfile(data)) return res.status(400).json({ error: 'Check your details. Passwords must be at least 8 characters.' });
  const email = String(data.email).trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
  try {
    const passwordHash = await bcrypt.hash(data.password, 12);
    const result = db.prepare('INSERT INTO users (name,email,password_hash,age,last_period,cycle_length,period_length) VALUES (?,?,?,?,?,?,?)').run(String(data.name).trim(), email, passwordHash, Number(data.age), data.lastPeriod, Number(data.cycleLength), Number(data.periodLength));
    db.prepare('INSERT INTO tracker_data (user_id) VALUES (?)').run(result.lastInsertRowid);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    createSession(user.id, res); res.status(201).json({ user: publicUser(user) });
  } catch (error) { res.status(error.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 409 : 500).json({ error: error.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 'An account with that email already exists.' : 'Unable to create your account.' }); }
});
app.post('/api/auth/login', async (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(String(req.body.email || '').trim().toLowerCase());
  if (!user || !(await bcrypt.compare(String(req.body.password || ''), user.password_hash))) return res.status(401).json({ error: 'That email or password does not match.' });
  createSession(user.id, res); res.json({ user: publicUser(user) });
});
app.post('/api/auth/demo', async (req, res) => {
  let user = db.prepare('SELECT * FROM users WHERE email = ?').get('alex@rythora.app');
  if (!user) { const hash = await bcrypt.hash(crypto.randomBytes(20).toString('hex'), 12); const date = new Date(Date.now() - 17 * 86400000).toISOString().slice(0, 10); const r = db.prepare('INSERT INTO users (name,email,password_hash,age,last_period,cycle_length,period_length) VALUES (?,?,?,?,?,?,?)').run('Alex', 'alex@rythora.app', hash, 27, date, 28, 5); db.prepare('INSERT INTO tracker_data (user_id) VALUES (?)').run(r.lastInsertRowid); user = db.prepare('SELECT * FROM users WHERE id = ?').get(r.lastInsertRowid); }
  createSession(user.id, res); res.json({ user: publicUser(user) });
});
app.post('/api/auth/logout', requireUser, (req, res) => { db.prepare('DELETE FROM sessions WHERE token = ?').run(req.cookies.rythora_session); res.clearCookie('rythora_session'); res.status(204).end(); });
app.get('/api/auth/me', requireUser, (req, res) => { const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId); res.json({ user: publicUser(user) }); });
app.get('/api/data', requireUser, (req, res) => { const row = db.prepare('SELECT data FROM tracker_data WHERE user_id = ?').get(req.userId); res.json({ data: JSON.parse(row?.data || '{}') }); });
app.put('/api/data', requireUser, (req, res) => { const data = req.body.data; if (!data || typeof data !== 'object') return res.status(400).json({ error: 'Invalid tracker data.' }); db.prepare("INSERT INTO tracker_data (user_id,data,updated_at) VALUES (?,?,CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data,updated_at=CURRENT_TIMESTAMP").run(req.userId, JSON.stringify(data)); res.status(204).end(); });
app.put('/api/profile', requireUser, (req, res) => { const d = req.body; if (!d.name || Number(d.cycleLength) < 15 || Number(d.cycleLength) > 60 || Number(d.periodLength) < 1 || Number(d.periodLength) > 14) return res.status(400).json({ error: 'Invalid profile details.' }); db.prepare('UPDATE users SET name=?, age=?, last_period=?, cycle_length=?, period_length=? WHERE id=?').run(String(d.name).trim(), Number(d.age) || null, d.lastPeriod || null, Number(d.cycleLength), Number(d.periodLength), req.userId); res.status(204).end(); });
app.get('/api/chat', requireUser, (req, res) => res.json({ messages: db.prepare('SELECT role,text FROM chat_messages WHERE user_id=? ORDER BY id DESC LIMIT 20').all(req.userId).reverse() }));
app.delete('/api/chat', requireUser, (req, res) => { db.prepare('DELETE FROM chat_messages WHERE user_id=?').run(req.userId); res.status(204).end(); });
app.post('/api/chat', requireUser, (req, res) => { const m = req.body; if (!['user', 'bot'].includes(m.role) || typeof m.text !== 'string' || !m.text.trim() || m.text.length > 1200) return res.status(400).json({ error: 'Invalid message.' }); db.prepare('INSERT INTO chat_messages (user_id,role,text) VALUES (?,?,?)').run(req.userId, m.role, m.text.trim()); res.status(201).end(); });
app.post('/api/chat/message', requireUser, async (req, res) => {
  const message = String(req.body.message || '').trim();
  if (!message || message.length > 1000) return res.status(400).json({ error: 'Please enter a question of up to 1,000 characters.' });
  if (!groq) return res.status(503).json({ error: 'The AI chat is not configured yet. Add GROQ_API_KEY to the server environment and restart Rythora.' });
  const history = db.prepare('SELECT role,text FROM chat_messages WHERE user_id=? ORDER BY id DESC LIMIT 12').all(req.userId).reverse();
  db.prepare('INSERT INTO chat_messages (user_id,role,text) VALUES (?,?,?)').run(req.userId, 'user', message);
  try {
    const response = await groq.chat.completions.create({
      model: process.env.GROQ_MODEL || 'openai/gpt-oss-20b',
      max_tokens: 500,
      messages: [
        { role: 'system', content: 'You are Rythora, a warm, thoughtful period and cycle companion. Sound like a kind, knowledgeable friend—not a medical leaflet or a chatbot. Answer the person’s actual question first in plain, everyday language. Then offer 2–4 short, practical next steps when helpful. Use short paragraphs and simple bullet points with •; avoid jargon, disclaimers at the start, long lectures, and Markdown symbols. Acknowledge feelings naturally when the person sounds worried or uncomfortable. Ask only one gentle, specific follow-up question when it would make your guidance meaningfully more useful. Never shame the user. Give medically cautious general education, not diagnosis, and do not pretend to know facts they have not shared. Mention seeing a clinician only when appropriate. For severe pain, fainting/dizziness, very heavy bleeding, possible pregnancy with pain or bleeding, or thoughts of self-harm, clearly and calmly tell them to seek urgent local medical help. Keep most replies under 180 words.' },
        ...history.map((item) => ({ role: item.role === 'bot' ? 'assistant' : 'user', content: item.text })),
        { role: 'user', content: message }
      ]
    });
    const answer = response.choices[0]?.message?.content || 'I’m sorry, I could not generate a response. Please try again.';
    db.prepare('INSERT INTO chat_messages (user_id,role,text) VALUES (?,?,?)').run(req.userId, 'bot', answer);
    res.json({ answer });
  } catch (error) { console.error('Groq chat error:', error.message); res.status(502).json({ error: 'Rythora could not reach the AI service. Please try again shortly.' }); }
});

app.listen(process.env.PORT || 4173, () => console.log(`Rythora running at http://127.0.0.1:${process.env.PORT || 4173}`));
