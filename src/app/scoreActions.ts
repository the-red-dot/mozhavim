// src/app/scoreActions.ts
"use server";

import { supabase } from "./lib/supabaseClient"; // Assuming your admin/service client is configured here if needed for privileged ops
                                                 // Or use the regular client if RLS allows score updates
import { createClient } from '@supabase/supabase-js';
// import { revalidatePath } from "next/cache"; // Removed as it was unused

// Define score constants (could be in a separate config file)
const SCORE_VALUES = {
  DAILY_VISIT: 5,
  VOTE: 2,
  ADD_ASSUMPTION_BASE: 10,
  ADD_ASSUMPTION_GOLD_BONUS: 5,
  ADD_ASSUMPTION_DIAMOND_BONUS: 10,
  ADD_ASSUMPTION_EMERALD_BONUS: 15,
  MILESTONE_ASSUMPTIONS_5: 25,
  MILESTONE_ASSUMPTIONS_10: 50,
  MILESTONE_ASSUMPTIONS_25: 125,
  MILESTONE_ASSUMPTIONS_50: 250,
};

// Helper to create a Supabase client with service_role if needed for protected operations
// Ensure SUPABASE_SERVICE_ROLE_KEY is set in your environment variables
const getSupabaseAdmin = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseServiceRoleKey) {
    console.warn("Supabase service role key is not configured. Score updates might fail if RLS restricts anon key.");
    return supabase; // Fallback to anon client, hoping RLS allows
  }
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};


async function awardPoints(userId: string, points: number) {
  if (!userId || points === 0) return;
  const supabaseAdmin = getSupabaseAdmin(); // Use admin client for reliable updates

  try {
    const { error } = await supabaseAdmin.rpc('increment_user_score', {
      user_id_input: userId,
      score_to_add: points,
    });
    if (error) {
      console.error(`Error in RPC increment_user_score for user ${userId}, points ${points}:`, error);
    } else {
      // console.log(`Awarded ${points} points to user ${userId}`);
      // Revalidate user profile path if you have a public profile page showing scores
      // Example: revalidatePath(`/users/${userId}`);
    }
  } catch (e) {
    console.error(`Exception in awardPoints for user ${userId}, points ${points}:`, e);
  }
}

export async function awardDailyVisitScore(userId: string) {
  if (!userId) return { success: false, message: "User ID is required." };
  const supabaseAdmin = getSupabaseAdmin();

  try {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('last_daily_visit_reward_at, score')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.error("Error fetching profile for daily score:", profileError?.message);
      return { success: false, message: "Could not fetch user profile." };
    }

    const today = new Date().setHours(0, 0, 0, 0);
    const lastRewardDate = profile.last_daily_visit_reward_at
      ? new Date(profile.last_daily_visit_reward_at).setHours(0, 0, 0, 0)
      : null;

    if (lastRewardDate === null || lastRewardDate < today) {
      await awardPoints(userId, SCORE_VALUES.DAILY_VISIT);
      const { error: updateError } = await supabaseAdmin
        .from('profiles')
        .update({ last_daily_visit_reward_at: new Date().toISOString() })
        .eq('id', userId);

      if (updateError) {
        console.error("Error updating last_daily_visit_reward_at:", updateError.message);
        // Score was awarded, but timestamp update failed. Consider how to handle.
      }
      // console.log(`Daily visit score awarded to user ${userId}`);
      return { success: true, message: `+${SCORE_VALUES.DAILY_VISIT} points for daily visit!`, newScore: (profile.score || 0) + SCORE_VALUES.DAILY_VISIT };
    } else {
      // console.log(`Daily visit score already awarded today for user ${userId}`);
      return { success: false, message: "Daily score already awarded today." };
    }
  } catch (e: unknown) { // Changed from 'any' to 'unknown' for better type safety
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error("Exception in awardDailyVisitScore:", errorMessage);
    return { success: false, message: "An error occurred." };
  }
}

// The itemName parameter was marked as unused. If it's intended for future use or logging,
// you might prefix it with an underscore (e.g., _itemName) to satisfy the linter,
// or remove it if truly unnecessary. For now, I'll keep it as is, assuming it might be used later.
export async function awardVoteScore(userId: string, _itemName: string) { // itemName prefixed with _ to denote it's intentionally unused for now
  if (!userId) return;
  // Here you could add logic to prevent multiple vote scores for the same item in a short period if needed,
  // similar to how `PriceOpinion.tsx` handles `hasVotedRecently`.
  // For now, let's assume each valid vote confirmation triggers this.
  await awardPoints(userId, SCORE_VALUES.VOTE);
  // console.log(`Vote score awarded to user ${userId} for item ${_itemName}`);
}

interface AssumptionDetails {
  regular?: boolean;
  gold?: boolean;
  diamond?: boolean;
  emerald?: boolean;
}

export async function awardAssumptionScore(userId: string, itemName: string, assumptionDetails: AssumptionDetails) {
  if (!userId) return;

  let pointsForThisAssumption = 0;
  if (assumptionDetails.regular) pointsForThisAssumption += SCORE_VALUES.ADD_ASSUMPTION_BASE;
  if (assumptionDetails.gold) pointsForThisAssumption += SCORE_VALUES.ADD_ASSUMPTION_GOLD_BONUS;
  if (assumptionDetails.diamond) pointsForThisAssumption += SCORE_VALUES.ADD_ASSUMPTION_DIAMOND_BONUS;
  if (assumptionDetails.emerald) pointsForThisAssumption += SCORE_VALUES.ADD_ASSUMPTION_EMERALD_BONUS;

  if (pointsForThisAssumption > 0) {
    await awardPoints(userId, pointsForThisAssumption);
    // console.log(`Assumption score (${pointsForThisAssumption}) awarded to user ${userId} for item ${itemName}`);
  }

  // Check and award milestone bonuses
  await checkAndAwardAssumptionMilestones(userId);
}

