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

  const handleWishlist = async () => {
    if (!user) {
      toast.error("Please sign in to save items to your wishlist");
      return;
    }

    await toggleWishlist(product);
  };

  return (
    <div className="group relative flex flex-col overflow-hidden rounded-[1.6rem] border border-border/80 bg-card/90 text-card-foreground shadow-[var(--shadow-card)] transition-all duration-300 hover:-translate-y-1 hover:border-primary/20 hover:shadow-[var(--shadow-hover)]">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className="absolute right-3 top-3 z-20 h-9 w-9 rounded-full border-border/70 bg-background/90 shadow-sm backdrop-blur transition-all hover:-translate-y-0.5 hover:bg-background"
        onClick={handleWishlist}
        disabled={busy}
        aria-label={wishlisted ? "Remove from wishlist" : "Save to wishlist"}
      >
        <Heart className={`h-4 w-4 ${wishlisted ? "fill-destructive text-destructive" : "text-foreground"}`} />
      </Button>

      <Link
        to="/product/$id"
        params={{ id: product.id }}
        className="flex h-full flex-col text-card-foreground"
      >
        <div className="relative aspect-square overflow-hidden bg-muted">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.22),transparent_42%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/5 to-transparent opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          {product.image_url ? (
            <img
              src={product.image_url}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-contain p-4 transition-transform duration-300 group-hover:scale-105"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              No image
            </div>
          )}
          {out && (
            <Badge className="absolute left-2 top-2 bg-destructive text-destructive-foreground">
              Out of stock
            </Badge>
          )}
          {!out && lowStock && (
            <Badge className="absolute left-2 top-2 bg-rating text-foreground">
              Only {product.stock} left
            </Badge>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2 p-4">
          {product.brand && (
            <span className="inline-flex w-fit items-center rounded-full bg-muted/80 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              {product.brand}
            </span>
          )}
          <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-foreground">
            {product.name}
          </h3>
          <div className="mt-auto flex items-end justify-between gap-2 pt-2">
            <span className="text-lg font-semibold tracking-tight text-foreground">
              {formatPrice(Number(product.price))}
            </span>
            {product.rating != null && (
              <div className="inline-flex items-center gap-1 rounded-full border border-border/70 bg-background/80 px-2.5 py-1 text-xs shadow-sm">
                <Star className="h-3.5 w-3.5 fill-rating text-rating" />
                <span className="font-semibold text-foreground">
                  {Number(product.rating).toFixed(1)}
                </span>
                <span className="text-muted-foreground">
                  ({product.reviews_count})
                </span>
              </div>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}
