// ─────────────────────────────────────────────────────────────
// src/app/lib/depreciationService.ts
// Keeps a cached, periodically-refreshed “global depreciation” snapshot
// ─────────────────────────────────────────────────────────────
/* ─── Section 1: Imports ──────────────────────────────────── */
import { supabase } from "./supabaseClient";
import { unstable_cache as nextCache } from "next/cache";

/* ─── End Section 1 ───────────────────────────────────────── */

/* ─── Section 2: Constants ───────────────────────────────── */
const DEPRECIATION_STATS_ID = "current_summary";
const ONE_WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

/* ─── End Section 2 ───────────────────────────────────────── */

/* ─── Section 3: Types ───────────────────────────────────── */
/* 3-A  Listing-view item shape */
export interface Item {
  id: string;
  name: string;
  description: string;
  image: string;

  /* listing-level data (may be null if no listing) */
  buyregular: string | null;
  buygold: string | null;
  buydiamond: string | null;
  buyemerald: string | null;
  sellregular: string | null;
  sellgold: string | null;
  selldiamond: string | null;
  sellemerald: string | null;
  publisher: string | null;
  date: string | null;
  admin_id: string | null;
  inserted_at: string;

  /** 🆕 unique per‐listing primary key (was added to the view) */
  listing_id?: string;
}

/* 3-B  Depreciation snapshot rows */
export interface DepreciationStats {
  id: string;
  total_items_from_source: number;
  items_with_valid_regular_price: number;
  average_gold_depreciation: number;
  gold_items_count: number;
  average_diamond_depreciation: number;
  diamond_items_count: number;
  average_emerald_depreciation: number;
  emerald_items_count: number;
  updated_at: string; // ISO
}
export type NewDepreciationStats = Omit<
  DepreciationStats,
  "id" | "updated_at"
>;

export type StatsSourceType =
  | "DATABASE"
  | "NEWLY CALCULATED"
  | "DATABASE (STALE - ITEM FETCH FAILED)"
  | "DEFAULT (ERROR/NO DATA)";

  /* ─── End Section 3 ───────────────────────────────────────── */

  /* ─── Section 4: Utility – price parser ──────────────────── */
/* ╭──────────────────────────────────────────╮
   │  Helper : string → number, tolerant      │
   ╰──────────────────────────────────────────╯ */
const parsePrice = (priceString: string | null): number | null => {
  if (priceString == null) return null;
  const cleaned = `${priceString}`.replace(/₪|,/g, "").trim();
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
};

/* ─── End Section 4 ───────────────────────────────────────── */

/* ─── Section 5: Cached fetch of items_flat view ─────────── */
const getCachedItems = nextCache(
  async () => {
    console.log(
      "depreciationService.getCachedItems: querying items_flat for cache…"
    );

    const { data, error } = await supabase.from("items_flat").select("*");
    if (error) {
      console.error(
        "depreciationService.getCachedItems: DB error:",
        error.message
      );
      return { items: [] as Item[], error: error.message };
    }

    console.log(
      "depreciationService.getCachedItems: fetched",
      data?.length || 0,
      "rows"
    );
    return { items: (data ?? []) as Item[], error: null };
  },
  ["items_flat_data_v1"],
  { tags: ["items"] }
);

/* ─── End Section 5 ───────────────────────────────────────── */

/* ─── Section 6: Maths – calculate depreciation summary ──── */
/* ╭──────────────────────────────────────────────╮
   │  Pure maths – one pass over all listings      │
   ╰──────────────────────────────────────────────╯ */
