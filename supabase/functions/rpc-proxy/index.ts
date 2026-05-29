import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Solana RPC endpoints with rate limit info
interface RpcEndpoint {
  url: string;
  name: string;
  rateLimit: number; // requests per second
  weight: number; // priority weight (higher = preferred)
}

const MAINNET_RPCS: RpcEndpoint[] = [
  { url: 'https://api.mainnet-beta.solana.com', name: 'Solana Mainnet', rateLimit: 50, weight: 100 },
  { url: 'https://solana-mainnet.g.alchemy.com/v2/demo', name: 'Alchemy', rateLimit: 20, weight: 90 },
];

const TESTNET_RPCS: RpcEndpoint[] = [
  { url: 'https://api.devnet.solana.com', name: 'Solana Devnet', rateLimit: 50, weight: 100 },
  { url: 'https://solana-devnet.g.alchemy.com/v2/demo', name: 'Alchemy Devnet', rateLimit: 20, weight: 90 },
];

// In-memory cache for RPC health status
interface HealthStatus {
  healthy: boolean;
  latency: number;
  lastCheck: number;
  consecutiveFailures: number;
  requestCount: number;
  windowStart: number;
}

const healthCache: Map<string, HealthStatus> = new Map();
const HEALTH_CACHE_TTL = 30000; // 30 seconds
const RATE_LIMIT_WINDOW = 1000; // 1 second window

// Initialize health cache
function initHealthCache(rpcs: RpcEndpoint[]) {
  const now = Date.now();
  for (const rpc of rpcs) {
    if (!healthCache.has(rpc.url)) {
      healthCache.set(rpc.url, {
        healthy: true,
        latency: 0,
        lastCheck: 0,
        consecutiveFailures: 0,
        requestCount: 0,
        windowStart: now,
      });
    }
  }
}

// Check if RPC is rate limited
function isRateLimited(rpc: RpcEndpoint): boolean {
  const status = healthCache.get(rpc.url);
  if (!status) return false;

  const now = Date.now();

  // Reset window if expired
  if (now - status.windowStart >= RATE_LIMIT_WINDOW) {
    status.requestCount = 0;
    status.windowStart = now;
  }

  return status.requestCount >= rpc.rateLimit;
}

// Increment request count
function incrementRequestCount(rpcUrl: string) {
  const status = healthCache.get(rpcUrl);
  if (status) {
    const now = Date.now();
    if (now - status.windowStart >= RATE_LIMIT_WINDOW) {
      status.requestCount = 1;
      status.windowStart = now;
    } else {
      status.requestCount++;
    }
  }
}

// Update health status
function updateHealthStatus(rpcUrl: string, healthy: boolean, latency: number) {
  const status = healthCache.get(rpcUrl);
  if (status) {
    status.healthy = healthy;
    status.latency = latency;
    status.lastCheck = Date.now();

    if (healthy) {
      status.consecutiveFailures = 0;
    } else {
      status.consecutiveFailures++;
    }
  }
}

// Get best available RPC
function getBestRpc(network: 'mainnet' | 'testnet'): RpcEndpoint | null {
  const rpcs = network === 'mainnet' ? MAINNET_RPCS : TESTNET_RPCS;
  initHealthCache(rpcs);

  // Sort by: healthy status, rate limit availability, weight, then latency
  const available = rpcs
    .map(rpc => {
      const status = healthCache.get(rpc.url)!;
      return {
        rpc,
        status,
        score: calculateScore(rpc, status),
      };
    })
    .filter(item => {
      // Skip RPCs with too many failures (but allow retry after cooldown)
      if (item.status.consecutiveFailures >= 5) {
        const cooldownTime = Math.min(item.status.consecutiveFailures * 10000, 60000);
        if (Date.now() - item.status.lastCheck < cooldownTime) {
          return false;
        }
      }
      return !isRateLimited(item.rpc);
    })
    .sort((a, b) => b.score - a.score);

  if (available.length === 0) {
    // All RPCs are rate limited or failed, reset and try first one
    console.log('All RPCs unavailable, resetting health cache...');
    for (const rpc of rpcs) {
      const status = healthCache.get(rpc.url);
      if (status) {
        status.consecutiveFailures = 0;
        status.requestCount = 0;
      }
    }
    return rpcs[0];
  }

  return available[0].rpc;
}

