// WorkoutPlanAutomation.gs
//
// Script Properties required (Project Settings → Script Properties):
//   CLAUDE_API_KEY               — Your Anthropic API key
//   TEMPLATE_SHEET_ID            — Google Sheets ID of TSB_Client_Program template
//   TRAINER_EMAIL                — Comma-separated trainer emails
//   PLAN_EMAIL_SUBJECT           — Subject line for client email
//   PLAN_DRIVE_FOLDER_ID         — (optional) Drive folder to save a copy of each plan

var F_EMAIL            = 'Email';
var F_FULL_NAME        = 'Full name';
var F_DOB              = 'Date of Birth';
var F_HEIGHT           = 'Height (e.g. 5ft 10in)';
var F_WEIGHT           = 'Current Weight (lbs)';
var F_JOB              = 'My job is primarily';
var F_SITTING          = 'Approximately how many hours per day are you sitting?';
var F_CONDITIONS       = 'Have you ever been diagnosed with any of the following? (Check all that apply)';
var F_MEDICATIONS      = 'Are you currently taking any medications prescribed by a doctor?';
var F_SURGERIES        = 'Have you had any surgeries';
var F_PAIN_AREAS       = 'If yes -- which area(s) are affected? (Check all that apply)';
var F_PAIN_DETAIL      = 'For each area affected, describe: pain level at rest (0-10), pain during activity (0-10), how long you have had it, what makes it better, and what makes it worse.\nExample: Left knee -- 2/10 at rest, 6/10 going up stairs, 6 months, better with ice, worse with squatting. Skip if no current pain.';
var F_TRAINING_LENGTH  = 'How long have you been training consistently?';
var F_TRAINING_TYPES   = 'What type(s) of training have you done most? (Check all that apply)';
var F_SESSION_DURATION = 'How long are your typical training sessions?';
var F_COACH_BEFORE     = 'Have you worked with a personal trainer or coach before?';
var F_EQUIPMENT        = 'What equipment do you currently have access to? (Check all that apply)';
var F_PRIMARY_GOAL     = 'What is your PRIMARY goal right now';
var F_GOAL_DETAIL      = 'Describe your primary goal in your own words \u2013 be as specific as possible:';
var F_SECONDARY_GOAL   = 'What is your secondary goal (if any)';
var F_SUCCESS_90       = 'What does success look like for you in 90 days? Be specific:';
var F_MOTIVATION       = 'How motivated are you right now to make a real change?';
var F_BARRIERS         = 'What has stopped you from reaching your goals in the past? Be honest:';
var F_TRAIN_TIME       = 'What time of day do you prefer to train?';
var F_NUTRITION        = 'What is your current nutrition approach?';
var F_PROTEIN          = 'Approximately how much protein do you eat per day?';
var F_SLEEP            = 'Average hours of sleep per night:';
var F_STRESS           = 'Average daily stress level:';
var F_FINAL_NOTES      = 'Is there anything about your health, history, lifestyle, or goals not covered above that your coach should know?';

var DAY_HEADER_ROWS   = [7,  20, 33, 46];
var DAY_EXERCISE_ROWS = [10, 23, 36, 49];


function onFormSubmit(e) {
  try {
    var answers = parseFormAnswers(e);
    Logger.log('Form submitted by: ' + answers.fullName + ' <' + answers.email + '>');
    var planJSON = generateWorkoutPlanJSON(answers);
    var xlsxBlob = fillTemplateWithPlan(answers, planJSON);
    createPlanDraft(answers.email, answers.fullName, planJSON, xlsxBlob);
    Logger.log('Draft created successfully for ' + answers.fullName);
  } catch (err) {
    Logger.log('onFormSubmit error: ' + err.message);
    notifyTrainerOfError(err.message);
  }
}


