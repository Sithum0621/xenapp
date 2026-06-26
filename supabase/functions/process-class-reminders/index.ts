/**
 * Legacy scheduler hook for 2-hour class reminders (disabled in DB migration
 * `20260635700000_disable_class_2h_reminders.sql`).
 * Daily "Class today" notices use `process_daily_class_schedule_notifications` instead.
 *
 * Deploy:
 *   supabase functions deploy process-class-reminders --no-verify-jwt
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.8';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')?.trim();
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')?.trim();

  if (!supabaseUrl || !serviceRole) {
    return json({ error: 'server_misconfigured' }, 500);
  }

  const authHeader = req.headers.get('Authorization')?.trim();
  if (authHeader !== `Bearer ${serviceRole}`) {
    return json({ error: 'forbidden' }, 403);
  }

  let timezone = 'Asia/Colombo';
  try {
    const body = await req.json();
    if (body && typeof body.timezone === 'string' && body.timezone.trim()) {
      timezone = body.timezone.trim();
    }
  } catch {
    // empty body is fine
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await admin.rpc('process_class_start_reminders', {
    p_timezone: timezone,
  });

  if (error) {
    return json({ error: 'rpc_failed', detail: error.message }, 500);
  }

  return json({ ok: true, result: data });
});
