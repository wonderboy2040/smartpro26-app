import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

const app = express();
const PORT = 3000;
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

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

// --- NSE API Helper ---
let nseCookies = '';
const nseHeaders = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/get-quotes/equity?symbol=NIFTY',
  'Origin': 'https://www.nseindia.com'
};

async function getNseCookies() {
  try {
    const response = await fetch('https://www.nseindia.com', { headers: nseHeaders });
    const cookies = response.headers.getSetCookie();
    if (cookies && cookies.length > 0) {
      nseCookies = cookies.map(c => c.split(';')[0]).join('; ');
    }
  } catch (e) {
    console.error('Failed to get NSE cookies', e);
  }
}

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

app.get('/api/nse/quote/:symbol', async (req, res) => {
  let symbol = req.params.symbol.replace('.NS', '').toUpperCase();
  
  try {
    if (!nseCookies) await getNseCookies();
    
    let response = await fetch(`https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`, {
      headers: { ...nseHeaders, 'Cookie': nseCookies }
    });
    
    if (response.status === 401 || response.status === 403) {
      console.log('NSE API returned', response.status, 'refreshing cookies');
      await getNseCookies();
      response = await fetch(`https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`, {
        headers: { ...nseHeaders, 'Cookie': nseCookies }
      });
    }
    
    if (!response.ok) {
      const text = await response.text();
      console.error(`NSE API returned ${response.status}: ${text}`);
      throw new Error(`NSE API returned ${response.status}`);
    }
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('NSE Fetch Error:', error);
    res.status(500).json({ error: 'Failed to fetch from NSE' });
  }
});

app.get('/api/nse/chart/:symbol', async (req, res) => {
  let symbol = req.params.symbol.replace('.NS', '').toUpperCase();
  
  try {
    if (!nseCookies) await getNseCookies();
    
    // First get the quote to get the exact identifier
    let quoteRes = await fetch(`https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`, {
      headers: { ...nseHeaders, 'Cookie': nseCookies }
    });
    
    if (quoteRes.status === 401 || quoteRes.status === 403) {
      await getNseCookies();
      quoteRes = await fetch(`https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(symbol)}`, {
        headers: { ...nseHeaders, 'Cookie': nseCookies }
      });
    }
    
    if (!quoteRes.ok) throw new Error(`NSE Quote API returned ${quoteRes.status}`);
    const quoteData = await quoteRes.json();
    const identifier = quoteData?.info?.identifier || (symbol + 'EQN');
    
    let response = await fetch(`https://www.nseindia.com/api/chart-databyindex?index=${encodeURIComponent(identifier)}`, {
      headers: { ...nseHeaders, 'Cookie': nseCookies }
    });
    
    if (!response.ok) throw new Error(`NSE Chart API returned ${response.status}`);
    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error('NSE Chart Fetch Error:', error);
    res.status(500).json({ error: 'Failed to fetch chart from NSE' });
  }
});

// --- US API Helper (Nasdaq) ---
app.get('/api/us/quote/:symbol', async (req, res) => {
  const symbol = req.params.symbol.toUpperCase();
  try {
    const fetchWithRetry = async (assetClass: string) => {
      const response = await fetch(`https://api.nasdaq.com/api/quote/${symbol}/info?assetclass=${assetClass}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Origin': 'https://www.nasdaq.com',
          'Referer': 'https://www.nasdaq.com/'
        }
      });
      if (!response.ok) throw new Error(`Nasdaq API returned ${response.status}`);
      
      const contentType = response.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        throw new Error('Response is not JSON');
      }
      
      return await response.json();
    };

    try {
      const data = await fetchWithRetry('etf');
      res.json(data);
    } catch (e) {
      // Fallback to stock
      const data = await fetchWithRetry('stocks');
      res.json(data);
    }
  } catch (error) {
    console.error('US Fetch Error:', error);
    res.status(500).json({ error: 'Failed to fetch from US Market' });
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

// Polling loop for real-time updates
setInterval(async () => {
  if (activeSymbols.size === 0) return;
  
  for (const symbol of activeSymbols) {
    try {
      const s = symbol.toUpperCase();
      const isIN = s.endsWith('.NS') || 
                   s.endsWith('.BO') || 
                   s.includes('BEES') || 
                   s.includes('MOMOMENTUM') || 
                   s.includes('NIFTY') || 
                   s.includes('SENSEX') ||
                   s.includes('SMALLCAP') ||
                   s.includes('MIDCAP');
      const cleanSym = symbol.replace('.NS', '').replace('.BO', '');
      
      let price = 0;
      let change = 0;
      let volume = 0;
      
      if (isIN) {
        if (!nseCookies) await getNseCookies();
        let res = await fetch(`https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(cleanSym)}`, {
          headers: { ...nseHeaders, 'Cookie': nseCookies }
        });
        if (res.status === 401 || res.status === 403) {
          await getNseCookies();
          res = await fetch(`https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(cleanSym)}`, {
            headers: { ...nseHeaders, 'Cookie': nseCookies }
          });
        }
        if (res.ok) {
          const data = await res.json();
          price = data.priceInfo?.lastPrice || 0;
          change = data.priceInfo?.pChange || 0;
          volume = data.preOpenMarket?.totalTradedVolume || 0;
        }
      } else {
        const res = await fetch(`https://api.nasdaq.com/api/quote/${cleanSym}/info?assetclass=etf`, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Origin': 'https://www.nasdaq.com',
            'Referer': 'https://www.nasdaq.com/'
          }
        });
        if (res.ok) {
          const data = await res.json();
          const primaryData = data?.data?.primaryData || {};
          price = parseFloat(primaryData.lastSalePrice?.replace('$', '')) || 0;
          change = parseFloat(primaryData.percentageChange?.replace('%', '')) || 0;
          volume = parseInt(primaryData.volume?.replace(/,/g, '')) || 0;
        } else {
          // Fallback to stock
          const stockRes = await fetch(`https://api.nasdaq.com/api/quote/${cleanSym}/info?assetclass=stocks`, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'application/json, text/plain, */*',
              'Origin': 'https://www.nasdaq.com',
              'Referer': 'https://www.nasdaq.com/'
            }
          });
          if (stockRes.ok) {
            const data = await stockRes.json();
            const primaryData = data?.data?.primaryData || {};
            price = parseFloat(primaryData.lastSalePrice?.replace('$', '')) || 0;
            change = parseFloat(primaryData.percentageChange?.replace('%', '')) || 0;
            volume = parseInt(primaryData.volume?.replace(/,/g, '')) || 0;
          }
        }
      }
      
      if (price > 0) {
        const update = {
          type: 'tick',
          symbol,
          price,
          change,
          volume,
          time: Date.now()
        };
        
        // Broadcast to subscribers
        const msg = JSON.stringify(update);
        for (const [ws, subs] of subscriptions.entries()) {
          if (subs.has(symbol) && ws.readyState === WebSocket.OPEN) {
            ws.send(msg);
          }
        }
      }
    } catch (e) {
      console.error(`WS Polling Error for ${symbol}:`, e);
    }
  }
}, 1000); // Poll every 1 second for ultra-fast updates

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
