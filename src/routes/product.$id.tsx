import {
  createFileRoute,
  Link,
  notFound,
  useRouter,
} from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Heart, Package, Star, Truck } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { RecommendationSection } from "@/components/RecommendationSection";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  fetchProductById,
  fetchRecommendationPool,
  formatPrice,
  type Product,
} from "@/lib/products";
import { useCart } from "@/hooks/use-cart";
import { useAuth } from "@/hooks/use-auth";
import { useNavigate } from "@tanstack/react-router";
import { useHybridRecommendations } from "@/hooks/use-hybrid-recommendations";
import { useSessionEvents } from "@/hooks/use-session-events";
import { useWishlist } from "@/hooks/use-wishlist";
import { trackPageView, trackProductView } from "@/lib/session-analytics";
import {
  deriveSessionSignals,
  recommendProducts,
  stripRecommendationImpressions,
} from "@/lib/recommendations";

export const Route = createFileRoute("/product/$id")({
  loader: async ({ params }) => {
    const product = await fetchProductById(params.id);
    if (!product) throw notFound();
    return { product };
  },
  component: ProductPage,
  errorComponent: ({ error }) => (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <p className="text-sm text-destructive">{error.message}</p>
        <Link to="/" className="mt-4 inline-block text-primary hover:underline">
          Back to catalog
        </Link>
      </div>
    </div>
  ),
  notFoundComponent: () => (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <h1 className="text-3xl font-bold">Product not found</h1>
        <Link to="/" className="mt-4 inline-block text-primary hover:underline">
          Back to catalog
        </Link>
      </div>
    </div>
  ),
});

type Extra = {
  asin?: string;
  seller_name?: string;
  manufacturer?: string;
  dimensions?: string;
  weight?: string;
  discount?: string;
  availability?: string;
  buybox_seller?: string;
  features?: string;
  format?: string;
  country_of_origin?: string;
};

