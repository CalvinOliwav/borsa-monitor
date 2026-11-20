// Calcoli finanziari di Borsa Monitor v4.
// Tutto è una stima basata sui dati letti da Borsa Italiana e sui parametri inseriti per ogni titolo.
import { num } from "./bi.mjs";

const DAY = 86400000;
const utc = (y, m, d) => new Date(Date.UTC(y, m, d));

export function envSettings() {
  const n = (v, d) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : d);
  return {
    shockPct: n(process.env.ECB_SHOCK_PCT, 0.25), // aumento tassi BCE (punti %)
    equityDropPct: n(process.env.EQUITY_DROP_PCT, 5), // storno azionario (%)
    horizon: n(process.env.ETF_HORIZON_YEARS, 5), // anni per capitalizzare i costi di gestione degli ETF
    inflationPct: n(process.env.ASSUMED_INFLATION_PCT, 2), // inflazione attesa (solo per il valore nominale indicativo)
  };
}

export function parseDate(s) {
  if (!s) return null;
  const t = String(s).trim();
  let m = t.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return utc(+m[1], +m[2] - 1, +m[3]);
  m = t.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    return utc(y, +m[2] - 1, +m[1]);
  }
  return null;
}

function addMonths(base, n, anchorDay) {
  const y = base.getUTCFullYear(), m = base.getUTCMonth() + n;
  const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return utc(y, m, Math.min(anchorDay, dim));
}

// Date cedola future (dates) e ultima cedola staccata (prev)
function schedule(maturity, freq, settle) {
  const step = 12 / freq, anchor = maturity.getUTCDate();
  const dates = [];
  let i = 0, d = maturity;
  while (d > settle && i < 500) {
    dates.unshift(d);
    i++;
    d = addMonths(maturity, -step * i, anchor);
  }
  return { prev: d, dates };
}

