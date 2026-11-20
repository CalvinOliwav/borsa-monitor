import { INSTRUMENTS } from "./lib/instruments.mjs";
import { isMarketOpen, romeDay } from "./lib/bi.mjs";
import { calcAll, envSettings } from "./lib/calc.mjs";
import { collect, store, getAlerts, saveAlerts, sendTelegram, getInstruments, saveInstruments } from "./lib/collect.mjs";

const KINDS = ["etf", "btp", "btpi", "bond", "stock"];
const NUM_FIELDS = ["coupon", "freq", "indexRatio", "ter", "entry", "duration", "ytm", "taxRate"];
const round3 = (n) => Math.round(n * 1000) / 1000;

// Parametri facoltativi di calcolo di ogni titolo (cedola, scadenza, TER, duration, ecc.)
function cleanParams(x, n) {
  const o = {};
  for (const k of NUM_FIELDS) {
    const v = x[k];
    if (v === null || v === undefined || v === "") continue;
    const nv = Number(v);
    if (!Number.isFinite(nv) || (nv < 0 && k !== "ytm")) throw new Error(`Riga ${n + 1}: valore non valido per ${k}`);
    o[k] = nv;
  }
  if (o.freq != null && ![1, 2, 4].includes(o.freq)) throw new Error(`Riga ${n + 1}: frequenza cedole non valida (1, 2 o 4)`);
  if (x.maturity) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(x.maturity)) throw new Error(`Riga ${n + 1}: scadenza non valida`);
    o.maturity = x.maturity;
  }
  if (x.etfClass) {
    if (!["equity", "bond"].includes(x.etfClass)) throw new Error(`Riga ${n + 1}: classe ETF non valida`);
    o.etfClass = x.etfClass;
  }
  if (x.url) {
    if (!String(x.url).startsWith("https://www.borsaitaliana.it/")) throw new Error(`Riga ${n + 1}: l'URL deve iniziare con https://www.borsaitaliana.it/`);
    o.url = String(x.url).trim();
  }
  return o;
}

