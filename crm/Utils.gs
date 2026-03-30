// ============================================================
// Utils.gs — Shared utility functions
// ============================================================

var SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet(name) {
  return getSpreadsheet().getSheetByName(name);
}

/**
 * Converts a sheet to an array of objects using row 1 as headers.
 */
function sheetToObjects(sheet) {
  var data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  var headers = data[0];
  var objects = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < headers.length; j++) {
      var val = data[i][j];
      // Normalize dates to ISO strings
      if (val instanceof Date) {
        obj[headers[j]] = val.toISOString();
      } else {
        obj[headers[j]] = val;
      }
    }
    // Skip soft-deleted rows
    if (obj['deleted'] === true || obj['deleted'] === 'TRUE') continue;
    objects.push(obj);
  }
  return objects;
}

/**
 * Finds a row in a sheet by matching a column value.
 * @param {Sheet} sheet
 * @param {number} colIndex — 0-based
 * @param {string} value
 * @returns {{ row: Array, rowIndex: number } | null} rowIndex is 1-based sheet row
 */
function findRowByColumnValue(sheet, colIndex, value) {
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][colIndex]) === String(value)) {
      return { row: data[i], rowIndex: i + 1 };
    }
  }
  return null;
}

/**
 * Returns the 0-based column index for a given header name.
 */
function getColIndex(sheet, headerName) {
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  return headers.indexOf(headerName);
}

/**
 * Generates a unique ID with an optional prefix.
 */
function generateId(prefix) {
  var p = prefix || 'id';
  return p + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
}

/**
 * Reads a value from the Config sheet by key.
 */
function getConfig(key) {
  var sheet = getSheet('Config');
  var data = sheet.getDataRange().getValues();
  for (var i = 0; i < data.length; i++) {
    if (data[i][0] === key) return data[i][1];
  }
  return null;
}

/**
 * Returns today's date at midnight (local Apps Script timezone).
 */
function todayMidnight() {
  var d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
