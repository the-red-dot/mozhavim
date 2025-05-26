// src/app/context/UserContext.tsx
"use client";

import React, { createContext, useState, useContext, useEffect, ReactNode, useCallback, useRef } from "react";
import { supabase } from "../lib/supabaseClient";
import { User } from "@supabase/supabase-js"; // Removed unused Session import

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

  const currentUserIdRef = useRef<string | null>(null);

  const fetchUserProfile = useCallback(async (userId: string) => {
    setLoadingUserProfile(true);
    setProfile(prevProfile => {
        if (prevProfile?.id === userId) return prevProfile;
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
        setProfile(null);
      } else {
        setProfile(profileData as UserProfile || null);
      }
    } catch (e: unknown) { // Changed from 'any' to 'unknown'
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error(`UserContext: Exception fetching profile for user ${userId}: ${errorMessage}`, e);
      setProfile(null);
    } finally {
      setLoadingUserProfile(false);
    }
  }, []); 

  useEffect(() => {
    setLoadingUserSession(true);
    // setSessionInitiallyChecked(false); // This was already part of the onAuthStateChange logic for INITIAL_SESSION

    supabase.auth.getSession().then(async ({ data: { session }, error: sessionGetError }) => {
      if (sessionGetError) {
        console.error("UserContext: Error in initial getSession():", sessionGetError.message);
      }
      const initialUser = session?.user ?? null;
      currentUserIdRef.current = initialUser?.id ?? null;
      setUser(initialUser);
      
      if (initialUser) {
        await fetchUserProfile(initialUser.id);
      } else {
        setProfile(null);
        setLoadingUserProfile(false); 
      }
      setLoadingUserSession(false);
      if (!sessionInitiallyChecked) { // Set only if not already set by onAuthStateChange quickly
        setSessionInitiallyChecked(true);
      }
    }).catch(err => {
        const errorMessage = err instanceof Error ? err.message : String(err);
        console.error("UserContext: Catch block for initial getSession():", errorMessage);
        currentUserIdRef.current = null;
        setUser(null);
        setProfile(null);
        setLoadingUserSession(false);
        setLoadingUserProfile(false);
        if (!sessionInitiallyChecked) {
         setSessionInitiallyChecked(true);
        }
    });

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        const newAuthUser = session?.user ?? null;
        const newUserId = newAuthUser?.id ?? null;
        const previousUserId = currentUserIdRef.current;

        if (newUserId !== previousUserId) {
          setLoadingUserSession(true); 
          currentUserIdRef.current = newUserId;
          setUser(newAuthUser); 

          if (newAuthUser) {
            await fetchUserProfile(newAuthUser.id);
          } else {
            setProfile(null); 
            setLoadingUserProfile(false); 
          }
          setLoadingUserSession(false);
        } else if (newAuthUser && event === "USER_UPDATED") {
          setUser(newAuthUser); 
          await fetchUserProfile(newAuthUser.id); 
        } else if (newAuthUser && event === "TOKEN_REFRESHED") {
          setUser(newAuthUser); 
          setLoadingUserSession(false);
          setLoadingUserProfile(false);
        } else if (!newAuthUser && previousUserId) {
            currentUserIdRef.current = null;
            setUser(null);
            setProfile(null);
            setLoadingUserSession(false);
            setLoadingUserProfile(false);
        }
        
        // Ensure sessionInitiallyChecked is set reliably after the first relevant event
        if (!sessionInitiallyChecked && (event === "INITIAL_SESSION" || event === "SIGNED_IN" || (event === "SIGNED_OUT" && !newAuthUser))) {
            setSessionInitiallyChecked(true);
        }
      }
    );

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [fetchUserProfile, sessionInitiallyChecked]); // Added sessionInitiallyChecked to dependency array

  const handleLogout = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("UserContext: Error during sign out:", error.message);
      currentUserIdRef.current = null;
      setUser(null);
      setProfile(null);
      setLoadingUserSession(false);
      setLoadingUserProfile(false);
    }
  };

  const overallIsLoading = !sessionInitiallyChecked || loadingUserSession || (!!user && loadingUserProfile);
 
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