/**
 * キテネマスター - Google Apps Script API v5.2.3 + v3.7
 * 17列対応版（オキニトーク数をシフトデータに保存）
 * ★ 当欠時の日記出力シート連動機能（v3.7: 当欠日記ON/OFF対応）
 * ★ v5.2: 明日の戦略スペース追加
 * ★ v5.2.1: 戦略の日付比較を正規化（日付自動変換による読込消え対策）
 * ★ v5.2.2: 同じ日付は1行に統合（重複行を自動削除）
 * ★ v5.2.3: getInitialDataに戦略を相乗り（表示の時間差を解消）
 */

// スプレッドシートIDを設定
const SPREADSHEET_ID = '1W9mRrYHwiHoSz72eMJdheiOjur-BGHoM-itFIoKCWVM';
const SHEET_NAME_SHIFT = 'シフトデータ';
const SHEET_NAME_URL = 'URL管理';
const SHEET_NAME_SETTINGS = '設定';
const SHEET_NAME_HISTORY = '面談履歴';
const SHEET_NAME_DIARY_OUTPUT = '日記出力';
const SHEET_NAME_STRATEGY = '戦略';  // ★明日の戦略スペース

/**
 * GETリクエストの処理
 */
function doGet(e) {
  const action = e.parameter.action;
  
  try {
    let result;
    
    switch(action) {
      case 'getShiftData':
        result = getShiftData();
        break;
      case 'getUrlData':
        result = getUrlData();
        break;
      case 'getShiftDate':
        result = getShiftDate();
        break;
      case 'getInterviewHistory':
        result = getInterviewHistory(e.parameter.name);
        break;
      case 'getAllInterviewHistory':
        result = getAllInterviewHistory();
        break;
      case 'getOkiniData':
        result = getOkiniData();
        break;
      case 'getInitialData':
        result = getInitialData();
        break;
      case 'getStrategy':
        result = getStrategy(e.parameter.date);
        break;
      default:
        result = { success: false, error: 'Invalid action' };
    }
    
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch(error) {
    return ContentService
      .createTextOutput(JSON.stringify({ 
        success: false, 
        error: error.toString() 
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * POSTリクエストの処理
 */
function doPost(e) {
  const action = e.parameter.action;
  
  try {
    let result;
    let postData;
    
    try {
      if (e.postData && e.postData.contents) {
        postData = JSON.parse(e.postData.contents);
      } else {
        return ContentService
          .createTextOutput(JSON.stringify({ 
            success: false, 
            error: 'No post data' 
          }))
          .setMimeType(ContentService.MimeType.JSON);
      }
    } catch(parseError) {
      return ContentService
        .createTextOutput(JSON.stringify({ 
          success: false, 
          error: 'Failed to parse post data: ' + parseError.toString() 
        }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    switch(action) {
      case 'updateShiftData':
        result = updateShiftData(postData.data);
        break;
      case 'updateCheckStatus':
        result = updateCheckStatus(postData.name, postData.store, postData.checked);
        break;
      case 'addUrlData':
        result = addUrlData(postData);
        break;
      case 'updateUrlData':
        result = updateUrlData(postData);
        break;
      case 'deleteUrlData':
        result = deleteUrlData(postData.name);
        break;
      case 'saveShiftDate':
        result = saveShiftDate(postData.date);
        break;
      case 'resetAllChecks':
        result = resetAllChecks();
        break;
      case 'updateLastWorkDate':
        result = updateLastWorkDate(postData.names, postData.date);
        break;
      case 'addInterviewHistory':
        result = addInterviewHistory(postData);
        break;
      case 'updateInterviewHistory':
        result = updateInterviewHistory(postData);
        break;
      case 'deleteInterviewHistory':
        result = deleteInterviewHistory(postData.rowIndex);
        break;
      case 'getInterviewHistory':
        result = getInterviewHistory(postData.name);
        break;
      case 'updateOkiniCount':
        result = updateOkiniCount(postData);
        break;
      case 'updateOkiniTalked':
        result = updateOkiniTalked(postData);
        break;
      case 'updateShiftTime':
        result = updateShiftTime(postData);
        break;
      case 'saveStrategy':
        result = saveStrategy(postData.date, postData.stores);
        break;
      default:
        result = { success: false, error: 'Invalid action: ' + action };
    }
    
    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
      
  } catch(error) {
    return ContentService
      .createTextOutput(JSON.stringify({ 
        success: false, 
        error: error.toString() 
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * シフトデータを取得（17列対応: A〜Q）
 */
function getShiftData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME_SHIFT);
  
  if (!sheet) {
    return { success: false, error: 'シフトデータシートが見つかりません' };
  }
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { success: true, data: [] };
  }
  
  const range = sheet.getRange(2, 1, lastRow - 1, 17);
  const values = range.getValues();
  
  const data = values.map(row => ({
    name: row[0],
    time: row[1],
    status: row[2],
    delidosuName: row[3],
    delidosuUrl: row[4],
    anecanName: row[5],
    anecanUrl: row[6],
    ainoshizukuName: row[7],
    ainoshizukuUrl: row[8],
    checked: row[9],
    talkedDelidosu: row[10] || '',
    talkedAnecan: row[11] || '',
    talkedAinoshizuku: row[12] || '',
    originalTime: row[13] || '',
    okiniDelidosu: row[14] !== '' && row[14] !== undefined && row[14] !== null ? String(row[14]) : '',
    okiniAnecan: row[15] !== '' && row[15] !== undefined && row[15] !== null ? String(row[15]) : '',
    okiniAinoshizuku: row[16] !== '' && row[16] !== undefined && row[16] !== null ? String(row[16]) : ''
  }));
  
  return { success: true, data: data };
}

/**
 * URL管理データを取得（19列対応）
 */
function getUrlData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME_URL);
  
  if (!sheet) {
    return { success: false, error: 'URL管理シートが見つかりません' };
  }
  
  ensureHeaders(sheet);
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { success: true, data: [] };
  }
  
  const range = sheet.getRange(2, 1, lastRow - 1, 19);
  const values = range.getValues();
  
  const data = values.map(row => ({
    name: row[0],
    delidosuName: row[1],
    delidosuUrl: row[2],
    anecanName: row[3],
    anecanUrl: row[4],
    ainoshizukuName: row[5],
    ainoshizukuUrl: row[6],
    class: row[7] || '通常',
    mainStore: row[8] || '',
    checkedDelidosu: row[9] || '',
    checkedAnecan: row[10] || '',
    checkedAinoshizuku: row[11] || '',
    sortOrder: row[12] || 0,
    lastWorkDate: row[13] || '',
    lastInterviewDate: row[14] || '',
    interviewStaff: row[15] || '',
    interviewComment: row[16] || '',
    lastPhotoDate: row[17] || '',
    lastVideoDate: row[18] || ''
  }));
  
  return { success: true, data: data };
}

/**
 * シフトデータを更新（17列クリア + 重複排除）
 */
function updateShiftData(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME_SHIFT);
  
  if (!sheet) {
    return { success: false, error: 'シフトデータシートが見つかりません' };
  }
  
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 17).clear();
  }
  
  var uniqueData = [];
  var seenNames = {};
  if (data && data.length > 0) {
    for (var i = 0; i < data.length; i++) {
      var name = data[i].name || '';
      if (name && !seenNames[name]) {
        seenNames[name] = true;
        uniqueData.push(data[i]);
      }
    }
  }
  
  if (uniqueData.length > 0) {
    const values = uniqueData.map(row => [
      row.name || '',
      row.time || '',
      row.status || '',
      row.delidosuName || '',
      row.delidosuUrl || '',
      row.anecanName || '',
      row.anecanUrl || '',
      row.ainoshizukuName || '',
      row.ainoshizukuUrl || '',
      ''
    ]);
    
    sheet.getRange(2, 1, values.length, 10).setValues(values);
  }
  
  return { success: true, message: uniqueData.length + '件のデータを更新しました（重複' + (data.length - uniqueData.length) + '件除外）' };
}

/**
 * チェック状態を更新（3チェック対応）
 */
function updateCheckStatus(name, store, checked) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME_URL);
  
  if (!sheet) {
    return { success: false, error: 'URL管理シートが見つかりません' };
  }
  
  const lastRow = sheet.getLastRow();
  const range = sheet.getRange(2, 1, lastRow - 1, 13);
  const values = range.getValues();
  
  const storeColumnMap = {
    'delidosu': 10,
    'anecan': 11,
    'ainoshizuku': 12
  };
  
  const columnNumber = storeColumnMap[store];
  if (!columnNumber) {
    return { success: false, error: '無効な店舗名です: ' + store };
  }
  
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === name) {
      sheet.getRange(i + 2, columnNumber).setValue(checked ? '済' : '');
      return { success: true, message: 'チェック状態を更新しました' };
    }
  }
  
  return { success: false, error: '該当する源氏名が見つかりません' };
}

/**
 * シフト日付を保存
 */
function saveShiftDate(date) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME_SETTINGS);
  
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_SETTINGS);
    sheet.getRange('A1').setValue('シフト日付');
  }
  
  sheet.getRange('B1').setValue(date);
  return { success: true, message: '日付を保存しました' };
}

