// ============================================================
// PaymentWebhook.gs — Triggered by Zapier when Stripe payment received
// Looks up lead by email, generates workout plan via Claude,
// creates Gmail draft, and schedules it for delivery 2 days later.
// ============================================================

var PLAN_DAY_HEADER_ROWS   = [7,  20, 33, 46];
var PLAN_DAY_EXERCISE_ROWS = [10, 23, 36, 49];

/**
 * Main handler. Called from doPost() in Code.gs when a Stripe payload arrives.
 * Expected payload: { source: 'stripe', email: '...', payment_id: '...', name: '...' }
 */
function processPaymentWebhook(data) {
  var email = (data.email || '').toLowerCase().trim();
  if (!email) {
    Logger.log('PaymentWebhook: no email in payload');
    return;
  }

  Logger.log('PaymentWebhook: payment received for ' + email);

  var lead = findLeadByEmail(email);
  if (!lead) {
    Logger.log('PaymentWebhook: no lead found for ' + email + ' — creating minimal lead');
    var nameParts = (data.name || '').split(/\s+/);
    lead = createLead({
      first_name: nameParts[0] || '',
      last_name:  nameParts.slice(1).join(' ') || '',
      email:      email,
      source:     'Stripe',
      stage:      'Client'
    });
  }

  var leadId = lead.lead_id;

  // Move to Client stage and log payment
  updateLeadStage(leadId, 'Client');
  var stripeRef = data.payment_id || data.checkout_session_id || 'n/a';
  createNote(leadId, 'Payment', 'Payment received via Stripe Payment Link (ID: ' + stripeRef + '). Workout plan generation triggered.', 'system');

  // Get all notes — intake form + Luke's call notes
  var notes = getNotesForLead(leadId);

  // Generate plan via Claude
  var planJSON;
  try {
    planJSON = generatePlanFromCRM(lead, notes);
  } catch (err) {
    Logger.log('PaymentWebhook: plan generation failed — ' + err.message);
    notifyTrainerOfPlanError(lead, err.message);
    return;
  }

  // Fill the Excel template
  var clientName = ((lead.first_name || '') + ' ' + (lead.last_name || '')).trim() || email;
  var answers    = buildAnswersFromLead(lead, notes);
  var xlsxBlob;
  try {
    xlsxBlob = fillPlanTemplate(answers, planJSON);
  } catch (err) {
    Logger.log('PaymentWebhook: template fill failed — ' + err.message);
    notifyTrainerOfPlanError(lead, 'Template fill failed: ' + err.message);
    return;
  }

  // Schedule email for 2 days from now at 9 AM
  var sendAt = new Date();
  sendAt.setDate(sendAt.getDate() + 2);
  sendAt.setHours(9, 0, 0, 0);

  schedulePlanEmail(lead.email, clientName, planJSON, xlsxBlob, sendAt, leadId);
  createNote(leadId, 'Automation', 'Workout plan generated and email scheduled for ' + sendAt.toDateString() + '.', 'system');

  Logger.log('PaymentWebhook: plan scheduled for ' + sendAt.toISOString() + ' — ' + clientName);
}


// ── Plan Generation ──────────────────────────────────────────

