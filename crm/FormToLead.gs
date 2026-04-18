// ============================================================
// FormToLead.gs
// Paste this into the Apps Script project attached to your
// Google Form responses spreadsheet (NOT the CRM project).
// 
// Setup:
//   1. Open the Form responses sheet → Extensions → Apps Script
//   2. Paste this entire file
//   3. Run installTrigger() once to register the onFormSubmit trigger
// ============================================================

var CRM_SPREADSHEET_ID = '17wz2vjnn-A7X-N1WLzlBC_oQvnsnZ7hxZXSkXdDGJXw';

var F_EMAIL        = 'Email';
var F_FULL_NAME    = 'Full name';
var F_PRIMARY_GOAL = 'What is your PRIMARY goal right now';
var F_GOAL_DETAIL  = 'Describe your primary goal in your own words – be as specific as possible:';
var F_PAIN_AREAS   = 'If yes -- which area(s) are affected? (Check all that apply)';
var F_SOURCE       = 'How did you find The Strength Blueprint';

/**
 * Run once to install the trigger. Removes duplicates first.
 */
function installTrigger() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'onFormSubmitHandler') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  ScriptApp.newTrigger('onFormSubmitHandler')
    .forSpreadsheet(ss)
    .onFormSubmit()
    .create();
  Logger.log('Trigger installed.');
}

/**
 * Fires on every form submission. Reads last row from sheet directly.
 */
