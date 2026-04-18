// WorkoutPlanAutomation.gs
//
// Script Properties required (Project Settings → Script Properties):
//   CLAUDE_API_KEY               — Your Anthropic API key
//   TEMPLATE_SHEET_ID            — Google Sheets ID of TSB_Client_Program template
//   CONSULTATION_NOTES_FOLDER_ID — Drive folder ID containing trainer notes docs
//   TRAINER_EMAIL                — Comma-separated trainer emails
//   PLAN_EMAIL_SUBJECT           — Subject line for client email
//   PLAN_DRIVE_FOLDER_ID         — (optional) Drive folder to save a copy of each plan

// ── INTAKE FORM FIELD NAMES ───────────────────────────────────
// These match the actual TSB intake form question text exactly.
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
// ─────────────────────────────────────────────────────────────

// Program sheet row positions (Day A / B / C / D)
var DAY_HEADER_ROWS   = [7,  20, 33, 46];
var DAY_EXERCISE_ROWS = [10, 23, 36, 49];


/**
 * Trigger: set this as the "On form submit" trigger for the linked sheet.
 */
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


/**
 * Reads all intake form answers into a structured object.
 */
function parseFormAnswers(e) {
  var nv = e.namedValues;
  function get(field) {
    var val = nv[field];
    return (val && val[0]) ? val[0].trim() : '';
  }
  return {
    // Identity
    email:           get(F_EMAIL),
    fullName:        get(F_FULL_NAME),
    dob:             get(F_DOB),
    height:          get(F_HEIGHT),
    weight:          get(F_WEIGHT),
    job:             get(F_JOB),
    sitting:         get(F_SITTING),
    // Medical
    conditions:      get(F_CONDITIONS),
    medications:     get(F_MEDICATIONS),
    surgeries:       get(F_SURGERIES),
    // Pain
    painAreas:       get(F_PAIN_AREAS),
    painDetail:      get(F_PAIN_DETAIL),
    // Training
    trainingLength:  get(F_TRAINING_LENGTH),
    trainingTypes:   get(F_TRAINING_TYPES),
    sessionDuration: get(F_SESSION_DURATION),
    coachBefore:     get(F_COACH_BEFORE),
    equipment:       get(F_EQUIPMENT),
    // Goals
    primaryGoal:     get(F_PRIMARY_GOAL),
    goalDetail:      get(F_GOAL_DETAIL),
    secondaryGoal:   get(F_SECONDARY_GOAL),
    success90:       get(F_SUCCESS_90),
    motivation:      get(F_MOTIVATION),
    barriers:        get(F_BARRIERS),
    trainTime:       get(F_TRAIN_TIME),
    // Lifestyle
    nutrition:       get(F_NUTRITION),
    protein:         get(F_PROTEIN),
    sleep:           get(F_SLEEP),
    stress:          get(F_STRESS),
    finalNotes:      get(F_FINAL_NOTES)
  };
}


/**
 * Calls the Claude API and returns the workout plan as a parsed JSON object.
 */
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


/**
 * Builds the full Claude prompt from intake form answers.
 */
