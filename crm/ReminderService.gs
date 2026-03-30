// ============================================================
// ReminderService.gs — Daily overdue follow-up email reminders
// ============================================================

/**
 * Called daily by time-driven trigger at 8 AM.
 * Finds overdue leads, sends one branded HTML email, marks them sent.
 */
function checkAndSendReminders() {
  var overdue = getOverdueLeads();
  if (overdue.length === 0) {
    Logger.log('ReminderService: no overdue leads today');
    return;
  }

  Logger.log('ReminderService: ' + overdue.length + ' overdue lead(s)');
  sendReminderEmail(overdue);
  markReminderSent(overdue);
}

/**
 * Returns leads where next_followup < today, stage is active, reminder not yet sent.
 */
function getOverdueLeads() {
  var leads = getAllLeads();
  var today = todayMidnight();
  var activeStages = ['New Lead', 'Contacted', 'Assessment Booked'];

  return leads.filter(function(lead) {
    if (!lead.next_followup) return false;
    if (activeStages.indexOf(lead.stage) < 0) return false;
    if (lead.reminder_sent === 'TRUE' || lead.reminder_sent === true) return false;

    var followup = new Date(lead.next_followup);
    followup.setHours(0, 0, 0, 0);
    return followup < today;
  });
}

/**
 * Sends a branded HTML reminder email listing all overdue leads.
 */
function sendReminderEmail(leads) {
  var to = getConfig('reminder_email_to') || '';
  if (!to) {
    Logger.log('ReminderService: reminder_email_to not configured in Config sheet');
    return;
  }

  var crmUrl = PropertiesService.getScriptProperties().getProperty('CRM_APP_URL') || '#';
  var today = new Date();
  var count = leads.length;
  var subject = '[TSB CRM] ' + count + ' Follow-up' + (count > 1 ? 's' : '') + ' Overdue';

  var rows = leads.map(function(lead) {
    var followupDate = lead.next_followup ? new Date(lead.next_followup) : null;
    var daysOverdue = 0;
    if (followupDate) {
      var diff = today - followupDate;
      daysOverdue = Math.floor(diff / (1000 * 60 * 60 * 24));
    }
    var name = ((lead.first_name || '') + ' ' + (lead.last_name || '')).trim() || 'Unknown';
    var assignedTo = lead.assigned_to || '—';
    var stage = lead.stage || '—';
    var daysStr = daysOverdue === 1 ? '1 day overdue' : daysOverdue + ' days overdue';

    return '<tr>' +
      '<td style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.08);color:#f4f1ec;font-size:14px;">' +
        '<strong>' + htmlEscape(name) + '</strong><br>' +
        '<span style="color:#8a9ab0;font-size:12px;">' + htmlEscape(lead.email || '') + '</span>' +
      '</td>' +
      '<td style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.08);color:#c9a84c;font-size:13px;">' + htmlEscape(stage) + '</td>' +
      '<td style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.08);color:#f4f1ec;font-size:13px;">' + htmlEscape(assignedTo) + '</td>' +
      '<td style="padding:10px 14px;border-bottom:1px solid rgba(255,255,255,0.08);color:#ff6b6b;font-size:13px;font-weight:600;">' + daysStr + '</td>' +
    '</tr>';
  }).join('');

  var htmlBody = '<!DOCTYPE html><html><head><meta charset="UTF-8">' +
    '<link href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;600&display=swap" rel="stylesheet">' +
    '</head><body style="margin:0;padding:0;background:#080c14;font-family:\'DM Sans\',sans-serif;">' +
    '<div style="max-width:640px;margin:0 auto;padding:32px 16px;">' +

    // Header
    '<div style="margin-bottom:24px;">' +
      '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:28px;letter-spacing:2px;color:#f4f1ec;">' +
        'THE STRENGTH <span style="color:#c9a84c;">BLUEPRINT</span>' +
      '</div>' +
      '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:16px;letter-spacing:3px;color:#8a9ab0;margin-top:2px;">CRM DAILY DIGEST</div>' +
    '</div>' +

    // Alert box
    '<div style="background:#0d1220;border:1px solid rgba(201,168,76,0.3);border-left:4px solid #c9a84c;border-radius:8px;padding:20px 24px;margin-bottom:24px;">' +
      '<div style="font-family:\'Bebas Neue\',sans-serif;font-size:20px;letter-spacing:1px;color:#c9a84c;margin-bottom:6px;">' +
        count + ' FOLLOW-UP' + (count > 1 ? 'S' : '') + ' OVERDUE' +
      '</div>' +
      '<div style="color:#8a9ab0;font-size:14px;">These leads need attention today — don\'t let them go cold.</div>' +
    '</div>' +

    // Table
    '<div style="background:#0d1220;border:1px solid rgba(255,255,255,0.06);border-radius:8px;overflow:hidden;margin-bottom:24px;">' +
      '<table style="width:100%;border-collapse:collapse;">' +
        '<thead>' +
          '<tr style="background:#111828;">' +
            '<th style="padding:10px 14px;text-align:left;color:#8a9ab0;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Lead</th>' +
            '<th style="padding:10px 14px;text-align:left;color:#8a9ab0;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Stage</th>' +
            '<th style="padding:10px 14px;text-align:left;color:#8a9ab0;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Assigned</th>' +
            '<th style="padding:10px 14px;text-align:left;color:#8a9ab0;font-size:11px;letter-spacing:1px;text-transform:uppercase;">Overdue</th>' +
          '</tr>' +
        '</thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</div>' +

    // CTA
    '<div style="text-align:center;margin-bottom:32px;">' +
      '<a href="' + crmUrl + '" style="display:inline-block;background:#c9a84c;color:#080c14;font-family:\'Bebas Neue\',sans-serif;font-size:16px;letter-spacing:2px;padding:14px 32px;border-radius:6px;text-decoration:none;">OPEN CRM DASHBOARD</a>' +
    '</div>' +

    // Footer
    '<div style="color:#8a9ab0;font-size:12px;text-align:center;border-top:1px solid rgba(255,255,255,0.06);padding-top:16px;">' +
      'The Strength Blueprint CRM &bull; Sent ' + today.toLocaleDateString() +
    '</div>' +
    '</div></body></html>';

  MailApp.sendEmail({
    to: to,
    subject: subject,
    htmlBody: htmlBody
  });

  Logger.log('ReminderService: reminder email sent to ' + to);
}

/**
 * Marks reminder_sent = TRUE for all provided leads.
 */
function markReminderSent(leads) {
  leads.forEach(function(lead) {
    updateLead(lead.lead_id, { reminder_sent: 'TRUE' });
  });
}

/**
 * Escapes HTML special characters.
 */
function htmlEscape(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
