import { useState, FormEvent } from "react";
import { Sparkles, Send, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Msg = { role: "user" | "assistant"; content: string };

const SUGGESTIONS = ["What's the current floor price?", "How many are still left to mint?", "What traits are listed right now?"];

export function CollectionAssistant({ collectionId, collectionName }: { collectionId: string; collectionName?: string }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || loading) return;
    setError(null);
    const next: Msg[] = [...messages, { role: "user", content: question }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/collection-assistant`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
        },
        body: JSON.stringify({ collectionId, messages: next }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "The assistant couldn't answer right now.");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let text = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        text += dec.decode(value, { stream: true });
        setMessages([...next, { role: "assistant", content: text }]);
      }
      if (!text.trim()) setMessages([...next, { role: "assistant", content: "I couldn't find an answer for that." }]);
    } catch (e: any) {
      setMessages(next);
      setInput(question);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    ask(input);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="h-4 w-4 text-primary" /> Ask about {collectionName || "this collection"}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {messages.length === 0 ? (
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button key={s} onClick={() => ask(s)} className="rounded-full border px-3 py-1 text-xs hover:bg-muted">
                {s}
              </button>
            ))}
          </div>
        ) : (
          <div className="max-h-72 space-y-2 overflow-y-auto">
            {messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "ml-6 rounded-lg bg-primary/10 p-2 text-sm" : "mr-6 whitespace-pre-wrap rounded-lg bg-muted p-2 text-sm"}
              >
                {m.content || <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
              </div>
            ))}
          </div>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
        <form onSubmit={onSubmit} className="flex gap-2">
          <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question…" maxLength={500} disabled={loading} />
          <Button type="submit" size="icon" disabled={loading || !input.trim()} aria-label="Send">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </form>
        <p className="text-[10px] text-muted-foreground">AI answers use this page's data and may be incomplete. Not financial advice.</p>
      </CardContent>
    </Card>
  );
}
