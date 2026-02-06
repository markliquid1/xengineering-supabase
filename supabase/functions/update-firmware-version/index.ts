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
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { token, firmware_version_int } = await req.json();
    console.log('Received update-firmware-version request');
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
    // Validate token and get device_uid + forced_fw_version
    console.log('Validating token...');
    const { data: deviceData, error: deviceError } = await supabase.from('devices').select('device_uid, forced_fw_version').eq('auth_token', token).single();
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
    // Parse forced version if it exists (format: "0.0.53" → 53)
    let forcedVersionInt = null;
    if (deviceData.forced_fw_version) {
      const parts = deviceData.forced_fw_version.split('.');
      forcedVersionInt = parseInt(parts[0]) * 10000 + parseInt(parts[1]) * 100 + parseInt(parts[2]);
      console.log(`Device has forced update to version ${deviceData.forced_fw_version} (${forcedVersionInt})`);
    }
    // Determine if we should clear forced update
    // Only clear if device version >= forced version
    const shouldClearForcedUpdate = forcedVersionInt && firmware_version_int >= forcedVersionInt;
    const updateData = {
      current_fw_version_int: firmware_version_int
    };
    if (shouldClearForcedUpdate) {
      updateData.forced_fw_version = null;
      updateData.forced_update_deadline = null;
      console.log(`Clearing forced update - device reached v${firmware_version_int} >= forced v${forcedVersionInt}`);
    }
    // Update firmware version and conditionally clear forced update
    const { error: updateError } = await supabase.from('devices').update(updateData).eq('device_uid', device_uid);
    if (updateError) {
      console.error('Update error:', updateError);
      return new Response(JSON.stringify({
        error: 'Failed to update firmware version',
        details: updateError.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log(`Successfully updated firmware version to ${firmware_version_int} for device ${device_uid}`);
    if (shouldClearForcedUpdate) {
      console.log(`Forced update cleared because device met or exceeded target version`);
    }
    return new Response(JSON.stringify({
      success: true
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