/**
 * シフト日付を取得
 */
function getShiftDate() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME_SETTINGS);
  
  if (!sheet) {
    return { success: true, date: '' };
  }
  
  const date = sheet.getRange('B1').getValue() || '';
  return { success: true, date: date };
}

// ===============================
// ★ 明日の戦略スペース（getStrategy / saveStrategy）
// ===============================

/**
 * 戦略シートを取得（なければヘッダー付きで自動生成）
 */
function getStrategySheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SHEET_NAME_STRATEGY);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_STRATEGY);
    const headers = [
      '日付',
      'でりどす_出勤人数', 'でりどす_イベント内容', 'でりどす_チャット', 'でりどす_メール',
      'アネキャン_出勤人数', 'アネキャン_イベント内容', 'アネキャン_チャット', 'アネキャン_メール',
      'しずく_出勤人数', 'しずく_イベント内容', 'しずく_チャット', 'しずく_メール',
      '更新日時'
    ];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  // A列（日付）は常に文字列扱いにして「YYYY年MM月DD日」が日付変換されるのを防ぐ
  sheet.getRange('A:A').setNumberFormat('@');
  return sheet;
}

/**
 * 戦略シートの日付セルを「YYYY年MM月DD日」文字列に正規化
 * （Googleスプレッドシートが日付型に変換していても確実に比較できるようにする）
 */
function normalizeStrategyDate_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy年MM月dd日');
  }
  return String(v).trim();
}

