import { supabase } from "@/integrations/supabase/client";

export type Product = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category: string[];
  brand: string | null;
  rating: number | null;
  reviews_count: number;
  stock: number;
  extra_data: Record<string, unknown> | null;
  created_at: string;
};

export type ProductFilters = {
  search?: string;
  brand?: string;
  category?: string;
  minPrice?: number;
  maxPrice?: number;
  minRating?: number;
  sort?: "relevance" | "price_asc" | "price_desc" | "rating_desc" | "popular";
  page?: number;
  pageSize?: number;
};

type ProductRow = Omit<Product, "category"> & {
  category?: unknown;
};

function normalizeCategoryLabel(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeCategories(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim())
            .filter(Boolean);
        }
      } catch {
        // Fall back to the raw string below.
      }
    }

    return [trimmed];
  }

  return [];
}

function normalizeProduct(product: ProductRow): Product {
  const { category, ...rest } = product;
  return {
    ...rest,
    category: normalizeCategories(category),
  };
}

function matchesCategory(categories: string[], selectedCategory: string) {
  const target = normalizeCategoryLabel(selectedCategory);
  return categories.some((category) => normalizeCategoryLabel(category) === target);
}

function applySort(
  query: ReturnType<typeof supabase.from>,
  sort: NonNullable<ProductFilters["sort"]>,
) {
  switch (sort) {
    case "price_asc":
      return query.order("price", { ascending: true });
    case "price_desc":
      return query.order("price", { ascending: false });
    case "rating_desc":
      return query.order("rating", { ascending: false, nullsFirst: false });
    case "popular":
      return query.order("reviews_count", { ascending: false });
    default:
      return query.order("rating", { ascending: false, nullsFirst: false });
  }
}

export async function fetchProducts(filters: ProductFilters = {}) {
  const {
    search,
    brand,
    category,
    minPrice,
    maxPrice,
    minRating,
    sort = "relevance",
    page = 1,
    pageSize = 24,
  } = filters;

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase.from("products").select("*", { count: "exact" });

  if (search) query = query.ilike("name", `%${search}%`);
  if (brand) query = query.eq("brand", brand);
  if (category) query = query.contains("category", [category]);
  if (typeof minPrice === "number") query = query.gte("price", minPrice);
  if (typeof maxPrice === "number") query = query.lte("price", maxPrice);
  if (typeof minRating === "number") query = query.gte("rating", minRating);

  query = applySort(query, sort).range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;

  const products = (data ?? []).map((product) => normalizeProduct(product as ProductRow));
  if (!category || products.length > 0) {
    return { products, total: count ?? 0 };
  }

  const fallbackQuery = supabase.from("products").select("*", { count: "exact" });
  if (search) fallbackQuery.ilike("name", `%${search}%`);
  if (brand) fallbackQuery.eq("brand", brand);
  if (typeof minPrice === "number") fallbackQuery.gte("price", minPrice);
  if (typeof maxPrice === "number") fallbackQuery.lte("price", maxPrice);
  if (typeof minRating === "number") fallbackQuery.gte("rating", minRating);

  const { data: fallbackData, error: fallbackError } = await applySort(fallbackQuery, sort).range(
    0,
    1999,
  );
  if (fallbackError) throw fallbackError;

  const matchingProducts = (fallbackData ?? [])
    .map((product) => normalizeProduct(product as ProductRow))
    .filter((product) => matchesCategory(product.category, category));

  return {
    products: matchingProducts.slice(from, to + 1),
    total: matchingProducts.length,
  };
}

export async function fetchProductById(id: string) {
  const { data, error } = await supabase.from("products").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? normalizeProduct(data as ProductRow) : null;
}

export async function fetchRecommendationPool(limit = 250) {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("reviews_count", { ascending: false })
    .order("rating", { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []).map((product) => normalizeProduct(product as ProductRow));
}

export async function fetchFacets() {
  // Get top brands and categories for filter UI
  const { data, error } = await supabase.from("products").select("brand, category").limit(2000);
  if (error) throw error;

  const brandCounts = new Map<string, number>();
  const catCounts = new Map<string, number>();
  for (const row of data ?? []) {
    const b = (row as { brand: string | null }).brand;
    if (b && b.trim()) brandCounts.set(b, (brandCounts.get(b) ?? 0) + 1);
    const cats = normalizeCategories((row as { category?: unknown }).category);
    for (const c of cats) {
      if (c && c.trim()) catCounts.set(c, (catCounts.get(c) ?? 0) + 1);
    }
  }
  const brands = [...brandCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([name, count]) => ({ name, count }));
  const categories = [...catCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 30)
    .map(([name, count]) => ({ name, count }));
  return { brands, categories };
}

export function formatPrice(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}
