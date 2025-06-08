// src/app/lib/itemsService.ts
// ─────────────────────────────────────────────────────────────
// itemsService – one-stop “item catalogue” layer with edge-cache
// ─────────────────────────────────────────────────────────────
import { unstable_cache as nextCache, revalidateTag } from "next/cache";
import { supabase } from "./supabaseClient";

/* ---------- constants ---------- */
export const CATALOGUE_TAG = "item_catalogue"; // ⚠️ keep in-sync with admin action

/* ---------- types ---------- */
/** now includes per-item allowedTiers array (from item_definitions.allowed_tiers) */
export interface CatalogueItem {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  allowedTiers: string[] | null;
}

/* ---------- 1. low-level fetcher (runs only on MISS) ---------- */
async function fetchItemDefinitions(): Promise<CatalogueItem[]> {
  console.log("itemsService: cache MISS – querying Supabase …");

  // include allowed_tiers in the select
  const { data, error } = await supabase
    .from("item_definitions")
    .select("id, name, description, image, allowed_tiers")
    .order("name");

  if (error) {
    console.error("itemsService: DB fetch failed:", error.message);
    throw new Error(error.message);
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name as string,
    description: row.description ?? null,
    imageUrl: row.image ?? null,
    // map the Postgres column into our camelCase field
    allowedTiers: row.allowed_tiers ?? null,
  }));
}

/* ---------- 2. cached wrapper ---------- */
const getCatalogueCached = nextCache(fetchItemDefinitions, [CATALOGUE_TAG], {
  tags: [CATALOGUE_TAG], // enables on-demand revalidation
});

/* ---------- public helpers ---------- */

/** Returns the cached catalogue (edge-region aware). */
export async function getCatalogueItems(): Promise<CatalogueItem[]> {
  const items = await getCatalogueCached();
  console.log("itemsService: cache HIT – returned", items.length, "items");
  return items;
}

/** Triggered after admin changes; busts the tag everywhere. */
export async function revalidateCatalogue() {
  console.log("itemsService: revalidating", CATALOGUE_TAG);
  revalidateTag(CATALOGUE_TAG);
}
