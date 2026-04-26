import { describe, expect, it } from "vitest";
import { type Product } from "@/lib/products";
import {
  deriveSessionSignals,
  materializeProductsByIds,
  recommendProducts,
} from "@/lib/recommendations";
import { type SessionEvent } from "@/lib/session-analytics";

function makeProduct(id: string, overrides: Partial<Product> = {}): Product {
  return {
    id,
    name: `Product ${id}`,
    description: `Description for ${id}`,
    price: 99,
    image_url: null,
    category: ["Clothing, Shoes & Jewelry", "Shoes"],
    brand: `Brand ${id}`,
    rating: 4.4,
    reviews_count: 50,
    stock: 10,
    extra_data: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("deriveSessionSignals", () => {
  it("collects search and recommendation feedback signals", () => {
    const events: SessionEvent[] = [
      {
        id: "evt-1",
        sessionId: "session-1",
        type: "search",
        timestamp: "2026-04-26T10:00:00.000Z",
        query: "running shoes",
      },
      {
        id: "evt-2",
        sessionId: "session-1",
        type: "recommendation_feedback",
        timestamp: "2026-04-26T10:01:00.000Z",
        productId: "p-1",
        metadata: { feedback: "more_like_this" },
      },
      {
        id: "evt-3",
        sessionId: "session-1",
        type: "recommendation_feedback",
        timestamp: "2026-04-26T10:02:00.000Z",
        productId: "p-2",
        metadata: { feedback: "not_relevant" },
      },
    ];

    const signals = deriveSessionSignals(events);

    expect(signals.searchTerms).toEqual(["running shoes"]);
    expect(signals.positiveFeedbackProductIds).toEqual(["p-1"]);
    expect(signals.negativeFeedbackProductIds).toEqual(["p-2"]);
  });
});

describe("materializeProductsByIds", () => {
  it("keeps requested order and skips missing ids", () => {
    const pool = [makeProduct("p-1"), makeProduct("p-2"), makeProduct("p-3")];

    expect(
      materializeProductsByIds(pool, ["p-3", "missing", "p-1"]).map((product) => product.id),
    ).toEqual(["p-3", "p-1"]);
  });
});

describe("recommendProducts", () => {
  it("excludes seed, history, and feedback anchor products", () => {
    const pool = [
      makeProduct("p-1", { brand: "Alpha" }),
      makeProduct("p-2", { brand: "Alpha" }),
      makeProduct("p-3", { brand: "Beta" }),
      makeProduct("p-4", { brand: "Beta" }),
      makeProduct("p-5", { brand: "Gamma" }),
      makeProduct("p-6", { brand: "Gamma" }),
      makeProduct("p-7", { brand: "Delta" }),
      makeProduct("p-8", { brand: "Delta" }),
    ];

    const items = recommendProducts(pool, {
      seedProduct: pool[0],
      recentProducts: [pool[1]],
      cartProducts: [pool[2]],
      orderProducts: [pool[3]],
      positiveFeedbackProductIds: [pool[4].id],
      negativeFeedbackProductIds: [pool[5].id],
      limit: 4,
    });

    const ids = items.map((item) => item.product.id);

    expect(ids.length).toBeGreaterThan(0);
    expect(ids).not.toContain("p-1");
    expect(ids).not.toContain("p-2");
    expect(ids).not.toContain("p-3");
    expect(ids).not.toContain("p-4");
    expect(ids).not.toContain("p-5");
    expect(ids).not.toContain("p-6");
  });
});
