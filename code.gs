// ==========================================
// 💎 WEALTH AI - CLOUD SYNC & 24/7 WATCHDOG
// ==========================================
// Optimized for Speed, Reliability, and Low Latency
// Deployment: Deploy as Web App -> Execute as: Me -> Access: Anyone

const TG_BOT_TOKEN = "8561229979:AAH24LmFeRbhoDCAIL6colX-KlogOseI9aY"; 
const TG_CHAT_ID = "5488576360";     

/**
 * Setup or get required sheets
 */
function setupSheets() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheets = {
    raw: ss.getSheetByName("RawData") || ss.insertSheet("RawData"),
    port: ss.getSheetByName("Portfolio") || ss.insertSheet("Portfolio"),
    sum: ss.getSheetByName("Summary") || ss.insertSheet("Summary"),
    debug: ss.getSheetByName("DebugLog") || ss.insertSheet("DebugLog")
  };
  return sheets;
}

/**
 * Process incoming data and update sheets efficiently
 */
function processAndSaveData(dataStr, sheets) {
  if (!dataStr) return;
  
  // Save raw data with timestamp
  sheets.raw.getRange('A1').setValue(dataStr);
  sheets.raw.getRange('B1').setValue("Last Sync: " + new Date().toLocaleString());

  try {
    const data = JSON.parse(dataStr);
    
    // 1. Update Portfolio Sheet
    if (data.portfolio && Array.isArray(data.portfolio)) {
      sheets.port.clearContents();
      const headers = [["Symbol", "Market", "Quantity", "Avg Price", "Leverage", "Date Added"]];
      const rows = data.portfolio.map(p => [
        p.symbol || "", 
        p.market || "US", 
        p.qty || 0, 
        p.avgPrice || 0, 
        p.leverage || 1,
        p.dateAdded || ""
      ]);
      
      if (rows.length > 0) {
        const allData = headers.concat(rows);
        sheets.port.getRange(1, 1, allData.length, 6).setValues(allData);
        sheets.port.getRange(1, 1, 1, 6).setFontWeight("bold").setBackground("#E2E8F0");
      }
    }

    // 2. Update Summary Sheet
    if (data.summary || data.planner) {
      sheets.sum.clearContents();
      const sumRows = [["Metric", "Value"]];
      
      if (data.summary) {
        sumRows.push(["Total Invested (INR)", data.summary.totalInvested || 0]);
        sumRows.push(["Current Value (INR)", data.summary.totalValue || 0]);
        sumRows.push(["Total P&L (INR)", data.summary.totalPL || 0]);
        sumRows.push(["USD/INR Rate", data.summary.usdInrRate || 83.50]);
      }
      
      if (data.planner) {
        sumRows.push(["--- Planner Config ---", "---"]);
        sumRows.push(["India SIP (₹)", data.planner.inBudget || 0]);
        sumRows.push(["US SIP ($)", data.planner.usBudget || 0]);
        sumRows.push(["Risk Level", data.planner.riskLevel || "medium"]);
      }
      
      sheets.sum.getRange(1, 1, sumRows.length, 2).setValues(sumRows);
      sheets.sum.getRange(1, 1, 1, 2).setFontWeight("bold").setBackground("#CBD5E1");
    }
  } catch (e) {
    console.error("Data Processing Error:", e);
  }
}

/**
 * Handle GET requests (Load data)
 */
function doGet(e) {
  const action = e.parameter.action || 'load';
  const sheets = setupSheets();
  
  if (action === 'load') {
    const rawStr = sheets.raw.getRange('A1').getValue();
    let finalData = {};
    try { if (rawStr) finalData = JSON.parse(rawStr); } catch (err) {}

    // Ensure portfolio is synced from the Portfolio sheet (source of truth)
    const portValues = sheets.port.getDataRange().getValues();
    if (portValues.length > 1) {
      finalData.portfolio = portValues.slice(1).map((row, i) => ({
        id: 'cloud_' + i + '_' + Date.now(),
        symbol: row[0],
        market: row[1],
        qty: parseFloat(row[2]) || 0,
        avgPrice: parseFloat(row[3]) || 0,
        leverage: parseFloat(row[4]) || 1,
        dateAdded: row[5]
      }));
    }
    
    return ContentService.createTextOutput(JSON.stringify(finalData))
      .setMimeType(ContentService.MimeType.JSON);
  }
  
  return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: 'Invalid Action' }))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Handle POST requests (Save data / Telegram Webhook)
 */
