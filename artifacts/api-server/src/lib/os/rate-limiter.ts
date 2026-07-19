export interface RateLimitConfig {
  rpm: number;
  concurrency: number;
  provider: "nvidia" | "openrouter";
}

interface BucketState {
  tokens: number;
  lastRefill: number;
  inflight: number;
  waitQueue: Array<() => void>;
  totalRequests: number;
  totalQueued: number;
}

class TokenBucket {
  private state: BucketState;
  private readonly config: RateLimitConfig;
  private refillTimer: NodeJS.Timeout | null = null;

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.state = { tokens: config.rpm, lastRefill: Date.now(), inflight: 0, waitQueue: [], totalRequests: 0, totalQueued: 0 };
    this.scheduleRefill();
  }

  private scheduleRefill() {
    this.refillTimer = setInterval(() => {
      this.state.tokens = Math.min(this.config.rpm, this.state.tokens + this.config.rpm / 60);
      this.state.lastRefill = Date.now();
      this.drainQueue();
    }, 1000);
    if (this.refillTimer.unref) this.refillTimer.unref();
  }

  private drainQueue() {
    while (this.state.waitQueue.length > 0 && this.state.tokens >= 1 && this.state.inflight < this.config.concurrency) {
      this.state.tokens -= 1;
      this.state.inflight += 1;
      this.state.waitQueue.shift()!();
    }
  }

  async acquire(): Promise<void> {
    this.state.totalRequests++;
    if (this.state.tokens >= 1 && this.state.inflight < this.config.concurrency) {
      this.state.tokens -= 1;
      this.state.inflight += 1;
      return;
    }
    this.state.totalQueued++;
    return new Promise((resolve) => { this.state.waitQueue.push(resolve); });
  }

  release(): void {
    this.state.inflight = Math.max(0, this.state.inflight - 1);
    this.drainQueue();
  }

  getStats() {
    const { rpm, concurrency, provider } = this.config;
    const { tokens, inflight, waitQueue, totalRequests, totalQueued } = this.state;
    return { provider, rpm, concurrency, tokensAvailable: Math.floor(tokens), inflight, queued: waitQueue.length, utilizationPct: Math.round((inflight / concurrency) * 100), totalRequests, totalQueued };
  }

  destroy() { if (this.refillTimer) clearInterval(this.refillTimer); }
}

const buckets = new Map<string, TokenBucket>();

export function registerModel(modelId: string, config: RateLimitConfig) {
  if (buckets.has(modelId)) return;
  buckets.set(modelId, new TokenBucket(config));
}

export async function acquireModel(modelId: string): Promise<void> {
  const bucket = buckets.get(modelId);
  if (!bucket) throw new Error(`No rate limit config for model: ${modelId}`);
  await bucket.acquire();
}

export function releaseModel(modelId: string): void { buckets.get(modelId)?.release(); }

export function getAllStats() {
  const result: Record<string, ReturnType<TokenBucket["getStats"]>> = {};
  for (const [id, bucket] of buckets) result[id] = bucket.getStats();
  return result;
}

export function getProviderStats(provider: "nvidia" | "openrouter") {
  let totalRpm = 0, totalInflight = 0, totalQueued = 0, totalRequests = 0;
  for (const bucket of buckets.values()) {
    const s = bucket.getStats();
    if (s.provider === provider) { totalRpm += s.rpm; totalInflight += s.inflight; totalQueued += s.queued; totalRequests += s.totalRequests; }
  }
  return { provider, totalRpm, totalInflight, totalQueued, totalRequests };
}

export function getModelStats(modelId: string) { return buckets.get(modelId)?.getStats() ?? null; }
export function isModelAvailable(modelId: string): boolean {
  const bucket = buckets.get(modelId);
  if (!bucket) return false;
  const s = bucket.getStats();
  return s.tokensAvailable > 0 && s.inflight < s.concurrency;
}
