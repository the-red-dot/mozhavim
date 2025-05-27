// ────────────────────────────────────────────────────────────────
//  src/app/scoreActions.ts     (full file – replace everything)
// ────────────────────────────────────────────────────────────────
"use server";

/*---------------------------------------------------------------*
 *  ❶  FORCE THIS MODULE TO RUN IN NODEJS RUNTIME                *
 *     (Edge runtime strips un-prefixed env vars)                *
 *---------------------------------------------------------------*/
export const runtime = "nodejs";

/*---------------------------------------------------------------*
 *  ❷  ONE-OFF ENV-CHECK  (delete after scores work)             *
 *---------------------------------------------------------------*/
console.log(
  "[SCORE-ENV] service-role key present →",
  Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
);

/*---------------------------------------------------------------*
 *  ❸  IMPORTS                                                   *
 *---------------------------------------------------------------*/
import { supabase } from "./lib/supabaseClient";
import { createClient } from "@supabase/supabase-js";

/*---------------------------------------------------------------*
 *  ❹  DEBUG SHORTCUT  (delete when done)                        *
 *---------------------------------------------------------------*/
function dbg(tag: string, payload?: unknown) {
  console.log("[SCORE-DBG]", tag, payload ?? "");
}

/*---------------------------------------------------------------*
 *  ❺  SCORE CONSTANTS                                           *
 *---------------------------------------------------------------*/
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

/*---------------------------------------------------------------*
 *  ❻  ADMIN CLIENT CREATOR                                      *
 *---------------------------------------------------------------*/
const getSupabaseAdmin = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  if (!supabaseServiceRoleKey) {
    console.warn(
      "❗ SUPABASE_SERVICE_ROLE_KEY is missing – falling back to anon key"
    );
    return supabase; // ← will hit RLS unless you added a policy
  }

  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
};

/*---------------------------------------------------------------*
 *  ❼  CORE RPC WRAPPER                                          *
 *---------------------------------------------------------------*/
async function awardPoints(userId: string, points: number) {
  if (!userId || points === 0) return;

  dbg("awardPoints", { userId, points });

  const supabaseAdmin = getSupabaseAdmin();
  const { error } = await supabaseAdmin.rpc("increment_user_score", {
    user_id_input: userId,
    score_to_add: points,
  });

  if (error) {
    console.error(
      `⚠️  RPC increment_user_score failed for user ${userId}:`,
      error
    );
  }
}

/*───────────────────────────────────────────────────────────────*/
/*  ❽  DAILY VISIT                                              */
/*───────────────────────────────────────────────────────────────*/
export async function awardDailyVisitScore(userId: string) {
  dbg("dailyVisit", { userId });

  if (!userId) return { success: false, message: "User ID is required." };
  const supabaseAdmin = getSupabaseAdmin();

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("last_daily_visit_reward_at, score")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    console.error("Error fetching profile for daily score:", profileError);
    return { success: false, message: "Could not fetch user profile." };
  }

  const today = new Date().setHours(0, 0, 0, 0);
  const lastRewardDate = profile.last_daily_visit_reward_at
    ? new Date(profile.last_daily_visit_reward_at).setHours(0, 0, 0, 0)
    : null;

  if (lastRewardDate === null || lastRewardDate < today) {
    await awardPoints(userId, SCORE_VALUES.DAILY_VISIT);

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ last_daily_visit_reward_at: new Date().toISOString() })
      .eq("id", userId);

    if (updateError) {
      console.error(
        "Error updating last_daily_visit_reward_at:",
        updateError.message
      );
    }

    return {
      success: true,
      message: `+${SCORE_VALUES.DAILY_VISIT} points for daily visit!`,
      newScore: (profile.score || 0) + SCORE_VALUES.DAILY_VISIT,
    };
  }

  return { success: false, message: "Daily score already awarded today." };
}

/*───────────────────────────────────────────────────────────────*/
/*  ❾  VOTE                                                     */
/*───────────────────────────────────────────────────────────────*/
export async function awardVoteScore(userId: string) {
  dbg("vote", { userId });
  await awardPoints(userId, SCORE_VALUES.VOTE);
}