function buildPrompt(answers) {
  var parts = [];

  parts.push(
    'You are a professional personal trainer at The Strength Blueprint. ' +
    'Create a personalized training program for the client below based on their full intake form. ' +
    'Return ONLY valid JSON — no preamble, no explanation, no markdown fences.\n\n' +
    'The program uses 4 training days per week (Day A, B, C, D). ' +
    'Each day has up to 8 exercises including 1-2 warmup/corrective exercises first.\n\n' +
    'JSON structure:\n' +
    '{\n' +
    '  "intro": "2-3 sentence personal intro referencing their specific goal, history, and situation",\n' +
    '  "days": [\n' +
    '    {\n' +
    '      "label": "DAY A — Lower (Squat Focus)  |  Monday",\n' +
    '      "exercises": [\n' +
    '        { "name": "Foam Roll / Inhibit: Hip Flexors", "cue": "45-60 sec per side", "sets": "-", "reps": "-", "rir": "-" },\n' +
    '        { "name": "Barbell Back Squat", "cue": "Brace, hips back, knees track toes", "sets": 4, "reps": "4-6", "rir": "2" }\n' +
    '      ]\n' +
    '    },\n' +
    '    { "label": "DAY B — Upper (Press Focus)  |  Wednesday", "exercises": [...] },\n' +
    '    { "label": "DAY C — Lower (Hip Hinge)  |  Friday", "exercises": [...] },\n' +
    '    { "label": "DAY D — Upper (Pull Focus)  |  Saturday", "exercises": [...] }\n' +
    '  ],\n' +
    '  "closing": "Motivational closing note personalized to this client"\n' +
    '}\n\n' +
    'Rules:\n' +
    '- Exactly 4 days. Up to 8 exercises each.\n' +
    '- First 1-2 exercises per day = warmup/corrective/mobility (sets/reps/rir = "-").\n' +
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
  if (answers.dob)    parts.push('Date of Birth: ' + answers.dob);
  if (answers.height) parts.push('Height: ' + answers.height);
  if (answers.weight) parts.push('Weight: ' + answers.weight + ' lbs');
  if (answers.job)    parts.push('Job (activity level): ' + answers.job);
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


/**
 * Copies the TSB template, fills in all client data and exercises, exports as .xlsx.
 */
function fillTemplateWithPlan(answers, planJSON) {
  var templateId = PropertiesService.getScriptProperties().getProperty('TEMPLATE_SHEET_ID');
  if (!templateId) throw new Error('TEMPLATE_SHEET_ID not set in Script Properties');

  var copy = DriveApp.getFileById(templateId).makeCopy(answers.fullName + ' — Workout Program');
  var ss   = SpreadsheetApp.openById(copy.getId());

  // ── Client Info tab ───────────────────────────────────────
  var ci = ss.getSheetByName('📋 Client Info');
  if (ci) {
    ci.getRange('C5').setValue(answers.fullName);
    if (answers.dob)    ci.getRange('C6').setValue(answers.dob);
    if (answers.email)  ci.getRange('C7').setValue(answers.email);
    ci.getRange('C9').setValue(Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MM/dd/yyyy'));

    var goalFull = answers.primaryGoal;
    if (answers.goalDetail) goalFull += ' — ' + answers.goalDetail;
    if (goalFull) ci.getRange('G6').setValue(goalFull);

    if (answers.trainTime)     ci.getRange('G9').setValue(answers.trainTime);
    if (answers.sessionDuration) ci.getRange('G10').setValue(answers.sessionDuration);

    // Health history
    if (answers.painAreas)   ci.getRange('C13').setValue(answers.painAreas);
    if (answers.surgeries)   ci.getRange('C14').setValue(answers.surgeries);
    if (answers.medications) ci.getRange('C15').setValue(answers.medications);
    if (answers.conditions)  ci.getRange('C18').setValue(answers.conditions);
    if (answers.job)         ci.getRange('C19').setValue(answers.job);
  }

  // ── Program tab ───────────────────────────────────────────
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
      prog.getRange(row, 2).setValue(e.name  || '');
      prog.getRange(row, 3).setValue(e.cue   || '');
      prog.getRange(row, 4).setValue(e.sets  || '');
      prog.getRange(row, 5).setValue(e.reps  || '');
      prog.getRange(row, 6).setValue('');        // Load — client fills in
      prog.getRange(row, 7).setValue(e.rir   || '');
    }
  }

  // ── Export as .xlsx ───────────────────────────────────────
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


/**
 * Creates a Gmail draft with the Excel plan attached and notifies trainers.
 */
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


/**
 * Short HTML cover email.
 */
function buildCoverEmailBody(clientName, introText) {
  var firstName = clientName.split(' ')[0];
  var introHtml = introText ? '<p>' + introText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') + '</p>' : '';
  return (
    '<div style="font-family:Georgia,serif;max-width:640px;margin:0 auto;color:#222;line-height:1.7;">' +
      '<div style="background:#1a1a1a;padding:24px 32px;border-radius:8px 8px 0 0;">' +
        '<h1 style="color:#fff;margin:0;font-size:22px;letter-spacing:1px;">THE STRENGTH BLUEPRINT</h1>' +
        '<p style="color:#aaa;margin:4px 0 0;font-size:13px;">Your Personalized Training Program</p>' +
      '</div>' +
      '<div style="padding:32px;background:#fafafa;border:1px solid #e0e0e0;border-top:none;border-radius:0 0 8px 8px;">' +
        '<p>Hi ' + firstName + ',</p>' + introHtml +
        '<p>Your personalized training program is attached. Open it and head to the <strong>Program</strong> tab — ' +
        'your 4 training days are laid out with exercises, coaching cues, sets, reps, and RIR targets.</p>' +
        '<p>Use the other tabs to track your progress, check-ins, nutrition, and habits.</p>' +
        '<hr style="margin:32px 0;border:none;border-top:1px solid #e0e0e0;">' +
        '<p style="font-size:13px;color:#888;">Questions? Reply to this email anytime.</p>' +
      '</div>' +
    '</div>'
  );
}


/**
 * Error notification to trainers.
 */
function notifyTrainerOfError(errorMessage) {
  var trainerEmails = PropertiesService.getScriptProperties().getProperty('TRAINER_EMAIL') || '';
  if (!trainerEmails) return;
  GmailApp.sendEmail(trainerEmails, 'Workout plan automation failed',
    'Error: ' + errorMessage + '\n\nPlease generate manually.\n\n— The Strength Blueprint Automation');
}


// ============================================================
// MANUAL TEST — simulates the actual intake form fields
// ============================================================
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
