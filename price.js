// Liest den aktuellen Preis einer Produktseite aus (JSON-LD, Meta-Tags, itemprop).
const H = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
const out = (code, obj) => ({ statusCode: code, headers: H, body: JSON.stringify(obj) });

function toNum(v) {
  if (v == null) return null;
  let s = String(v).replace(/[^\d.,]/g, '');
  if (!s) return null;
  const c = s.lastIndexOf(','), d = s.lastIndexOf('.');
  if (c > -1 && d > -1) s = c > d ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (c > -1) s = s.replace(',', '.');
  else if (d > -1 && /\.\d{3}$/.test(s) && (s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  const n = parseFloat(s);
  return n > 0 && isFinite(n) ? n : null;
}

function fromOffers(o) {
  if (!o) return null;
  if (Array.isArray(o)) {
    const l = o.map(fromOffers).filter(Boolean);
    return l.length ? Math.min(...l) : null;
  }
  return toNum(o.price) || toNum(o.lowPrice) || toNum(o.priceSpecification && o.priceSpecification.price) || fromOffers(o.offers);
}

function walk(n) {
  if (!n || typeof n !== 'object') return null;
  if (Array.isArray(n)) { for (const x of n) { const r = walk(x); if (r) return r; } return null; }
  if (n.offers) { const r = fromOffers(n.offers); if (r) return r; }
  for (const k of Object.keys(n)) { const r = walk(n[k]); if (r) return r; }
  return null;
}

function fromJsonLd(html) {
  const re = /<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try { const r = walk(JSON.parse(m[1].trim())); if (r) return r; } catch (e) {}
  }
  return null;
}

function fromMeta(html) {
  const pats = [
    /<meta[^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount|twitter:data1)["'][^>]*content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:product:price:amount|og:price:amount)["']/i,
    /itemprop=["']price["'][^>]*content=["']([^"']+)["']/i,
    /content=["']([^"']+)["'][^>]*itemprop=["']price["']/i,
  ];
  for (const p of pats) { const m = html.match(p); const n = m && toNum(m[1]); if (n) return n; }
  return null;
}

exports.handler = async (event) => {
  let u;
  try {
    u = new URL((event.queryStringParameters || {}).url);
    if (!/^https?:$/.test(u.protocol)) throw 0;
  } catch (e) { return out(400, { error: 'Ungültiger Link' }); }
  if (/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|0\.|\[)/i.test(u.hostname))
    return out(400, { error: 'Nicht erlaubt' });
  try {
    const r = await fetch(u, {
      redirect: 'follow',
      signal: AbortSignal.timeout(8000),
      headers: {
        'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        'accept-language': 'de-DE,de;q=0.9',
        accept: 'text/html,application/xhtml+xml',
      },
    });
    const html = (await r.text()).slice(0, 1500000);
    const price = fromJsonLd(html) || fromMeta(html);
    return out(200, { price: price || null, status: r.status });
  } catch (e) { return out(200, { price: null, error: 'Abruf fehlgeschlagen' }); }
};
