// src/app/context/UserContext.tsx
"use client";

import React, { createContext, useState, useContext, useEffect, ReactNode, useCallback, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { User, Session } from "@supabase/supabase-js";

export type UserProfile = {
  id: string;
  email: string;
  username: string;
  is_admin: boolean;
  updated_at: string;
};

type UserContextValue = {
  user: User | null;
  profile: UserProfile | null;
  isLoading: boolean;
  sessionInitiallyChecked: boolean;
  logout: () => Promise<void>;
};

const UserContext = createContext<UserContextValue>({
  user: null,
  profile: null,
  isLoading: true,
  sessionInitiallyChecked: false,
  logout: async () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loadingUserSession, setLoadingUserSession] = useState(true);
  const [loadingUserProfile, setLoadingUserProfile] = useState(false);
  const [sessionInitiallyChecked, setSessionInitiallyChecked] = useState(false);

  // Use a ref to track the current user ID to avoid stale closures in onAuthStateChange
  const currentUserIdRef = useRef<string | null>(null);

  const fetchUserProfile = useCallback(async (userId: string) => {
    // console.log(`UserContext: Fetching profile for user ${userId}`);
    setLoadingUserProfile(true);
    // Clear profile only if the target userId is different from the current profile's userId
    // This check is more robust if profile state itself is used.
    setProfile(prevProfile => {
        if (prevProfile?.id === userId) return prevProfile; // Avoid clearing if fetching for the same profile
        return null;
    });

    try {
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (profileError) {
        console.error(`UserContext: Error fetching profile for user ${userId}: ${profileError.message}`, profileError);
        setProfile(null); // Ensure profile is null on error
      } else {
        setProfile(profileData as UserProfile || null);
      }
    } catch (e: any) {
      console.error(`UserContext: Exception fetching profile for user ${userId}: ${e.message}`, e);
      setProfile(null); // Ensure profile is null on exception
    } finally {
      setLoadingUserProfile(false);
    }
  }, []); // fetchUserProfile is stable as it doesn't depend on changing state from UserProvider scope directly

  useEffect(() => {
    // console.log("UserContext: Mounting. Setting up initial session check and auth listener.");
    setLoadingUserSession(true);
    setSessionInitiallyChecked(false);

    supabase.auth.getSession().then(async ({ data: { session }, error: sessionGetError }) => {
      if (sessionGetError) {
        console.error("UserContext: Error in initial getSession():", sessionGetError.message);
      }
      const initialUser = session?.user ?? null;
      currentUserIdRef.current = initialUser?.id ?? null; // Update ref
      setUser(initialUser);
      
      if (initialUser) {
        await fetchUserProfile(initialUser.id);
      } else {
        setProfile(null);
        setLoadingUserProfile(false);
      }
      setLoadingUserSession(false);
      setSessionInitiallyChecked(true);
    }).catch(err => {
        console.error("UserContext: Catch block for initial getSession():", err);
        currentUserIdRef.current = null; // Update ref
        setUser(null);
        setProfile(null);
        setLoadingUserSession(false);
        setLoadingUserProfile(false);
        setSessionInitiallyChecked(true);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        // console.log("UserContext: onAuthStateChange event:", event, "session:", session);
        
        const newAuthUser = session?.user ?? null;
        const newUserId = newAuthUser?.id ?? null;
        const previousUserId = currentUserIdRef.current; // Use ref for the most recent user ID

        if (newUserId !== previousUserId) {
          // console.log(`UserContext: User identity changed. Event: ${event}. From ${previousUserId} to ${newUserId}`);
          setLoadingUserSession(true); // Indicate session change processing
          currentUserIdRef.current = newUserId; // Update ref immediately
          setUser(newAuthUser); 

          if (newAuthUser) {
            await fetchUserProfile(newAuthUser.id);
          } else {
            setProfile(null); 
            setLoadingUserProfile(false); 
          }
          setLoadingUserSession(false);
        } else if (newAuthUser && event === "USER_UPDATED") {
          // console.log(`UserContext: User updated. Event: ${event}. User: ${newUserId}`);
          setUser(newAuthUser); 
          await fetchUserProfile(newAuthUser.id); 
        } else if (newAuthUser && event === "TOKEN_REFRESHED") {
          // console.log(`UserContext: Token refreshed. Event: ${event}. User: ${newUserId}`);
          setUser(newAuthUser); 
          // No need to trigger loading states if user identity is the same and profile is presumably current
          setLoadingUserSession(false);
          setLoadingUserProfile(false);
        } else if (!newAuthUser && previousUserId) {
            // This case might occur if a SIGNED_OUT event happens but newUserId was already null (e.g. multiple events)
            // console.log(`UserContext: User signed out (event without session but previous user existed). Event: ${event}`);
            currentUserIdRef.current = null;
            setUser(null);
            setProfile(null);
            setLoadingUserSession(false);
            setLoadingUserProfile(false);
        }
        
        if (!sessionInitiallyChecked && (event === "INITIAL_SESSION" || event === "SIGNED_IN" || (event === "SIGNED_OUT" && !newAuthUser))) {
            setSessionInitiallyChecked(true);
        }
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [fetchUserProfile]); // Main useEffect depends only on the stable fetchUserProfile

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("UserContext: Error during sign out:", error.message);
      // Fallback: if signOut errors, ensure states are cleared
      currentUserIdRef.current = null;
      setUser(null);
      setProfile(null);
      setLoadingUserSession(false);
      setLoadingUserProfile(false);
    }
    // onAuthStateChange will typically handle setting user to null.
  };

  const overallIsLoading = !sessionInitiallyChecked || loadingUserSession || (!!user && loadingUserProfile);

  // console.log(`UserContext Render: isLoading: ${overallIsLoading} (sessionChecked: ${sessionInitiallyChecked}, loadingSession: ${loadingUserSession}, userExists: ${!!user}, loadingProfile: ${loadingUserProfile}), User: ${user?.id}, Profile: ${profile?.username}`);
  
  return (
    <UserContext.Provider value={{
      user,
      profile,
      isLoading: overallIsLoading,
      sessionInitiallyChecked,
      logout: handleLogout,
    }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}