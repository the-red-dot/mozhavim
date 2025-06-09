// src/app/actions.ts
// ─────────────────────────────────────────────────────────────
// Server Actions – on-demand cache re-validation hooks
// ─────────────────────────────────────────────────────────────
"use server";                              // ★ must be first

import { revalidateTag } from "next/cache";
import { CATALOGUE_TAG } from "./lib/itemsService";  // ← the tag used by itemsService.ts

/**
 * Re-validates every cache layer that depends on item data.
 * Currently:
 *   • `CATALOGUE_TAG`  – all `item_definitions` consumers (Tik-Sheli catalogue, etc.)
 *   • `"items"`        – legacy listings caches that still rely on this tag
 *
 * Extend this list whenever you introduce new tagged caches.
 */
export async function revalidateItemsCacheAction() {
  console.log(
    "actions.ts: starting cache re-validation for",
    `"${CATALOGUE_TAG}" + "items"`
  );

  try {
    // New catalogue-level cache (definitions)
    revalidateTag(CATALOGUE_TAG);

    // Legacy tag still in use elsewhere (listings, depreciation snapshots, …)
    revalidateTag("items");

    console.log("actions.ts: ✅ all cache tags revalidated successfully");
  } catch (err) {
    console.error("actions.ts: ❌ cache revalidation failed:", err);
    // If you want the caller to handle errors, uncomment next line:
    // throw err;
  }
}
