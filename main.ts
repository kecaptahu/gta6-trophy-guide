const { existsSync: f, copyFileSync: y, mkdirSync: g, readFileSync: b, readdirSync: S, statSync: x, writeFileSync: d } = require("node:fs");
const { join: s } = require("node:path");
const ms = require("path").resolve(__dirname);
const { boardIssue: j, buildRadar: A, dataScript: E, parseSnapshot: k } = require("./lib/model.ts");
const { buildDossier: F } = require("./vendor/makefun-board.ts");
const T = 65536;
const R = { max: 4, max_bytes: 524288 };
const U = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

function _(e, i) {
  const o = process.argv.indexOf(`--${e}`);
  if (o >= 0 && o + 1 < process.argv.length) return process.argv[o + 1];
  const r = process.argv.find((a) => a.startsWith(`--${e}=`));
  return r === void 0 ? i : r.slice(e.length + 3);
}

const h = _("input", "/input");
const p = h.endsWith(".json") ? h : s(h, "snapshot.json");
f(p) || (process.stderr.write(`token radar: no snapshot at ${p}: pass --input <snapshot.json|directory> or mount the sealed /input\n`), process.exit(2));

const t = _("output", process.env.MAKEFUN_OUTPUT_DIR ?? "/output");
const c = k(b(p, "utf8"));
const radar = A(c);
const l = radar.board;
const u = radar.radar;
let $ = j(l, c);
$!== null && (process.stderr.write(`token radar: the model wrote a board the gate refuses: ${$}\n`), process.exit(1));

g(t, { recursive: true });
d(s(t, "board.json"), `${JSON.stringify({ rows: l })}\n`);
d(s(t, "data.js"), E(u));

function w(e, i) {
  if (!f(e)) return [];
  g(i, { recursive: true });
  const o = [];
  for (const r of S(e)) {
    if (r.startsWith(".")) continue;
    const a = s(e, r);
    x(a).isFile() && (y(a, s(i, r)), o.push(r));
  }
  return o;
}

w(s(ms, "dashboard"), s(t, "dashboard"));

const n = w(s(ms, "screenshots"), s(t, "screenshots"));
n.length < 3 && (process.stderr.write(`token radar: screenshots/ holds ${n.length} image${n.length===1?"":"s"}: hand in 3, the board, a detail view and a filtered view\n`), process.exit(1));

for (const e of n) U.test(e) || (process.stderr.write(`token radar: screenshots/${e}: a name is letters, digits and . _ -, 1 to 128 characters\n`), process.exit(1));

d(s(t, "dossier.json"), F(t, { text_max_bytes: T, screenshots: R, dashboard: { max_files: 400, max_bytes: 4194304 } }));

process.stdout.write(`token radar: ${c.protocols.length} protocols, ${c.watchlist.length} on the watchlist, ${l.length} rows scored (${u.early_size} early, ${u.live_size} live set aside)\n`);