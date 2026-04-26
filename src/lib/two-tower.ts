import { type Product } from "@/lib/products";
import { deriveSessionSignals, type RecommendationContext } from "@/lib/recommendations";
import { type SessionEvent } from "@/lib/session-analytics";

export const twoTowerEmbeddingSize = 16;
const MODEL_SIGNATURE = "v2";

export type TwoTowerModel = {
  version: 1;
  embeddingSize: number;
  itemWeights: number[];
  queryWeights: number[];
  bias: number;
  fingerprint: string;
  trainedAt: string;
  updateCount: number;
  eventCount?: number;
  poolSize?: number;
};

export type TwoTowerEmbeddingRecord = {
  productId: string;
  embedding: number[];
  norm: number;
};

export type TwoTowerCandidate = {
  product: Product;
  similarity: number;
  itemEmbedding: number[];
  queryEmbedding: number[];
  embeddingRecord: TwoTowerEmbeddingRecord;
};

export type TwoTowerRetrievalResult = {
  candidates: TwoTowerCandidate[];
  embeddings: TwoTowerEmbeddingRecord[];
  queryEmbedding: number[];
};

type TwoTowerStats = {
  minPrice: number;
  maxPrice: number;
  priceRange: number;
  maxReviews: number;
  maxPopularity: number;
  maxAgeDays: number;
  productPopularity: Map<string, number>;
};

type TwoTowerTrainingExample = {
  product: Product;
  context: RecommendationContext;
  label: number;
  strength: number;
};

const BASIC_FEATURE_COUNT = 8;
const TOKEN_BUCKET_COUNT = twoTowerEmbeddingSize - BASIC_FEATURE_COUNT;
const DEFAULT_EPOCHS = 4;
const DEFAULT_LEARNING_RATE = 0.06;

const DEFAULT_ITEM_WEIGHTS = [
  1.1, 1.08, 0.95, 1.08, 1, 0.92, 0.9, 0.9, 1, 1, 0.95, 0.95, 0.95, 0.95, 0.95, 0.95,
];
const DEFAULT_QUERY_WEIGHTS = [
  1.05, 1, 0.95, 1.1, 1.12, 1.12, 0.95, 0.95, 1, 1, 0.98, 0.98, 0.98, 0.98, 0.98, 0.98,
];

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function clampWeight(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-4, Math.min(4, value));
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

function uniqueById(products: Product[]) {
  const seen = new Set<string>();
  const unique: Product[] = [];

  for (const product of products) {
    if (seen.has(product.id)) continue;
    seen.add(product.id);
    unique.push(product);
  }

  return unique;
}

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return hash;
}

function bucketIndex(token: string) {
  return Math.abs(hashString(token)) % TOKEN_BUCKET_COUNT;
}

function sumVector(values: number[]) {
  return values.reduce((sum, value) => sum + value * value, 0);
}

function vectorNorm(values: number[]) {
  return Math.sqrt(sumVector(values));
}

function dotProduct(left: number[], right: number[]) {
  const length = Math.min(left.length, right.length);
  let total = 0;
  for (let index = 0; index < length; index += 1) {
    total += left[index] * right[index];
  }
  return total;
}

function cosineSimilarity(left: number[], right: number[]) {
  const leftNorm = vectorNorm(left);
  const rightNorm = vectorNorm(right);
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dotProduct(left, right) / (leftNorm * rightNorm);
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sigmoid(value: number) {
  if (value >= 30) return 1;
  if (value <= -30) return 0;
  return 1 / (1 + Math.exp(-value));
}

function productTokens(product: Product) {
  const extraValues = Object.values(product.extra_data ?? {}).flatMap((value) => {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === "string");
    }
    return [];
  });

  return new Set(
    tokenize(
      [
        product.name,
        product.description ?? "",
        product.brand ?? "",
        ...product.category,
        ...extraValues,
      ].join(" "),
    ),
  );
}

