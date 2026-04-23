import { type Product } from "@/lib/products";
import { type SessionEvent } from "@/lib/session-analytics";

export const hybridFeatureKeys = [
  "rating",
  "reviews",
  "stock",
  "availability",
  "popularity",
  "brand_match",
  "category_overlap",
  "text_overlap",
  "price_similarity",
  "search_match",
  "recent_affinity",
  "cart_affinity",
  "order_affinity",
  "co_purchase_affinity",
  "newness",
] as const;

export type HybridFeatureKey = (typeof hybridFeatureKeys)[number];

export type HybridContribution = {
  key: HybridFeatureKey;
  value: number;
  weight: number;
  contribution: number;
};

export type HybridModel = {
  version: number;
  weights: Record<HybridFeatureKey, number>;
  bias: number;
  fingerprint: string;
  trainedAt: string;
  updateCount: number;
};

export type HybridContext = {
  seedProduct?: Product | null;
  recentProducts?: Product[];
  cartProducts?: Product[];
  orderProducts?: Product[];
  searchTerms?: string[];
  events?: SessionEvent[];
  excludeIds?: string[];
};

type ModelStats = {
  maxReviews: number;
  maxPopularity: number;
  maxPairAffinity: number;
  maxAgeDays: number;
  productPopularity: Map<string, number>;
  pairAffinity: Map<string, Map<string, number>>;
};

type TrainingExample = {
  product: Product;
  context: HybridContext;
  label: number;
  strength: number;
};

const STORAGE_KEY = "echocart:hybrid-model:v1";
const DEFAULT_LEARNING_RATE = 0.12;
const DEFAULT_EPOCHS = 3;

const DEFAULT_WEIGHTS: Record<HybridFeatureKey, number> = {
  rating: 0.8,
  reviews: 0.45,
  stock: 0.3,
  availability: 1.2,
  popularity: 0.65,
  brand_match: 1.8,
  category_overlap: 1.45,
  text_overlap: 1.1,
  price_similarity: 0.9,
  search_match: 1.4,
  recent_affinity: 1.5,
  cart_affinity: 2.1,
  order_affinity: 2.35,
  co_purchase_affinity: 1.85,
  newness: 0.25,
};

const FEATURE_LABELS: Record<HybridFeatureKey, string> = {
  rating: "High rating",
  reviews: "Trusted by shoppers",
  stock: "Stock available",
  availability: "In stock",
  popularity: "Popular pick",
  brand_match: "Same brand",
  category_overlap: "Same category",
  text_overlap: "Similar details",
  price_similarity: "Similar price",
  search_match: "Matches your search",
  recent_affinity: "Similar to recent views",
  cart_affinity: "Matches your cart",
  order_affinity: "Related to past purchases",
  co_purchase_affinity: "Frequently bought together",
  newness: "Fresh item",
};

let cachedFingerprint = "";
let cachedModel: HybridModel | null = null;
let cachedStats: ModelStats | null = null;

function isBrowser() {
  return typeof window !== "undefined";
}

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

function productTokens(product: Product) {
  const raw = [
    product.name,
    product.description ?? "",
    product.brand ?? "",
    ...product.category,
  ];

  const extra = Object.values(product.extra_data ?? {}).flatMap((value) => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === "string");
    }
    return [];
  });

  return new Set(tokenize([...raw, ...extra].join(" ")));
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampWeight(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-4, Math.min(4, value));
}

