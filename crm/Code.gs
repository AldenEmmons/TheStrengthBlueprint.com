// ============================================================
// Code.gs — Main entry points: doGet (serve app) + doPost (webhook)
// ============================================================

function doGet(e) {
  // Handle Facebook webhook verification GET
  if (e && e.parameter && e.parameter['hub.mode'] === 'subscribe') {
    var verifyToken = e.parameter['hub.verify_token'];
    var challenge = e.parameter['hub.challenge'];
    if (verifyToken === getConfig('fb_verify_token')) {
      return ContentService.createTextOutput(challenge);
    }
    return ContentService.createTextOutput('Forbidden').setResponseCode(403);
  }

  // Auth check
  var email = Session.getActiveUser().getEmail();
  if (!isAuthorized(email)) {
    return HtmlService.createHtmlOutputFromFile('Unauthorized')
      .setTitle('Access Denied — TSB CRM')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DENY);
  }

  // Serve app with user info injected
  var template = HtmlService.createTemplateFromFile('App');
  template.userEmail = email;
  template.userName = email.split('@')[0];
  return template.evaluate()
    .setTitle('TSB CRM')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DENY);
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    // Detect Zapier flat payload vs native Facebook webhook payload
    if (body.object === 'page') {
      // Native Facebook webhook
      processLeadEvent(body);
    } else if (body.first_name !== undefined || body.email !== undefined) {
      // Zapier fallback — flat JSON
      processZapierPayload(body);
    } else {
      Logger.log('doPost: unrecognized payload format');
    }
  } catch (err) {
    Logger.log('doPost error: ' + err.message);
  }

  // Facebook requires a fast 200 response
  return ContentService
    .createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function isAuthorized(email) {
  if (!email) return false;
  var raw = getConfig('authorized_emails') || '';
  var allowed = raw.split(',').map(function(s) { return s.trim().toLowerCase(); });
  return allowed.indexOf(email.toLowerCase()) >= 0;
}

// ============================================================
// Functions exposed to the frontend via google.script.run
// These must live in Code.gs or be globally accessible.
// ============================================================

// Lead functions (delegate to LeadService.gs)
// getAllLeads, getLeadById, createLead, updateLead, updateLeadStage,
// deleteLead, searchLeads — all defined in LeadService.gs and callable directly.

// Note functions (delegate to NoteService.gs)
// getNotesForLead, createNote — defined in NoteService.gs.

/**
 * Returns the overdue lead count for the header badge.
 */
function getOverdueCount() {
  var overdue = getOverdueLeads();
  return overdue.length;
}