/**
 * シフト日付の「翌日」を「YYYY年MM月DD日」で返す（戦略スペース用）
 * 文字列・Date・ISO いずれの入力でも対応
 */
function getStrategyTargetDateFromShiftDate_(shiftDate) {
  if (!shiftDate) return '';
  let y, mo, d;
  if (shiftDate instanceof Date) {
    y = shiftDate.getFullYear();
    mo = shiftDate.getMonth() + 1;
    d = shiftDate.getDate();
  } else {
    const m = String(shiftDate).match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (m) {
      y = Number(m[1]); mo = Number(m[2]); d = Number(m[3]);
    } else {
      const dt = new Date(String(shiftDate));
      if (isNaN(dt.getTime())) return '';
      y = dt.getFullYear(); mo = dt.getMonth() + 1; d = dt.getDate();
    }
  }
  const date = new Date(y, mo - 1, d);
  date.setDate(date.getDate() + 1);
  return Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy年MM月dd日');
}

/**
 * 戦略シートを手動で準備（手動実行用）
 * GASエディタでこの関数を1回実行すれば、戦略シートが作成されます。
 */
function setupStrategySheet() {
  getStrategySheet_();
  return '戦略シートを準備しました（既存の場合はそのまま）';
}

/**
 * 空の店舗データ構造を返す
 */
function emptyStrategyStores_() {
  const blank = { count: '', event: '', chat: '', mail: '' };
  return {
    delidosu: Object.assign({}, blank),
    anecan: Object.assign({}, blank),
    ainoshizuku: Object.assign({}, blank)
  };
}

/**
 * シートの1行（B〜M列の12項目）を店舗データ構造に変換
 */
function rowToStrategyStores_(row) {
  return {
    delidosu:    { count: row[0],  event: row[1],  chat: row[2],  mail: row[3] },
    anecan:      { count: row[4],  event: row[5],  chat: row[6],  mail: row[7] },
    ainoshizuku: { count: row[8],  event: row[9],  chat: row[10], mail: row[11] }
  };
}

/**
 * 指定日付の戦略を取得（なければ空で返す）
 * @param {string} date 「YYYY年MM月DD日」形式
 */
function getStrategy(date) {
  const sheet = getStrategySheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { success: true, date: date, found: false, stores: emptyStrategyStores_() };
  }
  const dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < dates.length; i++) {
    if (normalizeStrategyDate_(dates[i][0]) === normalizeStrategyDate_(date)) {
      const row = sheet.getRange(i + 2, 2, 1, 12).getValues()[0];
      return { success: true, date: date, found: true, stores: rowToStrategyStores_(row) };
    }
  }
  return { success: true, date: date, found: false, stores: emptyStrategyStores_() };
}

/**
 * 戦略を保存（同じ日付があれば上書き、なければ新規追加）
 * @param {string} date 「YYYY年MM月DD日」形式
 * @param {Object} stores { delidosu:{count,event,chat,mail}, anecan:{...}, ainoshizuku:{...} }
 */
function saveStrategy(date, stores) {
  if (!date) {
    return { success: false, error: '日付が指定されていません' };
  }
  const s = stores || emptyStrategyStores_();
  const d = s.delidosu || {};
  const a = s.anecan || {};
  const z = s.ainoshizuku || {};
  const timestamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
  const rowData = [
    date,
    d.count || '', d.event || '', d.chat || '', d.mail || '',
    a.count || '', a.event || '', a.chat || '', a.mail || '',
    z.count || '', z.event || '', z.chat || '', z.mail || '',
    timestamp
  ];

  const sheet = getStrategySheet_();
  const lastRow = sheet.getLastRow();

  // 同じ日付の行をすべて探す（重複があってもまとめる）
  const matchRows = [];
  if (lastRow >= 2) {
    const dates = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < dates.length; i++) {
      if (normalizeStrategyDate_(dates[i][0]) === normalizeStrategyDate_(date)) {
        matchRows.push(i + 2);
      }
    }
  }

  if (matchRows.length === 0) {
    // 同じ日付が無ければ新規追加
    sheet.appendRow(rowData);
  } else {
    // 同じ日付があれば先頭の1行に上書き
    sheet.getRange(matchRows[0], 1, 1, rowData.length).setValues([rowData]);
    // 余分な重複行は削除（後ろから消してインデックスのズレを防ぐ）
    for (let j = matchRows.length - 1; j >= 1; j--) {
      sheet.deleteRow(matchRows[j]);
    }
  }
  return { success: true, message: '戦略を保存しました', date: date };
}

/**
 * 全チェック状態をリセット
 */
function resetAllChecks() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME_URL);
  
  if (!sheet) {
    return { success: false, error: 'URL管理シートが見つかりません' };
  }
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { success: true, message: 'リセットするデータがありません' };
  }
  
  const numRows = lastRow - 1;
  sheet.getRange(2, 10, numRows, 1).setValue('');
  sheet.getRange(2, 11, numRows, 1).setValue('');
  sheet.getRange(2, 12, numRows, 1).setValue('');
  
  return { success: true, message: '全チェックをリセットしました' };
}

/**
 * URL管理にデータを追加（19列対応）
 */
