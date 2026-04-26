import { useNavigate } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { Button } from "@/components/ui/button";

type Facet = { name: string; count: number };

type Props = {
  brands: Facet[];
  categories: Facet[];
  selectedBrand?: string;
  selectedCategory?: string;
  minRating?: number;
  maxPrice?: number;
};

const PRICE_BUCKETS = [25, 50, 100, 250, 500];

export function FilterSidebar({
  brands,
  categories,
  selectedBrand,
  selectedCategory,
  minRating,
  maxPrice,
}: Props) {
  const navigate = useNavigate();
  const update = (patch: Record<string, unknown>) =>
    navigate({
      to: "/",
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        ...patch,
        page: 1,
      }),
    });

  const clearAll = () =>
    navigate({
      to: "/",
      search: () => ({}),
    });

  const hasFilters = selectedBrand || selectedCategory || minRating || maxPrice;

  return (
    <aside className="sticky top-28 space-y-5 rounded-[1.85rem] border border-indigo-100/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(249,249,255,0.82))] p-5 shadow-[var(--shadow-card)] backdrop-blur-xl">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-primary">
            Refine
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Refine results</h2>
        </div>
        {hasFilters && (
          <button
            onClick={clearAll}
            className="rounded-full border border-indigo-100/70 bg-indigo-50 px-3 py-1 text-xs font-semibold text-primary transition-colors hover:bg-indigo-100"
          >
            Clear all
          </button>
        )}
      </div>

      <FilterGroup title="Category" description="Shop by what people browse most">
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {categories.map((c) => {
            const active = selectedCategory === c.name;
            return (
              <button
                key={c.name}
                onClick={() => update({ category: active ? undefined : c.name })}
                className={`flex w-full items-center justify-between rounded-full border px-3 py-2 text-sm transition-all ${
                  active
                    ? "border-transparent bg-primary text-primary-foreground shadow-sm"
                    : "border-border/70 bg-white/85 text-foreground hover:border-indigo-100 hover:bg-indigo-50"
                }`}
              >
                <span className="truncate">{c.name}</span>
                <span
                  className={`text-xs ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}
                >
                  {c.count}
                </span>
              </button>
            );
          })}
        </div>
      </FilterGroup>

      <FilterGroup title="Brand" description="Top labels and sellers">
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {brands.map((b) => {
            const active = selectedBrand === b.name;
            return (
              <button
                key={b.name}
                onClick={() => update({ brand: active ? undefined : b.name })}
                className={`flex w-full items-center justify-between rounded-full border px-3 py-2 text-sm transition-all ${
                  active
                    ? "border-transparent bg-primary text-primary-foreground shadow-sm"
                    : "border-border/70 bg-white/85 text-foreground hover:border-indigo-100 hover:bg-indigo-50"
                }`}
              >
                <span className="truncate">{b.name}</span>
                <span
                  className={`text-xs ${active ? "text-primary-foreground/80" : "text-muted-foreground"}`}
                >
                  {b.count}
                </span>
              </button>
            );
          })}
        </div>
      </FilterGroup>

      <FilterGroup title="Rating" description="Prioritize highly rated picks">
        <div className="space-y-2">
          {[4, 3, 2, 1].map((r) => {
            const active = minRating === r;
            return (
              <button
                key={r}
                onClick={() => update({ minRating: active ? undefined : r })}
                className={`flex w-full items-center gap-2 rounded-full border px-3 py-2 text-sm transition-all ${
                  active
                    ? "border-transparent bg-primary text-primary-foreground shadow-sm"
                    : "border-border/70 bg-white/85 text-foreground hover:border-indigo-100 hover:bg-indigo-50"
                }`}
              >
                <span className="flex">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-3.5 w-3.5 ${
                        i < r
                          ? "fill-rating text-rating"
                          : active
                            ? "text-primary-foreground/40"
                            : "text-muted-foreground/40"
                      }`}
                    />
                  ))}
                </span>
                <span>& up</span>
              </button>
            );
          })}
        </div>
      </FilterGroup>

      <FilterGroup title="Max price" description="Quick budget buckets">
        <div className="flex flex-wrap gap-2">
          {PRICE_BUCKETS.map((p) => {
            const active = maxPrice === p;
            return (
              <Button
                key={p}
                size="sm"
                variant={active ? "default" : "outline"}
                className="rounded-full"
                onClick={() => update({ maxPrice: active ? undefined : p })}
              >
                Under ${p}
              </Button>
            );
          })}
        </div>
      </FilterGroup>
    </aside>
  );
}

function FilterGroup({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-indigo-100/70 bg-white/75 p-4 shadow-[0_8px_28px_-24px_rgba(99,102,241,0.28)]">
      <div className="mb-3">
        <h3 className="text-xs font-semibold uppercase tracking-[0.22em] text-foreground">
          {title}
        </h3>
        {description && (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}
