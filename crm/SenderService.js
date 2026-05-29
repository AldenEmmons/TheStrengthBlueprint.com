// ============================================================
// SenderService.gs — Daily trigger: sends scheduled plan emails
//
// Setup: run installSenderTrigger() once to register the daily trigger.
// ============================================================

/**
 * Run once to install the daily 9 AM trigger.
 */
function installSenderTrigger() {
  // Remove any existing trigger to avoid duplicates
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'checkAndSendScheduledEmails') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('checkAndSendScheduledEmails')
    .timeBased()
    .atHour(9)
    .everyDays(1)
    .create();
  Logger.log('SenderService: daily trigger installed.');
}

/**
 * Runs daily at 9 AM. Sends any plan emails whose send_at time has passed.
 */
function checkAndSendScheduledEmails() {
  var ss    = getSpreadsheet();
  var sheet = ss.getSheetByName('PendingSends');
  if (!sheet) {
    Logger.log('SenderService: no PendingSends sheet found');
    return;
  }

  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return;

  var headers = data[0];
  var now     = new Date();
  var sentCol = headers.indexOf('sent') + 1; // 1-based for setRange

  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      obj[headers[j]] = row[j];
    }

    if (obj.sent === 'TRUE' || obj.sent === true) continue;

    var sendAt = new Date(obj.send_at);
    if (sendAt > now) continue;

    // Time to send
    try {
      var draft = GmailApp.getDraft(String(obj.draft_id));
      if (!draft) {
        Logger.log('SenderService: draft not found for ' + obj.client_email + ' — marking sent to avoid loop');
        sheet.getRange(i + 1, sentCol).setValue('ERROR: draft missing');
        continue;
      }

      draft.send();
      sheet.getRange(i + 1, sentCol).setValue('TRUE');
      Logger.log('SenderService: sent plan to ' + obj.client_email);

      // Notify trainer
      var trainerEmails = PropertiesService.getScriptProperties().getProperty('TRAINER_EMAIL') || '';
      if (trainerEmails) {
        GmailApp.sendEmail(
          trainerEmails,
          'Plan sent: ' + obj.client_name,
          'The workout plan for ' + obj.client_name + ' (' + obj.client_email + ') was automatically sent.\n\n— TSB Automation'
        );
      }

    } catch (err) {
      Logger.log('SenderService: failed to send for ' + obj.client_email + ' — ' + err.message);
    }
  }
}
