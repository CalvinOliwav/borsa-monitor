import { collect } from "./lib/collect.mjs";
import { isMarketOpen } from "./lib/bi.mjs";

// Ogni 5 minuti nei giorni feriali (UTC 7-16); il controllo reale degli orari 9:00-17:45 è in isMarketOpen()
export default async () => {
  if (!isMarketOpen()) return new Response("mercato chiuso");
  await collect();
  return new Response("ok");
};

export const config = { schedule: "*/5 7-16 * * 1-5" };
