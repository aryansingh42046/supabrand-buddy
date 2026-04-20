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

  const hasFilters =
    selectedBrand || selectedCategory || minRating || maxPrice;

  return (
    <aside className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Filters
        </h2>
        {hasFilters && (
          <button
            onClick={clearAll}
            className="text-xs font-medium text-primary hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      <FilterGroup title="Category">
        <div className="space-y-1">
          {categories.map((c) => {
            const active = selectedCategory === c.name;
            return (
              <button
                key={c.name}
                onClick={() =>
                  update({ category: active ? undefined : c.name })
                }
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-accent"
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

      <FilterGroup title="Brand">
        <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
          {brands.map((b) => {
            const active = selectedBrand === b.name;
            return (
              <button
                key={b.name}
                onClick={() => update({ brand: active ? undefined : b.name })}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-accent"
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

      <FilterGroup title="Rating">
        <div className="space-y-1">
          {[4, 3, 2, 1].map((r) => {
            const active = minRating === r;
            return (
              <button
                key={r}
                onClick={() => update({ minRating: active ? undefined : r })}
                className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-accent"
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

      <FilterGroup title="Max price">
        <div className="flex flex-wrap gap-2">
          {PRICE_BUCKETS.map((p) => {
            const active = maxPrice === p;
            return (
              <Button
                key={p}
                size="sm"
                variant={active ? "default" : "outline"}
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
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      {children}
    </div>
  );
}
