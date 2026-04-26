import { Link } from "@tanstack/react-router";
import { Heart, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useWishlist } from "@/hooks/use-wishlist";
import { type Product, formatPrice } from "@/lib/products";
import { toast } from "sonner";

export function ProductCard({ product }: { product: Product }) {
  const lowStock = product.stock > 0 && product.stock < 10;
  const out = product.stock <= 0;
  const { user } = useAuth();
  const { isBusy, isWishlisted, toggleWishlist } = useWishlist();
  const wishlisted = isWishlisted(product.id);
  const busy = isBusy(product.id);
  const topRated = (product.rating ?? 0) >= 4.6;
  const statusLabel = out
    ? "Out of stock"
    : lowStock
      ? `Only ${product.stock} left`
      : topRated
        ? "Top rated"
        : null;

  const handleWishlist = async () => {
    if (!user) {
      toast.error("Please sign in to save items to your wishlist");
      return;
    }

    await toggleWishlist(product);
  };

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-[1.9rem] border border-indigo-100/70 bg-white/85 text-card-foreground shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/25 hover:shadow-[var(--shadow-hover)]">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="absolute right-3 top-3 z-20 h-9 w-9 rounded-full border border-indigo-100/80 bg-white/90 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-indigo-50"
        onClick={handleWishlist}
        disabled={busy}
        aria-label={wishlisted ? "Remove from wishlist" : "Save to wishlist"}
      >
        <Heart
          className={`h-4 w-4 ${wishlisted ? "fill-destructive text-destructive" : "text-foreground"}`}
        />
      </Button>

      <Link
        to="/product/$id"
        params={{ id: product.id }}
        className="flex h-full flex-col text-card-foreground"
      >
        <div className="relative aspect-square overflow-hidden bg-[linear-gradient(180deg,rgba(241,247,255,0.98),rgba(255,255,255,1))]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.56),transparent_45%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-indigo-200/15 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          {statusLabel && (
            <Badge
              className={`absolute left-3 top-3 z-10 rounded-full px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] shadow-sm ${out ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"}`}
            >
              {statusLabel}
            </Badge>
          )}
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-contain p-6 transition-transform duration-300 group-hover:scale-105"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              No image
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-3 p-4">
          {product.brand && (
            <span className="inline-flex w-fit items-center rounded-full bg-indigo-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-primary">
              {product.brand}
            </span>
          )}
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
            {product.name}
          </h3>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {product.rating != null ? (
              <>
                <Star className="h-3.5 w-3.5 fill-rating text-rating" />
                <span className="font-semibold text-foreground">
                  {Number(product.rating).toFixed(1)}
                </span>
                <span>({product.reviews_count.toLocaleString()} reviews)</span>
              </>
            ) : (
              <span>New arrival</span>
            )}
          </div>
          <div className="mt-auto flex items-end justify-between gap-3 pt-1">
            <div>
              <span className="text-2xl font-bold tracking-tight text-primary">
                {formatPrice(Number(product.price))}
              </span>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Tap for details
              </p>
            </div>
            <span className="inline-flex items-center rounded-full border border-indigo-100/70 bg-indigo-50 px-2.5 py-1 text-[11px] font-semibold text-foreground">
              Quick view
            </span>
          </div>
        </div>
      </Link>
    </div>
  );
}
