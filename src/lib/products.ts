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

  let query = supabase.from("products").select("*", { count: "exact" });

  if (search) query = query.ilike("name", `%${search}%`);
  if (brand) query = query.eq("brand", brand);
  if (category) query = query.contains("category", [category]);
  if (typeof minPrice === "number") query = query.gte("price", minPrice);
  if (typeof maxPrice === "number") query = query.lte("price", maxPrice);
  if (typeof minRating === "number") query = query.gte("rating", minRating);

  switch (sort) {
    case "price_asc":
      query = query.order("price", { ascending: true });
      break;
    case "price_desc":
      query = query.order("price", { ascending: false });
      break;
    case "rating_desc":
      query = query.order("rating", { ascending: false, nullsFirst: false });
      break;
    case "popular":
      query = query.order("reviews_count", { ascending: false });
      break;
    default:
      query = query.order("rating", { ascending: false, nullsFirst: false });
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.range(from, to);

  const { data, error, count } = await query;
  if (error) throw error;
  return { products: (data ?? []) as Product[], total: count ?? 0 };
}

export async function fetchProductById(id: string) {
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as Product | null;
}

export async function fetchFacets() {
  // Get top brands and categories for filter UI
  const { data, error } = await supabase
    .from("products")
    .select("brand, category")
    .limit(2000);
  if (error) throw error;

  const brandCounts = new Map<string, number>();
  const catCounts = new Map<string, number>();
  for (const row of data ?? []) {
    const b = (row as { brand: string | null }).brand;
    if (b && b.trim()) brandCounts.set(b, (brandCounts.get(b) ?? 0) + 1);
    const cats = (row as { category: string[] | null }).category ?? [];
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
