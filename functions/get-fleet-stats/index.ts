
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
Deno.serve(async (req)=>{
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    // Total Registered Devices
    const { count: totalDevices } = await supabase.from('devices').select('*', {
      count: 'exact',
      head: true
    });
    // Active Devices (Last 7 days) - Fast query using devices.last_seen
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: activeDevices } = await supabase.from('devices').select('*', {
      count: 'exact',
      head: true
    }).gte('last_seen', sevenDaysAgo);
    console.log(`Active devices: ${activeDevices}`);
    // Get all device statistics (pre-calculated cumulative values)
    const { data: deviceStats } = await supabase.from('device_statistics').select('alt_kwh_alltime, solar_kwh_alltime, total_distance_alltime, engine_hours, alternator_on_hours, total_engine_fuel_gallons, total_alternator_fuel_gallons, charged_energy_alltime, discharged_energy_alltime');
    // Sum up cumulative values
    const altEnergy = (deviceStats?.reduce((sum, s)=>sum + (s.alt_kwh_alltime ?? 0), 0) ?? 0) * 1000; // Convert to Wh
    const solarEnergy = (deviceStats?.reduce((sum, s)=>sum + (s.solar_kwh_alltime ?? 0), 0) ?? 0) * 1000;
    const totalDistance = deviceStats?.reduce((sum, s)=>sum + (s.total_distance_alltime ?? 0), 0) ?? 0;
    const engineHours = deviceStats?.reduce((sum, s)=>sum + (s.engine_hours ?? 0), 0) ?? 0;
    const altTime = deviceStats?.reduce((sum, s)=>sum + (s.alternator_on_hours ?? 0), 0) ?? 0;
    const engineFuel = deviceStats?.reduce((sum, s)=>sum + (s.total_engine_fuel_gallons ?? 0), 0) ?? 0;
    const altFuel = deviceStats?.reduce((sum, s)=>sum + (s.total_alternator_fuel_gallons ?? 0), 0) ?? 0;
    const batteryCharged = (deviceStats?.reduce((sum, s)=>sum + (s.charged_energy_alltime ?? 0), 0) ?? 0) * 1000; // Convert to Wh
    const discharged = (deviceStats?.reduce((sum, s)=>sum + (s.discharged_energy_alltime ?? 0), 0) ?? 0) * 1000;
    // Time-weighted averages (now fast - use SQL functions that query device_statistics)
    const { data: avgVoltage } = await supabase.rpc('avg_battery_voltage');
    const { data: avgSoc } = await supabase.rpc('avg_battery_soc');
    const { data: avgSpeed } = await supabase.rpc('avg_speed');
    const stats = {
      totalDevices,
      activeDevices,
      avgVoltage,
      avgSoc,
      totalDistance,
      avgSpeed,
      batteryCharged,
      discharged,
      altEnergy,
      solarEnergy,
      altFuel,
      altTime,
      engineHours,
      engineFuel
    };
    return new Response(JSON.stringify(stats), {
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
