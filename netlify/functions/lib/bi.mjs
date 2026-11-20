import * as cheerio from "cheerio";

const BASE = "https://www.borsaitaliana.it/borsa";

// Possibili URL della scheda (si prova il primo che restituisce dati)
function candidateUrls(inst) {
  const q = "?lang=it";
  // URL della scheda indicato a mano (ha la precedenza)
  const custom = typeof inst.url === "string" && inst.url.startsWith("https://www.borsaitaliana.it/") ? [inst.url] : [];
  if (inst.kind === "stock") return [...custom, `${BASE}/azioni/scheda/${inst.isin}.html${q}`];
  if (inst.kind === "etf") return [...custom, `${BASE}/etf/scheda/${inst.isin}.html${q}`];
  const btp = [
    `${BASE}/titoli-di-stato/mot/btp/scheda/${inst.isin}.html${q}`,
    `${BASE}/obbligazioni/mot/btp/scheda/${inst.isin}.html${q}`,
    `${BASE}/titoli-di-stato/mot/btp-italia/scheda/${inst.isin}.html${q}`,
  ];
  if (inst.kind === "bond")
    return [
      ...custom,
      `${BASE}/obbligazioni/mot/obbligazioni-in-euro/scheda/${inst.isin}.html${q}`,
      `${BASE}/obbligazioni/mot/titoli-di-stato-esteri/scheda/${inst.isin}.html${q}`,
      ...btp.slice(0, 2),
    ];
  return [...custom, ...btp];
}

// "1.234,56" -> 1234.56
export function num(s) {
  if (s == null) return null;
  const t = String(s).replace(/[^\d,.\-]/g, "");
  if (!/\d/.test(t)) return null;
  const n = parseFloat(t.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

// Etichette -> valori: legge tutte le coppie "etichetta / valore" presenti nelle tabelle della scheda
export function parseFields(html) {
  const $ = cheerio.load(html);
  const fields = {};
  $("tr").each((_, tr) => {
    const cells = $(tr)
      .children("td,th")
      .map((_, c) => $(c).text().replace(/\s+/g, " ").trim())
      .get();
    for (let i = 0; i + 1 < cells.length; i += 2) {
      const k = cells[i];
      const v = cells[i + 1];
      if (k && v && k.length < 45 && !(k in fields)) fields[k] = v;
    }
  });
  return fields;
}

const find = (f, re) => {
  const k = Object.keys(f).find((k) => re.test(k));
  return k ? f[k] : null;
};

// Denominazione completa dello strumento (dalla scheda di Borsa Italiana)
export function parseName(html, fields) {
  const k = Object.keys(fields).find((k) => /^(denominazione|descrizione|nome|strumento)$/i.test(k));
  if (k && fields[k]) return fields[k];
  const $ = cheerio.load(html);
  const clean = (t) =>
    (t || "")
      .replace(/\s+/g, " ")
      .replace(/\s*[-–|]\s*Borsa Italiana.*$/i, "")
      .replace(/^(scheda|quotazione)\s*[-–:]?\s*/i, "")
      .trim();
  const cands = [$("h1").first().text(), $('meta[property="og:title"]').attr("content"), $("title").text()];
  for (const c of cands) {
    const t = clean(c);
    if (t.length > 3 && t.length < 120) return t;
  }
  return "";
}

export const PIN = {
  last: /^ultimo (contratto|prezzo)|^ultimo$/i,
  pct: /^var/i,
  contracts: /contratti/i,
  value: /controvalore/i,
};

export function summarize(f) {
  return {
    last: num(find(f, PIN.last)),
    pct: num(find(f, PIN.pct)),
    contracts: num(find(f, PIN.contracts)),
    value: num(find(f, PIN.value)),
  };
}

export async function fetchInstrument(inst) {
  if (!inst.isin) throw new Error("ISIN mancante in instruments.mjs");
  let lastErr = "Nessun dato trovato";
  for (const url of candidateUrls(inst)) {
    try {
      const r = await fetch(url, {
        headers: {
          "user-agent": "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124 Mobile Safari/537.36",
          "accept-language": "it-IT,it;q=0.9",
        },
        signal: AbortSignal.timeout(6000),
      });
      if (!r.ok) {
        lastErr = `HTTP ${r.status}`;
        continue;
      }
      const html = await r.text();
      const fields = parseFields(html);
      if (Object.keys(fields).length >= 3) return { url, fields, fullName: parseName(html, fields), ...summarize(fields) };
      lastErr = "Pagina letta ma tabella dati non riconosciuta";
    } catch (e) {
      lastErr = e.message;
    }
  }
  throw new Error(lastErr);
}

// ---- Orari mercato (Europe/Rome) ----
export function romeParts(d = new Date()) {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Rome",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  return { wd: p.weekday, mins: +p.hour * 60 + +p.minute };
}
export function isMarketOpen(d = new Date()) {
  const { wd, mins } = romeParts(d);
  return !["Sat", "Sun"].includes(wd) && mins >= 9 * 60 && mins <= 17 * 60 + 45;
}
export const romeDay = (d = new Date()) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Rome" }).format(d);
