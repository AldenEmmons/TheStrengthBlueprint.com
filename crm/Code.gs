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

  // Serve app (deployed as "Execute as: Me" — access controlled by URL)
  var email = 'alden';
  var template = HtmlService.createTemplateFromFile('App');
  template.userEmail = email;
  template.userName = email;
  return template.evaluate()
    .setTitle('TSB CRM')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.DEFAULT);
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    if (body.object === 'page') {
      // Native Facebook webhook
      processLeadEvent(body);
    } else if (body.source === 'stripe' || body.payment_id !== undefined || body.checkout_session_id !== undefined) {
      // Stripe payment via Zapier
      processPaymentWebhook(body);
    } else if (body.first_name !== undefined || body.email !== undefined) {
      // Zapier Facebook Lead Ad fallback — flat JSON
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

/**
 * Test function — run this to verify the SPREADSHEET_ID is correct.
 * Check the Execution log after running.
 */
function testSheetId() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  Logger.log('ID is: [' + id + ']');
  var sheet = SpreadsheetApp.openById(id);
  Logger.log('Sheet name: ' + sheet.getName());
}

function testGetAllLeads() {
  var leads = getAllLeads();
  Logger.log('Count: ' + leads.length);
  Logger.log(JSON.stringify(leads));
}
