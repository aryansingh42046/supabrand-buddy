import { type SupabaseClient } from "@supabase/supabase-js";
import { supabaseAdmin as rawSupabaseAdmin } from "@/integrations/supabase/client.server";
import { type HybridModel } from "@/lib/hybrid-model";
import { type SessionEvent } from "@/lib/session-analytics";

type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type RecommendationEventRow = {
  id: string;
  session_id: string;
  user_id: string | null;
  event_type: string;
  event_timestamp: string;
  path: string | null;
  query: string | null;
  product_id: string | null;
  metadata: Json;
  created_at: string;
};

type RecommendationEventInsert = {
  id: string;
  session_id: string;
  user_id?: string | null;
  event_type: string;
  event_timestamp: string;
  path?: string | null;
  query?: string | null;
  product_id?: string | null;
  metadata?: Json;
  created_at?: string;
};

type HybridModelSnapshotRow = {
  id: string;
  fingerprint: string;
  version: number;
  weights: Json;
  bias: number;
  trained_at: string;
  update_count: number;
  event_count: number;
  pool_size: number;
  created_at: string;
};

type HybridModelSnapshotInsert = {
  id?: string;
  fingerprint: string;
  version: number;
  weights: Json;
  bias: number;
  trained_at: string;
  update_count: number;
  event_count: number;
  pool_size: number;
  created_at?: string;
};

type RecommendationPersistenceDatabase = {
  public: {
    Tables: {
      recommendation_events: {
        Row: RecommendationEventRow;
        Insert: RecommendationEventInsert;
        Update: Partial<RecommendationEventInsert>;
        Relationships: [];
      };
      hybrid_model_snapshots: {
        Row: HybridModelSnapshotRow;
        Insert: HybridModelSnapshotInsert;
        Update: Partial<HybridModelSnapshotInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

const supabaseAdmin = rawSupabaseAdmin as unknown as SupabaseClient<RecommendationPersistenceDatabase>;

const RECENT_EVENT_LIMIT = 2000;

function cleanJson<T>(value: T): Json {
  if (value === undefined) return null;
  return JSON.parse(JSON.stringify(value)) as Json;
}

function normalizeEvents(events: SessionEvent[]) {
  const seen = new Set<string>();
  const uniqueEvents: SessionEvent[] = [];

  for (const event of events) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    uniqueEvents.push(event);
  }

  return uniqueEvents;
}

function toEventRow(event: SessionEvent): RecommendationEventInsert {
  return {
    id: event.id,
    session_id: event.sessionId,
    user_id: event.userId ?? null,
    event_type: event.type,
    event_timestamp: event.timestamp,
    path: event.path ?? null,
    query: event.query ?? null,
    product_id: event.productId ?? null,
    metadata: cleanJson(event.metadata ?? {}),
  };
}

export async function persistRecommendationEvents(events: SessionEvent[]) {
  const uniqueEvents = normalizeEvents(events);
  if (uniqueEvents.length === 0) return 0;

  const { error } = await supabaseAdmin
    .from("recommendation_events")
    .upsert(uniqueEvents.map(toEventRow), { onConflict: "id" });

  if (error) {
    throw error;
  }

  return uniqueEvents.length;
}

export async function loadHistoricalRecommendationEvents(limit = RECENT_EVENT_LIMIT) {
  const { data, error } = await supabaseAdmin
    .from("recommendation_events")
    .select("*")
    .order("event_timestamp", { ascending: false })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? [])
    .slice()
    .reverse()
    .map((row) => ({
      id: row.id,
      sessionId: row.session_id,
      type: row.event_type as SessionEvent["type"],
      timestamp: row.event_timestamp,
      userId: row.user_id ?? undefined,
      path: row.path ?? undefined,
      query: row.query ?? undefined,
      productId: row.product_id ?? undefined,
      metadata: (row.metadata as SessionEvent["metadata"]) ?? undefined,
    } satisfies SessionEvent));
}

export async function loadAndPersistRecommendationEvents(events: SessionEvent[]) {
  const uniqueEvents = normalizeEvents(events);

  try {
    await persistRecommendationEvents(uniqueEvents);
    const historicalEvents = await loadHistoricalRecommendationEvents();
    return mergeRecommendationEvents([...historicalEvents, ...uniqueEvents]);
  } catch {
    return uniqueEvents;
  }
}

export async function saveHybridModelSnapshot(
  model: HybridModel,
  options: { eventCount: number; poolSize: number },
) {
  const payload: HybridModelSnapshotInsert = {
    fingerprint: model.fingerprint,
    version: model.version,
    weights: cleanJson(model.weights),
    bias: model.bias,
    trained_at: model.trainedAt,
    update_count: model.updateCount,
    event_count: options.eventCount,
    pool_size: options.poolSize,
  };

  const { error } = await supabaseAdmin
    .from("hybrid_model_snapshots")
    .upsert(payload, { onConflict: "fingerprint" });

  if (error) {
    throw error;
  }
}

export async function loadLatestHybridModelSnapshot() {
  const { data, error } = await supabaseAdmin
    .from("hybrid_model_snapshots")
    .select("*")
    .order("trained_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

function mergeRecommendationEvents(events: SessionEvent[]) {
  const seen = new Set<string>();
  const ordered: SessionEvent[] = [];

  for (const event of events.sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))) {
    if (seen.has(event.id)) continue;
    seen.add(event.id);
    ordered.push(event);
  }

  return ordered;
}
