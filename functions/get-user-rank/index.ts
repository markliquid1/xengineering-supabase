import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const { token, type, column, boat_type, min_length, max_length } = await req.json();
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    let currentDeviceUID = null;
    // Get device_uid from token
    if (token) {
      const { data: deviceData } = await supabase.from('devices').select('device_uid').eq('auth_token', token).single();
      if (deviceData) currentDeviceUID = deviceData.device_uid;
    }
    if (!currentDeviceUID) {
      return new Response(JSON.stringify({
        error: 'Invalid token'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Determine which column to order by
    let orderColumn = column || 'alt_kwh_alltime';
    if (type === 'speed') {
      orderColumn = 'max_speed';
    }
    let allEntries;
    if (type === 'energy') {
      // Check if this is a calculated column
      const isCalculated = column === 'mpg' || column === 'distance_per_engine_hour';
      let stats;
      if (isCalculated) {
        // For calculated columns, fetch all data and calculate
        const selectColumns = 'device_uid, total_distance_alltime, total_engine_fuel_gallons, engine_hours';
        const { data: rawStats, error: statsError } = await supabase.from('device_statistics').select(selectColumns);
        if (statsError) throw statsError;
        // Calculate the derived value
        stats = rawStats.map((entry)=>{
          let calculatedValue = 0;
          if (column === 'mpg') {
            calculatedValue = entry.total_engine_fuel_gallons > 0 ? entry.total_distance_alltime / entry.total_engine_fuel_gallons : 0;
          } else if (column === 'distance_per_engine_hour') {
            calculatedValue = entry.engine_hours > 0 ? entry.total_distance_alltime / entry.engine_hours : 0;
          }
          return {
            device_uid: entry.device_uid,
            [column]: calculatedValue,
            total_distance_alltime: entry.total_distance_alltime,
            total_engine_fuel_gallons: entry.total_engine_fuel_gallons,
            engine_hours: entry.engine_hours
          };
        }).filter((entry)=>entry[column] > 0).sort((a, b)=>b[column] - a[column]);
      } else {
        // Regular columns
        const { data: regularStats, error: statsError } = await supabase.from('device_statistics').select('device_uid, ' + orderColumn).order(orderColumn, {
          ascending: false
        });
        if (statsError) throw statsError;
        stats = regularStats;
      }
      if (stats && stats.length > 0) {
        const deviceUids = stats.map((d)=>d.device_uid);
        const { data: profiles } = await supabase.from('user_profiles').select('device_uid, username, boat_type, boat_length').in('device_uid', deviceUids).eq('profile_public', true);
        stats.forEach((entry)=>{
          const profile = profiles?.find((p)=>p.device_uid === entry.device_uid);
          if (profile) {
            entry.user_profiles = profile;
          }
        });
        // Filter out entries without public profiles
        allEntries = stats.filter((s)=>s.user_profiles);
      }
    } else if (type === 'speed') {
      // Speed leaderboards by boat type and size
      const { data: profiles } = await supabase.from('user_profiles').select('device_uid, username, boat_type, boat_length').eq('boat_type', boat_type).gte('boat_length', min_length || 0).lte('boat_length', max_length || 999).eq('profile_public', true);
      if (!profiles || profiles.length === 0) {
        allEntries = [];
      } else {
        const deviceUids = profiles.map((p)=>p.device_uid);
        const { data: stats } = await supabase.from('device_statistics').select('device_uid, max_speed').in('device_uid', deviceUids).order('max_speed', {
          ascending: false
        });
        if (stats) {
          stats.forEach((entry)=>{
            const profile = profiles.find((p)=>p.device_uid === entry.device_uid);
            if (profile) {
              entry.user_profiles = profile;
            }
          });
        }
        allEntries = stats || [];
      }
    }
    if (!allEntries || allEntries.length === 0) {
      return new Response(JSON.stringify({
        rank: null,
        entry: null,
        currentDeviceUID
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Find user's rank
    const userIndex = allEntries.findIndex((entry)=>entry.device_uid === currentDeviceUID);
    if (userIndex === -1) {
      return new Response(JSON.stringify({
        rank: null,
        entry: null,
        currentDeviceUID
      }), {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const rank = userIndex + 1;
    const entry = allEntries[userIndex];
    return new Response(JSON.stringify({
      rank,
      entry,
      currentDeviceUID
    }), {
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({
      error: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