function buildWeightedAnchors(context: RecommendationContext) {
  const anchors: Array<{ product: Product; weight: number }> = [];
  const seen = new Set<string>();

  const append = (product: Product | undefined | null, weight: number) => {
    if (!product || seen.has(product.id) || weight <= 0) return;
    seen.add(product.id);
    anchors.push({ product, weight });
  };

  append(context.seedProduct, 2.6);

  for (const [index, product] of (context.cartProducts ?? []).entries()) {
    append(product, Math.max(1.15, 1.95 - index * 0.18));
  }

  for (const [index, product] of (context.orderProducts ?? []).entries()) {
    append(product, Math.max(1.05, 2.15 - index * 0.16));
  }

  for (const [index, product] of (context.recentProducts ?? []).entries()) {
    append(product, Math.max(0.45, 1.3 - index * 0.18));
  }

  return anchors;
}

function buildWeightedContextBatches(context: RecommendationContext) {
  const batches: WeightedTokenBatch[] = [];
  const seen = new Set<string>();

  const appendTokens = (product: Product | undefined | null, weight: number) => {
    if (!product || seen.has(product.id) || weight <= 0) return;
    seen.add(product.id);
    batches.push({ tokens: productTokens(product), weight });
  };

  appendTokens(context.seedProduct, 2.6);

  for (const [index, product] of (context.cartProducts ?? []).entries()) {
    appendTokens(product, Math.max(1.15, 1.9 - index * 0.18));
  }

  for (const [index, product] of (context.orderProducts ?? []).entries()) {
    appendTokens(product, Math.max(1.05, 2.1 - index * 0.16));
  }

  for (const [index, product] of (context.recentProducts ?? []).entries()) {
    appendTokens(product, Math.max(0.45, 1.25 - index * 0.16));
  }

  for (const [index, searchTerm] of (context.searchTerms ?? []).entries()) {
    const tokens = new Set(tokenize(searchTerm));
    if (tokens.size > 0) {
      batches.push({ tokens, weight: Math.max(0.4, 1.6 - index * 0.3) });
    }
  }

  if ((context.cartProducts ?? []).length > 0)
    batches.push({ tokens: new Set(["cart"]), weight: 0.75 });
  if ((context.orderProducts ?? []).length > 0)
    batches.push({ tokens: new Set(["order"]), weight: 0.9 });
  if ((context.recentProducts ?? []).length > 0)
    batches.push({ tokens: new Set(["recent"]), weight: 0.6 });
  if ((context.seedProduct ?? null) !== null)
    batches.push({ tokens: new Set(["seed"]), weight: 1.1 });

  return batches;
}

function buildStats(pool: Product[], events: SessionEvent[]): TwoTowerStats {
  const productPopularity = new Map<string, number>();
  let minPrice = Number.POSITIVE_INFINITY;
  let maxPrice = 0;
  let maxReviews = 1;
  let maxPopularity = 1;
  let maxAgeDays = 1;

  const newestTimestamp = Math.max(
    ...pool.map((product) => {
      const parsed = Date.parse(product.created_at);
      return Number.isFinite(parsed) ? parsed : 0;
    }),
    Date.now(),
  );

  for (const product of pool) {
    minPrice = Math.min(minPrice, Number(product.price));
    maxPrice = Math.max(maxPrice, Number(product.price));
    maxReviews = Math.max(maxReviews, product.reviews_count || 0);
    const createdAt = Date.parse(product.created_at);
    if (Number.isFinite(createdAt)) {
      maxAgeDays = Math.max(
        maxAgeDays,
        Math.max(1, Math.ceil((newestTimestamp - createdAt) / 86_400_000)),
      );
    }
  }

  for (const event of events) {
    if (!event.productId) continue;

    let weight = 0;
    if (event.type === "product_view") weight = 1;
    if (event.type === "add_to_cart") weight = 2.1;
    if (event.type === "order_placed") weight = 3.2;
    if (event.type === "recommendation_impression") weight = 0.2;

    if (event.type === "recommendation_feedback" && event.metadata?.feedback === "more_like_this") {
      weight = 1.25;
    }

    if (weight > 0) {
      productPopularity.set(
        event.productId,
        (productPopularity.get(event.productId) ?? 0) + weight,
      );
    }
  }

  for (const value of productPopularity.values()) {
    maxPopularity = Math.max(maxPopularity, value);
  }

  if (!Number.isFinite(minPrice)) minPrice = 0;
  if (!Number.isFinite(maxPrice) || maxPrice <= 0) maxPrice = Math.max(minPrice, 1);

  return {
    minPrice,
    maxPrice,
    priceRange: Math.max(maxPrice - minPrice, 1),
    maxReviews,
    maxPopularity,
    maxAgeDays,
    productPopularity,
  };
}

