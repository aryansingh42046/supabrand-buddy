import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { ArrowUpDown, SlidersHorizontal } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { FilterSidebar } from "@/components/FilterSidebar";
import { ProductCard } from "@/components/ProductCard";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import {
  fetchFacets,
  fetchProducts,
  type Product,
  type ProductFilters,
} from "@/lib/products";

const searchSchema = z.object({
  search: z.string().optional(),
  brand: z.string().optional(),
  category: z.string().optional(),
  minRating: z.coerce.number().optional(),
  maxPrice: z.coerce.number().optional(),
  sort: z
    .enum(["relevance", "price_asc", "price_desc", "rating_desc", "popular"])
    .optional(),
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
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [facets, setFacets] = useState<{
    brands: { name: string; count: number }[];
    categories: { name: string; count: number }[];
  }>({ brands: [], categories: [] });

  const pageSize = 24;
  const page = search.page ?? 1;

  useEffect(() => {
    fetchFacets().then(setFacets).catch(console.error);
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
      <SiteHeader initialSearch={search.search ?? ""} />

      {!search.search &&
        !search.brand &&
        !search.category &&
        !search.minRating &&
        !search.maxPrice && <Hero />}

      <main className="mx-auto max-w-7xl px-4 py-8 md:px-6">
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
            <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-xl font-bold text-foreground md:text-2xl">
                  {search.category ??
                    search.brand ??
                    (search.search
                      ? `Results for "${search.search}"`
                      : "All products")}
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
                    <Button variant="outline" size="sm" className="lg:hidden">
                      <SlidersHorizontal className="mr-2 h-4 w-4" />
                      Filters
                    </Button>
                  </SheetTrigger>
                  <SheetContent side="left" className="w-[300px] overflow-y-auto">
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
                  <SelectTrigger className="w-[180px]">
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

            {loading ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-[3/4] animate-pulse rounded-xl bg-muted"
                  />
                ))}
              </div>
            ) : products.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-12 text-center">
                <p className="text-lg font-medium text-foreground">
                  No products found
                </p>
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
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
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

      <footer className="mt-16 border-t border-border bg-card">
        <div className="mx-auto max-w-7xl px-4 py-8 text-center text-sm text-muted-foreground md:px-6">
          EchoCart · 992 products imported from your catalog
        </div>
      </footer>
    </div>
  );
}

function Hero() {
  return (
    <section className="bg-[image:var(--gradient-hero)] text-primary-foreground">
      <div className="mx-auto max-w-7xl px-4 py-14 md:px-6 md:py-20">
        <div className="max-w-2xl">
          <p className="mb-3 text-sm font-medium uppercase tracking-widest text-primary-foreground/80">
            Fresh catalog · 992 items
          </p>
          <h1 className="text-3xl font-bold leading-tight md:text-5xl">
            Discover gear, home goods & more — all in one place.
          </h1>
          <p className="mt-4 text-base text-primary-foreground/90 md:text-lg">
            Browse curated products with rich details: live stock counts, ratings,
            reviews, and full descriptions pulled straight from your catalog.
          </p>
        </div>
      </div>
    </section>
  );
}
