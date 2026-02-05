# Supabase Backend – Edge Functions

## Overview
This repository contains the backend logic for the cloud system using Supabase.

This includes:
- Edge Functions (API endpoints)
- Token validation
- Device registration
- Profile management
- Sensor history ingestion
- Stripe webhook handling
- Other server-side logic

This repo does NOT contain the frontend.
The frontend lives in the Vercel repository.

---

## Location

Local:
/Users/joeceo/Projects/Cloud Workspace/supabase

GitHub:
xengineering-supabase

---

## What Is An Edge Function?

An Edge Function is just a small server program that runs on Supabase.

Examples in this repo:
- validate-token
- register-device
- update-profile
- get-history
- update-sensor-history
- stripe-webhook
- etc.

Each function is a folder inside:

functions/
  validate-token/
  register-device/
  get-history/
  ...

---

## How Deployment Works

IMPORTANT: GitHub does NOT deploy functions automatically.

You must do TWO things after making changes:

1) Save changes to GitHub (backup)
2) Deploy to Supabase (make them live)

---

## Making Changes (Normal Workflow)

Step 1 — Edit a function locally

cd "/Users/joeceo/Projects/Cloud Workspace/supabase/functions/validate-token"

Edit:
index.ts

---

Step 2 — Save changes to GitHub

cd "/Users/joeceo/Projects/Cloud Workspace/supabase"

git add -A
git commit -m "Describe change"
git push

This step is ONLY for backup and version history.

---

Step 3 — Deploy to Supabase (make it live)

supabase functions deploy validate-token --use-docker

Replace "validate-token" with whichever function you edited.

---

## Why --use-docker?

Supabase sometimes fails when bundling dependencies online.

--use-docker builds the function locally first, then uploads it.

It is:
- Slower
- More reliable

Use it by default.

---

## If You Edit A Function In The Supabase Web Dashboard

GitHub will NOT automatically get those changes.

To sync dashboard edits back into this repo:

cd "/Users/joeceo/Projects/Cloud Workspace/supabase"

supabase functions download validate-token

git add -A
git commit -m "Sync from Supabase dashboard"
git push

Otherwise GitHub becomes outdated.

---

## Download All Existing Functions From Supabase

If new functions are created in the dashboard, pull them all down:

cd "/Users/joeceo/Projects/Cloud Workspace/supabase"

for f in $(supabase functions list --output json | python3 -c 'import sys,json; print("\n".join([x["slug"] for x in json.load(sys.stdin)]))'); do
  supabase functions download "$f"
done

Then commit:

git add -A
git commit -m "Sync all functions from Supabase"
git push

---

## Testing Locally (Optional)

Run functions locally:

supabase functions serve

---

## Relationship to Vercel

Frontend repo:
Cloud Workspace/vercel
GitHub: xengineering-vercel

Backend repo (this one):
Cloud Workspace/supabase
GitHub: xengineering-supabase

Vercel = UI  
Supabase = API + database