function buildBaseVector() {
  return new Array(twoTowerEmbeddingSize).fill(0);
}

type WeightedTokenBatch = {
  tokens: Set<string>;
  weight: number;
};

function addTokenBuckets(vector: number[], batches: WeightedTokenBatch[]) {
  for (const { tokens, weight } of batches) {
    const tokenList = [...tokens].filter(Boolean);
    if (tokenList.length === 0 || weight <= 0) continue;

    for (const token of tokenList) {
      const bucket = BASIC_FEATURE_COUNT + bucketIndex(token);
      vector[bucket] += weight / tokenList.length;
    }
  }
}

function weightedAverage(values: Array<{ value: number; weight: number }>) {
  let totalWeight = 0;
  let total = 0;

  for (const item of values) {
    if (item.weight <= 0) continue;
    totalWeight += item.weight;
    total += item.value * item.weight;
  }

  return totalWeight > 0 ? total / totalWeight : 0;
}

function buildItemFeatures(product: Product, stats: TwoTowerStats) {
  const vector = buildBaseVector();
  const createdAt = Date.parse(product.created_at);
  const ageDays = Number.isFinite(createdAt)
    ? Math.max(0, (Date.now() - createdAt) / 86_400_000)
    : stats.maxAgeDays;
  const tokens = productTokens(product);

  vector[0] = clamp01(Number(product.rating ?? 0) / 5);
  vector[1] = clamp01(
    Math.log1p(Math.max(0, product.reviews_count)) / Math.log1p(stats.maxReviews),
  );
  vector[2] = clamp01(
    (stats.productPopularity.get(product.id) ?? 0) / Math.max(stats.maxPopularity, 1),
  );
  vector[3] = clamp01(1 - (Number(product.price) - stats.minPrice) / stats.priceRange);
  vector[4] = product.stock > 0 ? 1 : 0;
  vector[5] = clamp01(1 - ageDays / Math.max(stats.maxAgeDays, 1));
  vector[6] = clamp01(tokens.size / 24);
  vector[7] = clamp01(product.category.length / 6);
  addTokenBuckets(vector, [{ tokens, weight: 1 }]);

  return vector;
}

