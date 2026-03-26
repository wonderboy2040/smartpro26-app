import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

const app = express();
const PORT = 3000;
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

app.get('/api/config', (req, res) => {
  res.json({ GEMINI_API_KEY: process.env.GEMINI_API_KEY || '' });
});

app.get('/api/portfolio', async (req, res) => {
  try {
    const spreadsheetId = process.env.GOOGLE_SHEET_ID;
    if (!spreadsheetId) {
      return res.status(400).json({ error: 'GOOGLE_SHEET_ID not configured' });
    }
    
    // Fetch as CSV
    const url = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/gviz/tq?tqx=out:csv&sheet=Sheet1`;
    const response = await fetch(url);
    if (!response.ok) throw new Error('Failed to fetch sheet');
    
    const csvText = await response.text();
    // Simple CSV parser (assuming no commas in values)
    const rows = csvText.split('\n').map(row => row.split(',').map(cell => cell.replace(/"/g, '')));
    
    res.json(rows);
  } catch (error) {
    console.error('Google Sheets Fetch Error:', error);
    res.status(500).json({ error: 'Failed to fetch from Google Sheets' });
  }
});

app.get('/api/news/:query', async (req, res) => {
  try {
    const query = encodeURIComponent(req.params.query);
    const response = await fetch(`https://query2.finance.yahoo.com/v1/finance/search?q=${query}&newsCount=10`);
    if (!response.ok) throw new Error(`Yahoo Finance API returned ${response.status}`);
    const data = await response.json();
    const news = data.news || [];
    const formattedNews = news.map((n: any) => ({
      title: n.title,
      publisher: n.publisher,
      link: n.link,
      time: n.providerPublishTime ? new Date(n.providerPublishTime * 1000).toISOString() : new Date().toISOString()
    }));
    res.json(formattedNews);
  } catch (e) {
    console.error('News fetch error', e);
    res.status(500).json({ error: 'Failed to fetch news' });
  }
});

const quoteCache = new Map<string, { data: any, timestamp: number }>();
const CACHE_TTL = 60000; // 60 seconds cache

app.get('/api/nse/quote/:symbol', async (req, res) => {
  let symbol = req.params.symbol.replace('.NS', '').toUpperCase();
  const cacheKey = `IN_${symbol}`;
  
  if (quoteCache.has(cacheKey)) {
    const cached = quoteCache.get(cacheKey)!;
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json(cached.data);
    }
  }
  
  try {
    const response = await fetch('https://scanner.tradingview.com/india/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbols: { tickers: [`NSE:${symbol}`, `BSE:${symbol}`] },
        columns: ["close", "change", "change_abs", "high", "low", "open", "volume", "VWAP"]
      })
    });
    
    if (response.status === 429) {
      if (quoteCache.has(cacheKey)) {
        return res.json(quoteCache.get(cacheKey)!.data); // Serve stale cache on 429
      }
      return res.status(429).json({ error: 'TradingView API rate limited' });
    }
    
    if (!response.ok) throw new Error(`TradingView API returned ${response.status}`);
    const data = await response.json();
    
    if (!data.data || data.data.length === 0) {
      return res.status(404).json({ error: 'Symbol not found' });
    }
    
    const d = data.data[0].d;
    
    const mappedData = {
      priceInfo: {
        lastPrice: d[0] || 0,
        pChange: d[1] || 0,
        change: d[2] || 0,
        open: d[5] || 0,
        intraDayHighLow: {
          max: d[3] || 0,
          min: d[4] || 0
        },
        vwap: d[7] || 0
      },
      preOpenMarket: {
        preopen: [{ price: d[5] || 0 }],
        totalTradedVolume: d[6] || 0
      }
    };
    
    quoteCache.set(cacheKey, { data: mappedData, timestamp: Date.now() });
    res.json(mappedData);
  } catch (error) {
    console.error('TradingView NSE Fetch Error:', error);
    res.status(500).json({ error: 'Failed to fetch from TradingView' });
  }
});

