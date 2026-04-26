import { formatPrice, type Product } from "@/lib/products";
import { type SessionEvent } from "@/lib/session-analytics";
import {
  explainContribution,
  getHybridRankings,
  type HybridContribution,
  type HybridContext,
} from "@/lib/hybrid-model";

export type RecommendationReason = {
  label: string;
  detail: string;
};

export type RecommendedProduct = {
  product: Product;
  score: number;
  reasons: RecommendationReason[];
};

export type RecommendationContext = {
  seedProduct?: Product | null;
  recentProducts?: Product[];
  cartProducts?: Product[];
  orderProducts?: Product[];
  searchTerms?: string[];
  events?: SessionEvent[];
  excludeIds?: string[];
  positiveFeedbackProductIds?: string[];
  negativeFeedbackProductIds?: string[];
  limit?: number;
};

export type SessionSignals = {
  recentProductIds: string[];
  cartProductIds: string[];
  orderProductIds: string[];
  positiveFeedbackProductIds: string[];
  negativeFeedbackProductIds: string[];
  searchTerms: string[];
};

export function stripRecommendationImpressions(events: SessionEvent[]) {
  return events.filter((event) => event.type !== "recommendation_impression");
}

export function materializeProductsByIds(pool: Product[], ids: string[]) {
  const lookup = new Map(pool.map((product) => [product.id, product] as const));
  return ids.map((id) => lookup.get(id)).filter((product): product is Product => Boolean(product));
}

type RankedProduct = {
  product: Product;
  score: number;
  contributions: HybridContribution[];
};

type Anchor = {
  product: Product;
  weight: number;
  label: string;
};

function normalizeText(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokenize(value: string) {
  const normalized = normalizeText(value);
  if (!normalized) return [];
  return normalized.split(/\s+/).filter((token) => token.length > 2);
}

function extractTextTokens(product: Product) {
  const textParts = [
    product.name,
    product.description ?? "",
    product.brand ?? "",
    ...product.category,
  ];

  const extraData = Object.values(product.extra_data ?? {}).flatMap((value) => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === "string");
    }
    return [];
  });

  return new Set(tokenize([...textParts, ...extraData].join(" ")));
}

function sameText(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return false;
  return normalizeText(a) === normalizeText(b);
}

function intersectStrings(a: string[], b: string[]) {
  const lookup = new Set(b.map((value) => normalizeText(value)));
  return a
    .map((value) => value.trim())
    .filter((value) => value && lookup.has(normalizeText(value)));
}

function countTokenOverlap(a: Set<string>, b: Set<string>) {
  let count = 0;
  for (const token of a) {
    if (b.has(token)) count += 1;
  }
  return count;
}

function priceSimilarity(a: number, b: number) {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.max(0, 1 - Math.abs(a - b) / scale);
}