function buildQueryFeatures(context: RecommendationContext, stats: TwoTowerStats) {
  const vector = buildBaseVector();
  const signals = deriveSessionSignals(context.events ?? []);
  const anchors = buildWeightedAnchors(context);
  const anchorRatings = anchors.map((anchor) => ({
    value: clamp01(Number(anchor.product.rating ?? 0) / 5),
    weight: anchor.weight,
  }));
  const anchorReviews = anchors.map((anchor) => ({
    value: clamp01(
      Math.log1p(Math.max(0, anchor.product.reviews_count)) / Math.log1p(stats.maxReviews),
    ),
    weight: anchor.weight,
  }));
  const anchorPopularity = anchors.map((anchor) => ({
    value: clamp01(
      (stats.productPopularity.get(anchor.product.id) ?? 0) / Math.max(stats.maxPopularity, 1),
    ),
    weight: anchor.weight,
  }));
  const anchorPrices = anchors.map((anchor) => ({
    value: Number(anchor.product.price),
    weight: anchor.weight,
  }));
  const averageAnchorPrice =
    anchorPrices.length > 0 ? weightedAverage(anchorPrices) : stats.minPrice + stats.priceRange / 2;

  vector[0] = anchorRatings.length > 0 ? weightedAverage(anchorRatings) : 0.55;
  vector[1] = anchorReviews.length > 0 ? weightedAverage(anchorReviews) : 0.45;
  vector[2] = anchorPopularity.length > 0 ? weightedAverage(anchorPopularity) : 0.35;
  vector[3] = clamp01(1 - (averageAnchorPrice - stats.minPrice) / stats.priceRange);
  const cartWeight = anchors
    .filter((anchor) =>
      (context.cartProducts ?? []).some((product) => product.id === anchor.product.id),
    )
    .reduce((sum, anchor) => sum + anchor.weight, 0);
  const orderWeight = anchors
    .filter((anchor) =>
      (context.orderProducts ?? []).some((product) => product.id === anchor.product.id),
    )
    .reduce((sum, anchor) => sum + anchor.weight, 0);
  const recentWeight = anchors
    .filter((anchor) =>
      (context.recentProducts ?? []).some((product) => product.id === anchor.product.id),
    )
    .reduce((sum, anchor) => sum + anchor.weight, 0);
  const searchStrength = (context.searchTerms ?? []).reduce(
    (total, term, index) => total + Math.max(0.35, 1 - index * 0.25) * tokenize(term).length,
    0,
  );

  vector[4] = clamp01((cartWeight * 1.2 + orderWeight * 1.45) / 6);
  vector[5] = clamp01((recentWeight + searchStrength) / 8);
  vector[6] = clamp01(searchStrength / 14);
  vector[7] = clamp01(anchors.reduce((sum, anchor) => sum + anchor.weight, 0) / 8);
  addTokenBuckets(vector, buildWeightedContextBatches(context));

  return vector;
}

function buildEmbedding(vector: number[], weights: number[]) {
  return vector.map((value, index) => value * clampWeight(weights[index] ?? 1));
}

function buildCatalogFingerprint(pool: Product[]) {
  return pool
    .slice(0, 80)
    .map(
      (product) =>
        `${product.id}:${Math.round(Number(product.price))}:${product.reviews_count}:${product.stock}`,
    )
    .join("|");
}

function defaultModel(fingerprint: string): TwoTowerModel {
  return {
    version: 1,
    embeddingSize: twoTowerEmbeddingSize,
    itemWeights: [...DEFAULT_ITEM_WEIGHTS],
    queryWeights: [...DEFAULT_QUERY_WEIGHTS],
    bias: 0.05,
    fingerprint,
    trainedAt: new Date().toISOString(),
    updateCount: 0,
  };
}

