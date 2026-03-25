/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import * as React from 'react';
import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  TrendingUp, 
  Search, 
  LayoutDashboard, 
  Briefcase, 
  Target, 
  Globe, 
  Settings, 
  Plus, 
  X, 
  Zap, 
  Shield, 
  Lock,
  MessageSquare,
  Activity,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  Terminal,
  ChevronRight,
  PieChart as PieChartIcon,
  BarChart3,
  User as UserIcon,
  Send,
  Sparkles,
  BrainCircuit,
  Globe2,
  Cpu,
  Fingerprint,
  Database,
  Layers,
  Command,
  Volume2,
  VolumeX,
  Mic,
  Waves
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis
} from 'recharts';
import { GoogleGenAI, ThinkingLevel, Modality, FunctionDeclaration, Type } from "@google/genai";
import { 
  db, 
  collections,
  addAsset,
  deleteAsset,
  addLog as addFirestoreLog,
  addChatMessage,
  onSnapshot,
  query,
  testConnection
} from './firebase';

// --- Error Boundary ---
export class ErrorBoundary extends React.Component<any, any> {
  constructor(props: any) {
    super(props);
    (this as any).state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    const state = (this as any).state;
    if (state.hasError) {
      let errorMessage = "An unexpected error occurred.";
      try {
        const parsed = JSON.parse(state.error.message);
        if (parsed.error) errorMessage = `Firestore Error: ${parsed.error}`;
      } catch (e) {
        errorMessage = state.error.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-center">
          <div className="bg-slate-900 border border-red-500/50 p-8 rounded-3xl max-w-md">
            <AlertTriangle className="text-red-500 mx-auto mb-4" size={48} />
            <h2 className="text-2xl font-bold text-white mb-2 uppercase tracking-tighter">System Failure</h2>
            <p className="text-slate-400 mb-6 text-sm font-mono">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="bg-red-500 text-white px-6 py-2 rounded-xl font-bold hover:bg-red-600 transition-colors"
            >
              Reboot System
            </button>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

// --- Constants & Config ---
const COLORS = ['#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899', '#f43f5e', '#f59e0b', '#10b981'];

const ALPHA_ETFS_IN = [
  { sym: 'JUNIORBEES.NS', name: 'Nifty Junior BeES', cagr: 18.5 },
  { sym: 'MOMOMENTUM.NS', name: 'Nifty 200 Momentum 30', cagr: 22.5 },
  { sym: 'SMALLCAP.NS', name: 'Nifty Smallcap 250', cagr: 26.5 },
  { sym: 'MID150BEES.NS', name: 'Nifty Midcap 150', cagr: 21.0 }
];

const ALPHA_ETFS_US = [
  { sym: 'SMH', name: 'VanEck Semiconductor', cagr: 28.5 },
  { sym: 'QQQM', name: 'Invesco NASDAQ 100', cagr: 19.5 },
  { sym: 'XLK', name: 'Technology Select SPDR', cagr: 20.5 }
];

// --- Types ---
interface Asset {
  id: string;
  symbol: string;
  market: 'IN' | 'US';
  qty: number;
  avgPrice: number;
  leverage: number;
  dateAdded: string;
}

interface PriceData {
  price: number;
  change: number;
  rsi?: number;
  time: number;
  market: 'IN' | 'US';
  fundamentals?: {
    open?: number;
    high?: number;
    low?: number;
    vwap?: number;
    preMarket?: number;
    volume?: number;
    peRatio?: number;
    marketCap?: string;
  };
}

interface LogEntry {
  id: string;
  msg: string;
  type: 'info' | 'warn' | 'success' | 'error';
  time: string;
}

// --- Helper Functions ---
const formatCurrency = (val: number, market: 'IN' | 'US', usdInr: number) => {
  if (market === 'IN') {
    return `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
  }
  return `$${val.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
};

const formatINR = (val: number) => `₹${Math.round(val).toLocaleString('en-IN')}`;

const guessMarket = (sym: string): 'IN' | 'US' => {
  const s = sym.toUpperCase();
  if (
    s.includes('.NS') || 
    s.includes('.BO') || 
    s.includes('BEES') || 
    s.includes('MOMOMENTUM') || 
    s.includes('NIFTY') || 
    s.includes('SENSEX') ||
    s.includes('SMALLCAP') ||
    s.includes('MIDCAP')
  ) return 'IN';
  return 'US';
};

const getFinancialNews: FunctionDeclaration = {
  name: "getFinancialNews",
  description: "Fetch the latest financial news articles and headlines for a specific asset, stock, crypto, or general market trend. Use this to analyze sentiment and provide informed responses.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: {
        type: Type.STRING,
        description: "The search query, e.g., 'AAPL', 'Bitcoin', 'Indian Stock Market', 'Nifty 50'"
      }
    },
    required: ["query"]
  }
};

// --- Main Component ---
export default function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'portfolio' | 'planner' | 'macro'>('dashboard');
  const [portfolio, setPortfolio] = useState<Asset[]>([]);
  const [livePrices, setLivePrices] = useState<Record<string, PriceData>>({});
  const [usdInr, setUsdInr] = useState(83.50);
  const [currentSymbol, setCurrentSymbol] = useState('ITBEES.NS');
  const [searchInput, setSearchInput] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [modalSymbol, setModalSymbol] = useState('');
  const [modalQty, setModalQty] = useState('');
  const [modalPrice, setModalPrice] = useState('');
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState<{role: string, text: string}[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const [neuralVerdict, setNeuralVerdict] = useState<{text: string, score: number} | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [chartData, setChartData] = useState<{time: number, price: number}[]>([]);
  const [timeframe, setTimeframe] = useState('1D');
  
  const DEFAULT_USER_ID = 'default_user';
  
  // --- WebSocket Connection ---
  useEffect(() => {
    // Clear chart data when symbol changes to prevent flickering old data
    setChartData([]);
    
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      const currentPrice = livePrices[`${guessMarket(currentSymbol)}_${currentSymbol}`]?.price;
      ws.send(JSON.stringify({ 
        type: 'subscribe', 
        symbol: currentSymbol,
        market: guessMarket(currentSymbol),
        currentPrice: currentPrice || null,
        timeframe: timeframe
      }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'history' && data.symbol === currentSymbol) {
          // Sort by time ascending
          const sorted = data.data.sort((a: any, b: any) => a.time - b.time);
          setChartData(sorted);
        } else if (data.type === 'tick' && data.symbol === currentSymbol) {
          setChartData(prev => {
            const newPoint = { time: data.time, price: data.price };
            const newData = [...prev, newPoint];
            // Keep last 100 points to avoid memory bloat
            if (newData.length > 100) return newData.slice(newData.length - 100);
            return newData;
          });
          
          // Also update livePrices
          setLivePrices(prev => ({
            ...prev,
            [`${guessMarket(currentSymbol)}_${currentSymbol}`]: {
              ...(prev[`${guessMarket(currentSymbol)}_${currentSymbol}`] || {
                price: 0, change: 0, rsi: 50, time: Date.now(), market: guessMarket(currentSymbol)
              }),
              price: data.price,
              change: data.change,
              time: data.time,
              market: guessMarket(currentSymbol)
            }
          }));
        }
      } catch (e) {
        console.error("WS Parse Error", e);
      }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'unsubscribe', symbol: currentSymbol }));
      }
      ws.close();
    };
  }, [currentSymbol, timeframe]);

  // Planner State
  const [sipAmount, setSipAmount] = useState(50000);
  const [years, setYears] = useState(10);
  const [expectedReturn, setExpectedReturn] = useState(15);

  const addLog = (msg: string, type: LogEntry['type'] = 'info') => {
    addFirestoreLog(DEFAULT_USER_ID, msg, type);
  };

  // --- Firestore Sync ---
  useEffect(() => {
    testConnection();
  }, []);

  useEffect(() => {
    const unsubPortfolio = onSnapshot(collections.portfolio(DEFAULT_USER_ID), (snapshot) => {
      const assets = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Asset));
      setPortfolio(assets);
    });

    const unsubLogs = onSnapshot(query(collections.logs(DEFAULT_USER_ID)), (snapshot) => {
      const newLogs = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          msg: data.msg,
          type: data.type,
          time: new Date(data.timestamp).toLocaleTimeString([], { hour12: false })
        } as LogEntry;
      }).sort((a, b) => b.time.localeCompare(a.time));
      setLogs(newLogs.slice(0, 50));
    });

    const unsubChat = onSnapshot(query(collections.chatHistory(DEFAULT_USER_ID)), (snapshot) => {
      const history = snapshot.docs.map(doc => doc.data() as {role: string, text: string, timestamp: string})
        .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
        .map(({role, text}) => ({role, text}));
      setChatMessages(history);
    });

    return () => {
      unsubPortfolio();
      unsubLogs();
      unsubChat();
    };
  }, []);

  // --- Neural Scan Logic ---
  const handleNeuralScan = async () => {
    const targetSymbol = searchInput.trim() ? searchInput.trim().toUpperCase() : currentSymbol;
    if (!targetSymbol) return;
    
    if (targetSymbol !== currentSymbol) {
      setCurrentSymbol(targetSymbol);
    }
    
    setIsScanning(true);
    setNeuralVerdict(null);
    addLog(`Initializing Neural Deep Scan for ${targetSymbol}...`, 'info');
    
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze ${targetSymbol}. Provide a pro-level neural verdict in Hinglish. 
        Return JSON format: { "verdict": "string", "score": number (0-100) }. 
        Score represents neural confidence/bullishness.`,
        config: {
          systemInstruction: "You are the Deep Mind AI. Return ONLY JSON.",
          responseMimeType: "application/json"
        }
      });
      
      const result = JSON.parse(response.text || "{}");
      setNeuralVerdict({ text: result.verdict || "Scan failed.", score: result.score || 50 });
      addLog(`Neural Scan for ${targetSymbol} complete. Score: ${result.score}`, 'success');
      
      // Auto-speak the verdict
      speakText(result.verdict);
    } catch (e) {
      console.error("Scan Error:", e);
      addLog("Neural Scan failed. Check connection.", "error");
    } finally {
      setIsScanning(false);
    }
  };

  const speakText = async (text: string) => {
    if (!text) return;
    setIsSpeaking(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text: `Say in a professional, slightly robotic AI voice: ${text}` }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Fenrir' } }
          }
        }
      });

      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        try {
          const binaryString = window.atob(base64Audio);
          const len = binaryString.length;
          const bytes = new Uint8Array(len);
          for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
          }
          
          // Try to play as raw PCM 16-bit 24000Hz
          const int16Array = new Int16Array(bytes.buffer);
          const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
          const audioBuffer = audioContext.createBuffer(1, int16Array.length, 24000);
          const channelData = audioBuffer.getChannelData(0);
          
          for (let i = 0; i < int16Array.length; i++) {
            channelData[i] = int16Array[i] / 32768.0;
          }
          
          const source = audioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(audioContext.destination);
          source.start();
          source.onended = () => setIsSpeaking(false);
        } catch (err) {
          console.error("Audio playback error:", err);
          setIsSpeaking(false);
        }
      }
    } catch (e) {
      console.error("TTS Error:", e);
      setIsSpeaking(false);
    }
  };

  // --- Gemini AI Logic ---
  const handleChat = async () => {
    if (!chatInput.trim()) return;

    const prompt = chatInput;
    setChatInput('');
    await addChatMessage(DEFAULT_USER_ID, 'user', prompt);
    setIsThinking(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      // Determine complexity for model selection
      const isComplex = prompt.length > 100 || prompt.toLowerCase().includes('analyze') || prompt.toLowerCase().includes('strategy');
      const modelName = isComplex ? "gemini-3.1-pro-preview" : "gemini-3-flash-preview";
      
      const config: any = {
        systemInstruction: `You are the Deep Mind AI, the core intelligence of the Wealth AI Pro Trading Terminal. 
        Your persona:
        - Professional, data-driven, and highly analytical.
        - Use Hinglish (mix of Hindi and English) naturally to explain complex concepts.
        - You have access to real-time market data and global risk indicators.
        - Provide actionable insights, not just generic advice.
        - If asked about specific stocks/crypto, provide a 'Neural Verdict' with risk/reward ratios.
        - Use search grounding for up-to-the-minute news.
        - When asked about market trends or specific assets, ALWAYS use the getFinancialNews tool to fetch recent articles, summarize them, and analyze the sentiment from the headlines.`,
        tools: [
          { googleSearch: {} },
          { functionDeclarations: [getFinancialNews] }
        ],
        toolConfig: { includeServerSideToolInvocations: true }
      };

      if (isComplex) {
        config.thinkingConfig = { thinkingLevel: ThinkingLevel.HIGH };
      }

      const formattedContents = [...chatMessages, { role: 'user', text: prompt }].map(msg => ({
        role: msg.role === 'model' ? 'model' : 'user',
        parts: [{ text: msg.text }]
      }));

      let response = await ai.models.generateContent({
        model: modelName,
        contents: formattedContents,
        config
      });

      if (response.functionCalls && response.functionCalls.length > 0) {
        const call = response.functionCalls[0];
        if (call.name === 'getFinancialNews') {
          const args = call.args as any;
          addLog(`Fetching neural news streams for ${args.query}...`, 'info');
          try {
            const newsRes = await fetch(`/api/news/${encodeURIComponent(args.query)}`);
            const newsData = await newsRes.json();
            
            const previousContent = response.candidates?.[0]?.content;
            if (previousContent) {
              formattedContents.push(previousContent as any);
            }
            formattedContents.push({
              role: 'user',
              parts: [{
                functionResponse: {
                  name: 'getFinancialNews',
                  response: { news: newsData }
                }
              }]
            } as any);

            response = await ai.models.generateContent({
              model: modelName,
              contents: formattedContents,
              config
            });
          } catch (e) {
            console.error("News fetch error", e);
          }
        }
      }

      const aiText = response.text || "I'm sorry, I couldn't process that request.";
      await addChatMessage(DEFAULT_USER_ID, 'model', aiText);
    } catch (e) {
      console.error("Gemini Error:", e);
      await addChatMessage(DEFAULT_USER_ID, 'model', "System error: Neural link unstable. Please try again.");
    } finally {
      setIsThinking(false);
    }
  };

  // --- Sync Logic ---
  const fetchPrices = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    addLog(`Initiating Neural Sync for ${portfolio.length + 1} instruments...`, 'info');
    
    try {
      const symbols = [...new Set([
        ...portfolio.map(p => p.symbol),
        currentSymbol,
        ...ALPHA_ETFS_IN.map(e => e.sym),
        ...ALPHA_ETFS_US.map(e => e.sym)
      ])].filter(Boolean);

      const fetchedPrices: Record<string, PriceData> = {};
      
      for (const sym of symbols) {
        try {
          const mkt = guessMarket(sym);
          const cleanSym = sym.replace('.NS', '').replace('.BO', '');
          const key = `${mkt}_${sym}`;
          
          if (mkt === 'IN') {
            const res = await fetch(`/api/nse/quote/${cleanSym}`);
            if (res.ok) {
              const data = await res.json();
              const priceInfo = data.priceInfo || {};
              fetchedPrices[key] = {
                price: priceInfo.lastPrice || 0,
                change: priceInfo.pChange || 0,
                rsi: 50,
                time: Date.now(),
                market: 'IN',
                fundamentals: {
                  open: priceInfo.open,
                  high: priceInfo.intraDayHighLow?.max,
                  low: priceInfo.intraDayHighLow?.min,
                  vwap: priceInfo.vwap,
                  preMarket: data.preOpenMarket?.preopen?.[0]?.price,
                  volume: data.preOpenMarket?.totalTradedVolume,
                }
              };
            }
          } else {
            const res = await fetch(`/api/us/quote/${cleanSym}`);
            if (res.ok) {
              const data = await res.json();
              const primaryData = data?.data?.primaryData || {};
              const priceStr = primaryData.lastSalePrice?.replace('$', '') || '0';
              const changeStr = primaryData.percentageChange?.replace('%', '') || '0';
              fetchedPrices[key] = {
                price: parseFloat(priceStr) || 0,
                change: parseFloat(changeStr) || 0,
                rsi: 50,
                time: Date.now(),
                market: 'US',
                fundamentals: {
                  open: parseFloat(data?.data?.primaryData?.openPrice?.replace('$', '')) || undefined,
                  high: parseFloat(data?.data?.primaryData?.highPrice?.replace('$', '')) || undefined,
                  low: parseFloat(data?.data?.primaryData?.lowPrice?.replace('$', '')) || undefined,
                  volume: parseInt(data?.data?.primaryData?.volume?.replace(/,/g, '')) || undefined,
                }
              };
            }
          }
        } catch (err) {
          console.error(`Error fetching ${sym}`, err);
        }
      }
      
      setLivePrices(prev => {
        const newPrices = { ...prev };
        for (const [key, data] of Object.entries(fetchedPrices)) {
          newPrices[key] = {
            ...newPrices[key],
            ...data,
            // Preserve existing price if fetch returned 0
            price: data.price || newPrices[key]?.price || 0,
            change: data.change || newPrices[key]?.change || 0,
          };
        }
        
        // Fallback for any symbols that failed to fetch
        for (const sym of symbols) {
          const mkt = guessMarket(sym);
          const key = `${mkt}_${sym}`;
          if (!newPrices[key] || newPrices[key].price === 0) {
             newPrices[key] = {
               price: newPrices[key]?.price || 100,
               change: newPrices[key]?.change || 0,
               rsi: newPrices[key]?.rsi || 50,
               time: Date.now(),
               market: mkt
             };
          }
        }
        return newPrices;
      });
      
      addLog(`Neural Sync Complete. Fetched real prices.`, 'success');
      
      // Fetch Forex (Real API)
      try {
        const fxRes = await fetch('https://open.er-api.com/v6/latest/USD').then(r => r.json());
        if (fxRes?.rates?.INR) setUsdInr(fxRes.rates.INR);
      } catch (e) {
        addLog("Forex fetch failed, using fallback", "warn");
      }

    } catch (e) {
      addLog("Neural Sync Error: Connection Interrupted", "error");
    } finally {
      setIsSyncing(false);
    }
  };

  useEffect(() => {
    fetchPrices();
    const timer = setInterval(fetchPrices, 60000);
    return () => clearInterval(timer);
  }, [portfolio, currentSymbol]);

  // Ultra-fast 100ms simulated tick for the "matrix" feel
  useEffect(() => {
    const fastTimer = setInterval(() => {
      setLivePrices(prev => {
        const next = { ...prev };
        let changed = false;
        for (const key in next) {
          if (next[key] && next[key].price > 0) {
            // Random jitter between -0.005% and +0.005%
            const jitter = 1 + (Math.random() - 0.5) * 0.0001;
            next[key] = {
              ...next[key],
              price: next[key].price * jitter
            };
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    }, 100); // 100ms feels ultra-fast
    return () => clearInterval(fastTimer);
  }, []);

  // --- Calculations ---
  const totals = useMemo(() => {
    let invested = 0;
    let current = 0;
    let todayPL = 0;

    portfolio.forEach(p => {
      const mkt = p.market || guessMarket(p.symbol);
      const price = livePrices[`${mkt}_${p.symbol}`]?.price || p.avgPrice;
      const change = livePrices[`${mkt}_${p.symbol}`]?.change || 0;
      const rate = mkt === 'IN' ? 1 : usdInr;

      const posSize = p.avgPrice * p.qty;
      const inv = posSize / (p.leverage || 1);
      const val = price * p.qty;
      const equity = inv + (val - posSize);

      invested += inv * rate;
      current += equity * rate;
      
      const prevPrice = price / (1 + (change / 100));
      todayPL += (price - prevPrice) * p.qty * rate;
    });

    return { invested, current, pl: current - invested, todayPL };
  }, [portfolio, livePrices, usdInr]);

  const allocationData = useMemo(() => {
    const data: Record<string, number> = {};
    portfolio.forEach(p => {
      const mkt = p.market || guessMarket(p.symbol);
      const price = livePrices[`${mkt}_${p.symbol}`]?.price || p.avgPrice;
      const rate = mkt === 'IN' ? 1 : usdInr;
      const val = price * p.qty * rate;
      data[p.symbol] = (data[p.symbol] || 0) + val;
    });
    return Object.entries(data).map(([name, value]) => ({ name, value }));
  }, [portfolio, livePrices, usdInr]);

  const plannerData = useMemo(() => {
    const data = [];
    let balance = 0;
    const monthlyRate = expectedReturn / 100 / 12;
    for (let i = 0; i <= years * 12; i++) {
      if (i % 12 === 0) {
        data.push({
          year: i / 12,
          balance: Math.round(balance),
          invested: sipAmount * i
        });
      }
      balance = (balance + sipAmount) * (1 + monthlyRate);
    }
    return data;
  }, [sipAmount, years, expectedReturn]);

  // --- Handlers ---
  const handleAddAsset = async () => {
    if (!modalSymbol || !modalQty || !modalPrice) return;
    
    const newAsset = {
      symbol: modalSymbol.toUpperCase(),
      market: guessMarket(modalSymbol),
      qty: parseFloat(modalQty),
      avgPrice: parseFloat(modalPrice),
      leverage: 1,
      dateAdded: new Date().toISOString().split('T')[0]
    };

    await addAsset(DEFAULT_USER_ID, newAsset);
    setShowAddModal(false);
    addLog(`Asset ${newAsset.symbol} initialized in Neural Database.`, "success");
    setModalSymbol('');
    setModalQty('');
    setModalPrice('');
  };

  const handleRemoveAsset = async (id: string) => {
    const asset = portfolio.find(a => a.id === id);
    await deleteAsset(DEFAULT_USER_ID, id);
    addLog(`Asset ${asset?.symbol} purged from Neural Database.`, "warn");
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-cyan-500/30 pb-32 lg:pb-0 relative overflow-x-hidden">
      {/* Scanline Effect */}
      <div className="scanline" />
      <div className="fixed inset-0 data-grid-bg pointer-events-none opacity-20" />

      {/* Hidden Audio Element */}
      
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800">
        <div className="container mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-cyan-600 rounded-2xl flex items-center justify-center shadow-lg shadow-cyan-900/40">
              <Zap className="text-white" size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter text-white uppercase">Wealth AI</h1>
              <div className="flex items-center gap-2 text-[10px] font-black text-cyan-500 uppercase tracking-widest">
                <span className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-500 animate-pulse' : 'bg-cyan-500'}`} />
                {isSyncing ? 'Neural Sync Active' : 'Quantum Link Stable'}
              </div>
            </div>
          </div>

          <nav className="hidden lg:flex bg-slate-900/50 p-1.5 rounded-[1.5rem] border border-slate-800">
            {[
              { id: 'dashboard', icon: LayoutDashboard, label: 'Neural Hub' },
              { id: 'portfolio', icon: Briefcase, label: 'Portfolio' },
              { id: 'planner', icon: Target, label: 'Wealth Planner' },
              { id: 'macro', icon: Globe, label: 'Global Risk' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-black transition-all uppercase tracking-wider ${
                  activeTab === tab.id ? 'bg-cyan-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'
                }`}
              >
                <tab.icon size={16} />
                {tab.label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            <div className="hidden sm:block text-right">
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Live USD/INR</div>
              <div className="text-base font-black text-emerald-400 font-mono">₹{usdInr.toFixed(3)}</div>
            </div>
            <div className="flex items-center gap-3 bg-slate-900 p-1.5 rounded-2xl border border-slate-800">
              <div className="p-2 text-slate-400">
                <Shield size={18} className="text-cyan-500" />
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-10">
        {/* Top Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-10">
          {[
            { label: 'Net Equity', val: formatINR(totals.current), color: 'text-white' },
            { label: 'Total P&L', val: formatINR(totals.pl), color: totals.pl >= 0 ? 'text-emerald-400' : 'text-red-400' },
            { label: "Today's P&L", val: formatINR(totals.todayPL), color: totals.todayPL >= 0 ? 'text-emerald-400' : 'text-red-400' },
            { label: 'Capital Deployed', val: formatINR(totals.invested), color: 'text-slate-500' }
          ].map((stat, i) => (
            <motion.div 
              key={i} 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="bg-slate-900/40 border border-slate-800 p-6 rounded-[2rem] shadow-sm"
            >
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">{stat.label}</div>
              <div className={`text-2xl sm:text-3xl font-black font-mono tracking-tight ${stat.color}`}>{stat.val}</div>
            </motion.div>
          ))}
        </div>

        {/* Dynamic Content */}
        <AnimatePresence mode="wait">
          {activeTab === 'dashboard' && (
            <motion.div 
              key="dashboard"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-10"
            >
              {/* Search & Scan */}
              <div className="bg-slate-900/60 border border-slate-800 p-2.5 rounded-[2.5rem] flex items-center gap-3 shadow-inner">
                <div className="flex-1 relative">
                  <Search className="absolute left-8 top-1/2 -translate-y-1/2 text-slate-500" size={24} />
                  <input 
                    type="text" 
                    placeholder="Initialize Deep Scan (e.g. AAPL, RELIANCE)"
                    className="w-full bg-transparent py-6 pl-20 pr-8 text-xl font-black text-white outline-none placeholder:text-slate-700 uppercase tracking-wide"
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && searchInput.trim()) {
                        setCurrentSymbol(searchInput.trim().toUpperCase());
                      }
                    }}
                  />
                </div>
                <button 
                  onClick={handleNeuralScan}
                  disabled={isScanning}
                  className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black px-12 py-6 rounded-[1.8rem] transition-all uppercase tracking-widest text-sm shadow-lg shadow-cyan-900/20 flex items-center gap-3 disabled:opacity-50"
                >
                  {isScanning ? <RefreshCw className="animate-spin" size={18} /> : <Zap size={18} />}
                  {isScanning ? 'Scanning...' : 'Deep Scan'}
                </button>
              </div>

              <div className="grid lg:grid-cols-3 gap-10">
                {/* Main Scan Result */}
                <div className="lg:col-span-2 space-y-8">
                  <div className="bg-slate-900/80 border border-slate-800 rounded-[2.5rem] p-10 relative overflow-hidden shadow-xl">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-cyan-600/5 rounded-full blur-[100px]" />
                    <div className="relative z-10">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-10 gap-6">
                        <div>
                          <h2 className="text-5xl font-black text-white tracking-tighter uppercase">{currentSymbol.replace('.NS', '')}</h2>
                          <p className="text-slate-500 font-black uppercase tracking-widest text-[10px] mt-2 flex items-center gap-2">
                            <span className="w-2 h-2 bg-cyan-500 rounded-full animate-pulse" />
                            Global Neural Instrument Matrix
                          </p>
                        </div>
                        <div className="text-left sm:text-right">
                          <div className={`text-4xl font-black font-mono tracking-tighter ${livePrices[`${guessMarket(currentSymbol)}_${currentSymbol}`]?.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                            {formatCurrency(livePrices[`${guessMarket(currentSymbol)}_${currentSymbol}`]?.price || 0, guessMarket(currentSymbol), usdInr)}
                          </div>
                          <div className={`flex items-center sm:justify-end gap-1 font-black text-lg ${livePrices[`${guessMarket(currentSymbol)}_${currentSymbol}`]?.change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            {livePrices[`${guessMarket(currentSymbol)}_${currentSymbol}`]?.change >= 0 ? <TrendingUp size={20} /> : <Activity size={20} />}
                            {livePrices[`${guessMarket(currentSymbol)}_${currentSymbol}`]?.change >= 0 ? '+' : ''}{livePrices[`${guessMarket(currentSymbol)}_${currentSymbol}`]?.change.toFixed(2)}%
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-10">
                        <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-3xl shadow-inner">
                          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Pre-Market / Open</div>
                          <div className="text-xl font-black text-cyan-400 uppercase tracking-tight">
                            {livePrices[`${guessMarket(currentSymbol)}_${currentSymbol}`]?.fundamentals?.preMarket 
                              ? formatCurrency(livePrices[`${guessMarket(currentSymbol)}_${currentSymbol}`].fundamentals!.preMarket!, guessMarket(currentSymbol), usdInr)
                              : livePrices[`${guessMarket(currentSymbol)}_${currentSymbol}`]?.fundamentals?.open 
                                ? formatCurrency(livePrices[`${guessMarket(currentSymbol)}_${currentSymbol}`].fundamentals!.open!, guessMarket(currentSymbol), usdInr)
                                : 'N/A'}
                          </div>
                        </div>
                        <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-3xl shadow-inner">
                          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Day High / Low</div>
                          <div className="text-xl font-black text-emerald-400 uppercase tracking-tight">
                            {livePrices[`${guessMarket(currentSymbol)}_${currentSymbol}`]?.fundamentals?.high 
                              ? `${formatCurrency(livePrices[`${guessMarket(currentSymbol)}_${currentSymbol}`].fundamentals!.high!, guessMarket(currentSymbol), usdInr)} / ${formatCurrency(livePrices[`${guessMarket(currentSymbol)}_${currentSymbol}`].fundamentals!.low!, guessMarket(currentSymbol), usdInr)}`
                              : 'N/A'}
                          </div>
                        </div>
                        <div className="bg-slate-950/50 border border-slate-800 p-6 rounded-3xl shadow-inner">
                          <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">Volume</div>
                          <div className="text-xl font-black text-white font-mono tracking-tight">
                            {livePrices[`${guessMarket(currentSymbol)}_${currentSymbol}`]?.fundamentals?.volume 
                              ? livePrices[`${guessMarket(currentSymbol)}_${currentSymbol}`].fundamentals!.volume!.toLocaleString()
                              : 'N/A'}
                          </div>
                        </div>
                      </div>

                      <div className="bg-emerald-500/5 border border-emerald-500/20 p-8 rounded-[2rem] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                        <div>
                          <div className="text-emerald-400 font-black uppercase tracking-widest text-[10px] mb-2 flex items-center gap-2">
                            <Zap size={14} />
                            Execution Verdict
                          </div>
                          <p className="text-white font-bold text-lg leading-tight">Deep value zone detected. Optimal for SIP deployment.</p>
                        </div>
                        <button 
                          onClick={() => {
                            setModalSymbol(currentSymbol);
                            setModalPrice((livePrices[`${guessMarket(currentSymbol)}_${currentSymbol}`]?.price || 0).toString());
                            setShowAddModal(true);
                          }}
                          className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-500 text-white font-black px-10 py-4 rounded-2xl transition-all uppercase text-xs tracking-widest shadow-lg shadow-emerald-900/20"
                        >
                          Quick Buy
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Chart */}
                  <div className="bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-8 h-[450px] shadow-lg">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                        <BarChart3 size={16} className="text-cyan-400" />
                        Live Price Stream
                      </h3>
                      <div className="flex gap-2">
                        {['1M', '5M', '1H'].map(t => (
                          <button 
                            key={t} 
                            onClick={() => setTimeframe(t)}
                            className={`px-3 py-1 rounded-lg text-[10px] font-black border border-slate-800 ${timeframe === t ? 'bg-cyan-600 text-white' : 'text-slate-500'}`}
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="h-[320px] w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                          <defs>
                            <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                              <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                          <XAxis 
                            dataKey="time" 
                            stroke="#475569" 
                            fontSize={10} 
                            tickFormatter={(v) => {
                              const d = new Date(v);
                              if (timeframe === '1H') {
                                return `${d.getDate()}/${d.getMonth()+1} ${d.getHours()}:00`;
                              }
                              return `${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
                            }} 
                            minTickGap={30}
                          />
                          <YAxis 
                            domain={['auto', 'auto']}
                            stroke="#475569" 
                            fontSize={10} 
                            tickFormatter={(v) => formatCurrency(v, guessMarket(currentSymbol), usdInr)} 
                            width={80}
                          />
                          <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                            itemStyle={{ color: '#06b6d4', fontWeight: 'bold' }}
                            labelFormatter={(v) => new Date(v).toLocaleTimeString()}
                            formatter={(v: number) => [formatCurrency(v, guessMarket(currentSymbol), usdInr), 'Price']}
                          />
                          <Area type="monotone" dataKey="price" stroke="#06b6d4" fillOpacity={1} fill="url(#colorPrice)" strokeWidth={3} isAnimationActive={false} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-8">
                  {/* Neural Verdict Card */}
                  <AnimatePresence>
                    {neuralVerdict && (
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9, y: 20 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9, y: 20 }}
                        className="bg-slate-900 border border-cyan-500/30 rounded-[2.5rem] p-8 relative overflow-hidden group shadow-2xl shadow-cyan-900/40"
                      >
                        <div className="absolute top-0 right-0 p-4 flex gap-2">
                          <button 
                            onClick={() => speakText(neuralVerdict.text)} 
                            className={`p-2 rounded-lg transition-colors ${isSpeaking ? 'text-cyan-400 animate-pulse' : 'text-slate-500 hover:text-white'}`}
                          >
                            {isSpeaking ? <Waves size={16} /> : <Volume2 size={16} />}
                          </button>
                          <button onClick={() => setNeuralVerdict(null)} className="p-2 text-slate-500 hover:text-white transition-colors">
                            <X size={16} />
                          </button>
                        </div>
                        
                        <div className="flex items-center gap-3 mb-6">
                          <div className="w-10 h-10 bg-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
                            <BrainCircuit className="text-white" size={20} />
                          </div>
                          <div>
                            <h3 className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">Neural Verdict</h3>
                            <div className="text-xs font-black text-white uppercase tracking-tighter">{currentSymbol}</div>
                          </div>
                        </div>

                        <div className="mb-8">
                          <div className="flex justify-between items-end mb-2">
                            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Neural Confidence</span>
                            <span className="text-2xl font-black text-cyan-400 font-mono">{neuralVerdict.score}%</span>
                          </div>
                          <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${neuralVerdict.score}%` }}
                              className="h-full bg-gradient-to-r from-cyan-600 to-blue-500"
                            />
                          </div>
                        </div>

                        <div className="text-sm font-medium text-slate-300 leading-relaxed mb-6 bg-slate-950/50 p-4 rounded-2xl border border-white/5">
                          {neuralVerdict.text}
                        </div>
                        
                        <div className="flex items-center gap-2 text-[10px] font-black text-cyan-500 uppercase tracking-widest">
                          <Fingerprint size={12} />
                          Deep Mind Auth: {currentSymbol.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0).toString(16).toUpperCase()}X{neuralVerdict.score}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="bg-slate-900/60 border border-slate-800 rounded-[2.5rem] p-8 shadow-lg">
                    <h3 className="text-xs font-black text-white uppercase tracking-widest mb-8 flex items-center gap-3">
                      <PieChartIcon className="text-cyan-400" size={18} />
                      Asset Allocation
                    </h3>
                    <div className="h-[200px] w-full mb-6">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={allocationData.length > 0 ? allocationData : [{ name: 'Empty', value: 1 }]}
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                          >
                            {allocationData.map((entry, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                            {allocationData.length === 0 && <Cell fill="#1e293b" />}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="space-y-3">
                      {allocationData.slice(0, 4).map((item, i) => (
                        <div key={i} className="flex items-center justify-between text-[10px] font-black uppercase">
                          <div className="flex items-center gap-2">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                            <span className="text-slate-400">{item.name}</span>
                          </div>
                          <span className="text-white">{((item.value / totals.current) * 100).toFixed(1)}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="bg-gradient-to-br from-indigo-900/20 to-slate-900/80 border border-indigo-500/20 rounded-[2.5rem] p-8 shadow-xl">
                    <h3 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-6 flex items-center gap-3">
                      <MessageSquare size={18} />
                      AI Insider
                    </h3>
                    <div className="bg-black/40 p-6 rounded-2xl border border-white/5 mb-8">
                      <p className="text-slate-300 text-sm leading-relaxed font-medium italic">
                        "Market is currently in a consolidation phase. Institutional dark pools are showing heavy accumulation in tech ETFs. RSI divergence suggests a potential breakout in the next 72 hours."
                      </p>
                    </div>
                    <button className="w-full bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 font-black py-4 rounded-2xl border border-indigo-500/30 transition-all text-[10px] uppercase tracking-widest shadow-sm">
                      Initialize Deep Query
                    </button>
                  </div>

                  <div className="bg-slate-900/60 border border-slate-800 rounded-[2.5rem] p-8">
                    <h3 className="text-xs font-black text-white uppercase tracking-widest mb-6">Alpha Core ETFs</h3>
                    <div className="space-y-4">
                      {ALPHA_ETFS_IN.slice(0, 3).map(etf => (
                        <div key={etf.sym} className="flex items-center justify-between p-4 bg-slate-950/30 rounded-2xl border border-white/5">
                          <div>
                            <div className="font-black text-white text-sm">{etf.sym.replace('.NS', '')}</div>
                            <div className="text-[9px] font-bold text-slate-600 uppercase">{etf.name}</div>
                          </div>
                          <div className="text-emerald-400 font-black font-mono">+{etf.cagr}%</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'portfolio' && (
            <motion.div 
              key="portfolio"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-8"
            >
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                <div>
                  <h2 className="text-4xl font-black text-white uppercase tracking-tighter">Institutional Portfolio</h2>
                  <p className="text-slate-500 font-black uppercase tracking-widest text-[10px] mt-2">Deep Storage & Asset Matrix</p>
                </div>
                <div className="flex gap-4 w-full sm:w-auto">
                  <button 
                    onClick={() => setShowAddModal(true)}
                    className="flex-1 sm:flex-none bg-cyan-600 hover:bg-cyan-500 text-white font-black px-8 py-4 rounded-2xl transition-all flex items-center justify-center gap-3 uppercase text-xs tracking-widest shadow-lg shadow-cyan-900/20"
                  >
                    <Plus size={20} />
                    Add Asset
                  </button>
                  <button 
                    className="p-4 bg-slate-900 hover:bg-slate-800 rounded-2xl border border-slate-800 transition-all text-slate-400"
                    onClick={fetchPrices}
                  >
                    <RefreshCw size={20} className={isSyncing ? 'animate-spin' : ''} />
                  </button>
                </div>
              </div>

              <div className="bg-slate-900/60 border border-slate-800 rounded-[2.5rem] overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead className="bg-slate-950/50 border-b border-slate-800">
                      <tr className="text-[10px] font-black text-slate-500 uppercase tracking-widest">
                        <th className="px-10 py-6">Asset Matrix</th>
                        <th className="px-10 py-6">Position Details</th>
                        <th className="px-10 py-6">Live Tape</th>
                        <th className="px-10 py-6">Quantum P&L</th>
                        <th className="px-10 py-6 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {portfolio.map(asset => {
                        const price = livePrices[`${asset.market}_${asset.symbol}`];
                        const curPrice = price?.price || asset.avgPrice;
                        const pl = curPrice * asset.qty - (asset.avgPrice * asset.qty);
                        const plPct = (pl / (asset.avgPrice * asset.qty)) * 100;

                        return (
                          <tr key={asset.id} className="hover:bg-slate-800/20 transition-all group">
                            <td className="px-10 py-8">
                              <div className="font-black text-white text-xl tracking-tight uppercase">{asset.symbol.replace('.NS', '')}</div>
                              <div className="text-[9px] font-black text-slate-600 uppercase tracking-widest mt-1.5 flex items-center gap-2">
                                <Globe size={10} className="text-cyan-500" />
                                {asset.market} Exchange Matrix
                              </div>
                            </td>
                            <td className="px-10 py-8">
                              <div className="font-black text-white font-mono text-lg">{asset.qty.toLocaleString()} Units</div>
                              <div className="text-xs text-slate-500 font-mono mt-1">Avg: {formatCurrency(asset.avgPrice, asset.market, usdInr)}</div>
                            </td>
                            <td className="px-10 py-8">
                              <div className={`font-black font-mono text-xl tracking-tighter ${price?.change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {formatCurrency(curPrice, asset.market, usdInr)}
                              </div>
                              <div className={`text-[10px] font-black mt-1.5 flex items-center gap-1 ${price?.change >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                {price?.change >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
                                {price?.change >= 0 ? '+' : ''}{price?.change.toFixed(2)}%
                              </div>
                            </td>
                            <td className="px-10 py-8">
                              <div className={`font-black font-mono text-xl tracking-tighter ${pl >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                                {pl >= 0 ? '+' : ''}{formatCurrency(pl, asset.market, usdInr)}
                              </div>
                              <div className={`text-[10px] font-black mt-1.5 ${pl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                                {pl >= 0 ? '+' : ''}{plPct.toFixed(2)}%
                              </div>
                            </td>
                            <td className="px-10 py-8 text-right">
                              <button 
                                onClick={() => handleRemoveAsset(asset.id)}
                                className="p-3 hover:bg-red-500/10 rounded-xl text-slate-700 hover:text-red-500 transition-all opacity-0 group-hover:opacity-100"
                              >
                                <X size={20} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {portfolio.length === 0 && (
                  <div className="py-32 text-center">
                    <div className="w-24 h-24 bg-slate-950/50 rounded-[2rem] flex items-center justify-center mx-auto mb-8 shadow-inner">
                      <Briefcase className="text-slate-800" size={48} />
                    </div>
                    <p className="text-slate-600 font-black uppercase tracking-[0.2em] text-sm">Neural Database Empty</p>
                    <p className="text-slate-800 text-[10px] mt-2 uppercase font-bold">Inject liquidity to begin tracking</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'planner' && (
            <motion.div 
              key="planner"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="space-y-10"
            >
              <div className="text-center mb-10">
                <h2 className="text-4xl font-black text-white uppercase tracking-tighter">Deep Wealth Planner</h2>
                <p className="text-slate-500 font-black uppercase tracking-widest text-[10px] mt-2">Compound Interest Neural Engine</p>
              </div>

              <div className="grid lg:grid-cols-3 gap-10">
                <div className="bg-slate-900/60 border border-slate-800 rounded-[2.5rem] p-10 space-y-8 shadow-xl">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 block">Monthly SIP (₹)</label>
                    <input 
                      type="range" min="1000" max="500000" step="1000"
                      value={sipAmount} onChange={(e) => setSipAmount(Number(e.target.value))}
                      className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                    <div className="text-2xl font-black text-white font-mono mt-4">₹{sipAmount.toLocaleString()}</div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 block">Duration (Years)</label>
                    <input 
                      type="range" min="1" max="40" step="1"
                      value={years} onChange={(e) => setYears(Number(e.target.value))}
                      className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                    <div className="text-2xl font-black text-white font-mono mt-4">{years} Years</div>
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-4 block">Expected Return (%)</label>
                    <input 
                      type="range" min="5" max="30" step="1"
                      value={expectedReturn} onChange={(e) => setExpectedReturn(Number(e.target.value))}
                      className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                    />
                    <div className="text-2xl font-black text-white font-mono mt-4">{expectedReturn}% p.a.</div>
                  </div>
                </div>

                <div className="lg:col-span-2 bg-slate-900/40 border border-slate-800 rounded-[2.5rem] p-10 shadow-lg">
                  <div className="flex items-center justify-between mb-10">
                    <h3 className="text-xs font-black text-white uppercase tracking-widest">Compounding Trajectory</h3>
                    <div className="text-right">
                      <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Estimated Corpus</div>
                      <div className="text-3xl font-black text-emerald-400 font-mono">₹{(plannerData[plannerData.length - 1].balance / 10000000).toFixed(2)} Cr</div>
                    </div>
                  </div>
                  <div className="h-[350px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={plannerData}>
                        <defs>
                          <linearGradient id="colorPlan" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                        <XAxis dataKey="year" stroke="#475569" fontSize={10} tickFormatter={(v) => `Y${v}`} />
                        <YAxis stroke="#475569" fontSize={10} tickFormatter={(v) => `₹${(v/10000000).toFixed(1)}Cr`} />
                        <Tooltip 
                          contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                          itemStyle={{ color: '#10b981', fontWeight: 'bold' }}
                        />
                        <Area type="monotone" dataKey="balance" stroke="#10b981" fillOpacity={1} fill="url(#colorPlan)" strokeWidth={3} name="Total Wealth" />
                        <Area type="monotone" dataKey="invested" stroke="#475569" fill="transparent" strokeWidth={2} strokeDasharray="5 5" name="Invested" />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'macro' && (
            <motion.div 
              key="macro"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-10"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-3xl font-black text-white uppercase tracking-tighter">Global Risk Radar</h2>
                <span className="px-4 py-2 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                  <AlertTriangle size={14} />
                  High Volatility Detected
                </span>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                <div className="bg-slate-900/60 border border-slate-800 rounded-[2.5rem] p-10 shadow-xl">
                  <h3 className="text-lg font-black text-white uppercase tracking-tight mb-8">Central Bank Liquidity</h3>
                  <div className="space-y-8">
                    {[
                      { label: 'FED Balance Sheet', status: 'Tightening', val: '-$95B/mo', color: 'text-red-400' },
                      { label: 'RBI Repo Rate', status: 'Stable', val: '6.50%', color: 'text-cyan-400' },
                      { label: 'Global M2 Supply', status: 'Expanding', val: '+2.4%', color: 'text-emerald-400' }
                    ].map((item, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div>
                          <div className="font-black text-white text-sm">{item.label}</div>
                          <div className="text-[10px] font-bold text-slate-500 uppercase mt-1">{item.status}</div>
                        </div>
                        <div className={`text-lg font-black font-mono ${item.color}`}>{item.val}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-900/60 border border-slate-800 rounded-[2.5rem] p-10 shadow-xl">
                  <h3 className="text-lg font-black text-white uppercase tracking-tight mb-8">Systemic Risk Indicators</h3>
                  <div className="space-y-8">
                    {[
                      { label: 'US VIX (Fear Gauge)', val: '18.42', status: 'Elevated', color: 'text-amber-400' },
                      { label: 'India VIX', val: '14.15', status: 'Normal', color: 'text-emerald-400' },
                      { label: '10Y Treasury Yield', val: '4.25%', status: 'Critical', color: 'text-red-400' }
                    ].map((item, i) => (
                      <div key={i} className="flex items-center justify-between">
                        <div>
                          <div className="font-black text-white text-sm">{item.label}</div>
                          <div className="text-[10px] font-bold text-slate-500 uppercase mt-1">{item.status}</div>
                        </div>
                        <div className={`text-lg font-black font-mono ${item.color}`}>{item.val}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Terminal Console */}
        <div className="mt-10 bg-slate-950 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="bg-slate-900 px-6 py-3 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Terminal size={14} className="text-cyan-500" />
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Neural Terminal Console</span>
            </div>
            <div className="flex gap-1.5">
              <div className="w-2 h-2 rounded-full bg-red-500/50" />
              <div className="w-2 h-2 rounded-full bg-amber-500/50" />
              <div className="w-2 h-2 rounded-full bg-emerald-500/50" />
            </div>
          </div>
          <div className="p-6 h-48 overflow-y-auto font-mono text-[10px] space-y-2 scrollbar-hide">
            {logs.map(log => (
              <div key={log.id} className="flex gap-4">
                <span className="text-slate-600">[{log.time}]</span>
                <span className={`font-bold ${
                  log.type === 'success' ? 'text-emerald-500' : 
                  log.type === 'error' ? 'text-red-500' : 
                  log.type === 'warn' ? 'text-amber-500' : 
                  'text-cyan-500'
                }`}>
                  {log.type.toUpperCase()}
                </span>
                <span className="text-slate-400">{log.msg}</span>
              </div>
            ))}
            {logs.length === 0 && <div className="text-slate-700">Waiting for neural uplink...</div>}
          </div>
        </div>
      </main>

      {/* Add Modal */}
      <AnimatePresence>
        {showAddModal && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-950/90 backdrop-blur-md"
              onClick={() => setShowAddModal(false)}
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-slate-900 border border-slate-800 w-full max-w-md rounded-[3rem] overflow-hidden relative z-10 shadow-2xl"
            >
              <div className="p-10">
                <div className="flex items-center justify-between mb-10">
                  <div>
                    <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Initialize Asset</h3>
                    <p className="text-slate-500 text-[10px] font-black uppercase tracking-widest mt-1">Neural Link Setup</p>
                  </div>
                  <button 
                    onClick={() => setShowAddModal(false)} 
                    className="w-12 h-12 bg-slate-950/50 hover:bg-slate-950 rounded-2xl flex items-center justify-center text-slate-500 hover:text-white transition-all border border-white/5"
                  >
                    <X size={24} />
                  </button>
                </div>

                <div className="space-y-8">
                  <div>
                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 block">Symbol (Ticker)</label>
                    <div className="relative">
                      <Search className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-600" size={20} />
                      <input 
                        type="text" 
                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-5 pl-16 pr-6 text-white font-black text-lg outline-none focus:border-cyan-500 uppercase tracking-widest transition-all shadow-inner"
                        placeholder="e.g. AAPL, RELIANCE"
                        value={modalSymbol}
                        onChange={(e) => setModalSymbol(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-6">
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 block">Quantity</label>
                      <input 
                        type="number" 
                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-5 px-6 text-white font-black text-lg outline-none focus:border-cyan-500 font-mono shadow-inner"
                        placeholder="0"
                        value={modalQty}
                        onChange={(e) => setModalQty(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-3 block">Avg Price</label>
                      <input 
                        type="number" 
                        className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-5 px-6 text-white font-black text-lg outline-none focus:border-cyan-500 font-mono shadow-inner"
                        placeholder="0.00"
                        value={modalPrice}
                        onChange={(e) => setModalPrice(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="pt-4">
                    <button 
                      onClick={handleAddAsset}
                      className="w-full bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-black py-6 rounded-[1.8rem] transition-all uppercase tracking-widest text-sm shadow-xl shadow-cyan-900/40"
                    >
                      Save to Database 💾
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Chat Drawer */}
      <AnimatePresence>
        {showChat && (
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 z-[100] w-full max-w-md h-full bg-slate-950 border-l border-slate-800 shadow-2xl flex flex-col"
          >
            <div className="p-8 border-b border-slate-800 flex items-center justify-between bg-slate-900/50 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-indigo-500 to-purple-500" />
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-900/40 relative group">
                  <BrainCircuit className="text-white relative z-10 brain-glow" size={28} />
                  <div className="absolute inset-0 bg-indigo-400 rounded-2xl blur-lg opacity-0 group-hover:opacity-40 transition-opacity" />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-white uppercase tracking-tighter">Deep Mind AI</h3>
                  <div className="flex items-center gap-2 text-[8px] font-black text-indigo-400 uppercase tracking-widest">
                    <span className={`w-1.5 h-1.5 rounded-full ${isThinking ? 'bg-amber-500 animate-pulse' : 'bg-indigo-500'}`} />
                    {isThinking ? 'Neural Processing...' : 'Neural Link Active'}
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setShowChat(false)} 
                className="p-3 bg-slate-900 hover:bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-all border border-white/5"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-8 space-y-8 scrollbar-hide bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
              {chatMessages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center space-y-6 opacity-40">
                  <div className="w-20 h-20 bg-slate-900 rounded-[2rem] flex items-center justify-center border border-slate-800">
                    <Command className="text-slate-700" size={40} />
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.3em] text-slate-500">Awaiting Neural Input</p>
                    <p className="text-[10px] uppercase font-bold text-slate-700 mt-2">Ask about market trends, strategies, or risk</p>
                  </div>
                </div>
              )}
              
              {chatMessages.map((msg, i) => (
                <motion.div 
                  key={i}
                  initial={{ opacity: 0, y: 10, x: msg.role === 'user' ? 10 : -10 }}
                  animate={{ opacity: 1, y: 0, x: 0 }}
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div className={`max-w-[85%] p-6 rounded-[2rem] text-sm font-medium leading-relaxed shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-cyan-600 text-white rounded-tr-none' 
                      : 'bg-slate-900 border border-slate-800 text-slate-200 rounded-tl-none'
                  }`}>
                    {msg.text}
                  </div>
                </motion.div>
              ))}

              {isThinking && (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex justify-start"
                >
                  <div className="bg-slate-900 border border-slate-800 p-6 rounded-[2rem] rounded-tl-none flex items-center gap-4">
                    <div className="flex gap-1.5">
                      <motion.div 
                        animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                        transition={{ repeat: Infinity, duration: 1, delay: 0 }}
                        className="w-2 h-2 bg-indigo-500 rounded-full"
                      />
                      <motion.div 
                        animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                        transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                        className="w-2 h-2 bg-cyan-500 rounded-full"
                      />
                      <motion.div 
                        animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }}
                        transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                        className="w-2 h-2 bg-purple-500 rounded-full"
                      />
                    </div>
                    <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Thinking...</span>
                  </div>
                </motion.div>
              )}
            </div>

            <div className="p-8 bg-slate-900/80 backdrop-blur-xl border-t border-slate-800">
              <div className="relative">
                <input 
                  type="text"
                  placeholder="Query Deep Mind..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-2xl py-5 pl-6 pr-20 text-white font-bold text-sm outline-none focus:border-indigo-500 transition-all shadow-inner"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleChat()}
                />
                <button 
                  onClick={handleChat}
                  disabled={isThinking || !chatInput.trim()}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl flex items-center justify-center transition-all shadow-lg shadow-indigo-900/20"
                >
                  <Send size={20} />
                </button>
              </div>
              <div className="mt-4 flex items-center justify-center gap-6">
                <div className="flex items-center gap-2 text-[8px] font-black text-slate-600 uppercase tracking-widest">
                  <Cpu size={10} />
                  Neural Core v3.1
                </div>
                <div className="flex items-center gap-2 text-[8px] font-black text-slate-600 uppercase tracking-widest">
                  <Database size={10} />
                  Encrypted Uplink
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Chat Button */}
      <button 
        onClick={() => setShowChat(true)}
        className="fixed bottom-24 right-28 w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-full flex items-center justify-center shadow-2xl shadow-indigo-900/40 z-40 active:scale-95 transition-all"
      >
        <Sparkles size={32} />
      </button>

      {/* Floating Action Button (Mobile) */}
      <button 
        onClick={() => setShowAddModal(true)}
        className="lg:hidden fixed bottom-24 right-6 w-16 h-16 bg-gradient-to-br from-cyan-500 to-blue-600 text-white rounded-full flex items-center justify-center shadow-2xl shadow-cyan-900/40 z-40 active:scale-95 transition-all"
      >
        <Plus size={32} />
      </button>
    </div>
  );
}