function parseFormAnswers(e) {
  var nv = e.namedValues;
  function get(field) {
    var val = nv[field];
    return (val && val[0]) ? val[0].trim() : '';
  }
  return {
    email:           get(F_EMAIL),
    fullName:        get(F_FULL_NAME),
    dob:             get(F_DOB),
    height:          get(F_HEIGHT),
    weight:          get(F_WEIGHT),
    job:             get(F_JOB),
    sitting:         get(F_SITTING),
    conditions:      get(F_CONDITIONS),
    medications:     get(F_MEDICATIONS),
    surgeries:       get(F_SURGERIES),
    painAreas:       get(F_PAIN_AREAS),
    painDetail:      get(F_PAIN_DETAIL),
    trainingLength:  get(F_TRAINING_LENGTH),
    trainingTypes:   get(F_TRAINING_TYPES),
    sessionDuration: get(F_SESSION_DURATION),
    coachBefore:     get(F_COACH_BEFORE),
    equipment:       get(F_EQUIPMENT),
    primaryGoal:     get(F_PRIMARY_GOAL),
    goalDetail:      get(F_GOAL_DETAIL),
    secondaryGoal:   get(F_SECONDARY_GOAL),
    success90:       get(F_SUCCESS_90),
    motivation:      get(F_MOTIVATION),
    barriers:        get(F_BARRIERS),
    trainTime:       get(F_TRAIN_TIME),
    nutrition:       get(F_NUTRITION),
    protein:         get(F_PROTEIN),
    sleep:           get(F_SLEEP),
    stress:          get(F_STRESS),
    finalNotes:      get(F_FINAL_NOTES)
  };
}


function generateWorkoutPlanJSON(answers) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (!apiKey) throw new Error('CLAUDE_API_KEY not set in Script Properties');

  var prompt = buildPrompt(answers);
  var payload = {
    model: 'claude-sonnet-4-6',
    max_tokens: 8192,
    messages: [{ role: 'user', content: prompt }]
  };
  var options = {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };

  var response     = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', options);
  var responseCode = response.getResponseCode();
  var responseText = response.getContentText();
  if (responseCode !== 200) throw new Error('Claude API error ' + responseCode + ': ' + responseText);

  var rawText  = JSON.parse(responseText).content[0].text;
  var jsonText = rawText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  try {
    return JSON.parse(jsonText);
  } catch (err) {
    throw new Error('Could not parse Claude JSON: ' + err.message + '\nRaw: ' + rawText.substr(0, 300));
  }
}


