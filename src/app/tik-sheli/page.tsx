// src/app/tik-sheli/page.tsx
import TikSheliClient from "./TikSheliClient";
import { getCatalogueItems } from "../lib/itemsService";
import { fetchAndManageDepreciationStats } from "../lib/depreciationService";

export default async function TikSheliPage() {
  /* ➊ Item-catalogue — returns data from item_definitions via edge cache */
  const catalogue = await getCatalogueItems();

  const items = catalogue.map((i) => ({
    id:           i.id,
    name:         i.name,
    imageUrl:     i.imageUrl ?? "",
    // ★ now we forward the real allowedTiers array
    allowedTiers: i.allowedTiers,
  }));

  /* ➋ Depreciation averages (gold / diamond / emerald) */
  const { data: depRaw } = await fetchAndManageDepreciationStats();
  const depStatsForClient = {
    average_gold_depreciation:    depRaw.average_gold_depreciation    ?? null,
    average_diamond_depreciation: depRaw.average_diamond_depreciation ?? null,
    average_emerald_depreciation: depRaw.average_emerald_depreciation ?? null,
  };

  /* ➌ Render client component */
  return (
    <TikSheliClient
      initialItems={items}
      generalDepreciationStats={depStatsForClient}
    />
  );
}
