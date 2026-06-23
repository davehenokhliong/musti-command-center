// Personal command-center API — CRUD over the personal Postgres (mm-personal-db).
// Sits behind dave.mustimusik.id basic-auth (Traefik), same-origin under /api.
const express = require("express");
const { Pool } = require("pg");

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const app = express();
app.use(express.json({ limit: "1mb" }));

const PORTFOLIO_COLS = ["date","account","type","symbol","quantity","price","amount","fee","fx_rate","currency","comment"];
const NUMERIC = new Set(["quantity","price","amount","fee","fx_rate"]);
const NET_COLS = ["name","category","role","company","location","help","opportunity","industry","ig","tiktok","wa","fu","reach_out","fu_date","notes","descr"];

const clean = (c, v) => {
  if (v === undefined || v === "") return null;
  if (NUMERIC.has(c) && v !== null) { const n = Number(v); return Number.isFinite(n) ? n : null; }
  return v;
};

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

app.get("/api/health", async (_req, res) => {
  try { await pool.query("SELECT 1"); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});
app.use("/api/portfolio", crud("portfolio", PORTFOLIO_COLS));
app.use("/api/networking", crud("networking", NET_COLS));

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`dave-api listening on ${PORT}`));
