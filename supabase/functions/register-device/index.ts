// supabase/functions/register-device/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
serve(async (req)=>{
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    const body = await req.json();
    const { device_uid, username, email, boat_type, boat_length_ft, boat_make_model, boat_year, home_port, battery_voltage, battery_capacity_ah, battery_type, alternator_brand_model, solar_watts, engine_make, engine_hp, imu_mount_orientation, imu_dist_bow_ft, imu_dist_cl_ft, imu_height_wl_ft } = body;
    // Server-side validation
    if (!device_uid || !username || !email) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Missing required fields: device_uid, username, or email'
      }), {
        status: 400,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    if (username.length < 3 || username.length > 30) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Username must be between 3 and 30 characters'
      }), {
        status: 400,
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
    // 1. Check if device already registered
    const { data: existingDevice } = await supabase.from('devices').select('device_uid, auth_token').eq('device_uid', device_uid).single();
    if (existingDevice) {
      return new Response(JSON.stringify({
        success: true,
        token: existingDevice.auth_token,
        message: 'Device already registered'
      }), {
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    // 2. Check if username already taken
    const { data: existingUsername } = await supabase.from('user_profiles').select('username').eq('username', username).single();
    if (existingUsername) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Username already taken. Please choose a different username.'
      }), {
        status: 409,
        headers: {
          "Content-Type": "application/json"
        }
      });
    }
    // 3. Create device record with auto-generated token
    const { data: device, error: deviceError } = await supabase.from('devices').insert({
      device_uid: device_uid
    }).select('auth_token').single();
    if (deviceError) {
      throw new Error('Failed to create device record: ' + deviceError.message);
    }
    // 4. Create user profile
    const { error: profileError } = await supabase.from('user_profiles').insert({
      device_uid: device_uid,
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
      imu_height_wl_ft: imu_height_wl_ft ?? 0.0
    });
    if (profileError) {
      // Cleanup: delete device if profile creation fails
      await supabase.from('devices').delete().eq('device_uid', device_uid);
      throw new Error('Failed to create profile: ' + profileError.message);
    }
    // 5. Create device_statistics entry
    const { error: statsError } = await supabase.from('device_statistics').insert({
      device_uid: device_uid
    });
    if (statsError) {
      // Cleanup on stats creation failure
      await supabase.from('user_profiles').delete().eq('device_uid', device_uid);
      await supabase.from('devices').delete().eq('device_uid', device_uid);
      throw new Error('Failed to create statistics: ' + statsError.message);
    }
    // 6. Mark order_item as claimed if device_uid exists
    await supabase.from('order_items').update({
      device_claimed: true,
      device_claimed_at: new Date().toISOString(),
      registered_user_email: email
    }).eq('device_uid', device_uid).is('device_claimed', false);
    // 7. Return auth token to ESP32
    return new Response(JSON.stringify({
      success: true,
      token: device.auth_token,
      message: 'Registration successful'
    }), {
      headers: {
        "Content-Type": "application/json"
      }
    });
  } catch (error) {
    console.error('Registration error:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Registration failed. Please try again.'
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }
});