function addUrlData(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME_URL);
  
  if (!sheet) {
    return { success: false, error: 'URL管理シートが見つかりません' };
  }
  
  ensureHeaders(sheet);
  
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    const range = sheet.getRange(2, 1, lastRow - 1, 1);
    const names = range.getValues().flat();
    
    if (names.includes(data.name)) {
      return { success: false, error: 'この源氏名は既に登録されています' };
    }
  }
  
  const newRow = [
    data.name || '',
    data.delidosuName || '',
    data.delidosuUrl || '',
    data.anecanName || '',
    data.anecanUrl || '',
    data.ainoshizukuName || '',
    data.ainoshizukuUrl || '',
    data.class || '通常',
    data.mainStore || '',
    '', '', '',
    data.sortOrder || 0,
    '',
    data.lastInterviewDate || '',
    data.interviewStaff || '',
    data.interviewComment || '',
    data.lastPhotoDate || '',
    data.lastVideoDate || ''
  ];
  
  sheet.appendRow(newRow);
  return { success: true, message: 'URL情報を追加しました' };
}

/**
 * URL管理のデータを更新（19列対応）
 */
function updateUrlData(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME_URL);
  
  if (!sheet) {
    return { success: false, error: 'URL管理シートが見つかりません' };
  }
  
  ensureHeaders(sheet);
  
  const lastRow = sheet.getLastRow();
  const range = sheet.getRange(2, 1, lastRow - 1, 19);
  const values = range.getValues();
  
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === data.name) {
      const existingCheckedDelidosu = values[i][9] || '';
      const existingCheckedAnecan = values[i][10] || '';
      const existingCheckedAinoshizuku = values[i][11] || '';
      const existingLastWorkDate = values[i][13] || '';
      
      const updateRow = [
        data.name || '',
        data.delidosuName || '',
        data.delidosuUrl || '',
        data.anecanName || '',
        data.anecanUrl || '',
        data.ainoshizukuName || '',
        data.ainoshizukuUrl || '',
        data.class || '通常',
        data.mainStore || '',
        existingCheckedDelidosu,
        existingCheckedAnecan,
        existingCheckedAinoshizuku,
        data.sortOrder || values[i][12] || 0,
        existingLastWorkDate,
        data.lastInterviewDate || values[i][14] || '',
        data.interviewStaff || values[i][15] || '',
        data.interviewComment || values[i][16] || '',
        data.lastPhotoDate || values[i][17] || '',
        data.lastVideoDate || values[i][18] || ''
      ];
      
      sheet.getRange(i + 2, 1, 1, 19).setValues([updateRow]);
      return { success: true, message: 'URL情報を更新しました' };
    }
  }
  
  return { success: false, error: '該当する源氏名が見つかりません' };
}

/**
 * URL管理のデータを削除
 */
function deleteUrlData(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME_URL);
  
  if (!sheet) {
    return { success: false, error: 'URL管理シートが見つかりません' };
  }
  
  const lastRow = sheet.getLastRow();
  const range = sheet.getRange(2, 1, lastRow - 1, 1);
  const values = range.getValues();
  
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === name) {
      sheet.deleteRow(i + 2);
      return { success: true, message: 'URL情報を削除しました' };
    }
  }
  
  return { success: false, error: '該当する源氏名が見つかりません' };
}

/**
 * 最終出勤日を一括更新
 */
function updateLastWorkDate(names, date) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME_URL);
  
  if (!sheet) {
    return { success: false, error: 'URL管理シートが見つかりません' };
  }
  
  if (!names || names.length === 0) {
    return { success: true, message: '更新対象がありません' };
  }
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { success: true, message: '登録データがありません' };
  }
  
  const range = sheet.getRange(2, 1, lastRow - 1, 19);
  const values = range.getValues();
  
  let updatedCount = 0;
  
  for (let i = 0; i < values.length; i++) {
    const castName = values[i][0];
    if (names.includes(castName)) {
      sheet.getRange(i + 2, 14).setValue(date);
      updatedCount++;
    }
  }
  
  return { success: true, message: updatedCount + '件の最終出勤日を更新しました' };
}

/**
 * ヘッダー行を確認・追加（19列対応）
 */
function ensureHeaders(sheet) {
  const headerRow = sheet.getRange(1, 1, 1, 19).getValues()[0];
  
  if (!headerRow[13] || headerRow[13] === '') {
    const newHeaders = ['最終出勤日', '最終面談日', '面談スタッフ', '面談コメント', '最終撮影日', '動画更新日'];
    sheet.getRange(1, 14, 1, 6).setValues([newHeaders]);
  }
}

/**
 * 面談履歴を取得（行番号付き）
 */
function getInterviewHistory(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME_HISTORY);
  
  if (!sheet) {
    return { success: false, error: '面談履歴シートが見つかりません' };
  }
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { success: true, data: [] };
  }
  
  const range = sheet.getRange(2, 1, lastRow - 1, 5);
  const values = range.getValues();
  
  const history = [];
  for (let i = 0; i < values.length; i++) {
    if (values[i][0] === name) {
      history.push({
        rowIndex: i + 2,
        name: values[i][0],
        interviewDate: values[i][1],
        staff: values[i][2],
        comment: values[i][3],
        createdAt: values[i][4]
      });
    }
  }
  
  history.sort((a, b) => {
    const dateA = new Date(a.interviewDate || 0);
    const dateB = new Date(b.interviewDate || 0);
    return dateB - dateA;
  });
  
  return { success: true, data: history };
}

