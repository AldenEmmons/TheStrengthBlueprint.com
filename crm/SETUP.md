# TSB CRM — Setup Guide

## Step 1: Create the Google Spreadsheet

1. Go to [sheets.google.com](https://sheets.google.com) and create a new spreadsheet
2. Name it **TSB CRM Data**
3. Create three tabs: `Leads`, `Notes`, `Config`

**Leads tab — Row 1 headers (columns A–S):**
```
lead_id | first_name | last_name | email | phone | stage | source | fb_form_name | fb_ad_id | fb_lead_id | created_at | updated_at | next_followup | reminder_sent | assigned_to | pain_area | goal | notes_count | deleted
```

**Notes tab — Row 1 headers (columns A–F):**
```
note_id | lead_id | type | content | created_at | created_by
```

**Config tab — fill in these key/value rows (column A = key, column B = value):**
```
authorized_emails     | alden@youremail.com,luke@youremail.com
fb_verify_token       | tsb_webhook_verify_2026
reminder_email_to     | alden@youremail.com,luke@youremail.com
reminder_days_overdue | 1
pipeline_stages       | New Lead,Contacted,Assessment Booked,Client,Lost
CRM_APP_URL           | (fill in after deploying)
```

4. Copy the Spreadsheet ID from the URL:
   `https://docs.google.com/spreadsheets/d/**THIS_PART**/edit`

---

## Step 2: Create the Apps Script Project

1. Go to [script.google.com]https://script.google.c(om) → New Project
2. Name it **TSB CRM**
3. Delete the default `Code.gs` content
4. Create these files and paste the code from the `crm/` folder:
   - `Code.gs`
   - `LeadService.gs`
   - `NoteService.gs`
   - `FacebookWebhook.gs`
   - `ReminderService.gs`
   - `Utils.gs`
5. Create two HTML files (File → New → HTML):
   - `App.html`
   - `Unauthorized.html`

---

## Step 3: Set Script Properties

In Apps Script: **Project Settings** (gear icon) → **Script Properties** → **Add script property**

| Property | Value |
|---|---|
| `SPREADSHEET_ID` | Your spreadsheet ID from Step 1 |
| `FB_PAGE_ACCESS_TOKEN` | Leave blank for now |
| `CRM_APP_URL` | Leave blank for now |

---

## Step 4: Deploy the Web App

1. Click **Deploy** → **New Deployment**
2. Type: **Web app**
3. Settings:
   - **Execute as:** Me
   - **Who has access:** Anyone with Google Account
4. Click **Deploy** → authorize when prompted
5. Copy the web app URL
6. Go back to **Script Properties** → set `CRM_APP_URL` to that URL
7. Also update the `CRM_APP_URL` row in your Config sheet

---

## Step 5: Set Up the Daily Reminder Trigger

1. In Apps Script, click the **Triggers** (clock) icon → **Add Trigger**
2. Settings:
   - Function: `checkAndSendReminders`
   - Event source: **Time-driven**
   - Type: **Day timer**
   - Time: **8am – 9am**
3. Save

---

## Step 6: Connect Facebook Webhook (do this after deploying)

1. Go to [developers.facebook.com](https://developers.facebook.com) → your app → **Webhooks**
2. Subscribe to **Page** → field: `leadgen`
3. Callback URL: your Apps Script web app URL
4. Verify token: `tsb_webhook_verify_2026`
5. Get your Page Access Token from **Graph API Explorer**
   - Set it in Script Properties as `FB_PAGE_ACCESS_TOKEN`
   - **Set a calendar reminder every 50 days to refresh it** (expires at 60 days)
6. Test with **Lead Ads Testing Tool** in Meta Business Suite

---

## Verification Checklist

- [ ] Open web app URL — see Kanban board
- [ ] Open in incognito (non-authorized account) — see Access Denied page
- [ ] Add a lead manually — appears in New Lead column
- [ ] Drag lead to Contacted — stage updates
- [ ] Open lead detail — add a note, set follow-up date to yesterday
- [ ] Run `checkAndSendReminders()` manually in editor — receive email
- [ ] Submit Facebook test lead — appears in CRM within ~30 seconds
- [ ] Submit same test lead again — only one row in sheet (deduplication works)

---

## Zapier Fallback (if direct Facebook webhook is blocked)

1. Create a Zap: **Facebook Lead Ads** → **New Lead**
2. Action: **Webhooks by Zapier** → **POST**
3. URL: your Apps Script web app URL
4. Payload: map fields as flat JSON:
   ```json
   {
     "first_name": "...",
     "last_name": "...",
     "email": "...",
     "phone_number": "...",
     "pain_area": "...",
     "goal": "...",
     "fb_lead_id": "..."
   }
   ```
   The `doPost()` will automatically detect and route Zapier payloads.
