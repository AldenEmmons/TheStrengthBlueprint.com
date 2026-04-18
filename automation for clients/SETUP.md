# Workout Plan Automation — Setup Guide

## How It Works

```
Client fills out Google Form
        ↓
Apps Script trigger fires automatically
        ↓
Script finds their consultation notes doc in Google Drive
        ↓
Sends notes + form answers to Claude AI
        ↓
Claude writes a tailored workout plan
        ↓
Gmail draft created → you review and send
```

---

## Step 1: Create the Google Form

Go to [forms.google.com](https://forms.google.com) → Blank form. Name it **TSB Client Questionnaire**.

Add these questions in this order (exact text matters — must match the script):

| Question Text | Type |
|---|---|
| Full Name | Short answer |
| Email Address | Short answer |
| Current fitness level | Multiple choice: Beginner / Intermediate / Advanced |
| Primary goal | Multiple choice: Weight Loss / Muscle Gain / Strength / Endurance / Injury Recovery / General Health |
| Days available per week | Multiple choice: 3 / 4 / 5 / 6 / 7 |
| Equipment access | Multiple choice: Full Gym / Home Gym / Dumbbells Only / No Equipment |
| Workout duration available | Multiple choice: 30 min / 45 min / 60 min / 90 min+ |
| Any injuries or physical limitations | Paragraph |
| Anything else you want us to know | Paragraph |

---

## Step 2: Link Form to a Google Sheet

1. In the form → click **Responses** tab → click the Google Sheets icon (green)
2. Select **Create a new spreadsheet** → name it **TSB Client Questionnaire Responses**
3. Click **Create**

---

## Step 3: Add the Script

1. Open the linked spreadsheet
2. Click **Extensions** → **Apps Script**
3. Name the project **TSB Workout Plan Automation**
4. Delete any default code in `Code.gs`
5. Paste the full contents of `WorkoutPlanAutomation.gs` into `Code.gs`
6. Click **Save** (floppy disk icon)

---

## Step 4: Set Script Properties

In Apps Script: click the **gear icon (Project Settings)** → **Script Properties** → **Add script property**

| Property | Value |
|---|---|
| `CLAUDE_API_KEY` | Your Anthropic API key (get it at console.anthropic.com) |
| `CONSULTATION_NOTES_FOLDER_ID` | The ID from your Google Drive notes folder URL (see below) |
| `TRAINER_EMAIL` | `alden@youremail.com,luke@youremail.com` |
| `PLAN_EMAIL_SUBJECT` | `Your Personalized Workout Plan — The Strength Blueprint` |

**How to get your folder ID:**
1. Create a folder in Google Drive called **Consultation Notes**
2. Open it — the URL will look like: `drive.google.com/drive/folders/ABC123XYZ`
3. Copy the part after `/folders/` — that's your folder ID

---

## Step 5: Organize Your Consultation Notes Docs

Move all your existing consultation Google Docs into the **Consultation Notes** folder.

**Naming convention** (the script searches by client name):
```
Jane Smith - Consultation Notes
John Doe - Consultation Notes
```

The script will find a doc if the client's name (from the form) appears anywhere in the doc's filename.

---

## Step 6: Add the Trigger

1. In Apps Script → click the **clock icon (Triggers)** in the left sidebar
2. Click **+ Add Trigger** (bottom right)
3. Settings:
   - **Function:** `onFormSubmit`
   - **Deployment:** Head
   - **Event source:** From spreadsheet
   - **Event type:** On form submit
4. Click **Save** → authorize when prompted

---

## Step 7: Test It

1. In Apps Script → open the editor → find the `testAutomation()` function
2. Edit the fake client name to match one of your existing consultation docs
3. Click **Run** → **testAutomation**
4. Check **Gmail Drafts** — a formatted plan email should appear within ~30 seconds
5. Check your inbox — you should receive a trainer notification email

---

## Verification Checklist

- [ ] Submit a test via `testAutomation()` with a name matching a real consultation doc
- [ ] Gmail draft appears with the plan formatted correctly
- [ ] Trainer notification email received
- [ ] Submit a test with a name that has NO matching doc — draft subject should start with `[No Consult Notes Found]`
- [ ] Submit a real form response (use the form preview link) — automation fires within ~30 seconds

---

## Getting a Claude API Key

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Sign up / log in
3. Go to **API Keys** → **Create Key**
4. Copy the key and paste it into Script Properties as `CLAUDE_API_KEY`
5. You'll need to add a credit card — usage is very affordable (~$0.01–0.03 per plan generated)