/**
 * 面談履歴を追加
 */
function addInterviewHistory(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  let historySheet = ss.getSheetByName(SHEET_NAME_HISTORY);
  if (!historySheet) {
    historySheet = ss.insertSheet(SHEET_NAME_HISTORY);
    historySheet.getRange(1, 1, 1, 5).setValues([['源氏名', '面談日', '担当スタッフ', 'コメント', '登録日時']]);
  }
  
  const now = new Date();
  const createdAt = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  
  const newRow = [
    data.name || '',
    data.interviewDate || '',
    data.staff || '',
    data.comment || '',
    createdAt
  ];
  historySheet.appendRow(newRow);
  
  const urlSheet = ss.getSheetByName(SHEET_NAME_URL);
  if (urlSheet) {
    const lastRow = urlSheet.getLastRow();
    if (lastRow > 1) {
      const range = urlSheet.getRange(2, 1, lastRow - 1, 19);
      const values = range.getValues();
      
      for (let i = 0; i < values.length; i++) {
        if (values[i][0] === data.name) {
          urlSheet.getRange(i + 2, 15).setValue(data.interviewDate);
          urlSheet.getRange(i + 2, 16).setValue(data.staff);
          break;
        }
      }
    }
  }
  
  return { success: true, message: '面談履歴を追加しました' };
}

/**
 * 【1回だけ実行】既存のコメントを面談履歴シートに移行
 */
function migrateExistingComments() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const urlSheet = ss.getSheetByName(SHEET_NAME_URL);
  
  if (!urlSheet) {
    Logger.log('URL管理シートが見つかりません');
    return;
  }
  
  let historySheet = ss.getSheetByName(SHEET_NAME_HISTORY);
  if (!historySheet) {
    historySheet = ss.insertSheet(SHEET_NAME_HISTORY);
    historySheet.getRange(1, 1, 1, 5).setValues([['源氏名', '面談日', '担当スタッフ', 'コメント', '登録日時']]);
  }
  
  const lastRow = urlSheet.getLastRow();
  if (lastRow <= 1) {
    Logger.log('移行するデータがありません');
    return;
  }
  
  const range = urlSheet.getRange(2, 1, lastRow - 1, 17);
  const values = range.getValues();
  
  let migratedCount = 0;
  const now = new Date();
  const createdAt = Utilities.formatDate(now, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm:ss');
  
  for (let i = 0; i < values.length; i++) {
    const name = values[i][0];
    const interviewDate = values[i][14];
    const staff = values[i][15];
    const comment = values[i][16];
    
    if (comment && comment.toString().trim() !== '') {
      let dateStr = '不明';
      if (interviewDate) {
        try {
          const date = new Date(interviewDate);
          dateStr = Utilities.formatDate(date, 'Asia/Tokyo', 'yyyy-MM-dd');
        } catch(e) {
          dateStr = interviewDate.toString();
        }
      }
      
      historySheet.appendRow([name, dateStr, staff || '不明', comment, createdAt + ' (移行)']);
      migratedCount++;
    }
  }
  
  Logger.log('移行完了: ' + migratedCount + '件');
}

/**
 * 面談履歴を更新
 */
function updateInterviewHistory(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME_HISTORY);
  
  if (!sheet) {
    return { success: false, error: '面談履歴シートが見つかりません' };
  }
  
  const rowIndex = data.rowIndex;
  if (!rowIndex || rowIndex < 2) {
    return { success: false, error: '無効な行番号です' };
  }
  
  sheet.getRange(rowIndex, 2).setValue(data.interviewDate || '');
  sheet.getRange(rowIndex, 3).setValue(data.staff || '');
  sheet.getRange(rowIndex, 4).setValue(data.comment || '');
  
  updateUrlSheetFromHistory(data.name);
  
  return { success: true, message: '履歴を更新しました' };
}

/**
 * 面談履歴を削除
 */
function deleteInterviewHistory(rowIndex) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME_HISTORY);
  
  if (!sheet) {
    return { success: false, error: '面談履歴シートが見つかりません' };
  }
  
  if (!rowIndex || rowIndex < 2) {
    return { success: false, error: '無効な行番号です' };
  }
  
  const name = sheet.getRange(rowIndex, 1).getValue();
  sheet.deleteRow(rowIndex);
  
  if (name) {
    updateUrlSheetFromHistory(name);
  }
  
  return { success: true, message: '履歴を削除しました' };
}

/**
 * 履歴からURL管理シートの最終面談情報を更新
 */
function updateUrlSheetFromHistory(name) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const historySheet = ss.getSheetByName(SHEET_NAME_HISTORY);
  const urlSheet = ss.getSheetByName(SHEET_NAME_URL);
  
  if (!historySheet || !urlSheet) return;
  
  const historyData = historySheet.getDataRange().getValues();
  let latestHistory = null;
  
  for (let i = 1; i < historyData.length; i++) {
    if (historyData[i][0] === name) {
      if (!latestHistory || new Date(historyData[i][1]) > new Date(latestHistory.date)) {
        latestHistory = {
          date: historyData[i][1],
          staff: historyData[i][2],
          comment: historyData[i][3]
        };
      }
    }
  }
  
  const urlData = urlSheet.getDataRange().getValues();
  for (let i = 1; i < urlData.length; i++) {
    if (urlData[i][0] === name) {
      if (latestHistory) {
        urlSheet.getRange(i + 1, 15).setValue(latestHistory.date);
        urlSheet.getRange(i + 1, 16).setValue(latestHistory.staff);
        urlSheet.getRange(i + 1, 17).setValue(latestHistory.comment);
      } else {
        urlSheet.getRange(i + 1, 15).setValue('');
        urlSheet.getRange(i + 1, 16).setValue('');
        urlSheet.getRange(i + 1, 17).setValue('');
      }
      break;
    }
  }
}

