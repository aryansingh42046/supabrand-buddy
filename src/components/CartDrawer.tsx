import { Link } from "@tanstack/react-router";
import { Minus, Plus, ShoppingBag, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useCart } from "@/hooks/use-cart";
import { useAuth } from "@/hooks/use-auth";
import { formatPrice } from "@/lib/products";

export function CartDrawer() {
  const { items, count, subtotal, updateQty, removeItem } = useCart();
  const { user } = useAuth();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="icon" className="relative">
          <ShoppingBag className="h-5 w-5" />
          {count > 0 && (
            <Badge className="absolute -right-2 -top-2 h-5 min-w-5 justify-center px-1 text-xs">
              {count}
            </Badge>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border p-6">
          <SheetTitle>Your cart ({count})</SheetTitle>
          <SheetDescription>Review items before checkout</SheetDescription>
        </SheetHeader>

        <div className="flex-1 overflow-y-auto">
          {!user ? (
            <EmptyState
              title="Sign in to view your cart"
              description="Your cart syncs across devices when you're signed in."
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
          ) : items.length === 0 ? (
            <EmptyState
              title="Your cart is empty"
              description="Add some products to get started."
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
                      <img src={item.product.image_url} alt={item.product.name} className="h-full w-full object-contain" />
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
                    <span className="text-sm font-semibold">{formatPrice(Number(item.product?.price ?? 0))}</span>
                    <div className="mt-auto flex items-center justify-between">
                      <div className="flex items-center rounded-md border border-border">
                        <button
                          onClick={() => updateQty(item.id, item.quantity - 1)}
                          className="px-2 py-1 hover:bg-accent"
                          aria-label="Decrease"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="min-w-8 text-center text-sm">{item.quantity}</span>
                        <button
                          onClick={() => updateQty(item.id, item.quantity + 1)}
                          className="px-2 py-1 hover:bg-accent"
                          aria-label="Increase"
                          disabled={item.quantity >= (item.product?.stock ?? 99)}
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>
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
              <div className="flex justify-between text-base font-semibold">
                <span>Subtotal</span>
                <span>{formatPrice(subtotal)}</span>
              </div>
              <p className="text-xs text-muted-foreground">Shipping and taxes calculated at checkout.</p>
              <SheetClose asChild>
                <Button asChild className="w-full" size="lg">
                  <Link to="/checkout">Checkout</Link>
                </Button>
              </SheetClose>
            </div>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EmptyState({ title, description, cta }: { title: string; description: string; cta: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <ShoppingBag className="h-12 w-12 text-muted-foreground/50" />
      <h3 className="text-base font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="mt-2">{cta}</div>
    </div>
  );
}
