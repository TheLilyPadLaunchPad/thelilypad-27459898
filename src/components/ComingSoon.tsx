import { Construction, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Navbar } from "@/components/Navbar";
import { useNavigate } from "react-router-dom";

interface ComingSoonProps {
  title?: string;
  description?: string;
  /** Render inline (without page chrome / Navbar) — for use inside modals. */
  inline?: boolean;
}

/**
 * Coming Soon placeholder for features that are gated behind a feature flag
 * because their backend / on-chain component is not yet shipped.
 */
export function ComingSoon({
  title = "Coming Soon",
  description = "This feature is in active development and will be available shortly.",
  inline = false,
}: ComingSoonProps) {
  const navigate = useNavigate();

  const Body = (
    <Card className="border-primary/20 bg-card/60 backdrop-blur">
      <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
        <div className="rounded-full bg-primary/10 p-4 ring-1 ring-primary/30">
          <Construction className="h-8 w-8 text-primary" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
          <p className="max-w-md text-sm text-muted-foreground">{description}</p>
        </div>
        {!inline && (
          <Button variant="outline" onClick={() => navigate("/")} className="mt-2">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to home
          </Button>
        )}
      </CardContent>
    </Card>
  );

  if (inline) return Body;

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container mx-auto flex min-h-[70vh] items-center justify-center px-4 pt-24">
        {Body}
      </main>
    </div>
  );
}

export default ComingSoon;
