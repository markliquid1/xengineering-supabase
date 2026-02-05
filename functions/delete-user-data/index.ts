// supabase/functions/delete-user-data/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
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
    const { device_uid } = await req.json();
    if (!device_uid) {
      return new Response(JSON.stringify({
        success: false,
        error: 'device_uid is required'
      }), {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    const supabaseAdmin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '');
    console.log('=== DELETE USER DATA REQUEST ===');
    console.log('Device UID:', device_uid);
    // Delete device (cascades to user_profiles, device_statistics, sensor_history, etc.)
    const { error: deleteError } = await supabaseAdmin.from('devices').delete().eq('device_uid', device_uid);
    if (deleteError) {
      console.error('Device deletion error:', deleteError);
      return new Response(JSON.stringify({
        success: false,
        error: 'Failed to delete device data: ' + deleteError.message
      }), {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json'
        }
      });
    }
    console.log('Device and all associated data deleted successfully');
    return new Response(JSON.stringify({
      success: true,
      message: 'All user data deleted successfully'
    }), {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({
      success: false,
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
