import { type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin as rawSupabaseAdmin } from "@/integrations/supabase/client.server";
import { type TwoTowerEmbeddingRecord, type TwoTowerModel } from "@/lib/two-tower";

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type TwoTowerModelSnapshotRow = {
  id: string;
  fingerprint: string;
  version: number;
  embedding_size: number;
  item_weights: Json;
  query_weights: Json;
  bias: number;
  trained_at: string;
  update_count: number;
  event_count: number;
  pool_size: number;
  created_at: string;
};

type TwoTowerModelSnapshotInsert = {
  id?: string;
  fingerprint: string;
  version: number;
  embedding_size: number;
  item_weights: Json;
  query_weights: Json;
  bias: number;
  trained_at: string;
  update_count: number;
  event_count: number;
  pool_size: number;
  created_at?: string;
};

type TwoTowerEmbeddingRow = {
  fingerprint: string;
  product_id: string;
  embedding: Json;
  embedding_norm: number;
  embedding_vector: string | null;
  model_trained_at: string;
  updated_at: string;
  created_at: string;
};

type TwoTowerEmbeddingInsert = {
  fingerprint: string;
  product_id: string;
  embedding: Json;
  embedding_norm: number;
  embedding_vector?: string | null;
  model_trained_at: string;
  updated_at?: string;
  created_at?: string;
};

type TwoTowerSearchRow = {
  product_id: string;
  similarity: number;
};

type TwoTowerSearchArgs = {
  query_embedding: Json;
  query_fingerprint: string;
  match_count?: number;
  candidate_product_ids?: string[] | null;
};

type TwoTowerPersistenceDatabase = {
  public: {
    Tables: {
      two_tower_model_snapshots: {
        Row: TwoTowerModelSnapshotRow;
        Insert: TwoTowerModelSnapshotInsert;
        Update: Partial<TwoTowerModelSnapshotInsert>;
        Relationships: [];
      };
      two_tower_item_embeddings: {
        Row: TwoTowerEmbeddingRow;
        Insert: TwoTowerEmbeddingInsert;
        Update: Partial<TwoTowerEmbeddingInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      search_two_tower_item_embeddings: {
        Args: TwoTowerSearchArgs;
        Returns: TwoTowerSearchRow[];
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const supabaseAdmin = rawSupabaseAdmin as unknown as SupabaseClient<TwoTowerPersistenceDatabase>;

function cleanJson<T>(value: T): Json {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value)) as Json;
}

function toNumberArray(value: Json, expectedLength: number) {
  const parsed = Array.isArray(value) ? value.map((entry) => Number(entry)) : [];
  if (parsed.length === expectedLength && parsed.every((entry) => Number.isFinite(entry))) {
    return parsed;
  }
  return new Array(expectedLength).fill(0);
}

function toModel(row: TwoTowerModelSnapshotRow): TwoTowerModel {
  return {
    version: row.version as 1,
    embeddingSize: row.embedding_size,
    itemWeights: toNumberArray(row.item_weights, row.embedding_size),
    queryWeights: toNumberArray(row.query_weights, row.embedding_size),
    bias: row.bias,
    fingerprint: row.fingerprint,
    trainedAt: row.trained_at,
    updateCount: row.update_count,
    eventCount: row.event_count,
    poolSize: row.pool_size,
  };
}

export async function saveTwoTowerModelSnapshot(
  model: TwoTowerModel,
  options: { eventCount: number; poolSize: number },
) {
  const payload: TwoTowerModelSnapshotInsert = {
    fingerprint: model.fingerprint,
    version: model.version,
    embedding_size: model.embeddingSize,
    item_weights: cleanJson(model.itemWeights),
    query_weights: cleanJson(model.queryWeights),
    bias: model.bias,
    trained_at: model.trainedAt,
    update_count: model.updateCount,
    event_count: options.eventCount,
    pool_size: options.poolSize,
  };

  const { error } = await supabaseAdmin
    .from("two_tower_model_snapshots")
    .upsert(payload, { onConflict: "fingerprint" });

  if (error) {
    throw error;
  }
}

export async function saveTwoTowerItemEmbeddings(
  fingerprint: string,
  embeddings: TwoTowerEmbeddingRecord[],
  modelTrainedAt: string,
) {
  const payload: TwoTowerEmbeddingInsert[] = embeddings.map((embedding) => ({
    fingerprint,
    product_id: embedding.productId,
    embedding: cleanJson(embedding.embedding),
    embedding_norm: embedding.norm,
    model_trained_at: modelTrainedAt,
  }));

  if (payload.length === 0) return;

  const { error } = await supabaseAdmin
    .from("two_tower_item_embeddings")
    .upsert(payload, { onConflict: "fingerprint,product_id" });

  if (error) {
    throw error;
  }
}

export async function loadTwoTowerState(fingerprint: string) {
  const { data: snapshotRow, error: snapshotError } = await supabaseAdmin
    .from("two_tower_model_snapshots")
    .select("*")
    .eq("fingerprint", fingerprint)
    .order("trained_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (snapshotError) {
    throw snapshotError;
  }

  if (!snapshotRow) {
    return null;
  }

  const { count, error: embeddingError } = await supabaseAdmin
    .from("two_tower_item_embeddings")
    .select("product_id", { count: "exact", head: true })
    .eq("fingerprint", fingerprint);

  if (embeddingError) {
    throw embeddingError;
  }

  return {
    snapshot: toModel(snapshotRow),
    embeddingCount: count ?? 0,
  };
}

export async function searchTwoTowerCandidates(options: {
  fingerprint: string;
  queryEmbedding: number[];
  candidateProductIds: string[];
  matchCount: number;
}) {
  const { data, error } = await supabaseAdmin.rpc("search_two_tower_item_embeddings", {
    query_embedding: options.queryEmbedding,
    query_fingerprint: options.fingerprint,
    match_count: options.matchCount,
    candidate_product_ids:
      options.candidateProductIds.length > 0 ? options.candidateProductIds : null,
  });

  if (error) {
    throw error;
  }

  return (data ?? []).map((row) => ({
    productId: row.product_id,
    similarity: row.similarity,
  }));
}
