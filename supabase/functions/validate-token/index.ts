// supabase/functions/validate-token/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.95.0";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};
serve(async (req)=>{
  // Handle OPTIONS request for CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders
    });
  }
  try {
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { token } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({
        valid: false,
        error: "Token required"
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // Validate token and get device
    const { data: device, error: deviceError } = await supabase.from("devices").select("device_uid, auth_token").eq("auth_token", token).single();
    if (deviceError || !device) {
      return new Response(JSON.stringify({
        valid: false,
        error: "Invalid token",
        details: deviceError?.message
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // Fetch the user profile with NEW COLUMN NAMES
    const { data: profile, error: profileError } = await supabase.from("user_profiles").select(`
        username, 
        email, 
        boat_type, 
        boat_length_ft, 
        boat_make_model, 
        boat_year, 
        home_port, 
        battery_voltage, 
        battery_capacity_ah, 
        battery_type, 
        alternator_brand_model, 
        solar_watts, 
        engine_make, 
        engine_hp,
        imu_mount_orientation,
        imu_dist_bow_ft,
        imu_dist_cl_ft,
        imu_height_wl_ft
      `).eq("device_uid", device.device_uid).single();
    if (profileError || !profile) {
      return new Response(JSON.stringify({
        valid: false,
        error: "Profile not found",
        details: profileError?.message
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    }
    // Update last_seen timestamp
    await supabase.from("devices").update({
      last_seen: new Date().toISOString()
    }).eq("device_uid", device.device_uid);
    // Return profile data
    return new Response(JSON.stringify({
      valid: true,
      registered: true,
      device_uid: device.device_uid,
      profile: profile
    }), {
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    return new Response(JSON.stringify({
      valid: false,
      error: error.message ?? String(error)
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json"
      }
    });
  }
});
