import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2, Package } from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { formatPrice } from "@/lib/products";
import { trackPageView } from "@/lib/session-analytics";

type Order = {
  id: string;
  total_amount: number;
  status: string;
  created_at: string;
  order_items: { id: string; product_name: string; unit_price: number; quantity: number }[];
};

export const Route = createFileRoute("/orders")({
  component: OrdersPage,
});

function OrdersPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<Order[]>([]);
  const [busy, setBusy] = useState(true);
  const trackedOrdersView = useRef(false);

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/auth", search: { redirect: "/orders" } });
      return;
    }
    if (user) {
      supabase
        .from("orders")
        .select(
          "id, total_amount, status, created_at, order_items(id, product_name, unit_price, quantity)",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .then(({ data }) => {
          setOrders((data ?? []) as unknown as Order[]);
          setBusy(false);
        });
    }
  }, [user, loading, navigate]);

  useEffect(() => {
    if (loading || !user || trackedOrdersView.current) return;
    trackPageView("/orders", { userId: user.id });
    trackedOrdersView.current = true;
  }, [loading, user]);

  if (loading || busy) {
    return (
      <div className="min-h-screen bg-background">
        <SiteHeader />
        <div className="flex items-center justify-center py-24">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader />
      <div className="mx-auto max-w-4xl px-4 py-8 md:px-6">
        <h1 className="text-3xl font-bold">My orders</h1>
        {orders.length === 0 ? (
          <div className="mt-12 rounded-xl border border-border bg-card p-12 text-center">
            <Package className="mx-auto h-12 w-12 text-muted-foreground/50" />
            <p className="mt-3 text-muted-foreground">You haven't placed any orders yet.</p>
            <Button asChild className="mt-6">
              <Link to="/">Start shopping</Link>
            </Button>
          </div>
        ) : (
          <ul className="mt-6 space-y-4">
            {orders.map((o) => (
              <li key={o.id} className="rounded-xl border border-border bg-card p-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Order</p>
                    <p className="font-mono text-sm">#{o.id.slice(0, 8)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Placed</p>
                    <p className="text-sm">{new Date(o.created_at).toLocaleDateString()}</p>
                  </div>
                  <Badge variant={o.status === "paid" ? "default" : "secondary"}>{o.status}</Badge>
                  <p className="text-lg font-semibold">{formatPrice(Number(o.total_amount))}</p>
                </div>
                <ul className="mt-4 space-y-1 border-t border-border pt-4 text-sm text-muted-foreground">
                  {o.order_items?.map((it) => (
                    <li key={it.id} className="flex justify-between">
                      <span>
                        {it.product_name} × {it.quantity}
                      </span>
                      <span>{formatPrice(Number(it.unit_price) * it.quantity)}</span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
