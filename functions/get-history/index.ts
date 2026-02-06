
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
};
Deno.serve(async (req)=>{
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: corsHeaders
    });
  }
  try {
    // Initialize Supabase client with SERVICE ROLE key (bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    // Parse request body
    const { token } = await req.json();
    console.log('Received get-history request');
    // Validate required fields
    if (!token) {
      console.error('Missing token');
      return new Response(JSON.stringify({
        error: 'Missing auth token'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    // Validate token and get device_uid
    console.log('Validating token...');
    const { data: deviceData, error: deviceError } = await supabase.from('devices').select('device_uid').eq('auth_token', token).single();
    console.log('Device query result:', deviceData);
    console.log('Device query error:', deviceError);
    if (deviceError || !deviceData) {
      console.error('Invalid token:', deviceError);
      return new Response(JSON.stringify({
        error: 'Invalid auth token'
      }), {
        status: 401,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const device_uid = deviceData.device_uid;
    console.log(`Valid token for device: ${device_uid}`);
    // Query sensor history for THIS DEVICE ONLY - FETCH ALL RECORDS WITH PAGINATION
    const BATCH_SIZE = 1000; // Supabase default limit per request
    let allData = [];
    let offset = 0;
    let hasMore = true;
    while(hasMore){
      const { data: batchData, error: batchError } = await supabase.from('sensor_history').select(`
          timestamp,
          intended_interval_sec,
          batt_curr_min,batt_curr_max,batt_curr_avg,
          alt_curr_min,alt_curr_max,alt_curr_avg,
          victron_curr_min,victron_curr_max,victron_curr_avg,
          u_target_amps_min,u_target_amps_max,u_target_amps_avg,
          batt_volt_min,batt_volt_max,batt_volt_avg,
          soc_min,soc_max,soc_avg,
          alt_temp_min,alt_temp_max,alt_temp_avg,
          temp_therm_min,temp_therm_max,temp_therm_avg,
          amb_temp_min,amb_temp_max,amb_temp_avg,
          rpm_min,rpm_max,rpm_avg,
          duty_cycle_min,duty_cycle_max,duty_cycle_avg,
          eng_hrs,alt_hrs,
          sog_min,sog_max,sog_avg,
          aws_min,aws_max,aws_avg,
          tws_min,tws_max,tws_avg,
          vmg_min,vmg_max,vmg_avg,
          cog_min,cog_max,cog_avg,
          heading_min,heading_max,heading_avg,
          awa_min,awa_max,awa_avg,
          twa_min,twa_max,twa_avg,
          leeway_min,leeway_max,leeway_avg,
          baro_min,baro_max,baro_avg,
          temp_margin_min,temp_margin_max,temp_margin_avg,
          alt_zero_min,alt_zero_max,alt_zero_avg
        `).eq('device_uid', device_uid).order('timestamp', {
        ascending: false
      }).range(offset, offset + BATCH_SIZE - 1);
      if (batchError) {
        console.error('History query error:', batchError);
        return new Response(JSON.stringify({
          error: 'Failed to fetch sensor history',
          details: batchError.message
        }), {
          status: 500,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json'
          }
        });
      }
      if (!batchData || batchData.length === 0) {
        hasMore = false;
      } else {
        allData = allData.concat(batchData);
        console.log(`Fetched batch at offset ${offset}, got ${batchData.length} records, total so far: ${allData.length}`);
        // If we got fewer records than the batch size, we've reached the end
        if (batchData.length < BATCH_SIZE) {
          hasMore = false;
        } else {
          offset += BATCH_SIZE;
        }
      }
    }
    console.log(`Successfully fetched ${allData.length} total records for device ${device_uid}`);
    // Return sensor history data
    return new Response(JSON.stringify({
      success: true,
      data: allData
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