function buildTrainingExamples(pool: Product[], events: SessionEvent[]) {
  const productMap = new Map(pool.map((product) => [product.id, product] as const));
  const bySession = new Map<string, SessionEvent[]>();

  for (const event of events) {
    const bucket = bySession.get(event.sessionId) ?? [];
    bucket.push(event);
    bySession.set(event.sessionId, bucket);
  }

  const examples: TwoTowerTrainingExample[] = [];

  for (const sessionEvents of bySession.values()) {
    sessionEvents.sort((left, right) => Date.parse(left.timestamp) - Date.parse(right.timestamp));

    const history: SessionEvent[] = [];
    let recentProducts: Product[] = [];
    let cartProducts: Product[] = [];
    let orderProducts: Product[] = [];
    let searchTerms: string[] = [];
    const exposures = new Map<string, { context: RecommendationContext; clicked: boolean }>();

    for (const event of sessionEvents) {
      const contextSnapshot: RecommendationContext = {
        recentProducts,
        cartProducts,
        orderProducts,
        searchTerms,
        events: [...history],
      };

      if (event.type === "recommendation_impression") {
        const productIds = Array.isArray(event.metadata?.productIds)
          ? event.metadata.productIds.filter(
              (value): value is string => typeof value === "string" && value.trim().length > 0,
            )
          : [];

        for (const productId of productIds) {
          exposures.set(productId, { context: contextSnapshot, clicked: false });
        }
        history.push(event);
        continue;
      }

      if (event.type === "search" && event.query) {
        searchTerms = [...new Set([event.query.trim(), ...searchTerms])].slice(0, 4);
        history.push(event);
        continue;
      }

      const positiveIds: string[] = [];
      let strength = 0;

      if (event.type === "recommendation_feedback" && event.productId) {
        const feedback = event.metadata?.feedback;
        const product = productMap.get(event.productId);

        if (feedback === "more_like_this" && product) {
          positiveIds.push(event.productId);
          strength = 0.95;
          recentProducts = recentProducts.some((item) => item.id === event.productId)
            ? recentProducts
            : [product, ...recentProducts].slice(0, 5);
        }

        if (feedback === "not_relevant" && product) {
          examples.push({ product, context: contextSnapshot, label: 0, strength: 1.05 });
        }

        history.push(event);
        continue;
      }

      if (event.type === "product_view" && event.productId) {
        positiveIds.push(event.productId);
        strength = 0.5;
      }

      if (event.type === "add_to_cart" && event.productId) {
        positiveIds.push(event.productId);
        strength = 0.95;
        cartProducts = cartProducts.some((product) => product.id === event.productId)
          ? cartProducts
          : [productMap.get(event.productId) ?? null, ...cartProducts]
              .filter((product): product is Product => Boolean(product))
              .slice(0, 5);
      }

      if (event.type === "order_placed") {
        const productIds = Array.isArray(event.metadata?.productIds)
          ? event.metadata.productIds.filter(
              (value): value is string => typeof value === "string" && value.trim().length > 0,
            )
          : [];
        positiveIds.push(...productIds);
        strength = 1.35;
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

        const forbiddenIds = new Set([
          productId,
          ...recentProducts.map((item) => item.id),
          ...cartProducts.map((item) => item.id),
          ...orderProducts.map((item) => item.id),
        ]);

        const negatives = sampleNegatives(
          pool,
          forbiddenIds,
          3,
          `${sessionEvents[0]?.sessionId ?? "session"}:${productId}`,
        );

        examples.push({ product, context: contextSnapshot, label: 1, strength });

        for (const negative of negatives) {
          examples.push({ product: negative, context: contextSnapshot, label: 0, strength: 0.45 });
        }

        recentProducts = [
          product,
          ...recentProducts.filter((item) => item.id !== product.id),
        ].slice(0, 5);

        const exposure = exposures.get(productId);
        if (exposure) exposure.clicked = true;
      }

      history.push(event);
    }

    for (const [productId, exposure] of exposures.entries()) {
      if (exposure.clicked) continue;
      const product = productMap.get(productId);
      if (!product) continue;
      examples.push({ product, context: exposure.context, label: 0, strength: 0.7 });
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
    const candidate = candidates[(start + index * 11) % candidates.length];
    if (candidate && !negatives.some((item) => item.id === candidate.id)) {
      negatives.push(candidate);
    }
  }

  return negatives;
}

function trainModel(pool: Product[], events: SessionEvent[], seedModel?: TwoTowerModel | null) {
  const fingerprint = `${MODEL_SIGNATURE}:${buildCatalogFingerprint(pool)}`;
  let model =
    seedModel && seedModel.fingerprint === fingerprint
      ? { ...seedModel }
      : defaultModel(fingerprint);
  const stats = buildStats(pool, events);
  const examples = buildTrainingExamples(pool, events);

  for (let epoch = 0; epoch < DEFAULT_EPOCHS; epoch += 1) {
    for (const example of examples) {
      const itemVector = buildItemFeatures(example.product, stats);
      const queryVector = buildQueryFeatures(example.context, stats);
      const itemEmbedding = buildEmbedding(itemVector, model.itemWeights);
      const queryEmbedding = buildEmbedding(queryVector, model.queryWeights);
      const score = dotProduct(itemEmbedding, queryEmbedding) + model.bias;
      const prediction = sigmoid(score);
      const error = (example.label - prediction) * example.strength;

      for (let index = 0; index < twoTowerEmbeddingSize; index += 1) {
        const itemFeature = itemVector[index];
        const queryFeature = queryVector[index];
        const currentItemWeight = model.itemWeights[index];
        const currentQueryWeight = model.queryWeights[index];

        model.itemWeights[index] = clampWeight(
          currentItemWeight +
            DEFAULT_LEARNING_RATE * error * itemFeature * queryFeature * currentQueryWeight,
        );
        model.queryWeights[index] = clampWeight(
          currentQueryWeight +
            DEFAULT_LEARNING_RATE * error * itemFeature * queryFeature * currentItemWeight,
        );
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

  return { model, stats };
}

export function trainTwoTowerModel(
  pool: Product[],
  events: SessionEvent[],
  seedModel?: TwoTowerModel | null,
) {
  return trainModel(pool, events, seedModel);
}

export function encodeTwoTowerQuery(
  pool: Product[],
  context: RecommendationContext,
  model: TwoTowerModel,
) {
  const stats = buildStats(pool, context.events ?? []);
  const queryVector = buildQueryFeatures(context, stats);

  return {
    queryEmbedding: buildEmbedding(queryVector, model.queryWeights),
    stats,
  };
}

export function rankTwoTowerCandidates(
  pool: Product[],
  context: RecommendationContext,
  model: TwoTowerModel,
  precomputedEmbeddings?: Map<string, TwoTowerEmbeddingRecord>,
): TwoTowerRetrievalResult {
  const stats = buildStats(pool, context.events ?? []);
  const queryVector = buildQueryFeatures(context, stats);
  const queryEmbedding = buildEmbedding(queryVector, model.queryWeights);
  const excludedIds = new Set((context.excludeIds ?? []).filter(Boolean));

  if (context.seedProduct) excludedIds.add(context.seedProduct.id);

  const scored = pool
    .filter((product) => !excludedIds.has(product.id))
    .map((product) => {
      const cachedEmbedding = precomputedEmbeddings?.get(product.id);
      const itemVector = buildItemFeatures(product, stats);
      const itemEmbedding =
        cachedEmbedding?.embedding ?? buildEmbedding(itemVector, model.itemWeights);
      const similarity = cosineSimilarity(queryEmbedding, itemEmbedding);
      const embeddingRecord: TwoTowerEmbeddingRecord = {
        productId: product.id,
        embedding: itemEmbedding,
        norm: cachedEmbedding?.norm ?? vectorNorm(itemEmbedding),
      };

      return {
        product,
        similarity,
        itemEmbedding,
        queryEmbedding,
        embeddingRecord,
      } satisfies TwoTowerCandidate;
    })
    .sort((left, right) => right.similarity - left.similarity);

  const available = scored.filter(({ product }) => product.stock > 0);
  const ranked = available.length > 0 ? available : scored;
  const candidateLimit = Math.max(64, (context.limit ?? 8) * 10);

  return {
    candidates: ranked.slice(0, candidateLimit),
    embeddings: ranked.map(({ embeddingRecord }) => embeddingRecord),
    queryEmbedding,
  };
}

export function buildTwoTowerFingerprint(pool: Product[]) {
  return `${MODEL_SIGNATURE}:${buildCatalogFingerprint(pool)}`;
}
