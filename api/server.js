// Personal command-center API + static host for dave.mustimusik.id.
// Serves the dashboard AND the CRUD API over the personal Postgres (mm-personal-db),
// behind app-level session auth with per-user tab scoping (RBAC).
//   dave  -> all tabs        alex -> portfolio only        shofi -> networking only
const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
app.use(express.json({ limit: "1mb" }));

// ---- config ----
const STATIC_DIR = process.env.STATIC_DIR || "/app/static";
const USERS_FILE = process.env.USERS_FILE || "/app/users.json";
const SECRET = process.env.AUTH_SECRET || "dev-insecure-secret-change-me";
const COOKIE = "ccsid";
const MAXAGE = 30 * 24 * 3600; // 30 days

// users.json: { "email": { salt, hash, tabs:[...] }, ... }
let USERS = {};
function loadUsers() {
  try { USERS = JSON.parse(fs.readFileSync(USERS_FILE, "utf8")); }
  catch (e) { console.error("users load failed:", e.message); USERS = {}; }
}
loadUsers();

// ---- auth helpers ----
const b64u = (b) => Buffer.from(b).toString("base64url");
function sign(payload) {
  const body = b64u(JSON.stringify(payload));
  const mac = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${mac}`;
}
function verify(token) {
  if (!token || token.indexOf(".") < 0) return null;
  const [body, mac] = token.split(".");
  const good = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  if (mac.length !== good.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(good))) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (!p.exp || p.exp < Date.now() / 1000) return null;
    return p;
  } catch { return null; }
}
function checkPassword(email, pw) {
  const u = USERS[email];
  if (!u) return false;
  const h = crypto.scryptSync(pw, u.salt, 32).toString("hex");
  return h.length === u.hash.length && crypto.timingSafeEqual(Buffer.from(h), Buffer.from(u.hash));
}
function parseCookies(req) {
  const out = {};
  (req.headers.cookie || "").split(";").forEach((c) => {
    const i = c.indexOf("="); if (i < 0) return;
    out[c.slice(0, i).trim()] = decodeURIComponent(c.slice(i + 1).trim());
  });
  return out;
}
function currentUser(req) {
  const p = verify(parseCookies(req)[COOKIE]);
  if (!p) return null;
  const u = USERS[p.email];
  if (!u) return null;
  return { email: p.email, tabs: u.tabs || [] };
}
const hasTab = (u, tab) => u && Array.isArray(u.tabs) && u.tabs.includes(tab);

// ---- public auth endpoints ----
app.post("/api/login", (req, res) => {
  const email = String(req.body.email || "").trim().toLowerCase();
  const pw = String(req.body.password || "");
  if (!checkPassword(email, pw)) return res.status(401).json({ error: "Email atau password salah" });
  const token = sign({ email, exp: Math.floor(Date.now() / 1000) + MAXAGE });
  res.setHeader("Set-Cookie",
    `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${MAXAGE}`);
  res.json({ ok: true, email, tabs: USERS[email].tabs || [] });
});
app.post("/api/logout", (_req, res) => {
  res.setHeader("Set-Cookie", `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
  res.json({ ok: true });
});
app.get("/api/me", (req, res) => {
  const u = currentUser(req);
  if (!u) return res.status(401).json({ error: "not authenticated" });
  res.json(u);
});
app.get("/api/health", async (_req, res) => {
  try { await pool.query("SELECT 1"); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});

function calculateNextContact(lastContact, cadence) {
  if (!lastContact) return null;
  const parts = String(lastContact).split("-");
  if (parts.length !== 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  const d = new Date(year, month, day);
  if (isNaN(d.getTime())) return null;

  if (cadence === "Setiap minggu") {
    d.setDate(d.getDate() + 7);
  } else if (cadence === "Setiap bulan") {
    d.setMonth(d.getMonth() + 1);
  } else if (cadence === "Setiap 3 bulan") {
    d.setMonth(d.getMonth() + 3);
  } else if (cadence === "Setiap 6 bulan") {
    d.setMonth(d.getMonth() + 6);
  } else if (cadence === "Setiap tahun") {
    d.setFullYear(d.getFullYear() + 1);
  } else {
    return null;
  }
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const rDay = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${rDay}`;
}

// ---- CRUD (tab-gated) ----
const PORTFOLIO_COLS = ["date","account","type","symbol","quantity","price","amount","fee","fx_rate","currency","comment"];
const NUMERIC = new Set(["quantity","price","amount","fee","fx_rate"]);
const NET_COLS = ["name","category","role","location","how_can_i_help","how_can_they_help","wa","ig","birthday","descr","cadence","notes","last_contact","next_contact"];
const clean = (c, v) => {
  if (v === undefined || v === "") return null;
  if (NUMERIC.has(c) && v !== null) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return v;
};
function requireTab(tab) {
  return (req, res, next) => {
    const u = currentUser(req);
    if (!u) return res.status(401).json({ error: "not authenticated" });
    if (!hasTab(u, tab)) return res.status(403).json({ error: "forbidden" });
    next();
  };
}
function crud(table, cols) {
  const r = express.Router();
  r.get("/", async (_req, res) => {
    try { const q = await pool.query(`SELECT * FROM ${table} ORDER BY id DESC`); res.json(q.rows); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  r.post("/", async (req, res) => {
    try {
      const vals = cols.map((c) => clean(c, req.body[c]));
      const ph = cols.map((_, i) => `$${i + 1}`).join(",");
      const q = await pool.query(`INSERT INTO ${table} (${cols.join(",")}) VALUES (${ph}) RETURNING *`, vals);
      res.json(q.rows[0]);
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  r.put("/:id", async (req, res) => {
    try {
      const set = cols.map((c, i) => `${c}=$${i + 1}`).join(",");
      const vals = cols.map((c) => clean(c, req.body[c]));
      vals.push(req.params.id);
      const q = await pool.query(`UPDATE ${table} SET ${set}, updated_at=now() WHERE id=$${cols.length + 1} RETURNING *`, vals);
      res.json(q.rows[0] || {});
    } catch (e) { res.status(500).json({ error: e.message }); }
  });
  r.delete("/:id", async (req, res) => {
    try { await pool.query(`DELETE FROM ${table} WHERE id=$1`, [req.params.id]); res.json({ ok: true }); }
    catch (e) { res.status(500).json({ error: e.message }); }
  });
  return r;
}
app.use("/api/portfolio", requireTab("portfolio"), crud("portfolio", PORTFOLIO_COLS));
app.use("/api/networking", requireTab("networking"), (req, res, next) => {
  if (req.method === "POST" || req.method === "PUT") {
    req.body.next_contact = calculateNextContact(req.body.last_contact, req.body.cadence);
  }
  next();
}, crud("networking", NET_COLS));

// ---- static (auth + tab-gated) ----
// Which tab each personal data file belongs to (others = login required only).
const FILE_TAB = {
  "/data/profile.md": "who",
  "/data/drip.json": "who",
  "/data/expenses.json": "who",
  "/data/portfolio.json": "portfolio",
  "/data/networking.json": "networking",
  "/dashboards/portfolio_legacy.html": "portfolio",
};
const PUBLIC_PATHS = new Set(["/dashboards/login.html", "/favicon.ico"]);
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return next(); // APIs handle their own auth
  if (PUBLIC_PATHS.has(req.path)) return next();
  const u = currentUser(req);
  const wantsHtml = (req.headers.accept || "").includes("text/html");
  if (!u) {
    if (wantsHtml) return res.redirect(302, "/dashboards/login.html");
    return res.status(401).json({ error: "not authenticated" });
  }
  const tab = FILE_TAB[req.path];
  if (tab && !hasTab(u, tab)) return res.status(403).send("Forbidden");
  next();
});
app.use(express.static(STATIC_DIR, { extensions: ["html"] }));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`dave-api listening on ${PORT}`));
