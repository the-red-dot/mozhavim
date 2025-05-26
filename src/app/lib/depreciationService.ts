// src/app/lib/depreciationService.ts
import { supabase } from "./supabaseClient"; // Assuming supabaseClient is in the same lib folder
import { unstable_cache as nextCache } from 'next/cache';

// Constants
const DEPRECIATION_STATS_ID = 'current_summary';
const ONE_WEEK_IN_MS = 7 * 24 * 60 * 60 * 1000;

// Interfaces
export interface Item {
  id: string;
  name: string;
  description: string;
  image: string;
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
}

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
  updated_at: string; // ISO string date
}

export type NewDepreciationStats = Omit<DepreciationStats, 'id' | 'updated_at'>;

export type StatsSourceType = 'DATABASE' | 'NEWLY CALCULATED' | 'DATABASE (STALE - ITEM FETCH FAILED)' | 'DEFAULT (ERROR/NO DATA)';

// Helper Functions
const parsePrice = (priceString: string | null): number | null => {
  if (priceString === null || typeof priceString === 'undefined') {
    return null;
  }
  const cleanedString = String(priceString).replace(/₪|,/g, '').trim();
  if (cleanedString === "" || isNaN(parseFloat(cleanedString))) {
    return null;
  }
  return parseFloat(cleanedString);
};

const getCachedItems = nextCache(
  async () => {
    console.log("depreciationService.getCachedItems: Fetching items from Supabase for caching…");
    const { data, error } = await supabase.from("items_flat").select("*");

    if (error) {
      console.error("depreciationService.getCachedItems: Error fetching items:", error.message);
      return { items: [], error: error.message };
    }
    console.log("depreciationService.getCachedItems: Fetched", data?.length || 0, "rows for cache.");
    return { items: data as Item[], error: null };
  },
  ['items_flat_data_v1'], // Cache key should be unique if this function is defined elsewhere too
  {
    tags: ['items'],
  }
);

