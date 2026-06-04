/**
 * DevConsole — floating in-app console for admins.
 * Captures console.* output, uncaught errors, unhandled rejections,
 * and fetch/function calls. Persists errors to the error_logs table.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Terminal, X, Trash2, Copy, Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { logErrorToDatabase } from "@/lib/errorLogging";
import { toast } from "sonner";

type LogLevel = "log" | "info" | "warn" | "error" | "debug";
type Entry =
  | {
      kind: "log";
      id: number;
      ts: number;
      level: LogLevel;
      text: string;
    }
  | {
      kind: "net";
      id: number;
      ts: number;
      method: string;
      url: string;
      status?: number;
      ok?: boolean;
      durationMs?: number;
      error?: string;
    };

const MAX_ENTRIES = 500;

function safeStringify(v: unknown): string {
  if (typeof v === "string") return v;
  if (v instanceof Error) return `${v.name}: ${v.message}\n${v.stack ?? ""}`;
  try {
    return JSON.stringify(v, (_k, val) => (typeof val === "bigint" ? val.toString() : val), 2);
  } catch {
    return String(v);
  }
}

let counter = 0;
const nextId = () => ++counter;

const listeners = new Set<(e: Entry) => void>();
const buffer: Entry[] = [];
let installed = false;

function emit(e: Entry) {
  buffer.push(e);
  if (buffer.length > MAX_ENTRIES) buffer.shift();
  listeners.forEach((l) => l(e));
}

function installCapture() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const orig: Record<LogLevel, (...args: unknown[]) => void> = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    debug: console.debug.bind(console),
  };

  (["log", "info", "warn", "error", "debug"] as LogLevel[]).forEach((level) => {
    console[level] = (...args: unknown[]) => {
      try {
        emit({
          kind: "log",
          id: nextId(),
          ts: Date.now(),
          level,
          text: args.map(safeStringify).join(" "),
        });
      } catch {
        /* ignore */
      }
      orig[level](...args);
    };
  });

  window.addEventListener("error", (ev) => {
    emit({
      kind: "log",
      id: nextId(),
      ts: Date.now(),
      level: "error",
      text: `Uncaught: ${ev.message} @ ${ev.filename}:${ev.lineno}:${ev.colno}`,
    });
  });
  window.addEventListener("unhandledrejection", (ev) => {
    emit({
      kind: "log",
      id: nextId(),
      ts: Date.now(),
      level: "error",
      text: `UnhandledRejection: ${safeStringify(ev.reason)}`,
    });
  });

  // Wrap fetch
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const start = performance.now();
    const method = (init?.method || (typeof input !== "string" && "method" in (input as Request) ? (input as Request).method : "GET") || "GET").toUpperCase();
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    try {
      const res = await origFetch(input as RequestInfo, init);
      emit({
        kind: "net",
        id: nextId(),
        ts: Date.now(),
        method,
        url,
        status: res.status,
        ok: res.ok,
        durationMs: Math.round(performance.now() - start),
      });
      return res;
    } catch (err) {
      emit({
        kind: "net",
        id: nextId(),
        ts: Date.now(),
        method,
        url,
        error: err instanceof Error ? err.message : String(err),
        durationMs: Math.round(performance.now() - start),
      });
      throw err;
    }
  };
}