const calculateDepreciationSummary = (
  items: Item[]
): NewDepreciationStats => {
  console.log(
    "\ndepreciationService.calculateDepreciationSummary: START CALCULATION"
  );

  const gold: number[] = [];
  const diamond: number[] = [];
  const emerald: number[] = [];
  let itemsWithData = 0;

  if (!items.length) {
    console.log("… no items at all – return zeros.");
    return {
      total_items_from_source: 0,
      items_with_valid_regular_price: 0,
      average_gold_depreciation: 0,
      gold_items_count: 0,
      average_diamond_depreciation: 0,
      diamond_items_count: 0,
      average_emerald_depreciation: 0,
      emerald_items_count: 0,
    };
  }

  items.forEach((it) => {
    const p = parsePrice(it.buyregular);
    if (p == null || p <= 0) return;

    itemsWithData++;

    const maxG = p * 4;
    const maxD = p * 16;
    const maxE = p * 64;

    const pushIf = (arr: number[], actual: number | null, max: number) => {
      if (actual == null || !max) return;
      const dep = 100 * (1 - actual / max);
      if (Number.isFinite(dep)) arr.push(dep);
    };

    pushIf(gold, parsePrice(it.buygold), maxG);
    pushIf(diamond, parsePrice(it.buydiamond), maxD);
    pushIf(emerald, parsePrice(it.buyemerald), maxE);
  });

  const avg = (a: number[]) =>
    a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0;

  const out: NewDepreciationStats = {
    total_items_from_source: items.length,
    items_with_valid_regular_price: itemsWithData,
    average_gold_depreciation: avg(gold),
    gold_items_count: gold.length,
    average_diamond_depreciation: avg(diamond),
    diamond_items_count: diamond.length,
    average_emerald_depreciation: avg(emerald),
    emerald_items_count: emerald.length,
  };

  console.log(
    "depreciationService.calculateDepreciationSummary: END CALCULATION",
    out
  );
  return out;
};

/* ─── End Section 6 ───────────────────────────────────────── */

/* ─── Section 7: Tiny DB helpers ─────────────────────────── */
async function getDepreciationStatsFromDB(): Promise<DepreciationStats | null> {
  const { data, error } = await supabase
    .from("depreciation_stats")
    .select("*")
    .eq("id", DEPRECIATION_STATS_ID)
    .single();

  if (error && error.code !== "PGRST116") {
    console.error(
      "depreciationService.getDepreciationStatsFromDB: error",
      error.message
    );
    return null;
  }
  return (data as DepreciationStats) ?? null;
}

async function storeDepreciationStatsInDB(
  stats: NewDepreciationStats
): Promise<DepreciationStats | null> {
  const payload: DepreciationStats = {
    ...stats,
    id: DEPRECIATION_STATS_ID,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("depreciation_stats")
    .upsert(payload, { onConflict: "id" })
    .select()
    .single();

  if (error) {
    console.error(
      "depreciationService.storeDepreciationStatsInDB: error",
      error.message
    );
    return null;
  }
  return data as DepreciationStats;
}

/* ─── End Section 7 ───────────────────────────────────────── */

/* ─── Section 8: Defaults & Public API ───────────────────── */
const EMPTY_STATS: NewDepreciationStats & { updated_at?: string } = {
  total_items_from_source: 0,
  items_with_valid_regular_price: 0,
  average_gold_depreciation: 0,
  gold_items_count: 0,
  average_diamond_depreciation: 0,
  diamond_items_count: 0,
  average_emerald_depreciation: 0,
  emerald_items_count: 0,
};

/* ╭──────────────────────────────────────────╮
   │  Public: fetch + manage + cache snapshot │
   ╰──────────────────────────────────────────╯ */
export async function fetchAndManageDepreciationStats(): Promise<{
  data: DepreciationStats | NewDepreciationStats;
  source: StatsSourceType;
  itemFetchError?: string;
}> {
  let current: DepreciationStats | NewDepreciationStats = { ...EMPTY_STATS };
  let src: StatsSourceType = "DEFAULT (ERROR/NO DATA)";
  let recalc = true;
  let listError: string | undefined;

  /* 1️⃣ maybe use DB */
  const existing = await getDepreciationStatsFromDB();
  if (existing) {
    const age = Date.now() - new Date(existing.updated_at).getTime();
    if (age < ONE_WEEK_IN_MS) {
      current = existing;
      src = "DATABASE";
      recalc = false;
    }
  }

  /* 2️⃣ recalc if needed */
  if (recalc) {
    const { items, error } = await getCachedItems();

    if (error) {
      listError = error;
      if (existing) {
        current = existing;
        src = "DATABASE (STALE - ITEM FETCH FAILED)";
      }
    } else if (items.length) {
      const fresh = calculateDepreciationSummary(items);
      const saved = await storeDepreciationStatsInDB(fresh);
      current = saved ?? fresh;
      src = "NEWLY CALCULATED";
    } else if (existing) {
      current = existing;
      src = "DATABASE (STALE - ITEM FETCH FAILED)";
    }
  }

  console.log(
    `depreciationService: returning summary (source = ${src}) – total ${current.total_items_from_source}`
  );
  return { data: current, source: src, itemFetchError: listError };
}

/* ---------- re-export for SearchComponent ---------- */
export { getCachedItems as getSearchComponentItems };
/* ─── End Section 8 ───────────────────────────────────────── */