function buildPrompt(answers) {
  var parts = [];

  parts.push(
    'You are a professional personal trainer at The Strength Blueprint. ' +
    'Create a personalized 4-week monthly training program for the client below. ' +
    'This is a month-to-month coaching program — do NOT reference 12 weeks or long-term periodization. ' +
    'Return ONLY valid JSON — no preamble, no explanation, no markdown fences.\n\n' +
    'The program has EXACTLY 4 training days: Day A (Monday), Day B (Wednesday), Day C (Friday), Day D (Saturday). ' +
    'You MUST return all 4 days — no exceptions.\n\n' +
    'JSON structure:\n' +
    '{\n' +
    '  "intro": "2-3 sentence personal intro referencing their specific goal, history, and situation. Do not mention weeks beyond 4.",\n' +
    '  "days": [\n' +
    '    {\n' +
    '      "label": "DAY A — Lower (Squat Focus)  |  Monday",\n' +
    '      "exercises": [\n' +
    '        { "name": "Foam Roll / Inhibit: Hip Flexors", "cue": "45-60 sec per side", "sets": "-", "reps": "-", "rir": "-" },\n' +
    '        { "name": "Barbell Back Squat", "cue": "Brace, hips back, knees track toes", "sets": 4, "reps": "4-6", "rir": "2" }\n' +
    '      ]\n' +
    '    },\n' +
    '    {\n' +
    '      "label": "DAY B — Upper (Press Focus)  |  Wednesday",\n' +
    '      "exercises": [ ... 6-8 exercises ... ]\n' +
    '    },\n' +
    '    {\n' +
    '      "label": "DAY C — Lower (Hip Hinge)  |  Friday",\n' +
    '      "exercises": [ ... 6-8 exercises ... ]\n' +
    '    },\n' +
    '    {\n' +
    '      "label": "DAY D — Upper (Pull Focus)  |  Saturday",\n' +
    '      "exercises": [ ... 6-8 exercises ... ]\n' +
    '    }\n' +
    '  ],\n' +
    '  "closing": "Motivational closing note for this month"\n' +
    '}\n\n' +
    'Rules:\n' +
    '- EXACTLY 4 days in the array (Day A Monday, Day B Wednesday, Day C Friday, Day D Saturday).\n' +
    '- 6-8 exercises per day. First 1-2 = warmup/corrective/mobility (sets/reps/rir = "-").\n' +
    '- Adjust exercises around any pain areas or injuries listed below.\n' +
    '- Match equipment to what the client has available.\n' +
    '- cue = short coaching cue or tempo.\n' +
    '- sets = number for working sets, "-" for warmup.\n' +
    '- reps = string like "6-8", "10/leg", "15", or "-".\n' +
    '- rir = string like "2", "1", or "-" for warmup.\n' +
    '- Return ONLY the JSON. Nothing else.'
  );

  parts.push('\n## PERSONAL INFO');
  parts.push('Name: ' + answers.fullName);
  if (answers.dob)     parts.push('Date of Birth: ' + answers.dob);
  if (answers.height)  parts.push('Height: ' + answers.height);
  if (answers.weight)  parts.push('Weight: ' + answers.weight + ' lbs');
  if (answers.job)     parts.push('Job (activity level): ' + answers.job);
  if (answers.sitting) parts.push('Hours sitting per day: ' + answers.sitting);

  parts.push('\n## MEDICAL HISTORY');
  if (answers.conditions)  parts.push('Conditions: ' + answers.conditions);
  if (answers.medications) parts.push('Medications: ' + answers.medications);
  if (answers.surgeries)   parts.push('Surgeries: ' + answers.surgeries);

  parts.push('\n## PAIN & INJURIES');
  if (answers.painAreas)  parts.push('Pain areas: ' + answers.painAreas);
  if (answers.painDetail) parts.push('Pain detail: ' + answers.painDetail);

  parts.push('\n## TRAINING HISTORY');
  if (answers.trainingLength)  parts.push('Training consistently for: ' + answers.trainingLength);
  if (answers.trainingTypes)   parts.push('Training types: ' + answers.trainingTypes);
  if (answers.sessionDuration) parts.push('Typical session length: ' + answers.sessionDuration);
  if (answers.coachBefore)     parts.push('Worked with coach before: ' + answers.coachBefore);
  if (answers.equipment)       parts.push('Equipment available: ' + answers.equipment);

  parts.push('\n## GOALS');
  if (answers.primaryGoal)   parts.push('Primary goal: ' + answers.primaryGoal);
  if (answers.goalDetail)    parts.push('Goal detail: ' + answers.goalDetail);
  if (answers.secondaryGoal) parts.push('Secondary goal: ' + answers.secondaryGoal);
  if (answers.success90)     parts.push('90-day success looks like: ' + answers.success90);
  if (answers.motivation)    parts.push('Motivation (1-10): ' + answers.motivation);
  if (answers.barriers)      parts.push('Past barriers: ' + answers.barriers);
  if (answers.trainTime)     parts.push('Preferred training time: ' + answers.trainTime);

  parts.push('\n## NUTRITION & LIFESTYLE');
  if (answers.nutrition) parts.push('Nutrition approach: ' + answers.nutrition);
  if (answers.protein)   parts.push('Daily protein: ' + answers.protein);
  if (answers.sleep)     parts.push('Sleep (hrs/night): ' + answers.sleep);
  if (answers.stress)    parts.push('Stress level (1-10): ' + answers.stress);

  if (answers.finalNotes) {
    parts.push('\n## ADDITIONAL NOTES FROM CLIENT');
    parts.push(answers.finalNotes);
  }

  return parts.join('\n');
}


