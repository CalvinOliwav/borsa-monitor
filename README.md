# Borsa Monitor v4

App web installabile su Android (PWA) per monitorare i titoli del portafoglio su Borsa Italiana, con prezzo reale, rendimento effettivo, prezzo target e avvisi su Telegram.

> ⚠️ Strumento di supporto, non consulenza finanziaria. I calcoli sono stime basate sui dati letti dal sito di Borsa Italiana (ritardo di circa 15 minuti) e sui parametri inseriti. Verifica sempre i valori prima di operare.

---

## 1. Cosa contiene la cartella

```
borsa-monitor-v4/
├── netlify.toml                    impostazioni di Netlify
├── package.json                    pacchetti usati dalle funzioni
├── README.md                       questo file
├── public/                         il sito
│   ├── index.html                  l'app (tabella, procedura iniziale, avvisi)
│   ├── sw.js, manifest.webmanifest, icon.svg
└── netlify/functions/
    ├── api.mjs                     API dell'app
    ├── collect-scheduled.mjs       controllo automatico ogni 5 minuti
    └── lib/
        ├── bi.mjs                  lettura delle schede di Borsa Italiana
        ├── calc.mjs                calcoli: tipo, prezzo reale, rendimento, target
        ├── collect.mjs             rilevazioni, avvisi Telegram
        └── instruments.mjs         portafoglio iniziale
```

---

## 2. Installazione da zero (GitHub + Netlify)

### 2.1 Crea il repository su GitHub
1. Su github.com: **+** → **New repository**.
2. Nome `borsa-monitor-v4`, scegli **Private**, lascia tutto il resto vuoto, **Create repository**.
3. Nella pagina del repository premi **uploading an existing file**.
4. Scompatta lo zip con **Estrai tutto** e trascina nel browser **il contenuto** della cartella: `public`, `netlify`, `netlify.toml`, `package.json`, `README.md` (non lo zip).
5. **Commit changes**.
6. Controlla che nella pagina principale `public`, `netlify`, `netlify.toml` e `package.json` siano allo stesso livello e che in `netlify/functions` ci siano `api.mjs`, `collect-scheduled.mjs` e la cartella `lib` con 4 file.

### 2.2 Collega il repository a Netlify
1. Netlify → **Add new project** → **Import an existing project** → **GitHub** → scegli `borsa-monitor-v4`.
2. Impostazioni: **Branch** `main`, **Build command** vuoto, **Publish directory** `public`, **Functions directory** `netlify/functions`.
3. Premi **Deploy**. Il primo deploy funzionerà solo in parte: mancano le variabili (punto 4).

---

## 3. Telegram: bot e chat id

1. In Telegram cerca **@BotFather** → `/newbot` → scegli nome e username (finisce con `bot`). Copia il **token** (formato `1234567890:AAE...`).
2. Apri il tuo bot e premi **Avvia**: scrivigli "ciao". Senza questo il bot non può scriverti.
3. Cerca **@userinfobot** → **Avvia**: ti risponde con il tuo **Id** (solo numeri). È il chat id.
4. Prova (da browser, sostituendo i valori): `https://api.telegram.org/botTOKEN/sendMessage?chat_id=ID&text=prova`. Se ricevi "prova" su Telegram e la pagina mostra `"ok":true`, i valori sono giusti.

---

## 4. Variabili d'ambiente su Netlify

Percorso: sito → **Site configuration** → **Environment variables** → **Add a variable** → **Add a single variable**.

