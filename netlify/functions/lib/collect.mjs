import { getStore } from "@netlify/blobs";
import { INSTRUMENTS } from "./instruments.mjs";
import { fetchInstrument, romeDay, isMarketOpen } from "./bi.mjs";
import { calcAll, envSettings } from "./calc.mjs";

export const store = () => getStore("borsa");

export async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chat = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chat) throw new Error("TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID non configurati");
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chat, text }),
  });
  if (!r.ok) throw new Error("Telegram: " + (await r.text()));
}

export async function getInstruments() {
  return (await store().get("instruments", { type: "json" })) || INSTRUMENTS;
}
export const saveInstruments = (l) => store().setJSON("instruments", l);

export const getAlerts = async () => (await store().get("alerts", { type: "json" })) || [];
export const saveAlerts = (a) => store().setJSON("alerts", a);

export async function collect() {
  const s = store();
  const now = new Date();
  const list = await getInstruments();
  const results = await Promise.all(
    list.map(async (i) => {
      try {
        const { fields, last, pct, contracts, value, url, fullName } = await fetchInstrument(i);
        return [i.id, { fields, last, pct, contracts, value, url, fullName }];
      } catch (e) {
        return [i.id, { error: e.message }];
      }
    })
  );
  const quotes = Object.fromEntries(results);
  // rilevazione precedente (per evidenziare le variazioni di prezzo)
  const old = await s.get("latest", { type: "json" });
  const prev = Object.fromEntries(
    Object.entries(old?.quotes || {}).filter(([, q]) => q.last != null).map(([k, q]) => [k, q.last])
  );
  const latest = { t: now.toISOString(), prevT: old?.t || null, prev, quotes };
  await s.setJSON("latest", latest);

  // Serie intraday del giorno: id -> [[iso, ultimo, n.contratti, controvalore], ...]
  const key = "series-" + romeDay(now);
  const series = (await s.get(key, { type: "json" })) || {};
  for (const [id, q] of results) {
    if (q.last == null) continue;
    (series[id] ||= []).push([latest.t, q.last, q.contracts, q.value]);
  }
  await s.setJSON(key, series);

  // Allarmi di prezzo
  const alerts = await getAlerts();
  let changed = false;

  // Avvisi "target": uno per titolo, copiato dal Prezzo Target (colonna 7).
  // Creato alla prima lettura e riallineato una volta al giorno (a mercato aperto) se non è stato impostato a mano.
  const calc = calcAll(list, quotes, envSettings(), now);
  const today = romeDay(now);
  // "Blocca target" (attivo di default): gli avvisi automatici restano fissi e non si riallineano ogni giorno
  const locked = ((await s.get("settings", { type: "json" })) || {}).lockTargets !== false;
  for (const inst of list) {
    const t = calc[inst.id]?.target;
    if (t == null) continue;
    const price = Math.round(t * 1000) / 1000;
    const a = alerts.find((x) => x.sys && x.id === inst.id);
    if (!a) {
      alerts.push({ aid: crypto.randomUUID(), sys: true, id: inst.id, cond: "below", price, mode: "auto", active: true, syncDay: today, created: latest.t });
      changed = true;
    } else if (a.mode === "auto" && !locked && a.syncDay !== today && isMarketOpen(now)) {
      Object.assign(a, { price, active: true, triggeredAt: null, triggeredPrice: null, lastError: null, syncDay: today });
      changed = true;
    }
  }

  for (const a of alerts) {
    if (!a.active) continue;
    const last = quotes[a.id]?.last;
    if (last == null) continue;
    const hit = a.cond === "above" ? last >= a.price : last <= a.price;
    if (!hit) continue;
    const inst = list.find((i) => i.id === a.id);
    const hhmm = now.toLocaleTimeString("it-IT", { timeZone: "Europe/Rome", hour: "2-digit", minute: "2-digit" });
    try {
      await sendTelegram(
        `🔔 ${a.cond === "above" ? "VENDITA" : "ACQUISTO"} – ${a.sys ? (a.mode === "manual" ? "prezzo alert (manuale)" : "prezzo target") : "prezzo"} raggiunto\n` +
          `${inst?.ticker} – ${quotes[a.id]?.fullName || inst?.name}\n` +
          `ISIN ${inst?.isin}\n` +
          `Soglia ${a.cond === "above" ? "≥" : "≤"} ${a.price.toLocaleString("it-IT")} raggiunta.\n` +
          `Ultimo prezzo: ${last.toLocaleString("it-IT")} alle ${hhmm}`
      );
      a.active = false;
      a.triggeredAt = latest.t;
      a.triggeredPrice = last;
      changed = true;
    } catch (e) {
      a.lastError = e.message; // riproverà al prossimo giro
      changed = true;
    }
  }
  if (changed) await saveAlerts(alerts);
  return latest;
}