function onFormSubmitHandler(e) {
  try {
    // Read the submitted row using e.range (exact row) or fall back to last row
    var ss      = SpreadsheetApp.getActiveSpreadsheet();
    var sheet   = ss.getSheets()[0];
    var rowNum  = (e && e.range) ? e.range.getRow() : sheet.getLastRow();
    var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    var values  = sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0];

    // Build a named responses object
    var responses = {};
    for (var i = 0; i < headers.length; i++) {
      responses[headers[i]] = String(values[i] || '').trim();
    }

    Logger.log('Processing row ' + rowNum + ': ' + JSON.stringify(responses).substr(0, 200));

    var fullName  = responses[F_FULL_NAME] || '';
    var nameParts = fullName.trim().split(/\s+/);
    var firstName = nameParts[0] || '';
    var lastName  = nameParts.slice(1).join(' ') || '';

    var email      = responses[F_EMAIL] || '';
    var goal       = responses[F_PRIMARY_GOAL] || '';
    var goalDetail = responses[F_GOAL_DETAIL] || '';
    var painArea   = responses[F_PAIN_AREAS] || '';
    var source     = responses[F_SOURCE] || 'Intake Form';

    var goalFull = goal;
    if (goalDetail) goalFull += ' — ' + goalDetail;

    // Build full intake note organized by section
    var sections = {
      'PERSONAL INFO':    ['Full name','Date of Birth','Column 6','Height (e.g. 5ft 10in)','Current Weight (lbs)','My job is primarily','Approximately how many hours per day are you sitting?'],
      'MEDICAL HISTORY':  ['Have you ever been diagnosed with any of the following? (Check all that apply)','Please describe any conditions checked above \u2013 include current status (active, managed, or resolved):','Are you currently taking any medications prescribed by a doctor?','If yes - list all medications and what they are prescribed for:','Have you had any surgeries','If yes -- list the surgery, body part, and approximate year:','Are you currently being treated by a physician, PT, chiropractor, or specialist?','If yes -- what were the restrictions?','Are you pregnant or postpartum (within the last 12 months)?'],
      'PAIN & INJURIES':  ['Do you currently experience any pain, discomfort, or physical limitations?','If yes -- which area(s) are affected? (Check all that apply)','For each area affected, describe: pain level at rest (0-10), pain during activity (0-10), how long you have had it, what makes it better, and what makes it worse.\nExample: Left knee -- 2/10 at rest, 6/10 going up stairs, 6 months, better with ice, worse with squatting. Skip if no current pain.','Have you received a formal diagnosis for any current pain issues?','If yes -- what is the diagnosis and who gave it?\nSkip if no formal diagnosis','Have you had any imaging (X-ray, MRI, CT scan) for current pain issues?','If yes -- what were the findings?\nskip If no imaging.','Do you have any past injuries (resolved) that still affect your movement or training?','If yes -- describe the injury, when it occurred, and how it currently affects you:'],
      'TRAINING HISTORY': ['How long have you been training consistently?','What type(s) of training have you done most? (Check all that apply)','How long are your typical training sessions?','Have you worked with a personal trainer or coach before?','If yes -- what worked well? What did not?\nSkip if you have not worked with a coach before.','What equipment do you currently have access to? (Check all that apply)','Describe your equipment setup in more detail if needed:'],
      'GOALS':            ['What is your PRIMARY goal right now','Describe your primary goal in your own words \u2013 be as specific as possible:','What is your secondary goal (if any)','What does success look like for you in 90 days? Be specific:','What does success look like in 6 to 12 months? Be specific','How motivated are you right now to make a real change?','What has stopped you from reaching your goals in the past? Be honest:','What time of day do you prefer to train?'],
      'NUTRITION':        ['What is your current nutrition approach?','Do you know your approximate daily caloric intake?','If you track or have a general idea \u2013 what is your approximate daily calorie intake?','Approximately how much protein do you eat per day?','How many meals do you typically eat per day?','Do you eat breakfast?','What time do you typically eat your FIRST meal of the day?','Do you experience any of the following? (Check all that apply)','Do you have any dietary restrictions or food allergies?','If yes -- list all restrictions and allergies:','Are there any foods you strongly dislike or refuse to eat?','Do you eat out or order takeout regularly?','Do you meal prep or cook most of your food at home?','Average daily water intake:','Do you drink coffee or other caffeinated beverages?','Do you consume alcohol?','What is your primary NUTRITION goal?','Are you interested in a structured meal plan as part of your program?'],
      'LIFESTYLE & SLEEP':['Average hours of sleep per night:','How would you rate your sleep quality?','Do you have any diagnosed sleep disorders?','What time do you typically go to bed?','What time do you typically wake up?','Do you use screens (phone, TV, computer) within 1 hour of bedtime?','Average daily step count (if you track it):','Outside of structured training, how active are you throughout the day?','Average daily stress level:','What are your primary sources of stress? (Check all that apply)','Do you smoke or use any nicotine products'],
      'SUPPLEMENTS':      ['Are you currently taking any supplements? (Check all that apply)','List any supplements not above, or add notes on dosage and timing:','Are you open to supplement recommendations as part of your program?','How would you describe your current recovery between workouts?','Do you currently do anDo you currently do any active recovery practices? (Check all that apply)'],
      'COACHING':         ['How do you prefer to be coached?','How do you typically handle setbacks (missed workouts, bad nutrition days, etc.)?','What is your preferred check-in frequency with your coach?','How do you prefer to receive feedback on your progress? (Check all that apply)','Are there any psychological or emotional factors related to your body, food, or exercise I should know about?'],
      'FINAL NOTES':      ['How did you find The Strength Blueprint','Is there anything about your health, history, lifestyle, or goals not covered above that your coach should know?','What is the single most important thing you want me to understand about where you are right now?']
    };

    var noteLines = ['CLIENT INTAKE FORM', ''];
    for (var section in sections) {
      var sectionLines = [];
      var fields = sections[section];
      for (var f = 0; f < fields.length; f++) {
        var val = responses[fields[f]];
        if (val) sectionLines.push(fields[f].split('\n')[0] + ': ' + val);
      }
      if (sectionLines.length > 0) {
        noteLines.push('[' + section + ']');
        for (var s = 0; s < sectionLines.length; s++) noteLines.push(sectionLines[s]);
        noteLines.push('');
      }
    }
    var noteContent = noteLines.join('\n');

    // Write to CRM spreadsheet
    var crmSS = SpreadsheetApp.openById(CRM_SPREADSHEET_ID);
    var leads = crmSS.getSheetByName('Leads');
    var notes = crmSS.getSheetByName('Notes');

    var now    = new Date().toISOString();
    var leadId = 'lead_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    var noteId = 'note_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

    leads.appendRow([
      leadId, firstName, lastName, email, '',
      'New Lead', source, '', '', '',
      now, now, '', '', '',
      painArea, goalFull, 1, ''
    ]);

    notes.appendRow([noteId, leadId, 'Intake Form', noteContent, now, 'Google Form']);

    Logger.log('Lead created: ' + leadId + ' for ' + fullName);

  } catch (err) {
    Logger.log('FormToLead error: ' + err.message + '\n' + err.stack);
  }
}

/**
 * Run this once to authorize access to the CRM spreadsheet.
 */
function authorizeCRMAccess() {
  var ss = SpreadsheetApp.openById(CRM_SPREADSHEET_ID);
  Logger.log('CRM access OK: ' + ss.getName());
}