function uniqueReasons(reasons: RecommendationReason[]) {
  const seen = new Set<string>();
  return reasons.filter((reason) => {
    const key = `${reason.label}:${reason.detail}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function chooseAnchorProduct(context: RecommendationContext) {
  return (
    context.seedProduct ??
    context.recentProducts?.[0] ??
    context.cartProducts?.[0] ??
    context.orderProducts?.[0] ??
    null
  );
}

function reasonFromContribution(
  contribution: HybridContribution,
  product: Product,
  context: RecommendationContext,
): RecommendationReason | null {
  const anchor = chooseAnchorProduct(context);

  switch (contribution.key) {
    case "brand_match":
      return product.brand
        ? { label: "Same brand", detail: `Also from ${product.brand}` }
        : { label: explainContribution(contribution.key), detail: "Brand match" };
    case "category_overlap":
      return product.category.length > 0
        ? {
            label: "Same category",
            detail: `Shares ${product.category.slice(0, 2).join(" / ")}`,
          }
        : { label: explainContribution(contribution.key), detail: "Category overlap" };
    case "text_overlap":
      return { label: "Similar details", detail: "Matches your browsing context and product text" };
    case "price_similarity":
      return anchor
        ? {
            label: "Similar price",
            detail: `Close to ${formatPrice(Number(anchor.price))}`,
          }
        : { label: explainContribution(contribution.key), detail: "Price range fit" };
    case "search_match":
      return context.searchTerms?.[0]
        ? {
            label: "Search match",
            detail: `Matches your search for "${context.searchTerms[0]}"`,
          }
        : { label: explainContribution(contribution.key), detail: "Matches your search" };
    case "recent_affinity":
      return { label: "Recent activity", detail: "Similar to products you recently viewed" };
    case "cart_affinity":
      return { label: "Matches your cart", detail: "Frequently paired with items in your cart" };
    case "order_affinity":
      return { label: "Past purchases", detail: "Related to items you bought before" };
    case "co_purchase_affinity":
      return {
        label: "Frequently bought together",
        detail: "Strong collaborative signal from your activity",
      };
    case "popularity":
      return { label: "Popular pick", detail: "Shoppers engage with this item often" };
    case "rating":
      return product.rating != null
        ? { label: "High rating", detail: `${Number(product.rating).toFixed(1)}/5 from buyers` }
        : { label: explainContribution(contribution.key), detail: "High rating" };
    case "reviews":
      return product.reviews_count > 0
        ? {
            label: "Trusted by shoppers",
            detail: `${product.reviews_count.toLocaleString()} reviews`,
          }
        : { label: explainContribution(contribution.key), detail: "Review signal" };
    case "stock":
      return { label: "Stock available", detail: `${product.stock} left in stock` };
    case "availability":
      return { label: "In stock", detail: "Available right now" };
    case "newness":
      return { label: "Fresh item", detail: "Recently added to the catalog" };
    default:
      return null;
  }
}

function buildAnchors(context: RecommendationContext) {
  const anchors: Anchor[] = [];
  const seen = new Set<string>();

  const appendAnchor = (product: Product, weight: number, label: string) => {
    if (seen.has(product.id)) return;
    seen.add(product.id);
    anchors.push({ product, weight, label });
  };

  if (context.seedProduct) appendAnchor(context.seedProduct, 1.6, "this product");
  for (const product of context.cartProducts ?? []) appendAnchor(product, 1.25, "your cart");
  for (const product of context.recentProducts ?? []) appendAnchor(product, 1.0, "recent activity");

  return anchors;
}

export function buildRecommendedProductsFromRankings(
  ranked: RankedProduct[],
  context: RecommendationContext = {},
) {
  return ranked.slice(0, context.limit ?? 8).map(({ product, score, contributions }) => {
    const reasons = contributions
      .filter((contribution) => contribution.contribution > 0.015)
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 3)
      .map((contribution) => reasonFromContribution(contribution, product, context))
      .filter((reason): reason is RecommendationReason => Boolean(reason));

    if (reasons.length === 0) {
      reasons.push({
        label: "Recommended",
        detail: "Ranked by your activity, catalog signals, and product fit",
      });
    }

    return {
      product,
      score,
      reasons: uniqueReasons(reasons),
    } satisfies RecommendedProduct;
  });
}

function scoreCandidate(product: Product, anchors: Anchor[], searchTerms: string[]) {
  const reasons: RecommendationReason[] = [];
  let score = 0;

  if (product.stock <= 0) {
    score -= 3;
    reasons.push({ label: "Availability", detail: "Currently out of stock" });
  }

  score += Math.max(product.rating ?? 0, 0) * 0.45;
  score += Math.log1p(Math.max(product.reviews_count, 0)) * 0.6;

  if (product.reviews_count > 0 && (product.rating ?? 0) >= 4.2) {
    reasons.push({
      label: "Popular choice",
      detail: `${product.reviews_count.toLocaleString()} reviews and a ${Number(product.rating ?? 0).toFixed(1)} rating`,
    });
  }

  const candidateTokens = extractTextTokens(product);

  for (const anchor of anchors) {
    const anchorProduct = anchor.product;

    if (sameText(product.brand, anchorProduct.brand)) {
      score += 4.5 * anchor.weight;
      reasons.push({
        label: anchor.label === "this product" ? "Same brand" : "Brand match",
        detail: `Also from ${product.brand ?? anchorProduct.brand ?? "this brand"}`,
      });
    }

    const sharedCategories = intersectStrings(product.category, anchorProduct.category);
    if (sharedCategories.length > 0) {
      score += (2.2 + Math.min(sharedCategories.length, 3) * 0.4) * anchor.weight;
      reasons.push({
        label: anchor.label === "this product" ? "Same category" : "Category overlap",
        detail: `Shares ${sharedCategories.slice(0, 2).join(" / ")}`,
      });
    }

    const similarity = priceSimilarity(product.price, anchorProduct.price);
    if (similarity >= 0.7) {
      score += similarity * 2.2 * anchor.weight;
      reasons.push({
        label: "Similar price",
        detail: `Close to ${formatPrice(Number(anchorProduct.price))}`,
      });
    }

    const overlap = countTokenOverlap(candidateTokens, extractTextTokens(anchorProduct));
    if (overlap >= 2) {
      score += Math.min(overlap, 5) * 0.35 * anchor.weight;
      reasons.push({
        label: anchor.label === "this product" ? "Similar details" : "Related item",
        detail: `Shares details with ${anchorProduct.name}`,
      });
    }
  }

  const searchTokens = new Set(searchTerms.flatMap((term) => tokenize(term)));
  const searchOverlap = countTokenOverlap(candidateTokens, searchTokens);
  if (searchOverlap > 0) {
    score += searchOverlap * 1.8;
    reasons.push({
      label: "Search match",
      detail: `Matches your search for "${searchTerms[0]}"`,
    });
  }

  return {
    product,
    score,
    reasons: uniqueReasons(reasons).slice(0, 3),
  } satisfies RecommendedProduct;
}

export function recommendProducts(pool: Product[], context: RecommendationContext = {}) {
  const excludedIds = new Set(context.excludeIds ?? []);
  for (const product of [
    context.seedProduct,
    ...(context.recentProducts ?? []),
    ...(context.cartProducts ?? []),
    ...(context.orderProducts ?? []),
  ]) {
    if (product) excludedIds.add(product.id);
  }

  for (const productId of [
    ...(context.positiveFeedbackProductIds ?? []),
    ...(context.negativeFeedbackProductIds ?? []),
  ]) {
    if (productId) excludedIds.add(productId);
  }

  const hybridContext: HybridContext = {
    seedProduct: context.seedProduct,
    recentProducts: context.recentProducts,
    cartProducts: context.cartProducts,
    orderProducts: context.orderProducts,
    searchTerms: context.searchTerms,
    events: context.events,
    excludeIds: [...excludedIds],
    positiveFeedbackProductIds: context.positiveFeedbackProductIds,
    negativeFeedbackProductIds: context.negativeFeedbackProductIds,
  };

  const ranked = getHybridRankings(pool, hybridContext).slice(0, context.limit ?? 8);

  return buildRecommendedProductsFromRankings(ranked, context);
}

function collectSignalIds(events: SessionEvent[]) {
  const recentProductIds: string[] = [];
  const cartProductIds: string[] = [];
  const orderProductIds: string[] = [];
  const positiveFeedbackProductIds: string[] = [];
  const negativeFeedbackProductIds: string[] = [];
  const searchTerms: string[] = [];

  for (const event of [...events].reverse()) {
    if (
      event.type === "product_view" &&
      event.productId &&
      !recentProductIds.includes(event.productId)
    ) {
      recentProductIds.push(event.productId);
    }

    if (
      event.type === "add_to_cart" &&
      event.productId &&
      !cartProductIds.includes(event.productId)
    ) {
      cartProductIds.push(event.productId);
    }

    if (event.type === "search" && event.query) {
      const query = event.query.trim();
      if (
        query &&
        !searchTerms.some((existing) => normalizeText(existing) === normalizeText(query))
      ) {
        searchTerms.push(query);
      }
    }

    if (event.type === "recommendation_feedback" && event.productId) {
      const feedback = event.metadata?.feedback;
      if (feedback === "more_like_this" && !positiveFeedbackProductIds.includes(event.productId)) {
        positiveFeedbackProductIds.push(event.productId);
      }
      if (feedback === "not_relevant" && !negativeFeedbackProductIds.includes(event.productId)) {
        negativeFeedbackProductIds.push(event.productId);
      }
    }

    if (event.type === "order_placed") {
      const productIdsValue = event.metadata?.productIds;
      const productIds = Array.isArray(productIdsValue)
        ? productIdsValue.filter(
            (value): value is string => typeof value === "string" && value.trim().length > 0,
          )
        : [];

      for (const productId of productIds) {
        if (!orderProductIds.includes(productId)) {
          orderProductIds.push(productId);
        }
      }
    }
  }

  return {
    recentProductIds: recentProductIds.slice(0, 5),
    cartProductIds: cartProductIds.slice(0, 5),
    orderProductIds: orderProductIds.slice(0, 10),
    positiveFeedbackProductIds: positiveFeedbackProductIds.slice(0, 5),
    negativeFeedbackProductIds: negativeFeedbackProductIds.slice(0, 5),
    searchTerms: searchTerms.slice(0, 3),
  } satisfies SessionSignals;
}

export function deriveSessionSignals(events: SessionEvent[]) {
  return collectSignalIds(events);
}