function calculateScore(rpc: RpcEndpoint, status: HealthStatus): number {
  let score = rpc.weight;

  // Penalty for unhealthy
  if (!status.healthy) score -= 50;

  // Penalty for failures
  score -= status.consecutiveFailures * 10;

  // Bonus for low latency
  if (status.latency > 0 && status.latency < 200) score += 20;
  else if (status.latency > 500) score -= 10;

  // Penalty for high request count (approaching rate limit)
  const usageRatio = status.requestCount / rpc.rateLimit;
  if (usageRatio > 0.8) score -= 30;
  else if (usageRatio > 0.5) score -= 10;

  return score;
}

// Proxy RPC request with failover
async function proxyRpcRequest(
  network: 'mainnet' | 'testnet',
  body: any,
  maxRetries: number = 3
): Promise<{ result: any; rpcUsed: string; latency: number }> {
  let lastError: Error | null = null;
  const triedRpcs = new Set<string>();

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const rpc = getBestRpc(network);
    if (!rpc) {
      throw new Error('No RPC endpoints available');
    }

    // Skip if already tried this RPC
    if (triedRpcs.has(rpc.url)) {
      // Force get a different RPC
      const rpcs = network === 'mainnet' ? MAINNET_RPCS : TESTNET_RPCS;
      const untried = rpcs.find(r => !triedRpcs.has(r.url));
      if (!untried) break;
      continue;
    }

    triedRpcs.add(rpc.url);
    incrementRequestCount(rpc.url);

    const startTime = Date.now();

    try {
      console.log(`Attempt ${attempt + 1}: Using RPC ${rpc.name} (${rpc.url})`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      const response = await fetch(rpc.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const latency = Date.now() - startTime;

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // Check for RPC-level errors
      if (data.error) {
        // Some errors are not RPC failures (e.g., invalid params)
        const isRpcFailure = data.error.code === -32603 || // Internal error
          data.error.code === -32000 || // Server error
          data.error.message?.includes('rate') ||
          data.error.message?.includes('limit');

        if (isRpcFailure) {
          throw new Error(`RPC error: ${data.error.message}`);
        }

        // Non-RPC error, return as-is
        updateHealthStatus(rpc.url, true, latency);
        return { result: data, rpcUsed: rpc.url, latency };
      }

      // Success
      updateHealthStatus(rpc.url, true, latency);
      console.log(`Success: ${rpc.name} responded in ${latency}ms`);

      return { result: data, rpcUsed: rpc.url, latency };

    } catch (error: any) {
      const latency = Date.now() - startTime;
      lastError = error;

      console.error(`RPC ${rpc.name} failed:`, error.message);
      updateHealthStatus(rpc.url, false, latency);

      // Small delay before retry
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }
  }

  throw lastError || new Error('All RPC attempts failed');
}

// Health check endpoint
async function checkAllHealth(network: 'mainnet' | 'testnet'): Promise<any[]> {
  const rpcs = network === 'mainnet' ? MAINNET_RPCS : TESTNET_RPCS;
  initHealthCache(rpcs);

  const results = await Promise.all(
    rpcs.map(async (rpc) => {
      const startTime = Date.now();
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(rpc.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: Date.now(),
            method: 'getHealth',
            params: [],
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        const latency = Date.now() - startTime;

        if (!response.ok) {
          updateHealthStatus(rpc.url, false, latency);
          return {
            url: rpc.url,
            name: rpc.name,
            healthy: false,
            latency,
            error: `HTTP ${response.status}`,
          };
        }

        const data = await response.json();

        if (data.error) {
          updateHealthStatus(rpc.url, false, latency);
          return {
            url: rpc.url,
            name: rpc.name,
            healthy: false,
            latency,
            error: data.error.message,
          };
        }

        // Validate chain ID
        // For Solana, we check health/version instead of chainId
        if (data.result && (data.result['solana-core'] || typeof data.result === 'string')) {
          updateHealthStatus(rpc.url, true, latency);
          return {
            url: rpc.url,
            name: rpc.name,
            healthy: true,
            latency,
            chainId: 0, // Not applicable
          };
        }

        // If we got here, it might be an unexpected response format
        updateHealthStatus(rpc.url, true, latency); // Assume healthy if we got a response without error
        return {
          url: rpc.url,
          name: rpc.name,
          healthy: true,
          latency,
          chainId: 0,
        };

      } catch (error: any) {
        const latency = Date.now() - startTime;
        updateHealthStatus(rpc.url, false, latency);
        return {
          url: rpc.url,
          name: rpc.name,
          healthy: false,
          latency: null,
          error: error.name === 'AbortError' ? 'Timeout' : error.message,
        };
      }
    })
  );

  return results;
}

// Get cached health status
function getCachedHealth(network: 'mainnet' | 'testnet'): any[] {
  const rpcs = network === 'mainnet' ? MAINNET_RPCS : TESTNET_RPCS;
  initHealthCache(rpcs);

  return rpcs.map(rpc => {
    const status = healthCache.get(rpc.url)!;
    return {
      url: rpc.url,
      name: rpc.name,
      healthy: status.healthy,
      latency: status.latency,
      consecutiveFailures: status.consecutiveFailures,
      requestCount: status.requestCount,
      lastCheck: status.lastCheck,
      isStale: Date.now() - status.lastCheck > HEALTH_CACHE_TTL,
    };
  });
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Lightweight auth: require Supabase apikey or Bearer token to prevent
  // unauthenticated external abuse of the Solana RPC proxy.
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const apikeyHeader = req.headers.get('apikey') || '';
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization') || '';
  const bearer = authHeader.toLowerCase().startsWith('bearer ')
    ? authHeader.slice(7).trim()
    : '';
  const hasValidKey = !!anonKey && (apikeyHeader === anonKey || bearer === anonKey || (!!bearer && bearer.length > 20));
  if (!hasValidKey) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized: missing or invalid apikey' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const url = new URL(req.url);
    const network = (url.searchParams.get('network') || 'mainnet') as 'mainnet' | 'testnet';


    // Health check endpoint
    if (url.pathname.endsWith('/health')) {
      const refresh = url.searchParams.get('refresh') === 'true';

      let healthData;
      if (refresh) {
        console.log(`Refreshing health check for ${network}...`);
        healthData = await checkAllHealth(network);
      } else {
        healthData = getCachedHealth(network);
      }

      return new Response(JSON.stringify({
        network,
        endpoints: healthData,
        timestamp: Date.now(),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Best RPC endpoint
    if (url.pathname.endsWith('/best')) {
      const rpcs = network === 'mainnet' ? MAINNET_RPCS : TESTNET_RPCS;
      initHealthCache(rpcs);

      const best = getBestRpc(network);
      const status = best ? healthCache.get(best.url) : null;

      return new Response(JSON.stringify({
        network,
        rpc: best ? {
          url: best.url,
          name: best.name,
          healthy: status?.healthy ?? true,
          latency: status?.latency ?? 0,
        } : null,
        timestamp: Date.now(),
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Main proxy endpoint
    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();

    console.log(`Proxying RPC request to ${network}:`, body.method);

    const { result, rpcUsed, latency } = await proxyRpcRequest(network, body);

    // Add metadata headers
    const responseHeaders = {
      ...corsHeaders,
      'Content-Type': 'application/json',
      'X-RPC-Used': new URL(rpcUsed).hostname,
      'X-RPC-Latency': latency.toString(),
    };

    return new Response(JSON.stringify(result), {
      headers: responseHeaders,
    });

  } catch (error: any) {
    console.error('RPC Proxy error:', error);

    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32603,
        message: error.message || 'Internal proxy error',
      },
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
