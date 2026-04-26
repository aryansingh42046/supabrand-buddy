import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { z } from "zod";
import { ArrowUpDown, SlidersHorizontal } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { FilterSidebar } from "@/components/FilterSidebar";
import { ProductCard } from "@/components/ProductCard";
import { RecommendationSection } from "@/components/RecommendationSection";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { useCart } from "@/hooks/use-cart";
import { useHybridRecommendations } from "@/hooks/use-hybrid-recommendations";
import { useSessionEvents } from "@/hooks/use-session-events";
import {
  fetchFacets,
  fetchProducts,
  fetchRecommendationPool,
  type Product,
  type ProductFilters,
} from "@/lib/products";
import { trackPageView } from "@/lib/session-analytics";
import {
  deriveSessionSignals,
  materializeProductsByIds,
  recommendProducts,
  stripRecommendationImpressions,
} from "@/lib/recommendations";

const searchSchema = z.object({
  search: z.string().optional(),
  brand: z.string().optional(),
  category: z.string().optional(),
  minRating: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  sort: z.enum(["relevance", "price_asc", "price_desc", "rating_desc", "popular"]).optional(),
  page: z.coerce.number().optional(),
});

export type StoreSearch = z.infer<typeof searchSchema>;

export const Route = createFileRoute("/")({
  validateSearch: searchSchema,
  component: Index,
});

