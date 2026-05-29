// ============================================================
// LeadService.gs — CRUD operations for the Leads sheet
// ============================================================

var LEADS_SHEET = 'Leads';

function getAllLeads() {
  var sheet = getSheet(LEADS_SHEET);
  return sheetToObjects(sheet);
}

function getLeadById(leadId) {
  var sheet = getSheet(LEADS_SHEET);
  var colIndex = getColIndex(sheet, 'lead_id');
  var result = findRowByColumnValue(sheet, colIndex, leadId);
  if (!result) return null;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var obj = {};
  for (var j = 0; j < headers.length; j++) {
    var val = result.row[j];
    obj[headers[j]] = (val instanceof Date) ? val.toISOString() : val;
  }
  return obj;
}

function createLead(data) {
  var sheet = getSheet(LEADS_SHEET);
  var now = new Date().toISOString();
  var leadId = generateId('lead');

  var newRow = [
    leadId,                          // A: lead_id
    data.first_name || '',           // B: first_name
    data.last_name || '',            // C: last_name
    data.email || '',                // D: email
    data.phone || '',                // E: phone
    data.stage || 'New Lead',        // F: stage
    data.source || 'Manual',         // G: source
    data.fb_form_name || '',         // H: fb_form_name
    data.fb_ad_id || '',             // I: fb_ad_id
    data.fb_lead_id || '',           // J: fb_lead_id
    now,                             // K: created_at
    now,                             // L: updated_at
    data.next_followup || '',        // M: next_followup
    'FALSE',                         // N: reminder_sent
    data.assigned_to || '',          // O: assigned_to
    data.pain_area || '',            // P: pain_area
    data.goal || '',                 // Q: goal
    0,                               // R: notes_count
    ''                               // S: deleted (soft delete flag)
  ];

  sheet.appendRow(newRow);

  // If an initial note was provided, create it
  if (data.first_note) {
    createNote(leadId, 'Note', data.first_note, data.assigned_to || 'system');
  }

  return getLeadById(leadId);
}

function updateLead(leadId, updates) {
  var sheet = getSheet(LEADS_SHEET);
  var colIndex = getColIndex(sheet, 'lead_id');
  var result = findRowByColumnValue(sheet, colIndex, leadId);
  if (!result) throw new Error('Lead not found: ' + leadId);

  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var rowIndex = result.rowIndex;
  var oldRow = result.row;

  // Detect stage change
  var stageColIndex = headers.indexOf('stage');
  var oldStage = oldRow[stageColIndex];
  var newStage = updates.stage;
  var stageChanged = newStage && newStage !== oldStage;

  // Detect follow-up date change — reset reminder_sent
  var followupColIndex = headers.indexOf('next_followup');
  var reminderColIndex = headers.indexOf('reminder_sent');
  var oldFollowup = oldRow[followupColIndex];
  var newFollowup = updates.next_followup;
  if (newFollowup && newFollowup !== oldFollowup) {
    updates.reminder_sent = 'FALSE';
  }

  // Apply updates
  updates.updated_at = new Date().toISOString();
  for (var key in updates) {
    var idx = headers.indexOf(key);
    if (idx >= 0) {
      sheet.getRange(rowIndex, idx + 1).setValue(updates[key]);
    }
  }

  // Auto-log stage change note
  if (stageChanged) {
    var createdBy = updates.updated_by || 'system';
    createNote(leadId, 'Stage Change', 'Stage changed from "' + oldStage + '" to "' + newStage + '"', createdBy);
  }

  return getLeadById(leadId);
}

function updateLeadStage(leadId, stage) {
  return updateLead(leadId, { stage: stage });
}

function deleteLead(leadId) {
  return updateLead(leadId, { deleted: 'TRUE' });
}

function searchLeads(query) {
  if (!query) return getAllLeads();
  var q = query.toLowerCase();
  var leads = getAllLeads();
  return leads.filter(function(lead) {
    return (
      (lead.first_name && lead.first_name.toLowerCase().indexOf(q) >= 0) ||
      (lead.last_name && lead.last_name.toLowerCase().indexOf(q) >= 0) ||
      (lead.email && lead.email.toLowerCase().indexOf(q) >= 0) ||
      (lead.phone && lead.phone.toLowerCase().indexOf(q) >= 0)
    );
  });
}

function findLeadByEmail(email) {
  if (!email) return null;
  var normalized = email.toLowerCase().trim();
  var leads = getAllLeads();
  for (var i = 0; i < leads.length; i++) {
    if ((leads[i].email || '').toLowerCase().trim() === normalized) return leads[i];
  }
  return null;
}

function findLeadByFbLeadId(fbLeadId) {
  var sheet = getSheet(LEADS_SHEET);
  var colIndex = getColIndex(sheet, 'fb_lead_id');
  var result = findRowByColumnValue(sheet, colIndex, fbLeadId);
  if (!result) return null;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var obj = {};
  for (var j = 0; j < headers.length; j++) {
    var val = result.row[j];
    obj[headers[j]] = (val instanceof Date) ? val.toISOString() : val;
  }
  return obj;
}

function incrementNotesCount(leadId) {
  var sheet = getSheet(LEADS_SHEET);
  var colIndex = getColIndex(sheet, 'lead_id');
  var result = findRowByColumnValue(sheet, colIndex, leadId);
  if (!result) return;
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var notesCountIndex = headers.indexOf('notes_count');
  if (notesCountIndex < 0) return;
  var current = result.row[notesCountIndex] || 0;
  sheet.getRange(result.rowIndex, notesCountIndex + 1).setValue(Number(current) + 1);
}