function fillTemplateWithPlan(answers, planJSON) {
  var templateId = PropertiesService.getScriptProperties().getProperty('TEMPLATE_SHEET_ID');
  if (!templateId) throw new Error('TEMPLATE_SHEET_ID not set in Script Properties');

  var copy = DriveApp.getFileById(templateId).makeCopy(answers.fullName + ' — Workout Program');
  var ss   = SpreadsheetApp.openById(copy.getId());

  var ci = ss.getSheetByName('📋 Client Info');
  if (ci) {
    ci.getRange('C5').setValue(answers.fullName);
    if (answers.dob)   ci.getRange('C6').setValue(answers.dob);
    if (answers.email) ci.getRange('C7').setValue(answers.email);
    ci.getRange('C9').setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/dd/yyyy'));

    var goalFull = answers.primaryGoal;
    if (answers.goalDetail) goalFull += ' — ' + answers.goalDetail;
    if (goalFull) ci.getRange('G6').setValue(goalFull);

    if (answers.trainTime)       ci.getRange('G9').setValue(answers.trainTime);
    if (answers.sessionDuration) ci.getRange('G10').setValue(answers.sessionDuration);

    if (answers.painAreas)   ci.getRange('C13').setValue(answers.painAreas);
    if (answers.surgeries)   ci.getRange('C14').setValue(answers.surgeries);
    if (answers.medications) ci.getRange('C15').setValue(answers.medications);
    if (answers.conditions)  ci.getRange('C18').setValue(answers.conditions);
    if (answers.job)         ci.getRange('C19').setValue(answers.job);
  }

  var prog = ss.getSheetByName('🏋️ Program');
  if (!prog) throw new Error('Could not find "🏋️ Program" tab in template');

  var days = planJSON.days || [];
  for (var d = 0; d < Math.min(days.length, 4); d++) {
    var day      = days[d];
    var hRow     = DAY_HEADER_ROWS[d];
    var startRow = DAY_EXERCISE_ROWS[d];

    prog.getRange(hRow, 1).setValue('  ' + (day.label || ''));

    var exercises = day.exercises || [];
    for (var ex = 0; ex < Math.min(exercises.length, 8); ex++) {
      var e   = exercises[ex];
      var row = startRow + ex;
      prog.getRange(row, 1).setValue(ex + 1);
      prog.getRange(row, 2).setValue(e.name || '');
      prog.getRange(row, 3).setValue(e.cue  || '');
      prog.getRange(row, 4).setValue(e.sets || '');
      prog.getRange(row, 5).setValue(e.reps || '');
      prog.getRange(row, 6).setValue('');
      prog.getRange(row, 7).setValue(e.rir  || '');
    }
  }

  SpreadsheetApp.flush();
  var ssId     = ss.getId();
  var token    = ScriptApp.getOAuthToken();
  var response = UrlFetchApp.fetch(
    'https://docs.google.com/spreadsheets/d/' + ssId + '/export?format=xlsx',
    { headers: { 'Authorization': 'Bearer ' + token }, muteHttpExceptions: true }
  );
  if (response.getResponseCode() !== 200) {
    throw new Error('Export failed: ' + response.getContentText().substr(0, 200));
  }

  var blob = response.getBlob().setName(answers.fullName + ' Workout Program.xlsx');

  var folderId = PropertiesService.getScriptProperties().getProperty('PLAN_DRIVE_FOLDER_ID');
  if (folderId) {
    try { DriveApp.getFolderById(folderId).createFile(blob.copyBlob()); } catch(err) { Logger.log('Drive save failed: ' + err.message); }
  }

  DriveApp.getFileById(ssId).setTrashed(true);
  return blob;
}


function createPlanDraft(clientEmail, clientName, planJSON, xlsxBlob) {
  var props   = PropertiesService.getScriptProperties();
  var subject = props.getProperty('PLAN_EMAIL_SUBJECT') || 'Your Personalized Workout Plan — The Strength Blueprint';

  GmailApp.createDraft(clientEmail, subject, '', {
    htmlBody:    buildCoverEmailBody(clientName, planJSON.intro || ''),
    attachments: [xlsxBlob]
  });

  var trainerEmails = props.getProperty('TRAINER_EMAIL') || '';
  if (trainerEmails) {
    GmailApp.sendEmail(trainerEmails, 'Draft ready: Workout plan for ' + clientName,
      'A workout program has been drafted for ' + clientName + ' (' + clientEmail + ').\n\n' +
      'Check Gmail Drafts — attached as Excel.\n\n— The Strength Blueprint Automation');
  }
}


