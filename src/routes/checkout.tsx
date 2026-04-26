import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  BadgeCheck,
  CreditCard,
  Loader2,
  ShieldCheck,
  ShoppingBag,
  Truck,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { useCart } from "@/hooks/use-cart";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/products";
import { trackCheckoutStart, trackOrderPlaced, trackPageView } from "@/lib/session-analytics";
import { toast } from "sonner";

export const Route = createFileRoute("/checkout")({
  component: CheckoutPage,
});

function CheckoutPage() {
  const { user, loading } = useAuth();
  const { items, subtotal, clear } = useCart();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [busy, setBusy] = useState(false);
  const checkoutViewTracked = useRef(false);
  const checkoutStartTracked = useRef(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth", search: { redirect: "/checkout" } });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (loading || !user || checkoutViewTracked.current) return;
    trackPageView("/checkout", {
      userId: user.id,
      metadata: { cartCount: items.length, subtotal },
    });
    checkoutViewTracked.current = true;
  }, [items.length, loading, subtotal, user]);

  useEffect(() => {
    if (loading || !user || items.length === 0 || checkoutStartTracked.current) return;
    trackCheckoutStart({
      userId: user.id,
      metadata: { cartCount: items.length, subtotal },
    });
    checkoutStartTracked.current = true;
  }, [items.length, loading, subtotal, user]);

  const shipping = subtotal > 35 ? 0 : 5.99;
  const tax = subtotal * 0.08;
  const total = subtotal + shipping + tax;

  const placeOrder = async () => {
    if (!user || items.length === 0) return;
    setBusy(true);
    const { data: order, error } = await supabase
      .from("orders")
      .insert({ user_id: user.id, total_amount: total, status: "pending" })
      .select()
      .single();
    if (error || !order) {
      setBusy(false);
      toast.error(error?.message ?? "Failed to create order");
      return;
    }
    const orderItems = items.map((i) => ({
      order_id: order.id,
      product_id: i.product_id,
      product_name: i.product?.name ?? "Product",
      unit_price: Number(i.product?.price ?? 0),
      quantity: i.quantity,
    }));
    const { error: oiErr } = await supabase.from("order_items").insert(orderItems);
    if (oiErr) {
      setBusy(false);
      toast.error(oiErr.message);
      return;
    }
    trackOrderPlaced(
      items.map((item) => item.product_id),
      order.id,
      {
        userId: user.id,
        metadata: { cartCount: items.length, subtotal, total },
      },
    );
    await clear();
    setBusy(false);
    toast.success("Order placed! Payment processing will be enabled soon.");
    navigate({ to: "/orders" });
  };

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="mx-auto max-w-2xl px-4 py-16 text-center">
          <ShoppingBag className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h1 className="mt-4 text-2xl font-bold">Your cart is empty</h1>
          <Button asChild className="mt-6">
            <Link to="/">Continue shopping</Link>
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        <Link
          to="/"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Continue shopping
        </Link>
        <h1 className="mt-4 text-3xl font-bold">Checkout</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Secure checkout, clear order totals, and buyer-friendly delivery signals make the flow
          easier to trust.
        </p>

        <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_400px]">
          <div className="space-y-6">
            <section className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-4 text-lg font-semibold">Shipping address</h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="addr">Street address</Label>
                  <Input id="addr" value={address} onChange={(e) => setAddress(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input id="city" value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="zip">ZIP / Postal code</Label>
                  <Input id="zip" value={zip} onChange={(e) => setZip(e.target.value)} />
                </div>
              </div>
            </section>

            <section className="rounded-xl border border-border bg-card p-6">
              <h2 className="mb-2 text-lg font-semibold">Payment</h2>
              <div className="rounded-lg border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                <CreditCard className="mb-2 h-5 w-5 text-primary" />
                Real card payments via Stripe will be enabled once the integration is activated. For
                now, you can place a test order to verify the flow.
              </div>
            </section>

            <section className="rounded-[1.5rem] border border-indigo-100/70 bg-indigo-50/80 p-5 shadow-[var(--shadow-card)]">
              <h2 className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">
                Trust signals
              </h2>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                <TrustItem
                  icon={<ShieldCheck className="h-4 w-4" />}
                  title="Protected checkout"
                  description="Encrypted account and order data."
                />
                <TrustItem
                  icon={<BadgeCheck className="h-4 w-4" />}
                  title="Buyer protection"
                  description="Clear orders and easier support follow-up."
                />
                <TrustItem
                  icon={<Truck className="h-4 w-4" />}
                  title="Shipping clarity"
                  description={
                    shipping === 0
                      ? "Free shipping over $35"
                      : `Shipping adds ${formatPrice(shipping)} today.`
                  }
                />
              </div>
            </section>
          </div>

          <aside className="rounded-xl border border-border bg-card p-6 lg:sticky lg:top-24 lg:self-start">
            <h2 className="mb-4 text-lg font-semibold">Order summary</h2>
            <ul className="space-y-3">
              {items.map((i) => (
                <li key={i.id} className="flex justify-between gap-3 text-sm">
                  <span className="line-clamp-2 flex-1">
                    {i.product?.name}
                    <span className="text-muted-foreground"> × {i.quantity}</span>
                  </span>
                  <span className="font-medium">
                    {formatPrice(Number(i.product?.price ?? 0) * i.quantity)}
                  </span>
                </li>
              ))}
            </ul>
            <Separator className="my-4" />
            <dl className="space-y-2 text-sm">
              <Row label="Subtotal" value={formatPrice(subtotal)} />
              <Row label="Shipping" value={shipping === 0 ? "Free" : formatPrice(shipping)} />
              <Row label="Tax (est.)" value={formatPrice(tax)} />
            </dl>
            <Separator className="my-4" />
            <div className="flex justify-between text-base font-bold">
              <span>Total</span>
              <span>{formatPrice(total)}</span>
            </div>
            <div className="mt-4 rounded-2xl border border-indigo-100/70 bg-indigo-50 px-4 py-3 text-sm text-muted-foreground">
              Your order is placed as a test purchase for now, but the data flow already mirrors a
              real checkout.
            </div>
            <Button
              size="lg"
              className="mt-6 w-full"
              onClick={placeOrder}
              disabled={busy || !name || !address || !city || !zip}
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Place order
            </Button>
          </aside>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

function TrustItem({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-white/70 bg-white/90 p-4 shadow-sm">
      <div className="flex items-center gap-2 text-primary">
        {icon}
        <p className="text-sm font-semibold text-foreground">{title}</p>
      </div>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
  );
}