function Index() {
  const router = useRouter();
  const search = Route.useSearch();
  const { user } = useAuth();
  const { items: cartItems } = useCart();
  const sessionEvents = useSessionEvents();
  const recommendationEvents = stripRecommendationImpressions(sessionEvents);
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [recommendationPool, setRecommendationPool] = useState<Product[]>([]);
  const [facets, setFacets] = useState<{
    brands: { name: string; count: number }[];
    categories: { name: string; count: number }[];
  }>({ brands: [], categories: [] });
  const lastTrackedState = useRef<string | null>(null);

  const pageSize = 24;
  const page = search.page ?? 1;

  useEffect(() => {
    const stateKey = JSON.stringify({
      search: search.search ?? "",
      brand: search.brand ?? "",
      category: search.category ?? "",
      minRating: search.minRating ?? null,
      maxPrice: search.maxPrice ?? null,
      sort: search.sort ?? "relevance",
      page,
    });

    if (lastTrackedState.current === stateKey) return;
    lastTrackedState.current = stateKey;

    trackPageView("/", {
      userId: user?.id,
      metadata: {
        search: search.search ?? "",
        brand: search.brand ?? null,
        category: search.category ?? null,
        minRating: search.minRating ?? null,
        maxPrice: search.maxPrice ?? null,
        sort: search.sort ?? "relevance",
        page,
      },
    });
  }, [
    user?.id,
    search.search,
    search.brand,
    search.category,
    search.minRating,
    search.maxPrice,
    search.sort,
    page,
  ]);

  useEffect(() => {
    fetchFacets().then(setFacets).catch(console.error);
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchRecommendationPool()
      .then((pool) => {
        if (!cancelled) setRecommendationPool(pool);
      })
      .catch((error) => {
        console.error(error);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const filters: ProductFilters = {
      search: search.search,
      brand: search.brand,
      category: search.category,
      minRating: search.minRating,
      maxPrice: search.maxPrice,
      sort: search.sort ?? "relevance",
      page,
      pageSize,
    };
    fetchProducts(filters)
      .then((res) => {
        if (cancelled) return;
        setProducts(res.products);
        setTotal(res.total);
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) {
          setProducts([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    search.search,
    search.brand,
    search.category,
    search.minRating,
    search.maxPrice,
    search.sort,
    page,
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const sessionSignals = deriveSessionSignals(recommendationEvents);
  const recentViewedProducts = materializeProductsByIds(
    recommendationPool,
    sessionSignals.recentProductIds,
  );
  const orderProducts = materializeProductsByIds(
    recommendationPool,
    sessionSignals.orderProductIds,
  );
  const positiveFeedbackProducts = materializeProductsByIds(
    recommendationPool,
    sessionSignals.positiveFeedbackProductIds,
  );
  const excludedRecommendationIds = [
    ...new Set([
      ...products.map((product) => product.id),
      ...sessionSignals.negativeFeedbackProductIds,
    ]),
  ];
  const recommendationSeedProducts = [
    ...recentViewedProducts,
    ...orderProducts,
    ...positiveFeedbackProducts,
  ];
  const clientRecommendedProducts = recommendProducts(recommendationPool, {
    recentProducts: recommendationSeedProducts,
    cartProducts: cartItems.map((item) => item.product),
    orderProducts,
    searchTerms: search.search
      ? [search.search, ...sessionSignals.searchTerms]
      : sessionSignals.searchTerms,
    events: recommendationEvents,
    excludeIds: excludedRecommendationIds,
    positiveFeedbackProductIds: sessionSignals.positiveFeedbackProductIds,
    negativeFeedbackProductIds: sessionSignals.negativeFeedbackProductIds,
    limit: 8,
  });
  const { items: recommendedProducts } = useHybridRecommendations({
    pool: recommendationPool,
    context: {
      recentProducts: recommendationSeedProducts,
      cartProducts: cartItems.map((item) => item.product),
      orderProducts,
      searchTerms: search.search
        ? [search.search, ...sessionSignals.searchTerms]
        : sessionSignals.searchTerms,
      events: recommendationEvents,
      excludeIds: excludedRecommendationIds,
      positiveFeedbackProductIds: sessionSignals.positiveFeedbackProductIds,
      negativeFeedbackProductIds: sessionSignals.negativeFeedbackProductIds,
      limit: 8,
    },
    fallback: clientRecommendedProducts,
    enabled: recommendationPool.length > 0,
  });
  const showRecommendations =
    !search.search && !search.brand && !search.category && !search.minRating && !search.maxPrice;
  const featuredBrands = facets.brands.slice(0, 4);

  const setSort = (val: string) =>
    router.navigate({
      to: "/",
      search: (prev: StoreSearch) => ({
        ...prev,
        sort: val as StoreSearch["sort"],
        page: 1,
      }),
    });

  const goToPage = (p: number) =>
    router.navigate({
      to: "/",
      search: (prev: StoreSearch) => ({ ...prev, page: p }),
    });

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader
        initialSearch={search.search ?? ""}
        quickSearches={[
          ...facets.categories.slice(0, 4).map((category) => category.name),
          ...facets.brands.slice(0, 4).map((brand) => brand.name),
        ]}
      />

      {!search.search &&
        !search.brand &&
        !search.category &&
        !search.minRating &&
        !search.maxPrice && <Hero brands={featuredBrands} />}

      <main className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        {showRecommendations && recommendedProducts.length > 0 && (
          <div className="mb-8">
            <RecommendationSection
              title="Recommended for you"
              description="Blended from your recent activity, cart, and the most relevant catalog items."
              items={recommendedProducts}
            />
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[260px_1fr]">
          <div className="hidden lg:block">
            <FilterSidebar
              brands={facets.brands}
              categories={facets.categories}
              selectedBrand={search.brand}
              selectedCategory={search.category}
              minRating={search.minRating}
              maxPrice={search.maxPrice}
            />
          </div>

          <section>
            <div className="mb-6 rounded-[2rem] border border-indigo-100/70 bg-white/82 p-4 shadow-[var(--shadow-card)] backdrop-blur-xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold text-foreground md:text-2xl">
                    {search.category ??
                      search.brand ??
                      (search.search ? `Results for "${search.search}"` : "All products")}
                  </h1>
                  <p className="text-sm text-muted-foreground">
                    {loading
                      ? "Loading…"
                      : `${total.toLocaleString()} ${total === 1 ? "product" : "products"}`}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Sheet>
                    <SheetTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full border-indigo-100/70 bg-white/90 lg:hidden"
                      >
                        <SlidersHorizontal className="mr-2 h-4 w-4" />
                        Filters
                      </Button>
                    </SheetTrigger>
                    <SheetContent
                      side="left"
                      className="w-[320px] overflow-y-auto bg-background/98"
                    >
                      <div className="mt-6">
                        <FilterSidebar
                          brands={facets.brands}
                          categories={facets.categories}
                          selectedBrand={search.brand}
                          selectedCategory={search.category}
                          minRating={search.minRating}
                          maxPrice={search.maxPrice}
                        />
                      </div>
                    </SheetContent>
                  </Sheet>
                  <ArrowUpDown className="hidden h-4 w-4 text-muted-foreground sm:block" />
                  <Select value={search.sort ?? "relevance"} onValueChange={setSort}>
                    <SelectTrigger className="w-[180px] rounded-full border-indigo-100/70 bg-white/90 shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="relevance">Top rated</SelectItem>
                      <SelectItem value="popular">Most reviewed</SelectItem>
                      <SelectItem value="price_asc">Price: low to high</SelectItem>
                      <SelectItem value="price_desc">Price: high to low</SelectItem>
                      <SelectItem value="rating_desc">Highest rating</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>

            {loading ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="aspect-[3/4] animate-pulse rounded-[1.9rem] bg-muted" />
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="rounded-[2rem] border border-dashed border-indigo-100/70 bg-white/80 p-12 text-center shadow-[var(--shadow-card)] backdrop-blur">
                <p className="text-lg font-medium text-foreground">No products found</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Try adjusting your filters or search.
                </p>
                <Link
                  to="/"
                  search={{}}
                  className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
                >
                  Clear filters
                </Link>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                  {products.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>

                {totalPages > 1 && (
                  <div className="mt-10 flex items-center justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => goToPage(page - 1)}
                    >
                      Previous
                    </Button>
                    <span className="px-3 text-sm text-muted-foreground">
                      Page {page} of {totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => goToPage(page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </>
            )}
          </section>
        </div>
      </main>

      <footer className="mt-16 border-t border-indigo-100/70 bg-[linear-gradient(180deg,rgba(249,249,255,0.98),rgba(255,255,255,0.96))] dark:bg-[linear-gradient(180deg,rgba(14,18,26,0.98),rgba(18,22,32,0.98))]">
        <div className="mx-auto max-w-7xl px-4 py-12 md:px-6">
          <div className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                title: "Buyer protection",
                text: "Confident checkout, safer purchases, clear order flows.",
              },
              {
                title: "Daily deals",
                text: "Use search, filters, and recommendations to find fast-moving offers.",
              },
              {
                title: "Wishlist support",
                text: "Save items for later and return when you are ready.",
              },
              {
                title: "Smart discovery",
                text: "Behavior-aware ranking that learns from browsing and carts.",
              },
            ].map((item) => (
              <div
                key={item.title}
                className="rounded-[1.6rem] border border-indigo-100/70 bg-white/82 p-4 shadow-[var(--shadow-card)] backdrop-blur"
              >
                <p className="text-sm font-semibold text-foreground">{item.title}</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">{item.text}</p>
              </div>
            ))}
          </div>

          <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr_0.8fr]">
            <div className="max-w-md space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[image:var(--gradient-hero)] text-primary-foreground shadow-[var(--shadow-card)]">
                  <span className="text-sm font-bold">EC</span>
                </div>
                <div>
                  <p className="text-lg font-bold tracking-tight text-foreground">EchoCart</p>
                  <p className="text-sm text-muted-foreground">
                    Marketplace-style shopping built around your catalog.
                  </p>
                </div>
              </div>

              <p className="text-sm leading-6 text-muted-foreground">
                Browse curated products, get explainable recommendations, and keep your shopping
                flow fast across search, cart, wishlist, and checkout.
              </p>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.28em] text-foreground">
                Explore
              </h3>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                <li>
                  <Link to="/" className="transition-colors hover:text-foreground">
                    Catalog
                  </Link>
                </li>
                <li>
                  <Link to="/orders" className="transition-colors hover:text-foreground">
                    Orders
                  </Link>
                </li>
                <li>
                  <Link to="/account" className="transition-colors hover:text-foreground">
                    Account
                  </Link>
                </li>
                <li>
                  <Link to="/checkout" className="transition-colors hover:text-foreground">
                    Checkout
                  </Link>
                </li>
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-semibold uppercase tracking-[0.28em] text-foreground">
                Support
              </h3>
              <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
                <li>
                  <Link to="/auth" className="transition-colors hover:text-foreground">
                    Sign in
                  </Link>
                </li>
                <li>
                  <Link
                    to="/"
                    search={{ sort: "popular" }}
                    className="transition-colors hover:text-foreground"
                  >
                    Popular picks
                  </Link>
                </li>
                <li>
                  <Link
                    to="/"
                    search={{ sort: "rating_desc" }}
                    className="transition-colors hover:text-foreground"
                  >
                    Top rated
                  </Link>
                </li>
                <li>
                  <span className="text-muted-foreground">
                    Fast search and live recommendations
                  </span>
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-10 flex flex-col gap-4 border-t border-indigo-100/70 pt-6 text-sm text-muted-foreground md:flex-row md:items-center md:justify-between">
            <p>EchoCart is designed to feel quick, personal, and explainable.</p>
            <p>Built for catalog-first ecommerce experiences.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function Hero({ brands }: { brands: { name: string; count: number }[] }) {
  return (
    <section className="mx-auto max-w-7xl px-4 pt-6 md:px-6 md:pt-8">
      <div className="relative overflow-hidden rounded-[2.5rem] border border-indigo-100/70 bg-[image:var(--gradient-hero)] text-primary-foreground shadow-[var(--shadow-card)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.28),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.12),transparent_28%)]" />
        <div className="relative grid gap-8 px-5 py-10 md:px-8 md:py-14 lg:grid-cols-[1.15fr_0.85fr] lg:items-center lg:px-10 lg:py-16">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/12 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.3em] text-primary-foreground/90">
              Curated marketplace
            </div>
            <h1 className="mt-4 max-w-2xl text-4xl font-black leading-[0.95] md:text-6xl">
              A cleaner storefront for faster shopping.
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-7 text-primary-foreground/88 md:text-base">
              Browse curated products, save items, and jump between search, filters,
              recommendations, and checkout in a calmer blue interface.
            </p>

            <div className="mt-6 flex flex-wrap gap-3">
              <Button
                asChild
                className="rounded-full bg-primary-foreground px-5 text-foreground shadow-[0_12px_30px_-18px_rgba(0,0,0,0.5)] hover:bg-white"
              >
                <Link to="/">Shop catalog</Link>
              </Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <div className="rounded-[1.8rem] border border-primary-foreground/15 bg-primary-foreground/12 p-5 backdrop-blur">
              <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-primary-foreground/70">
                Deal spotlight
              </p>
              <p className="mt-3 text-3xl font-black tracking-tight">Up to 70% off</p>
              <p className="mt-2 text-sm leading-6 text-primary-foreground/82">
                Feature your strongest offers without overcrowding the page.
              </p>
            </div>

            <div className="rounded-[1.8rem] border border-primary-foreground/15 bg-card/95 p-5 text-foreground shadow-[var(--shadow-card)]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-primary">
                Top brand
              </p>
              <p className="mt-3 text-lg font-semibold text-foreground">
                {brands[0]?.name ?? "Top brands"}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                {brands.length > 0
                  ? `${brands[0].count.toLocaleString()} curated picks from the most active sellers.`
                  : "Browse fast-moving products across every category."}
              </p>
            </div>

            <div className="rounded-[1.8rem] border border-primary-foreground/15 bg-primary-foreground/12 p-5 backdrop-blur sm:col-span-2 lg:col-span-1 xl:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.26em] text-primary-foreground/70">
                    Smarter flow
                  </p>
                  <p className="mt-2 text-lg font-semibold">
                    Saved wishlist, explainable picks, and faster checkout
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 text-xs text-primary-foreground/90">
                  <span className="rounded-full bg-primary-foreground/12 px-3 py-1">
                    Express delivery
                  </span>
                  <span className="rounded-full bg-primary-foreground/12 px-3 py-1">
                    Live tracking
                  </span>
                  <span className="rounded-full bg-primary-foreground/12 px-3 py-1">
                    Wishlist sync
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
