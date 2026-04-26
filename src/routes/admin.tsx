import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  Box,
  ChartNoAxesCombined,
  PackageX,
  Sparkles,
  Truck,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { fetchFacets, fetchProducts, type Product } from "@/lib/products";

export const Route = createFileRoute("/admin")({
  loader: async () => {
    const [{ products, total }, facets] = await Promise.all([
      fetchProducts({ pageSize: 2000 }),
      fetchFacets(),
    ]);

    return {
      products,
      total,
      facets,
    };
  },
  component: MerchDashboard,
});

function MerchDashboard() {
  const { products, total, facets } = Route.useLoaderData();

  const lowStock = products.filter((product) => product.stock > 0 && product.stock < 10);
  const outOfStock = products.filter((product) => product.stock <= 0);
  const averageRating = products.length
    ? products.reduce((sum, product) => sum + Number(product.rating ?? 0), 0) / products.length
    : 0;
  const featuredProducts = [...products]
    .sort((left, right) => Number(right.rating ?? 0) - Number(left.rating ?? 0))
    .slice(0, 6);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />

      <main className="mx-auto max-w-7xl px-4 py-8 md:px-6">
        <div className="rounded-[2.25rem] border border-indigo-100/70 bg-[linear-gradient(135deg,rgba(78,84,211,0.94),rgba(33,58,136,0.96))] p-6 text-primary-foreground shadow-[var(--shadow-card)] md:p-8">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 rounded-full border border-primary-foreground/20 bg-primary-foreground/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-primary-foreground/85">
                <Sparkles className="h-3.5 w-3.5" />
                Merch dashboard
              </div>
              <h1 className="mt-4 text-4xl font-black tracking-tight md:text-5xl">
                Manage featured products, stock risk, and catalog shape.
              </h1>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-primary-foreground/85 md:text-base">
                This page turns the catalog into something you can explain in a demo: what is top
                rated, what needs restocking, and which categories and brands are carrying the
                storefront.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard
                label="Products"
                value={total.toLocaleString()}
                icon={<Box className="h-5 w-5" />}
              />
              <StatCard
                label="Avg rating"
                value={averageRating.toFixed(1)}
                icon={<ChartNoAxesCombined className="h-5 w-5" />}
              />
              <StatCard
                label="Low stock"
                value={lowStock.length.toLocaleString()}
                icon={<Truck className="h-5 w-5" />}
              />
              <StatCard
                label="Out of stock"
                value={outOfStock.length.toLocaleString()}
                icon={<PackageX className="h-5 w-5" />}
              />
            </div>
          </div>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="border-border/70 bg-card/85 shadow-[var(--shadow-card)]">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">Low stock items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {lowStock.length > 0 ? (
                lowStock
                  .slice(0, 8)
                  .map((product) => (
                    <CatalogRow
                      key={product.id}
                      product={product}
                      badge={product.stock <= 0 ? "Out of stock" : `${product.stock} left`}
                      badgeTone={product.stock <= 0 ? "destructive" : "warning"}
                    />
                  ))
              ) : (
                <EmptyState
                  title="No low-stock items"
                  description="Everything in the sample window is comfortably stocked."
                />
              )}
            </CardContent>
          </Card>

          <Card className="border-border/70 bg-card/85 shadow-[var(--shadow-card)]">
            <CardHeader className="pb-4">
              <CardTitle className="text-xl">Featured collections</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Top categories
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {facets.categories.slice(0, 6).map((category) => (
                    <Badge
                      key={category.name}
                      variant="secondary"
                      className="rounded-full border-border/70 px-3 py-1"
                    >
                      <Link
                        to="/"
                        search={{ category: category.name }}
                        className="flex items-center gap-2"
                      >
                        {category.name}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Badge>
                  ))}
                </div>
              </div>

              <Separator />

              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">
                  Top brands
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {facets.brands.slice(0, 6).map((brand) => (
                    <Badge
                      key={brand.name}
                      variant="outline"
                      className="rounded-full border-border/70 px-3 py-1"
                    >
                      <Link
                        to="/"
                        search={{ brand: brand.name }}
                        className="flex items-center gap-2"
                      >
                        {brand.name}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </Badge>
                  ))}
                </div>
              </div>

              <Separator />

              <div className="rounded-2xl border border-indigo-100/70 bg-indigo-50 px-4 py-4">
                <p className="text-sm font-semibold text-foreground">What this dashboard is for</p>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Use it to explain merchandising decisions, spot risky inventory, and jump straight
                  into filtered catalog views.
                </p>
                <Button asChild className="mt-4 rounded-full">
                  <Link to="/">Open catalog</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card className="mt-8 border-border/70 bg-card/85 shadow-[var(--shadow-card)]">
          <CardHeader className="pb-4">
            <CardTitle className="text-xl">Featured products</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {featuredProducts.map((product) => (
              <CatalogRow
                key={product.id}
                product={product}
                badge={
                  product.rating != null
                    ? `${Number(product.rating).toFixed(1)} rating`
                    : "No rating"
                }
                badgeTone="default"
              />
            ))}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-[1.5rem] border border-primary-foreground/15 bg-primary-foreground/10 p-4 backdrop-blur">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-primary-foreground/70">
            {label}
          </p>
          <p className="mt-2 text-2xl font-black tracking-tight text-primary-foreground">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-primary-foreground/15 bg-primary-foreground/10 text-primary-foreground">
          {icon}
        </div>
      </div>
    </div>
  );
}

function CatalogRow({
  product,
  badge,
  badgeTone,
}: {
  product: Product;
  badge: string;
  badgeTone: "default" | "warning" | "destructive";
}) {
  const badgeClassName =
    badgeTone === "destructive"
      ? "bg-destructive text-destructive-foreground"
      : badgeTone === "warning"
        ? "bg-rating text-foreground"
        : "bg-indigo-50 text-primary";

  return (
    <div className="flex items-start gap-4 rounded-2xl border border-border/70 bg-background/80 p-4">
      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-indigo-50 text-primary">
        <Sparkles className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Link
            to="/product/$id"
            params={{ id: product.id }}
            className="line-clamp-1 font-medium text-foreground hover:text-primary"
          >
            {product.name}
          </Link>
          <Badge
            className={`rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] ${badgeClassName}`}
          >
            {badge}
          </Badge>
        </div>
        <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
          {product.brand ?? "Unknown brand"} ·{" "}
          {product.category.slice(0, 2).join(" / ") || "Uncategorized"}
        </p>
        <div className="mt-3 flex items-center justify-between gap-3 text-sm text-muted-foreground">
          <span>{product.stock} in stock</span>
          <span className="font-semibold text-foreground">
            {product.price.toLocaleString("en-US", { style: "currency", currency: "USD" })}
          </span>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border/70 bg-background/70 p-5 text-sm text-muted-foreground">
      <p className="font-medium text-foreground">{title}</p>
      <p className="mt-1 leading-6">{description}</p>
    </div>
  );
}
