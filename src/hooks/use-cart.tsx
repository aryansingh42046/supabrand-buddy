import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { type Product } from "@/lib/products";
import {
  trackAddToCart,
  trackRemoveFromCart,
  trackUpdateCartQuantity,
} from "@/lib/session-analytics";
import { toast } from "sonner";

export type CartItem = {
  id: string;
  product_id: string;
  quantity: number;
  product: Product;
};

type CartCtx = {
  items: CartItem[];
  count: number;
  subtotal: number;
  loading: boolean;
  addItem: (productId: string, qty?: number) => Promise<void>;
  updateQty: (itemId: string, qty: number) => Promise<void>;
  removeItem: (itemId: string) => Promise<void>;
  clear: () => Promise<void>;
  refresh: () => Promise<void>;
};

const Ctx = createContext<CartCtx>({
  items: [],
  count: 0,
  subtotal: 0,
  loading: false,
  addItem: async () => {},
  updateQty: async () => {},
  removeItem: async () => {},
  clear: async () => {},
  refresh: async () => {},
});

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) {
      setItems([]);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("cart_items")
      .select(
        "id, product_id, quantity, product:products(id, name, description, price, image_url, category, brand, rating, reviews_count, stock, extra_data, created_at)",
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    setLoading(false);
    if (error) {
      toast.error("Failed to load cart");
      return;
    }
    setItems((data ?? []) as unknown as CartItem[]);
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const addItem = async (productId: string, qty: number = 1) => {
    if (!user) {
      toast.error("Please sign in to add items to your cart");
      return;
    }
    const existing = items.find((i) => i.product_id === productId);
    if (existing) {
      await updateQty(existing.id, existing.quantity + qty);
      return;
    }
    const { error } = await supabase
      .from("cart_items")
      .insert({ user_id: user.id, product_id: productId, quantity: qty });
    if (error) {
      toast.error(error.message);
      return;
    }
    trackAddToCart(productId, qty, { userId: user.id });
    toast.success("Added to cart");
    await refresh();
  };

  const updateQty = async (itemId: string, qty: number) => {
    if (qty <= 0) return removeItem(itemId);
    const { error } = await supabase.from("cart_items").update({ quantity: qty }).eq("id", itemId);
    if (error) {
      toast.error(error.message);
      return;
    }
    const updatedItem = items.find((item) => item.id === itemId);
    if (updatedItem && user) {
      trackUpdateCartQuantity(updatedItem.product_id, qty, { userId: user.id });
    }
    await refresh();
  };

  const removeItem = async (itemId: string) => {
    const removedItem = items.find((item) => item.id === itemId);
    const { error } = await supabase.from("cart_items").delete().eq("id", itemId);
    if (error) {
      toast.error(error.message);
      return;
    }
    if (removedItem && user) {
      trackRemoveFromCart(removedItem.product_id, {
        userId: user.id,
        metadata: { quantity: removedItem.quantity },
      });
    }
    await refresh();
  };

  const clear = async () => {
    if (!user) return;
    await supabase.from("cart_items").delete().eq("user_id", user.id);
    await refresh();
  };

  const count = items.reduce((s, i) => s + i.quantity, 0);
  const subtotal = items.reduce((s, i) => s + i.quantity * Number(i.product?.price ?? 0), 0);

  return (
    <Ctx.Provider
      value={{ items, count, subtotal, loading, addItem, updateQty, removeItem, clear, refresh }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useCart() {
  return useContext(Ctx);
}
