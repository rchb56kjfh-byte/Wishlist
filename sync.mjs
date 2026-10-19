// Speichert die Wunschliste in Netlify Blobs und führt Änderungen mehrerer Geräte zusammen.
import { getStore } from "@netlify/blobs";

const J = (o, c = 200) =>
  new Response(JSON.stringify(o), {
    status: c,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });

function mergeList(a = [], b = []) {
  const m = new Map();
  for (const e of [...a, ...b]) {
    const o = m.get(e.id);
    if (!o || (e.u || 0) >= (o.u || 0)) m.set(e.id, e);
  }
  return [...m.values()];
}

export function merge(s, c) {
  const tomb = new Map();
  for (const t of [...(s.tomb || []), ...(c.tomb || [])])
    tomb.set(t.id, Math.max(tomb.get(t.id) || 0, t.u || 0));
  const alive = (l) => l.filter((e) => !(tomb.has(e.id) && tomb.get(e.id) >= (e.u || 0)));
  const pick = (k) => alive(mergeList(s[k], c[k]));
  const now = Date.now();
  return {
    cats: pick("cats"),
    items: pick("items"),
    friends: pick("friends"),
    tomb: [...tomb].map(([id, u]) => ({ id, u })).filter((t) => now - t.u < 90 * 864e5),
    budget: (c.bu || 0) >= (s.bu || 0) ? c.budget : s.budget,
    bu: Math.max(c.bu || 0, s.bu || 0),
    notes: (c.nu || 0) >= (s.nu || 0) ? c.notes : s.notes,
    nu: Math.max(c.nu || 0, s.nu || 0),
  };
}

export default async (req) => {
  const pw = Netlify.env.get("SYNC_PASSWORD");
  if (!pw) return J({ error: "SYNC_PASSWORD ist in Netlify nicht gesetzt" }, 500);
  if (req.headers.get("x-sync-key") !== pw) return J({ error: "Falsches Passwort" }, 401);
  const store = getStore("wishlist");
  const cur = await store.get("data", { type: "json" });
  if (req.method === "GET") return J({ state: cur || null });
  if (req.method === "PUT") {
    let c;
    try { c = (await req.json()).state; } catch (e) { return J({ error: "Ungültige Daten" }, 400); }
    if (!c || !Array.isArray(c.items)) return J({ error: "Ungültige Daten" }, 400);
    const m = cur ? merge(cur, c) : merge({}, c);
    await store.setJSON("data", m);
    return J({ state: m });
  }
  return J({ error: "Methode nicht erlaubt" }, 405);
};
