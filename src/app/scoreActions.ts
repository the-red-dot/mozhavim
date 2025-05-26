// src/app/actions.ts (or a new dedicated scoreActions.ts)
"use server";

import { supabase } from "./lib/supabaseClient"; // Assuming your admin/service client is configured here if needed for privileged ops
                                                // Or use the regular client if RLS allows score updates
import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from "next/cache";

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
      // revalidatePath(`/users/${userId}`); // Example
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
  } catch (e: any) {
    console.error("Exception in awardDailyVisitScore:", e.message);
    return { success: false, message: "An error occurred." };
  }
}

export async function awardVoteScore(userId: string, itemName: string) {
  if (!userId) return;
  // Here you could add logic to prevent multiple vote scores for the same item in a short period if needed,
  // similar to how `PriceOpinion.tsx` handles `hasVotedRecently`.
  // For now, let's assume each valid vote confirmation triggers this.
  await awardPoints(userId, SCORE_VALUES.VOTE);
  // console.log(`Vote score awarded to user ${userId} for item ${itemName}`);
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
    let awardedMilestones = profile.awarded_milestones || {};
    const milestones = [
      { count: 5, bonus: SCORE_VALUES.MILESTONE_ASSUMPTIONS_5, key: 'assumptions_5' },
      { count: 10, bonus: SCORE_VALUES.MILESTONE_ASSUMPTIONS_10, key: 'assumptions_10' },
      { count: 25, bonus: SCORE_VALUES.MILESTONE_ASSUMPTIONS_25, key: 'assumptions_25' },
      { count: 50, bonus: SCORE_VALUES.MILESTONE_ASSUMPTIONS_50, key: 'assumptions_50' },
    ];

    for (const milestone of milestones) {
      if (distinctItemsCount >= milestone.count && !awardedMilestones[milestone.key]) {
        await awardPoints(userId, milestone.bonus);
        totalBonusAwarded += milestone.bonus;
        awardedMilestones[milestone.key] = true;
        // console.log(`Milestone bonus ${milestone.key} (${milestone.bonus} points) awarded to ${userId}`);
      }
    }

    if (totalBonusAwarded > 0) {
      const { error: updateMilestoneError } = await supabaseAdmin
        .from('profiles')
        .update({ awarded_milestones: awardedMilestones })
        .eq('id', userId);
      if (updateMilestoneError) {
        console.error("Error updating awarded_milestones:", updateMilestoneError.message);
      }
    }
  } catch (e:any) {
    console.error("Exception in checkAndAwardAssumptionMilestones:", e.message);
  }
}

// Existing revalidateItemsCacheAction (keep as is)
export async function revalidateItemsCacheAction() {
  // ... (your existing code)
}