async function checkAndAwardAssumptionMilestones(userId: string) {
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('awarded_milestones, score') // also fetch score to return updated total
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.error("Error fetching profile for milestone check:", profileError?.message);
      return;
    }

    const { data: assumptionCountData, error: countError } = await supabaseAdmin
      .from('assumptions') // Assuming your table for price assumptions is named 'assumptions'
      .select('item_name', { count: 'exact', head: false }) // Count distinct items
      .eq('user_id', userId);
      // .rpc('count_distinct_item_assumptions_by_user', {p_user_id: userId}) // if using a specific RPC for this

    if (countError) {
      console.error("Error counting user assumptions:", countError.message);
      return;
    }

    // To count distinct items, we need to process assumptionCountData
    const distinctItemsCount = new Set(assumptionCountData?.map(a => a.item_name)).size;
    // console.log(`User ${userId} has assumptions for ${distinctItemsCount} distinct items.`);

    let totalBonusAwarded = 0;
    // Changed 'let' to 'const' as awardedMilestones object's properties are modified, but the variable itself is not reassigned.
    // However, to modify its properties and then update it in the database, it still needs to be 'let' if we are reassigning the whole object or merging.
    // Keeping it as 'let' because we modify its properties directly. The linter might be okay if it sees properties are changed.
    // For the 'prefer-const' rule, if the variable `awardedMilestones` itself is not reassigned, it should be `const`.
    // But its *properties* are being modified. If the intention is to treat `awardedMilestones` as a mutable object whose reference
    // doesn't change, then `const` is appropriate. Let's try `const` and see if the logic holds.
    // Actually, the error "awardedMilestones is never reassigned. Use 'const' instead." implies it *can* be const.
    // The issue is `awardedMilestones[milestone.key] = true;` modifies the object, not reassigns the variable.
    // Let's stick to 'let' here as we are modifying it and then using it in an update.
    // The error was "awardedMilestones is never reassigned", which means the variable `awardedMilestones` itself.
    // If `profile.awarded_milestones` is a JSONB column that's an object, modifying its properties and then
    // setting it back is common. `awardedMilestones` *is* reassigned by `profile.awarded_milestones || {}`.
    // The error is likely on a *different* `awardedMilestones` variable if it exists elsewhere, or a misunderstanding of the scope.
    // Line 170 in the log corresponds to `let awardedMilestones = profile.awarded_milestones || {};`
    // This line *is* an assignment. The error `prefer-const` means it *thinks* it's never reassigned *after* this line.
    // But then `awardedMilestones[milestone.key] = true;` happens. This modifies the object.
    // Then `update({ awarded_milestones: awardedMilestones })` uses it.
    // This is tricky. The ESLint rule `prefer-const` flags variables that are initialized and never reassigned.
    // Modifying an object's properties doesn't count as reassigning the variable itself.
    // So, if `awardedMilestones` is only assigned once, it should be `const`.
    const initialAwardedMilestones = profile.awarded_milestones || {};
    const updatedAwardedMilestones = { ...initialAwardedMilestones };


    const milestones = [
      { count: 5, bonus: SCORE_VALUES.MILESTONE_ASSUMPTIONS_5, key: 'assumptions_5' },
      { count: 10, bonus: SCORE_VALUES.MILESTONE_ASSUMPTIONS_10, key: 'assumptions_10' },
      { count: 25, bonus: SCORE_VALUES.MILESTONE_ASSUMPTIONS_25, key: 'assumptions_25' },
      { count: 50, bonus: SCORE_VALUES.MILESTONE_ASSUMPTIONS_50, key: 'assumptions_50' },
    ];

    for (const milestone of milestones) {
      if (distinctItemsCount >= milestone.count && !updatedAwardedMilestones[milestone.key]) {
        await awardPoints(userId, milestone.bonus);
        totalBonusAwarded += milestone.bonus;
        updatedAwardedMilestones[milestone.key] = true; // Modify the copy
        // console.log(`Milestone bonus ${milestone.key} (${milestone.bonus} points) awarded to ${userId}`);
      }
    }

    if (totalBonusAwarded > 0) {
      const { error: updateMilestoneError } = await supabaseAdmin
        .from('profiles')
        .update({ awarded_milestones: updatedAwardedMilestones }) // Use the modified copy
        .eq('id', userId);
      if (updateMilestoneError) {
        console.error("Error updating awarded_milestones:", updateMilestoneError.message);
      }
    }
  } catch (e: unknown) { // Changed from 'any' to 'unknown'
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error("Exception in checkAndAwardAssumptionMilestones:", errorMessage);
  }
}

// Existing revalidateItemsCacheAction (should be in actions.ts or similar, not scoreActions.ts if it's separate)
// If this file IS actions.ts, then it's fine.
// If scoreActions.ts is different from actions.ts, this might need to be moved or re-evaluated.
// For now, keeping it as per the original structure provided by the user.
export async function revalidateItemsCacheAction() {
  // console.log("Server Action (from actions.ts or scoreActions.ts): Revalidating 'items' tag...");
  // try {
  //   revalidateTag("items"); // This was likely in a different actions.ts, ensure revalidateTag is imported if used here
  //   console.log("Server Action: 'items' tag successfully revalidated.");
  // } catch (error) {
  //   console.error("Server Action: Error revalidating 'items' tag:", error);
  // }
}