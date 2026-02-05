// supabase/functions/get-leaderboards/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const { token, type, column, boat_type, min_length, max_length, limit } = await req.json();
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    let currentDeviceUID = null;
    // If token provided, get device_uid for highlighting
    if (token) {
      const { data: deviceData } = await supabase.from('devices').select('device_uid').eq('auth_token', token).single();
      if (deviceData) currentDeviceUID = deviceData.device_uid;
    }
    let result;
    if (type === 'energy') {
      // Check if this is a calculated column
      const isCalculated = column === 'mpg' || column === 'distance_per_engine_hour';
      let stats;
      if (isCalculated) {
        // For calculated columns, fetch all needed data and calculate
        const selectColumns = 'device_uid, total_distance_alltime, total_engine_fuel_gallons, engine_hours';
        const { data: rawStats, error: statsError } = await supabase.from('device_statistics').select(selectColumns);
        if (statsError) throw statsError;
        // Calculate the derived value and filter out invalid entries
        stats = rawStats.map((entry) => {
          let calculatedValue = 0;
          if (column === 'mpg') {
            // Miles per gallon = distance / fuel
            calculatedValue = entry.total_engine_fuel_gallons > 0 ? entry.total_distance_alltime / entry.total_engine_fuel_gallons : 0;
          } else if (column === 'distance_per_engine_hour') {
            // Distance per engine hour
            calculatedValue = entry.engine_hours > 0 ? entry.total_distance_alltime / entry.engine_hours : 0;
          }
          return {
            device_uid: entry.device_uid,
            [column]: calculatedValue,
            total_distance_alltime: entry.total_distance_alltime,
            total_engine_fuel_gallons: entry.total_engine_fuel_gallons,
            engine_hours: entry.engine_hours
          };
        }).filter((entry) => entry[column] > 0) // Remove zero/invalid values
          .sort((a, b) => b[column] - a[column]) // Sort descending
          .slice(0, limit || 10); // Take top N
      } else {
        // Regular columns - direct query
        const { data: regularStats, error: statsError } = await supabase.from('device_statistics').select('device_uid, ' + column).order(column, {
          ascending: false
        }).limit(limit || 10);
        if (statsError) throw statsError;
        stats = regularStats;
      }
      if (stats && stats.length > 0) {
        const deviceUids = stats.map((d) => d.device_uid);
        if (deviceUids.length > 0) {
          const { data: profiles } = await supabase
            .from('user_profiles')
            .select('device_uid, username, boat_type, boat_length_ft')
            .in('device_uid', deviceUids)
            .eq('profile_public', true);
          stats.forEach((entry) => {
            const profile = profiles?.find((p) => p.device_uid === entry.device_uid);
            if (profile) {
              entry.user_profiles = profile;
            }
          });
        }
      }
      result = {
        data: stats,
        currentDeviceUID
      };
    } else if (type === 'speed') {
      // Speed leaderboards by boat type and size
      let query = supabase
        .from('user_profiles')
        .select('device_uid, username, boat_type, boat_length_ft')
        .eq('profile_public', true);      // Only filter by boat_type if it's not 'all'
      if (boat_type && boat_type !== 'all') {
        query = query.eq('boat_type', boat_type);
      }
      query = query.lte('boat_length_ft', max_length).limit(1000);
      const { data: profiles } = await query;
      if (!profiles || profiles.length === 0) {
        result = {
          data: [],
          currentDeviceUID
        };
      } else {
        const deviceUids = profiles.map((p) => p.device_uid);
        const { data: stats } = await supabase.from('device_statistics').select('device_uid, max_speed').in('device_uid', deviceUids).order('max_speed', {
          ascending: false
        }).limit(limit || 5);
        if (stats) {
          stats.forEach((entry) => {
            const profile = profiles.find((p) => p.device_uid === entry.device_uid);
            if (profile) {
              entry.user_profiles = profile;
            }
          });
        }
        result = {
          data: stats || [],
          currentDeviceUID
        };
      }
    }
    return new Response(JSON.stringify(result), {
      status: 200,
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
