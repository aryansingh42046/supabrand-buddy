import { useEffect, useMemo, useRef } from "react";
import { Sparkles, ThumbsDown, ThumbsUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProductCard } from "@/components/ProductCard";
import { useAuth } from "@/hooks/use-auth";
import { type RecommendedProduct } from "@/lib/recommendations";
import {
  trackRecommendationFeedback,
  trackRecommendationImpression,
} from "@/lib/session-analytics";

type RecommendationSectionProps = {
  title: string;
  description?: string;
  items: RecommendedProduct[];
  emptyMessage?: string;
};

export function RecommendationSection({
  title,
  description,
  items,
  emptyMessage,
}: RecommendationSectionProps) {
  const { user } = useAuth();
  const lastTrackedKey = useRef<string | null>(null);
  const itemIds = useMemo(() => items.map(({ product }) => product.id), [items]);
  const trackingKey = useMemo(() => `${title}:${itemIds.join("|")}`, [title, itemIds]);

  const handleFeedback = (productId: string, feedback: "more_like_this" | "not_relevant") => {
    trackRecommendationFeedback(productId, feedback, {
      userId: user?.id,
      section: title,
      metadata: {
        source: "recommendation-section",
        description,
      },
    });
  };

  useEffect(() => {
    if (items.length === 0) return;
    if (lastTrackedKey.current === trackingKey) return;
    lastTrackedKey.current = trackingKey;

    trackRecommendationImpression(itemIds, {
      userId: user?.id,
      section: title,
      metadata: {
        source: "recommendation-section",
        description,
      },
    });
  }, [description, itemIds, items.length, title, trackingKey, user?.id]);

  if (items.length === 0) {
    if (!emptyMessage) return null;
    return (
      <section className="rounded-[1.75rem] border border-dashed border-indigo-100/70 bg-white/75 p-6 text-sm text-muted-foreground shadow-[var(--shadow-card)]">
        {emptyMessage}
      </section>
    );
  }

  return (
    <section className="relative overflow-hidden rounded-[2rem] border border-indigo-100/70 bg-[linear-gradient(180deg,rgba(249,249,255,0.96),rgba(255,255,255,0.92))] p-5 shadow-[var(--shadow-card)] dark:bg-[linear-gradient(180deg,rgba(20,24,33,0.96),rgba(27,31,42,0.92))]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/40 to-transparent" />

      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/15 bg-indigo-50 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.28em] text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            Personalized picks
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-foreground">{title}</h2>
          {description && (
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="secondary"
            className="rounded-full border-indigo-100/70 bg-indigo-50 px-3 py-1 shadow-sm"
          >
            {items.length} picks
          </Badge>
          <Badge
            variant="outline"
            className="rounded-full border-indigo-100/70 px-3 py-1 text-muted-foreground"
          >
            Explainable
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {items.map(({ product, reasons }) => (
          <div key={product.id} className="space-y-3">
            <ProductCard product={product} />

            <div className="px-1 pb-1">
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="secondary"
                  className="rounded-full border-indigo-100/70 bg-indigo-50 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-primary"
                >
                  {reasons[0]?.label ?? "Recommended"}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {reasons
                    .slice(0, 2)
                    .map((reason) => reason.detail)
                    .join(" · ")}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="rounded-full border-indigo-100/70 bg-white/80 text-xs"
                  onClick={() => handleFeedback(product.id, "more_like_this")}
                >
                  <ThumbsUp className="mr-2 h-3.5 w-3.5" />
                  More like this
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="rounded-full text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => handleFeedback(product.id, "not_relevant")}
                >
                  <ThumbsDown className="mr-2 h-3.5 w-3.5" />
                  Not relevant
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
