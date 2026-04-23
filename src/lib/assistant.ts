import { formatPrice, type Product } from "@/lib/products";
import { type SessionEvent } from "@/lib/session-analytics";
import { deriveSessionSignals, recommendProducts, type RecommendedProduct } from "@/lib/recommendations";

export const assistantQuickPrompts = [
  "Recommend something for me",
  "Show me the best rated picks",
  "Find products under $50",
  "Show similar items to my cart",
];

export type AssistantReply = {
  title: string;
  message: string;
  mode: "recommend" | "search" | "clarify";
  items: RecommendedProduct[];
  followUps: string[];
};

export type AssistantRequest = {
  query: string;
  pool: Product[];
  events: SessionEvent[];
  cartProducts: Product[];
};

type PriceBounds = {
  minPrice?: number;
  maxPrice?: number;
};

function parsePriceBounds(query: string): PriceBounds {
  const compact = query.replace(/,/g, "").toLowerCase();
  const amountMatch = compact.match(/\$?(\d+(?:\.\d{1,2})?)/);
  if (!amountMatch) return {};

  const amount = Number(amountMatch[1]);
  if (Number.isNaN(amount)) return {};

  if (/\b(under|below|less than|up to|at most|cheaper than)\b/.test(compact)) {
    return { maxPrice: amount };
  }

  if (/\b(over|above|more than|at least|starting at)\b/.test(compact)) {
    return { minPrice: amount };
  }

  return { maxPrice: amount };
}

function isRecommendationIntent(query: string) {
  return /\b(recommend|suggest|pick|choose|best option|what should i buy|help me decide|top picks)\b/i.test(
    query,
  );
}

function isSimilarityIntent(query: string) {
  return /\b(similar|like this|more like|match this|compare)\b/i.test(query);
}

function applyBounds(pool: Product[], bounds: PriceBounds) {
  return pool.filter((product) => {
    if (typeof bounds.minPrice === "number" && Number(product.price) < bounds.minPrice) return false;
    if (typeof bounds.maxPrice === "number" && Number(product.price) > bounds.maxPrice) return false;
    return true;
  });
}

function buildFollowUps(items: RecommendedProduct[]) {
  const top = items[0]?.product;
  const followUps = ["Show best rated picks", "Recommend something for my cart"];

  if (top?.brand) followUps.unshift(`More from ${top.brand}`);
  if (top?.category?.[0]) followUps.unshift(`More in ${top.category[0]}`);
  return [...new Set(followUps)].slice(0, 3);
}

export function buildAssistantReply({ query, pool, events, cartProducts }: AssistantRequest): AssistantReply {
  const trimmed = query.trim();
  const bounds = parsePriceBounds(trimmed);
  const signals = deriveSessionSignals(events);
  const filteredPool = applyBounds(pool, bounds);
  const searchTerms = [trimmed, ...signals.searchTerms].filter(Boolean);
  const recentProducts = pool.filter((product) => signals.recentProductIds.includes(product.id));
  const orderProducts = pool.filter((product) => signals.orderProductIds.includes(product.id));
  const recommendContext = {
    recentProducts: [...recentProducts, ...orderProducts],
    cartProducts,
    orderProducts,
    searchTerms,
    events,
    limit: 6,
  };

  let items = recommendProducts(filteredPool, recommendContext);

  if (items.length === 0 && filteredPool.length !== pool.length) {
    items = recommendProducts(pool, recommendContext);
  }

  if (items.length === 0) {
    return {
      title: "I need a bit more detail",
      message:
        "Try adding a brand, category, or budget. I can also recommend items from your recent activity.",
      mode: "clarify",
      items: [],
      followUps: assistantQuickPrompts.slice(0, 3),
    };
  }

  let title = "Search results";
  let message = `I found ${items.length} products that match "${trimmed}".`;
  let mode: AssistantReply["mode"] = "search";

  if (isRecommendationIntent(trimmed) || isSimilarityIntent(trimmed)) {
    title = "Recommended picks";
    message = "I blended your recent activity, cart, and catalog signals to rank these picks.";
    mode = "recommend";
  } else if (typeof bounds.maxPrice === "number" && typeof bounds.minPrice !== "number") {
    message = `I found ${items.length} items under ${formatPrice(bounds.maxPrice)}.`;
  } else if (typeof bounds.minPrice === "number") {
    message = `I found ${items.length} items starting at ${formatPrice(bounds.minPrice)}.`;
  }

  return {
    title,
    message,
    mode,
    items,
    followUps: buildFollowUps(items),
  };
}