function sigmoid(value: number) {
  if (value >= 30) return 1;
  if (value <= -30) return 0;
  return 1 / (1 + Math.exp(-value));
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function uniqueById(products: Product[]) {
  const seen = new Set<string>();
  const out: Product[] = [];
  for (const product of products) {
    if (!seen.has(product.id)) {
      seen.add(product.id);
      out.push(product);
    }
  }
  return out;
}

function pairKey(a: string, b: string) {
  return a < b ? `${a}::${b}` : `${b}::${a}`;
}

function incrementPair(map: Map<string, Map<string, number>>, a: string, b: string, amount: number) {
  if (!a || !b || a === b) return;
  const key = pairKey(a, b);
  const left = map.get(key) ?? new Map<string, number>();
  left.set("score", (left.get("score") ?? 0) + amount);
  map.set(key, left);
}

function getPairScore(stats: ModelStats, a: string, b: string) {
  const key = pairKey(a, b);
  return clamp01((stats.pairAffinity.get(key)?.get("score") ?? 0) / Math.max(stats.maxPairAffinity, 1));
}

function buildFingerprint(pool: Product[], events: SessionEvent[]) {
  const productFingerprint = pool
    .slice(0, 64)
    .map((product) => `${product.id}:${Math.round(product.price)}:${product.reviews_count}`)
    .join("|");
  const eventFingerprint = events
    .slice(-64)
    .map((event) => `${event.id}:${event.type}:${event.timestamp}`)
    .join("|");
  return `${pool.length}:${productFingerprint}::${events.length}:${eventFingerprint}`;
}

function defaultModel(fingerprint: string): HybridModel {
  return {
    version: 1,
    weights: { ...DEFAULT_WEIGHTS },
    bias: 0.15,
    fingerprint,
    trainedAt: new Date().toISOString(),
    updateCount: 0,
  };
}

function loadStoredModel(fingerprint: string) {
  if (!isBrowser()) return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HybridModel;
    if (parsed?.fingerprint !== fingerprint || parsed.version !== 1) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveStoredModel(model: HybridModel) {
  if (!isBrowser()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(model));
  } catch {
    // Ignore storage failures.
  }
}

function buildStats(pool: Product[], events: SessionEvent[]): ModelStats {
  const productPopularity = new Map<string, number>();
  const pairAffinity = new Map<string, Map<string, number>>();
  let maxReviews = 1;
  let maxAgeDays = 1;

  const productLookup = new Map(pool.map((product) => [product.id, product] as const));
  const newestTimestamp = Math.max(
    ...pool.map((product) => {
      const ts = Date.parse(product.created_at);
      return Number.isFinite(ts) ? ts : 0;
    }),
    Date.now(),
  );

  for (const product of pool) {
    maxReviews = Math.max(maxReviews, product.reviews_count || 0);
    const createdAt = Date.parse(product.created_at);
    if (Number.isFinite(createdAt)) {
      maxAgeDays = Math.max(maxAgeDays, Math.max(1, Math.ceil((newestTimestamp - createdAt) / 86_400_000)));
    }
  }

  const bySession = new Map<string, SessionEvent[]>();
  for (const event of events) {
    const bucket = bySession.get(event.sessionId) ?? [];
    bucket.push(event);
    bySession.set(event.sessionId, bucket);
  }

  for (const sessionEvents of bySession.values()) {
    const engagedIds = new Set<string>();
    const cartBasket = new Set<string>();
    const orderBasket = new Set<string>();

    for (const event of sessionEvents) {
      if (event.type === "product_view" && event.productId) {
        engagedIds.add(event.productId);
        productPopularity.set(event.productId, (productPopularity.get(event.productId) ?? 0) + 1);
      }

      if (event.type === "add_to_cart" && event.productId) {
        engagedIds.add(event.productId);
        cartBasket.add(event.productId);
        productPopularity.set(event.productId, (productPopularity.get(event.productId) ?? 0) + 2);
      }

      if (event.type === "order_placed") {
        const productIds = Array.isArray(event.metadata?.productIds)
          ? event.metadata.productIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          : [];
        for (const productId of productIds) {
          engagedIds.add(productId);
          orderBasket.add(productId);
          productPopularity.set(productId, (productPopularity.get(productId) ?? 0) + 3);
        }
      }

      if (event.type === "recommendation_impression") {
        const productIds = Array.isArray(event.metadata?.productIds)
          ? event.metadata.productIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          : [];
        for (const productId of productIds) {
          productPopularity.set(productId, (productPopularity.get(productId) ?? 0) + 0.2);
        }
      }
    }

    const allIds = [...engagedIds];
    const weightedBasket = [
      { ids: allIds, weight: 1 },
      { ids: [...cartBasket], weight: 2 },
      { ids: [...orderBasket], weight: 3 },
    ];

    for (const { ids, weight } of weightedBasket) {
      for (let i = 0; i < ids.length; i += 1) {
        for (let j = i + 1; j < ids.length; j += 1) {
          if (productLookup.has(ids[i]) && productLookup.has(ids[j])) {
            incrementPair(pairAffinity, ids[i], ids[j], weight);
          }
        }
      }
    }
  }

  let maxPopularity = 1;
  let maxPairAffinity = 1;
  for (const value of productPopularity.values()) {
    maxPopularity = Math.max(maxPopularity, value);
  }
  for (const pair of pairAffinity.values()) {
    maxPairAffinity = Math.max(maxPairAffinity, pair.get("score") ?? 0);
  }

  return {
    maxReviews,
    maxPopularity,
    maxPairAffinity,
    maxAgeDays,
    productPopularity,
    pairAffinity,
  };
}

function snapshotContext(context: HybridContext): HybridContext {
  return {
    seedProduct: context.seedProduct ?? null,
    recentProducts: uniqueById(context.recentProducts ?? []),
    cartProducts: uniqueById(context.cartProducts ?? []),
    orderProducts: uniqueById(context.orderProducts ?? []),
    searchTerms: [...new Set((context.searchTerms ?? []).map((term) => term.trim()).filter(Boolean))],
    events: context.events,
    excludeIds: context.excludeIds,
  };
}

function pushUnique(products: Product[], product: Product, limit: number) {
  const filtered = products.filter((item) => item.id !== product.id);
  filtered.unshift(product);
  return filtered.slice(0, limit);
}

function buildExamples(pool: Product[], events: SessionEvent[], stats: ModelStats) {
  const productMap = new Map(pool.map((product) => [product.id, product] as const));
  const bySession = new Map<string, SessionEvent[]>();

  for (const event of events) {
    const bucket = bySession.get(event.sessionId) ?? [];
    bucket.push(event);
    bySession.set(event.sessionId, bucket);
  }

  const examples: TrainingExample[] = [];

  for (const [sessionId, sessionEvents] of bySession.entries()) {
    sessionEvents.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));

    let recentProducts: Product[] = [];
    let cartProducts: Product[] = [];
    let orderProducts: Product[] = [];
    let searchTerms: string[] = [];
    const engagedProductIds = new Set<string>();
    const exposures: Array<{ productId: string; context: HybridContext; clicked: boolean }> = [];

    for (const event of sessionEvents) {
      const contextSnapshot = snapshotContext({
        recentProducts,
        cartProducts,
        orderProducts,
        searchTerms,
      });

      if (event.type === "recommendation_impression") {
        const productIds = Array.isArray(event.metadata?.productIds)
          ? event.metadata.productIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          : [];
        for (const productId of productIds) {
          exposures.push({ productId, context: contextSnapshot, clicked: false });
        }
        continue;
      }

      if (event.type === "search" && event.query) {
        searchTerms = [...new Set([event.query.trim(), ...searchTerms])].slice(0, 4);
        continue;
      }

      const positiveIds: string[] = [];
      let strength = 0;

      if (event.type === "product_view" && event.productId) {
        positiveIds.push(event.productId);
        strength = 0.45;
      }

      if (event.type === "add_to_cart" && event.productId) {
        positiveIds.push(event.productId);
        strength = 0.9;
        cartProducts = cartProducts.some((product) => product.id === event.productId)
          ? cartProducts
          : [productMap.get(event.productId) ?? null, ...cartProducts].filter((product): product is Product => Boolean(product)).slice(0, 5);
      }

      if (event.type === "order_placed") {
        const productIds = Array.isArray(event.metadata?.productIds)
          ? event.metadata.productIds.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
          : [];
        positiveIds.push(...productIds);
        strength = 1.3;
        orderProducts = [
          ...productIds
            .map((productId) => productMap.get(productId))
            .filter((product): product is Product => Boolean(product)),
          ...orderProducts,
        ].slice(0, 5);
      }

      for (const productId of positiveIds) {
        const product = productMap.get(productId);
        if (!product) continue;
        engagedProductIds.add(productId);

        for (const exposure of exposures) {
          if (exposure.productId === productId) {
            exposure.clicked = true;
          }
        }

        examples.push({
          product,
          context: contextSnapshot,
          label: 1,
          strength,
        });

        const forbiddenIds = new Set([
          productId,
          ...recentProducts.map((item) => item.id),
          ...cartProducts.map((item) => item.id),
          ...orderProducts.map((item) => item.id),
        ]);

        const negatives = sampleNegatives(pool, forbiddenIds, 2, `${sessionId}:${productId}`);
        for (const negative of negatives) {
          examples.push({
            product: negative,
            context: contextSnapshot,
            label: 0,
            strength: 0.45,
          });
        }

        recentProducts = pushUnique(recentProducts, product, 5);
      }
    }

    for (const exposure of exposures) {
      if (exposure.clicked) continue;
      const product = productMap.get(exposure.productId);
      if (!product) continue;
      examples.push({
        product,
        context: exposure.context,
        label: 0,
        strength: 0.8,
      });
    }

    if (engagedProductIds.size > 1) {
      const engagedProducts = [...engagedProductIds]
        .map((productId) => productMap.get(productId))
        .filter((product): product is Product => Boolean(product));
      for (let i = 0; i < engagedProducts.length; i += 1) {
        for (let j = i + 1; j < engagedProducts.length; j += 1) {
          const left = engagedProducts[i];
          const right = engagedProducts[j];
          if (!left || !right) continue;
          const relationContext = snapshotContext({
            recentProducts: [left],
            cartProducts: [left],
            orderProducts: [left],
            searchTerms,
          });
          examples.push({ product: right, context: relationContext, label: 1, strength: 0.2 });
        }
      }
    }
  }

  return examples;
}

