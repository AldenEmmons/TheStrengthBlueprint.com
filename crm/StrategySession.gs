// ============================================================
// StrategySession.gs — Sends the $299 strategy session booking
// link to a Warm Lead. Called from the CRM via google.script.run.
// ============================================================

var STRATEGY_SESSION_URL = 'https://TheStrengthBlueprint.as.me/?appointmentType=93827396';

function sendStrategySessionLink(leadId) {
  var lead = getLeadById(leadId);
  if (!lead) throw new Error('Lead not found: ' + leadId);

  var email     = lead.email;
  var firstName = lead.first_name || 'there';

  if (!email) throw new Error('Lead has no email address');

  GmailApp.sendEmail(email, 'Your Next Step — Book Your Strategy Session | The Strength Blueprint', '', {
    htmlBody: buildStrategySessionEmailBody(firstName),
    name: 'The Strength Blueprint'
  });

  createNote(leadId, 'Note', 'Strategy session link sent to ' + email + '.', 'system');
  Logger.log('sendStrategySessionLink: sent to ' + email);

  return { status: 'ok' };
}

function buildStrategySessionEmailBody(firstName) {
  var name = firstName || 'there';
  var link = STRATEGY_SESSION_URL;

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
      '<tr><td style="padding-top:10px;"><h1 style="margin:0;font-family:Arial Black,Arial,sans-serif;font-size:28px;font-weight:900;color:#ffffff;text-transform:uppercase;letter-spacing:0.5px;line-height:1.2;">Let\'s Build Your<br>Blueprint, ' + name + '.</h1></td></tr>' +
      '</table>' +
    '</td></tr>' +

    '<tr><td bgcolor="#f5a800" style="height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>' +

    '<tr><td bgcolor="#ffffff" style="padding:36px 40px;">' +
      '<p style="margin:0 0 20px;font-family:Arial,sans-serif;font-size:16px;line-height:1.75;color:#333333;">' +
        'Based on our call, I think you\'re a strong fit for the program. Here\'s your link to book your Blueprint Strategy Session and lock in your first month.' +
      '</p>' +

      '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;background:#f9f9f9;border-radius:6px;border:1px solid #eee;">' +
        '<tr><td style="padding:20px 24px;">' +
          '<p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#999;">What\'s included</p>' +
          '<p style="margin:0 0 12px;font-family:Arial,sans-serif;font-size:15px;font-weight:700;color:#111;">Blueprint Strategy Session (60 min)</p>' +
          '<p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:14px;color:#555;line-height:1.6;">&#10003; &nbsp;Deep-dive into your history, goals, and movement</p>' +
          '<p style="margin:0 0 4px;font-family:Arial,sans-serif;font-size:14px;color:#555;line-height:1.6;">&#10003; &nbsp;Phase placement and program direction</p>' +
          '<p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:14px;color:#555;line-height:1.6;">&#10003; &nbsp;First month of personalized coaching</p>' +
          '<p style="margin:0;font-family:Arial Black,Arial,sans-serif;font-size:22px;font-weight:900;color:#111;">$299 <span style="font-size:13px;font-weight:400;color:#888;">/ first month</span></p>' +
        '</td></tr>' +
      '</table>' +

      '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:32px;"><tr>' +
        '<td align="center">' +
          '<a href="' + link + '" style="display:inline-block;padding:16px 40px;background:#f5a800;color:#111111;font-family:Arial Black,Arial,sans-serif;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:2px;text-decoration:none;border-radius:4px;">Book My Strategy Session &rarr;</a>' +
        '</td>' +
      '</tr></table>' +

      '<table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;"><tr><td style="border-top:1px solid #eeeeee;">&nbsp;</td></tr></table>' +

      '<p style="margin:0;font-family:Arial,sans-serif;font-size:15px;color:#333333;line-height:1.6;">' +
        'Questions? Just reply to this email.<br><br>' +
        '<strong style="color:#111111;">The Strength Blueprint Team</strong><br>' +
        '<span style="color:#f5a800;font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;">Assessment-Driven. Criterion-Progressed.</span>' +
      '</p>' +
    '</td></tr>' +

    '<tr><td bgcolor="#111111" style="padding:18px 40px;"><p style="margin:0;font-family:Arial,sans-serif;font-size:11px;color:#666666;letter-spacing:2px;text-transform:uppercase;">Evidence-Based &nbsp;&#183;&nbsp; Clinical-Grade &nbsp;&#183;&nbsp; Online Strength Coaching</p></td></tr>' +

    '</table></td></tr></table></body></html>'
  );
}
