import { Link, useNavigate } from "@tanstack/react-router";
import { lazy, Suspense, useEffect, useMemo, useState, type FormEvent } from "react";
import { MessageSquareMore, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CartDrawer } from "@/components/CartDrawer";
import { WishlistDrawer } from "@/components/WishlistDrawer";
import { UserMenu } from "@/components/UserMenu";
import { useAuth } from "@/hooks/use-auth";
import { getRecentSearchQueries, trackSearch } from "@/lib/session-analytics";

const ShoppingAssistant = lazy(() =>
  import("@/components/ShoppingAssistant").then((module) => ({
    default: module.ShoppingAssistant,
  })),
);

export function SiteHeader({
  initialSearch = "",
  quickSearches = [],
}: {
  initialSearch?: string;
  quickSearches?: string[];
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState(initialSearch);
  const [focused, setFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => getRecentSearchQueries(5));
  const { user } = useAuth();

  useEffect(() => {
    setQ(initialSearch);
  }, [initialSearch]);

  const suggestionTerms = useMemo(() => {
    const seen = new Set<string>();
    const suggestions: string[] = [];

    for (const term of [...recentSearches, ...quickSearches]) {
      const trimmed = term.trim();
      if (!trimmed) continue;
      const normalized = trimmed.toLowerCase();
      if (seen.has(normalized)) continue;
      seen.add(normalized);
      suggestions.push(trimmed);
    }

    return suggestions.slice(0, 6);
  }, [quickSearches, recentSearches]);

  const runSearch = (term: string) => {
    const trimmed = term.trim();
    if (!trimmed) return;

    trackSearch(trimmed, { userId: user?.id, metadata: { source: "header" } });
    setRecentSearches(getRecentSearchQueries(5));
    setQ(trimmed);
    setFocused(false);
    navigate({
      to: "/",
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        search: trimmed,
        page: 1,
      }),
    });
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    runSearch(q);
  };

  return (
    <header className="sticky top-0 z-40 border-b border-indigo-100/70 bg-[linear-gradient(180deg,rgba(249,249,255,0.88),rgba(255,255,255,0.74))] backdrop-blur-2xl">
      <div className="mx-auto max-w-7xl px-4 py-3 md:px-6">
        <div className="rounded-[2rem] border border-indigo-100/70 bg-white/82 px-4 py-4 shadow-[0_18px_48px_-34px_rgba(99,102,241,0.34)] backdrop-blur">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <Link to="/" className="flex items-center gap-3 lg:shrink-0">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[image:var(--gradient-hero)] text-primary-foreground shadow-[var(--shadow-card)]">
                <span className="text-sm font-bold">EC</span>
              </div>
              <div>
                <span className="block text-lg font-bold tracking-tight text-foreground">
                  EchoCart
                </span>
                <span className="block text-xs font-medium text-muted-foreground">
                  A calmer, smarter way to browse
                </span>
              </div>
            </Link>

            <form onSubmit={onSubmit} className="relative w-full lg:max-w-3xl lg:flex-1">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  onFocus={() => setFocused(true)}
                  onBlur={() => setTimeout(() => setFocused(false), 150)}
                  placeholder="Search products, brands, categories…"
                  className="h-12 rounded-full border-indigo-100/80 bg-slate-50/85 pl-11 pr-4 text-sm shadow-none transition-colors focus-visible:ring-primary"
                />
              </div>

              {focused && suggestionTerms.length > 0 && (
                <div className="absolute left-0 right-0 top-[calc(100%+0.75rem)] z-30 rounded-[1.5rem] border border-indigo-100/80 bg-white/95 p-3 shadow-[0_18px_48px_-30px_rgba(99,102,241,0.42)] backdrop-blur-xl">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-muted-foreground">
                      Search suggestions
                    </p>
                    <p className="text-[10px] font-medium uppercase tracking-[0.22em] text-primary">
                      Recent + popular
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {suggestionTerms.map((term) => (
                      <button
                        key={term}
                        type="button"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => runSearch(term)}
                        className="rounded-full border border-indigo-100/80 bg-indigo-50 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:bg-indigo-100"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </form>

            <div className="flex items-center gap-2 self-start lg:self-auto">
              <Suspense
                fallback={
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-11 w-11 rounded-full border-border/70 bg-card shadow-[var(--shadow-card)]"
                  >
                    <MessageSquareMore className="h-5 w-5" />
                  </Button>
                }
              >
                <ShoppingAssistant />
              </Suspense>
              <WishlistDrawer />
              <CartDrawer />
              <UserMenu />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-primary">
              Free shipping over $35
            </span>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-primary">
              Buyer protection
            </span>
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-primary">
              Flash sales daily
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
