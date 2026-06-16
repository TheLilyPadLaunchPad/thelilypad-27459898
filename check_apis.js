import fs from 'fs';

// Load environment variables from .env file if it exists
let envVars = {};
if (fs.existsSync('.env')) {
  const envContent = fs.readFileSync('.env', 'utf-8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      envVars[key.trim()] = valueParts.join('=').trim();
    }
  });
}

// Helper function to make API calls
async function checkApi(name, url, options = {}) {
  const start = Date.now();
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: options.headers || {},
      body: options.body || undefined,
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });
    const latency = Date.now() - start;
    
    let data;
    try {
      data = await response.json();
    } catch {
      data = await response.text();
    }
    
    if (response.ok) {
      return { name, url, status: 'healthy', latency, data };
    } else {
      return { name, url, status: 'error', latency, error: `HTTP ${response.status}`, data };
    }
  } catch (error) {
    const latency = Date.now() - start;
    return { name, url, status: 'error', latency, error: error.message };
  }
}

// Check Helius RPC endpoints
async function checkHeliusRpcs() {
  console.log('\n🔍 Checking Helius RPC Endpoints...\n');
  
  const endpoints = [
    { name: 'Helius Mainnet Gatekeeper', url: 'https://beta.helius-rpc.com/?api-key=7e881a06-aafc-4e01-be4a-5b083e0eae55' },
    { name: 'Helius Mainnet Secure', url: 'https://collie-k01vc3-fast-mainnet.helius-rpc.com' },
    { name: 'Helius Mainnet', url: 'https://mainnet.helius-rpc.com/?api-key=7e881a06-aafc-4e01-be4a-5b083e0eae55' },
    { name: 'Solana Public Mainnet', url: 'https://api.mainnet-beta.solana.com' },
    { name: 'Solana Public Devnet', url: 'https://api.devnet.solana.com' },
  ];
  
  const results = await Promise.all(endpoints.map(ep => 
    checkApi(ep.name, ep.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getHealth', params: [] })
    })
  ));
  
  results.forEach(r => {
    if (r.status === 'healthy') {
      console.log(`✅ ${r.name}: ${r.latency}ms`);
    } else {
      console.log(`❌ ${r.name}: ${r.error}`);
    }
  });
  
  return results;
}

// Check Supabase API
async function checkSupabase() {
  console.log('\n🔍 Checking Supabase API...\n');
  
  const supabaseUrl = envVars.VITE_SUPABASE_URL;
  const supabaseKey = envVars.VITE_SUPABASE_PUBLISHABLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.log('⚠️  Supabase credentials not found in .env file');
    return null;
  }
  
  const result = await checkApi('Supabase Health', `${supabaseUrl}/rest/v1/`, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });
  
  if (result.status === 'healthy') {
    console.log(`✅ Supabase API: ${result.latency}ms`);
  } else {
    console.log(`❌ Supabase API: ${result.error}`);
  }
  
  return result;
}

// Check DAS API (via Helius)
async function checkDasApi() {
  console.log('\n🔍 Checking DAS API (via Helius)...\n');
  
  const rpcUrl = 'https://mainnet.helius-rpc.com/?api-key=7e881a06-aafc-4e01-be4a-5b083e0eae55';
  
  // Test getAssetsByOwner with a known address
  const result = await checkApi('DAS API', rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getAssetsByOwner',
      params: {
        ownerAddress: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
        page: 1,
        limit: 1
      }
    })
  });
  
  if (result.status === 'healthy') {
    console.log(`✅ DAS API: ${result.latency}ms`);
  } else {
    console.log(`❌ DAS API: ${result.error}`);
  }
  
  return result;
}

// Check Magic Eden API (via Supabase function)
async function checkMagicEden() {
  console.log('\n🔍 Checking Magic Eden API (via Supabase function)...\n');
  
  const supabaseUrl = envVars.VITE_SUPABASE_URL;
  const supabaseKey = envVars.VITE_SUPABASE_PUBLISHABLE_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    console.log('⚠️  Supabase credentials not found, skipping Magic Eden check');
    return null;
  }
  
  const result = await checkApi('Magic Eden (via Supabase)', `${supabaseUrl}/functions/v1/fetch-collection-stats-solana`, {
    method: 'POST',
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ mints: [] })
  });
  
  if (result.status === 'healthy') {
    console.log(`✅ Magic Eden API: ${result.latency}ms`);
  } else {
    console.log(`❌ Magic Eden API: ${result.error}`);
  }
  
  return result;
}

// Check Helius Enhanced API
async function checkHeliusEnhanced() {
  console.log('\n🔍 Checking Helius Enhanced API...\n');
  
  const heliusKey = envVars.VITE_HELIUS_API_KEY;
  
  if (!heliusKey) {
    console.log('⚠️  VITE_HELIUS_API_KEY not found in .env file');
    return null;
  }
  
  const result = await checkApi('Helius Enhanced', `https://api.helius.xyz/v0/transactions?api-key=${heliusKey}`);
  
  if (result.status === 'healthy') {
    console.log(`✅ Helius Enhanced API: ${result.latency}ms`);
  } else {
    console.log(`❌ Helius Enhanced API: ${result.error}`);
  }
  
  return result;
}

// Main function
async function main() {
  console.log('🚀 Starting API Health Check...\n');
  console.log('='.repeat(50));
  
  const results = {
    heliusRpcs: await checkHeliusRpcs(),
    supabase: await checkSupabase(),
    dasApi: await checkDasApi(),
    magicEden: await checkMagicEden(),
    heliusEnhanced: await checkHeliusEnhanced(),
  };
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 Summary\n');
  
  const allResults = [
    ...results.heliusRpcs,
    results.supabase,
    results.dasApi,
    results.magicEden,
    results.heliusEnhanced
  ].filter(r => r !== null);
  
  const healthy = allResults.filter(r => r.status === 'healthy').length;
  const total = allResults.length;
  
  console.log(`Healthy: ${healthy}/${total}`);
  console.log(`Unhealthy: ${total - healthy}/${total}`);
  
  if (healthy === total) {
    console.log('\n✨ All APIs are working well!');
  } else {
    console.log('\n⚠️  Some APIs are not responding correctly.');
  }
}

main().catch(console.error);
