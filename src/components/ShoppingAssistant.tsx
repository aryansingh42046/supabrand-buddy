import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Loader2, MessageSquareMore, Send, ShoppingBag, Sparkles, Wand2 } from "lucide-react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { useCart } from "@/hooks/use-cart";
import { useSessionEvents } from "@/hooks/use-session-events";
import { fetchRecommendationPool, formatPrice, type Product } from "@/lib/products";
import { assistantQuickPrompts, buildAssistantReply, type AssistantReply } from "@/lib/assistant";
import { trackSearch } from "@/lib/session-analytics";

type AssistantMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
  reply?: AssistantReply;
};

function createId() {
  return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function ShoppingAssistant() {
  const { user } = useAuth();
  const { items: cartItems, addItem } = useCart();
  const events = useSessionEvents();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [messages, setMessages] = useState<AssistantMessage[]>([
    {
      id: createId(),
      role: "assistant",
      text: "Ask me for recommendations, budget picks, or similar products. I use your browsing history and cart to rank results.",
    },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);

  const assistantStats = useMemo(
    () => [
      { label: "Catalog items", value: catalog.length.toLocaleString() },
      { label: "Cart items", value: cartItems.length.toString() },
      { label: "Session signals", value: events.length.toString() },
    ],
    [cartItems.length, catalog.length, events.length],
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  useEffect(() => {
    if (!open || catalog.length > 0) return;
    let cancelled = false;

    fetchRecommendationPool(500)
      .then((data) => {
        if (!cancelled) setCatalog(data);
      })
      .catch((error) => console.error(error));

    return () => {
      cancelled = true;
    };
  }, [catalog.length, open]);

  const cartProducts = useMemo(
    () => cartItems.map((item) => item.product).filter((product): product is Product => product != null),
    [cartItems],
  );

  const sendQuery = async (rawQuery: string) => {
    const trimmed = rawQuery.trim();
    if (!trimmed || busy) return;

    const userMessage: AssistantMessage = {
      id: createId(),
      role: "user",
      text: trimmed,
    };

    setMessages((prev) => [...prev, userMessage]);
    setQuery("");
    setBusy(true);
    trackSearch(trimmed, { userId: user?.id, metadata: { source: "assistant" } });

    try {
      let activeCatalog = catalog;
      if (activeCatalog.length === 0) {
        try {
          activeCatalog = await fetchRecommendationPool(500);
          setCatalog(activeCatalog);
        } catch (error) {
          console.error(error);
        }
      }

      const reply = buildAssistantReply({
        query: trimmed,
        pool: activeCatalog,
        events,
        cartProducts,
      });

      setMessages((prev) => [
        ...prev,
        {
          id: createId(),
          role: "assistant",
          text: reply.message,
          reply,
        },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const sendQuickPrompt = (prompt: string) => {
    setQuery(prompt);
    void sendQuery(prompt);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative h-11 w-11 rounded-full border-border/70 bg-card shadow-[var(--shadow-card)] transition-all hover:-translate-y-0.5 hover:shadow-[var(--shadow-hover)]"
        >
          <MessageSquareMore className="h-5 w-5" />
          <span className="sr-only">Open shopping assistant</span>
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
            AI
          </span>
        </Button>
      </SheetTrigger>

      <SheetContent className="flex w-full flex-col gap-0 overflow-hidden border-l border-border/60 bg-[linear-gradient(180deg,oklch(0.99_0.005_95),oklch(0.976_0.007_95))] p-0 shadow-2xl backdrop-blur-xl dark:bg-[linear-gradient(180deg,oklch(0.129_0.042_264.695),oklch(0.18_0.035_264.695))] sm:max-w-[760px]">
        <div className="relative border-b border-border/60 px-6 py-6 text-primary-foreground">
          <div className="absolute inset-0 bg-[image:var(--gradient-hero)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.32),transparent_45%)] opacity-80" />

          <div className="relative">
            <div className="flex items-start justify-between gap-4">
              <SheetHeader className="max-w-md text-left">
                <div className="inline-flex w-fit items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary-foreground/90">
                  <Sparkles className="h-3.5 w-3.5" />
                  Live copilot
                </div>
                <SheetTitle className="mt-3 text-2xl font-semibold tracking-tight text-primary-foreground">
                  Shopping Assistant
                </SheetTitle>
                <SheetDescription className="mt-2 text-sm leading-6 text-primary-foreground/80">
                  Ask for recommendations, budget filters, or similar items. It blends your cart, search, and browsing signals into one clear answer.
                </SheetDescription>
              </SheetHeader>

              <div className="hidden h-12 w-12 items-center justify-center rounded-2xl border border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground shadow-[0_18px_40px_-18px_rgba(255,255,255,0.5)] sm:flex">
                <Wand2 className="h-5 w-5" />
              </div>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-3">
              {assistantStats.map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-2xl border border-primary-foreground/15 bg-primary-foreground/10 px-3 py-3 backdrop-blur"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-primary-foreground/70">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-lg font-semibold text-primary-foreground">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-b border-border/60 bg-background/45 px-6 py-4 backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-muted-foreground">
              Quick prompts
            </p>
            <p className="text-xs text-muted-foreground">Tap one to start faster</p>
          </div>

          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {assistantQuickPrompts.map((prompt) => (
              <Button
                key={prompt}
                type="button"
                variant="secondary"
                size="sm"
                className="shrink-0 rounded-full border border-border/70 bg-background/80 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:bg-background"
                onClick={() => sendQuickPrompt(prompt)}
              >
                {prompt}
              </Button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.45),transparent_35%)] px-4 py-5 sm:px-5">
          <div className="space-y-4">
            {messages.map((message) => {
              const isUser = message.role === "user";

              return (
                <div key={message.id} className={isUser ? "flex justify-end" : "flex justify-start"}>
                  <div
                    className={
                      isUser
                        ? "max-w-[85%] rounded-[1.5rem] border border-primary/20 bg-[image:var(--gradient-hero)] px-4 py-4 text-sm text-primary-foreground shadow-[var(--shadow-hover)]"
                        : "max-w-[92%] rounded-[1.5rem] border border-border/80 bg-card/90 px-4 py-4 text-sm text-foreground shadow-[var(--shadow-card)] backdrop-blur"
                    }
                  >
                    <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] opacity-75">
                      {isUser ? "You" : "Assistant"}
                      {message.reply?.mode && (
                        <Badge
                          variant="secondary"
                          className={
                            isUser
                              ? "rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-2 py-0 text-[10px] uppercase tracking-[0.18em] text-primary-foreground"
                              : "rounded-full border-border/70 px-2 py-0 text-[10px] uppercase tracking-[0.18em]"
                          }
                        >
                          {message.reply.mode}
                        </Badge>
                      )}
                    </div>

                    <p className="mt-2 leading-relaxed">{message.text}</p>

                    {message.reply?.items?.length ? (
                      <div className="mt-4 space-y-3">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          Top picks
                        </div>

                        <div className="space-y-3">
                          {message.reply.items.map(({ product, reasons }) => (
                            <div
                              key={product.id}
                              className="group overflow-hidden rounded-2xl border border-border/80 bg-background/80 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-[var(--shadow-card)]"
                            >
                              <div className="flex gap-3 p-3">
                                <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-muted">
                                  {product.image_url ? (
                                    <img
                                      src={product.image_url}
                                      alt={product.name}
                                      className="h-full w-full object-contain p-2 transition-transform duration-300 group-hover:scale-105"
                                    />
                                  ) : (
                                    <div className="flex h-full w-full items-center justify-center text-[11px] uppercase tracking-[0.2em] text-muted-foreground">
                                      No image
                                    </div>
                                  )}
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <Link
                                      to="/product/$id"
                                      params={{ id: product.id }}
                                      className="line-clamp-2 text-sm font-semibold leading-snug text-foreground transition-colors hover:text-primary"
                                    >
                                      {product.name}
                                    </Link>
                                    <span className="rounded-full bg-muted px-2.5 py-1 text-xs font-semibold text-foreground">
                                      {formatPrice(Number(product.price))}
                                    </span>
                                  </div>

                                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                                    {product.brand && (
                                      <span className="rounded-full border border-border/70 bg-background/80 px-2 py-1 font-medium uppercase tracking-[0.16em]">
                                        {product.brand}
                                      </span>
                                    )}
                                    {product.rating != null && (
                                      <span className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/80 px-2 py-1 font-medium">
                                        <Sparkles className="h-3 w-3 text-primary" />
                                        {Number(product.rating).toFixed(1)} rating
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="border-t border-border/70 px-3 py-3">
                                <p className="line-clamp-2 text-xs text-muted-foreground">
                                  {reasons.slice(0, 2).map((reason) => reason.detail).join(" | ")}
                                </p>

                                <div className="mt-3 flex flex-wrap gap-2">
                                  <Button size="sm" className="rounded-full" onClick={() => void addItem(product.id, 1)}>
                                    <ShoppingBag className="mr-2 h-4 w-4" />
                                    Add to cart
                                  </Button>
                                  <Button asChild size="sm" variant="outline" className="rounded-full">
                                    <Link to="/product/$id" params={{ id: product.id }}>
                                      View product
                                    </Link>
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {message.reply?.followUps?.length ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {message.reply.followUps.map((prompt) => (
                          <Button
                            key={prompt}
                            variant="outline"
                            size="sm"
                            className={isUser ? "rounded-full border-primary-foreground/20 bg-primary-foreground/10 text-primary-foreground hover:bg-primary-foreground/15" : "rounded-full"}
                            onClick={() => sendQuickPrompt(prompt)}
                          >
                            {prompt}
                          </Button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            })}

            {busy && (
              <div className="flex justify-start">
                <div className="rounded-[1.5rem] border border-border/80 bg-card/90 px-4 py-3 text-sm text-muted-foreground shadow-[var(--shadow-card)] backdrop-blur">
                  <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                  Looking through your catalog...
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t border-border/60 bg-background/90 px-4 py-4 backdrop-blur-xl sm:px-5">
          <div className="mb-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
            <span>Use plain language, brand names, or price ranges.</span>
            <span className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-background/80 px-2.5 py-1 font-medium text-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              Ready
            </span>
          </div>

          <form
            className="flex items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void sendQuery(query);
            }}
          >
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ask for recommendations, budgets, or similar items..."
              className="h-11 rounded-full border-border/70 bg-background/95 px-4 shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
            />
            <Button type="submit" size="icon" className="h-11 w-11 rounded-full" disabled={busy || !query.trim()}>
              <Send className="h-4 w-4" />
              <span className="sr-only">Send message</span>
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
