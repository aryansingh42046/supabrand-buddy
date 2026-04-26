export type SessionEventMetadata = {
  source?: string;
  feedback?: RecommendationFeedbackValue;
  productIds?: string[];
  quantity?: number;
  orderId?: string;
  cartCount?: number;
  subtotal?: number;
  brand?: string | null;
  category?: string[] | null;
  path?: string;
  [key: string]: unknown;
};

export type SessionEventType =
  | "page_view"
  | "search"
  | "product_view"
  | "add_to_cart"
  | "remove_from_cart"
  | "update_quantity"
  | "checkout_start"
  | "recommendation_impression"
  | "recommendation_feedback"
  | "order_placed";

export type RecommendationFeedbackValue = "more_like_this" | "not_relevant";

export type SessionEvent = {
  id: string;
  sessionId: string;
  type: SessionEventType;
  timestamp: string;
  userId?: string;
  path?: string;
  query?: string;
  productId?: string;
  metadata?: SessionEventMetadata;
};

const SESSION_ID_KEY = "echocart:session-id";
const SESSION_EVENTS_KEY = "echocart:session-events";
const RECENT_SEARCHES_KEY = "echocart:recent-searches";
const SESSION_EVENT_NAME = "echocart:session-event";
const MAX_EVENTS = 250;
const MAX_RECENT_SEARCHES = 8;

function isBrowser() {
  return typeof window !== "undefined";
}

function createId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `evt_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function readJson<T>(key: string, fallback: T) {
  if (!isBrowser()) return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  if (!isBrowser()) return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function writeRecentSearchQuery(query: string) {
  const trimmed = query.trim();
  if (!trimmed) return;

  const recentSearches = getRecentSearchQueries(MAX_RECENT_SEARCHES).filter(
    (item) => item.toLowerCase() !== trimmed.toLowerCase(),
  );

  writeJson(RECENT_SEARCHES_KEY, [trimmed, ...recentSearches].slice(0, MAX_RECENT_SEARCHES));
}

export function getSessionId() {
  if (!isBrowser()) return createId();
  const existing = window.sessionStorage.getItem(SESSION_ID_KEY);
  if (existing) return existing;
  const sessionId = createId();
  window.sessionStorage.setItem(SESSION_ID_KEY, sessionId);
  return sessionId;
}

export function getSessionEvents() {
  return readJson<SessionEvent[]>(SESSION_EVENTS_KEY, []);
}

export function getRecentSearchQueries(limit = MAX_RECENT_SEARCHES) {
  return readJson<string[]>(RECENT_SEARCHES_KEY, []).slice(0, limit);
}

export function trackSessionEvent(
  event: Omit<SessionEvent, "id" | "sessionId" | "timestamp"> & { sessionId?: string },
) {
  if (!isBrowser()) return null;

  const storedEvent: SessionEvent = {
    id: createId(),
    sessionId: event.sessionId ?? getSessionId(),
    timestamp: new Date().toISOString(),
    ...event,
  };

  const events = [...getSessionEvents(), storedEvent].slice(-MAX_EVENTS);
  writeJson(SESSION_EVENTS_KEY, events);
  window.dispatchEvent(new CustomEvent(SESSION_EVENT_NAME, { detail: storedEvent }));
  return storedEvent;
}

export function subscribeToSessionEvents(listener: (event: SessionEvent) => void) {
  if (!isBrowser()) return () => {};

  const handleEvent = (event: Event) => {
    const customEvent = event as CustomEvent<SessionEvent>;
    if (customEvent.detail) listener(customEvent.detail);
  };

  const handleStorage = (event: StorageEvent) => {
    if (event.key !== SESSION_EVENTS_KEY || !event.newValue) return;
    try {
      const events = JSON.parse(event.newValue) as SessionEvent[];
      const latest = events[events.length - 1];
      if (latest) listener(latest);
    } catch {
      // Ignore malformed data.
    }
  };

  window.addEventListener(SESSION_EVENT_NAME, handleEvent as EventListener);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(SESSION_EVENT_NAME, handleEvent as EventListener);
    window.removeEventListener("storage", handleStorage);
  };
}

export function clearSessionEvents() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(SESSION_EVENTS_KEY);
}

export function trackPageView(
  path: string,
  options: { userId?: string; metadata?: SessionEventMetadata } = {},
) {
  return trackSessionEvent({
    type: "page_view",
    path,
    userId: options.userId,
    metadata: options.metadata,
  });
}

export function trackSearch(
  query: string,
  options: { userId?: string; metadata?: SessionEventMetadata } = {},
) {
  if (!query.trim()) return null;
  writeRecentSearchQuery(query);
  return trackSessionEvent({
    type: "search",
    query: query.trim(),
    userId: options.userId,
    metadata: options.metadata,
  });
}

export function trackRecommendationFeedback(
  productId: string,
  feedback: RecommendationFeedbackValue,
  options: { userId?: string; section?: string; metadata?: SessionEventMetadata } = {},
) {
  return trackSessionEvent({
    type: "recommendation_feedback",
    productId,
    userId: options.userId,
    metadata: {
      feedback,
      section: options.section,
      ...options.metadata,
    },
  });
}

export function trackProductView(
  productId: string,
  options: { userId?: string; metadata?: SessionEventMetadata } = {},
) {
  return trackSessionEvent({
    type: "product_view",
    productId,
    userId: options.userId,
    metadata: options.metadata,
  });
}

export function trackAddToCart(
  productId: string,
  quantity = 1,
  options: { userId?: string; metadata?: SessionEventMetadata } = {},
) {
  return trackSessionEvent({
    type: "add_to_cart",
    productId,
    userId: options.userId,
    metadata: { quantity, ...options.metadata },
  });
}

export function trackRemoveFromCart(
  productId: string,
  options: { userId?: string; metadata?: SessionEventMetadata } = {},
) {
  return trackSessionEvent({
    type: "remove_from_cart",
    productId,
    userId: options.userId,
    metadata: options.metadata,
  });
}

export function trackUpdateCartQuantity(
  productId: string,
  quantity: number,
  options: { userId?: string; metadata?: SessionEventMetadata } = {},
) {
  return trackSessionEvent({
    type: "update_quantity",
    productId,
    userId: options.userId,
    metadata: { quantity, ...options.metadata },
  });
}

export function trackCheckoutStart(
  options: { userId?: string; metadata?: SessionEventMetadata } = {},
) {
  return trackSessionEvent({
    type: "checkout_start",
    userId: options.userId,
    metadata: options.metadata,
  });
}

export function trackRecommendationImpression(
  productIds: string[],
  options: { userId?: string; section?: string; metadata?: SessionEventMetadata } = {},
) {
  const filtered = productIds.map((productId) => productId.trim()).filter(Boolean);
  if (filtered.length === 0) return null;
  return trackSessionEvent({
    type: "recommendation_impression",
    userId: options.userId,
    metadata: {
      productIds: filtered,
      section: options.section,
      count: filtered.length,
      ...options.metadata,
    },
  });
}

export function trackOrderPlaced(
  productIds: string[],
  orderId: string,
  options: { userId?: string; metadata?: SessionEventMetadata } = {},
) {
  return trackSessionEvent({
    type: "order_placed",
    userId: options.userId,
    metadata: {
      orderId,
      productIds,
      ...options.metadata,
    },
  });
}
