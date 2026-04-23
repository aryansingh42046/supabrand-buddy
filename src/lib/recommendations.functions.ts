import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { type Product } from "@/lib/products";
import { type SessionEvent } from "@/lib/session-analytics";
import { fitHybridModel, getHybridRankings } from "@/lib/hybrid-model";
import {
  buildRecommendedProductsFromRankings,
  type RecommendationContext,
  type RecommendedProduct,
} from "@/lib/recommendations";
import {
  loadAndPersistRecommendationEvents,
  saveHybridModelSnapshot,
} from "@/lib/recommendations.server";
import {
  buildTwoTowerFingerprint,
  encodeTwoTowerQuery,
  rankTwoTowerCandidates,
  trainTwoTowerModel,
} from "@/lib/two-tower";
import {
  loadTwoTowerState,
  searchTwoTowerCandidates,
  saveTwoTowerItemEmbeddings,
  saveTwoTowerModelSnapshot,
} from "@/lib/two-tower.server";

const ProductSchema: z.ZodType<Product> = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    price: z.number(),
    image_url: z.string().nullable(),
    category: z.array(z.string()),
    brand: z.string().nullable(),
    rating: z.number().nullable(),
    reviews_count: z.number(),
    stock: z.number(),
    extra_data: z.record(z.string(), z.unknown()).nullable(),
    created_at: z.string(),
  })
  .passthrough();

const SessionEventSchema: z.ZodType<SessionEvent> = z
  .object({
    id: z.string(),
    sessionId: z.string(),
    type: z.enum([
      "page_view",
      "search",
      "product_view",
      "add_to_cart",
      "remove_from_cart",
      "update_quantity",
      "checkout_start",
      "recommendation_impression",
      "order_placed",
    ]),
    timestamp: z.string(),
    userId: z.string().optional(),
    path: z.string().optional(),
    query: z.string().optional(),
    productId: z.string().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const RecommendationContextSchema: z.ZodType<RecommendationContext> = z
  .object({
    seedProduct: ProductSchema.nullable().optional(),
    recentProducts: z.array(ProductSchema).optional(),
    cartProducts: z.array(ProductSchema).optional(),
    orderProducts: z.array(ProductSchema).optional(),
    searchTerms: z.array(z.string()).optional(),
    events: z.array(SessionEventSchema).optional(),
    excludeIds: z.array(z.string()).optional(),
    limit: z.number().int().positive().max(24).optional(),
  })
  .passthrough();

const RecommendRequestSchema = z.object({
  pool: z.array(ProductSchema),
  context: RecommendationContextSchema,
});

export type TrainHybridRecommendationsRequest = z.infer<typeof RecommendRequestSchema>;

export type TrainHybridRecommendationsResponse = {
  items: RecommendedProduct[];
  trainedAt: string;
  count: number;
};

export const trainHybridRecommendations = createServerFn({ method: "POST" })
  .inputValidator(RecommendRequestSchema)
  .handler(async ({ data }): Promise<TrainHybridRecommendationsResponse> => {
    const mergedEvents = await loadAndPersistRecommendationEvents(data.context.events ?? []);
    const trainingContext = {
      ...data.context,
      events: mergedEvents,
    } satisfies RecommendationContext;

    const excludedIds = new Set(trainingContext.excludeIds ?? []);
    if (trainingContext.seedProduct) {
      excludedIds.add(trainingContext.seedProduct.id);
    }

    const catalogFingerprint = buildTwoTowerFingerprint(data.pool);
    const cachedTwoTowerState = await loadTwoTowerState(catalogFingerprint).catch(() => null);
    const isTwoTowerSnapshotFresh =
      cachedTwoTowerState?.snapshot?.eventCount === mergedEvents.length &&
      cachedTwoTowerState.snapshot.poolSize === data.pool.length &&
      cachedTwoTowerState.embeddingCount === data.pool.length;

    const twoTowerModel = isTwoTowerSnapshotFresh && cachedTwoTowerState
      ? cachedTwoTowerState.snapshot
      : trainTwoTowerModel(data.pool, mergedEvents, cachedTwoTowerState?.snapshot ?? null).model;

    const { queryEmbedding } = encodeTwoTowerQuery(data.pool, trainingContext, twoTowerModel);

    const candidateProductIds = data.pool
      .map((product) => product.id)
      .filter((productId) => !excludedIds.has(productId));

    let candidatePool: Product[] = [];
    let exactTwoTowerFallback: ReturnType<typeof rankTwoTowerCandidates> | null = null;

    const getExactTwoTowerFallback = () => {
      exactTwoTowerFallback ??= rankTwoTowerCandidates(data.pool, trainingContext, twoTowerModel);
      return exactTwoTowerFallback;
    };

    try {
      const searchResults = await searchTwoTowerCandidates({
        fingerprint: twoTowerModel.fingerprint,
        queryEmbedding,
        candidateProductIds,
        matchCount: Math.max(48, (trainingContext.limit ?? 8) * 8),
      });

      const productMap = new Map(data.pool.map((product) => [product.id, product] as const));
      candidatePool = searchResults
        .map(({ productId }) => productMap.get(productId))
        .filter((product): product is Product => Boolean(product));

      if (candidatePool.length === 0) {
        candidatePool = getExactTwoTowerFallback().candidates.map(({ product }) => product);
      }
    } catch {
      candidatePool = getExactTwoTowerFallback().candidates.map(({ product }) => product);
    }

    if (!isTwoTowerSnapshotFresh) {
      await saveTwoTowerModelSnapshot(twoTowerModel, {
        eventCount: mergedEvents.length,
        poolSize: data.pool.length,
      });

      await saveTwoTowerItemEmbeddings(
        twoTowerModel.fingerprint,
        getExactTwoTowerFallback().embeddings,
        twoTowerModel.trainedAt,
      );
    }

    const trainedModel = fitHybridModel(data.pool, trainingContext);
    const rankedProducts = getHybridRankings(candidatePool, trainingContext);
    const items: RecommendedProduct[] = buildRecommendedProductsFromRankings(rankedProducts, trainingContext);

    await saveHybridModelSnapshot(trainedModel, {
      eventCount: mergedEvents.length,
      poolSize: data.pool.length,
    });

    return {
      items,
      trainedAt: trainedModel.trainedAt,
      count: items.length,
    };
  });
