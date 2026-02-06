// supabase/functions/update-profile/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
serve(async (req)=>{
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const body = await req.json();
    const { device_uid, token, username, email, boat_type, boat_length_ft, boat_make_model, boat_year, home_port, battery_voltage, battery_capacity_ah, battery_type, alternator_brand_model, solar_watts, engine_make, engine_hp, imu_mount_orientation, imu_dist_bow_ft, imu_dist_cl_ft, imu_height_wl_ft } = body;
    // Validate token
    const { data: device, error: deviceError } = await supabase.from('devices').select('device_uid').eq('device_uid', device_uid).eq('auth_token', token).single();
    if (deviceError || !device) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid token'
      }), {
        status: 401,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    // Validate boat_type
    const validBoatTypes = [
      'monohull',
      'catamaran',
      'trawler',
      'powerboat',
      'other'
    ];
    if (boat_type && !validBoatTypes.includes(boat_type)) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Invalid boat type'
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    // Update profile
    const { error: updateError } = await supabase.from('user_profiles').update({
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
      imu_mount_orientation: imu_mount_orientation ?? 0,
      imu_dist_bow_ft: imu_dist_bow_ft ?? 0.0,
      imu_dist_cl_ft: imu_dist_cl_ft ?? 0.0,
      imu_height_wl_ft: imu_height_wl_ft ?? 0.0,
      updated_at: new Date().toISOString()
    }).eq('device_uid', device_uid);
    if (updateError) throw updateError;
    return new Response(JSON.stringify({
      success: true,
      message: 'Profile updated successfully'
    }), {
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    console.error('Error in update-profile:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
});
