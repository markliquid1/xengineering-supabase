import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // Initialize Supabase client with service role key (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Parse request body
    const data = await req.json();
    console.log('Received config snapshot upload request');
    console.log('Device UID received:', data.device_uid);
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
    // Validate token and get device_uid
    console.log('Querying devices table...');
    const { data: deviceData, error: deviceError } = await supabase.from('devices').select('device_uid').eq('auth_token', data.token).eq('device_uid', data.device_uid).single();
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
    // Insert config snapshot record with all explicit columns
    const { data: insertData, error: insertError } = await supabase.from('device_config_snapshots').insert({
      device_uid: device_uid,
      unix_time: data.unix_time || null,
      // System Health
      current_partition_type: data.current_partition_type ?? null,
      firmware_version_int: data.firmware_version_int ?? null,
      raw_free_heap: data.raw_free_heap ?? null,
      min_free_heap: data.min_free_heap ?? null,
      free_internal_ram: data.free_internal_ram ?? null,
      heapfrag: data.heapfrag ?? null,
      cpu_load_core0: data.cpu_load_core0 ?? null,
      cpu_load_core1: data.cpu_load_core1 ?? null,
      cpu_load_core0_max: data.cpu_load_core0_max ?? null,
      cpu_load_core1_max: data.cpu_load_core1_max ?? null,
      loop_time: data.loop_time ?? null,
      max_loop_time: data.max_loop_time ?? null,
      wifi_strength: data.wifi_strength ?? null,
      wifi_reconnects_total: data.wifi_reconnects_total ?? null,
      wifi_disconnect_count: data.wifi_disconnect_count ?? null,
      // Session Stats
      last_session_duration: data.last_session_duration ?? null,
      last_session_max_loop_time: data.last_session_max_loop_time ?? null,
      last_session_min_heap: data.last_session_min_heap ?? null,
      last_reset_reason: data.last_reset_reason ?? null,
      ancient_reset_reason: data.ancient_reset_reason ?? null,
      total_power_cycles: data.total_power_cycles ?? null,
      // Weather/Solar
      solar_watts: data.solar_watts ?? null,
      performance_ratio: data.performance_ratio ?? null,
      weather_mode_enabled: data.weather_mode_enabled ?? null,
      current_weather_mode: data.current_weather_mode ?? null,
      // Charge Settings
      float_voltage: data.float_voltage ?? null,
      bulk_voltage: data.bulk_voltage ?? null,
      bulk_complete_time: data.bulk_complete_time ?? null,
      float_duration: data.float_duration ?? null,
      temperature_limit_f: data.temperature_limit_f ?? null,
      force_float: data.force_float ?? null,
      // Control Switches
      on_off: data.on_off ?? null,
      ignition: data.ignition ?? null,
      ignition_override: data.ignition_override ?? null,
      hi_low: data.hi_low ?? null,
      amp_src: data.amp_src ?? null,
      // Field Control
      duty_step: data.duty_step ?? null,
      switching_frequency: data.switching_frequency ?? null,
      max_duty: data.max_duty ?? null,
      min_duty: data.min_duty ?? null,
      manual_duty_target: data.manual_duty_target ?? null,
      freq: data.freq ?? null,
      // Hardware Specs
      field_resistance: data.field_resistance ?? null,
      r_fixed: data.r_fixed ?? null,
      beta: data.beta ?? null,
      t0_c: data.t0_c ?? null,
      temp_source: data.temp_source ?? null,
      current_time_source: data.current_time_source ?? null,
      // Sensor Config
      sensor_upload_interval: data.sensor_upload_interval ?? null,
      buffered_record_count: data.buffered_record_count ?? null,
      battery_capacity_ah: data.battery_capacity_ah ?? null,
      peukert_rated_current_a: data.peukert_rated_current_a ?? null,
      soc_update_interval: data.soc_update_interval ?? null,
      fuel_efficiency_scaled: data.fuel_efficiency_scaled ?? null,
      battery_voltage_source: data.battery_voltage_source ?? null,
      battery_current_source: data.battery_current_source ?? null,
      // Learning System Settings
      learning_mode: data.learning_mode ?? null,
      learning_paused: data.learning_paused ?? null,
      learning_upward_enabled: data.learning_upward_enabled ?? null,
      learning_downward_enabled: data.learning_downward_enabled ?? null,
      alternator_nominal_amps: data.alternator_nominal_amps ?? null,
      learning_up_step: data.learning_up_step ?? null,
      learning_down_step: data.learning_down_step ?? null,
      ambient_temp_correction_factor: data.ambient_temp_correction_factor ?? null,
      ambient_temp_baseline: data.ambient_temp_baseline ?? null,
      min_learning_interval: data.min_learning_interval ?? null,
      safe_operation_threshold: data.safe_operation_threshold ?? null,
      last_significant_rpm_change: data.last_significant_rpm_change ?? null,
      last_stable_rpm: data.last_stable_rpm ?? null,
      learning_settling_period: data.learning_settling_period ?? null,
      learning_rpm_change_threshold: data.learning_rpm_change_threshold ?? null,
      learning_temp_hysteresis: data.learning_temp_hysteresis ?? null,
      // PID Tuning
      pid_kp: data.pid_kp ?? null,
      pid_ki: data.pid_ki ?? null,
      pid_kd: data.pid_kd ?? null,
      pid_sample_time: data.pid_sample_time ?? null,
      max_penalty_percent: data.max_penalty_percent ?? null,
      max_penalty_duration: data.max_penalty_duration ?? null,
      // Learning Diagnostics
      neighbor_learning_factor: data.neighbor_learning_factor ?? null,
      learning_rpm_spacing: data.learning_rpm_spacing ?? null,
      learning_memory_duration: data.learning_memory_duration ?? null,
      ignore_learning_during_penalty: data.ignore_learning_during_penalty ?? null,
      enable_neighbor_learning: data.enable_neighbor_learning ?? null,
      enable_ambient_correction: data.enable_ambient_correction ?? null,
      learning_failsafe_mode: data.learning_failsafe_mode ?? null,
      learning_dry_run_mode: data.learning_dry_run_mode ?? null,
      auto_save_learning_table: data.auto_save_learning_table ?? null,
      learning_table_save_interval: data.learning_table_save_interval ?? null,
      clear_overheat_history: data.clear_overheat_history ?? null,
      overheating_penalty_timer: data.overheating_penalty_timer ?? null,
      overheating_penalty_amps: data.overheating_penalty_amps ?? null,
      total_learning_events: data.total_learning_events ?? null,
      total_overheats: data.total_overheats ?? null,
      total_safe_hours: data.total_safe_hours ?? null,
      average_table_value: data.average_table_value ?? null,
      // SOC Algorithm
      auto_shunt_gain_correction: data.auto_shunt_gain_correction ?? null,
      dynamic_shunt_gain_factor: data.dynamic_shunt_gain_factor ?? null,
      auto_alt_current_zero: data.auto_alt_current_zero ?? null,
      dynamic_alt_current_zero: data.dynamic_alt_current_zero ?? null,
      current_threshold: data.current_threshold ?? null,
      peukert_exponent_scaled: data.peukert_exponent_scaled ?? null,
      charge_efficiency_scaled: data.charge_efficiency_scaled ?? null,
      charged_voltage_scaled: data.charged_voltage_scaled ?? null,
      tail_current: data.tail_current ?? null,
      shunt_resistance_micro_ohm: data.shunt_resistance_micro_ohm ?? null,
      charged_detection_time: data.charged_detection_time ?? null,
      ignore_temperature: data.ignore_temperature ?? null,
      // BMS Integration
      bms_logic: data.bms_logic ?? null,
      bms_logic_level_off: data.bms_logic_level_off ?? null,
      // Alarm Settings
      alarm_activate: data.alarm_activate ?? null,
      temp_alarm: data.temp_alarm ?? null,
      voltage_alarm_high: data.voltage_alarm_high ?? null,
      voltage_alarm_low: data.voltage_alarm_low ?? null,
      current_alarm_high: data.current_alarm_high ?? null,
      maximum_allowed_battery_amps: data.maximum_allowed_battery_amps ?? null,
      // Calibration
      four_way: data.four_way ?? null,
      rpm_scaling_factor: data.rpm_scaling_factor ?? null,
      alternator_c_offset: data.alternator_c_offset ?? null,
      battery_c_offset: data.battery_c_offset ?? null,
      time_to_full_charge_min: data.time_to_full_charge_min ?? null,
      time_to_full_discharge_min: data.time_to_full_discharge_min ?? null,
      // Engine Tracking
      engine_run_accumulator: data.engine_run_accumulator ?? null,
      alternator_on_accumulator: data.alternator_on_accumulator ?? null,
      // Temperature Sensor
      winding_temp_offset: data.winding_temp_offset ?? null,
      pulley_ratio: data.pulley_ratio ?? null,
      // Thermal Stress
      cumulative_insulation_damage: data.cumulative_insulation_damage ?? null,
      cumulative_grease_damage: data.cumulative_grease_damage ?? null,
      cumulative_brush_damage: data.cumulative_brush_damage ?? null,
      insulation_life_percent: data.insulation_life_percent ?? null,
      grease_life_percent: data.grease_life_percent ?? null,
      brush_life_percent: data.brush_life_percent ?? null,
      predicted_life_hours: data.predicted_life_hours ?? null,
      life_indicator_color: data.life_indicator_color ?? null,
      // Timing Config
      maximum_loop_time: data.maximum_loop_time ?? null,
      rpm_threshold: data.rpm_threshold ?? null,
      ve_time: data.ve_time ?? null,
      send_wifi_time: data.send_wifi_time ?? null,
      analog_read_time: data.analog_read_time ?? null,
      analog_read_time2: data.analog_read_time2 ?? null,
      web_gauges_interval: data.web_gauges_interval ?? null,
      plot_time_window: data.plot_time_window ?? null,
      healthystuff_interval: data.healthystuff_interval ?? null,
      // Authentication
      is_registered: data.is_registered === 1,
      learning_table_updated: data.learning_table_updated === 1,
      charging_enabled: data.charging_enabled === 1,
      bms_signal_active: data.bms_signal_active === 1,
      // RPM Current Table (10 values)
      rpm_current_table_0: data.rpm_current_table_0 ?? null,
      rpm_current_table_1: data.rpm_current_table_1 ?? null,
      rpm_current_table_2: data.rpm_current_table_2 ?? null,
      rpm_current_table_3: data.rpm_current_table_3 ?? null,
      rpm_current_table_4: data.rpm_current_table_4 ?? null,
      rpm_current_table_5: data.rpm_current_table_5 ?? null,
      rpm_current_table_6: data.rpm_current_table_6 ?? null,
      rpm_current_table_7: data.rpm_current_table_7 ?? null,
      rpm_current_table_8: data.rpm_current_table_8 ?? null,
      rpm_current_table_9: data.rpm_current_table_9 ?? null,
      // RPM Table Points (10 values)
      rpm_table_rpm_points_0: data.rpm_table_rpm_points_0 ?? null,
      rpm_table_rpm_points_1: data.rpm_table_rpm_points_1 ?? null,
      rpm_table_rpm_points_2: data.rpm_table_rpm_points_2 ?? null,
      rpm_table_rpm_points_3: data.rpm_table_rpm_points_3 ?? null,
      rpm_table_rpm_points_4: data.rpm_table_rpm_points_4 ?? null,
      rpm_table_rpm_points_5: data.rpm_table_rpm_points_5 ?? null,
      rpm_table_rpm_points_6: data.rpm_table_rpm_points_6 ?? null,
      rpm_table_rpm_points_7: data.rpm_table_rpm_points_7 ?? null,
      rpm_table_rpm_points_8: data.rpm_table_rpm_points_8 ?? null,
      rpm_table_rpm_points_9: data.rpm_table_rpm_points_9 ?? null,
      // Overheat Count (10 values)
      overheat_count_0: data.overheat_count_0 ?? null,
      overheat_count_1: data.overheat_count_1 ?? null,
      overheat_count_2: data.overheat_count_2 ?? null,
      overheat_count_3: data.overheat_count_3 ?? null,
      overheat_count_4: data.overheat_count_4 ?? null,
      overheat_count_5: data.overheat_count_5 ?? null,
      overheat_count_6: data.overheat_count_6 ?? null,
      overheat_count_7: data.overheat_count_7 ?? null,
      overheat_count_8: data.overheat_count_8 ?? null,
      overheat_count_9: data.overheat_count_9 ?? null,
      // Last Overheat Time (10 values)
      last_overheat_time_0: data.last_overheat_time_0 ?? null,
      last_overheat_time_1: data.last_overheat_time_1 ?? null,
      last_overheat_time_2: data.last_overheat_time_2 ?? null,
      last_overheat_time_3: data.last_overheat_time_3 ?? null,
      last_overheat_time_4: data.last_overheat_time_4 ?? null,
      last_overheat_time_5: data.last_overheat_time_5 ?? null,
      last_overheat_time_6: data.last_overheat_time_6 ?? null,
      last_overheat_time_7: data.last_overheat_time_7 ?? null,
      last_overheat_time_8: data.last_overheat_time_8 ?? null,
      last_overheat_time_9: data.last_overheat_time_9 ?? null,
      // Cumulative No Overheat Time (10 values)
      cumulative_no_overheat_time_0: data.cumulative_no_overheat_time_0 ?? null,
      cumulative_no_overheat_time_1: data.cumulative_no_overheat_time_1 ?? null,
      cumulative_no_overheat_time_2: data.cumulative_no_overheat_time_2 ?? null,
      cumulative_no_overheat_time_3: data.cumulative_no_overheat_time_3 ?? null,
      cumulative_no_overheat_time_4: data.cumulative_no_overheat_time_4 ?? null,
      cumulative_no_overheat_time_5: data.cumulative_no_overheat_time_5 ?? null,
      cumulative_no_overheat_time_6: data.cumulative_no_overheat_time_6 ?? null,
      cumulative_no_overheat_time_7: data.cumulative_no_overheat_time_7 ?? null,
      cumulative_no_overheat_time_8: data.cumulative_no_overheat_time_8 ?? null,
      cumulative_no_overheat_time_9: data.cumulative_no_overheat_time_9 ?? null
    }).select().single();
    if (insertError) {
      console.error('Insert error:', insertError);
      return new Response(JSON.stringify({
        error: 'Failed to insert config snapshot',
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
    console.log(`Successfully inserted config snapshot for device ${device_uid}`);
    console.log(`Snapshot ID: ${insertData.id}`);
    // Return success
    return new Response(JSON.stringify({
      success: true,
      message: 'Config snapshot uploaded successfully',
      snapshot_id: insertData.id,
      timestamp: insertData.snapshot_timestamp
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Unexpected error:', error);
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
