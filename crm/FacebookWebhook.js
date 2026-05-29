// ============================================================
// FacebookWebhook.gs — Facebook Lead Ads webhook handler
// ============================================================

function getPageAccessToken() {
  return PropertiesService.getScriptProperties().getProperty('FB_PAGE_ACCESS_TOKEN');
}

/**
 * Main entry point for Facebook webhook payloads.
 * Called from doPost() in Code.gs.
 */
function processLeadEvent(payload) {
  if (!payload || !payload.entry) {
    Logger.log('FacebookWebhook: no entry in payload');
    return;
  }

  var token = getPageAccessToken();
  if (!token) {
    Logger.log('FacebookWebhook: FB_PAGE_ACCESS_TOKEN not set in Script Properties');
    return;
  }

  for (var i = 0; i < payload.entry.length; i++) {
    var entry = payload.entry[i];
    if (!entry.changes) continue;

    for (var j = 0; j < entry.changes.length; j++) {
      var change = entry.changes[j];
      if (change.field !== 'leadgen') continue;

      var value = change.value;
      var leadgenId = value.leadgen_id;

      if (!leadgenId) {
        Logger.log('FacebookWebhook: no leadgen_id in change value');
        continue;
      }

      // Idempotency: skip if already in CRM
      var existing = findLeadByFbLeadId(leadgenId);
      if (existing) {
        Logger.log('FacebookWebhook: duplicate leadgen_id ' + leadgenId + ', skipping');
        continue;
      }

      try {
        var fieldData = fetchLeadDetails(leadgenId, token);
        var leadData = mapFacebookFieldsToLead(fieldData, {
          fb_lead_id: leadgenId,
          fb_ad_id: value.ad_id || '',
          fb_form_name: value.form_id ? 'Form ' + value.form_id : ''
        });
        createLead(leadData);
        Logger.log('FacebookWebhook: created lead for leadgen_id ' + leadgenId);
      } catch (err) {
        Logger.log('FacebookWebhook: error processing leadgen_id ' + leadgenId + ': ' + err.message);
      }
    }
  }
}

/**
 * Fetches lead field data from Facebook Graph API.
 */
function fetchLeadDetails(leadgenId, token) {
  var url = 'https://graph.facebook.com/v19.0/' + leadgenId +
    '?fields=field_data,ad_id,form_id,created_time&access_token=' + token;

  var response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  var code = response.getResponseCode();
  var body = response.getContentText();

  if (code !== 200) {
    Logger.log('FacebookWebhook: Graph API error ' + code + ': ' + body);
    // Check for token expiry
    if (body.indexOf('OAuthException') >= 0 || body.indexOf('190') >= 0) {
      Logger.log('FacebookWebhook: PAGE ACCESS TOKEN MAY BE EXPIRED — refresh in Script Properties');
    }
    throw new Error('Graph API returned ' + code);
  }

  return JSON.parse(body);
}

/**
 * Maps Facebook field_data array + meta into CRM lead schema.
 * Facebook field names (set in your Lead Ad form):
 *   first_name, last_name, email, phone_number
 *   + custom fields: pain_area, goal
 */
function mapFacebookFieldsToLead(graphResponse, fbMeta) {
  var fields = graphResponse.field_data || [];
  var mapped = {};

  fields.forEach(function(field) {
    var key = field.name;
    var val = field.values && field.values[0] ? field.values[0] : '';
    mapped[key] = val;
  });

  return {
    first_name:    mapped.first_name || mapped.firstName || '',
    last_name:     mapped.last_name || mapped.lastName || '',
    email:         mapped.email || '',
    phone:         mapped.phone_number || mapped.phone || '',
    pain_area:     mapped.pain_area || mapped.pain_point || '',
    goal:          mapped.goal || mapped.goals || '',
    source:        'Facebook Lead Ad',
    stage:         'New Lead',
    fb_lead_id:    fbMeta.fb_lead_id || '',
    fb_ad_id:      fbMeta.fb_ad_id || '',
    fb_form_name:  fbMeta.fb_form_name || ''
  };
}

/**
 * Handles flat Zapier payloads (fallback if direct webhook is blocked).
 * Zapier maps fields to flat JSON object.
 */
function processZapierPayload(data) {
  if (!data) return;

  var fbLeadId = data.fb_lead_id || data.id || '';
  if (fbLeadId) {
    var existing = findLeadByFbLeadId(fbLeadId);
    if (existing) {
      Logger.log('processZapierPayload: duplicate fb_lead_id ' + fbLeadId + ', skipping');
      return;
    }
  }

  var leadData = {
    first_name:   data.first_name || '',
    last_name:    data.last_name || '',
    email:        data.email || '',
    phone:        data.phone_number || data.phone || '',
    pain_area:    data.pain_area || '',
    goal:         data.goal || '',
    source:       'Facebook Lead Ad',
    stage:        'New Lead',
    fb_lead_id:   fbLeadId,
    fb_ad_id:     data.ad_id || '',
    fb_form_name: data.form_name || ''
  };

  return createLead(leadData);
}