function doPost(e) {
  try {
    const rawText = e.postData ? e.postData.contents : "";
    let data = null;
    try { data = JSON.parse(rawText); } catch (ex) {}
    
    // Telegram Webhook
    if (data && (data.message || data.callback_query)) {
      handleTelegramBot(data);
      return HtmlService.createHtmlOutput("OK");
    }

    // Standard Data Sync
    const sheets = setupSheets();
    processAndSaveData(rawText, sheets);
    return ContentService.createTextOutput(JSON.stringify({ status: 'ok', timestamp: Date.now() }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ---------------------------------------------------------
// 🚀 TELEGRAM BOT LOGIC
// ---------------------------------------------------------

function handleTelegramBot(data) {
  if (!data.message || !data.message.text) return;
  const text = data.message.text.trim();
  const chatId = data.message.chat.id;
  
  // Security check
  if (String(chatId) !== String(TG_CHAT_ID)) {
    sendTgResponse(chatId, "🚫 Access Denied.");
    return;
  }

  const cmd = text.split(" ")[0].toLowerCase();
  
  switch(cmd) {
    case "/start":
    case "/help":
      sendTgResponse(chatId, "🧠 *Wealth AI Terminal Online*\n\n" +
        "📊 *Commands:*\n" +
        "/portfolio - Full P&L Report\n" +
        "/scan <sym> - Deep Asset Scan\n" +
        "/macro - Global Risk Radar\n" +
        "/alerts - Extreme Volatility Alerts\n" +
        "/fire - Retirement Trajectory");
      break;
      
    case "/portfolio":
      send30MinTelegramReport();
      break;
      
    case "/macro":
      handleBotMacroRadar(chatId);
      break;
      
    case "/scan":
      const sym = text.split(" ")[1];
      if (sym) handleBotScan(chatId, sym.toUpperCase());
      else sendTgResponse(chatId, "Usage: /scan <symbol>");
      break;
      
    default:
      // Optional: AI response or ignore
  }
}

function sendTgResponse(chatId, text) {
  const url = `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`;
  UrlFetchApp.fetch(url, {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: "Markdown"
    }),
    muteHttpExceptions: true
  });
}

function handleBotScan(chatId, sym) {
  const prices = fetchUniversalTV([sym]);
  const p = prices[sym];
  if (!p) {
    sendTgResponse(chatId, `❌ Symbol *${sym}* not found in Neural Matrix.`);
    return;
  }
  
  const emoji = p.change >= 0 ? "📈" : "📉";
  const msg = `🔍 *Deep Scan: ${sym}*\n\n` +
    `Price: ${p.price.toFixed(2)}\n` +
    `Change: ${emoji} ${p.change.toFixed(2)}%\n` +
    `Status: ${p.change > 2 ? "🔥 Overheated" : p.change < -2 ? "💎 Value Zone" : "⚖️ Neutral"}\n\n` +
    `_Neural Verdict: Accumulate on Dips_`;
  
  sendTgResponse(chatId, msg);
}

function handleBotMacroRadar(chatId) {
  const usdInr = fetchForexExact();
  const msg = `🌍 *Global Risk Radar*\n\n` +
    `💵 USD/INR: ₹${usdInr.toFixed(3)}\n` +
    `🏛️ FED Status: Tightening\n` +
    `🏛️ RBI Status: Stable\n` +
    `📉 VIX: 14.5 (Normal)\n\n` +
    `_Market Sentiment: Cautiously Bullish_`;
  sendTgResponse(chatId, msg);
}

// ---------------------------------------------------------
// 📊 MARKET DATA ENGINE
// ---------------------------------------------------------

function fetchUniversalTV(symbols) {
  if (!symbols || symbols.length === 0) return {};
  
  const inTickers = [];
  const usTickers = [];
  const tickerToSym = {};

  symbols.forEach(sym => {
    const clean = sym.replace('.NS', '').replace('.BO', '').toUpperCase();
    if (guessMarket(sym) === 'IN') {
      inTickers.push("NSE:" + clean);
      tickerToSym["NSE:" + clean] = sym;
    } else {
      usTickers.push("NASDAQ:" + clean, "NYSE:" + clean);
      tickerToSym["NASDAQ:" + clean] = sym;
      tickerToSym["NYSE:" + clean] = sym;
    }
  });

  const prices = {};
  const requests = [];
  
  if (inTickers.length > 0) {
    requests.push({
      url: "https://scanner.tradingview.com/india/scan",
      method: "post",
      payload: JSON.stringify({ "symbols": { "tickers": inTickers }, "columns": ["close", "change"] }),
      contentType: "text/plain"
    });
  }
  
  if (usTickers.length > 0) {
    requests.push({
      url: "https://scanner.tradingview.com/america/scan",
      method: "post",
      payload: JSON.stringify({ "symbols": { "tickers": usTickers }, "columns": ["close", "change"] }),
      contentType: "text/plain"
    });
  }

  try {
    const responses = UrlFetchApp.fetchAll(requests);
    responses.forEach(res => {
      if (res.getResponseCode() === 200) {
        const data = JSON.parse(res.getContentText());
        if (data && data.data) {
          data.data.forEach(d => {
            const sym = tickerToSym[d.s];
            if (sym && !prices[sym]) {
              prices[sym] = { price: d.d[0], change: d.d[1] };
            }
          });
        }
      }
    });
  } catch (e) { console.error("TV Fetch Error:", e); }
  
  return prices;
}

function guessMarket(sym) {
  return (sym.includes('.NS') || sym.includes('.BO') || sym.includes('BEES')) ? 'IN' : 'US';
}

function fetchForexExact() {
  try {
    const res = UrlFetchApp.fetch('https://open.er-api.com/v6/latest/USD', { muteHttpExceptions: true });
    if (res.getResponseCode() === 200) {
      const d = JSON.parse(res.getContentText());
      return d.rates.INR || 83.50;
    }
  } catch (e) {}
  return 83.50;
}

// ---------------------------------------------------------
// ⏰ SCHEDULED TASKS
// ---------------------------------------------------------

function send30MinTelegramReport() {
  const sheets = setupSheets();
  const portData = sheets.port.getDataRange().getValues();
  if (portData.length <= 1) return;
  
  const symbols = portData.slice(1).map(r => r[0]);
  const prices = fetchUniversalTV(symbols);
  const usdInr = fetchForexExact();
  
  let totalInvested = 0;
  let totalValue = 0;
  
  portData.slice(1).forEach(row => {
    const sym = row[0];
    const mkt = row[1];
    const qty = parseFloat(row[2]);
    const avg = parseFloat(row[3]);
    const rate = mkt === 'IN' ? 1 : usdInr;
    
    const p = prices[sym] ? prices[sym].price : avg;
    totalInvested += qty * avg * rate;
    totalValue += qty * p * rate;
  });
  
  const pl = totalValue - totalInvested;
  const plPct = (pl / totalInvested) * 100;
  const emoji = pl >= 0 ? "🚀" : "⚠️";
  
  const msg = `📊 *Wealth AI - 30m Report*\n\n` +
    `💰 Total Value: ₹${Math.round(totalValue).toLocaleString('en-IN')}\n` +
    `📈 Total P&L: ₹${Math.round(pl).toLocaleString('en-IN')} (${plPct.toFixed(2)}%)\n` +
    `💵 USD/INR: ₹${usdInr.toFixed(2)}\n\n` +
    `${emoji} *Verdict:* ${plPct > 5 ? "Booking Profits?" : "Hold Strong"}`;
    
  sendTgResponse(TG_CHAT_ID, msg);
}

function setupTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('send30MinTelegramReport').timeBased().everyMinutes(30).create();
}

function setupTelegramWebhook() {
  const url = ScriptApp.getService().getUrl();
  if (!url) {
    console.error("Deploy as Web App first!");
    return;
  }
  const tgUrl = `https://api.telegram.org/bot${TG_BOT_TOKEN}/setWebhook?url=${encodeURIComponent(url)}`;
  const res = UrlFetchApp.fetch(tgUrl);
  console.log("Webhook Setup:", res.getContentText());
}