/**
 * 全キャストの面談履歴を一括取得
 */
function getAllInterviewHistory() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME_HISTORY);
  
  if (!sheet) {
    return { success: true, data: {} };
  }
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { success: true, data: {} };
  }
  
  const range = sheet.getRange(2, 1, lastRow - 1, 5);
  const values = range.getValues();
  
  const historyByName = {};
  for (let i = 0; i < values.length; i++) {
    const name = values[i][0];
    if (!name) continue;
    
    if (!historyByName[name]) {
      historyByName[name] = [];
    }
    
    historyByName[name].push({
      rowIndex: i + 2,
      name: name,
      interviewDate: values[i][1],
      staff: values[i][2],
      comment: values[i][3],
      createdAt: values[i][4]
    });
  }
  
  for (const name in historyByName) {
    historyByName[name].sort((a, b) => {
      const dateA = new Date(a.interviewDate || 0);
      const dateB = new Date(b.interviewDate || 0);
      return dateB - dateA;
    });
  }
  
  return { success: true, data: historyByName };
}


// =============================================
// ★★★ v3.5: セットアップ・オキニトーク・話したよ・当欠 ★★★
// =============================================

/**
 * ★ 最初に1回だけ実行 ★
 * シフトデータにv3.5用ヘッダーを追加
 */
function setupV35Headers() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  
  var shiftSheet = ss.getSheetByName('シフトデータ');
  if (shiftSheet) {
    shiftSheet.getRange(1, 11).setValue('でりどす話したよ');
    shiftSheet.getRange(1, 12).setValue('アネキャン話したよ');
    shiftSheet.getRange(1, 13).setValue('しずく話したよ');
    shiftSheet.getRange(1, 14).setValue('元の出勤時間');
    shiftSheet.getRange(1, 15).setValue('でりどすオキニ数');
    shiftSheet.getRange(1, 16).setValue('アネキャンオキニ数');
    shiftSheet.getRange(1, 17).setValue('しずくオキニ数');
    Logger.log('✅ シフトデータ: K〜Q列ヘッダー追加完了');
  } else {
    Logger.log('❌ シフトデータシートが見つかりません');
  }
  
  SpreadsheetApp.getUi().alert(
    'v3.5 セットアップ完了！\n\n' +
    '✅ シフトデータ: K〜Q列ヘッダー追加\n' +
    '  K: でりどす話したよ\n' +
    '  L: アネキャン話したよ\n' +
    '  M: しずく話したよ\n' +
    '  N: 元の出勤時間\n' +
    '  O: でりどすオキニ数\n' +
    '  P: アネキャンオキニ数\n' +
    '  Q: しずくオキニ数\n\n' +
    '次にデプロイを管理→新しいバージョンでデプロイしてください。'
  );
}

/**
 * オキニトークデータを取得（シフトデータから + 話したよ状態）
 */
function getOkiniData() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var shiftSheet = ss.getSheetByName('シフトデータ');
  
  if (!shiftSheet) return { success: true, data: [] };
  
  var lastRow = shiftSheet.getLastRow();
  if (lastRow <= 1) return { success: true, data: [] };
  
  var values = shiftSheet.getRange(2, 1, lastRow - 1, 17).getValues();
  
  var dataArray = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    var name = row[0];
    if (!name) continue;
    
    var okiniD = row[14] !== '' && row[14] !== undefined && row[14] !== null ? String(row[14]) : '';
    var okiniA = row[15] !== '' && row[15] !== undefined && row[15] !== null ? String(row[15]) : '';
    var okiniS = row[16] !== '' && row[16] !== undefined && row[16] !== null ? String(row[16]) : '';
    
    if (okiniD === '' && okiniA === '' && okiniS === '' &&
        !row[10] && !row[11] && !row[12]) continue;
    
    dataArray.push({
      name: name,
      delidosu: okiniD,
      anecan: okiniA,
      ainoshizuku: okiniS,
      delidosuTalked: row[10] || '',
      anecanTalked: row[11] || '',
      ainoshizukuTalked: row[12] || ''
    });
  }
  
  return { success: true, data: dataArray };
}

/**
 * オキニトーク数を書き込み（Python用）
 */
function updateOkiniCount(data) {
  var storeCols = { 'delidosu': 15, 'anecan': 16, 'ainoshizuku': 17 };
  var storeNameCols = { 'delidosu': 4, 'anecan': 6, 'ainoshizuku': 8 };
  
  var col = storeCols[data.store];
  var searchCol = storeNameCols[data.store];
  if (!col) return { success: false, error: '無効な店舗名: ' + data.store };
  
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('シフトデータ');
  if (!sheet) return { success: false, error: 'シフトデータシートが見つかりません' };
  
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, error: 'データがありません' };
  
  var storeNames = sheet.getRange(2, searchCol, lastRow - 1, 1).getValues();
  for (var i = 0; i < storeNames.length; i++) {
    if (storeNames[i][0] === data.name) {
      sheet.getRange(i + 2, col).setValue(data.count);
      return { success: true };
    }
  }
  
  var mainNames = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < mainNames.length; i++) {
    if (mainNames[i][0] === data.name) {
      sheet.getRange(i + 2, col).setValue(data.count);
      return { success: true };
    }
  }
  
  return { success: false, error: data.name + 'が見つかりません' };
}

