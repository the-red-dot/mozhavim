// src/app/api/create-user/route.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { headers } from 'next/headers';
import crypto from 'crypto';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin: SupabaseClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

const getClientIp = async (): Promise<string | null> => {
  const headersList = await headers(); // Await as per TypeScript's inference in your environment
  const xForwardedFor = headersList.get('x-forwarded-for');
  if (xForwardedFor) {
    return xForwardedFor.split(',')[0].trim();
  }
  const realIp = headersList.get('x-real-ip');
  return realIp || null;
};

const hashIP = (ip: string): string => {
  return crypto.createHash('sha256').update(ip).digest('hex');
};

export async function POST(request: Request) {
  try {
    const { username, password } = await request.json();

    if (!username || !password) {
      return NextResponse.json({ error: 'שם משתמש או סיסמה חסרים.' }, { status: 400 });
    }

    const clientIp = await getClientIp();

    if (!clientIp) {
      console.warn('Could not determine client IP for rate limiting. Allowing registration for now.');
    } else {
      const ipHash = hashIP(clientIp);
      // --- MODIFIED FOR TESTING: 3 minutes instead of 7 days ---
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();

      const { count, error: ipCheckError } = await supabaseAdmin
        .from('username_ip_registrations')
        .select('*', { count: 'exact', head: true })
        .eq('ip_hash', ipHash)
        .gte('created_at', threeMinutesAgo); // Use threeMinutesAgo for check

      if (ipCheckError) {
        console.error('Error checking IP registration history:', ipCheckError);
        return NextResponse.json({ error: 'שגיאת שרת במהלך בדיקת IP.' }, { status: 500 });
      }

      if (count !== null && count > 0) {
        // --- MODIFIED USER MESSAGE: More generic ---
        return NextResponse.json(
          { error: 'ניסיונות רישום מרובים זוהו. אנא נסה שוב מאוחר יותר.' },
          { status: 429 } // 429 Too Many Requests
        );
      }
    }

    const { data: usernameExists, error: rpcError } = await supabaseAdmin.rpc('check_username_exists', {
      p_username: username,
    });

    if (rpcError) {
      console.error('Error calling check_username_exists RPC:', rpcError);
      throw rpcError;
    }
    if (usernameExists) {
      return NextResponse.json({ error: 'שם משתמש כבר קיים' }, { status: 400 });
    }

    const email = `${username}@example.com`;

    const { data: userResponse, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      user_metadata: { username: username },
      email_confirm: true,
    });

    if (createAuthError || !userResponse?.user) {
      console.error('Error creating user in Supabase Auth:', createAuthError);
      if (createAuthError?.message.includes("User already registered") || createAuthError?.message.includes("already exists")) {
        return NextResponse.json({ error: 'משתמש עם אימייל זה (או שם משתמש מקושר) כבר קיים.' }, { status: 400 });
      }
      throw createAuthError || new Error('Failed to create user in Auth.');
    }
    
    const userId = userResponse.user.id;

    const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
      id: userId,
      email: email,
      username: username,
      is_admin: false,
      updated_at: new Date().toISOString(),
    });

    if (profileError) {
      console.error('Error upserting profile:', profileError);
      await supabaseAdmin.auth.admin.deleteUser(userId);
      console.warn(`Auth user ${userId} deleted due to profile upsert failure.`);
      throw profileError;
    }

    if (clientIp) {
      const ipHash = hashIP(clientIp);
      const { error: logIpError } = await supabaseAdmin
        .from('username_ip_registrations')
        .insert({
          ip_hash: ipHash,
          user_id: userId,
        });
      if (logIpError) {
        console.error('Error logging IP registration (non-critical):', logIpError);
      }
    }

    return NextResponse.json({ message: 'המשתמש נוצר ואומת בהצלחה!', userId });

  } catch (error: any) {
    console.error('Unhandled error in create-user route:', error);
    let errorMessage = 'אירעה שגיאה פנימית בשרת.';
    if (error.message) {
        if (error.message.includes('duplicate key value violates unique constraint') && (error.message.includes('profiles_username_key') || error.message.includes('unique_username'))) {
            errorMessage = 'שם משתמש כבר קיים.';
        } else if (error.message.includes("User already registered") || error.message.includes("already exists")) {
             errorMessage = 'משתמש עם אימייל זה (או שם משתמש מקושר) כבר קיים.';
        } else if (error.message.includes('check_username_exists')) {
            errorMessage = 'שגיאה בבדיקת זמינות שם המשתמש.';
        }
    }
    const status = typeof error.status === 'number' ? error.status : 500;
    return NextResponse.json({ error: errorMessage }, { status });
  }
}