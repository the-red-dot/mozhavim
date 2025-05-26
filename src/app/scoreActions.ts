// src/app/scoreActions.ts
"use server";

import { supabase } from "./lib/supabaseClient";
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

const getSupabaseAdmin = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!supabaseServiceRoleKey) {
    console.warn("Supabase service role key is not configured. Score updates might fail if RLS restricts anon key.");
    return supabase; 
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
  const supabaseAdmin = getSupabaseAdmin(); 

  try {
    const { error } = await supabaseAdmin.rpc('increment_user_score', {
      user_id_input: userId,
      score_to_add: points,
    });
    if (error) {
      console.error(`Error in RPC increment_user_score for user ${userId}, points ${points}:`, error);
    } else {
      // console.log(`Awarded ${points} points to user ${userId}`);
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
      }
      return { success: true, message: `+${SCORE_VALUES.DAILY_VISIT} points for daily visit!`, newScore: (profile.score || 0) + SCORE_VALUES.DAILY_VISIT };
    } else {
      return { success: false, message: "Daily score already awarded today." };
    }
  } catch (e: unknown) { 
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error("Exception in awardDailyVisitScore:", errorMessage);
    return { success: false, message: "An error occurred." };
  }
}

// Removed the unused _itemName parameter
export async function awardVoteScore(userId: string) {
  if (!userId) return;
  await awardPoints(userId, SCORE_VALUES.VOTE);
  // console.log(`Vote score awarded to user ${userId}`); 
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

  await checkAndAwardAssumptionMilestones(userId);
}

async function checkAndAwardAssumptionMilestones(userId: string) {
  const supabaseAdmin = getSupabaseAdmin();
  try {
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('awarded_milestones, score')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      console.error("Error fetching profile for milestone check:", profileError?.message);
      return;
    }

    const { data: assumptionCountData, error: countError } = await supabaseAdmin
      .from('assumptions')
      .select('item_name', { count: 'exact', head: false })
      .eq('user_id', userId);

    if (countError) {
      console.error("Error counting user assumptions:", countError.message);
      return;
    }
    
    const distinctItemsCount = new Set(assumptionCountData?.map(a => a.item_name)).size;

    let totalBonusAwarded = 0;
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
        updatedAwardedMilestones[milestone.key] = true; 
      }
    }

    if (totalBonusAwarded > 0) {
      const { error: updateMilestoneError } = await supabaseAdmin
        .from('profiles')
        .update({ awarded_milestones: updatedAwardedMilestones }) 
        .eq('id', userId);
      if (updateMilestoneError) {
        console.error("Error updating awarded_milestones:", updateMilestoneError.message);
      }
    }
  } catch (e: unknown) { 
    const errorMessage = e instanceof Error ? e.message : String(e);
    console.error("Exception in checkAndAwardAssumptionMilestones:", errorMessage);
  }
}

export async function revalidateItemsCacheAction() {
  // This function seems to belong to a general actions file (e.g., src/app/actions.ts)
  // and would typically use revalidateTag from 'next/cache' if it's for App Router.
  // For example:
  // import { revalidateTag } from 'next/cache';
  // console.log("Server Action: Revalidating 'items' tag...");
  // try {
  //   revalidateTag("items");
  //   console.log("Server Action: 'items' tag successfully revalidated.");
  // } catch (error) {
  //   console.error("Server Action: Error revalidating 'items' tag:", error);
  // }
}