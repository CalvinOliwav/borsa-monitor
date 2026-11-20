// Portafoglio 3 - Moderatamente dinamico
// id = ISIN (o ticker se l'ISIN non è noto). Per gli ETF l'ISIN serve a costruire l'URL su Borsa Italiana.
// ⚠️ Verifica gli ISIN degli ETF (colonna "isin"): quelli vuoti vanno completati.
export const INSTRUMENTS = [
  // BTP tasso fisso
  { id: "IT0005518128", isin: "IT0005518128", ticker: "BTP 1", name: "BTP tasso fisso", group: "BTP tasso fisso", amount: 10000, kind: "btp" },
  { id: "IT0005560948", isin: "IT0005560948", ticker: "BTP 2", name: "BTP tasso fisso", group: "BTP tasso fisso", amount: 10000, kind: "btp" },
  { id: "IT0005584856", isin: "IT0005584856", ticker: "BTP 3", name: "BTP tasso fisso", group: "BTP tasso fisso", amount: 10000, kind: "btp" },
  { id: "IT0005607970", isin: "IT0005607970", ticker: "BTP 4", name: "BTP tasso fisso", group: "BTP tasso fisso", amount: 10000, kind: "btp" },
  // BTP€i
  { id: "IT0005138828", isin: "IT0005138828", ticker: "BTP€i 1", name: "BTP€i", group: "BTP€i", amount: 12000, kind: "btpi" },
  { id: "IT0005482994", isin: "IT0005482994", ticker: "BTP€i 2", name: "BTP€i", group: "BTP€i", amount: 8000, kind: "btpi" },
  // ETF governativi euro
  { id: "IBGS", isin: "IE00B14X4Q57", ticker: "IBGS", name: "iShares € Govt Bond 1-3yr", group: "ETF governativi euro", amount: 10000, kind: "etf" },
  { id: "SEGA", isin: "", ticker: "SEGA", name: "ETF governativo euro", group: "ETF governativi euro", amount: 20000, kind: "etf" },
  { id: "IBCI", isin: "IE00B0M62X26", ticker: "IBCI", name: "iShares € Inflation Linked Govt", group: "ETF governativi euro", amount: 10000, kind: "etf" },
  // ETF corporate
  { id: "IEAC", isin: "IE00B3F81R35", ticker: "IEAC", name: "iShares Core € Corp Bond", group: "ETF corporate", amount: 20000, kind: "etf" },
  { id: "IBCX", isin: "", ticker: "IBCX", name: "ETF corporate", group: "ETF corporate", amount: 15000, kind: "etf" },
  { id: "VECA", isin: "IE00BZ163G84", ticker: "VECA", name: "Vanguard EUR Corporate Bond", group: "ETF corporate", amount: 15000, kind: "etf" },
  // Azionario globale
  { id: "VWCE", isin: "IE00BK5BQT80", ticker: "VWCE", name: "Vanguard FTSE All-World", group: "Azionario globale", amount: 10000, kind: "etf" },
  { id: "SWDA", isin: "IE00B4L5Y983", ticker: "SWDA", name: "iShares Core MSCI World", group: "Azionario globale", amount: 12000, kind: "etf" },
  // Azionario Europa
  { id: "MEUD", isin: "LU0908500753", ticker: "MEUD", name: "Amundi Stoxx Europe 600", group: "Azionario Europa", amount: 12000, kind: "etf" },
  { id: "IMEU", isin: "IE00B1YZSC51", ticker: "IMEU", name: "iShares Core MSCI Europe", group: "Azionario Europa", amount: 10000, kind: "etf" },
  // Satellite tematico
  { id: "INFR", isin: "IE00B1FZS467", ticker: "INFR", name: "iShares Global Infrastructure", group: "Satellite tematico", amount: 6000, kind: "etf" },
];

export const TOTAL = INSTRUMENTS.reduce((s, i) => s + i.amount, 0);