// --- US API Helper (TradingView) ---
app.get('/api/us/quote/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  const cacheKey = `US_${symbol}`;
  
  if (quoteCache.has(cacheKey)) {
    const cached = quoteCache.get(cacheKey)!;
    if (Date.now() - cached.timestamp < CACHE_TTL) {
      return res.json(cached.data);
    }
  }
  
  try {
    const response = await fetch('https://scanner.tradingview.com/america/scan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbols: { tickers: [`NASDAQ:${symbol}`, `NYSE:${symbol}`, `AMEX:${symbol}`] },
        columns: ["close", "change", "change_abs", "high", "low", "open", "volume", "VWAP"]
      })
    });
    
    if (response.status === 429) {
      if (quoteCache.has(cacheKey)) {
        return res.json(quoteCache.get(cacheKey)!.data); // Serve stale cache on 429
      }
      return res.status(429).json({ error: 'TradingView API rate limited' });
    }
    
    if (!response.ok) throw new Error(`TradingView API returned ${response.status}`);
    const data = await response.json();
    
    if (!data.data || data.data.length === 0) {
      return res.status(404).json({ error: 'Symbol not found' });
    }
    
    const d = data.data[0].d;
    
    const mappedData = {
      data: {
        primaryData: {
          lastSalePrice: `$${d[0]}`,
          percentageChange: `${d[1]}%`,
          netChange: `${d[2]}`,
          volume: `${d[6]}`
        }
      }
    };
    
    quoteCache.set(cacheKey, { data: mappedData, timestamp: Date.now() });
    res.json(mappedData);
  } catch (error) {
    console.error('TradingView US Fetch Error:', error);
    res.status(500).json({ error: 'Failed to fetch from TradingView' });
  }
});

// --- WebSocket Real-Time Stream ---
const subscriptions = new Map<WebSocket, Set<string>>();
const activeSymbols = new Set<string>();

wss.on('connection', (ws) => {
  subscriptions.set(ws, new Set());

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'subscribe' && data.symbol) {
        const symbol = data.symbol.toUpperCase();
        subscriptions.get(ws)?.add(symbol);
        activeSymbols.add(symbol);
        
        // Send initial historical data for the chart
        const history = generateHistoricalData(symbol, data.market || 'US', data.currentPrice, data.timeframe || '1M');
        ws.send(JSON.stringify({ type: 'history', symbol, data: history }));
      } else if (data.type === 'unsubscribe' && data.symbol) {
        const symbol = data.symbol.toUpperCase();
        subscriptions.get(ws)?.delete(symbol);
        // Clean up activeSymbols if no one is subscribed
        let isUsed = false;
        for (const subs of subscriptions.values()) {
          if (subs.has(symbol)) { isUsed = true; break; }
        }
        if (!isUsed) activeSymbols.delete(symbol);
      }
    } catch (e) {
      console.error('WS Message Error:', e);
    }
  });

  ws.on('close', () => {
    subscriptions.delete(ws);
    // Rebuild activeSymbols to prevent polling leaks
    activeSymbols.clear();
    for (const subs of subscriptions.values()) {
      for (const sym of subs) {
        activeSymbols.add(sym);
      }
    }
  });
});

// Generate realistic historical data based on a random walk
function generateHistoricalData(symbol: string, market: string, startPrice?: number, timeframe?: string) {
  const points = 60; // 60 data points
  const data = [];
  let currentPrice = startPrice || 100; // Base price if we don't know it yet
  
  let intervalMs = 60000; // 1M default
  if (timeframe === '5M') intervalMs = 300000;
  if (timeframe === '1H') intervalMs = 3600000;

  // Create a random walk backwards
  const now = Date.now();
  for (let i = 0; i <= points; i++) {
    data.push({
      time: now - i * intervalMs,
      price: currentPrice
    });
    // Random walk: +/- 0.1%
    currentPrice = currentPrice * (1 + (Math.random() - 0.5) * 0.002);
  }
  return data.reverse(); // Reverse so it goes from oldest to newest
}

// Helper to check if market is open
function isMarketOpen(market: 'IN' | 'US') {
  const now = new Date();
  const day = now.getUTCDay();
  if (day === 0 || day === 6) return false; // Weekend
  
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  const currentTime = utcHours * 60 + utcMinutes;

  if (market === 'IN') {
    // 09:15 to 15:30 IST -> 03:45 to 10:00 UTC
    // 03:45 UTC = 225 minutes
    // 10:00 UTC = 600 minutes
    return currentTime >= 225 && currentTime <= 600;
  } else {
    // 09:30 to 16:00 ET -> 14:30 to 21:00 UTC
    // 14:30 UTC = 870 minutes
    // 21:00 UTC = 1260 minutes
    return currentTime >= 870 && currentTime <= 1260;
  }
}