/*───────────────────────────────────────────────────────────────*/
/* 10  ASSUMPTION                                                */
/*───────────────────────────────────────────────────────────────*/
interface AssumptionDetails {
  regular?: boolean;
  gold?: boolean;
  diamond?: boolean;
  emerald?: boolean;
}

export async function awardAssumptionScore(
  userId: string,
  itemName: string,
  assumptionDetails: AssumptionDetails
) {
  dbg("assumption", { userId, itemName, assumptionDetails });

  if (!userId) return;

  let pointsForThisAssumption = 0;
  if (assumptionDetails.regular)
    pointsForThisAssumption += SCORE_VALUES.ADD_ASSUMPTION_BASE;
  if (assumptionDetails.gold)
    pointsForThisAssumption += SCORE_VALUES.ADD_ASSUMPTION_GOLD_BONUS;
  if (assumptionDetails.diamond)
    pointsForThisAssumption += SCORE_VALUES.ADD_ASSUMPTION_DIAMOND_BONUS;
  if (assumptionDetails.emerald)
    pointsForThisAssumption += SCORE_VALUES.ADD_ASSUMPTION_EMERALD_BONUS;

  if (pointsForThisAssumption > 0) {
    await awardPoints(userId, pointsForThisAssumption);
  }

  await checkAndAwardAssumptionMilestones(userId);
}

/*───────────────────────────────────────────────────────────────*/
/* 11  MILESTONES                                               */
/*───────────────────────────────────────────────────────────────*/
async function checkAndAwardAssumptionMilestones(userId: string) {
  const supabaseAdmin = getSupabaseAdmin();

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("awarded_milestones, score")
    .eq("id", userId)
    .single();

  if (profileError || !profile) {
    console.error("Error fetching profile for milestone check:", profileError);
    return;
  }

  const { data: assumptionCountData, error: countError } = await supabaseAdmin
    .from("assumptions")
    .select("item_name", { count: "exact", head: false })
    .eq("user_id", userId);

  if (countError) {
    console.error("Error counting user assumptions:", countError.message);
    return;
  }

  const distinctItemsCount = new Set(
    assumptionCountData?.map((a) => a.item_name)
  ).size;

  let totalBonusAwarded = 0;
  const initialAwardedMilestones = profile.awarded_milestones || {};
  const updatedAwardedMilestones = { ...initialAwardedMilestones };

  const milestones = [
    { count: 5, bonus: SCORE_VALUES.MILESTONE_ASSUMPTIONS_5, key: "assumptions_5" },
    { count: 10, bonus: SCORE_VALUES.MILESTONE_ASSUMPTIONS_10, key: "assumptions_10" },
    { count: 25, bonus: SCORE_VALUES.MILESTONE_ASSUMPTIONS_25, key: "assumptions_25" },
    { count: 50, bonus: SCORE_VALUES.MILESTONE_ASSUMPTIONS_50, key: "assumptions_50" },
  ];

  for (const milestone of milestones) {
    if (
      distinctItemsCount >= milestone.count &&
      !updatedAwardedMilestones[milestone.key]
    ) {
      await awardPoints(userId, milestone.bonus);
      totalBonusAwarded += milestone.bonus;
      updatedAwardedMilestones[milestone.key] = true;
    }
  }

  if (totalBonusAwarded > 0) {
    const { error: updateMilestoneError } = await supabaseAdmin
      .from("profiles")
      .update({ awarded_milestones: updatedAwardedMilestones })
      .eq("id", userId);

    if (updateMilestoneError) {
      console.error(
        "Error updating awarded_milestones:",
        updateMilestoneError.message
      );
    }
  }
}

/*───────────────────────────────────────────────────────────────*/
/* 12  *OPTIONAL* – CACHE REVALIDATION (unchanged)                */
/*───────────────────────────────────────────────────────────────*/
export async function revalidateItemsCacheAction() {
  /* left empty on purpose */
}
