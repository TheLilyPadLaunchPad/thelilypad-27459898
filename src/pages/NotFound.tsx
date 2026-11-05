import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);

    // A 404 is often an outdated saved copy of the app that doesn't know a newer
    // page yet. Nothing is in progress on this screen, so it is safe to fetch the
    // latest version and reload once.
    if (!("serviceWorker" in navigator)) return;
    const key = `lp_404_refresh:${location.pathname}`;
    if (sessionStorage.getItem(key)) return;
    navigator.serviceWorker.getRegistration().then(async (reg) => {
      if (!reg) return;
      try { await reg.update(); } catch { /* offline */ }
      const waiting = reg.waiting || reg.installing;
      if (!waiting) return;
      sessionStorage.setItem(key, "1");
      navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
      waiting.postMessage({ type: "SKIP_WAITING" });
      setTimeout(() => window.location.reload(), 4000);
    });
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">Oops! Page not found</p>
        <Link to="/" className="text-primary underline hover:text-primary/90">
          Return to Home
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