La maschera (l'aspetto può variare leggermente):

```
┌──────────────────────────────────────────────────┐
│ Key                                              │
│ [ TELEGRAM_BOT_TOKEN                           ] │
│                                                  │
│ Scopes                                           │
│ (●) All scopes                                   │
│                                                  │
│ Values                                           │
│ (●) Same value for all deploy contexts           │
│                                                  │
│ Value                                            │
│ [ 1234567890:AAExampleTokenAbCdEfGhIjKlMnOpQr  ] │
│                                                  │
│ [ ] Contains secret values                       │
│                                                  │
│                           [ Create variable ]    │
└──────────────────────────────────────────────────┘
```

Il nome (**Key**) accetta solo lettere maiuscole, numeri e trattino basso `_`, senza spazi né due punti. I due punti del token vanno nel **Value**.

### Variabili obbligatorie (ripeti la maschera per ognuna)

| Key | Value (esempio inventato) | Dove lo trovi |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | `1234567890:AAExampleTokenAbCdEfGhIjKlMnOpQr` | BotFather (punto 3.1) |
| `TELEGRAM_CHAT_ID` | `987654321` | @userinfobot (punto 3.3) |
| `APP_KEY` | `lamiapassword2026` | la scegli tu: l'app te la chiede al primo accesso |

### Variabili facoltative (hanno già un valore predefinito)

| Key | Value di esempio | Significato | Predefinito |
|---|---|---|---|
| `PRICE_ALERT_DELTA` | `0.04` | variazione di prezzo (in €) oltre la quale la cella diventa gialla | `0.04` |
| `ECB_SHOCK_PCT` | `0.25` | aumento dei tassi BCE (punti %) per il Prezzo target | `0.25` |
| `EQUITY_DROP_PCT` | `5` | storno del mercato azionario (%) per il Prezzo target | `5` |
| `ETF_HORIZON_YEARS` | `5` | anni su cui contare i costi di gestione (TER) degli ETF nel Prezzo reale | `5` |
| `ASSUMED_INFLATION_PCT` | `2` | inflazione attesa, usata solo per il rendimento nominale indicativo dei BTP€i | `2` |

Nei valori decimali usa il **punto** (`0.25`), non la virgola, e niente simboli (`%`, `€`).

Dopo aver inserito o cambiato le variabili: **Deploys** → **Trigger deploy** → **Deploy site**. Senza un nuovo deploy non valgono.

---

## 5. Verifica che funzioni

1. In **Deploys** l'ultimo deploy è **Published**.
2. In **Functions** compaiono `api` e `collect-scheduled`.
3. Apri l'indirizzo del sito, inserisci la chiave (`APP_KEY`) e premi **Prova Telegram**: arriva il messaggio.
4. Premi **Aggiorna**: la tabella si riempie.
5. Installa su Android: Chrome → menu ⋮ → **Aggiungi a schermata Home / Installa app**.

Il controllo automatico gira ogni 5 minuti dal lunedì al venerdì, 9:00–17:45 (ora italiana), anche con l'app chiusa.

---

## 6. Come si usa

### 6.1 Procedura iniziale
All'apertura l'app chiede **"Confermi i titoli della tabella?"**.
- **Sì** → procede con i prezzi (puoi spuntare "Non chiedermelo più").
- **No** → puoi **incollare una tabella** da Excel, Fogli Google, Word o CSV (riconosce ISIN, ticker, denominazione, gruppo, importo, anche nel formato "Componente / Strumenti (ISIN) / Importo"), **sostituire** o **aggiungere**, e poi modificare, eliminare o aggiungere titoli a mano.
- Poi il **riepilogo** mostra totali e modifiche; solo dopo **"Conferma e vai avanti"** l'app prosegue. Il tasto **Titoli** riapre la procedura in ogni momento.

Ogni titolo ha il **tipo**: ETF / ETC, BTP, BTP€i (indicizzato), Obbligazione (altra), Azione. Sotto "Parametri per i calcoli (facoltativi)" puoi inserire i dati che Borsa Italiana non fornisce (vedi 7).

### 6.2 La tabella dei risultati
| # | Colonna | Contenuto |
|---|---|---|
| 1 | **Tipo** | BTP, BTP€i, OAT, BUND, OBBLIGAZIONE, ETF, AZIONE (dal tipo scelto, dall'ISIN e dalla denominazione) |
| 2 | **ISIN** | codice del titolo |
| 3 | **Denominazione** | come definita da Borsa Italiana (se non letta, il nome che hai inserito) |
| 4 | **Prezzo attuale** | ultimo prezzo letto da Borsa Italiana |
| 5 | **Prezzo reale** | prezzo secco + rateo (× coefficiente di indicizzazione per i BTP€i); per gli ETF + spese di ingresso e costi di gestione |
| 6 | **Interesse effettivo annuo** | rendimento a scadenza sul prezzo reale, con la stima dopo imposte sotto |
| 7 | **Prezzo target** | prezzo con tassi BCE +0,25% (titoli di stato, BTP€i, ETF obbligazionari) o storno del 5% (ETF azionari e azioni) |
| 8 | **Prezzo alert (modificabile)** | valore che fa partire il messaggio Telegram |
| … | Importo, Peso, Δ prec., Var %, Var. € stima, Intraday, N. contratti, Controvalore, **e tutte le altre voci della scheda di Borsa Italiana** | come nella v3 |

Le celle del prezzo attuale e di Δ prec. diventano **gialle** se il prezzo varia di oltre 0,04 € dalla rilevazione precedente.

### 6.3 Prezzo alert e messaggi Telegram
- Il **Prezzo target** (colonna 7) si ricalcola a ogni rilevazione e segue il prezzo; il **Prezzo alert** (colonna 8) è invece un valore **fisso** salvato sul server: il messaggio parte quando l'ultimo prezzo scende fino a quel valore.
- Alla prima rilevazione di un titolo il target viene **copiato** nell'alert. Con **🔒 Blocca i target** attivo (predefinito) l'alert automatico **non cambia più** finché non premi **↻ target** o **Copia i target negli avvisi**. Se togli il blocco, gli alert automatici si riallineano al target una volta al giorno all'apertura del mercato (ma se il titolo scende piano per più giorni l'alert scende con lui e può non scattare).
- Puoi **scrivere un valore tuo** nella cella: da quel momento l'avviso resta **manuale** e non viene più sovrascritto.
- **↻ target** riporta la cella al Prezzo target; cancellare il valore e confermare fa lo stesso.
- **Copia i target negli avvisi** (barra sopra la tabella) aggiorna tutti gli avvisi automatici; quelli manuali restano.
- Quando il prezzo scende fino alla soglia arriva un messaggio Telegram con tipo, ISIN, denominazione, soglia e prezzo. L'avviso scatta una sola volta; **Riattiva** lo riarma (gli automatici si riarmano da soli il giorno dopo).
- Toccando una riga trovi anche altri avvisi facoltativi ("scende a" / "sale a").

---

## 7. Come sono calcolati i valori

**Tipo.** Dal tipo scelto per il titolo e dall'ISIN/denominazione: IT con denominazione indicizzata → BTP€i; FR → OAT (OAT€i se indicizzato); DE → BUND/BOBL/SCHATZ; altre obbligazioni → OBBLIGAZIONE; ETF → ETF (con sottotipo azionario/obbligazionario).

**Prezzo reale – titoli obbligazionari.** `(prezzo secco + rateo) × coefficiente di indicizzazione` (coefficiente = 1 se non indicizzato). Il prezzo secco è il prezzo in lettera se Borsa Italiana lo fornisce, altrimenti l'ultimo. Il rateo è calcolato con la convenzione Act/Act sulla cedola e sulle date di stacco ricavate dalla scadenza. Le commissioni bancarie sono escluse.

**Prezzo reale – ETF.** `prezzo × (1 + spese di ingresso) × (1 + TER × anni di gestione)`; gli anni sono `ETF_HORIZON_YEARS` (5).

**Interesse effettivo annuo.** Rendimento annuo composto a scadenza sul prezzo reale (per i BTP€i in termini reali, cioè sopra l'inflazione; sotto compare il valore nominale indicativo con l'inflazione ipotizzata). La stima **dopo imposte** usa 12,5% sui titoli di stato e 26% sulle altre obbligazioni, applicata alle cedole (al netto del rateo pagato) e al guadagno a scadenza. Per gli ETF il valore è il **rendimento atteso/YTM del fondo** (da inserire) al netto di spese di ingresso e TER; senza quel dato la cella mostra "n.d.".

**Prezzo target.** Rendimento calcolato sull'ultimo prezzo, aumentato di `ECB_SHOCK_PCT`, e riconvertito in prezzo secco. Per gli ETF obbligazionari: `ultimo × (1 − duration × shock)`; la duration viene dai parametri o, se manca, è stimata dal nome del fondo (e indicato nel dettaglio). Per ETF azionari e azioni: `ultimo × (1 − 5%)`. Per i BTP€i vengono mostrati il prezzo secco e il **prezzo reale di acquisto** con indicizzazione e rateo.

### Dati che potrebbero mancare
Se Borsa Italiana non espone un dato, la cella mostra **n.d.** e la voce "manca: …". Inseriscilo da **Titoli** → titolo → **Parametri per i calcoli**: cedola, scadenza, cedole all'anno, coefficiente di indicizzazione, TER, spese di ingresso, duration, rendimento atteso, classe ETF, URL della scheda. I valori scritti da te hanno la precedenza.

---

## 8. Se qualcosa non funziona

| Problema | Cosa fare |
|---|---|
| "Prova Telegram" dà errore "non configurati" | Variabile con nome sbagliato o deploy non rifatto: controlla il nome (sezione 4) e fai **Trigger deploy** |
| "chat not found" | Chat id sbagliato o non hai premuto Avvia sul bot (sezione 3) |
| "Unauthorized" | Token sbagliato o revocato |
| Riga con errore "tabella dati non riconosciuta" / HTTP 404 | Il titolo non è stato trovato con l'indirizzo standard: apri la scheda su borsaitaliana.it, copia l'indirizzo e incollalo in **Parametri → URL scheda**; controlla anche l'ISIN e il tipo |
| "n.d." su prezzo reale o rendimento | Dato mancante: compila i parametri (sezione 7) |
| Dati fermi / banner giallo | Premi **Aggiorna**; controlla in Netlify che `collect-scheduled` sia presente e che il deploy sia **Published** |
| Vedi ancora la versione vecchia | Ricarica la pagina due volte o chiudi e riapri l'app installata |

La lettura delle pagine di Borsa Italiana dipende dalla struttura del sito, che può cambiare: in tal caso le tabelle potrebbero richiedere un adattamento. Usa l'app per uso personale e con frequenza bassa, nel rispetto dei termini del sito.

---

## 9. Aggiornare in futuro
Sostituisci i file nel repository GitHub (Add file → Upload files, mantenendo le stesse cartelle) e fai **Commit**: Netlify pubblica da solo. Le variabili d'ambiente e gli avvisi salvati restano.
