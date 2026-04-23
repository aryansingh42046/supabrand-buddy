import { useEffect, useRef, useState } from "react";
import { type Product } from "@/lib/products";
import { trainHybridRecommendations, type TrainHybridRecommendationsResponse } from "@/lib/recommendations.functions";
import { stripRecommendationImpressions, type RecommendationContext, type RecommendedProduct } from "@/lib/recommendations";

function buildRequestKey(pool: Product[], context: RecommendationContext) {
  const events = stripRecommendationImpressions(context.events ?? []);
  const recentIds = context.recentProducts?.map((product) => product.id) ?? [];
  const cartIds = context.cartProducts?.map((product) => product.id) ?? [];
  const orderIds = context.orderProducts?.map((product) => product.id) ?? [];
  const eventIds = events.map((event) => `${event.id}:${event.type}:${event.timestamp}:${event.productId ?? ""}`);

  return JSON.stringify({
    pool: pool.map((product) => `${product.id}:${Math.round(Number(product.price))}:${product.stock}`),
    seed: context.seedProduct?.id ?? null,
    recentIds,
    cartIds,
    orderIds,
    searchTerms: context.searchTerms ?? [],
    eventIds,
    excludeIds: context.excludeIds ?? [],
    limit: context.limit ?? 8,
  });
}

export function useHybridRecommendations({
  pool,
  context,
  fallback,
  enabled = true,
}: {
  pool: Product[];
  context: RecommendationContext;
  fallback: RecommendedProduct[];
  enabled?: boolean;
}) {
  const [items, setItems] = useState<RecommendedProduct[]>(fallback);
  const [serverMeta, setServerMeta] = useState<Pick<TrainHybridRecommendationsResponse, "trainedAt" | "count"> | null>(null);
  const requestKey = buildRequestKey(pool, context);
  const fallbackRef = useRef(fallback);

  fallbackRef.current = fallback;

  useEffect(() => {
    if (!enabled || pool.length === 0) {
      setItems(fallbackRef.current);
      setServerMeta(null);
      return;
    }

    let cancelled = false;
    setItems(fallbackRef.current);

    trainHybridRecommendations({ data: { pool, context } })
      .then((response) => {
        if (cancelled) return;
        setItems(response.items);
        setServerMeta({ trainedAt: response.trainedAt, count: response.count });
      })
      .catch(() => {
        if (cancelled) return;
        setItems(fallbackRef.current);
        setServerMeta(null);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, pool, requestKey]);

  return { items, serverMeta };
}