function generatePlanFromCRM(lead, notes) {
  var apiKey = PropertiesService.getScriptProperties().getProperty('CLAUDE_API_KEY');
  if (!apiKey) throw new Error('CLAUDE_API_KEY not set in Script Properties');

  var prompt  = buildPromptFromNotes(lead, notes);
  var payload = {
    model:      'claude-sonnet-4-6',
    max_tokens: 8192,
    messages:   [{ role: 'user', content: prompt }]
  };
  var options = {
    method:      'post',
    contentType: 'application/json',
    headers:     { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload:     JSON.stringify(payload),
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

function buildPromptFromNotes(lead, notes) {
  var lines = [];

  lines.push(
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
    '    { "label": "DAY B — Upper (Press Focus)  |  Wednesday", "exercises": [ ... ] },\n' +
    '    { "label": "DAY C — Lower (Hip Hinge)  |  Friday", "exercises": [ ... ] },\n' +
    '    { "label": "DAY D — Upper (Pull Focus)  |  Saturday", "exercises": [ ... ] }\n' +
    '  ],\n' +
    '  "closing": "Motivational closing note for this month"\n' +
    '}\n\n' +
    'Rules:\n' +
    '- EXACTLY 4 days in the array.\n' +
    '- 6-8 exercises per day. First 1-2 = warmup/corrective/mobility (sets/reps/rir = "-").\n' +
    '- Adjust exercises around any pain areas or injuries listed.\n' +
    '- Match equipment to what the client has available.\n' +
    '- cue = short coaching cue or tempo.\n' +
    '- sets = number for working sets, "-" for warmup.\n' +
    '- reps = string like "6-8", "10/leg", "15", or "-".\n' +
    '- rir = string like "2", "1", or "-" for warmup.\n' +
    '- Return ONLY the JSON. Nothing else.'
  );

  // Find intake form note and coach/call notes
  var intakeNote  = null;
  var coachNotes  = [];

  for (var i = 0; i < notes.length; i++) {
    var n = notes[i];
    if (n.type === 'Intake Form' && !intakeNote) {
      intakeNote = n;
    } else if (n.type === 'Note' || n.type === 'Coach Note') {
      coachNotes.push(n);
    }
  }

  if (intakeNote) {
    lines.push('\n## CLIENT INTAKE FORM\n' + intakeNote.content);
  } else {
    // Fallback to whatever is on the lead record
    lines.push('\n## CLIENT INFO');
    lines.push('Name: ' + (lead.first_name || '') + ' ' + (lead.last_name || ''));
    if (lead.email)     lines.push('Email: ' + lead.email);
    if (lead.pain_area) lines.push('Pain areas: ' + lead.pain_area);
    if (lead.goal)      lines.push('Goal: ' + lead.goal);
  }

  if (coachNotes.length > 0) {
    lines.push('\n## COACH NOTES FROM CONSULTATION CALL');
    for (var j = 0; j < coachNotes.length; j++) {
      lines.push('---\n' + coachNotes[j].content);
    }
    lines.push('\nIMPORTANT: The coach notes above are from a live consultation call and should take priority when tailoring the program.');
  }

  return lines.join('\n');
}

/**
 * Builds the minimal answers object needed for fillPlanTemplate's Client Info tab.
 * Key fields come from the lead record; others are left blank.
 */
function buildAnswersFromLead(lead, notes) {
  return {
    fullName:        ((lead.first_name || '') + ' ' + (lead.last_name || '')).trim(),
    email:           lead.email || '',
    dob:             '',
    height:          '',
    weight:          '',
    primaryGoal:     lead.goal || '',
    goalDetail:      '',
    painAreas:       lead.pain_area || '',
    surgeries:       '',
    medications:     '',
    conditions:      '',
    job:             '',
    trainTime:       '',
    sessionDuration: ''
  };
}


// ── Template Fill ────────────────────────────────────────────

function fillPlanTemplate(answers, planJSON) {
  var templateId = PropertiesService.getScriptProperties().getProperty('TEMPLATE_SHEET_ID');
  if (!templateId) throw new Error('TEMPLATE_SHEET_ID not set in Script Properties');

  var copy = DriveApp.getFileById(templateId).makeCopy(answers.fullName + ' — Workout Program');
  var ss   = SpreadsheetApp.openById(copy.getId());

  // Fill Client Info tab
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
    if (answers.painAreas)       ci.getRange('C13').setValue(answers.painAreas);
    if (answers.surgeries)       ci.getRange('C14').setValue(answers.surgeries);
    if (answers.medications)     ci.getRange('C15').setValue(answers.medications);
    if (answers.conditions)      ci.getRange('C18').setValue(answers.conditions);
    if (answers.job)             ci.getRange('C19').setValue(answers.job);
  }

  // Fill Program tab
  var prog = ss.getSheetByName('🏋️ Program');
  if (!prog) throw new Error('Could not find "🏋️ Program" tab in template');

  var days = planJSON.days || [];
  for (var d = 0; d < Math.min(days.length, 4); d++) {
    var day      = days[d];
    var hRow     = PLAN_DAY_HEADER_ROWS[d];
    var startRow = PLAN_DAY_EXERCISE_ROWS[d];

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

  // Export as XLSX
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

  // Save copy to Drive folder if configured
  var folderId = PropertiesService.getScriptProperties().getProperty('PLAN_DRIVE_FOLDER_ID');
  if (folderId) {
    try { DriveApp.getFolderById(folderId).createFile(blob.copyBlob()); } catch (err) { Logger.log('Drive save failed: ' + err.message); }
  }

  DriveApp.getFileById(ssId).setTrashed(true);
  return blob;
}


// ── Email Scheduling ─────────────────────────────────────────

function schedulePlanEmail(clientEmail, clientName, planJSON, xlsxBlob, sendAt, leadId) {
  var props   = PropertiesService.getScriptProperties();
  var subject = props.getProperty('PLAN_EMAIL_SUBJECT') || 'Your Personalized Workout Plan — The Strength Blueprint';

  var draft = GmailApp.createDraft(clientEmail, subject, '', {
    htmlBody:    buildPlanEmailBody(clientName, planJSON.intro || ''),
    attachments: [xlsxBlob]
  });

  // Record in PendingSends sheet
  var sheet = getOrCreatePendingSendsSheet();
  sheet.appendRow([
    generateId('send'),
    leadId,
    draft.getId(),
    clientEmail,
    clientName,
    sendAt.toISOString(),
    'FALSE'
  ]);

  // Notify trainer that draft is queued
  var trainerEmails = props.getProperty('TRAINER_EMAIL') || '';
  if (trainerEmails) {
    GmailApp.sendEmail(
      trainerEmails,
      'Plan ready: ' + clientName + ' (sends ' + sendAt.toDateString() + ')',
      'A workout plan has been generated for ' + clientName + ' (' + clientEmail + ').\n\n' +
      'It will be sent automatically on ' + sendAt.toDateString() + ' at 9 AM.\n\n' +
      'Check Gmail Drafts if you want to review or edit before it goes out.\n\n— TSB Automation'
    );
  }

  Logger.log('schedulePlanEmail: draft queued for ' + clientEmail + ', sends ' + sendAt.toISOString());
}

function getOrCreatePendingSendsSheet() {
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName('PendingSends');
  if (!sheet) {
    sheet = ss.insertSheet('PendingSends');
    sheet.appendRow(['id', 'lead_id', 'draft_id', 'client_email', 'client_name', 'send_at', 'sent']);
    sheet.setFrozenRows(1);
  }
  return sheet;
}


// ── Email Body ───────────────────────────────────────────────

function buildPlanEmailBody(clientName, introText) {
  var firstName = clientName.split(' ')[0];
  var safeIntro = introText
    ? introText.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    : '';

  return (
    '<!DOCTYPE html>' +
    '<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#f0f0f0;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0f0f0">' +
    '<tr><td align="center" style="padding:32px 8px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;border-radius:6px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.15);">' +

    // Header
    '<tr><td bgcolor="#111111" style="padding:32px 40px 28px;">' +
      '<table width="100%" cellpadding="0" cellspacing="0" border="0">' +
      '<tr><td>' +
        '<table cellpadding="0" cellspacing="0" border="0" style="display:inline-table;">' +
        '<tr><td bgcolor="#f5a800" style="padding:8px 14px;border-radius:4px;">' +
          '<span style="font-family:Arial Black,Arial,sans-serif;font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-1px;">TSB</span>' +
        '</td></tr></table>' +
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
    '</td></tr>' +

    // Gold bar
    '<tr><td bgcolor="#f5a800" style="height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>' +

    // Body
    '<tr><td bgcolor="#ffffff" style="padding:36px 40px;">' +
      (safeIntro ? '<p style="margin:0 0 24px;font-family:Arial,sans-serif;font-size:16px;line-height:1.75;color:#333333;">' + safeIntro + '</p>' : '') +
      '<p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:3px;text-transform:uppercase;color:#999999;">Getting Started</p>' +

      // Step 1
      '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;"><tr>' +
        '<td width="36" valign="top"><table cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#f5a800" style="width:28px;height:28px;border-radius:50%;text-align:center;vertical-align:middle;"><span style="font-family:Arial Black,Arial,sans-serif;font-size:13px;font-weight:900;color:#ffffff;">1</span></td></tr></table></td>' +
        '<td style="padding-left:12px;padding-top:4px;"><p style="margin:0;font-family:Arial,sans-serif;font-size:15px;color:#222222;">Open the <strong>attached Excel file</strong></p></td>' +
      '</tr></table>' +

      // Step 2
      '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:12px;"><tr>' +
        '<td width="36" valign="top"><table cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#f5a800" style="width:28px;height:28px;border-radius:50%;text-align:center;vertical-align:middle;"><span style="font-family:Arial Black,Arial,sans-serif;font-size:13px;font-weight:900;color:#ffffff;">2</span></td></tr></table></td>' +
        '<td style="padding-left:12px;padding-top:4px;"><p style="margin:0;font-family:Arial,sans-serif;font-size:15px;color:#222222;">Navigate to the <strong>Program</strong> tab</p></td>' +
      '</tr></table>' +

      // Step 3
      '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;"><tr>' +
        '<td width="36" valign="top"><table cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#f5a800" style="width:28px;height:28px;border-radius:50%;text-align:center;vertical-align:middle;"><span style="font-family:Arial Black,Arial,sans-serif;font-size:13px;font-weight:900;color:#ffffff;">3</span></td></tr></table></td>' +
        '<td style="padding-left:12px;padding-top:4px;"><p style="margin:0;font-family:Arial,sans-serif;font-size:15px;color:#222222;">Start with <strong>Day A</strong> — log your weights as you go</p></td>' +
      '</tr></table>' +

      '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;"><tr><td style="border-top:1px solid #eeeeee;">&nbsp;</td></tr></table>' +

      '<p style="margin:0;font-family:Arial,sans-serif;font-size:15px;color:#333333;line-height:1.6;">' +
        'Questions? Just reply — I\'m here every step of the way.<br><br>' +
        '<strong style="color:#111111;">Alden Emmons</strong><br>' +
        '<span style="color:#f5a800;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">The Strength Blueprint</span>' +
      '</p>' +
    '</td></tr>' +

    // Footer
    '<tr><td bgcolor="#111111" style="padding:18px 40px;">' +
      '<p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#666666;letter-spacing:2px;text-transform:uppercase;">Evidence-Based &nbsp;&#183;&nbsp; Clinical-Grade &nbsp;&#183;&nbsp; Online Strength Coaching</p>' +
    '</td></tr>' +

    '</table></td></tr></table></body></html>'
  );
}


// ── Error Handling ───────────────────────────────────────────

function notifyTrainerOfPlanError(lead, errorMessage) {
  var trainerEmails = PropertiesService.getScriptProperties().getProperty('TRAINER_EMAIL') || '';
  if (!trainerEmails) return;
  var name = ((lead.first_name || '') + ' ' + (lead.last_name || '')).trim() || lead.email;
  GmailApp.sendEmail(
    trainerEmails,
    'Plan generation FAILED: ' + name,
    'The automated workout plan for ' + name + ' (' + lead.email + ') failed to generate.\n\n' +
    'Error: ' + errorMessage + '\n\n' +
    'Please generate manually and email the client.\n\n— TSB Automation'
  );
}
