
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
// Helper function to clean sentinel values
function cleanSentinelValue(value) {
  if (typeof value !== 'number') return value;
  // Comprehensive list of sentinel values used in the firmware
  // Includes both raw (999900) and scaled (/100 = 9999) versions
  const SENTINEL_VALUES = [
    999900,
    -999900,
    9999,
    -9999,
    99990,
    -99990 // Alternative scaling sentinel
  ];
  // Check for exact sentinel match
  if (SENTINEL_VALUES.includes(value)) {
    return null;
  }
  // Also filter any suspiciously large values that might be unscaled sentinels
  // (but avoid filtering valid large values like altitude, distance, etc.)
  if (Math.abs(value) >= 99000) {
    return null;
  }
  return value;
}
// Helper function to clean all sensor data
function cleanSensorData(data) {
  const cleaned = {};
  for(const key in data){
    if (key === 'token' || key === 'timestamp' || key === 'device_uid') {
      // Don't clean these special fields
      cleaned[key] = data[key];
    } else {
      // Clean all other numeric fields for sentinels
      cleaned[key] = cleanSentinelValue(data[key]);
    }
  }
  return cleaned;
}
Deno.serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  let rawData;
  // Separate try-catch for JSON parsing → returns 400 (client error)
  try {
    rawData = await req.json();
  } catch (parseError) {
    console.error('JSON parse error:', parseError);
    return new Response(JSON.stringify({
      error: 'Invalid JSON format',
      details: parseError.message
    }), {
      status: 400,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  }
  // Main processing try-catch → returns 500 for server errors
  try {
    // Validate JSON structure
    if (!rawData || typeof rawData !== 'object') {
      return new Response(JSON.stringify({
        error: 'Invalid JSON structure'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Initialize Supabase client with service role key (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    console.log('Received sensor upload request');
    console.log('Token received:', rawData.token);
    console.log('Device UID received:', rawData.device_uid);
    // Clean ALL sentinel values (999900, -999900, 9999, -9999, etc. → null)
    const data = cleanSensorData(rawData);
    console.log('Cleaned sentinel values from all fields');
    // Validate required fields
    if (!data.token || !data.device_uid) {
      console.error('Missing token or device_uid');
      return new Response(JSON.stringify({
        error: 'Missing auth token or device_uid'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Validate timestamp format if provided
    if (data.timestamp && isNaN(Date.parse(data.timestamp))) {
      console.error('Invalid timestamp format:', data.timestamp);
      return new Response(JSON.stringify({
        error: 'Invalid timestamp format'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Validate token and get device_uid
    console.log('Querying devices table...');
    const { data: deviceData, error: deviceError } = await supabase.from('devices').select('device_uid').eq('auth_token', data.token).eq('device_uid', data.device_uid).single();
    console.log('Device query result:', deviceData);
    console.log('Device query error:', deviceError);
    if (deviceError || !deviceData) {
      console.error('Invalid token or device_uid mismatch:', deviceError);
      return new Response(JSON.stringify({
        error: 'Invalid credentials or device mismatch'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const device_uid = deviceData.device_uid;
    console.log(`Valid token and device_uid match for device: ${device_uid}`);
    // Validate sensor data (basic sanity checks)
    // Skip validation for null values (cleaned sentinels)
    const errors = [];
    // Check that min <= avg <= max for key sensors (only if all values are non-null)
    if (data.batt_volt_min !== null && data.batt_volt_avg !== null && data.batt_volt_max !== null) {
      if (data.batt_volt_min > data.batt_volt_avg || data.batt_volt_avg > data.batt_volt_max) {
        errors.push('Invalid battery voltage range');
      }
    }
    if (data.batt_curr_min !== null && data.batt_curr_avg !== null && data.batt_curr_max !== null) {
      if (data.batt_curr_min > data.batt_curr_avg || data.batt_curr_avg > data.batt_curr_max) {
        errors.push('Invalid battery current range');
      }
    }
    if (data.soc_min !== null && data.soc_avg !== null && data.soc_max !== null) {
      if (data.soc_min > data.soc_avg || data.soc_avg > data.soc_max) {
        errors.push('Invalid SOC range');
      }
    }
    // Check reasonable ranges (only for non-null values)
    if (data.batt_volt_min !== null && (data.batt_volt_min < 0 || data.batt_volt_min > 100)) {
      errors.push('Battery voltage min out of reasonable range (0-100V)');
    }
    if (data.batt_volt_max !== null && (data.batt_volt_max < 0 || data.batt_volt_max > 100)) {
      errors.push('Battery voltage max out of reasonable range (0-100V)');
    }
    if (data.soc_min !== null && (data.soc_min < 0 || data.soc_min > 100)) {
      errors.push('SOC min out of range (0-100%)');
    }
    if (data.soc_max !== null && (data.soc_max < 0 || data.soc_max > 100)) {
      errors.push('SOC max out of range (0-100%)');
    }
    if (data.rpm_min !== null && (data.rpm_min < 0 || data.rpm_min > 10000)) {
      errors.push('RPM min out of reasonable range (0-10000)');
    }
    if (data.rpm_max !== null && (data.rpm_max < 0 || data.rpm_max > 10000)) {
      errors.push('RPM max out of reasonable range (0-10000)');
    }
    if (errors.length > 0) {
      console.error('Validation errors:', errors);
      return new Response(JSON.stringify({
        error: 'Data validation failed',
        details: errors
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Insert sensor history record with all variables
    const { data: insertData, error: insertError } = await supabase.from('sensor_history').insert({
      device_uid: device_uid,
      timestamp: data.timestamp || new Date().toISOString(),
      // Battery voltage
      batt_volt_min: data.batt_volt_min,
      batt_volt_max: data.batt_volt_max,
      batt_volt_avg: data.batt_volt_avg,
      // Battery current
      batt_curr_min: data.batt_curr_min,
      batt_curr_max: data.batt_curr_max,
      batt_curr_avg: data.batt_curr_avg,
      // Alternator current
      alt_curr_min: data.alt_curr_min,
      alt_curr_max: data.alt_curr_max,
      alt_curr_avg: data.alt_curr_avg,
      // Victron current
      victron_curr_min: data.victron_curr_min,
      victron_curr_max: data.victron_curr_max,
      victron_curr_avg: data.victron_curr_avg,
      // SOC
      soc_min: data.soc_min,
      soc_max: data.soc_max,
      soc_avg: data.soc_avg,
      // Barometric pressure
      baro_min: data.baro_min,
      baro_max: data.baro_max,
      baro_avg: data.baro_avg,
      // Alternator temperature
      alt_temp_min: data.alt_temp_min,
      alt_temp_max: data.alt_temp_max,
      alt_temp_avg: data.alt_temp_avg,
      // Thermistor temperature
      temp_therm_min: data.temp_therm_min,
      temp_therm_max: data.temp_therm_max,
      temp_therm_avg: data.temp_therm_avg,
      // Ambient temperature
      amb_temp_min: data.amb_temp_min,
      amb_temp_max: data.amb_temp_max,
      amb_temp_avg: data.amb_temp_avg,
      // RPM
      rpm_min: data.rpm_min,
      rpm_max: data.rpm_max,
      rpm_avg: data.rpm_avg,
      // WiFi strength
      wifi_str_min: data.wifi_str_min,
      wifi_str_max: data.wifi_str_max,
      wifi_str_avg: data.wifi_str_avg,
      // Duty cycle
      duty_cycle_min: data.duty_cycle_min,
      duty_cycle_max: data.duty_cycle_max,
      duty_cycle_avg: data.duty_cycle_avg,
      // Alternator zero offset
      alt_zero_min: data.alt_zero_min,
      alt_zero_max: data.alt_zero_max,
      alt_zero_avg: data.alt_zero_avg,
      // Speed over ground
      sog_min: data.sog_min,
      sog_max: data.sog_max,
      sog_avg: data.sog_avg,
      // Course over ground
      cog_min: data.cog_min,
      cog_max: data.cog_max,
      cog_avg: data.cog_avg,
      // Heading
      heading_min: data.heading_min,
      heading_max: data.heading_max,
      heading_avg: data.heading_avg,
      // Apparent wind speed
      aws_min: data.aws_min,
      aws_max: data.aws_max,
      aws_avg: data.aws_avg,
      // Apparent wind angle
      awa_min: data.awa_min,
      awa_max: data.awa_max,
      awa_avg: data.awa_avg,
      // True wind speed
      tws_min: data.tws_min,
      tws_max: data.tws_max,
      tws_avg: data.tws_avg,
      // True wind angle
      twa_min: data.twa_min,
      twa_max: data.twa_max,
      twa_avg: data.twa_avg,
      // Leeway
      leeway_min: data.leeway_min,
      leeway_max: data.leeway_max,
      leeway_avg: data.leeway_avg,
      // VMG
      vmg_min: data.vmg_min,
      vmg_max: data.vmg_max,
      vmg_avg: data.vmg_avg,
      // GPS (average only)
      lat_avg: data.lat_avg,
      lon_avg: data.lon_avg,
      // Single-value cumulative metrics
      eng_hrs: data.eng_hrs,
      eng_cycles: data.eng_cycles,
      eng_fuel: data.eng_fuel,
      alt_fuel: data.alt_fuel,
      charge_cycles: data.charge_cycles,
      total_dist: data.total_dist,
      alt_hrs: data.alt_hrs,
      // Intended upload interval (seconds) for gap detection
      intended_interval_sec: data.intended_interval_sec ?? null,
      // Learning system performance metrics
      u_target_amps_min: data.u_target_amps_min,
      u_target_amps_max: data.u_target_amps_max,
      u_target_amps_avg: data.u_target_amps_avg,
      temp_margin_min: data.temp_margin_min,
      temp_margin_max: data.temp_margin_max,
      temp_margin_avg: data.temp_margin_avg,
      total_overheats: data.total_overheats,
      total_safe_hours: data.total_safe_hours
    }).select().single();
    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(JSON.stringify({
        error: 'Failed to insert sensor data',
        details: insertError.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Update last_seen on every upload
    const { error: updateError } = await supabase.from('devices').update({
      last_seen: new Date().toISOString()
    }).eq('device_uid', device_uid);
    if (updateError) {
      console.error('Warning: Failed to update last_seen:', updateError);
    }
    // Update device_statistics with latest cumulative values
    // This keeps device_statistics in sync with ESP32's cumulative totals
    // Purpose: Fast leaderboard/fleet-stats queries without scanning sensor_history
    if (data.eng_hrs !== null || data.total_dist !== null || data.alt_curr_max !== null) {
      // Get current stats
      const { data: currentStats } = await supabase.from('device_statistics').select('*').eq('device_uid', device_uid).single();
      // Prepare update object
      const statsUpdate = {
        last_updated: new Date().toISOString()
      };
      // Update engine hours 
      if (data.eng_hrs !== null) {
        statsUpdate.engine_hours = data.eng_hrs / 3600.0;
      }
      // Update alternator on-time 
      if (data.alt_hrs !== null) {
        statsUpdate.alternator_on_hours = data.alt_hrs / 3600.0;
      }
      // Update fuel totals (cumulative from ESP32)
      if (data.eng_fuel !== null) {
        statsUpdate.total_engine_fuel_gallons = data.eng_fuel;
      }
      if (data.alt_fuel !== null) {
        statsUpdate.total_alternator_fuel_gallons = data.alt_fuel;
      }
      // Update distance (already in nm)
      if (data.total_dist !== null) {
        statsUpdate.total_distance = data.total_dist;
        statsUpdate.total_distance_alltime = data.total_dist;
      }
      // Update max alternator current
      if (data.alt_curr_max !== null && (currentStats?.max_alt_amps ?? 0) < data.alt_curr_max) {
        statsUpdate.max_alt_amps = data.alt_curr_max;
      }
      // Update max speed
      if (data.sog_max !== null && (currentStats?.max_speed ?? 0) < data.sog_max) {
        statsUpdate.max_speed = data.sog_max;
      }
      // Update peak voltage
      if (data.batt_volt_max !== null && (currentStats?.peak_voltage ?? 0) < data.batt_volt_max) {
        statsUpdate.peak_voltage = data.batt_volt_max;
      }
      // Update current SOC
      if (data.soc_avg !== null) {
        statsUpdate.current_soc = data.soc_avg;
      }
      // Update charge cycles
      if (data.charge_cycles !== null) {
        statsUpdate.charge_cycles = data.charge_cycles;
      }
      // Update sailing metrics
      if (data.sailing_days_alltime !== null) {
        statsUpdate.sailing_days_alltime = data.sailing_days_alltime;
      }
      if (data.sailing_ratio !== null) {
        statsUpdate.sailing_ratio = data.sailing_ratio;
      }
      // Update max wind speeds (true)
      if (data.tws_max !== null && (currentStats?.max_wind_speed_true_alltime ?? 0) < data.tws_max) {
        statsUpdate.max_wind_speed_true_alltime = data.tws_max;
      }
      // Update max wind speeds (apparent)
      if (data.aws_max !== null && (currentStats?.max_wind_speed_apparent_alltime ?? 0) < data.aws_max) {
        statsUpdate.max_wind_speed_apparent_alltime = data.aws_max;
      }
      // Update board temperature max
      if (data.board_temp_max !== null && (currentStats?.board_temp_max_alltime ?? -999) < data.board_temp_max) {
        statsUpdate.board_temp_max_alltime = data.board_temp_max;
      }
      // Update board temperature min
      if (data.board_temp_min !== null && (currentStats?.board_temp_min_alltime ?? 999) > data.board_temp_min) {
        statsUpdate.board_temp_min_alltime = data.board_temp_min;
      }
      // Update barometric pressure max
      if (data.baro_max !== null && (currentStats?.baro_pressure_max_alltime ?? 0) < data.baro_max) {
        statsUpdate.baro_pressure_max_alltime = data.baro_max;
      }
      // Update barometric pressure min
      if (data.baro_min !== null && (currentStats?.baro_pressure_min_alltime ?? 9999) > data.baro_min) {
        statsUpdate.baro_pressure_min_alltime = data.baro_min;
      }
      // Update consecutive days moving
      if (data.consecutive_days_moving !== null) {
        statsUpdate.consecutive_days_moving = data.consecutive_days_moving;
      }
      if (data.longest_consecutive_days_moving !== null) {
        statsUpdate.longest_consecutive_days_moving = data.longest_consecutive_days_moving;
      }
      // Calculate alternator energy - NO duty cycle needed!
      if (data.alt_curr_avg !== null && data.alt_curr_avg > 0 && data.batt_volt_avg !== null && data.intended_interval_sec !== null) {
        const interval_hours = data.intended_interval_sec / 3600.0;
        const energy_kwh = data.batt_volt_avg * data.alt_curr_avg * interval_hours / 1000.0;
        if (energy_kwh > 0) {
          statsUpdate.alt_kwh = (currentStats?.alt_kwh ?? 0) + energy_kwh;
          statsUpdate.alt_kwh_alltime = (currentStats?.alt_kwh_alltime ?? 0) + energy_kwh;
        }
      }
      // Update solar energy if provided from device
      if (data.solar_kwh_alltime !== null) {
        statsUpdate.solar_kwh_alltime = data.solar_kwh_alltime;
      }
      if (data.solar_kwh !== null) {
        statsUpdate.solar_kwh = data.solar_kwh;
      }
      // Update battery energy if provided from device
      if (data.charged_energy_alltime !== null) {
        statsUpdate.charged_energy_alltime = data.charged_energy_alltime;
      }
      if (data.discharged_energy_alltime !== null) {
        statsUpdate.discharged_energy_alltime = data.discharged_energy_alltime;
      }
      // Update time-weighted SOC aggregate for fast fleet statistics
      if (data.soc_avg_lifetime !== null && data.soc_sample_time !== null) {
        const prevSampleTime = currentStats?.lifetime_soc_sample_time ?? 0;
        const newSampleTime = data.soc_sample_time;
        const deltaTime = newSampleTime - prevSampleTime;
        if (deltaTime > 0) {
          // Calculate incremental contribution: avg_value × time_period
          const deltaWeightedSum = data.soc_avg_lifetime * deltaTime;
          statsUpdate.lifetime_soc_weighted_sum = (currentStats?.lifetime_soc_weighted_sum ?? 0) + deltaWeightedSum;
          statsUpdate.lifetime_soc_sample_time = newSampleTime;
        }
      }
      // Update time-weighted voltage aggregate
      if (data.voltage_avg_lifetime !== null && data.voltage_sample_time !== null) {
        const prevSampleTime = currentStats?.lifetime_voltage_sample_time ?? 0;
        const newSampleTime = data.voltage_sample_time;
        const deltaTime = newSampleTime - prevSampleTime;
        if (deltaTime > 0) {
          const deltaWeightedSum = data.voltage_avg_lifetime * deltaTime;
          statsUpdate.lifetime_voltage_weighted_sum = (currentStats?.lifetime_voltage_weighted_sum ?? 0) + deltaWeightedSum;
          statsUpdate.lifetime_voltage_sample_time = newSampleTime;
        }
      }
      // Update time-weighted speed aggregate
      if (data.speed_avg_lifetime !== null && data.speed_sample_time !== null) {
        const prevSampleTime = currentStats?.lifetime_speed_sample_time ?? 0;
        const newSampleTime = data.speed_sample_time;
        const deltaTime = newSampleTime - prevSampleTime;
        if (deltaTime > 0) {
          const deltaWeightedSum = data.speed_avg_lifetime * deltaTime;
          statsUpdate.lifetime_speed_weighted_sum = (currentStats?.lifetime_speed_weighted_sum ?? 0) + deltaWeightedSum;
          statsUpdate.lifetime_speed_sample_time = newSampleTime;
        }
      }
      // Upsert statistics
      const { error: statsError } = await supabase.from('device_statistics').upsert({
        device_uid: device_uid,
        ...statsUpdate
      }, {
        onConflict: 'device_uid'
      });
      if (statsError) {
        console.error('Warning: Failed to update device_statistics:', statsError);
      } else {
        console.log(`Updated statistics for device ${device_uid}`);
      }
    }
    console.log(`Successfully inserted sensor data for device ${device_uid}`);
    // Return success
    return new Response(JSON.stringify({
      success: true,
      message: 'Sensor data uploaded successfully',
      record_id: insertData.id,
      timestamp: insertData.timestamp
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    // Legitimate server errors (database connection, unexpected issues)
    console.error('Server error:', error);
    return new Response(JSON.stringify({
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
