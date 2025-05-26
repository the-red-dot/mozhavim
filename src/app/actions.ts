// src/app/actions.ts
"use server"; // This directive must be at the very top of the file

import { revalidateTag } from "next/cache";

export async function revalidateItemsCacheAction() {
  console.log("Server Action (from actions.ts): Revalidating 'items' tag...");
  try {
    revalidateTag("items");
    console.log("Server Action (from actions.ts): 'items' tag successfully revalidated.");
  } catch (error) {
    console.error("Server Action (from actions.ts): Error revalidating 'items' tag:", error);
    // Optionally, re-throw the error if you want the calling component to handle it
    // throw new Error("Cache revalidation failed."); 
  }
}