/**
 * 話したよ✅を更新（フロント用）
 */
function updateOkiniTalked(data) {
  var talkedCols = { 'delidosu': 11, 'anecan': 12, 'ainoshizuku': 13 };
  var col = talkedCols[data.store];
  if (!col) return { success: false, error: '無効な店舗名: ' + data.store };
  
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('シフトデータ');
  if (!sheet) return { success: false, error: 'シフトデータシートが見つかりません' };
  
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, error: 'データがありません' };
  
  var names = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  
  for (var i = 0; i < names.length; i++) {
    if (names[i][0] === data.name) {
      sheet.getRange(i + 2, col).setValue(data.talked ? '済' : '');
      return { success: true };
    }
  }
  
  return { success: false, error: data.name + 'が見つかりません' };
}

/**
 * 出勤時間を更新（当欠用）
 * B列を「当欠」に、N列に元の時間を退避
 * ★ 日記出力シートも連動更新
 */
function updateShiftTime(data) {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName('シフトデータ');
  if (!sheet) return { success: false, error: 'シフトデータシートが見つかりません' };
  
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return { success: false, error: 'データがありません' };
  
  var names = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  
  for (var i = 0; i < names.length; i++) {
    if (names[i][0] === data.name) {
      sheet.getRange(i + 2, 2).setValue(data.time);
      sheet.getRange(i + 2, 14).setValue(data.originalTime);
      
      // ★★★ 日記出力シートを連動更新 ★★★
      try {
        Logger.log('【日記連動】開始: name=' + data.name + ', time=' + data.time);
        if (data.time === '当欠') {
          updateDiaryOutputForTouketu_(ss, data.name);
        } else {
          restoreDiaryOutputFromTouketu_(ss, data.name, data.time);
        }
      } catch(e) {
        Logger.log('【日記連動エラー】' + e.toString());
      }
      
      return { success: true };
    }
  }
  
  return { success: false, error: data.name + 'が見つかりません' };
}


// =============================================
// ★★★ 日記出力シート連動ヘルパー（v3.7） ★★★
// =============================================

/**
 * 当欠にした時 → 日記出力シートを更新
 * ★ v3.7: I列（日記の種類）を見て当欠日記と通常日記で分岐
 *   ・通常日記（I列≠当欠）: pending → skip に
 *   ・当欠日記（I列=当欠）: skip → pending に
 *   ・J列（出勤時間）を「当欠」に更新
 */
