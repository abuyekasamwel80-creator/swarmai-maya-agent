import https from "https";
import { EventEmitter } from "events";

export interface OrderBookLevel { price: number; quantity: number; }
export interface OrderBook { symbol: string; bids: OrderBookLevel[]; asks: OrderBookLevel[]; lastUpdateId: number; timestamp: number; }

function httpsGet(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 6000 }, (res) => { let data = ""; res.on("data", (c: Buffer) => (data += c.toString())); res.on("end", () => resolve(data)); });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("timeout")); });
  });
}

function toOkxInst(sym: string): string {
  const s = sym.toUpperCase();
  const stablecoins = ["USDT", "USDC", "BUSD", "USD"];
  for (const stable of stablecoins) { if (s.endsWith(stable)) { const base = s.slice(0, s.length - stable.length); return `${base}-${stable}`; } }
  return s.replace(/([A-Z]{3,4})([A-Z]{3,4})$/, "$1-$2");
}

class OrderBookService extends EventEmitter {
  private books = new Map<string, OrderBook>();
  private timers = new Map<string, ReturnType<typeof setInterval>>();

  subscribe(rawSymbol: string): void {
    const sym = rawSymbol.toUpperCase().replace("/", "");
    if (this.timers.has(sym)) return;
    console.log(`[OrderBook] Polling OKX -> ${sym}`);
    void this.poll(sym);
    const timer = setInterval(() => void this.poll(sym), 500);
    this.timers.set(sym, timer);
  }

  unsubscribe(symbol: string): void {
    const sym = symbol.toUpperCase().replace("/", "");
    const timer = this.timers.get(sym);
    if (timer) { clearInterval(timer); this.timers.delete(sym); }
  }

  getBook(symbol: string): OrderBook | null { return this.books.get(symbol.toUpperCase().replace("/", "")) ?? null; }
  getSubscribedSymbols(): string[] { return [...this.timers.keys()]; }

  private async poll(sym: string): Promise<void> {
    try {
      const instId = toOkxInst(sym);
      const url = `https://www.okx.com/api/v5/market/books?instId=${instId}&sz=20`;
      const raw = await httpsGet(url);
      const json = JSON.parse(raw);
      const data = json?.data?.[0];
      if (!data?.bids || !data?.asks) return;
      const book: OrderBook = {
        symbol: sym,
        bids: data.bids.map(([price, qty]: [string, string]) => ({ price: parseFloat(price), quantity: parseFloat(qty) })),
        asks: data.asks.map(([price, qty]: [string, string]) => ({ price: parseFloat(price), quantity: parseFloat(qty) })),
        lastUpdateId: parseInt(data.seqId ?? "0"),
        timestamp: parseInt(data.ts ?? String(Date.now())),
      };
      this.books.set(sym, book);
      this.emit("update", book);
    } catch { }
  }
}

export const orderBookService = new OrderBookService();
orderBookService.subscribe("BTCUSDT");
orderBookService.subscribe("ETHUSDT");
