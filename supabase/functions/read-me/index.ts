import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
/*
================================================================================
FORCED UPDATE ROLLOUT SQL DOCUMENTATION
================================================================================

This edge function is NOT meant to be called via HTTP.
It stores SQL query templates for managing forced firmware updates.
Run these queries directly in the Supabase SQL Editor.

================================================================================
EXAMPLE 1: Force update by hardware/battery criteria
================================================================================

-- Force update to 0.0.35 for 24V systems with old hardware
UPDATE devices 
SET 
  forced_fw_version = '0.0.35',
  forced_update_deadline = NOW() + interval '1 hour'
WHERE device_uid IN (
  SELECT device_uid 
  FROM device_config_snapshots 
  WHERE battery_voltage = 24 
    AND hardware_version = 5 
    AND firmware_version_int < 35
  ORDER BY snapshot_timestamp DESC
  LIMIT 10  -- Staggered rollout: only 10 devices
)
RETURNING device_uid, forced_fw_version, forced_update_deadline;

================================================================================
EXAMPLE 2: Force update ALL devices below a certain version
================================================================================

-- Force ALL devices below version 0.0.30 to update to 0.0.35
UPDATE devices
SET 
  forced_fw_version = '0.0.35',
  forced_update_deadline = NOW() + interval '24 hours'
WHERE 
  current_fw_version_int < 30
  AND current_fw_version_int IS NOT NULL
RETURNING device_uid, forced_fw_version, forced_update_deadline;

================================================================================
EXAMPLE 3: Staggered rollout (Phase 1, then Phase 2)
================================================================================

-- Phase 1: First 10 devices (test group)
UPDATE devices 
SET 
  forced_fw_version = '0.0.35',
  forced_update_deadline = NOW() + interval '24 hours'
WHERE 
  current_fw_version_int < 35
  AND forced_fw_version IS NULL  -- Not already targeted
LIMIT 10
RETURNING device_uid, forced_fw_version, forced_update_deadline;

-- Wait 24 hours, monitor Phase 1...

-- Phase 2: Rest of fleet (after successful Phase 1)
UPDATE devices 
SET 
  forced_fw_version = '0.0.35',
  forced_update_deadline = NOW() + interval '24 hours'
WHERE 
  current_fw_version_int < 35
  AND forced_fw_version IS NULL  -- Not already targeted
RETURNING device_uid, forced_fw_version, forced_update_deadline;

================================================================================
EXAMPLE 4: Target specific device by UID
================================================================================

-- Force update for a single device (testing)
UPDATE devices
SET 
  forced_fw_version = '0.0.35',
  forced_update_deadline = NOW() + interval '1 hour'
WHERE device_uid = 'CCBCCCCCCCCCCCCD'
RETURNING device_uid, forced_fw_version, forced_update_deadline;

================================================================================
EXAMPLE 5: Cancel forced update (abort rollout)
================================================================================

-- Cancel ALL pending forced updates
UPDATE devices
SET 
  forced_fw_version = NULL,
  forced_update_deadline = NULL
WHERE forced_fw_version IS NOT NULL
RETURNING device_uid;

-- Cancel forced update for specific devices
UPDATE devices
SET 
  forced_fw_version = NULL,
  forced_update_deadline = NULL
WHERE device_uid IN ('DEVICE_UID_1', 'DEVICE_UID_2')
RETURNING device_uid;

================================================================================
EXAMPLE 6: Extend deadline for pending updates
================================================================================

-- Give users 24 more hours
UPDATE devices
SET 
  forced_update_deadline = NOW() + interval '24 hours'
WHERE 
  forced_fw_version IS NOT NULL
  AND forced_update_deadline > NOW()  -- Only extend if not expired
RETURNING device_uid, forced_fw_version, forced_update_deadline;

================================================================================
VERIFICATION QUERIES
================================================================================

-- See all devices with pending forced updates
SELECT 
  device_uid,
  current_fw_version_int,
  forced_fw_version,
  forced_update_deadline,
  (forced_update_deadline - NOW()) as time_remaining
FROM devices
WHERE forced_fw_version IS NOT NULL
ORDER BY forced_update_deadline ASC;

-- Count devices by forced update status
SELECT 
  forced_fw_version,
  COUNT(*) as device_count,
  MIN(forced_update_deadline) as earliest_deadline,
  MAX(forced_update_deadline) as latest_deadline
FROM devices
WHERE forced_fw_version IS NOT NULL
GROUP BY forced_fw_version;

-- See devices that missed their deadline
SELECT 
  device_uid,
  forced_fw_version,
  forced_update_deadline,
  (NOW() - forced_update_deadline) as time_overdue
FROM devices
WHERE 
  forced_fw_version IS NOT NULL
  AND forced_update_deadline < NOW()
ORDER BY forced_update_deadline ASC;

================================================================================
*/ serve(async (req)=>{
  return new Response(JSON.stringify({
    error: "This function is documentation-only. Run SQL queries directly in Supabase SQL Editor.",
    note: "See function source code for SQL query templates"
  }), {
    status: 400,
    headers: {
      'Content-Type': 'application/json'
    }
  });
});
