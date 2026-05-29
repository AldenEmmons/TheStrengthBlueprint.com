// ============================================================
// NoteService.gs — Notes and activity log operations
// ============================================================

var NOTES_SHEET = 'Notes';

function getNotesForLead(leadId) {
  var sheet = getSheet(NOTES_SHEET);
  var all = sheetToObjects(sheet);
  var filtered = all.filter(function(n) { return n.lead_id === leadId; });
  // Sort descending by created_at
  filtered.sort(function(a, b) {
    return new Date(b.created_at) - new Date(a.created_at);
  });
  return filtered;
}

function createNote(leadId, type, content, createdBy) {
  var sheet = getSheet(NOTES_SHEET);
  var noteId = generateId('note');
  var now = new Date().toISOString();

  sheet.appendRow([
    noteId,               // A: note_id
    leadId,               // B: lead_id
    type || 'Note',       // C: type
    content || '',        // D: content
    now,                  // E: created_at
    createdBy || ''       // F: created_by
  ]);

  incrementNotesCount(leadId);

  return {
    note_id: noteId,
    lead_id: leadId,
    type: type || 'Note',
    content: content || '',
    created_at: now,
    created_by: createdBy || ''
  };
}

function deleteNote(noteId) {
  var sheet = getSheet(NOTES_SHEET);
  var colIndex = getColIndex(sheet, 'note_id');
  var result = findRowByColumnValue(sheet, colIndex, noteId);
  if (!result) return false;
  sheet.deleteRow(result.rowIndex);
  return true;
}
