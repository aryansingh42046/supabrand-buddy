import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  BarChart3,
  Activity,
  Clock3,
  Database,
  Laptop,
  RefreshCw,
  Search,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { useSessionEvents } from "@/hooks/use-session-events";
import { loadActionLog } from "@/lib/action-log.functions";
import { getSessionId, type SessionEvent } from "@/lib/session-analytics";

export const Route = createFileRoute("/activity")({
  component: ActivityPage,
});

const STORAGE_MAP = [
  { label: "Browser session", value: "localStorage: echocart:session-events" },
  { label: "Session id", value: "sessionStorage: echocart:session-id" },
  { label: "Recent searches", value: "localStorage: echocart:recent-searches" },
  { label: "Supabase table", value: "public.recommendation_events" },
  { label: "Wishlist table", value: "public.wishlist_items" },
  { label: "Hybrid model", value: "public.hybrid_model_snapshots" },
  { label: "Two-tower vectors", value: "public.two_tower_item_embeddings" },
];

const EVENT_LABELS: Record<SessionEvent["type"], string> = {
  page_view: "Page view",
  search: "Search",
  product_view: "Product view",
  add_to_cart: "Add to cart",
  remove_from_cart: "Remove from cart",
  update_quantity: "Update quantity",
  checkout_start: "Checkout start",
  recommendation_impression: "Recommendation impression",
  recommendation_feedback: "Recommendation feedback",
  order_placed: "Order placed",
};

