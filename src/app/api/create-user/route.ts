// src/app/api/create-user/route.ts
import { createClient, SupabaseClient, AuthError, PostgrestError, AuthApiError } from '@supabase/supabase-js'; // Added AuthApiError
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
  const headersList = await headers(); // Reverted: Added await back
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
      const threeMinutesAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();

      const { count, error: ipCheckError } = await supabaseAdmin
        .from('username_ip_registrations')
        .select('*', { count: 'exact', head: true })
        .eq('ip_hash', ipHash)
        .gte('created_at', threeMinutesAgo);

      if (ipCheckError) {
        console.error('Error checking IP registration history:', ipCheckError);
        return NextResponse.json({ error: 'שגיאת שרת במהלך בדיקת IP.' }, { status: 500 });
      }

      if (count !== null && count > 0) {
        return NextResponse.json(
          { error: 'ניסיונות רישום מרובים זוהו. אנא נסה שוב מאוחר יותר.' },
          { status: 429 }
        );
      }
    }

    const { data: usernameExists, error: rpcError } = await supabaseAdmin.rpc('check_username_exists', {
      p_username: username,
    });

    if (rpcError) {
      console.error('Error calling check_username_exists RPC:', rpcError);
      throw new Error(`RPC Error: ${rpcError.message}`); // Throw a generic error
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

  } catch (error: unknown) {
    console.error('Unhandled error in create-user route:', error);
    let errorMessage = 'אירעה שגיאה פנימית בשרת.';
    let statusCode = 500;

    if (error instanceof AuthApiError) { // Check for AuthApiError first as it has a status
        errorMessage = error.message;
        statusCode = error.status; // Safe to access status here
    } else if (error instanceof AuthError) { // Handle other AuthErrors
        errorMessage = error.message;
        // statusCode remains 500 or could be set based on specific messages below
    } else if (error instanceof PostgrestError) { // Handle PostgrestErrors
        errorMessage = error.message;
        // PostgrestError doesn't have a .status property in its type.
        // statusCode will be set by specific message checks below if applicable.
    } else if (error instanceof Error) { // Handle generic JavaScript errors
        errorMessage = error.message;
    } else if (typeof error === 'string') { // Handle cases where a string might have been thrown
        errorMessage = error;
    }
    
    // Refine messages and statusCodes based on known error message patterns
    // These checks apply after initial determination from error type
    if (typeof errorMessage === 'string') { // Ensure errorMessage is a string before .includes
        if (errorMessage.includes('duplicate key value violates unique constraint') && (errorMessage.includes('profiles_username_key') || errorMessage.includes('unique_username'))) {
            errorMessage = 'שם משתמש כבר קיים.';
            statusCode = 409; // Conflict is more appropriate
        } else if (errorMessage.includes("User already registered") || errorMessage.includes("already exists")) {
             errorMessage = 'משתמש עם אימייל זה (או שם משתמש מקושר) כבר קיים.';
             statusCode = 400;
        } else if (errorMessage.includes('check_username_exists') || errorMessage.includes('RPC Error')) {
            errorMessage = 'שגיאה בבדיקת זמינות שם המשתמש.';
            // Keep previously set statusCode or default 500
        }
    }
    
    return NextResponse.json({ error: errorMessage }, { status: statusCode });
  }
}