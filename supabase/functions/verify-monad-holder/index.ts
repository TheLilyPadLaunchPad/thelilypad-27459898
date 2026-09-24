import { createPublicClient, http, verifyMessage, isAddress, parseAbi } from "npm:viem@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RPC = Deno.env.get("MONAD_RPC_URL") || "https://rpc.monad.xyz";
const MAX_AGE_MS = 5 * 60 * 1000;
const abi = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const { address, contracts, message, signature } = await req.json();
    if (!isAddress(address)) return json({ error: "Invalid wallet address" }, 400);
    if (!Array.isArray(contracts) || contracts.length === 0 || contracts.length > 20 || !contracts.every((c) => isAddress(c)))
      return json({ error: "Invalid collection list" }, 400);
    if (typeof message !== "string" || typeof signature !== "string") return json({ error: "Missing signature" }, 400);

    // Message format: "TheLilyPad holder check\nAddress: 0x..\nIssued: <ms>"
    const addrLine = message.match(/Address: (0x[0-9a-fA-F]{40})/)?.[1];
    const issued = Number(message.match(/Issued: (\d+)/)?.[1]);
    if (!message.startsWith("TheLilyPad holder check") || addrLine?.toLowerCase() !== address.toLowerCase())
      return json({ error: "Message does not match wallet" }, 400);
    if (!issued || Math.abs(Date.now() - issued) > MAX_AGE_MS) return json({ error: "Signature expired, please sign again" }, 401);

    const valid = await verifyMessage({ address, message, signature: signature as `0x${string}` });
    if (!valid) return json({ error: "Signature does not match wallet" }, 401);

    const client = createPublicClient({ transport: http(RPC) });
    const balances: Record<string, string> = {};
    let holder = false;
    for (const c of contracts) {
      try {
        const bal = await client.readContract({ address: c, abi, functionName: "balanceOf", args: [address] });
        balances[c.toLowerCase()] = bal.toString();
        if (bal > 0n) holder = true;
      } catch (e) {
        console.error("balanceOf failed", c, e);
        balances[c.toLowerCase()] = "0";
      }
    }
    return json({ holder, balances, checkedAt: Date.now() });
  } catch (e) {
    console.error(e);
    return json({ error: "Holder check failed" }, 500);
  }
});
