// ============================================================
// Ecodrive — Fuel Efficiency App
// Five Elements International School — Team Ecodrive
// ============================================================

const SPREADSHEET_ID = ''; // SET YOUR SPREADSHEET ID
const READINGS_SHEET = 'Readings';
const ROUTES_SHEET = 'Routes';
const USERS_SHEET = 'Users';

function getSheet(name) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName(name);
  if (sheet) return sheet;
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().trim().toLowerCase() === name.trim().toLowerCase()) return sheets[i];
  }
  return null;
}

function sheetToArray(name) {
  var sheet = getSheet(name);
  if (!sheet) return [];
  var data = sheet.getDataRange().getDisplayValues();
  if (data.length < 2) return [];
  var h = data[0], rows = [];
  for (var i = 1; i < data.length; i++) {
    var obj = {};
    for (var j = 0; j < h.length; j++) obj[h[j]] = data[i][j];
    rows.push(obj);
  }
  return rows;
}

// --- Web App ---

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'readings';
  var result;
  switch (action) {
    case 'readings': result = sheetToArray(READINGS_SHEET); break;
    case 'routes': result = getRoutes(); break;
    case 'daily': result = getDailyUsage(); break;
    case 'stats': result = getStats(); break;
    default: result = {error:'Unknown'};
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    if (data.action === 'login') {
      return ContentService.createTextOutput(JSON.stringify(login(data.username, data.password))).setMimeType(ContentService.MimeType.JSON);
    }
    var auth = login(data.auth ? data.auth.username : '', data.auth ? data.auth.password : '');
    if (!auth.success || auth.role !== 'admin') {
      return ContentService.createTextOutput(JSON.stringify({success:false,message:'Unauthorized'})).setMimeType(ContentService.MimeType.JSON);
    }
    var result;
    switch (data.action) {
      case 'saveReadings': result = saveReadings(data); break;
      case 'deleteDate': result = deleteDate(data); break;
      case 'saveRoutes': result = saveRoutes(data); break;
      case 'setupData': setupData(); result = {success:true}; break;
      default: result = {error:'Unknown action'};
    }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({success:false,error:err.toString()})).setMimeType(ContentService.MimeType.JSON);
  }
}

// --- Readings ---

function saveReadings(data) {
  var sheet = getSheet(READINGS_SHEET);
  if (!sheet) return {success:false, message:'Sheet not found'};
  // data.date, data.entries: [{route, reading, notes}]
  // First delete existing entries for this date
  var all = sheet.getDataRange().getDisplayValues();
  for (var i = all.length - 1; i >= 1; i--) {
    if (all[i][0] === data.date) sheet.deleteRow(i + 1);
  }
  // Insert new entries
  var entries = data.entries || [];
  for (var j = 0; j < entries.length; j++) {
    var e = entries[j];
    sheet.appendRow([data.date, e.route, e.reading || '', e.notes || '']);
  }
  return {success:true, count: entries.length};
}

function deleteDate(data) {
  var sheet = getSheet(READINGS_SHEET);
  if (!sheet) return {success:false};
  var all = sheet.getDataRange().getDisplayValues();
  for (var i = all.length - 1; i >= 1; i--) {
    if (all[i][0] === data.date) sheet.deleteRow(i + 1);
  }
  return {success:true};
}

// --- Daily Usage (difference between consecutive days) ---

function getDailyUsage() {
  var readings = sheetToArray(READINGS_SHEET);
  // Group by route, sort by date
  var byRoute = {};
  for (var i = 0; i < readings.length; i++) {
    var r = readings[i];
    if (!byRoute[r.Route]) byRoute[r.Route] = [];
    byRoute[r.Route].push({date: r.Date, reading: r.Reading, notes: r.Notes});
  }
  
  var usage = [];
  for (var route in byRoute) {
    var entries = byRoute[route].sort(function(a,b) { return new Date(a.date) - new Date(b.date); });
    for (var j = 1; j < entries.length; j++) {
      var prev = parseFloat(entries[j-1].reading);
      var curr = parseFloat(entries[j].reading);
      var diff = '';
      if (!isNaN(prev) && !isNaN(curr)) {
        diff = (curr - prev).toFixed(1);
      }
      usage.push({
        route: route,
        date: entries[j].date,
        prevDate: entries[j-1].date,
        prevReading: entries[j-1].reading,
        reading: entries[j].reading,
        usage: diff,
        notes: entries[j].notes || entries[j-1].notes || ''
      });
    }
  }
  // Sort by date desc
  usage.sort(function(a,b) { return new Date(b.date) - new Date(a.date); });
  return usage;
}

