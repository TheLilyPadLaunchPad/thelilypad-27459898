import { createRoot } from "react-dom/client";
import { Buffer } from "buffer";
import App from "./App.tsx";
import "./index.css";
import { initReownAppKit } from "@/integrations/reown/appkit";

// Initialise the Reown AppKit (WalletConnect) modal once on app boot so the
// `<WalletConnectButton />` / `openWalletModal()` helpers are ready to use.
initReownAppKit();

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