function buildCoverEmailBody(clientName, introText) {
  var firstName = clientName.split(' ')[0];
  var safeIntro = introText
    ? introText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    : '';

  return (
    '<!DOCTYPE html>' +
    '<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#f0f0f0;">' +

    // Outer table wrapper
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0f0f0">' +
    '<tr><td align="center" style="padding:32px 8px;">' +

    // Card table
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;border-radius:6px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.15);">' +

      // ── HEADER ───────────────────────────────────────────
      '<tr>' +
      '<td bgcolor="#111111" style="padding:32px 40px 28px;">' +
        '<table width="100%" cellpadding="0" cellspacing="0" border="0">' +
        '<tr><td>' +
          // TSB logo mark
          '<table cellpadding="0" cellspacing="0" border="0" style="display:inline-table;">' +
          '<tr><td bgcolor="#f5a800" style="padding:8px 14px;border-radius:4px;">' +
            '<span style="font-family:Arial Black,Arial,sans-serif;font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-1px;">TSB</span>' +
          '</td></tr>' +
          '</table>' +
        '</td></tr>' +
        '<tr><td style="padding-top:18px;">' +
          '<p style="margin:0;font-family:Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#f5a800;">The Strength Blueprint</p>' +
        '</td></tr>' +
        '<tr><td style="padding-top:10px;">' +
          '<h1 style="margin:0;font-family:Arial Black,Arial,sans-serif;font-size:30px;font-weight:900;color:#ffffff;text-transform:uppercase;letter-spacing:0.5px;line-height:1.2;">' +
            'Your Program<br>Is Ready, ' + firstName + '.' +
          '</h1>' +
        '</td></tr>' +
        '</table>' +
      '</td>' +
      '</tr>' +

      // ── GOLD BAR ──────────────────────────────────────────
      '<tr><td bgcolor="#f5a800" style="height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>' +

      // ── BODY ──────────────────────────────────────────────
      '<tr>' +
      '<td bgcolor="#ffffff" style="padding:36px 40px;">' +

        // Intro paragraph
        (safeIntro
          ? '<p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:16px;line-height:1.75;color:#333333;">' + safeIntro + '</p>'
          : '') +

        // Section label
        '<p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#999999;">Getting Started</p>' +

        // Step 1
        '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">' +
        '<tr>' +
          '<td width="36" valign="top">' +
            '<table cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#f5a800" style="width:28px;height:28px;border-radius:50%;text-align:center;vertical-align:middle;">' +
              '<span style="font-family:Arial Black,Arial,sans-serif;font-size:13px;font-weight:900;color:#ffffff;">1</span>' +
            '</td></tr></table>' +
          '</td>' +
          '<td style="padding-left:12px;padding-top:4px;">' +
            '<p style="margin:0;font-family:Arial,sans-serif;font-size:15px;color:#222222;">Open the <strong>attached Excel file</strong></p>' +
          '</td>' +
        '</tr>' +
        '</table>' +

        // Step 2
        '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;">' +
        '<tr>' +
          '<td width="36" valign="top">' +
            '<table cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#f5a800" style="width:28px;height:28px;border-radius:50%;text-align:center;vertical-align:middle;">' +
              '<span style="font-family:Arial Black,Arial,sans-serif;font-size:13px;font-weight:900;color:#ffffff;">2</span>' +
            '</td></tr></table>' +
          '</td>' +
          '<td style="padding-left:12px;padding-top:4px;">' +
            '<p style="margin:0;font-family:Arial,sans-serif;font-size:15px;color:#222222;">Navigate to the <strong>Program</strong> tab</p>' +
          '</td>' +
        '</tr>' +
        '</table>' +

        // Step 3
        '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;">' +
        '<tr>' +
          '<td width="36" valign="top">' +
            '<table cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#f5a800" style="width:28px;height:28px;border-radius:50%;text-align:center;vertical-align:middle;">' +
              '<span style="font-family:Arial Black,Arial,sans-serif;font-size:13px;font-weight:900;color:#ffffff;">3</span>' +
            '</td></tr></table>' +
          '</td>' +
          '<td style="padding-left:12px;padding-top:4px;">' +
            '<p style="margin:0;font-family:Arial,sans-serif;font-size:15px;color:#222222;">Start with <strong>Day A</strong> — log your weights as you go</p>' +
          '</td>' +
        '</tr>' +
        '</table>' +

        // Divider
        '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">' +
        '<tr><td style="border-top:1px solid #eeeeee;">&nbsp;</td></tr>' +
        '</table>' +

        // Signature
        '<p style="margin:0;font-family:Arial,sans-serif;font-size:15px;color:#333333;line-height:1.6;">' +
          'Questions? Just reply — I\'m here every step of the way.<br><br>' +
          '<strong style="color:#111111;">Alden Emmons</strong><br>' +
          '<span style="color:#f5a800;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">The Strength Blueprint</span>' +
        '</p>' +

      '</td>' +
      '</tr>' +

      // ── FOOTER ────────────────────────────────────────────
      '<tr>' +
      '<td bgcolor="#111111" style="padding:18px 40px;">' +
        '<p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#666666;letter-spacing:2px;text-transform:uppercase;">' +
          'Evidence-Based &nbsp;&#183;&nbsp; Clinical-Grade &nbsp;&#183;&nbsp; Online Strength Coaching' +
        '</p>' +
      '</td>' +
      '</tr>' +

    '</table>' + // end card

    '</td></tr></table>' + // end outer wrapper
    '</body></html>'
  );
}