// --- Stats ---

function getStats() {
  var usage = getDailyUsage();
  var routeStats = {};
  for (var i = 0; i < usage.length; i++) {
    var u = usage[i];
    var val = parseFloat(u.usage);
    if (isNaN(val)) continue;
    if (!routeStats[u.route]) routeStats[u.route] = {total:0, count:0, max:0, min:Infinity};
    routeStats[u.route].total += val;
    routeStats[u.route].count++;
    if (val > routeStats[u.route].max) routeStats[u.route].max = val;
    if (val < routeStats[u.route].min) routeStats[u.route].min = val;
  }
  var result = {};
  for (var rt in routeStats) {
    var s = routeStats[rt];
    result[rt] = {avg: (s.total/s.count).toFixed(1), total: s.total.toFixed(1), days: s.count, max: s.max.toFixed(1), min: s.min === Infinity ? '0' : s.min.toFixed(1)};
  }
  return result;
}

// --- Routes ---

function getRoutes() {
  var sheet = getSheet(ROUTES_SHEET);
  if (!sheet) return [];
  var data = sheet.getDataRange().getDisplayValues();
  var r = [];
  for (var i = 1; i < data.length; i++) if (data[i][0]) r.push(data[i][0].trim());
  return r;
}

function saveRoutes(data) {
  var sheet = getSheet(ROUTES_SHEET) || SpreadsheetApp.openById(SPREADSHEET_ID).insertSheet(ROUTES_SHEET);
  sheet.clear(); sheet.appendRow(['Route']);
  (data.items||[]).forEach(function(v){sheet.appendRow([v]);});
  return {success:true};
}

// --- Auth ---

function login(username, password) {
  var sheet = getSheet(USERS_SHEET);
  if (!sheet) return {success:false, message:'Users sheet not found'};
  var data = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0]).trim()===String(username).trim() && String(data[i][1]).trim()===String(password).trim())
      return {success:true, role:String(data[i][2]).trim(), displayName:String(data[i][3]).trim(), username:String(data[i][0]).trim()};
  }
  return {success:false, message:'Invalid credentials'};
}

// --- Setup ---

function setupData() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  var us = ss.getSheetByName(USERS_SHEET)||ss.insertSheet(USERS_SHEET); us.clear();
  us.appendRow(['Username','Password','Role','DisplayName']);
  us.appendRow(['admin','admin123','admin','Administrator']);
  us.appendRow(['madhuri','teach123','admin','Ms. Madhuri']);

  var rs = ss.getSheetByName(ROUTES_SHEET)||ss.insertSheet(ROUTES_SHEET); rs.clear();
  rs.appendRow(['Route']);
  for (var i = 1; i <= 16; i++) rs.appendRow(['R' + i]);

  var rd = ss.getSheetByName(READINGS_SHEET)||ss.insertSheet(READINGS_SHEET); rd.clear();
  rd.appendRow(['Date','Route','Reading','Notes']);
  // Sample data
  var sample = {
    '16 Apr 2026': {'R1':'32202','R2':'44770','R3':'38957','R4':'31374','R5':'32492','R6':'19347','R7':'12614','R8':'16912','R9':'14709','R10':'16183','R11':'23885','R12':'15271','R13':'17678','R14':'37804','R15':'1797','R16':'1383'},
    '17 Apr 2026': {'R1':'32292','R2':'44867','R3':'39038','R4':'31453','R5':'32601','R6':'19411','R7':'12650','R8':'16998','R9':'14806','R10':'16249','R11':'23937','R12':'15338','R13':'17750','R14':'37903','R15':'1842','R16':'1445'},
    '18 Apr 2026': {'R1':'32369','R2':'44934','R3':'39117','R4':'','R5':'32677','R6':'19499','R7':'12728','R8':'17092','R9':'14862','R10':'16307','R11':'24028','R12':'15382','R13':'17814','R14':'37969','R15':'1880','R16':'1510'}
  };
  var notes18 = {'R4':'Went to Garage'};
  for (var date in sample) {
    for (var route in sample[date]) {
      var note = (date === '18 Apr 2026' && notes18[route]) ? notes18[route] : '';
      rd.appendRow([date, route, sample[date][route], note]);
    }
  }
  Logger.log('Setup complete');
}