// Polling loop for real-time updates
async function pollTradingView() {
  if (activeSymbols.size === 0) {
    setTimeout(pollTradingView, 60000);
    return;
  }
  
  const inSymbols: string[] = [];
  const usSymbols: string[] = [];
  
  for (const symbol of activeSymbols) {
    const s = symbol.toUpperCase();
    const isIN = s.endsWith('.NS') || 
                 s.endsWith('.BO') || 
                 s.includes('BEES') || 
                 s.includes('MOMOMENTUM') || 
                 s.includes('NIFTY') || 
                 s.includes('SENSEX') ||
                 s.includes('SMALLCAP') ||
                 s.includes('MIDCAP') ||
                 s.includes('BANKNIFTY') ||
                 s.includes('FINNIFTY');
    if (isIN) inSymbols.push(symbol);
    else usSymbols.push(symbol);
  }
  
  console.log('Processing Symbols:', { inSymbols, usSymbols });
  
  try {
    // Fetch IN symbols in batches of 5 to reduce load
    if (inSymbols.length > 0 && isMarketOpen('IN')) {
      for (let i = 0; i < inSymbols.length; i += 5) {
        const batch = inSymbols.slice(i, i + 5);
        const tickers = batch.flatMap(s => {
          const cleanSym = s.replace('.NS', '').replace('.BO', '');
          return [`NSE:${cleanSym}`, `BSE:${cleanSym}`];
        });
        
        const res = await fetch('https://scanner.tradingview.com/india/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbols: { tickers },
            columns: ["name", "close", "change", "volume"]
          })
        });
        
        if (res.status === 429) {
          console.warn('TradingView India Scan: Rate limited (429). Backing off.');
          await new Promise(resolve => setTimeout(resolve, 60000));
        } else if (res.ok) {
          const data = await res.json();
          if (data.data) {
            for (const item of data.data) {
              const name = item.d[0];
              const price = item.d[1];
              const change = item.d[2];
              const volume = item.d[3];
              
              const originalSym = batch.find(s => s.replace('.NS', '').replace('.BO', '') === name);
              if (originalSym && price > 0) {
                const msg = JSON.stringify({
                  type: 'tick',
                  symbol: originalSym,
                  price,
                  change,
                  volume,
                  time: Date.now()
                });
                for (const [ws, subs] of subscriptions.entries()) {
                  if (subs.has(originalSym) && ws.readyState === WebSocket.OPEN) {
                    ws.send(msg);
                  }
                }
              }
            }
          }
        }
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Fetch US symbols in batches of 5
    if (usSymbols.length > 0 && isMarketOpen('US')) {
      for (let i = 0; i < usSymbols.length; i += 5) {
        const batch = usSymbols.slice(i, i + 5);
        const tickers = batch.flatMap(s => [`NASDAQ:${s}`, `NYSE:${s}`, `AMEX:${s}`]);
        
        const res = await fetch('https://scanner.tradingview.com/america/scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            symbols: { tickers },
            columns: ["name", "close", "change", "volume"]
          })
        });
        
        if (res.status === 429) {
          console.warn('TradingView US Scan: Rate limited (429). Backing off.');
          await new Promise(resolve => setTimeout(resolve, 60000));
        } else if (res.ok) {
          const data = await res.json();
          if (data.data) {
            for (const item of data.data) {
              const name = item.d[0];
              const price = item.d[1];
              const change = item.d[2];
              const volume = item.d[3];
              
              const originalSym = batch.find(s => s === name);
              if (originalSym && price > 0) {
                const msg = JSON.stringify({
                  type: 'tick',
                  symbol: originalSym,
                  price,
                  change,
                  volume,
                  time: Date.now()
                });
                for (const [ws, subs] of subscriptions.entries()) {
                  if (subs.has(originalSym) && ws.readyState === WebSocket.OPEN) {
                    ws.send(msg);
                  }
                }
              }
            }
          }
        }
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  } catch (e) {
    console.error('TradingView WS Polling Error:', e);
  }
  
  // Schedule next poll with jitter (60s to 90s)
  const nextPoll = 60000 + Math.random() * 30000;
  setTimeout(pollTradingView, nextPoll);
}

// Start polling
pollTradingView();

// Vite middleware
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
