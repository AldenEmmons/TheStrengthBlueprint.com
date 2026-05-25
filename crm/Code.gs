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
    } else if (body.source === 'website_form') {
      // Website lead capture form
      handleWebsiteForm(body);
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

function testEmail() {
  sendLeadWelcomeEmail('Alden', 'aldenemmons6@gmail.com');
}


// ============================================================
// Website Form Handler
// ============================================================

function handleWebsiteForm(data) {
  var email     = (data.email || '').toLowerCase().trim();
  var fullName  = (data.first_name || '').trim();
  var nameParts = fullName.split(/\s+/);
  var firstName = nameParts[0] || '';
  var lastName  = nameParts.slice(1).join(' ') || '';
  var phone     = (data.phone || '').trim();

  if (!email && !fullName) {
    Logger.log('handleWebsiteForm: no email or name — skipping');
    return;
  }

  Logger.log('handleWebsiteForm: new lead from website — ' + email);

  var lead = email ? findLeadByEmail(email) : null;
  if (!lead) {
    lead = createLead({
      first_name: firstName,
      last_name:  lastName,
      email:      email,
      phone:      phone,
      source:     'Website',
      stage:      'Warm Lead'
    });
  } else if (phone && !lead.phone) {
    updateLead(lead.lead_id, { phone: phone });
  }

  if (email) {
    sendLeadWelcomeEmail(firstName || fullName || 'there', email);
  }

  Logger.log('handleWebsiteForm: processed lead ' + lead.lead_id);
}

function sendLeadWelcomeEmail(firstName, toEmail) {
  var subject = 'Your Free Assessment — Next Steps | The Strength Blueprint';
  GmailApp.sendEmail(toEmail, subject, '', {
    htmlBody: buildLeadWelcomeEmailBody(firstName),
    name: 'The Strength Blueprint'
  });
  Logger.log('sendLeadWelcomeEmail: sent to ' + toEmail);
}

function buildLeadWelcomeEmailBody(firstName) {
  var name           = firstName || 'there';
  var acuityLink     = 'https://thestrengthblueprint.as.me/schedule/785b0225/appointment/92729599/calendar/13871531?appointmentTypeIds[]=92729599';
  var consultLink    = 'https://docs.google.com/forms/d/1uEvcX-esGwYE0Elcf88DdMA1qQ2xNkcn4bCoCX2Ttb0/viewform';

  return (
    '<!DOCTYPE html>' +
    '<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>' +
    '<body style="margin:0;padding:0;background:#f0f0f0;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#f0f0f0">' +
    '<tr><td align="center" style="padding:32px 8px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;border-radius:6px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.15);">' +

    '<tr><td bgcolor="#111111" style="padding:32px 40px 28px;">' +
      '<table width="100%" cellpadding="0" cellspacing="0" border="0">' +
      '<tr><td><table cellpadding="0" cellspacing="0" border="0" style="display:inline-table;"><tr><td bgcolor="#f5a800" style="padding:8px 14px;border-radius:4px;"><span style="font-family:Arial Black,Arial,sans-serif;font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-1px;">TSB</span></td></tr></table></td></tr>' +
      '<tr><td style="padding-top:18px;"><p style="margin:0;font-family:Arial,sans-serif;font-size:10px;font-weight:700;letter-spacing:4px;text-transform:uppercase;color:#f5a800;">The Strength Blueprint</p></td></tr>' +
      '<tr><td style="padding-top:10px;"><h1 style="margin:0;font-family:Arial Black,Arial,sans-serif;font-size:28px;font-weight:900;color:#ffffff;text-transform:uppercase;letter-spacing:0.5px;line-height:1.2;">Let\'s Get You<br>Assessed, ' + name + '.</h1></td></tr>' +
      '</table>' +
    '</td></tr>' +

    '<tr><td bgcolor="#f5a800" style="height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>' +

    '<tr><td bgcolor="#ffffff" style="padding:36px 40px;">' +
      '<p style="margin:0 0 28px;font-family:Arial,sans-serif;font-size:16px;line-height:1.75;color:#333333;">Thanks for reaching out. Your next two steps are simple:</p>' +

      '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;"><tr>' +
        '<td width="36" valign="top"><table cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#f5a800" style="width:28px;height:28px;border-radius:50%;text-align:center;vertical-align:middle;"><span style="font-family:Arial Black,Arial,sans-serif;font-size:13px;font-weight:900;color:#ffffff;">1</span></td></tr></table></td>' +
        '<td style="padding-left:14px;padding-top:2px;">' +
          '<p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:#111111;">Book your free 30-min call</p>' +
          '<p style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:13px;color:#666666;line-height:1.6;">No pitch — just a conversation to figure out where you are and where you want to go.</p>' +
          '<a href="' + acuityLink + '" style="display:inline-block;padding:10px 22px;background:#f5a800;color:#111111;font-family:Arial Black,Arial,sans-serif;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1px;text-decoration:none;border-radius:3px;">Book Free Call &rarr;</a>' +
        '</td>' +
      '</tr></table>' +

      '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:36px;"><tr>' +
        '<td width="36" valign="top"><table cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="#111111" style="width:28px;height:28px;border-radius:50%;text-align:center;vertical-align:middle;"><span style="font-family:Arial Black,Arial,sans-serif;font-size:13px;font-weight:900;color:#ffffff;">2</span></td></tr></table></td>' +
        '<td style="padding-left:14px;padding-top:2px;">' +
          '<p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:#111111;">Fill out the consultation form</p>' +
          '<p style="margin:0 0 10px;font-family:Arial,sans-serif;font-size:13px;color:#666666;line-height:1.6;">Takes 5&ndash;10 minutes. The more detail you give, the better the call goes.</p>' +
          '<a href="' + consultLink + '" style="display:inline-block;padding:10px 22px;background:#f0f0f0;color:#111111;font-family:Arial Black,Arial,sans-serif;font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:1px;text-decoration:none;border-radius:3px;">Open Consultation Form &rarr;</a>' +
        '</td>' +
      '</tr></table>' +

      '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;"><tr><td style="border-top:1px solid #eeeeee;">&nbsp;</td></tr></table>' +

      '<p style="margin:0;font-family:Arial,sans-serif;font-size:15px;color:#333333;line-height:1.6;">' +
        'Questions before the call? Just reply to this email.<br><br>' +
        '<strong style="color:#111111;">The Strength Blueprint Team</strong><br>' +
        '<span style="color:#f5a800;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Assessment-Driven. Criterion-Progressed.</span>' +
      '</p>' +
    '</td></tr>' +

    '<tr><td bgcolor="#111111" style="padding:18px 40px;"><p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#666666;letter-spacing:2px;text-transform:uppercase;">Evidence-Based &nbsp;&#183;&nbsp; Clinical-Grade &nbsp;&#183;&nbsp; Online Strength Coaching</p></td></tr>' +

    '</table></td></tr></table></body></html>'
  );
}