export const DevConsole = () => {
  const [open, setOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [filter, setFilter] = useState("");
  const [tab, setTab] = useState<"all" | "errors" | "network">("all");
  const [, force] = useState(0);
  const entriesRef = useRef<Entry[]>([...buffer]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    installCapture();
    const onEntry = (e: Entry) => {
      if (paused) return;
      entriesRef.current = [...entriesRef.current, e].slice(-MAX_ENTRIES);
      force((n) => n + 1);
      // Persist server-side errors
      if (e.kind === "log" && e.level === "error") {
        logErrorToDatabase(new Error(e.text), {
          componentName: "DevConsole",
          severity: "error",
          metadata: { source: "client_console" },
        }).catch(() => undefined);
      }
    };
    listeners.add(onEntry);
    return () => {
      listeners.delete(onEntry);
    };
  }, [paused]);

  useEffect(() => {
    if (open && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [open, entriesRef.current.length]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return entriesRef.current.filter((e) => {
      if (tab === "errors" && !(e.kind === "log" && e.level === "error")) return false;
      if (tab === "network" && e.kind !== "net") return false;
      if (!q) return true;
      if (e.kind === "log") return e.text.toLowerCase().includes(q) || e.level.includes(q);
      return `${e.method} ${e.url} ${e.status ?? ""}`.toLowerCase().includes(q);
    });
  }, [filter, tab, entriesRef.current.length]);

  const clear = () => {
    entriesRef.current = [];
    buffer.length = 0;
    force((n) => n + 1);
  };

  const copyAll = async () => {
    const text = filtered
      .map((e) => {
        const t = new Date(e.ts).toISOString();
        if (e.kind === "log") return `[${t}] ${e.level.toUpperCase()} ${e.text}`;
        return `[${t}] NET ${e.method} ${e.url} ${e.status ?? "ERR"} ${e.durationMs ?? 0}ms${e.error ? ` ${e.error}` : ""}`;
      })
      .join("\n");
    await navigator.clipboard.writeText(text);
    toast.success(`Copied ${filtered.length} entries`);
  };

  const errorCount = entriesRef.current.filter((e) => e.kind === "log" && e.level === "error").length;

  return (
    <>
      <Button
        onClick={() => setOpen((o) => !o)}
        size="icon"
        variant="secondary"
        aria-label="Open dev console"
        className="fixed bottom-20 right-4 z-[60] h-11 w-11 rounded-full shadow-lg border border-border"
      >
        <Terminal className="h-4 w-4" />
        {errorCount > 0 && (
          <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] flex items-center justify-center">
            {errorCount > 99 ? "99+" : errorCount}
          </span>
        )}
      </Button>

      {open && (
        <div className="fixed bottom-32 right-4 z-[60] w-[min(95vw,640px)] h-[min(70vh,520px)] rounded-lg border border-border bg-background shadow-2xl flex flex-col overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/40">
            <Terminal className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Dev Console</span>
            <Badge variant="outline" className="text-[10px]">{entriesRef.current.length}</Badge>
            <div className="flex-1" />
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setPaused((p) => !p)} aria-label={paused ? "Resume" : "Pause"}>
              {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={copyAll} aria-label="Copy">
              <Copy className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={clear} aria-label="Clear">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
            <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setOpen(false)} aria-label="Close">
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>

          <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex-1 flex flex-col min-h-0">
            <div className="px-3 pt-2 flex items-center gap-2">
              <TabsList className="h-8">
                <TabsTrigger value="all" className="h-6 text-xs">All</TabsTrigger>
                <TabsTrigger value="errors" className="h-6 text-xs">Errors</TabsTrigger>
                <TabsTrigger value="network" className="h-6 text-xs">Network</TabsTrigger>
              </TabsList>
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter..."
                className="h-8 text-xs"
              />
            </div>

            <TabsContent value={tab} className="flex-1 min-h-0 mt-2">
              <ScrollArea className="h-full px-3 pb-3" viewportRef={scrollRef as never}>
                <div className="font-mono text-[11px] leading-relaxed space-y-1">
                  {filtered.length === 0 && (
                    <div className="text-muted-foreground italic py-6 text-center">No entries</div>
                  )}
                  {filtered.map((e) => {
                    const t = new Date(e.ts).toLocaleTimeString();
                    if (e.kind === "log") {
                      return (
                        <div
                          key={e.id}
                          className={cn(
                            "whitespace-pre-wrap break-words border-l-2 pl-2 py-0.5",
                            e.level === "error" && "border-destructive text-destructive",
                            e.level === "warn" && "border-yellow-500 text-yellow-700 dark:text-yellow-400",
                            e.level === "info" && "border-blue-500",
                            e.level === "debug" && "border-muted-foreground/50 text-muted-foreground",
                            e.level === "log" && "border-border",
                          )}
                        >
                          <span className="text-muted-foreground mr-2">{t}</span>
                          <span className="uppercase mr-2 text-[10px] font-bold">{e.level}</span>
                          {e.text}
                        </div>
                      );
                    }
                    return (
                      <div
                        key={e.id}
                        className={cn(
                          "border-l-2 pl-2 py-0.5 break-all",
                          e.error || (e.status && e.status >= 400)
                            ? "border-destructive text-destructive"
                            : "border-primary/60",
                        )}
                      >
                        <span className="text-muted-foreground mr-2">{t}</span>
                        <span className="font-bold mr-2">{e.method}</span>
                        <span className="mr-2">{e.status ?? "ERR"}</span>
                        <span className="text-muted-foreground mr-2">{e.durationMs}ms</span>
                        {e.url}
                        {e.error && <div className="text-destructive mt-0.5">{e.error}</div>}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </TabsContent>
          </Tabs>
        </div>
      )}
    </>
  );
};

export default DevConsole;