const cashflows = (c, freq, dates) => dates.map((d, i) => ({ d, cf: c / freq + (i === dates.length - 1 ? 100 : 0) }));
const pv = (y, cfs, settle) => cfs.reduce((s, x) => s + x.cf / Math.pow(1 + y, (x.d - settle) / (365 * DAY)), 0);
function solveYield(dirty, cfs, settle) {
  let lo = -0.5, hi = 3;
  if (pv(lo, cfs, settle) < dirty || pv(hi, cfs, settle) > dirty) return null;
  for (let k = 0; k < 90; k++) {
    const mid = (lo + hi) / 2;
    if (pv(mid, cfs, settle) > dirty) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

// ---- Tipo del titolo ----
export function detectType(inst, fullName) {
  const name = String(fullName || inst.name || "").toUpperCase();
  const cc = String(inst.isin || "").slice(0, 2);
  const k = inst.kind;
  if (k === "stock") return { label: "AZIONE", sub: "" };
  if (k === "etf") return { label: "ETF", sub: etfSub(inst, name) };
  const linker = k === "btpi" || /€\s?I\b|\bIND\b|INDICIZZ|INFLAZ|LINKED|BTP\s?I\b|OAT\s?€?I/.test(name);
  if (k === "bond") return { label: "OBBLIGAZIONE", sub: "" };
  if (cc === "IT") {
    if (linker) return { label: "BTP€i", sub: "indicizzato all'inflazione" };
    if (/ITALIA/.test(name)) return { label: "BTP Italia", sub: "" };
    if (/\bCCT/.test(name)) return { label: "CCT", sub: "" };
    if (/\bBOT\b/.test(name)) return { label: "BOT", sub: "" };
    return { label: "BTP", sub: "tasso fisso" };
  }
  if (cc === "FR") return { label: linker ? "OAT€i" : "OAT", sub: "Francia" };
  if (cc === "DE") return { label: /BOBL/.test(name) ? "BOBL" : /SCHATZ|BKO/.test(name) ? "SCHATZ" : "BUND", sub: "Germania" };
  if (cc === "ES") return { label: "BONOS", sub: "Spagna" };
  return { label: "TITOLO DI STATO", sub: cc };
}
function etfClass(inst, name) {
  if (inst.etfClass) return inst.etfClass;
  return /BOND|GOVT|GOVERNMENT|GOVERNATIV|TREASURY|OBBLIG|CORP|INFLATION|LINKED|BTP|GILT|AGGREGATE|CREDIT/i.test(name) ? "bond" : "equity";
}
function etfSub(inst, name) {
  if (etfClass(inst, name) === "equity") return /INFRA|THEM|SECTOR|SETTOR/i.test(name) ? "azionario tematico" : "azionario";
  if (/CORP|CREDIT/i.test(name)) return "obbligazionario corporate";
  if (/INFLAT|LINKED|INDICIZZ/i.test(name)) return "obbligazionario indicizzato";
  return "obbligazionario governativo";
}
function estimateDuration(name) {
  const m = name.match(/(\d{1,2})\s*[-–]\s*(\d{1,2})\s*(?:Y|YR|YRS|ANNI)?/i);
  if (m) {
    const mid = (+m[1] + +m[2]) / 2;
    return +(mid * (mid <= 3 ? 0.95 : mid <= 7 ? 0.9 : mid <= 12 ? 0.85 : 0.68)).toFixed(1);
  }
  if (/CORP|CREDIT/i.test(name)) return 4.5;
  return /GOVT|GOVERNMENT|GOVERNATIV|TREASURY|INFLAT|LINKED/i.test(name) ? 7 : 6;
}

const keyVal = (f, re) => { const k = Object.keys(f || {}).find((k) => re.test(k)); return k ? f[k] : null; };
const parseFreq = (s) => {
  if (!s) return null;
  if (/seme/i.test(s)) return 2; if (/trime/i.test(s)) return 4; if (/annu/i.test(s)) return 1;
  const n = num(s); return [1, 2, 4].includes(n) ? n : null;
};
const opt = (v) => (v === null || v === undefined || v === "" ? null : Number.isFinite(+v) ? +v : null);

export function calcOne(inst, q, env, settle = new Date()) {
  const f = q?.fields || {};
  const type = detectType(inst, q?.fullName);
  const out = { type: type.label, sub: type.sub, notes: [], missing: [] };
  if (!q || q.error || q.last == null) return { ...out, nd: true };
  const last = q.last;
  const ask = num(keyVal(f, /lettera/i));
  const base = ask != null && ask > 0 ? ask : last;
  out.base = base; out.baseSrc = base === last ? "ultimo" : "lettera";
  out.borsaYield = num(keyVal(f, /rendimento effettivo.*lordo|rendimento effettivo|rend.*lordo/i));
  const shock = env.shockPct / 100;
  const name = String(q.fullName || inst.name || "").toUpperCase();

  /* ---------- Titoli di stato / obbligazioni ---------- */
  if (inst.kind === "btp" || inst.kind === "btpi" || inst.kind === "bond") {
    const linker = type.label.includes("€i") || inst.kind === "btpi";
    const coupon = opt(inst.coupon) ?? num(keyVal(f, /tasso.*cedol|cedola.*annu|^cedola|tasso nominale|tasso annuo/i)) ?? (() => { const m = name.match(/(\d+[,.]\d+)\s*%/); return m ? num(m[1]) : null; })();
    const maturity = inst.maturity ? parseDate(inst.maturity) : parseDate(keyVal(f, /scadenza/i));
    const freq = opt(inst.freq) || parseFreq(keyVal(f, /frequenza|periodicit/i)) || (type.label.startsWith("BTP") || type.label === "CCT" ? 2 : 1);
    let ratio = 1;
    if (linker) {
      const r = opt(inst.indexRatio) ?? num(keyVal(f, /coeff.*indic|indicizz/i));
      if (r && r > 0.5 && r < 3) ratio = r;
      else { out.missing.push("coefficiente di indicizzazione"); out.notes.push("Coefficiente di indicizzazione non trovato: il prezzo reale è senza indicizzazione. Inseriscilo nella scheda del titolo."); }
    }
    out.ratio = ratio;
    const gov = inst.kind !== "bond";
    const tax = (opt(inst.taxRate) ?? (gov ? 12.5 : 26)) / 100;
    const dur = num(keyVal(f, /duration|durata finanziaria/i));

    if (coupon != null && maturity && maturity > settle) {
      const { prev, dates } = schedule(maturity, freq, settle);
      const accrued = (coupon / freq) * ((settle - prev) / (dates[0] - prev));
      const cfs = cashflows(coupon, freq, dates);
      out.accrued = accrued; out.coupon = coupon; out.maturity = maturity.toISOString().slice(0, 10);
      out.real = (base + accrued) * ratio;
      // rendimento sul prezzo reale (in termini reali per i titoli indicizzati)
      const yReal = solveYield(base + accrued, cfs, settle);
      if (yReal != null) {
        out.yieldGross = yReal * 100;
        if (linker) out.yieldNominal = ((1 + yReal) * (1 + env.inflationPct / 100) - 1) * 100;
        // netto imposte (12,5% titoli di stato, 26% altre obbligazioni)
        const nc = cfs.map((x, i) => {
          let cf = x.cf - (i === dates.length - 1 ? 100 : 0);
          const cpn = coupon / freq;
          let tcf = i === 0 ? cpn - tax * Math.max(0, cpn - accrued) : cpn * (1 - tax);
          if (i === dates.length - 1) tcf += 100 - tax * Math.max(0, 100 - base);
          return { d: x.d, cf: tcf };
        });
        const yn = solveYield(base + accrued, nc, settle);
        if (yn != null) out.yieldNet = yn * 100;
      }
      // prezzo target: da rendimento sull'ultimo prezzo + shock tassi
      const yLast = solveYield(last + accrued, cfs, settle);
      if (yLast != null) {
        out.target = pv(yLast + shock, cfs, settle) - accrued;
        if (linker) out.targetReal = (out.target + accrued) * ratio;
      }
      out.notes.push(`Rateo calcolato (Act/Act) sulla cedola ${coupon.toLocaleString("it-IT")}% a ${freq === 2 ? "semestrale" : freq === 4 ? "trimestrale" : "annuale"}: ${accrued.toFixed(3)} per 100 nominali.`);
    } else {
      if (coupon == null) out.missing.push("cedola");
      if (!maturity) out.missing.push("scadenza");
      const rateo = num(keyVal(f, /^rateo/i)) ?? 0;
      out.accrued = rateo; out.real = (base + rateo) * ratio;
      out.notes.push("Cedola o scadenza non disponibili: rendimento non calcolabile. Inseriscile nella scheda del titolo (tasto Titoli).");
      if (dur) { out.target = (last + rateo) * (1 - dur * shock) - rateo; out.notes.push(`Target stimato con la duration di Borsa Italiana (${dur}).`); }
    }
    if (ask != null && base !== last) out.notes.push(`Prezzo reale calcolato sul prezzo in lettera (${ask}) invece che sull'ultimo.`);
    return out;
  }

  /* ---------- ETF e azioni ---------- */
  const klass = inst.kind === "stock" ? "equity" : etfClass(inst, name);
  const H = env.horizon;
  const terParsed = num(keyVal(f, /\bter\b|spese correnti|commission.*gestione|costi correnti/i));
  const ter = opt(inst.ter) ?? terParsed;
  const entry = opt(inst.entry) ?? 0;
  if (inst.kind === "etf") {
    if (ter == null) { out.missing.push("TER"); out.notes.push("TER non trovato: costi di gestione non inclusi. Inseriscilo nella scheda del titolo."); }
    out.cost = base * (1 + entry / 100) * (1 + ((ter || 0) / 100) * H) - base;
    out.real = base + out.cost;
    out.notes.push(`Prezzo reale = prezzo × (1 + spese ingresso ${entry}%) × (1 + TER ${ter ?? 0}% × ${H} anni di gestione).`);
    const ytm = opt(inst.ytm);
    if (ytm != null) {
      out.yieldGross = ((1 + ytm / 100) / (Math.pow(1 + entry / 100, 1 / H) * Math.pow(1 + ((ter || 0) / 100) * H, 1 / H)) - 1) * 100;
      out.notes.push(`Rendimento: ${ytm}% atteso dal fondo al netto di spese ingresso e TER.`);
    } else out.missing.push(klass === "bond" ? "rendimento a scadenza (YTM) del fondo" : "rendimento atteso annuo");
  } else {
    out.real = base; // azioni: nessun costo aggiuntivo noto oltre alle commissioni bancarie
  }
  if (klass === "equity") {
    out.target = last * (1 - env.equityDropPct / 100);
    out.notes.push(`Target: storno del mercato del ${env.equityDropPct}% sull'ultimo prezzo.`);
  } else {
    const dur = opt(inst.duration) ?? estimateDuration(name);
    out.duration = dur; out.durationEstimated = opt(inst.duration) == null;
    out.target = last * (1 - dur * shock);
    out.notes.push(`Target: tassi BCE +${env.shockPct}% con duration modificata ${dur}${out.durationEstimated ? " (stimata dal nome: inseriscila per maggiore precisione)" : ""}.`);
  }
  return out;
}

export function calcAll(list, quotes, env = envSettings(), settle = new Date()) {
  const out = {};
  for (const i of list) {
    try { out[i.id] = calcOne(i, quotes[i.id], env, settle); }
    catch (e) { out[i.id] = { type: i.kind, notes: ["Errore di calcolo: " + e.message], missing: [], nd: true }; }
  }
  return out;
}