function ActivityPage() {
  const { user } = useAuth();
  const browserEvents = useSessionEvents();
  const [sessionId, setSessionId] = useState("");
  const [savedEvents, setSavedEvents] = useState<SessionEvent[]>([]);
  const [savedLoading, setSavedLoading] = useState(true);
  const [savedError, setSavedError] = useState<string | null>(null);
  const requestId = useRef(0);

  useEffect(() => {
    setSessionId(getSessionId());
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    const currentRequest = requestId.current + 1;
    requestId.current = currentRequest;
    setSavedLoading(true);
    setSavedError(null);

    loadActionLog({ data: { sessionId, userId: user?.id, limit: 250 } })
      .then((response) => {
        if (requestId.current !== currentRequest) return;
        setSavedEvents(response.events);
      })
      .catch((error) => {
        if (requestId.current !== currentRequest) return;
        setSavedEvents([]);
        setSavedError(error instanceof Error ? error.message : "Failed to load saved actions");
      })
      .finally(() => {
        if (requestId.current === currentRequest) {
          setSavedLoading(false);
        }
      });
  }, [sessionId, user?.id]);

  const liveEvents = useMemo(() => [...browserEvents].reverse(), [browserEvents]);
  const persistedEvents = useMemo(() => [...savedEvents].reverse(), [savedEvents]);
  const latestLiveEvent = liveEvents[0] ?? null;
  const latestPersistedEvent = persistedEvents[0] ?? null;
  const sessionLabel = sessionId ? shortenId(sessionId) : "loading...";
  const analyticsEvents = useMemo(() => {
    const lookup = new Map<string, SessionEvent>();

    for (const event of [...browserEvents, ...savedEvents]) {
      lookup.set(event.id, event);
    }

    return [...lookup.values()].sort(
      (left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp),
    );
  }, [browserEvents, savedEvents]);
  const analyticsSummary = useMemo(() => buildAnalyticsSummary(analyticsEvents), [analyticsEvents]);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        <Card className="overflow-hidden border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(249,248,245,0.9))] shadow-[var(--shadow-card)] dark:bg-[linear-gradient(180deg,rgba(20,24,33,0.96),rgba(27,31,42,0.92))]">
          <CardContent className="p-0">
            <div className="grid gap-6 p-6 lg:grid-cols-[1.2fr_0.8fr] lg:p-8">
              <div className="space-y-5">
                <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
                  <Activity className="h-3.5 w-3.5" />
                  Action log
                </div>
                <div>
                  <h1 className="text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
                    See every click, search, feedback, and cart action in one place.
                  </h1>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground md:text-base">
                    This page shows the browser events the app captures right away, plus the
                    actions, feedback, and model signals that get written to Supabase.
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Badge variant="secondary" className="rounded-full border-border/70 px-3 py-1">
                    Browser localStorage
                  </Badge>
                  <Badge variant="outline" className="rounded-full border-border/70 px-3 py-1">
                    Supabase recommendation_events
                  </Badge>
                  <Badge variant="outline" className="rounded-full border-border/70 px-3 py-1">
                    Session {sessionLabel}
                  </Badge>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button asChild className="rounded-full">
                    <Link to="/">Back to catalog</Link>
                  </Button>
                  <Button asChild variant="outline" className="rounded-full border-border/70">
                    <Link to="/">Open catalog</Link>
                  </Button>
                </div>

                <div className="rounded-2xl border border-border/70 bg-card/80 px-4 py-3 shadow-sm">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Latest saved action
                  </p>
                  <p className="mt-1 text-sm text-foreground">
                    {latestPersistedEvent
                      ? describeEvent(latestPersistedEvent)
                      : "No saved rows yet. Open the homepage or product page to write events to Supabase."}
                  </p>
                </div>
              </div>

              <Card className="border-border/70 bg-card/85 shadow-sm">
                <CardHeader className="pb-4">
                  <CardTitle className="text-lg">Where the data lives</CardTitle>
                  <CardDescription>
                    These are the exact browser keys and database tables used by the recommender.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                  {STORAGE_MAP.map((item) => (
                    <div
                      key={item.label}
                      className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3"
                    >
                      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                        {item.label}
                      </p>
                      <p className="mt-1 font-mono text-xs text-foreground">{item.value}</p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Live browser events"
            value={browserEvents.length}
            description="What this tab stores immediately in localStorage."
            icon={<Laptop className="h-5 w-5" />}
          />
          <MetricCard
            label="Persisted Supabase events"
            value={savedEvents.length}
            description="Rows saved for recommendations and demos."
            icon={<Database className="h-5 w-5" />}
          />
          <MetricCard
            label="Current session id"
            value={sessionLabel}
            description="Used to group events from the same browser session."
            icon={<Clock3 className="h-5 w-5" />}
            mono
          />
          <MetricCard
            label="Latest browser action"
            value={latestLiveEvent ? EVENT_LABELS[latestLiveEvent.type] : "No action yet"}
            description={
              latestLiveEvent
                ? describeEvent(latestLiveEvent)
                : "Start browsing to see actions appear here."
            }
            icon={<Activity className="h-5 w-5" />}
          />
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Searches tracked"
            value={analyticsSummary.searchCount}
            description="Searches that can feed discovery and recall."
            icon={<Search className="h-5 w-5" />}
          />
          <MetricCard
            label="Search success rate"
            value={`${Math.round(analyticsSummary.searchSuccessRate * 100)}%`}
            description="Searches followed by product or cart engagement."
            icon={<TrendingUp className="h-5 w-5" />}
          />
          <MetricCard
            label="Recommendation feedback"
            value={`${analyticsSummary.positiveFeedbackCount} / ${analyticsSummary.negativeFeedbackCount}`}
            description="More-like-this vs not-relevant reactions."
            icon={<ThumbsUp className="h-5 w-5" />}
          />
          <MetricCard
            label="Top category"
            value={analyticsSummary.topCategory ?? "N/A"}
            description={
              analyticsSummary.topCategoryCount > 0
                ? `${analyticsSummary.topCategoryCount} tracked actions`
                : "No category activity yet"
            }
            icon={<BarChart3 className="h-5 w-5" />}
          />
        </div>

        <Card className="mt-8 border-border/70 bg-card/80 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Discovery insights</CardTitle>
            <CardDescription>
              Recent search intent and category activity collected from this session.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Top searches
              </p>
              <div className="mt-3 space-y-2">
                {analyticsSummary.topSearchTerms.length > 0 ? (
                  analyticsSummary.topSearchTerms.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="truncate font-medium text-foreground">{item.label}</span>
                      <Badge
                        variant="secondary"
                        className="rounded-full border-border/70 px-2 py-1 text-[10px]"
                      >
                        {item.count}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No search terms captured yet.</p>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-border/70 bg-background/80 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Top categories
              </p>
              <div className="mt-3 space-y-2">
                {analyticsSummary.topCategories.length > 0 ? (
                  analyticsSummary.topCategories.map((item) => (
                    <div
                      key={item.label}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <span className="truncate font-medium text-foreground">{item.label}</span>
                      <Badge
                        variant="outline"
                        className="rounded-full border-border/70 px-2 py-1 text-[10px] text-muted-foreground"
                      >
                        {item.count}
                      </Badge>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No category activity captured yet.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="mt-8 grid gap-6">
          <ActionStreamCard
            title="Live browser session"
            description="Captured immediately from localStorage in this browser tab."
            storageBadge="Browser storage"
            events={liveEvents}
            emptyMessage="No browser actions yet. Click around the store, search, open products, or add items to cart and they will appear here instantly."
          />

          <ActionStreamCard
            title="Persisted Supabase log"
            description="Loaded from the saved recommendation_events rows for this session or user."
            storageBadge="Supabase"
            events={persistedEvents}
            loading={savedLoading}
            error={savedError}
            emptyMessage="No saved rows yet. Visit the homepage or a product page so the recommendation pipeline runs and writes the session events to Supabase."
            onRefresh={() => {
              if (!sessionId) return;
              const currentRequest = requestId.current + 1;
              requestId.current = currentRequest;
              setSavedLoading(true);
              setSavedError(null);

              loadActionLog({ data: { sessionId, userId: user?.id, limit: 250 } })
                .then((response) => {
                  if (requestId.current !== currentRequest) return;
                  setSavedEvents(response.events);
                })
                .catch((error) => {
                  if (requestId.current !== currentRequest) return;
                  setSavedEvents([]);
                  setSavedError(
                    error instanceof Error ? error.message : "Failed to load saved actions",
                  );
                })
                .finally(() => {
                  if (requestId.current === currentRequest) {
                    setSavedLoading(false);
                  }
                });
            }}
          />
        </div>

        <Card className="mt-8 border-border/70 bg-card/80 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">What to show someone</CardTitle>
            <CardDescription>
              Use the browser section to prove the actions are captured live, then use the Supabase
              section to show what has been stored for recommendations.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <p className="font-medium text-foreground">1. Browser trail</p>
              <p className="mt-1">
                Every page view, search, product click, and cart change is written to the browser
                session log first.
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <p className="font-medium text-foreground">2. Server trail</p>
              <p className="mt-1">
                When the recommendation pipeline runs, those events are upserted into the Supabase
                recommendation_events table.
              </p>
            </div>
            <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <p className="font-medium text-foreground">3. Raw payload</p>
              <p className="mt-1">
                Open any event card to reveal the full JSON payload, which makes it easy to explain
                the exact stored data.
              </p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function ActionStreamCard({
  title,
  description,
  storageBadge,
  events,
  loading,
  error,
  emptyMessage,
  onRefresh,
}: {
  title: string;
  description: string;
  storageBadge: string;
  events: SessionEvent[];
  loading?: boolean;
  error?: string | null;
  emptyMessage: string;
  onRefresh?: () => void;
}) {
  const visibleEvents = events.slice(0, 30);

  return (
    <Card className="border-border/80 bg-card/85 shadow-[var(--shadow-card)]">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/8 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-primary">
            <Database className="h-3.5 w-3.5" />
            {storageBadge}
          </div>
          <CardTitle className="mt-3 text-xl">{title}</CardTitle>
          <CardDescription className="mt-2 max-w-2xl text-sm leading-6">
            {description}
          </CardDescription>
        </div>

        <div className="flex items-center gap-2">
          <Badge variant="secondary" className="rounded-full border-border/70 px-3 py-1">
            {events.length} events
          </Badge>
          {onRefresh && (
            <Button
              variant="outline"
              size="sm"
              className="rounded-full border-border/70"
              onClick={onRefresh}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {loading ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-background/70 px-4 py-6 text-sm text-muted-foreground">
            Loading saved events from Supabase...
          </div>
        ) : error ? (
          <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-6 text-sm text-destructive">
            {error}
          </div>
        ) : visibleEvents.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border/70 bg-background/70 px-4 py-6 text-sm text-muted-foreground">
            {emptyMessage}
          </div>
        ) : (
          <div className="space-y-3">
            {visibleEvents.map((event) => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        )}

        {events.length > visibleEvents.length ? (
          <p className="text-xs text-muted-foreground">
            Showing the latest {visibleEvents.length} events.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function EventCard({ event }: { event: SessionEvent }) {
  const chips = buildChips(event);

  return (
    <div className="rounded-2xl border border-border/80 bg-background/85 p-4 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="secondary"
              className="rounded-full border-border/70 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em]"
            >
              {EVENT_LABELS[event.type]}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {formatTimestamp(event.timestamp)}
            </span>
          </div>

          <p className="mt-2 text-sm font-medium text-foreground">{describeEvent(event)}</p>

          {chips.length > 0 ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {chips.map((chip) => (
                <Badge
                  key={chip}
                  variant="outline"
                  className="rounded-full border-border/70 px-2.5 py-1 text-[11px] text-muted-foreground"
                >
                  {chip}
                </Badge>
              ))}
            </div>
          ) : null}
        </div>

        <div className="shrink-0 text-right text-[11px] text-muted-foreground">
          <p className="font-mono">{shortenId(event.sessionId)}</p>
          {event.userId ? <p className="mt-1 font-mono">{shortenId(event.userId)}</p> : null}
        </div>
      </div>

      <details className="mt-4 rounded-xl border border-border/70 bg-background/70 p-3">
        <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
          Raw JSON
        </summary>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words text-[11px] leading-5 text-foreground">
          {JSON.stringify(event, null, 2)}
        </pre>
      </details>
    </div>
  );
}

function MetricCard({
  label,
  value,
  description,
  icon,
  mono = false,
}: {
  label: string;
  value: string | number;
  description: string;
  icon: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <Card className="border-border/80 bg-card/85 shadow-[var(--shadow-card)]">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-muted-foreground">{label}</p>
            <p
              className={`mt-2 text-2xl font-semibold text-foreground ${mono ? "font-mono text-lg" : ""}`}
            >
              {value}
            </p>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function buildChips(event: SessionEvent) {
  const chips: string[] = [];

  if (event.path) chips.push(event.path);
  if (event.query) chips.push(`Query: ${event.query}`);
  if (event.productId) chips.push(`Product: ${shortenId(event.productId)}`);

  if (event.type === "recommendation_feedback" && typeof event.metadata?.feedback === "string") {
    chips.push(
      `Feedback: ${event.metadata.feedback === "more_like_this" ? "More like this" : "Not relevant"}`,
    );
  }

  if (typeof event.metadata?.quantity === "number") {
    chips.push(`Qty: ${event.metadata.quantity}`);
  }

  if (typeof event.metadata?.cartCount === "number") {
    chips.push(`Cart: ${event.metadata.cartCount}`);
  }

  if (typeof event.metadata?.subtotal === "number") {
    chips.push(`Subtotal: ${formatMoney(event.metadata.subtotal)}`);
  }

  if (typeof event.metadata?.orderId === "string") {
    chips.push(`Order: ${shortenId(event.metadata.orderId)}`);
  }

  if (typeof event.metadata?.section === "string") {
    chips.push(`Section: ${event.metadata.section}`);
  }

  if (typeof event.metadata?.source === "string") {
    chips.push(`Source: ${event.metadata.source}`);
  }

  return chips.slice(0, 4);
}

function describeEvent(event: SessionEvent) {
  switch (event.type) {
    case "page_view":
      return event.path ? `Visited ${event.path}` : "Visited a page";
    case "search":
      return event.query ? `Searched for "${event.query}"` : "Ran a search";
    case "product_view":
      return event.productId ? `Viewed product ${shortenId(event.productId)}` : "Viewed a product";
    case "add_to_cart":
      return event.productId
        ? `Added product ${shortenId(event.productId)} to cart`
        : "Added an item to cart";
    case "remove_from_cart":
      return event.productId
        ? `Removed product ${shortenId(event.productId)} from cart`
        : "Removed an item from cart";
    case "update_quantity":
      return event.productId
        ? `Changed quantity for ${shortenId(event.productId)}`
        : "Updated a cart quantity";
    case "checkout_start":
      return "Started checkout";
    case "recommendation_impression":
      return event.metadata?.section
        ? `Saw recommendations in ${event.metadata.section}`
        : "Saw recommendations";
    case "recommendation_feedback":
      if (event.metadata?.feedback === "more_like_this") {
        return event.productId
          ? `Marked product ${shortenId(event.productId)} as more like this`
          : "Liked a recommendation";
      }
      if (event.metadata?.feedback === "not_relevant") {
        return event.productId
          ? `Marked product ${shortenId(event.productId)} as not relevant`
          : "Dismissed a recommendation";
      }
      return "Gave recommendation feedback";
    case "order_placed":
      return event.metadata?.orderId
        ? `Placed order ${shortenId(event.metadata.orderId)}`
        : "Placed an order";
    default:
      return "Tracked event";
  }
}

type AnalyticsSummary = {
  searchCount: number;
  searchSuccessRate: number;
  positiveFeedbackCount: number;
  negativeFeedbackCount: number;
  topCategory: string | null;
  topCategoryCount: number;
  topSearchTerms: Array<{ label: string; count: number }>;
  topCategories: Array<{ label: string; count: number }>;
};

function buildAnalyticsSummary(events: SessionEvent[]): AnalyticsSummary {
  const searchLookup = new Map<string, { label: string; count: number; timestamp: number }>();
  const categoryLookup = new Map<string, { label: string; count: number }>();
  let positiveFeedbackCount = 0;
  let negativeFeedbackCount = 0;

  for (const event of events) {
    if (event.type === "search" && event.query?.trim()) {
      const key = normalizeLabel(event.query);
      const current = searchLookup.get(key);
      if (current) {
        current.count += 1;
      } else {
        searchLookup.set(key, {
          label: event.query.trim(),
          count: 1,
          timestamp: Date.parse(event.timestamp),
        });
      }
    }

    if (event.type === "recommendation_feedback") {
      if (event.metadata?.feedback === "more_like_this") positiveFeedbackCount += 1;
      if (event.metadata?.feedback === "not_relevant") negativeFeedbackCount += 1;
    }

    const categories = event.metadata?.category;
    if (Array.isArray(categories)) {
      for (const category of categories) {
        const trimmed = category.trim();
        if (!trimmed) continue;
        const key = normalizeLabel(trimmed);
        const current = categoryLookup.get(key);
        if (current) {
          current.count += 1;
        } else {
          categoryLookup.set(key, { label: trimmed, count: 1 });
        }
      }
    }
  }

  const topSearchTerms = [...searchLookup.values()]
    .sort((left, right) => right.count - left.count || right.timestamp - left.timestamp)
    .slice(0, 4)
    .map(({ label, count }) => ({ label, count }));

  const topCategories = [...categoryLookup.values()]
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
    .slice(0, 4)
    .map(({ label, count }) => ({ label, count }));

  const searchCount = events.filter(
    (event) => event.type === "search" && event.query?.trim(),
  ).length;
  const engagedSearches = events.reduce((count, event, index) => {
    if (event.type !== "search" || !event.query?.trim()) return count;

    const searchTimestamp = Date.parse(event.timestamp);
    const engaged = events.slice(index + 1).some((laterEvent) => {
      if (Date.parse(laterEvent.timestamp) < searchTimestamp) return false;
      return (
        laterEvent.type === "product_view" ||
        laterEvent.type === "add_to_cart" ||
        laterEvent.type === "checkout_start" ||
        laterEvent.type === "order_placed"
      );
    });

    return engaged ? count + 1 : count;
  }, 0);

  return {
    searchCount,
    searchSuccessRate: searchCount > 0 ? engagedSearches / searchCount : 0,
    positiveFeedbackCount,
    negativeFeedbackCount,
    topCategory: topCategories[0]?.label ?? null,
    topCategoryCount: topCategories[0]?.count ?? 0,
    topSearchTerms,
    topCategories,
  };
}

function normalizeLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function formatTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function shortenId(value: string) {
  if (value.length <= 12) return value;
  return `${value.slice(0, 8)}…${value.slice(-4)}`;
}