function notifyTrainerOfError(errorMessage) {
  var trainerEmails = PropertiesService.getScriptProperties().getProperty('TRAINER_EMAIL') || '';
  if (!trainerEmails) return;
  GmailApp.sendEmail(trainerEmails, 'Workout plan automation failed',
    'Error: ' + errorMessage + '\n\nPlease generate manually.\n\n— The Strength Blueprint Automation');
}


function testAutomation() {
  var fakeEvent = {
    namedValues: {
      'Email':                                        ['aldenemmons6@gmail.com'],
      'Full name':                                    ['Alden Emmons'],
      'Date of Birth':                                ['06/24/2006'],
      'Height (e.g. 5ft 10in)':                      ['6ft 0in'],
      'Current Weight (lbs)':                         ['230'],
      'My job is primarily':                          ['Moderately active'],
      'Approximately how many hours per day are you sitting?': ['4 to 6 hours'],
      'Have you ever been diagnosed with any of the following? (Check all that apply)': [''],
      'Are you currently taking any medications prescribed by a doctor?':               ['No'],
      'Have you had any surgeries':                   ['No'],
      'If yes -- which area(s) are affected? (Check all that apply)': ['Lower back / lumbar spine'],
      'For each area affected, describe: pain level at rest (0-10), pain during activity (0-10), how long you have had it, what makes it better, and what makes it worse.\nExample: Left knee -- 2/10 at rest, 6/10 going up stairs, 6 months, better with ice, worse with squatting. Skip if no current pain.': ['Lower back: 2/10 rest, 5/10 activity, 6 months, better with movement, worse with sitting'],
      'How long have you been training consistently?': ['2 to 5 years'],
      'What type(s) of training have you done most? (Check all that apply)': ['Machine-based resistance training, Free weight resistance training'],
      'How long are your typical training sessions?':  ['60 to 90 minutes'],
      'Have you worked with a personal trainer or coach before?': ['No'],
      'What equipment do you currently have access to? (Check all that apply)': ['Full commercial gym (barbells, racks, cables, machines)'],
      'What is your PRIMARY goal right now':           ['Build strength (performance focus)'],
      'Describe your primary goal in your own words \u2013 be as specific as possible:': ['Benching 405 and staying injury free'],
      'What is your secondary goal (if any)':          ['Fat loss / body recomposition'],
      'What does success look like for you in 90 days? Be specific:': ['Benching 405 and injury free'],
      'How motivated are you right now to make a real change?': ['8'],
      'What has stopped you from reaching your goals in the past? Be honest:': ['Poor diet, inconsistency'],
      'What time of day do you prefer to train?':      ['Afternoon (1 to 5 PM)'],
      'What is your current nutrition approach?':      ['Loosely eating healthy but not tracking'],
      'Approximately how much protein do you eat per day?': ['130 to 160g'],
      'Average hours of sleep per night:':             ['7'],
      'Average daily stress level:':                   ['5'],
      'Is there anything about your health, history, lifestyle, or goals not covered above that your coach should know?': ['Competitive background']
    }
  };
  onFormSubmit(fakeEvent);
  Logger.log('Test complete — check Gmail Drafts.');
}
