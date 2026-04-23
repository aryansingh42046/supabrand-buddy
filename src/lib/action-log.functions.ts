import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { loadHistoricalRecommendationEvents } from "@/lib/recommendations.server";
import { type SessionEvent } from "@/lib/session-analytics";

const ActionLogRequestSchema = z.object({
  sessionId: z.string().min(1),
  userId: z.string().optional(),
  limit: z.number().int().positive().max(500).optional(),
});

type ActionLogMetadata = {
  source?: string;
  productIds?: string[];
  quantity?: number;
  orderId?: string;
  cartCount?: number;
  subtotal?: number;
  brand?: string | null;
  category?: string[] | null;
  path?: string;
  section?: string;
  count?: number;
  description?: string;
  [key: string]: string | number | boolean | string[] | null | undefined;
};

export type ActionLogEvent = Omit<SessionEvent, "metadata"> & {
  metadata?: ActionLogMetadata;
};

export type LoadActionLogRequest = z.infer<typeof ActionLogRequestSchema>;

export type LoadActionLogResponse = {
  events: ActionLogEvent[];
  limit: number;
};

export const loadActionLog = createServerFn({ method: "POST" })
  .inputValidator(ActionLogRequestSchema)
  .handler(async ({ data }): Promise<LoadActionLogResponse> => {
    const limit = data.limit ?? 250;
    const historicalEvents = await loadHistoricalRecommendationEvents(limit);

    const events = historicalEvents.filter((event) => {
      if (data.userId) {
        return event.userId === data.userId || event.sessionId === data.sessionId;
      }

      return event.sessionId === data.sessionId;
    }).map((event) => ({
      ...event,
      metadata: sanitizeMetadata(event.metadata),
    }));

    return {
      events,
      limit,
    };
  });

function sanitizeMetadata(metadata: SessionEvent["metadata"]): ActionLogMetadata | undefined {
  if (!metadata) return undefined;
  return JSON.parse(JSON.stringify(metadata)) as ActionLogMetadata;
}