function updateDiaryOutputForTouketu_(ss, castName) {
  var diarySheet = ss.getSheetByName(SHEET_NAME_DIARY_OUTPUT);
  if (!diarySheet) {
    Logger.log('【日記連動】日記出力シートが見つかりません');
    return;
  }
  
  var lastRow = diarySheet.getLastRow();
  if (lastRow <= 1) return;
  
  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  // ★ v4.2.0: 深夜帯の投稿はA列が翌日になるため、翌日も対象にする
  var tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  var tomorrow = Utilities.formatDate(tomorrowDate, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  // A列=日付, B列=メイン名, I列=日記の種類, N列=ステータス
  var dates = diarySheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var names = diarySheet.getRange(2, 2, lastRow - 1, 1).getValues();
  var types = diarySheet.getRange(2, 9, lastRow - 1, 1).getValues();    // I列: 日記の種類
  var statuses = diarySheet.getRange(2, 14, lastRow - 1, 1).getValues(); // N列: ステータス
  
  var updatedCount = 0;
  
  for (var i = 0; i < names.length; i++) {
    // 日付チェック
    var dateStr = '';
    if (dates[i][0] instanceof Date) {
      dateStr = Utilities.formatDate(dates[i][0], 'Asia/Tokyo', 'yyyy-MM-dd');
    } else {
      dateStr = String(dates[i][0]);
    }
    if ((dateStr !== today && dateStr !== tomorrow) || names[i][0] !== castName) continue;  // ★ v4.2.0: 翌日も対象
    
    var diaryType = String(types[i][0] || '').trim();
    var currentStatus = String(statuses[i][0] || '').trim();
    var rowNum = i + 2;
    
    if (diaryType === '当欠') {
      // ★ 当欠日記 → skip を pending に（投稿対象にする）
      if (currentStatus === 'skip') {
        diarySheet.getRange(rowNum, 14).setValue('pending');  // N列: ステータス
        diarySheet.getRange(rowNum, 10).setValue('当欠');     // J列: 出勤時間
        updatedCount++;
        Logger.log('【日記連動】当欠日記ON: 行' + rowNum);
      }
    } else {
      // ★ 通常日記 → draft/pending を skip に（投稿対象から外す）★ v4.2.0: draft対応
      if (currentStatus === 'pending' || currentStatus === 'draft' || currentStatus === '') {
        diarySheet.getRange(rowNum, 14).setValue('skip');     // N列: ステータス
        diarySheet.getRange(rowNum, 10).setValue('当欠');     // J列: 出勤時間
        updatedCount++;
        Logger.log('【日記連動】通常日記OFF: 行' + rowNum);
      }
    }
  }
  
  Logger.log('【日記連動】当欠処理完了: ' + updatedCount + '行更新');
}

/**
 * 当欠を解除した時 → 日記出力シートを復元
 * ★ v3.7: I列（日記の種類）を見て当欠日記と通常日記で分岐
 *   ・通常日記（I列≠当欠）: skip → pending に復元 + J列を出勤時間に戻す
 *   ・当欠日記（I列=当欠）: pending → skip に戻す
 */
function restoreDiaryOutputFromTouketu_(ss, castName, restoredTime) {
  var diarySheet = ss.getSheetByName(SHEET_NAME_DIARY_OUTPUT);
  if (!diarySheet) {
    Logger.log('【日記連動】日記出力シートが見つかりません（復元時）');
    return;
  }
  
  var lastRow = diarySheet.getLastRow();
  if (lastRow <= 1) return;
  
  var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
  // ★ v4.2.0: 深夜帯の投稿はA列が翌日になるため、翌日も対象にする
  var tomorrowDate = new Date();
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  var tomorrow = Utilities.formatDate(tomorrowDate, 'Asia/Tokyo', 'yyyy-MM-dd');
  
  var dates = diarySheet.getRange(2, 1, lastRow - 1, 1).getValues();
  var names = diarySheet.getRange(2, 2, lastRow - 1, 1).getValues();
  var types = diarySheet.getRange(2, 9, lastRow - 1, 1).getValues();    // I列: 日記の種類
  var statuses = diarySheet.getRange(2, 14, lastRow - 1, 1).getValues(); // N列: ステータス
  
  var updatedCount = 0;
  
  for (var i = 0; i < names.length; i++) {
    var dateStr = '';
    if (dates[i][0] instanceof Date) {
      dateStr = Utilities.formatDate(dates[i][0], 'Asia/Tokyo', 'yyyy-MM-dd');
    } else {
      dateStr = String(dates[i][0]);
    }
    if ((dateStr !== today && dateStr !== tomorrow) || names[i][0] !== castName) continue;  // ★ v4.2.0: 翌日も対象
    
    var diaryType = String(types[i][0] || '').trim();
    var currentStatus = String(statuses[i][0] || '').trim();
    var rowNum = i + 2;
    
    if (diaryType === '当欠') {
      // ★ 当欠日記 → pending を skip に戻す（投稿対象から外す）
      if (currentStatus === 'pending') {
        diarySheet.getRange(rowNum, 14).setValue('skip');  // N列: ステータス
        updatedCount++;
        Logger.log('【日記連動】当欠日記OFF: 行' + rowNum);
      }
    } else {
      // ★ 通常日記 → skip を draft に復元（未承認状態に戻す）★ v4.2.0: draft対応
      if (currentStatus === 'skip') {
        diarySheet.getRange(rowNum, 14).setValue('draft');         // N列: ステータス ★ pending→draft
        diarySheet.getRange(rowNum, 10).setValue(restoredTime);   // J列: 出勤時間を復元
        updatedCount++;
        Logger.log('【日記連動】通常日記ON: 行' + rowNum);
      }
    }
  }
  
  Logger.log('【日記連動】復元処理完了: ' + updatedCount + '行更新');
}


/**
 * 全データを1回で取得する統合API（フロント起動高速化用）
 * 既存の関数を内部呼び出ししてまとめるだけのラッパー関数
 * ネットワーク往復を 4回→1回 に削減（約1〜2秒短縮）
 * @returns {object} { success, shiftDate, shiftData, urlData, okiniData, comments }
 */
function getInitialData() {
  try {
    const shiftDateResult = getShiftDate();
    const shiftDataResult = getShiftData();
    const urlDataResult = getUrlData();
    const okiniDataResult = getOkiniData();
    const commentsResult = getAllInterviewHistory();

    const shiftDate = (shiftDateResult && shiftDateResult.success) ? shiftDateResult.date : '';
    // ★ 明日の戦略も相乗りで返す（フロントの追加往復をなくし、時間差を解消）
    const strategyDate = getStrategyTargetDateFromShiftDate_(shiftDate);
    const strategyResult = strategyDate ? getStrategy(strategyDate) : null;

    return {
      success: true,
      shiftDate: shiftDate,
      shiftData: (shiftDataResult && shiftDataResult.success) ? shiftDataResult.data : [],
      urlData: (urlDataResult && urlDataResult.success) ? urlDataResult.data : [],
      okiniData: (okiniDataResult && okiniDataResult.success) ? okiniDataResult.data : [],
      comments: (commentsResult && commentsResult.success) ? commentsResult.data : {},
      strategy: strategyResult ? { date: strategyResult.date, found: strategyResult.found, stores: strategyResult.stores } : null
    };
  } catch (error) {
    console.error('getInitialData: 例外', error);
    return { success: false, error: error.toString() };
  }
}

/**
 * デバッグ用: 全シート名を表示
 */
function debugSheetNames() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheets = ss.getSheets();
  var names = [];
  for (var i = 0; i < sheets.length; i++) {
    names.push('「' + sheets[i].getName() + '」');
  }
  Logger.log('全シート名: ' + names.join(', '));
  SpreadsheetApp.getUi().alert('全シート名:\n' + names.join('\n'));
}