function sampleNegatives(pool: Product[], forbiddenIds: Set<string>, count: number, seed: string) {
  const candidates = pool.filter((product) => !forbiddenIds.has(product.id));
  if (candidates.length === 0) return [];
  const start = Math.abs(hashString(seed)) % candidates.length;
  const negatives: Product[] = [];
  for (let index = 0; index < count; index += 1) {
    const candidate = candidates[(start + index * 17) % candidates.length];
    if (candidate && !negatives.some((item) => item.id === candidate.id)) {
      negatives.push(candidate);
    }
  }
  return negatives;
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

function buildFeatureVector(
  product: Product,
  context: HybridContext,
  stats: ModelStats,
  productMap: Map<string, Product>,
) {
  const seed = context.seedProduct ?? null;
  const recentProducts = uniqueById([seed, ...(context.recentProducts ?? [])].filter((item): item is Product => Boolean(item)));
  const cartProducts = uniqueById(context.cartProducts ?? []);
  const orderProducts = uniqueById(context.orderProducts ?? []);
  const searchTerms = (context.searchTerms ?? []).map((term) => term.trim()).filter(Boolean);
  const allAnchors = uniqueById([...recentProducts, ...cartProducts, ...orderProducts]);

  const productTokenSet = productTokens(product);
  const textSimilarity = allAnchors.length
    ? average(
        allAnchors.map((anchor) => {
          const anchorTokens = productTokens(anchor);
          const overlap = [...productTokenSet].filter((token) => anchorTokens.has(token)).length;
          return overlap / Math.max(1, Math.min(productTokenSet.size, anchorTokens.size));
        }),
      )
    : 0;

  const brandMatch = allAnchors.some((anchor) => anchor.brand && product.brand && normalizeText(anchor.brand) === normalizeText(product.brand))
    ? 1
    : 0;

  const categoryOverlap = allAnchors.length
    ? Math.max(
        ...allAnchors.map((anchor) => {
          const anchorSet = new Set(anchor.category.map(normalizeText).filter(Boolean));
          const productSet = new Set(product.category.map(normalizeText).filter(Boolean));
          const intersection = [...productSet].filter((token) => anchorSet.has(token)).length;
          const union = new Set([...productSet, ...anchorSet]).size || 1;
          return intersection / union;
        }),
      )
    : 0;

  const priceSimilarity = allAnchors.length
    ? average(
        allAnchors.map((anchor) => {
          const scale = Math.max(Number(product.price), Number(anchor.price), 1);
          return 1 - Math.min(1, Math.abs(Number(product.price) - Number(anchor.price)) / scale);
        }),
      )
    : 0;

  const searchTokens = new Set(searchTerms.flatMap(tokenize));
  const searchMatch = searchTokens.size
    ? [...productTokenSet].filter((token) => searchTokens.has(token)).length / Math.max(1, Math.min(productTokenSet.size, searchTokens.size))
    : 0;

  const recentAffinity = average((context.recentProducts ?? []).map((anchor) => getPairScore(stats, product.id, anchor.id)));
  const cartAffinity = average((context.cartProducts ?? []).map((anchor) => getPairScore(stats, product.id, anchor.id)));
  const orderAffinity = average((context.orderProducts ?? []).map((anchor) => getPairScore(stats, product.id, anchor.id)));
  const coPurchaseAffinity = average(allAnchors.map((anchor) => getPairScore(stats, product.id, anchor.id)));

  const popularity = clamp01((stats.productPopularity.get(product.id) ?? 0) / Math.max(stats.maxPopularity, 1));
  const reviews = clamp01(Math.log1p(Math.max(0, product.reviews_count)) / Math.log1p(Math.max(1, stats.maxReviews)));
  const rating = clamp01(Math.max(0, Number(product.rating ?? 0)) / 5);
  const stock = clamp01(Math.min(20, Math.max(0, Number(product.stock ?? 0))) / 20);
  const availability = product.stock > 0 ? 1 : 0;
  const createdAt = Date.parse(product.created_at);
  const ageDays = Number.isFinite(createdAt) ? Math.max(0, (Date.now() - createdAt) / 86_400_000) : 0;
  const newness = clamp01(1 - ageDays / Math.max(1, stats.maxAgeDays));

  return {
    rating,
    reviews,
    stock,
    availability,
    popularity,
    brand_match: brandMatch,
    category_overlap: categoryOverlap,
    text_overlap: textSimilarity,
    price_similarity: priceSimilarity,
    search_match: searchMatch,
    recent_affinity: recentAffinity,
    cart_affinity: cartAffinity,
    order_affinity: orderAffinity,
    co_purchase_affinity: coPurchaseAffinity,
    newness,
  } satisfies Record<HybridFeatureKey, number>;
}

function dotProduct(weights: Record<HybridFeatureKey, number>, vector: Record<HybridFeatureKey, number>) {
  return hybridFeatureKeys.reduce((sum, key) => sum + weights[key] * vector[key], 0);
}

function trainModel(pool: Product[], events: SessionEvent[]) {
  const fingerprint = buildFingerprint(pool, events);
  if (cachedModel && cachedFingerprint === fingerprint && cachedStats) {
    return { model: cachedModel, stats: cachedStats };
  }

  const stats = buildStats(pool, events);
  let model = loadStoredModel(fingerprint) ?? defaultModel(fingerprint);
  const examples = buildExamples(pool, events, stats);
  const productMap = new Map(pool.map((product) => [product.id, product] as const));

  for (let epoch = 0; epoch < DEFAULT_EPOCHS; epoch += 1) {
    for (const example of examples) {
      const features = buildFeatureVector(example.product, example.context, stats, productMap);
      const prediction = sigmoid(model.bias + dotProduct(model.weights, features));
      const error = (example.label - prediction) * example.strength;

      for (const key of hybridFeatureKeys) {
        model.weights[key] = clampWeight(model.weights[key] + DEFAULT_LEARNING_RATE * error * features[key]);
      }
      model.bias = clampWeight(model.bias + DEFAULT_LEARNING_RATE * error);
      model.updateCount += 1;
    }
  }

  model = {
    ...model,
    fingerprint,
    trainedAt: new Date().toISOString(),
  };

  cachedFingerprint = fingerprint;
  cachedModel = model;
  cachedStats = stats;
  saveStoredModel(model);

  return { model, stats };
}

export function getHybridRankings(pool: Product[], context: HybridContext = {}) {
  const { model, stats } = trainModel(pool, context.events ?? []);
  const productMap = new Map(pool.map((product) => [product.id, product] as const));
  const excludedIds = new Set((context.excludeIds ?? []).filter(Boolean));

  if (context.seedProduct) {
    excludedIds.add(context.seedProduct.id);
  }

  const ranked = pool
    .filter((product) => !excludedIds.has(product.id))
    .map((product) => {
      const features = buildFeatureVector(product, context, stats, productMap);
      const contributions = hybridFeatureKeys.map((key) => ({
        key,
        value: features[key],
        weight: model.weights[key],
        contribution: features[key] * model.weights[key],
      }));
      const score = model.bias + contributions.reduce((sum, item) => sum + item.contribution, 0);
      return { product, score, contributions };
    })
    .sort((a, b) => b.score - a.score);

  const available = ranked.filter(({ product }) => product.stock > 0);
  return available.length > 0 ? available : ranked;
}

export function fitHybridModel(pool: Product[], context: HybridContext = {}) {
  return trainModel(pool, context.events ?? []).model;
}

export function explainContribution(key: HybridFeatureKey) {
  return FEATURE_LABELS[key] ?? key;
}