function ProductPage() {
  const { product } = Route.useLoaderData();
  const router = useRouter();
  const navigate = useNavigate();
  const { addItem, items: cartItems } = useCart();
  const { user } = useAuth();
  const { isBusy: isWishlistBusy, isWishlisted, toggleWishlist } = useWishlist();
  const sessionEvents = useSessionEvents();
  const recommendationEvents = stripRecommendationImpressions(sessionEvents);
  const [recommendationPool, setRecommendationPool] = useState<Product[]>([]);
  const extra = (product.extra_data ?? {}) as Extra;
  const out = product.stock <= 0;
  const categories: string[] = Array.isArray(product.category)
    ? (product.category as string[])
    : [];
  const categoryKey = categories.join("|");
  const trackedProductIds = useRef(new Set<string>());

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
    if (trackedProductIds.current.has(product.id)) return;
    trackedProductIds.current.add(product.id);

    trackPageView(`/product/${product.id}`, {
      userId: user?.id,
      metadata: {
        brand: product.brand,
        category: categories,
        path: `/product/${product.id}`,
        price: product.price,
      },
    });

    trackProductView(product.id, {
      userId: user?.id,
      metadata: {
        brand: product.brand,
        category: categories,
        path: `/product/${product.id}`,
        price: product.price,
      },
    });
  }, [categories, categoryKey, product.brand, product.id, product.price, user?.id]);

  const sessionSignals = deriveSessionSignals(recommendationEvents);
  const recentViewedProducts = recommendationPool.filter((candidate) =>
    sessionSignals.recentProductIds.includes(candidate.id),
  );
  const orderProducts = recommendationPool.filter((candidate) =>
    sessionSignals.orderProductIds.includes(candidate.id),
  );
  const clientSimilarProducts = recommendProducts(recommendationPool, {
    seedProduct: product,
    recentProducts: [...recentViewedProducts, ...orderProducts],
    cartProducts: cartItems.map((item) => item.product),
    orderProducts,
    searchTerms: sessionSignals.searchTerms,
    events: recommendationEvents,
    excludeIds: [product.id],
    limit: 4,
  });
  const { items: similarProducts } = useHybridRecommendations({
    pool: recommendationPool,
    context: {
      seedProduct: product,
      recentProducts: [...recentViewedProducts, ...orderProducts],
      cartProducts: cartItems.map((item) => item.product),
      orderProducts,
      searchTerms: sessionSignals.searchTerms,
      events: recommendationEvents,
      excludeIds: [product.id],
      limit: 4,
    },
    fallback: clientSimilarProducts,
    enabled: recommendationPool.length > 0,
  });

  const handleAdd = async () => {
    if (!user) {
      navigate({ to: "/auth", search: { redirect: `/product/${product.id}` } });
      return;
    }
    await addItem(product.id, 1);
  };

  const handleBuyNow = async () => {
    if (!user) {
      navigate({ to: "/auth", search: { redirect: `/product/${product.id}` } });
      return;
    }
    await addItem(product.id, 1);
    navigate({ to: "/checkout" });
  };

  const handleWishlist = async () => {
    if (!user) {
      navigate({ to: "/auth", search: { redirect: `/product/${product.id}` } });
      return;
    }

    await toggleWishlist(product);
  };

  const wishlisted = isWishlisted(product.id);
  const wishlistBusy = isWishlistBusy(product.id);

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-7xl px-4 py-6 md:px-6">
        <button
          onClick={() => router.history.back()}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back
        </button>

        <div className="mt-6 grid gap-8 lg:grid-cols-2">
          <div className="overflow-hidden rounded-xl border border-border bg-card p-6">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name}
                className="mx-auto aspect-square w-full max-w-md object-contain"
              />
            ) : (
              <div className="flex aspect-square w-full items-center justify-center text-muted-foreground">
                No image available
              </div>
            )}
          </div>

          <div className="flex flex-col gap-4">
            {product.brand && (
              <span className="text-xs font-semibold uppercase tracking-widest text-primary">
                {product.brand}
              </span>
            )}
            <h1 className="text-2xl font-bold leading-tight text-foreground md:text-3xl">
              {product.name}
            </h1>

            {product.rating != null && (
              <div className="flex items-center gap-2 text-sm">
                <span className="flex">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star
                      key={i}
                      className={`h-4 w-4 ${
                        i < Math.round(Number(product.rating))
                          ? "fill-rating text-rating"
                          : "text-muted-foreground/30"
                      }`}
                    />
                  ))}
                </span>
                <span className="font-semibold text-foreground">
                  {Number(product.rating).toFixed(1)}
                </span>
                <span className="text-muted-foreground">
                  ({product.reviews_count.toLocaleString()} reviews)
                </span>
              </div>
            )}

            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-foreground">
                {formatPrice(Number(product.price))}
              </span>
              {extra.discount && (
                <Badge variant="secondary">{extra.discount}</Badge>
              )}
            </div>

            <div className="flex items-center gap-2 text-sm">
              {out ? (
                <Badge variant="destructive">Out of stock</Badge>
              ) : product.stock < 10 ? (
                <span className="inline-flex items-center gap-1 font-medium text-rating">
                  <Package className="h-4 w-4" /> Only {product.stock} left in stock
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 font-medium text-success">
                  <Package className="h-4 w-4" /> In stock ({product.stock} available)
                </span>
              )}
            </div>

            {categories.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <Link
                    key={c}
                    to="/"
                    search={{ category: c }}
                    className="inline-flex items-center rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                  >
                    {c}
                  </Link>
                ))}
              </div>
            )}

            <Separator className="my-2" />

            <div className="flex gap-3">
              <Button size="lg" disabled={out} className="flex-1" onClick={handleAdd}>
                {out ? "Unavailable" : "Add to cart"}
              </Button>
              <Button size="lg" variant="outline" disabled={out} onClick={handleBuyNow}>
                Buy now
              </Button>
            </div>

            <Button
              size="lg"
              variant={wishlisted ? "secondary" : "outline"}
              className="w-full"
              onClick={handleWishlist}
              disabled={wishlistBusy}
            >
              <Heart className={`h-4 w-4 ${wishlisted ? "fill-foreground" : ""}`} />
              {wishlisted ? "Saved to wishlist" : "Save to wishlist"}
            </Button>

            <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              <Truck className="h-4 w-4 text-primary" />
              Free shipping on orders over $35
            </div>
          </div>
        </div>

        {product.description && (
          <div className="mt-12">
            <h2 className="mb-3 text-lg font-semibold text-foreground">
              About this item
            </h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
              {product.description}
            </p>
          </div>
        )}

        <div className="mt-12">
          <h2 className="mb-4 text-lg font-semibold text-foreground">
            Product details
          </h2>
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 rounded-xl border border-border bg-card p-6 text-sm sm:grid-cols-2">
            <Detail label="Brand" value={product.brand} />
            <Detail label="Manufacturer" value={extra.manufacturer} />
            <Detail label="ASIN" value={extra.asin} />
            <Detail label="Dimensions" value={extra.dimensions} />
            <Detail label="Weight" value={extra.weight} />
            <Detail label="Seller" value={extra.seller_name || extra.buybox_seller} />
            <Detail label="Availability" value={extra.availability} />
            <Detail label="Country of origin" value={extra.country_of_origin} />
            <Detail label="Format" value={extra.format} />
          </dl>
        </div>

        {similarProducts.length > 0 && (
          <div className="mt-12">
            <RecommendationSection
              title="More like this"
              description="Similar items shaped by brand, category, price, and your recent activity."
              items={similarProducts}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  if (!value || value === "null" || value === "") return null;
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 pb-2 last:border-0">
      <dt className="font-medium text-muted-foreground">{label}</dt>
      <dd className="text-right text-foreground">{value}</dd>
    </div>
  );
}
