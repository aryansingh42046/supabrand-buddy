import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { type Product } from "@/lib/products";

export type WishlistItem = {
  id: string;
  product_id: string;
  created_at: string;
  product: Product;
};

type WishlistCtx = {
  items: WishlistItem[];
  count: number;
  loading: boolean;
  refresh: () => Promise<void>;
  isWishlisted: (productId: string) => boolean;
  isBusy: (productId: string) => boolean;
  toggleWishlist: (product: Product) => Promise<void>;
  removeItem: (wishlistItemId: string) => Promise<void>;
};

const Ctx = createContext<WishlistCtx>({
  items: [],
  count: 0,
  loading: false,
  refresh: async () => {},
  isWishlisted: () => false,
  isBusy: () => false,
  toggleWishlist: async () => {},
  removeItem: async () => {},
});

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    if (!user) {
      setItems([]);
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("wishlist_items")
        .select(
          "id, product_id, created_at, product:products(id, name, description, price, image_url, category, brand, rating, reviews_count, stock, extra_data, created_at)",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        toast.error("Failed to load wishlist");
        return;
      }

      setItems((data ?? []) as unknown as WishlistItem[]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const withBusy = useCallback(async (productId: string, action: () => Promise<void>) => {
    setBusyIds((current) => new Set(current).add(productId));
    try {
      await action();
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(productId);
        return next;
      });
    }
  }, []);

  const toggleWishlist = useCallback(
    async (product: Product) => {
      if (!user) {
        toast.error("Please sign in to save items to your wishlist");
        return;
      }

      if (busyIds.has(product.id)) return;

      const existing = items.find((item) => item.product_id === product.id);

      await withBusy(product.id, async () => {
        if (existing) {
          const { error } = await supabase.from("wishlist_items").delete().eq("id", existing.id);
          if (error) {
            toast.error(error.message);
            await refresh();
            return;
          }

          toast.success("Removed from wishlist");
          await refresh();
          return;
        }

        const { error } = await supabase.from("wishlist_items").insert({
          user_id: user.id,
          product_id: product.id,
        });

        if (error) {
          toast.error(error.message);
          await refresh();
          return;
        }

        toast.success("Saved to wishlist");
        await refresh();
      });
    },
    [busyIds, items, refresh, user, withBusy],
  );

  const removeItem = useCallback(
    async (wishlistItemId: string) => {
      const item = items.find((entry) => entry.id === wishlistItemId);
      if (!item || !user) return;

      if (busyIds.has(item.product_id)) return;

      await withBusy(item.product_id, async () => {
        const { error } = await supabase.from("wishlist_items").delete().eq("id", wishlistItemId);
        if (error) {
          toast.error(error.message);
          await refresh();
          return;
        }

        toast.success("Removed from wishlist");
        await refresh();
      });
    },
    [busyIds, items, refresh, user, withBusy],
  );

  const wishlistedIds = useMemo(() => new Set(items.map((item) => item.product_id)), [items]);

  return (
    <Ctx.Provider
      value={{
        items,
        count: items.length,
        loading,
        refresh,
        isWishlisted: (productId) => wishlistedIds.has(productId),
        isBusy: (productId) => busyIds.has(productId),
        toggleWishlist,
        removeItem,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useWishlist() {
  return useContext(Ctx);
}