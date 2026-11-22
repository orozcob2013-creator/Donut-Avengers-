const express = require("express");
const session = require("express-session");
const SQLiteStore = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const crypto = require("crypto");
const path = require("path");

const app = express();
const db = new SQLiteStore(path.join(__dirname, "donut-avengers.sqlite"));
const PORT = process.env.PORT || 3000;
const SESSION_SECRET = process.env.SESSION_SECRET;

if (!SESSION_SECRET) {
  console.error("Set SESSION_SECRET to a long random secret before starting.");
  process.exit(1);
}

db.pragma("journal_mode = WAL");
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    balance INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    kind TEXT NOT NULL CHECK(kind IN ('deposit','withdraw')),
    amount INTEGER NOT NULL,
    minecraft_name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    kind TEXT NOT NULL,
    amount INTEGER NOT NULL,
    note TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: "20kb" }));
app.use(session({
  name: "donut.sid",
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24
  }
}));
app.use(express.static(path.join(__dirname, "public")));

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 20 });
const gameLimiter = rateLimit({ windowMs: 60 * 1000, limit: 30 });

function requireUser(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: "Please sign in first." });
  next();
}
function validAmount(n) {
  return Number.isSafeInteger(n) && n >= 10000 && n <= 1000000000;
}
function publicUser(id) {
  return db.prepare("SELECT id, username, balance FROM users WHERE id = ?").get(id);
}

app.post("/api/signup", authLimiter, async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ error: "Username must be 3–20 letters, numbers, or underscores." });
  }
  if (password.length < 8 || password.length > 100) {
    return res.status(400).json({ error: "Password must be at least 8 characters." });
  }
  try {
    const hash = await bcrypt.hash(password, 12);
    const result = db.prepare("INSERT INTO users(username,password_hash) VALUES(?,?)").run(username, hash);
    req.session.userId = Number(result.lastInsertRowid);
    res.json({ user: publicUser(req.session.userId) });
  } catch {
    res.status(409).json({ error: "That username is already taken." });
  }
});

app.post("/api/login", authLimiter, async (req, res) => {
  const username = String(req.body.username || "").trim();
  const password = String(req.body.password || "");
  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username);
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Incorrect username or password." });
  }
  req.session.userId = user.id;
  res.json({ user: publicUser(user.id) });
});

app.post("/api/logout", (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get("/api/me", requireUser, (req, res) => {
  res.json({ user: publicUser(req.session.userId) });
});

app.get("/api/transactions", requireUser, (req, res) => {
  const rows = db.prepare(
    "SELECT kind, amount, note, created_at FROM transactions WHERE user_id = ? ORDER BY id DESC LIMIT 20"
  ).all(req.session.userId);
  res.json({ transactions: rows });
});

// Manual request queue only. This does NOT verify Minecraft payments or send /pay commands.
app.post("/api/request", requireUser, (req, res) => {
  const kind = req.body.kind;
  const amount = Number(req.body.amount);
  const minecraftName = String(req.body.minecraftName || "").trim();
  if (!["deposit", "withdraw"].includes(kind) || !validAmount(amount)) {
    return res.status(400).json({ error: "Choose a valid request and an amount of at least 10,000 coins." });
  }
  if (!/^[A-Za-z0-9_]{3,16}$/.test(minecraftName)) {
    return res.status(400).json({ error: "Enter a valid Minecraft username (3–16 characters)." });
  }
  const user = publicUser(req.session.userId);
  if (kind === "withdraw" && user.balance < amount) {
    return res.status(400).json({ error: "You don't have enough coins for that withdrawal request." });
  }
  if (kind === "withdraw") {
    db.prepare("UPDATE users SET balance = balance - ? WHERE id = ?").run(amount, user.id);
    db.prepare("INSERT INTO transactions(user_id,kind,amount,note) VALUES(?,?,?,?)")
      .run(user.id, "withdraw_hold", -amount, "Coins held for pending withdrawal review");
  }
  db.prepare("INSERT INTO requests(user_id,kind,amount,minecraft_name) VALUES(?,?,?,?)")
    .run(user.id, kind, amount, minecraftName);
  res.json({ user: publicUser(user.id), message: "Request submitted for manual review." });
});

// Virtual-coin game: server chooses outcome. No real-money deposits or prizes.
app.post("/api/coinflip", requireUser, gameLimiter, (req, res) => {
  const amount = Number(req.body.amount);
  if (!validAmount(amount)) return res.status(400).json({ error: "Minimum bet is 10,000 coins." });
  const user = publicUser(req.session.userId);
  if (user.balance < amount) return res.status(400).json({ error: "Not enough coins." });

  const won = crypto.randomInt(0, 100) < 43;
  const delta = won ? amount : -amount;
  db.prepare("UPDATE users SET balance = balance + ? WHERE id = ?").run(delta, user.id);
  db.prepare("INSERT INTO transactions(user_id,kind,amount,note) VALUES(?,?,?,?)")
    .run(user.id, "coinflip", delta, won ? "Virtual coinflip win" : "Virtual coinflip loss");
  res.json({ won, delta, user: publicUser(user.id) });
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});
app.listen(PORT, () => console.log(`Donut Avengers running on port ${PORT}`));
