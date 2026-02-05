import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// Configuration
const UPLOADS_PER_DAY_REQUIRED = 120; // 10 min intervals over 20 hours
const MILES_FROM_LAND_THRESHOLD = 0.5;
const MOVEMENT_THRESHOLD_NM = 2.0; // Minimum distance to count as "moving day"
serve(async (req)=>{
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    console.log('=== CHRONO DAILY AT-SEA CHECK STARTED ===');
    console.log(`Timestamp: ${new Date().toISOString()}`);
    // Initialize Supabase client with service role key (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Get all devices
    const { data: devices, error: devicesError } = await supabase.from('devices').select('device_uid');
    if (devicesError) {
      throw new Error(`Failed to fetch devices: ${devicesError.message}`);
    }
    console.log(`Found ${devices.length} devices to check`);
    const results = {
      total_devices: devices.length,
      processed: 0,
      skipped_buffer_not_empty: 0,
      skipped_insufficient_data: 0,
      skipped_no_gps: 0,
      total_dates_checked: 0,
      streaks_incremented: 0,
      streaks_broken: 0,
      movement_streaks_incremented: 0,
      movement_streaks_broken: 0,
      errors: []
    };
    // Process each device
    for (const device of devices){
      try {
        await processDevice(supabase, device.device_uid, results);
        results.processed++;
      } catch (error) {
        console.error(`Error processing device ${device.device_uid}:`, error);
        results.errors.push({
          device_uid: device.device_uid,
          error: error.message
        });
      }
    }
    console.log('=== CHRONO DAILY AT-SEA CHECK COMPLETED ===');
    console.log('Results:', results);
    return new Response(JSON.stringify({
      success: true,
      message: 'Daily at-sea check completed',
      timestamp: new Date().toISOString(),
      results
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Fatal error in chrono function:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'Internal server error',
      details: error.message
    }), {
      status: 500,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
});
async function processDevice(supabase, device_uid, results) {
  console.log(`\n--- Processing device: ${device_uid} ---`);
  // Get the device's current statistics
  const { data: currentStats, error: statsError } = await supabase.from('device_statistics').select('*').eq('device_uid', device_uid).single();
  if (statsError) {
    // Device might not have statistics yet - create initial record
    const { error: insertError } = await supabase.from('device_statistics').insert({
      device_uid: device_uid,
      days_at_sea_alltime: 0,
      current_streak_days: 0,
      longest_streak_days: 0,
      consecutive_days_moving: 0,
      longest_consecutive_days_moving: 0,
      last_position_check_date: null
    });
    if (insertError) {
      throw new Error(`Failed to create device_statistics: ${insertError.message}`);
    }
    console.log(`Created initial statistics for ${device_uid}`);
    return; // Skip this run, will process tomorrow
  }
  // Calculate which dates need to be checked
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);
  // Start from the day after last check (or from a reasonable starting point)
  let startDate;
  if (currentStats.last_position_check_date) {
    startDate = new Date(currentStats.last_position_check_date + 'T00:00:00Z');
    startDate.setUTCDate(startDate.getUTCDate() + 1); // Day after last check
  } else {
    // First time running - start from 30 days ago or when device was created
    startDate = new Date();
    startDate.setUTCDate(startDate.getUTCDate() - 30);
    startDate.setUTCHours(0, 0, 0, 0);
  }
  // Build list of dates to check
  const datesToCheck = [];
  const checkDate = new Date(startDate);
  while(checkDate <= yesterday){
    datesToCheck.push(checkDate.toISOString().split('T')[0]);
    checkDate.setUTCDate(checkDate.getUTCDate() + 1);
  }
  if (datesToCheck.length === 0) {
    console.log(`No new dates to check for ${device_uid}`);
    return;
  }
  console.log(`Checking ${datesToCheck.length} date(s) for ${device_uid}: ${datesToCheck[0]} to ${datesToCheck[datesToCheck.length - 1]}`);
  // Process each date sequentially (important for streak logic)
  let runningStats = {
    ...currentStats
  };
  for (const dateStr of datesToCheck){
    try {
      runningStats = await processSingleDay(supabase, device_uid, dateStr, runningStats, results);
      results.total_dates_checked++;
    } catch (error) {
      console.error(`Error processing ${dateStr} for ${device_uid}:`, error);
    // Continue to next date rather than failing entire device
    }
  }
  console.log(`Completed processing ${datesToCheck.length} date(s) for ${device_uid}`);
}
async function processSingleDay(supabase, device_uid, checkDate, currentStats, results) {
  console.log(`  Checking ${checkDate}...`);
  // Get all sensor records from the check date
  const startOfDay = `${checkDate}T00:00:00Z`;
  const endOfDay = `${checkDate}T23:59:59Z`;
  const { data: sensorRecords, error: sensorError } = await supabase.from('sensor_history').select('lat_avg, lon_avg, buffered_uploads_remaining').eq('device_uid', device_uid).gte('timestamp', startOfDay).lte('timestamp', endOfDay).order('timestamp', {
    ascending: false
  });
  if (sensorError) {
    throw new Error(`Failed to fetch sensor history: ${sensorError.message}`);
  }
  console.log(`    ${sensorRecords.length} sensor records`);
  // Check 1: Is the buffer empty? (use most recent record)
  if (sensorRecords.length > 0) {
    const latestRecord = sensorRecords[0];
    if (latestRecord.buffered_uploads_remaining > 0) {
      console.log(`    Buffer not empty (${latestRecord.buffered_uploads_remaining} remaining), skipping without advancing date`);
      results.skipped_buffer_not_empty++;
      // DON'T update last_position_check_date - we need to recheck this date when buffer clears
      return currentStats; // Return unchanged stats
    }
  }
  // Check 2: Do we have enough uploads with valid GPS data?
  const recordsWithGPS = sensorRecords.filter((r)=>r.lat_avg !== null && r.lon_avg !== null && r.lat_avg !== 0 && r.lon_avg !== 0);
  console.log(`    ${recordsWithGPS.length} records with GPS (min: ${UPLOADS_PER_DAY_REQUIRED})`);
  if (recordsWithGPS.length < UPLOADS_PER_DAY_REQUIRED) {
    console.log(`    Insufficient GPS data, skipping streak update`);
    results.skipped_insufficient_data++;
    // Update last_position_check_date so we don't recheck this date
    await supabase.from('device_statistics').update({
      last_position_check_date: checkDate
    }).eq('device_uid', device_uid);
    return {
      ...currentStats,
      last_position_check_date: checkDate
    };
  }
  // Calculate total distance traveled for movement streak
  const { data: distanceRecords, error: distanceError } = await supabase.from('sensor_history').select('total_dist').eq('device_uid', device_uid).gte('timestamp', startOfDay).lte('timestamp', endOfDay).order('timestamp', {
    ascending: false
  }).limit(1);
  let totalDistanceThisDay = 0;
  if (!distanceError && distanceRecords.length > 0) {
    // Get the latest cumulative distance from this day
    const latestDistance = distanceRecords[0].total_dist;
    // Get the earliest cumulative distance from this day
    const { data: earliestRecord } = await supabase.from('sensor_history').select('total_dist').eq('device_uid', device_uid).gte('timestamp', startOfDay).lte('timestamp', endOfDay).order('timestamp', {
      ascending: true
    }).limit(1);
    if (earliestRecord && earliestRecord.length > 0) {
      totalDistanceThisDay = latestDistance - earliestRecord[0].total_dist;
    }
  }
  // Check 3: Were ALL positions at sea?
  console.log(`    Checking if ${recordsWithGPS.length} positions are at sea...`);
  const threshold_meters = MILES_FROM_LAND_THRESHOLD * 1609.34;
  const { data: nearLandPositions, error: spatialError } = await supabase.rpc('count_positions_near_land', {
    p_device_uid: device_uid,
    p_check_date: checkDate,
    p_threshold_meters: threshold_meters
  });
  if (spatialError) {
    throw new Error(`Spatial query failed: ${spatialError.message}`);
  }
  const allAtSea = nearLandPositions === 0;
  console.log(`    ${allAtSea ? '✓ All at sea' : `✗ ${nearLandPositions} position(s) near land`}`);
  // Calculate new streak values
  let newStreakDays = 0;
  let newDaysAtSeaAlltime = currentStats.days_at_sea_alltime || 0;
  let newLongestStreak = currentStats.longest_streak_days || 0;
  if (allAtSea) {
    // Increment streak
    newStreakDays = (currentStats.current_streak_days || 0) + 1;
    newDaysAtSeaAlltime++;
    if (newStreakDays > newLongestStreak) {
      newLongestStreak = newStreakDays;
    }
    results.streaks_incremented++;
  } else {
    // Break streak
    newStreakDays = 0;
    results.streaks_broken++;
  }
  // Calculate movement streak (independent of at-sea status)
  const wasMoving = totalDistanceThisDay >= MOVEMENT_THRESHOLD_NM;
  let newConsecutiveDaysMoving = 0;
  let newLongestConsecutiveDaysMoving = currentStats.longest_consecutive_days_moving || 0;
  if (wasMoving) {
    newConsecutiveDaysMoving = (currentStats.consecutive_days_moving || 0) + 1;
    if (newConsecutiveDaysMoving > newLongestConsecutiveDaysMoving) {
      newLongestConsecutiveDaysMoving = newConsecutiveDaysMoving;
    }
    results.movement_streaks_incremented++;
  } else {
    newConsecutiveDaysMoving = 0;
    results.movement_streaks_broken++;
  }
  // Update device_statistics
  const { error: updateError } = await supabase.from('device_statistics').update({
    days_at_sea_alltime: newDaysAtSeaAlltime,
    current_streak_days: newStreakDays,
    longest_streak_days: newLongestStreak,
    consecutive_days_moving: newConsecutiveDaysMoving,
    longest_consecutive_days_moving: newLongestConsecutiveDaysMoving,
    last_position_check_date: checkDate
  }).eq('device_uid', device_uid);
  if (updateError) {
    throw new Error(`Failed to update device_statistics: ${updateError.message}`);
  }
  console.log(`    Updated: ${newDaysAtSeaAlltime} days total, streak ${newStreakDays}, movement ${newConsecutiveDaysMoving}`);
  // Return updated stats for next iteration
  return {
    ...currentStats,
    days_at_sea_alltime: newDaysAtSeaAlltime,
    current_streak_days: newStreakDays,
    longest_streak_days: newLongestStreak,
    consecutive_days_moving: newConsecutiveDaysMoving,
    longest_consecutive_days_moving: newLongestConsecutiveDaysMoving,
    last_position_check_date: checkDate
  };
}
