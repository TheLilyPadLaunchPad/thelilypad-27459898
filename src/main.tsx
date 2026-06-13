import { createRoot } from "react-dom/client";
import { Buffer } from "buffer";
import App from "./App.tsx";
import "./index.css";
import { initReownAppKit } from "@/integrations/reown/appkit";

// Initialise the Reown AppKit (WalletConnect) modal once on app boot so the
// `<WalletConnectButton />` / `openWalletModal()` helpers are ready to use.
initReownAppKit();

// Swallow benign wallet-extension auto-reconnect errors (e.g. MetaMask not
// installed) that surface as unhandled promise rejections from Reown/Ethers
// adapters on page load. These are non-actionable and would otherwise trigger
// the global error overlay / blank screen.
if (typeof window !== "undefined") {
  window.addEventListener("unhandledrejection", (event) => {
    const reason: any = event.reason;
    const msg = String(reason?.message ?? reason ?? "");
    if (
      /MetaMask/i.test(msg) ||
      /extension not found/i.test(msg) ||
      /Failed to connect to MetaMask/i.test(msg)
    ) {
      console.warn("[wallet] Suppressed benign wallet rejection:", msg);
      event.preventDefault();
    }
  });
}

// Ensure Buffer exists for Solana/Metaplex libs in the browser.
(globalThis as any).Buffer = (globalThis as any).Buffer ?? Buffer;

// Wallet-only auth: purge any stale Supabase auth tokens so the client never
// attempts to POST /auth/v1/token (which fails through the Lovable Preview proxy).
try {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("sb-") && key.endsWith("-auth-token")) {
      localStorage.removeItem(key);
    }
  }
} catch {
  // Ignore — localStorage may be unavailable in some sandboxed contexts.
}

createRoot(document.getElementById("root")!).render(<App />);

