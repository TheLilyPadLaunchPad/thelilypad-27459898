import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export const TURNSTILE_SITE_KEY = "0x4AAAAAACU1SETrkohIZmD0";
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      reset: (id: string) => void;
      remove: (id: string) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => {
      scriptPromise = null;
      reject(new Error("Turnstile failed to load"));
    };
    document.head.appendChild(s);
  });
  return scriptPromise;
}

export interface TurnstileHandle {
  reset: () => void;
}

interface Props {
  action: string;
  onToken: (token: string | null) => void;
}

export const TurnstileWidget = forwardRef<TurnstileHandle, Props>(({ action, onToken }, ref) => {
  const elRef = useRef<HTMLDivElement>(null);
  const idRef = useRef<string | null>(null);
  const cbRef = useRef(onToken);
  cbRef.current = onToken;

  useImperativeHandle(ref, () => ({
    reset: () => {
      cbRef.current(null);
      if (idRef.current && window.turnstile) window.turnstile.reset(idRef.current);
    },
  }));

  useEffect(() => {
    let cancelled = false;
    loadScript()
      .then(() => {
        if (cancelled || !elRef.current || !window.turnstile) return;
        idRef.current = window.turnstile.render(elRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          callback: (t: string) => cbRef.current(t),
          "expired-callback": () => cbRef.current(null),
          "error-callback": () => cbRef.current(null),
        });
      })
      .catch(() => cbRef.current(null));
    return () => {
      cancelled = true;
      if (idRef.current && window.turnstile) window.turnstile.remove(idRef.current);
      idRef.current = null;
    };
  }, [action]);

  return <div ref={elRef} className="flex justify-center min-h-[65px]" />;
});
TurnstileWidget.displayName = "TurnstileWidget";
