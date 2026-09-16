import { useState, useEffect, useCallback, useRef } from 'react';

interface PWAUpdateState {
  needRefresh: boolean;
  offlineReady: boolean;
  updateServiceWorker: () => Promise<void>;
  dismissUpdate: () => void;
}

/**
 * Listens for service-worker lifecycle events injected by vite-plugin-pwa
 * (injectRegister: "auto").  Does NOT call navigator.serviceWorker.register()
 * itself — the plugin already handles that via its auto-injected script.
 */
export const usePWAUpdate = (): PWAUpdateState => {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [waitingWorker, setWaitingWorker] = useState<ServiceWorker | null>(null);
  /** Only reload when the user explicitly accepted the update. */
  const userAccepted = useRef(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let interval: ReturnType<typeof setInterval> | undefined;

    const handleRegistration = (reg: ServiceWorkerRegistration) => {
      // Check for an already-waiting worker
      if (reg.waiting) {
        setWaitingWorker(reg.waiting);
        setNeedRefresh(true);
      }

      // Listen for future updates
      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed') {
            if (navigator.serviceWorker.controller) {
              setWaitingWorker(newWorker);
              setNeedRefresh(true);
            } else {
              setOfflineReady(true);
            }
          }
        });
      });

      // Periodic update check (every 5 min)
      interval = setInterval(() => reg.update(), 5 * 60 * 1000);
    };

    // Grab the registration that vite-plugin-pwa already created
    navigator.serviceWorker.ready.then(handleRegistration);

    // Reload only after the user asked for the update — an automatic reload
    // here would destroy unsaved in-app work.
    const onControllerChange = () => {
      if (userAccepted.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      if (interval) clearInterval(interval);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  const updateServiceWorker = useCallback(async () => {
    if (waitingWorker) {
      userAccepted.current = true;
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    }
  }, [waitingWorker]);

  const dismissUpdate = useCallback(() => {
    setNeedRefresh(false);
  }, []);

  return {
    needRefresh,
    offlineReady,
    updateServiceWorker,
    dismissUpdate,
  };
};
