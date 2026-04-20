import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { type Product, formatPrice } from "@/lib/products";

export function ProductCard({ product }: { product: Product }) {
  const lowStock = product.stock > 0 && product.stock < 10;
  const out = product.stock <= 0;

  return (
    <Link
      to="/product/$id"
      params={{ id: product.id }}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground shadow-[var(--shadow-card)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-hover)]"
    >
      <div className="relative aspect-square overflow-hidden bg-muted">
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
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {product.brand}
          </span>
        )}
        <h3 className="line-clamp-2 text-sm font-medium leading-snug text-foreground">
          {product.name}
        </h3>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          <span className="text-lg font-semibold text-foreground">
            {formatPrice(Number(product.price))}
          </span>
          {product.rating != null && (
            <div className="flex items-center gap-1 text-sm">
              <Star className="h-3.5 w-3.5 fill-rating text-rating" />
              <span className="font-medium text-foreground">
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
  );
}