const calculateDepreciationSummary = (items: Item[]): NewDepreciationStats => {
  console.log("\ndepreciationService.calculateDepreciationSummary: START CALCULATION");
  let allGoldDepreciations: number[] = [];
  let allDiamondDepreciations: number[] = [];
  let allEmeraldDepreciations: number[] = [];
  let itemsWithAnyCalculableData = 0;

  if (!items || items.length === 0) {
    console.log("depreciationService.calculateDepreciationSummary: No items provided.");
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

  items.forEach((item) => { // Removed index as it wasn't used inside after item.id was preferred
    const regularPrice = parsePrice(item.buyregular);
    const actualGoldPrice = parsePrice(item.buygold);
    const actualDiamondPrice = parsePrice(item.buydiamond);
    const actualEmeraldPrice = parsePrice(item.buyemerald);
    let itemHasCalculableData = false;

    if (regularPrice !== null && regularPrice > 0) {
      itemHasCalculableData = true;
      const theoreticalMaxGold = regularPrice * 4;
      const theoreticalMaxDiamond = regularPrice * 16;
      const theoreticalMaxEmerald = regularPrice * 64;

      if (actualGoldPrice !== null) {
        const depreciation = 100 * (1 - actualGoldPrice / theoreticalMaxGold);
        if (!isNaN(depreciation) && isFinite(depreciation)) allGoldDepreciations.push(depreciation);
      }
      if (actualDiamondPrice !== null) {
        const depreciation = 100 * (1 - actualDiamondPrice / theoreticalMaxDiamond);
        if (!isNaN(depreciation) && isFinite(depreciation)) allDiamondDepreciations.push(depreciation);
      }
      if (actualEmeraldPrice !== null) {
        const depreciation = 100 * (1 - actualEmeraldPrice / theoreticalMaxEmerald);
        if (!isNaN(depreciation) && isFinite(depreciation)) allEmeraldDepreciations.push(depreciation);
      }
    }
    if(itemHasCalculableData) itemsWithAnyCalculableData++;
  });

  const calculateAverage = (arr: number[]): number => {
    if (arr.length === 0) return 0;
    const sum = arr.reduce((acc, val) => acc + val, 0);
    return sum / arr.length;
  };

  const summary: NewDepreciationStats = {
    total_items_from_source: items.length,
    items_with_valid_regular_price: itemsWithAnyCalculableData,
    average_gold_depreciation: calculateAverage(allGoldDepreciations),
    gold_items_count: allGoldDepreciations.length,
    average_diamond_depreciation: calculateAverage(allDiamondDepreciations),
    diamond_items_count: allDiamondDepreciations.length,
    average_emerald_depreciation: calculateAverage(allEmeraldDepreciations),
    emerald_items_count: allEmeraldDepreciations.length,
  };
  console.log("depreciationService.calculateDepreciationSummary: END CALCULATION", summary);
  return summary;
};

async function getDepreciationStatsFromDB(): Promise<DepreciationStats | null> {
  console.log("depreciationService.getDepreciationStatsFromDB: Attempting to fetch...");
  const { data, error } = await supabase
    .from('depreciation_stats')
    .select('*')
    .eq('id', DEPRECIATION_STATS_ID)
    .single();
  if (error && error.code !== 'PGRST116') {
    console.error("depreciationService.getDepreciationStatsFromDB: Error fetching:", error.message);
    return null;
  }
  if (data) {
    console.log("depreciationService.getDepreciationStatsFromDB: Successfully fetched.");
    return data as DepreciationStats;
  }
  console.log("depreciationService.getDepreciationStatsFromDB: No existing stats found.");
  return null;
}

async function storeDepreciationStatsInDB(stats: NewDepreciationStats): Promise<DepreciationStats | null> {
  console.log("depreciationService.storeDepreciationStatsInDB: Attempting to store/update...");
  const statsToUpsert: DepreciationStats = {
    ...stats,
    id: DEPRECIATION_STATS_ID,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from('depreciation_stats')
    .upsert(statsToUpsert, { onConflict: 'id' })
    .select()
    .single();
  if (error) {
    console.error("depreciationService.storeDepreciationStatsInDB: Error storing:", error.message);
    return null;
  }
  console.log("depreciationService.storeDepreciationStatsInDB: Successfully stored/updated.");
  return data as DepreciationStats;
}

const defaultInitialStatsData: NewDepreciationStats & { updated_at?: string } = {
  total_items_from_source: 0,
  items_with_valid_regular_price: 0,
  average_gold_depreciation: 0,
  gold_items_count: 0,
  average_diamond_depreciation: 0,
  diamond_items_count: 0,
  average_emerald_depreciation: 0,
  emerald_items_count: 0,
  // updated_at is undefined here
};

// Main exported function
export async function fetchAndManageDepreciationStats(): Promise<{
  data: DepreciationStats | NewDepreciationStats; // Can return full stats or new if storage fails
  source: StatsSourceType;
  itemFetchError?: string; // Optional error message specific to item fetching for SearchComponent
}> {
  let currentData: DepreciationStats | NewDepreciationStats = { ...defaultInitialStatsData };
  let source: StatsSourceType = 'DEFAULT (ERROR/NO DATA)';
  let needsRecalculation = true;
  let itemFetchErrorForPage: string | undefined = undefined;

  const existingStats = await getDepreciationStatsFromDB();

  if (existingStats) {
    const statsAge = Date.now() - new Date(existingStats.updated_at).getTime();
    if (statsAge < ONE_WEEK_IN_MS) {
      console.log("depreciationService: Stats from DB are recent.");
      currentData = existingStats;
      source = 'DATABASE';
      needsRecalculation = false;
    } else {
      console.log("depreciationService: Stats from DB are stale. Recalculation needed.");
    }
  } else {
    console.log("depreciationService: No stats in DB. Calculation needed.");
  }

  if (needsRecalculation) {
    console.log("depreciationService: Fetching items for calculation...");
    const { items: rawItems, error: itemsError } = await getCachedItems();

    if (itemsError) {
      console.error("depreciationService: Failed to fetch items for calculation:", itemsError);
      itemFetchErrorForPage = itemsError; // Pass this error back for SearchComponent
      if (existingStats) {
        console.warn("depreciationService: Using stale stats due to item fetch error.");
        currentData = existingStats;
        source = 'DATABASE (STALE - ITEM FETCH FAILED)';
      } else {
        console.error("depreciationService: No data available after item fetch error.");
        // currentData remains defaultInitialStatsData
        source = 'DEFAULT (ERROR/NO DATA)';
      }
    } else if (rawItems && rawItems.length > 0) {
      const newStats = calculateDepreciationSummary(rawItems);
      const storedStats = await storeDepreciationStatsInDB(newStats);
      if (storedStats) {
        currentData = storedStats;
        source = 'NEWLY CALCULATED';
      } else {
        currentData = newStats; // Use calculated data even if storage failed
        source = 'NEWLY CALCULATED'; // But it's not persisted with a new updated_at from DB
        console.warn("depreciationService: Used newly calculated stats, but failed to store them.");
      }
    } else {
      console.log("depreciationService: No items found for calculation.");
      itemFetchErrorForPage = "No items found in the database."; // Specific message
      if (existingStats) {
        console.warn("depreciationService: No items for recalculation, using stale data.");
        currentData = existingStats;
        source = 'DATABASE (STALE - ITEM FETCH FAILED)';
      } else {
        // currentData remains defaultInitialStatsData
         source = 'DEFAULT (ERROR/NO DATA)';
      }
    }
  }
  // Internal logging of what's being returned
  const logSummary = currentData as any; // Cast to any for logging to access potential updated_at
  console.log(`\n--- depreciationService: Final Depreciation Summary to be returned (Source: ${source}) ---`);
  console.log(`Total items: ${logSummary.total_items_from_source}, Valid for calc: ${logSummary.items_with_valid_regular_price}`);
  if (logSummary.updated_at) {
      console.log(`Last Updated: ${new Date(logSummary.updated_at).toLocaleString()}`);
  }
  console.log("---------------------------------------------------------------------\n");

  return { data: currentData, source, itemFetchError: itemFetchErrorForPage };
}

// Export getCachedItems separately if SearchComponent also needs to call it directly
// or if you prefer page.tsx to fetch items for SearchComponent itself.
// For now, SearchComponent in page.tsx was calling getCachedItems from page.tsx
export { getCachedItems as getSearchComponentItems };