const json = (o, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export default async (req) => {
  const key = process.env.APP_KEY;
  if (key && req.headers.get("x-app-key") !== key) return json({ error: "non autorizzato" }, 401);

  const url = new URL(req.url);
  const route = url.pathname.replace(/^\/api\/?/, "");
  const s = store();

  try {
    if (route === "data" && req.method === "GET") {
      const list = await getInstruments();
      let latest = await s.get("latest", { type: "json" });
      const age = latest ? Date.now() - new Date(latest.t).getTime() : Infinity;
      const st = (await s.get("settings", { type: "json" })) || {};
      const rf = url.searchParams.get("refresh");
      const force = (rf === "1" && age > 20000) || rf === "force";
      const missing = latest && list.some((i) => !(i.id in latest.quotes));
      if (!latest || force || missing) latest = await collect();
      const series = (await s.get("series-" + romeDay(), { type: "json" })) || {};
      return json({ threshold: Number(process.env.PRICE_ALERT_DELTA) || 0.04, lockTargets: st.lockTargets !== false, settings: envSettings(), calc: calcAll(list, latest.quotes), instruments: list, total: list.reduce((t, i) => t + i.amount, 0), latest, series, alerts: await getAlerts(), marketOpen: isMarketOpen() });
    }

    if (route === "alerts" && req.method === "POST") {
      const b = await req.json();
      const price = Number(b.price);
      if (!(await getInstruments()).some((i) => i.id === b.id) || !["above", "below"].includes(b.cond) || !(price > 0))
        return json({ error: "dati non validi" }, 400);
      const alerts = await getAlerts();
      alerts.push({ aid: crypto.randomUUID(), id: b.id, cond: b.cond, price, active: true, created: new Date().toISOString() });
      await saveAlerts(alerts);
      return json({ alerts });
    }

    if (route === "instruments" && req.method === "GET") {
      return json({ instruments: await getInstruments() });
    }

    if (route === "instruments/replace" && req.method === "POST") {
      const b = await req.json();
      const old = await getInstruments();
      const items = Array.isArray(b.instruments) ? b.instruments : [];
      if (!items.length) return json({ error: "La tabella è vuota" }, 400);
      if (items.length > 40) return json({ error: "Massimo 40 titoli" }, 400);
      const seen = new Set();
      const list = [];
      for (const [n, x] of items.entries()) {
        const isin = String(x.isin || "").trim().toUpperCase();
        const ticker = String(x.ticker || "").trim();
        const group = String(x.group || "").trim();
        if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return json({ error: `Riga ${n + 1}: ISIN non valido` }, 400);
        if (!ticker || !group) return json({ error: `Riga ${n + 1}: ticker e gruppo sono obbligatori` }, 400);
        if (!KINDS.includes(x.kind)) return json({ error: `Riga ${n + 1}: tipo non valido` }, 400);
        let extra;
        try { extra = cleanParams(x, n); } catch (e) { return json({ error: e.message }, 400); }
        if (seen.has(isin)) return json({ error: `ISIN ${isin} ripetuto` }, 400);
        seen.add(isin);
        const id = x.id && old.some((o) => o.id === x.id) ? x.id : isin;
        list.push({ id, isin, ticker, name: String(x.name || "").trim() || ticker, group, amount: Math.max(0, Number(x.amount) || 0), kind: x.kind, ...extra });
      }
      if (new Set(list.map((i) => i.id)).size !== list.length) return json({ error: "Identificativi duplicati" }, 400);
      await saveInstruments(list);
      // gli avvisi automatici dei titoli rimasti si riallineranno al nuovo target alla prossima rilevazione
      const kept = (await getAlerts()).filter((a) => list.some((i) => i.id === a.id));
      kept.forEach((a) => { if (a.sys && a.mode === "auto") a.syncDay = null; });
      await saveAlerts(kept);
      return json({ instruments: list });
    }

    if (route === "settings" && req.method === "POST") {
      const b = await req.json();
      const st = (await s.get("settings", { type: "json" })) || {};
      if (typeof b.lockTargets === "boolean") st.lockTargets = b.lockTargets;
      await s.setJSON("settings", st);
      return json({ lockTargets: st.lockTargets !== false });
    }

    if (route === "alerts/sys" && req.method === "POST") {
      const b = await req.json();
      const list = await getInstruments();
      if (!list.some((i) => i.id === b.id)) return json({ error: "Titolo non trovato" }, 404);
      const latest = await s.get("latest", { type: "json" });
      const target = latest ? calcAll(list, latest.quotes)[b.id]?.target : null;
      const alerts = await getAlerts();
      let a = alerts.find((x) => x.sys && x.id === b.id);
      if (!a) { a = { aid: crypto.randomUUID(), sys: true, id: b.id, cond: "below", price: 0, mode: "auto", active: true, created: new Date().toISOString() }; alerts.push(a); }
      const reset = { active: true, triggeredAt: null, triggeredPrice: null, lastError: null };
      if (b.price === null || b.price === undefined || b.price === "") {
        if (target == null) return json({ error: "Prezzo target non disponibile per questo titolo" }, 400);
        Object.assign(a, reset, { mode: "auto", price: round3(target), syncDay: romeDay() });
      } else {
        const p = Number(b.price);
        if (!(p > 0)) return json({ error: "Prezzo non valido" }, 400);
        Object.assign(a, reset, { mode: "manual", price: p, cond: ["below", "above"].includes(b.cond) ? b.cond : a.cond });
      }
      await saveAlerts(alerts);
      return json({ alerts });
    }

    if (route === "alerts/sync-all" && req.method === "POST") {
      const list = await getInstruments();
      const latest = await s.get("latest", { type: "json" });
      if (!latest) return json({ error: "Nessuna rilevazione disponibile" }, 400);
      const calc = calcAll(list, latest.quotes);
      const alerts = await getAlerts();
      let n = 0;
      for (const i of list) {
        const t = calc[i.id]?.target;
        if (t == null) continue;
        let a = alerts.find((x) => x.sys && x.id === i.id);
        if (!a) { a = { aid: crypto.randomUUID(), sys: true, id: i.id, cond: "below", price: 0, mode: "auto", active: true, created: new Date().toISOString() }; alerts.push(a); }
        if (a.mode === "manual") continue;
        Object.assign(a, { mode: "auto", cond: "below", price: round3(t), active: true, triggeredAt: null, triggeredPrice: null, lastError: null, syncDay: romeDay() });
        n++;
      }
      await saveAlerts(alerts);
      return json({ alerts, updated: n });
    }

    if (route === "instruments" && req.method === "POST") {
      const b = await req.json();
      const isin = String(b.isin || "").trim().toUpperCase();
      const ticker = String(b.ticker || "").trim();
      const group = String(b.group || "").trim();
      if (!ticker || !group) return json({ error: "Ticker e gruppo sono obbligatori" }, 400);
      if (!/^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(isin)) return json({ error: "ISIN non valido (12 caratteri, es. IE00BK5BQT80)" }, 400);
      if (!KINDS.includes(b.kind)) return json({ error: "Tipo non valido" }, 400);
      const list = await getInstruments();
      const item = { ticker, isin, name: String(b.name || "").trim() || ticker, group, amount: Math.max(0, Number(b.amount) || 0), kind: b.kind };
      if (b.id) {
        const i = list.findIndex((x) => x.id === b.id);
        if (i < 0) return json({ error: "Titolo non trovato" }, 404);
        list[i] = { ...list[i], ...item };
      } else {
        if (list.some((x) => x.id === isin || x.isin === isin)) return json({ error: "Titolo già presente" }, 400);
        list.push({ id: isin, ...item });
      }
      // raggruppa per gruppo mantenendo l'ordine di prima apparizione
      const order = [...new Set(list.map((x) => x.group))];
      list.sort((a, b2) => order.indexOf(a.group) - order.indexOf(b2.group));
      await saveInstruments(list);
      return json({ instruments: list });
    }

    if (route === "instruments" && req.method === "DELETE") {
      const id = url.searchParams.get("id");
      const list = (await getInstruments()).filter((x) => x.id !== id);
      await saveInstruments(list);
      await saveAlerts((await getAlerts()).filter((a) => a.id !== id));
      return json({ instruments: list });
    }

    if (route === "instruments/reset" && req.method === "POST") {
      await s.delete("instruments");
      await saveAlerts((await getAlerts()).filter((a) => INSTRUMENTS.some((i) => i.id === a.id)));
      return json({ instruments: INSTRUMENTS });
    }

    if (route === "alerts" && req.method === "DELETE") {
      const alerts = (await getAlerts()).filter((a) => a.aid !== url.searchParams.get("aid"));
      await saveAlerts(alerts);
      return json({ alerts });
    }

    if (route === "alerts/reactivate" && req.method === "POST") {
      const alerts = await getAlerts();
      const a = alerts.find((x) => x.aid === url.searchParams.get("aid"));
      if (a) Object.assign(a, { active: true, triggeredAt: null, triggeredPrice: null, lastError: null });
      await saveAlerts(alerts);
      return json({ alerts });
    }

    if (route === "telegram-test" && req.method === "POST") {
      await sendTelegram("✅ Borsa Monitor: Telegram collegato correttamente.");
      return json({ ok: true });
    }

    return json({ error: "non trovato" }, 404);
  } catch (e) {
    return json({ error: e.message }, 500);
  }
};

export const config = { path: "/api/*" };
