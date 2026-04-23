import { Link } from "@tanstack/react-router";
import { Heart, Loader2, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { useCart } from "@/hooks/use-cart";
import { useWishlist } from "@/hooks/use-wishlist";
import { formatPrice } from "@/lib/products";

export function WishlistDrawer() {
  const { user } = useAuth();
  const { items, count, loading, removeItem } = useWishlist();
  const { addItem } = useCart();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <Heart className="h-5 w-5" />
          {count > 0 && (
            <Badge className="absolute -right-2 -top-2 h-5 min-w-5 justify-center px-1 text-xs">
              {count}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border p-6">
          <SheetTitle>Your wishlist ({count})</SheetTitle>
          <SheetDescription>Save items for later and move them to cart when you are ready.</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {!user ? (
            <EmptyState
              title="Sign in to use your wishlist"
              description="Wishlist items sync across devices when you're signed in."
              cta={
                <SheetClose asChild>
                  <Button asChild>
                    <Link to="/auth" search={{ redirect: "/" }}>
                      Sign in
                    </Link>
                  </Button>
                </SheetClose>
              }
            />
          ) : loading ? (
            <div className="flex h-full items-center justify-center p-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title="Your wishlist is empty"
              description="Save products you like so you can revisit them later."
              cta={
                <SheetClose asChild>
                  <Button asChild>
                    <Link to="/">Browse products</Link>
                  </Button>
                </SheetClose>
              }
            />
          ) : (
            <ul className="divide-y divide-border">
              {items.map((item) => (
                <li key={item.id} className="flex gap-3 p-4">
                  <div className="h-20 w-20 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                    {item.product?.image_url ? (
                      <img
                        src={item.product.image_url}
                        alt={item.product.name}
                        className="h-full w-full object-contain"
                      />
                    ) : null}
                  </div>
                  <div className="flex flex-1 flex-col gap-1">
                    <SheetClose asChild>
                      <Link
                        to="/product/$id"
                        params={{ id: item.product_id }}
                        className="line-clamp-2 text-sm font-medium hover:text-primary"
                      >
                        {item.product?.name ?? "Product"}
                      </Link>
                    </SheetClose>
                    {item.product?.brand && (
                      <span className="text-xs text-muted-foreground">{item.product.brand}</span>
                    )}
                    <span className="text-sm font-semibold">
                      {formatPrice(Number(item.product?.price ?? 0))}
                    </span>
                    <div className="mt-auto flex items-center justify-between gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={async () => {
                          await addItem(item.product_id, 1);
                          await removeItem(item.id);
                        }}
                      >
                        Add to cart
                      </Button>
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {user && items.length > 0 && (
          <SheetFooter className="border-t border-border p-6">
            <div className="w-full space-y-3">
              <p className="text-xs text-muted-foreground">
                Wishlist items stay saved until you remove them.
              </p>
              <SheetClose asChild>
                <Button asChild variant="outline" className="w-full">
                  <Link to="/">Continue shopping</Link>
                </Button>
              </SheetClose>
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EmptyState({
  title,
  description,
  cta,
}: {
  title: string;
  description: string;
  cta: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <Heart className="h-12 w-12 text-muted-foreground/50" />
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="mt-2">{cta}</div>
    </div>
  );
}