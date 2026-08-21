/**
 * キテネマスター - Google Apps Script API v5.6.0 + v3.7
 * 17列対応版（オキニトーク数をシフトデータに保存）
 * ★ 当欠時の日記出力シート連動機能（v3.7: 当欠日記ON/OFF対応）
 * ★ v5.2: 明日の戦略スペース追加
 * ★ v5.2.1: 戦略の日付比較を正規化（日付自動変換による読込消え対策）
 * ★ v5.2.2: 同じ日付は1行に統合（重複行を自動削除）
 * ★ v5.2.3: getInitialDataに戦略を相乗り（表示の時間差を解消）
 * ★ v5.3.0: 商品・イベント掲載（getPublications / savePublications / シート自動生成）追加
 * ★ v5.3.1: 列全体への書式適用をやめ軽量化（タイムアウト対策）
 * ★ v5.3.2: 空シートを検出したら初期値を投入（カテゴリ復旧）
 * ★ v5.4.0: スプレッドシートを1回だけ開いてキャッシュ（読み込み高速化）
 * ★ v5.5.0: 今日の戦略を相乗りで返す（明日フォームに参照メモ表示）
 * ★ v5.6.0: 商品スペース（getProduct / saveProduct / シート「商品」）追加
 */

// スプレッドシートIDを設定
const SPREADSHEET_ID = '1W9mRrYHwiHoSz72eMJdheiOjur-BGHoM-itFIoKCWVM';
const SHEET_NAME_SHIFT = 'シフトデータ';
const SHEET_NAME_WEEKLY = '週間シフト';
const SHEET_NAME_URL = 'URL管理';
const SHEET_NAME_SETTINGS = '設定';
const SHEET_NAME_HISTORY = '面談履歴';
const SHEET_NAME_DIARY_OUTPUT = '日記出力';
const SHEET_NAME_STRATEGY = '戦略';  // ★明日の戦略スペース
const SHEET_NAME_PUBLICATION = '掲載';        // ★商品・イベント掲載
const SHEET_NAME_PUB_CATEGORY = '掲載カテゴリ'; // ★掲載カテゴリ（プルダウン選択肢）
const SHEET_NAME_ATTENDANCE = '出勤履歴'; // ★Phase1: 出勤履歴（日次の出勤/当欠を蓄積・キー=日付+源氏名）

// ★ スプレッドシートは1リクエスト内で1回だけ開いてキャッシュ（高速化）
let _ssCache = null;
function getSS_() {
  if (!_ssCache) _ssCache = SpreadsheetApp.openById(SPREADSHEET_ID);
  return _ssCache;
}

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
        result = getInitialData(e.parameter.comments);
        break;
      case 'getStrategy':
        result = getStrategy(e.parameter.date);
        break;
      case 'getPublications':
        result = getPublications();
        break;
      case 'getProduct':
        result = getProduct();
        break;
      case 'getRealtimeFlags':
        result = getRealtimeFlags();
        break;
      case 'generateStageNames':
        result = generateStageNames(e && e.parameter ? e.parameter : {});
        break;
      case 'getWeeklyHeadcount':
        result = getWeeklyHeadcount();
        break;
      case 'getCallList':
        result = getCallList();
        break;
      case 'getAttendance30d':
        result = getAttendance30d();
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
      case 'updateWeeklyShift':
        result = updateWeeklyShift(postData.rows);
        break;
      case 'updateAttendanceHistory':
        result = updateAttendanceHistory(postData);
        break;
      case 'addTodayShift':
        result = addTodayShift(postData.name, postData.time);
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
      case 'markCommentRead':
        result = markCommentRead(postData.rowIndex, postData.name, postData.staff);
        break;
      case 'saveCallMemo':
        result = saveCallMemo(postData);
        break;
      case 'getInterviewHistory':
        result = getInterviewHistory(postData.name);
        break;
      case 'updateOkiniCount':
        result = updateOkiniCount(postData);
        break;
      case 'updateDiaryCount':
        result = updateDiaryCount(postData);
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
      case 'savePublications':
        result = savePublications(postData.items);
        break;
      case 'saveProduct':
        result = saveProduct(postData.text);
        break;
      case 'postAvailability':
        result = postAvailability(postData.name, postData.time);
        break;
      case 'postManryo':
        result = postManryo(postData.name, postData.force);
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
  const ss = getSS_();
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
  const ss = getSS_();
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
  const ss = getSS_();
  const sheet = ss.getSheetByName(SHEET_NAME_SHIFT);
  
  if (!sheet) {
    return { success: false, error: 'シフトデータシートが見つかりません' };
  }
  
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 19).clear();  // ★ 空き予告: R/S列(18/19)も毎日リセット
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
 * ★ 週間シフト: エクセル7日ぶんを「週間シフト」シートに丸ごと書き込む（2行目以降クリア→全行書き込み）
 *   rows = [{date, name, time, end, status, delidosu, anecan, ainoshizuku, comment}, ...]
 *   ※ シフトデータ（当日分）は updateShiftData が別途維持する。これは追加の保存先（§7の土台）。
 */
function updateWeeklyShift(rows) {
  const ss = getSS_();
  const sheet = ss.getSheetByName(SHEET_NAME_WEEKLY);
  if (!sheet) {
    return { success: false, error: '「週間シフト」シートが見つかりません。先に setupRealtimeColumns を実行してください。' };
  }
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, 9).clearContent();
  }
  if (rows && rows.length > 0) {
    const values = rows.map(r => [
      r.date || '',
      r.name || '',
      r.time || '',
      r.end || '',
      r.status || '',
      r.delidosu || '',
      r.anecan || '',
      r.ainoshizuku || '',
      r.comment || ''
    ]);
    sheet.getRange(2, 1, values.length, 9).setValues(values);
    return { success: true, message: values.length + '件を週間シフトに書き込みました' };
  }
  return { success: true, message: '週間シフト: 0件（クリアのみ）' };
}

/**
 * ★ 週間シフトの人数を集計して返す（日付ごと・店舗ごと）
 *   返り値: { success, days: [{ date, total, delidosu, anecan, ainoshizuku }, ...] }（日付昇順）
 *   total = その日の出勤者数（源氏名のユニーク数）
 *   各店舗 = その店舗の列に名前が入っている行数（掛け持ちは両方でカウント）
 */
function getWeeklyHeadcount() {
  const ss = getSS_();
  const sheet = ss.getSheetByName(SHEET_NAME_WEEKLY);
  if (!sheet) return { success: true, days: [] };
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { success: true, days: [] };
  // A日付 B源氏名 C出勤 D退勤 E状態 F でりどす G アネキャン H 愛のしずく I コメント
  const tz = ss.getSpreadsheetTimeZone();
  // 日付セルが日付型に自動変換されていても 'YYYY-MM-DD' 文字列に正規化
  const toYmd = function (v) {
    if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
    var str = String(v == null ? '' : v).trim();
    var m = str.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    return str;
  };
  const values = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  const byDate = {};
  values.forEach(function (r) {
    const date = toYmd(r[0]);
    const name = String(r[1] || '').trim();
    if (!date || !name) return;
    if (!byDate[date]) byDate[date] = { people: {}, delidosu: {}, anecan: {}, ainoshizuku: {} };
    // ★ 掛け持ちの1人が店舗名ごとに複数行入るため、店舗ごとに「名前のユニーク」で数える（多重カウント防止）
    const fn = String(r[5] || '').trim(); // でりどす名
    const gn = String(r[6] || '').trim(); // アネキャン名
    const hn = String(r[7] || '').trim(); // 愛のしずく名
    if (fn) byDate[date].delidosu[fn] = true;
    if (gn) byDate[date].anecan[gn] = true;
    if (hn) byDate[date].ainoshizuku[hn] = true;
    // 実出勤人数（全店）＝（でりどす名・アネキャン名・しずく名）の組で一意化＝掛け持ちを1人に。店舗名が全部空なら源氏名で代替
    const sig = (fn || gn || hn) ? (fn + '|' + gn + '|' + hn) : ('B:' + name);
    byDate[date].people[sig] = true;
  });
  // ★ Phase0-1: 2週間Excel取込でも「週間人数」は先頭7日（＝今日から1週間）だけ返す
  const days = Object.keys(byDate).sort().slice(0, 7).map(function (d) {
    return {
      date: d,
      total: Object.keys(byDate[d].people).length,
      delidosu: Object.keys(byDate[d].delidosu).length,
      anecan: Object.keys(byDate[d].anecan).length,
      ainoshizuku: Object.keys(byDate[d].ainoshizuku).length
    };
  });
  return { success: true, days: days };
}

/**
 * チェック状態を更新（3チェック対応）
 */
function updateCheckStatus(name, store, checked) {
  const ss = getSS_();
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
  const ss = getSS_();
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
  const ss = getSS_();
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
 * ★ Phase1: 出勤履歴シートを取得（なければヘッダー付きで自動生成）
 *   列: A日付 B源氏名 C状態(出勤/当欠) D出勤時間 E登録元(取込/当日追加) F更新日時
 *   キー: A日付＋B源氏名で1行（upsert）。営業日は8:00切替（既存踏襲）。
 */
function getAttendanceSheet_() {
  const ss = getSS_();
  let sheet = ss.getSheetByName(SHEET_NAME_ATTENDANCE);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_ATTENDANCE);
    const headers = ['日付', '源氏名', '状態', '出勤時間', '登録元', '更新日時'];
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    // A列(日付)を文字列扱いにして日付の自動変換を防ぐ（履歴は大量行に育つのでA列全体）
    sheet.getRange('A:A').setNumberFormat('@');
  }
  return sheet;
}

/**
 * ★ Phase1: 出勤履歴の1行upsert（日付＋源氏名で既存行を更新、無ければ追記）。単体呼び出し用（経路B/当日追加）。
 * @param {Sheet} sheet 出勤履歴シート
 * @param {string} date 'YYYY-MM-DD'（営業日）
 * @param {string} name 源氏名
 * @param {string} status '出勤' or '当欠'
 * @param {string} time 出勤時間（当欠時は空でも可）
 * @param {string} source '取込' or '当日追加'
 */
function upsertAttendance_(sheet, date, name, status, time, source) {
  date = String(date || '').trim();
  name = String(name || '').trim();
  if (!date || !name) return;
  var wantIso = attIso_(date); // ★修正: 日付をISO正規化（A列がDate型/文字列いずれでも既存行に一致＝重複追記を防ぐ）
  var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var keys = sheet.getRange(2, 1, lastRow - 1, 5).getValues(); // A日付 B源氏名 C状態 D時間 E登録元
    for (var i = 0; i < keys.length; i++) {
      if (attIso_(keys[i][0]) === wantIso && String(keys[i][1]).trim() === name) {
        var keepSrc = source || String(keys[i][4] || '').trim() || '取込'; // 登録元は指定が無ければ既存を維持
        sheet.getRange(i + 2, 3, 1, 4).setValues([[status, time || '', keepSrc, now]]); // C状態 D出勤時間 E登録元 F更新日時
        return;
      }
    }
  }
  sheet.appendRow([date, name, status, time || '', source || '取込', now]);
}

/**
 * ★ Phase1: 最終出勤日(URL管理 N列=14列目)を出勤履歴から再計算。
 *   N = その子の履歴で状態が「出勤」の最新日付。出勤履歴が無ければ N は据え置き（消さない）。
 */
function recalcLastWorkDate_(name) {
  name = String(name || '').trim();
  if (!name) return;
  var ss = getSS_();
  var hist = ss.getSheetByName(SHEET_NAME_ATTENDANCE);
  if (!hist) return;
  var hLast = hist.getLastRow();
  if (hLast < 2) return;
  var rows = hist.getRange(2, 1, hLast - 1, 3).getValues(); // A日付 B源氏名 C状態
  var latest = '';
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][1]).trim() !== name) continue;
    if (String(rows[i][2]).trim() !== '出勤') continue;
    var d = attIso_(rows[i][0]); // ★修正: ISO正規化（A列Date型でも最新日を正しく比較）
    if (d && d > latest) latest = d; // 'YYYY-MM-DD'は文字列比較で日付順
  }
  if (!latest) return; // 出勤履歴なし→N据え置き
  var _lp = latest.split('-');
  var latestJ = (_lp.length === 3) ? (_lp[0] + '年' + _lp[1] + '月' + _lp[2] + '日') : latest; // N列は既存に合わせ「YYYY年MM月DD日」
  var url = ss.getSheetByName(SHEET_NAME_URL);
  if (!url) return;
  var uLast = url.getLastRow();
  if (uLast < 2) return;
  var namesCol = url.getRange(2, 1, uLast - 1, 1).getValues();
  for (var j = 0; j < namesCol.length; j++) {
    if (String(namesCol[j][0]).trim() === name) {
      url.getRange(j + 2, 14).setValue(latestJ);
      return;
    }
  }
}

/**
 * ★ Phase1・経路A: 朝の取込時に出勤履歴を記録（フロントの新アクション）。
 *   payload = { date:'YYYY-MM-DD', rows:[{name, time, status('出勤'|'当欠')}, ...] }
 *   お休み等は rows に含めない（フロントで除外済み）。読み1回＋既存は個別更新＋新規はバッチ追記。
 */
function updateAttendanceHistory(payload) {
  var date = payload && payload.date ? String(payload.date).trim() : '';
  var rows = (payload && payload.rows) ? payload.rows : [];
  if (!date) return { success: false, error: '日付がありません' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { success: false, error: '混み合っています（履歴）' }; }
  try {
    var sheet = getAttendanceSheet_();
    var now = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
    // 既存キー(date|name)→行番号 を1回で作る
    var existing = {};
    var lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      var keys = sheet.getRange(2, 1, lastRow - 1, 2).getValues();
      for (var k = 0; k < keys.length; k++) {
        existing[attIso_(keys[k][0]) + '|' + String(keys[k][1]).trim()] = k + 2; // ★修正: 日付ISO正規化
      }
    }
    var appends = [];
    var cnt = 0;
    for (var i = 0; i < rows.length; i++) {
      var nm = String(rows[i].name || '').trim();
      if (!nm) continue;
      var st = String(rows[i].status || '出勤').trim();
      var tm = String(rows[i].time || '');
      var key = attIso_(date) + '|' + nm; // ★修正: 日付ISO正規化（再取込のupsert一致）
      if (existing[key]) {
        sheet.getRange(existing[key], 3, 1, 4).setValues([[st, tm, '取込', now]]); // 既存は個別更新
      } else {
        appends.push([date, nm, st, tm, '取込', now]);
      }
      cnt++;
    }
    if (appends.length > 0) {
      sheet.getRange(sheet.getLastRow() + 1, 1, appends.length, 6).setValues(appends); // 新規は一括追記
    }
    return { success: true, message: cnt + '件の出勤履歴を記録しました（' + date + '）' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * ★ Stage2: 当日出勤を1件手動追加する（出勤タブの独立フォームから呼ぶ）。
 *   処理: (1)本日シフト重複ガード (2)URL管理から店名/URL補完 (3)シフトデータに1行追加（取込updateShiftDataと同じ10列A-J構成・状態='出勤確'・K以降は空）
 *         (4)出勤履歴に source='当日追加' で記録 (5)最終出勤日N=今日 を再計算。全体をScriptLockで排他（モバイル同時対策）。
 *   ※ 投稿先名/gid/ミテネURLは全てURL管理由来（シフトデータのD/F/H店別名は日記投稿・ミテネとも不読＝ここに書く値は行整合用）。週間シフトには足さない（当日分のみ）。
 * @param {string} name 源氏名（URL管理A列と一致）
 * @param {string} time 出勤時間（'開始〜終了'。区切りは全角波ダッシュ U+301C '〜'＝取込formatTimeRangeと同一）
 * @return {Object} { success, message } or { success:false, error }
 */
function addTodayShift(name, time) {
  name = String(name || '').trim();
  time = String(time || '').trim();
  // 区切りを取込と同じ全角波ダッシュ U+301C に正規化（～/~/- で来ても揃える＝シフトデータB列を取込と1バイト一致）
  time = time.replace(/[～~\-]/g, '〜');
  if (!name) return { success: false, error: '源氏名が空です' };
  if (!time) return { success: false, error: '出勤時間が空です' };

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { success: false, error: '混み合っています（当日追加）。少し待って再度お試しください' }; }
  try {
    var ss = getSS_();
    var shift = ss.getSheetByName(SHEET_NAME_SHIFT);
    if (!shift) return { success: false, error: 'シフトデータシートが見つかりません' };

    // (1) 重複ガード: 既に本日シフトに載っている源氏名は追加しない（重複源氏名→GAS/Python行選択の割れ防止）
    var sLast = shift.getLastRow();
    if (sLast >= 2) {
      var sNames = shift.getRange(2, 1, sLast - 1, 1).getValues();
      for (var i = 0; i < sNames.length; i++) {
        if (String(sNames[i][0]).trim() === name) {
          return { success: false, error: name + ' は既に本日のシフトに入っています' };
        }
      }
    }

    // (2) URL管理から店名/URLを補完（未登録なら中止＝店舗/URLを解決できない）
    var url = ss.getSheetByName(SHEET_NAME_URL);
    if (!url) return { success: false, error: 'URL管理シートが見つかりません' };
    var uLast = url.getLastRow();
    var urow = null;
    if (uLast >= 2) {
      var uvals = url.getRange(2, 1, uLast - 1, 7).getValues(); // A源氏名 B でり名 C でりURL D アネ名 E アネURL F しず名 G しずURL
      for (var j = 0; j < uvals.length; j++) {
        if (String(uvals[j][0]).trim() === name) { urow = uvals[j]; break; }
      }
    }
    if (!urow) return { success: false, error: name + ' はURL管理に未登録です（店舗/URLを解決できません）' };

    // (3) シフトデータに1行追加（取込updateShiftDataと同じ10列A-J・K以降は空）
    //     A源氏名 B時間 C状態(出勤確) D でり名 E でりURL F アネ名 G アネURL H しず名 I しずURL J空
    shift.getRange(sLast + 1, 1, 1, 10).setValues([[
      name,
      time,
      '出勤確',
      urow[1] || '',
      urow[2] || '',
      urow[3] || '',
      urow[4] || '',
      urow[5] || '',
      urow[6] || '',
      ''
    ]]);

    // (4) 出勤履歴に当日追加として記録（営業日＝設定B1のシフト日付をISO化＝取込済み当日行と同じ日付）。履歴は非致命
    var bizDate = resolveBizDateISO_();
    if (bizDate) {
      try {
        upsertAttendance_(getAttendanceSheet_(), bizDate, name, '出勤', time, '当日追加');
      } catch (e2) { /* 履歴失敗はシフト追加を妨げない */ }
    }

    // (5) 最終出勤日N=今日 を再計算（出勤履歴の最新「出勤」日→URL管理N列）。非致命
    try { recalcLastWorkDate_(name); } catch (e3) { /* 非致命 */ }

    return { success: true, message: name + ' を本日のシフトに追加しました（' + time + '）' };
  } finally {
    lock.releaseLock();
  }
}

/**
 * ★ Stage2: 当日追加の営業日を'YYYY-MM-DD'で返す。
 *   優先: 設定!B1（getShiftDate＝現シフトデータのシフト日付「YYYY年MM月DD日」）をISO化＝取込済みの当日行と同じ日付に揃える。
 *   フォールバック: 設定B1が空なら 8:00ロール（lateNightThreshold=8）のサーバ計算today。
 */
function resolveBizDateISO_() {
  try {
    var r = getShiftDate();
    var raw = (r && r.date != null) ? r.date : '';
    if (raw instanceof Date) return Utilities.formatDate(raw, 'Asia/Tokyo', 'yyyy-MM-dd');
    var s = String(raw).trim();
    var m = s.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/); // 'YYYY年MM月DD日' / 'YYYY-MM-DD' / 'YYYY/MM/DD'
    if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
  } catch (e) {}
  var now = new Date();
  var h = Number(Utilities.formatDate(now, 'Asia/Tokyo', 'H'));
  var base = (h < 8) ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;
  return Utilities.formatDate(base, 'Asia/Tokyo', 'yyyy-MM-dd');
}

/**
 * ★ Phase2: 日付文字列を柔軟にパース（'YYYY-MM-DD'・'YYYY年MM月DD日'・Date対応）→ JST0時のDate or null
 */
function parseYmdFlexible_(v) {
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  var s = String(v || '').trim();
  if (!s) return null;
  var m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) m = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/**
 * ★修正: 出勤履歴A列(日付)をISO 'YYYY-MM-DD' に正規化。Date型/文字列/年月日いずれでも同一キーにする（upsert重複防止・N再計算・取込判定）。
 */
function attIso_(v) {
  var d = parseYmdFlexible_(v);
  return d ? Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd') : String(v || '').trim();
}

/**
 * ★ Phase2/3: 直近30日の 出勤/当欠 回数を出勤履歴から算出（単体・面談カード共用）
 */
function calc30d_(name) {
  name = String(name || '').trim();
  var res = { work: 0, zenketsu: 0 };
  if (!name) return res;
  var ss = getSS_();
  var hist = ss.getSheetByName(SHEET_NAME_ATTENDANCE);
  if (!hist) return res;
  var last = hist.getLastRow();
  if (last < 2) return res;
  var rows = hist.getRange(2, 1, last - 1, 3).getValues(); // A日付 B源氏名 C状態
  var t = new Date(); var today0 = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  var from = new Date(today0.getTime() - 29 * 86400000);
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][1]).trim() !== name) continue;
    var d = parseYmdFlexible_(rows[i][0]);
    if (!d || d < from || d > today0) continue;
    var st = String(rows[i][2]).trim();
    if (st === '出勤') res.work++;
    else if (st === '当欠') res.zenketsu++;
  }
  return res;
}

/**
 * ★ Phase3(3-6): 全キャストの直近30日 出勤/当欠 を出勤履歴1回読みで集計（面談カード表示用）。
 *   返り値: { success, data: { 源氏名: {work, zenketsu}, ... } }。日付列がDate型混在でもparseYmdFlexible_で吸収。
 */
function getAttendance30d() {
  var res = {};
  var ss = getSS_();
  var hist = ss.getSheetByName(SHEET_NAME_ATTENDANCE);
  if (!hist) return { success: true, data: res };
  var last = hist.getLastRow();
  if (last < 2) return { success: true, data: res };
  var rows = hist.getRange(2, 1, last - 1, 3).getValues(); // A日付 B源氏名 C状態
  var t = new Date(); var today0 = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  var from = new Date(today0.getTime() - 29 * 86400000);
  for (var i = 0; i < rows.length; i++) {
    var nm = String(rows[i][1]).trim();
    if (!nm) continue;
    var d = parseYmdFlexible_(rows[i][0]);
    if (!d || d < from || d > today0) continue;
    var st = String(rows[i][2]).trim();
    if (!res[nm]) res[nm] = { work: 0, zenketsu: 0 };
    if (st === '出勤') res[nm].work++;
    else if (st === '当欠') res[nm].zenketsu++;
  }
  return { success: true, data: res };
}

/**
 * ★ Phase2: 声掛け候補リスト（読み取りのみ）。
 *   母集団＝URL管理登録 × 本日シフト未登録 × 週間シフト(14日窓)未登録 × 最終出勤日(N)からの空き≥7日。
 *   危険=空き≥14日／要注意=7〜13日。各行に直近30日(出勤/当欠)を併記（履歴が育つまでは0が多い）。
 *   ※Nは「最後に出勤した日」。履歴の蓄積を待たず今日から機能。週2復帰の子は週間シフトで自動除外。
 */
/**
 * ★ 声掛けメモ: URL管理に T列(20)=声掛けメモ / U列(21)=メモ日付 を確保する（冪等）
 *   既存シートは A〜S の19列なので、初回だけ列を足してヘッダーを書く。
 *   ※ 既存の updateUrlData は19列固定で書き込むため、T/U列を潰すことはない（確認済み）
 */
function ensureUrlMemoColumns_(sheet) {
  var maxCol = sheet.getMaxColumns();
  if (maxCol < 21) sheet.insertColumnsAfter(maxCol, 21 - maxCol);
  if (String(sheet.getRange(1, 20).getValue()).trim() === '') sheet.getRange(1, 20).setValue('声掛けメモ');
  if (String(sheet.getRange(1, 21).getValue()).trim() === '') sheet.getRange(1, 21).setValue('メモ日付');
}

/**
 * ★ 声掛けメモの保存（1キャスト1件・上書き。面談履歴のような過去ログは持たない）
 *   メモを空で保存すると、メモと日付の両方をクリアする（＝削除）。
 *   日付は保存した営業日を自動で打つ（08:00ロール準拠）。
 */
function saveCallMemo(data) {
  var name = String((data && data.name) || '').trim();
  if (!name) return { success: false, error: '源氏名がありません' };
  var memo = String((data && data.memo) || '').trim();
  if (memo.length > 100) memo = memo.substring(0, 100);  // 一言メモなので上限100文字

  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { success: false, error: '混み合っています（メモ）。少し待って再度お試しください' }; }
  try {
    var sheet = getSS_().getSheetByName(SHEET_NAME_URL);
    if (!sheet) return { success: false, error: 'URL管理シートが見つかりません' };
    ensureUrlMemoColumns_(sheet);
    var lastRow = sheet.getLastRow();
    if (lastRow < 2) return { success: false, error: 'URL管理にデータがありません' };

    // 源氏名で行を特定（同名は「最初の行」を採用＝GAS/日記側と同じルール）
    var names = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
    var rowIdx = -1;
    for (var i = 0; i < names.length; i++) {
      if (String(names[i][0] || '').trim() === name) { rowIdx = i + 2; break; }
    }
    if (rowIdx < 0) return { success: false, error: '該当キャストが見つかりません: ' + name };

    var memoDate = memo ? resolveBizDateISO_() : '';  // メモを消したら日付も消す
    sheet.getRange(rowIdx, 20, 1, 2).setValues([[memo, memoDate]]);
    return { success: true, name: name, memo: memo, memoDate: memoDate };
  } catch (e) {
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}

function getCallList() {
  var ss = getSS_();
  var url = ss.getSheetByName(SHEET_NAME_URL);
  if (!url) return { success: false, error: 'URL管理シートが見つかりません' };
  var uLast = url.getLastRow();
  if (uLast < 2) return { success: true, danger: [], warn: [], today: [], weekLast: '', bizDate: '' };
  var t = new Date(); var today0 = new Date(t.getFullYear(), t.getMonth(), t.getDate());

  // ★ 本日出勤リスト: 「明日以降」の起点はカレンダー日ではなく営業日(8時ロール/設定!B1)を使う。
  //    深夜1〜7時に開くとカレンダー日が翌日になり、明日シフトがある子まで「予定なし」と誤判定するため。
  var bizIso = resolveBizDateISO_();
  // ★ 本日出勤リスト: セルが時刻型に自動変換されている場合があるので表示用に正規化する
  var fmtCell = function (v) {
    if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Tokyo', 'HH:mm');
    return String(v == null ? '' : v).trim();
  };

  // 本日シフトデータの名前
  var todaySet = {};
  var todayInfo = {};  // ★ 本日出勤リスト: 源氏名 → { time, touketsu }
  var shift = ss.getSheetByName(SHEET_NAME_SHIFT);
  if (shift) {
    var sLast = shift.getLastRow();
    if (sLast >= 2) {
      // ★ 本日出勤リスト: B列(出勤時間 or '当欠')と N列(当欠時に退避された元の時間)まで読む
      var sCols = Math.min(14, shift.getMaxColumns());
      var sn = shift.getRange(2, 1, sLast - 1, sCols).getValues();
      for (var i = 0; i < sn.length; i++) {
        var nm = String(sn[i][0]).trim(); if (!nm) continue;
        todaySet[nm] = 1;
        var isTk = (fmtCell(sn[i][1]) === '当欠');
        var tDisp = isTk ? ((sCols >= 14) ? fmtCell(sn[i][13]) : '') : fmtCell(sn[i][1]);
        todayInfo[nm] = { time: tDisp, touketsu: isTk };
      }
    }
  }
  // 週間シフト(14日窓)の名前（B列）＋ ★ 翌営業日以降の予定・判定できた最終日（A列）
  var weekSet = {};
  var futureSet = {};    // ★ 本日出勤リスト: 翌営業日以降に1件でも予定がある子
  var weekLastIso = '';  // ★ 本日出勤リスト: 週間シフトに入っている最終日（＝どこまで判定できたか）
  var wk = ss.getSheetByName(SHEET_NAME_WEEKLY);
  if (wk) {
    var wLast = wk.getLastRow();
    if (wLast >= 2) {
      var wn = wk.getRange(2, 1, wLast - 1, 2).getValues();  // A=日付 / B=源氏名
      for (var j = 0; j < wn.length; j++) {
        var wm = String(wn[j][1]).trim(); if (!wm) continue;
        weekSet[wm] = 1;
        // ★ 日付セルは文字列/Date どちらもあり得る。ISOに正規化して文字列比較（ISOは辞書順＝日付順）
        var wv = wn[j][0];
        var wIso = '';
        if (wv instanceof Date) {
          wIso = Utilities.formatDate(wv, 'Asia/Tokyo', 'yyyy-MM-dd');
        } else {
          var wm2 = String(wv || '').trim().match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
          if (wm2) wIso = wm2[1] + '-' + ('0' + wm2[2]).slice(-2) + '-' + ('0' + wm2[3]).slice(-2);
        }
        if (!wIso) continue;
        if (wIso > weekLastIso) weekLastIso = wIso;
        if (wIso > bizIso) futureSet[wm] = 1;
      }
    }
  }
  // 出勤履歴を1回読んで 名前→直近30日(出勤/当欠)
  var d30 = {};
  var hist = ss.getSheetByName(SHEET_NAME_ATTENDANCE);
  if (hist) {
    var hLast = hist.getLastRow();
    if (hLast >= 2) {
      var from = new Date(today0.getTime() - 29 * 86400000);
      var hrows = hist.getRange(2, 1, hLast - 1, 3).getValues();
      for (var k = 0; k < hrows.length; k++) {
        var hnm = String(hrows[k][1]).trim(); if (!hnm) continue;
        var hd = parseYmdFlexible_(hrows[k][0]);
        if (!hd || hd < from || hd > today0) continue;
        if (!d30[hnm]) d30[hnm] = { work: 0, zenketsu: 0 };
        var hst = String(hrows[k][2]).trim();
        if (hst === '出勤') d30[hnm].work++; else if (hst === '当欠') d30[hnm].zenketsu++;
      }
    }
  }
  // URL管理を走査（A=名前, N(14)=最終出勤日, T(20)=声掛けメモ, U(21)=メモ日付）
  // ★ 声掛けメモ: T/U列はまだ物理的に存在しない可能性があるので、シートの実列数を見て安全に読む。
  //   （範囲外を読むと GAS が例外を投げるため。列の作成は saveCallMemo 側で行う）
  var uReadCols = Math.min(21, url.getMaxColumns());
  var urows = url.getRange(2, 1, uLast - 1, uReadCols).getValues();
  var danger = [], warn = [], todayList = [];  // ★ todayList = 本日出勤リスト（水色）
  for (var r = 0; r < urows.length; r++) {
    var name = String(urows[r][0]).trim();
    if (!name) continue;
    // ★ クラス＝スタッフは声掛け対象外（H列=index7）。3リスト共通。
    if (String(urows[r][7] || '').trim() === 'スタッフ') continue;
    // ★ 本日出勤リスト: 今日シフトにいて、翌営業日以降に予定が1件も無い子
    var isTodayTier = !!todayInfo[name] && !futureSet[name];
    if (!isTodayTier && (todaySet[name] || weekSet[name])) continue; // 今日出勤 or 14日内に予定→除外
    var nDate = parseYmdFlexible_(urows[r][13]); // N列=index13
    var gap = nDate ? Math.floor((today0.getTime() - nDate.getTime()) / 86400000) : -1;
    // ★ 本日出勤リストは最終出勤日が無くてもよい（体入初日の子がまさに対象）
    if (!isTodayTier) {
      if (!nDate) continue;  // 最終出勤日不明→除外（signalなし）
      if (gap < 7) continue; // 7日未満は最近→除外
    }
    var cnt = d30[name] || { work: 0, zenketsu: 0 };
    var mainStore = String(urows[r][8] || '').trim(); // I列(9)=メイン店舗
    if (mainStore !== 'delidosu' && mainStore !== 'anecan' && mainStore !== 'ainoshizuku') {
      // 未設定/不正 → 登録がある最初の店舗（でりどす→アネキャン→しずく）
      if (String(urows[r][1] || '').trim()) mainStore = 'delidosu';         // B列=でりどす名
      else if (String(urows[r][3] || '').trim()) mainStore = 'anecan';      // D列=アネキャン名
      else if (String(urows[r][5] || '').trim()) mainStore = 'ainoshizuku'; // F列=しずく名
      else mainStore = '';
    }
    // ★ 声掛けメモ（T列=index19 / U列=index20）。列が無い環境では空文字。
    var memo = (uReadCols >= 20) ? String(urows[r][19] || '').trim() : '';
    var memoDate = '';
    if (uReadCols >= 21) {
      var md = urows[r][20];
      if (md instanceof Date) memoDate = Utilities.formatDate(md, 'Asia/Tokyo', 'yyyy-MM-dd');
      else memoDate = String(md || '').trim();
    }
    var item = {
      name: name,
      store: mainStore,
      lastWork: nDate ? Utilities.formatDate(nDate, 'Asia/Tokyo', 'yyyy/MM/dd') : '',
      gapDays: gap,
      work30: cnt.work,
      zenketsu30: cnt.zenketsu,
      memo: memo,
      memoDate: memoDate
    };
    if (isTodayTier) {
      // ★ 本日出勤リスト: 当欠でもリストから消さず、印を付けて残す（フロントでグレー表示）
      item.time = todayInfo[name].time;
      item.touketsu = todayInfo[name].touketsu;
      todayList.push(item);
    } else if (gap >= 14) danger.push(item); else warn.push(item);
  }
  danger.sort(function (a, b) { return b.gapDays - a.gapDays; });
  warn.sort(function (a, b) { return b.gapDays - a.gapDays; });
  // ★ 本日出勤リスト: 当欠を下に、それ以外は源氏名順
  todayList.sort(function (a, b) {
    if (!a.touketsu !== !b.touketsu) return a.touketsu ? 1 : -1;
    var an = String(a.name), bn = String(b.name);
    return an < bn ? -1 : (an > bn ? 1 : 0);
  });
  return { success: true, danger: danger, warn: warn, today: todayList, weekLast: weekLastIso, bizDate: bizIso };
}

/**
 * 戦略シートを取得（なければヘッダー付きで自動生成）
 */
function getStrategySheet_() {
  const ss = getSS_();
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
    // A列（日付）を文字列扱いにして日付変換を防ぐ（新規作成時のみ・範囲限定で軽量化）
    sheet.getRange('A1:A2000').setNumberFormat('@');
  }
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
function shiftDateToMd_(shiftDate) {
  if (!shiftDate) return '';
  let mo, d;
  if (shiftDate instanceof Date) {
    mo = shiftDate.getMonth() + 1; d = shiftDate.getDate();
  } else {
    const m = String(shiftDate).match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (m) { mo = Number(m[2]); d = Number(m[3]); }
    else {
      const dt = new Date(String(shiftDate));
      if (isNaN(dt.getTime())) return '';
      mo = dt.getMonth() + 1; d = dt.getDate();
    }
  }
  return mo + '/' + d;
}

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

// ===============================
// ★ 商品（getProduct / saveProduct）：シート「商品」のA1に全文（改行込み）
function getProductSheet_() {
  const ss = getSS_();
  let sheet = ss.getSheetByName('商品');
  if (!sheet) {
    sheet = ss.insertSheet('商品');
  }
  return sheet;
}

function getProduct() {
  try {
    const sheet = getProductSheet_();
    const text = sheet.getRange('A1').getValue();
    return { success: true, text: (text != null) ? String(text) : '' };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

function saveProduct(text) {
  try {
    const sheet = getProductSheet_();
    sheet.getRange('A1').setValue(text != null ? String(text) : '');
    return { success: true };
  } catch (error) {
    return { success: false, error: error.toString() };
  }
}

// ★ 商品・イベント掲載（getPublications / savePublications）
// ===============================

/**
 * 掲載シートを取得（なければヘッダー付きで自動生成）
 */
function getPublicationSheet_() {
  const ss = getSS_();
  let sheet = ss.getSheetByName(SHEET_NAME_PUBLICATION);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_PUBLICATION);
  }
  // 中身が空ならヘッダーを投入（タイムアウトで空シートが残った場合も復旧）
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 5).setValues([['開始日', '終了日', 'カテゴリ', '内容', '更新日時']]);
    sheet.setFrozenRows(1);
    // 日付列(A,B)をテキスト書式に（範囲限定で軽量化）
    sheet.getRange('A1:B2000').setNumberFormat('@');
  }
  return sheet;
}

/**
 * 掲載カテゴリ（プルダウン選択肢）シートを取得（なければ初期値付きで自動生成）
 */
function getPubCategorySheet_() {
  const ss = getSS_();
  let sheet = ss.getSheetByName(SHEET_NAME_PUB_CATEGORY);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME_PUB_CATEGORY);
  }
  // 中身が空なら初期値と説明を投入（タイムアウトで空シートが残った場合も復旧）
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, 2).setValues([['カテゴリ', '← A列に1行ずつ追加するとプルダウンに反映されます']]);
    sheet.getRange(2, 1, 3, 1).setValues([['商品'], ['イベント'], ['バナー']]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/**
 * 掲載シート・掲載カテゴリシートを手動で準備（手動実行用）
 */
function setupPublicationSheets() {
  getPublicationSheet_();
  getPubCategorySheet_();
  return '掲載シート・掲載カテゴリシートを準備しました（既存の場合はそのまま）';
}

/**
 * 日付セルを「YYYY-MM-DD」に正規化（Date型でも文字列でも対応）
 */
function normalizePubDate_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, 'Asia/Tokyo', 'yyyy-MM-dd');
  }
  return String(v || '').trim();
}

/**
 * 掲載一覧とカテゴリ選択肢を取得
 */
function getPublications() {
  const sheet = getPublicationSheet_();
  const catSheet = getPubCategorySheet_();

  // カテゴリ選択肢（A2以降）
  let categories = [];
  const catLast = catSheet.getLastRow();
  if (catLast >= 2) {
    categories = catSheet.getRange(2, 1, catLast - 1, 1).getValues()
      .map(r => String(r[0]).trim())
      .filter(v => v !== '');
  }

  // 掲載一覧（2行目以降）
  let items = [];
  const lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    const vals = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
    items = vals.map(r => ({
      start: normalizePubDate_(r[0]),
      end: normalizePubDate_(r[1]),
      category: String(r[2] || ''),
      content: String(r[3] || '')
    }));
  }

  return { success: true, items: items, categories: categories };
}

/**
 * 掲載一覧をまるごと保存（既存のデータ行を消して書き直す。行の増減に対応）
 * @param {Array} items [{start, end, category, content}, ...]
 */
function savePublications(items) {
  const sheet = getPublicationSheet_();
  const lastRow = sheet.getLastRow();

  // 既存データ行（ヘッダー以外）を削除
  if (lastRow > 1) {
    sheet.deleteRows(2, lastRow - 1);
  }

  const arr = Array.isArray(items) ? items : [];
  const timestamp = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy/MM/dd HH:mm:ss');
  if (arr.length > 0) {
    const rows = arr.map(it => [
      (it && it.start) || '',
      (it && it.end) || '',
      (it && it.category) || '',
      (it && it.content) || '',
      timestamp
    ]);
    sheet.getRange(2, 1, rows.length, 5).setValues(rows);
  }
  return { success: true, message: '掲載を保存しました', count: arr.length };
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
  const ss = getSS_();
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
  const ss = getSS_();
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
  const ss = getSS_();
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
  const ss = getSS_();
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
      // ★ 面談履歴シートの同じ源氏名の行も全削除（同名の子を後で再登録しても
      //   古い面談データが源氏名一致で復活しないようにするための根本対策）
      const delCount = deleteInterviewHistoryByName_(name);
      // ★ 出勤履歴シートの同じ源氏名の行も全削除（面談履歴と同方針。再登録で古い
      //   出勤/当欠が源氏名一致で復活し、30日集計・最終出勤日・声掛けに混入するのを防ぐ）
      const attCount = deleteAttendanceHistoryByName_(name);
      const extra = [];
      if (delCount > 0) extra.push('面談履歴' + delCount + '件');
      if (attCount > 0) extra.push('出勤履歴' + attCount + '件');
      return { success: true, message: 'URL情報を削除しました' + (extra.length > 0 ? '（' + extra.join('・') + 'も削除）' : '') };
    }
  }
  
  return { success: false, error: '該当する源氏名が見つかりません' };
}

/**
 * ★ 指定した源氏名の面談履歴シートの行をすべて削除する。
 *   キャスト削除（deleteUrlData）から呼ばれる。源氏名がキーの構造上、
 *   キャストを消しても面談履歴の行が残ると、同名の子を再登録したときに
 *   古い面談が紐づいて「復活」して見える。それを防ぐための根本対策。
 *   行番号のズレを防ぐため下から上へ削除する。
 */
function deleteInterviewHistoryByName_(name) {
  if (!name) return 0;
  const ss = getSS_();
  const sheet = ss.getSheetByName(SHEET_NAME_HISTORY);
  if (!sheet) return 0;
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;
  const values = sheet.getRange(2, 1, lastRow - 1, 1).getValues();  // A列=源氏名
  const target = String(name).trim();
  let deleted = 0;
  for (let i = values.length - 1; i >= 0; i--) {  // 下から上へ
    if (String(values[i][0]).trim() === target) {
      sheet.deleteRow(i + 2);
      deleted++;
    }
  }
  return deleted;
}

/**
 * ★ 指定した源氏名の出勤履歴シートの行をすべて削除する。
 *   キャスト削除（deleteUrlData）から呼ばれる。出勤履歴は 日付+源氏名 がキーで
 *   源氏名は【B列】。キャストを消しても行が残ると、同名の子を再登録したときに
 *   古い出勤/当欠が源氏名一致で復活し、30日集計・最終出勤日再計算・声掛けに混入する。
 *   それを防ぐための根本対策（面談履歴と同方針）。行番号のズレを防ぐため下から上へ削除する。
 */
function deleteAttendanceHistoryByName_(name) {
  if (!name) return 0;
  const ss = getSS_();
  const sheet = ss.getSheetByName(SHEET_NAME_ATTENDANCE);
  if (!sheet) return 0;
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return 0;
  const values = sheet.getRange(2, 2, lastRow - 1, 1).getValues();  // B列=源氏名
  const target = String(name).trim();
  let deleted = 0;
  for (let i = values.length - 1; i >= 0; i--) {  // 下から上へ
    if (String(values[i][0]).trim() === target) {
      sheet.deleteRow(i + 2);
      deleted++;
    }
  }
  return deleted;
}

/**
 * 最終出勤日を一括更新
 */
function updateLastWorkDate(names, date) {
  const ss = getSS_();
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
 * ★Phase3(3-5): 既読列(F)の値をパース。JSON配列 [{staff,date}] を返す（空/不正は[]）。
 */
function parseReadBy_(v) {
  var s = String(v == null ? '' : v).trim();
  if (!s) return [];
  try {
    var a = JSON.parse(s);
    if (Object.prototype.toString.call(a) === '[object Array]') {
      var out = [];
      for (var i = 0; i < a.length; i++) {
        if (a[i] && a[i].staff) out.push({ staff: String(a[i].staff), date: String(a[i].date || '') });
      }
      return out;
    }
  } catch (e) {}
  return [];
}

/**
 * ★Phase3(3-5): 面談コメントを既読にする（コメント単位・スタッフ名＋日付を記録・複数人可）。
 *   rowIndex行のF列(既読)に {staff, date(今日)} を追記（同スタッフは日付更新）。名前で行整合を確認。ScriptLockで排他。
 */
function markCommentRead(rowIndex, name, staff) {
  rowIndex = Number(rowIndex);
  name = String(name || '').trim();
  staff = String(staff || '').trim();
  if (!rowIndex || rowIndex < 2) return { success: false, error: '行が不正です' };
  if (!staff) return { success: false, error: 'スタッフが未選択です' };
  var lock = LockService.getScriptLock();
  try { lock.waitLock(20000); } catch (e) { return { success: false, error: '混み合っています（既読）' }; }
  try {
    var ss = getSS_();
    var sheet = ss.getSheetByName(SHEET_NAME_HISTORY);
    if (!sheet) return { success: false, error: '面談履歴シートが見つかりません' };
    if (rowIndex > sheet.getLastRow()) return { success: false, error: '対象コメントが見つかりません（画面を更新してください）' };
    var rowName = String(sheet.getRange(rowIndex, 1).getValue() || '').trim();
    if (name && rowName && rowName !== name) return { success: false, error: 'コメントがずれています（画面を更新してください）' };
    if (String(sheet.getRange(1, 6).getValue() || '').trim() === '') sheet.getRange(1, 6).setValue('既読');
    var cur = parseReadBy_(sheet.getRange(rowIndex, 6).getValue());
    var today = Utilities.formatDate(new Date(), 'Asia/Tokyo', 'yyyy-MM-dd');
    var found = false;
    for (var i = 0; i < cur.length; i++) {
      if (cur[i].staff === staff) { cur[i].date = today; found = true; break; }
    }
    if (!found) cur.push({ staff: staff, date: today });
    sheet.getRange(rowIndex, 6).setValue(JSON.stringify(cur));
    return { success: true, readBy: cur };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 面談履歴を取得（行番号付き）
 */
function getInterviewHistory(name) {
  const ss = getSS_();
  const sheet = ss.getSheetByName(SHEET_NAME_HISTORY);
  
  if (!sheet) {
    return { success: false, error: '面談履歴シートが見つかりません' };
  }
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { success: true, data: [] };
  }
  
  const range = sheet.getRange(2, 1, lastRow - 1, 6);
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
        createdAt: values[i][4],
        readBy: parseReadBy_(values[i][5])
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
  const ss = getSS_();
  
  let historySheet = ss.getSheetByName(SHEET_NAME_HISTORY);
  if (!historySheet) {
    historySheet = ss.insertSheet(SHEET_NAME_HISTORY);
    historySheet.getRange(1, 1, 1, 6).setValues([['源氏名', '面談日', '担当スタッフ', 'コメント', '登録日時', '既読']]);
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
  const ss = getSS_();
  const urlSheet = ss.getSheetByName(SHEET_NAME_URL);
  
  if (!urlSheet) {
    Logger.log('URL管理シートが見つかりません');
    return;
  }
  
  let historySheet = ss.getSheetByName(SHEET_NAME_HISTORY);
  if (!historySheet) {
    historySheet = ss.insertSheet(SHEET_NAME_HISTORY);
    historySheet.getRange(1, 1, 1, 6).setValues([['源氏名', '面談日', '担当スタッフ', 'コメント', '登録日時', '既読']]);
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
  const ss = getSS_();
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
  const ss = getSS_();
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
  const ss = getSS_();
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
  const ss = getSS_();
  const sheet = ss.getSheetByName(SHEET_NAME_HISTORY);
  
  if (!sheet) {
    return { success: true, data: {} };
  }
  
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return { success: true, data: {} };
  }
  
  const range = sheet.getRange(2, 1, lastRow - 1, 6);
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
      createdAt: values[i][4],
      readBy: parseReadBy_(values[i][5])
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
  var ss = getSS_();
  
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
  var ss = getSS_();
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
  
  var ss = getSS_();
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
  
  var ss = getSS_();
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
  var ss = getSS_();
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
      
      // ★ Phase1・経路B: 出勤履歴を更新＋最終出勤日を再計算（当欠/復活の両方向・非致命）
      try {
        var _sd = String(data.shiftDate || '').trim(); // 営業日はフロントから受け取る
        if (!_sd) _sd = resolveBizDateISO_(); // ★修正: 空(リロード後でcurrentShiftDateISO未設定等)なら設定B1のシフト日付で補完＝履歴キー(日付+源氏名)を一致させる
        if (_sd) {
          var _hist = getAttendanceSheet_();
          if (data.time === '当欠') {
            upsertAttendance_(_hist, _sd, data.name, '当欠', '', '');
          } else {
            upsertAttendance_(_hist, _sd, data.name, '出勤', data.time, ''); // 復活＝出勤に戻す
          }
          recalcLastWorkDate_(data.name); // N列を履歴の「出勤」最新日に巻き戻す/進める
        }
      } catch (e2) {
        Logger.log('【出勤履歴/最終出勤日 連動エラー】' + e2.toString());
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
function getInitialData(commentsParam) {
  try {
    // ★ ?comments=0 のときは全キャストのコメント(getAllInterviewHistory)を取得しない＝初回描画の高速化。
    //   既定(パラメータ無し)はコメント込み＝後方互換。更新(reloadCoreData)はコメント込みで呼ぶ。
    const includeComments = commentsParam !== '0';
    const shiftDateResult = getShiftDate();
    const shiftDataResult = getShiftData();
    const urlDataResult = getUrlData();
    const okiniDataResult = getOkiniData();
    const commentsResult = includeComments ? getAllInterviewHistory() : null;

    const shiftDate = (shiftDateResult && shiftDateResult.success) ? shiftDateResult.date : '';
    // ★ 明日の戦略も相乗りで返す（フロントの追加往復をなくし、時間差を解消）
    const strategyDate = getStrategyTargetDateFromShiftDate_(shiftDate);
    const strategyResult = strategyDate ? getStrategy(strategyDate) : null;
    const todayStrategyResult = shiftDate ? getStrategy(shiftDate) : null;
    // ★ 商品・イベント掲載も相乗りで返す
    const publicationsResult = getPublications();
    const productResult = getProduct();
    // ★ 週間シフトの人数（明日の戦略の出勤人数を自動表示するため）も相乗り
    const weeklyHeadcountResult = getWeeklyHeadcount();

    return {
      success: true,
      shiftDate: shiftDate,
      shiftData: (shiftDataResult && shiftDataResult.success) ? shiftDataResult.data : [],
      urlData: (urlDataResult && urlDataResult.success) ? urlDataResult.data : [],
      okiniData: (okiniDataResult && okiniDataResult.success) ? okiniDataResult.data : [],
      comments: (commentsResult && commentsResult.success) ? commentsResult.data : {},
      strategy: strategyResult ? { date: strategyResult.date, found: strategyResult.found, stores: strategyResult.stores } : null,
      todayStrategy: todayStrategyResult ? { dateMd: shiftDateToMd_(shiftDate), found: todayStrategyResult.found, stores: todayStrategyResult.stores } : null,
      publications: (publicationsResult && publicationsResult.success) ? { items: publicationsResult.items, categories: publicationsResult.categories } : null,
      product: (productResult && productResult.success) ? productResult.text : null,
      weeklyHeadcount: (weeklyHeadcountResult && weeklyHeadcountResult.success) ? weeklyHeadcountResult.days : []
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
  var ss = getSS_();
  var sheets = ss.getSheets();
  var names = [];
  for (var i = 0; i < sheets.length; i++) {
    names.push('「' + sheets[i].getName() + '」');
  }
  Logger.log('全シート名: ' + names.join(', '));
  SpreadsheetApp.getUi().alert('全シート名:\n' + names.join('\n'));
}

// ===============================
// ★ 空き予告システム: リアルタイム投稿のロック判定（R列/S列）
// ===============================
// シフトデータの A列(源氏名) で対象キャストの行を探し、
//   R列(18) = 空き予告_最終投稿時刻（60分ロック）
//   S列(19) = 本日満了_最終投稿日（1日1回ロック）
// を読み書きする。照合は updateCheckStatus と同じ「源氏名一致」方式。

const AVAILABILITY_LOCK_MINUTES = 60;  // 空き予告ロック（要件§3-4の暫定値）

/**
 * シフトデータの A列(源氏名) から対象行を探す
 * @return {{sheet: Sheet|null, row: number}} row は1始まり。見つからなければ -1
 */
function findShiftRowByName_(name) {
  const ss = getSS_();
  const sheet = ss.getSheetByName(SHEET_NAME_SHIFT);
  if (!sheet) return { sheet: null, row: -1 };
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { sheet: sheet, row: -1 };
  const target = String(name).trim();
  const names = sheet.getRange(2, 1, lastRow - 1, 1).getValues();  // A列だけ
  for (let i = 0; i < names.length; i++) {
    if (String(names[i][0]).trim() === target) {
      return { sheet: sheet, row: i + 2 };
    }
  }
  return { sheet: sheet, row: -1 };
}

/**
 * 空き予告ロックの判定（R列・18）
 * @return {{found: boolean, locked: boolean, remainingMin: number}}
 */
function checkAvailabilityLock(name) {
  const found = findShiftRowByName_(name);
  if (found.row < 0) return { found: false, locked: false, remainingMin: 0 };
  const val = found.sheet.getRange(found.row, 18).getValue();  // R列
  if (val === '' || val === null || val === undefined) {
    return { found: true, locked: false, remainingMin: 0 };
  }
  const last = (val instanceof Date) ? val : new Date(val);
  if (isNaN(last.getTime())) {
    return { found: true, locked: false, remainingMin: 0 };  // 読めない値は未ロック扱い
  }
  const elapsedMin = (Date.now() - last.getTime()) / 60000;
  if (elapsedMin >= AVAILABILITY_LOCK_MINUTES) {
    return { found: true, locked: false, remainingMin: 0 };
  }
  return { found: true, locked: true, remainingMin: Math.ceil(AVAILABILITY_LOCK_MINUTES - elapsedMin) };
}

/**
 * 空き予告ロックをかける（R列・18 に現在時刻）
 */
function setAvailabilityLock(name) {
  const found = findShiftRowByName_(name);
  if (found.row < 0) return { success: false, message: '源氏名が見つかりません: ' + name };
  found.sheet.getRange(found.row, 18).setValue(new Date());
  return { success: true };
}

/**
 * ★ 空き予告グレーアウト用（方式B）: シフトデータ全行のR列を一括で読み、
 *   今ロック中（60分以内）の {源氏名: 残り分} を返す。getRealtimeFlags が相乗りで返す。
 * @return {Object} 例 { 'みき': 42, 'さとみ': 7 }
 */
function getAvailabilityLocks_() {
  const out = {};
  try {
    const ss = getSS_();
    const sheet = ss.getSheetByName(SHEET_NAME_SHIFT);
    if (!sheet) return out;
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return out;
    const data = sheet.getRange(2, 1, lastRow - 1, 18).getValues(); // A列(源氏名)〜R列(18)
    const now = Date.now();
    for (let i = 0; i < data.length; i++) {
      const name = String(data[i][0] || '').trim();
      if (!name) continue;
      const val = data[i][17]; // R列(18) = index17 = 空き予告_最終投稿時刻
      if (val === '' || val === null || val === undefined) continue;
      const last = (val instanceof Date) ? val : new Date(val);
      if (isNaN(last.getTime())) continue;
      const elapsedMin = (now - last.getTime()) / 60000;
      if (elapsedMin >= AVAILABILITY_LOCK_MINUTES) continue;
      out[name] = Math.ceil(AVAILABILITY_LOCK_MINUTES - elapsedMin);
    }
  } catch (e) {
    // 失敗時は空（グレーアウトしないだけ。サーバー側ロックは別途効く）
  }
  return out;
}

/**
 * ★ 本日満了グレーアウト用: シフトデータ全行のS列を一括で読み、
 *   本日すでに本日満了を出した {源氏名: true} を返す。getRealtimeFlags が相乗りで返す。
 * @return {Object} 例 { 'えりな': true }
 */
function getManryoLocks_() {
  const out = {};
  try {
    const ss = getSS_();
    const sheet = ss.getSheetByName(SHEET_NAME_SHIFT);
    if (!sheet) return out;
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return out;
    const data = sheet.getRange(2, 1, lastRow - 1, 19).getValues(); // A列(源氏名)〜S列(19)
    const today = getManryoBusinessDate_();
    for (let i = 0; i < data.length; i++) {
      const name = String(data[i][0] || '').trim();
      if (!name) continue;
      const val = data[i][18]; // S列(19) = index18 = 本日満了_最終投稿日
      if (val === '' || val === null || val === undefined) continue;
      const stored = (val instanceof Date)
        ? Utilities.formatDate(val, 'Asia/Tokyo', 'yyyy-MM-dd')
        : String(val).trim();
      if (stored === today) out[name] = true;
    }
  } catch (e) {
    // 失敗時は空（グレーアウトしないだけ）
  }
  return out;
}

/**
 * 本日満了ロックの判定（S列・19）= 当日すでに投稿済みか
 * @return {{found: boolean, locked: boolean}}
 */
/**
 * ★ 営業日（10:00→翌5:00）の日付文字列。深夜帯(0:00〜7:59)は前日扱い（lateNightThreshold=8に統一）。
 *   本日満了ロックが0時の日付変更で外れないよう、カレンダー日付ではなく営業日で記録/判定する。
 */
function getManryoBusinessDate_() {
  var d = new Date(new Date().getTime() - 8 * 3600 * 1000);  // 8時間前にずらす＝日付が朝8時で変わる
  return Utilities.formatDate(d, 'Asia/Tokyo', 'yyyy-MM-dd');
}

function checkManryoLock(name) {
  const found = findShiftRowByName_(name);
  if (found.row < 0) return { found: false, locked: false };
  const val = found.sheet.getRange(found.row, 19).getValue();  // S列
  if (val === '' || val === null || val === undefined) {
    return { found: true, locked: false };
  }
  const today = getManryoBusinessDate_();
  const stored = (val instanceof Date)
    ? Utilities.formatDate(val, 'Asia/Tokyo', 'yyyy-MM-dd')
    : String(val).trim();
  return { found: true, locked: (stored === today) };
}

/**
 * 本日満了ロックをかける（S列・19 に当日日付）
 */
function setManryoLock(name) {
  const found = findShiftRowByName_(name);
  if (found.row < 0) return { success: false, message: '源氏名が見つかりません: ' + name };
  const today = getManryoBusinessDate_();
  found.sheet.getRange(found.row, 19).setValue(today);
  return { success: true };
}

// ========================================
// ★ 空き予告システム: リアルタイム投稿API（手順4）
// ========================================
// ミテネマスターのカードから {name, time} で呼ばれる doPost アクション 'postAvailability'。
// キャスト読み取り（日記ありフィルタなし）→ ON/OFF → LockService → 60分ロック →
// シフトデータから店舗(D/F/H＋E/G/I)とgid → タイミング判定 → 生成 → 店舗ごとに保存 → ロック。
// 生成/保存の本体は diaryGenerator.gs（generateAvailabilityDiary_ / saveDiary_）を共有スコープで呼ぶ。

/**
 * ★ 空き予告用のキャスト読み取り（重要: getTargetCasts_ と違い「日記ありフィルタ」をかけない）
 *   日記なし＋空き予告ONの子も拾うため。空き予告列は見出しから動的に探す。
 * @param {string} name - 源氏名（キャストプロンプトA列）
 * @return {{found:boolean, mainName, prompt, titleMode, fixedTitle, textAlign, scope, enabled}}
 */
function getRealtimeCast_(name) {
  const ss = getSS_();
  const sheet = ss.getSheetByName(DIARY_SHEET_PROMPT);
  if (!sheet) return { found: false };
  const lastRow = sheet.getLastRow();
  const lastCol = sheet.getLastColumn();
  if (lastRow < 2) return { found: false };

  // 空き予告列を見出し（1行目）から探す
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  let akiCol = -1;
  for (let i = 0; i < headers.length; i++) {
    if (String(headers[i]).trim() === '空き予告') { akiCol = i + 1; break; }
  }

  // 対象行を探す（A列=源氏名）。フィルタなし＝C列「日記なし」でも拾う。
  const data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const target = String(name).trim();
  for (let i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === target) {
      const row = data[i];
      const scope = (akiCol > 0) ? String(row[akiCol - 1] || '').trim() : '';
      return {
        found: true,
        mainName: String(row[0] || '').trim(),  // A
        prompt: String(row[1] || ''),           // B（文体・サンプル日記）
        titleMode: String(row[3] || '生成'),    // D
        fixedTitle: String(row[4] || ''),       // E
        textAlign: String(row[7] || '').trim(), // H
        scope: scope,                           // 空き予告列の値
        enabled: (scope === '全公開' || scope === 'マイガール限定'),
      };
    }
  }
  return { found: false };
}

/**
 * ★ タイミング文言を決める（要件§3-5: 入力時刻が現在から10分以内なら「今から」、以降は「◯時から」）
 * @param {string} tappedTime - "HH:MM"（空なら今から）
 * @return {string} 「今から」または「21:30から」
 */
function buildTimingLine_(tappedTime) {
  const t = String(tappedTime || '').trim();
  if (!t) return '今から';
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return '今から';
  // 現在のJST時刻（プロジェクトのタイムゾーンに依存しないよう明示）
  const nowH = parseInt(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'H'), 10);
  const nowM = parseInt(Utilities.formatDate(new Date(), 'Asia/Tokyo', 'm'), 10);
  const th = parseInt(m[1], 10), tm = parseInt(m[2], 10);
  let diff = (th * 60 + tm) - (nowH * 60 + nowM);
  // ★ 深夜またぎ: 今が日中〜夜(6時以降)で、指定が早朝(0〜5時)なら「これから来る早朝」＝翌日分の未来
  if (diff < 0 && th < 6 && nowH >= 6) diff += 1440;
  if (diff <= 10) return '今から';   // 過去（＝もう空いてる）or 10分以内 → 今から
  return th + ':' + ('0' + tm).slice(-2) + 'から';   // ★ 先頭0を付けない（02:00→2:00）
}

/**
 * ★ 空き予告のメイン処理（doPost 'postAvailability' から呼ばれる）
 * @param {string} name - 源氏名
 * @param {string} tappedTime - タップされた空き時刻 "HH:MM"（空可）
 * @return {Object} {success, posted, status, mode, timing, message} / 失敗時 {success:false, ...}
 */
/**
 * ★ リアルタイム投稿用：URL管理から指定メイン名の店舗別URLを取得
 * gidを通常生成・投稿ツールのログインと同じソース（URL管理）に統一し、別人投稿を防ぐ
 * @return {Object} { delidosu, anecan, ainoshizuku }（未登録は空文字）
 */
function getUrlManageStoreUrls_(mainName) {
  mainName = String(mainName || '').trim();
  var empty = { delidosu: '', anecan: '', ainoshizuku: '', delidosuName: '', anecanName: '', ainoshizukuName: '' };
  if (!mainName) return empty;
  var sheet = getSS_().getSheetByName(SHEET_NAME_URL);
  if (!sheet) return empty;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return empty;
  var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();  // A〜G
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === mainName) {
      return {
        delidosu:    String(data[i][2] || '').trim(),  // C列
        anecan:      String(data[i][4] || '').trim(),  // E列
        ainoshizuku: String(data[i][6] || '').trim(),  // G列
        // ★ v5.9: 店舗名もURL管理の同じ行から（B/D/F列）。gid（URL）と同じ行から取ることで
        //   ログイン・投稿先・本文の身元が常に一致（シフトデータの名前は身元ソースにしない）
        delidosuName:    String(data[i][1] || '').trim(),  // B列
        anecanName:      String(data[i][3] || '').trim(),  // D列
        ainoshizukuName: String(data[i][5] || '').trim(),  // F列
      };
    }
  }
  return empty;
}

function postAvailability(name, tappedTime) {
  name = String(name || '').trim();
  if (!name) return { success: false, message: '名前が指定されていません' };

  // 1. キャスト読み取り（日記ありフィルタなし）＋ ON/OFF
  const cast = getRealtimeCast_(name);
  if (!cast.found) return { success: false, message: 'キャストプロンプトに見つかりません: ' + name };
  if (!cast.enabled) return { success: false, message: 'この子はリアルタイムOFF（空き予告列が「なし」/空）です' };

  // 2. 同時タップの二重投稿を防ぐ（スクリプトロック）
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: '混み合っています。少し待って再度お試しください。' };
  }

  try {
    // 3. 60分ロック判定（R列）
    const lk = checkAvailabilityLock(name);
    if (lk.locked) {
      return { success: false, locked: true, remainingMin: lk.remainingMin,
               message: 'あと' + lk.remainingMin + '分は空き予告を出せません' };
    }

    // 4. 出勤行の確認（シフトデータ: 出勤時間B列のみ使用。名前・gidはURL管理から）
    const found = findShiftRowByName_(name);
    if (found.row < 0) return { success: false, message: 'シフトデータに出勤行が見つかりません: ' + name };
    const r = found.sheet.getRange(found.row, 1, 1, 19).getValues()[0];
    const shiftTimeStr = String(r[1] || '');  // B列: 出勤時間（記録用）
    // ★ v5.9: 名前もgidもURL管理の同じ行から取得（ログイン・投稿先・本文の身元が常に一致＝
    //   別人投稿と「正しいアカウントに別の子の名前」を構造的に防止。シフト取り込みズレの影響を受けない）
    const umUrls = getUrlManageStoreUrls_(name);
    const storeDefs = [
      { store: 'delidosu',    nm: umUrls.delidosuName,    url: umUrls.delidosu },     // URL管理 B/C
      { store: 'anecan',      nm: umUrls.anecanName,      url: umUrls.anecan },       // URL管理 D/E
      { store: 'ainoshizuku', nm: umUrls.ainoshizukuName, url: umUrls.ainoshizuku },  // URL管理 F/G
    ];
    const stores = [];
    // ★ v5.15: 店舗別ON/OFF（キャストプロンプトの「◯◯日記」列）。空欄＝ON
    const storeFlags = getCastStoreFlags_(name);  // diaryGenerator.gs
    const storeOff = [];
    for (let i = 0; i < storeDefs.length; i++) {
      const nm = String(storeDefs[i].nm || '').trim();
      if (!nm) continue;
      if (storeFlags && storeFlags[storeDefs[i].store] === false) { storeOff.push(storeDefs[i].store); continue; }
      const gid = extractGid_(storeDefs[i].url);  // diaryGenerator.gs
      if (!gid) continue;
      stores.push({ store: storeDefs[i].store, castName: nm, gid: gid });
    }
    if (stores.length === 0) {
      return { success: false, message: storeOff.length
        ? 'この子は全店舗で日記OFFです（キャストプロンプトの店舗別ON/OFF列）'
        : '投稿先の店舗（名前＋有効なURL）が見つかりません' };
    }

    // 5. タイミング（今から / ◯時から）
    const timingLine = buildTimingLine_(tappedTime);

    // 6. 生成（diaryGenerator.gs）
    const parsed = generateAvailabilityDiary_(cast, timingLine);
    if (!parsed || !parsed.body) return { success: false, message: '生成に失敗しました' + ((typeof __rtFailReason !== 'undefined' && __rtFailReason) ? '：' + __rtFailReason : '（時間をおいて再度お試しください）') };

    // 7. 保存（即投稿=pending / 確認あり=draft）。リアルタイムなので深夜の翌日シフトはしない(=true)
    const mode = PropertiesService.getScriptProperties().getProperty('REALTIME_POST_MODE') || '確認あり';
    const status = (mode === '即投稿') ? 'pending' : 'draft';
    const baseNow = new Date();
    const GAP_MIN = 5;  // ★ 店舗ごとの投稿間隔（分）：同時刻に出さない（必死感・自動感を避ける）
    const ss = getSS_();
    for (let i = 0; i < stores.length; i++) {
      // ★ 5分ずらし: でりどす=今 / アネキャン=+5分 / しずく=+10分（完全日時で日跨ぎも正しく）
      const slot = new Date(baseNow.getTime() + i * GAP_MIN * 60000);
      const slotStr = Utilities.formatDate(slot, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
      const row = {
        mainName: cast.mainName,
        store: stores[i].store,
        castName: stores[i].castName,
        gid: stores[i].gid,
        title: (cast.titleMode === '固定' && cast.fixedTitle) ? replaceNames_(getFixedTitleForStore_(cast.fixedTitle, stores[i].store), stores[i].castName) : replaceNames_(parsed.title, stores[i].castName),
        body: replaceNames_(parsed.body, stores[i].castName),
        postTime: slotStr,        // 今＋i×5分（完全日時 YYYY-MM-DD HH:MM）
        diaryType: '空き予告',
        shiftTime: shiftTimeStr,
        scope: cast.scope,        // 全公開 / マイガール限定
        textAlign: cast.textAlign,
        mediaType: '画像',
      };
      saveDiary_(ss, row, status, true);  // diaryGenerator.gs（第4引数 isRealtime=true）
    }

    // 8. ロックをかける（R列に現在時刻）
    setAvailabilityLock(name);

    return {
      success: true,
      posted: stores.length,
      status: status,
      mode: mode,
      timing: timingLine,
      message: (status === 'pending')
        ? stores.length + '店舗に投稿予約しました（即投稿モード）'
        : stores.length + '店舗ぶん下書きを作成しました（日記出力シートで確認→pendingで投稿）'
    };
  } finally {
    lock.releaseLock();
  }
}

// ========================================
// ★ 本日満了システム（手順8）
// ========================================
// ミテネのカードから {name} で呼ばれる doPost アクション 'postManryo'。
// 空き予告とほぼ同じ流れ（ロック→生成→店舗ごと5分ずらし投稿）。違い＝
//   ・ロックはS列の1日1回（checkManryoLock / setManryoLock）
//   ・タイミングの代わりに「次の出勤日」を週間シフトから取得（未来スカーシティ）
//   ・diaryType = '本日満了'、生成は generateManryoDiary_ を使う

/**
 * ★ 本日満了: 週間シフトから本人の「次の出勤日」を取得して「M月D日(曜)」で返す。
 *   今日 = 週間シフトの最古日。次の出勤日 = 本人が出勤(出勤予/出勤確/受付終)する、今日より後の最小日付。
 * @return {string|null} 例「6月23日(月)」。見つからなければ null。
 */
function getNextShiftDate_(name) {
  name = String(name || '').trim();
  if (!name) return null;
  const ss = getSS_();
  const sheet = ss.getSheetByName(SHEET_NAME_WEEKLY);
  if (!sheet) return null;
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const tz = ss.getSpreadsheetTimeZone();
  const toYmd = function (v) {
    if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
    var str = String(v == null ? '' : v).trim();
    var m = str.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    return str;
  };
  const WORKING = { '出勤予': 1, '出勤確': 1, '受付終': 1 };
  const values = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  // 全体の最古日 = 今日
  var allDates = [];
  values.forEach(function (r) {
    var d = toYmd(r[0]);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) allDates.push(d);
  });
  if (allDates.length === 0) return null;
  allDates.sort();
  var today = allDates[0];
  // 本人の、今日より後の出勤日
  var cand = [];
  values.forEach(function (r) {
    if (String(r[1] || '').trim() !== name) return;
    if (!WORKING[String(r[4] || '').trim()]) return;
    var d = toYmd(r[0]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    if (d > today) cand.push(d);
  });
  if (cand.length === 0) return null;
  cand.sort();
  var p = cand[0].split('-');
  var dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
  var wd = ['日', '月', '火', '水', '木', '金', '土'][dt.getDay()];
  return Number(p[1]) + '月' + Number(p[2]) + '日(' + wd + ')';
}

/**
 * ★ 手順11: 週内シフト宣伝用。週間シフトから本人の「今日より後の出勤日一覧」を返す。
 *   今日 = 週間シフトの最古日。出勤 = 出勤予/出勤確/受付終。同一日が複数店舗にある場合は1日に集約。
 *   日付正規化は getNextShiftDate_ と同じ（日付型セルにも対応＝NaN防止）。
 * @param {string} name - 源氏名（メイン）
 * @return {Array<Object>} 例 [{ ymd:'2026-06-23', md:'6/23', mdj:'6月23日', weekday:'月', start:'15:00', end:'22:00', daysFromToday:2 }, ...]
 *   昇順ソート。週間シフト未取込・本人の今後の出勤なしの場合は空配列。
 */
function getWeeklyShiftEntries_(name) {
  name = String(name || '').trim();
  if (!name) return [];
  const ss = getSS_();
  const sheet = ss.getSheetByName(SHEET_NAME_WEEKLY);
  if (!sheet) return [];
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const tz = ss.getSpreadsheetTimeZone();
  const toYmd = function (v) {
    if (v instanceof Date) return Utilities.formatDate(v, tz, 'yyyy-MM-dd');
    var str = String(v == null ? '' : v).trim();
    var m = str.match(/(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})/);
    if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    return str;
  };
  const WORKING = { '出勤予': 1, '出勤確': 1, '受付終': 1 };
  const values = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  // 全体の最古日 = 今日
  var allDates = [];
  values.forEach(function (r) {
    var d = toYmd(r[0]);
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) allDates.push(d);
  });
  if (allDates.length === 0) return [];
  allDates.sort();
  var today = allDates[0];
  var tp = today.split('-');
  var todayDt = new Date(Number(tp[0]), Number(tp[1]) - 1, Number(tp[2]));
  // 本人の、今日より後の出勤日（未来の出勤だけ告知）
  var seen = {};
  var entries = [];
  values.forEach(function (r) {
    if (String(r[1] || '').trim() !== name) return;
    if (!WORKING[String(r[4] || '').trim()]) return;
    var d = toYmd(r[0]);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    if (d <= today) return;            // 今日以前は告知しない
    if (seen[d]) return;               // 同一日が複数店舗にある場合は1回だけ
    seen[d] = 1;
    var p = d.split('-');
    var dt = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    var wd = ['日', '月', '火', '水', '木', '金', '土'][dt.getDay()];
    var diffDays = Math.round((dt.getTime() - todayDt.getTime()) / 86400000);
    entries.push({
      ymd: d,
      md: Number(p[1]) + '/' + Number(p[2]),
      mdj: Number(p[1]) + '月' + Number(p[2]) + '日',
      weekday: wd,
      start: String(r[2] || '').trim(),
      end: String(r[3] || '').trim(),
      daysFromToday: diffDays
    });
  });
  entries.sort(function (a, b) { return a.ymd < b.ymd ? -1 : (a.ymd > b.ymd ? 1 : 0); });
  // ★ Phase0-2: 週間シフトが2週間になったので窓を掛ける。
  //   宣伝は「基本は今週(先頭7日=今日から1週間)の出勤」。今週にこれ以降の出勤が無い子だけ来週(8〜14日目)を宣伝。両方あれば今週優先。
  //   ※本日満了(postManryo)もこの関数の中身を使う(次の出勤日・本文材料)。窓により本日満了は
  //     「今週の出勤を参照／今週無ければ来週」＝実質今まで通り(悪化ケースなし)。
  var _week1Set = {};
  var _distinct = [];
  var _seenWk = {};
  allDates.forEach(function (d) { if (!_seenWk[d]) { _seenWk[d] = 1; _distinct.push(d); } });
  _distinct.slice(0, 7).forEach(function (d) { _week1Set[d] = 1; });
  var _week1 = entries.filter(function (e) { return _week1Set[e.ymd]; });
  return _week1.length ? _week1 : entries;
}

/**
 * ★ 本日満了の投稿（手順8）。空き予告(postAvailability)の本日満了版。
 * @param {string} name - 源氏名（メイン）
 */
function postManryo(name, force) {
  name = String(name || '').trim();
  if (!name) return { success: false, message: '名前が指定されていません' };

  // 1. キャスト読み取り＋ON/OFF（空き予告列フラグを流用）
  const cast = getRealtimeCast_(name);
  if (!cast.found) return { success: false, message: 'キャストプロンプトに見つかりません: ' + name };
  if (!cast.enabled) return { success: false, message: 'この子はリアルタイムOFF（空き予告列が「なし」/空）です' };

  // 2. 同時タップの二重投稿を防ぐ
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (e) {
    return { success: false, message: '混み合っています。少し待って再度お試しください。' };
  }

  try {
    // 3. 1日1回ロック判定（S列）
    const lk = checkManryoLock(name);
    if (lk.locked) {
      return { success: false, locked: true, message: '本日満了は1日1回までです（本日はすでに投稿済み）' };
    }

    // 4. 今週の出勤（週間シフトから・複数日対応）。無い場合は force でなければ確認を促す（noNextShift）
    const weekEntries = getWeeklyShiftEntries_(name);
    if (weekEntries.length === 0 && !force) {
      return { success: false, noNextShift: true, message: '次の出勤予定が見つかりません（週間シフト未取込か、今週これ以降の出勤がありません）' };
    }

    // 5. 出勤行の確認（シフトデータ: 出勤時間B列のみ使用。名前・gidはURL管理から）
    const found = findShiftRowByName_(name);
    if (found.row < 0) return { success: false, message: 'シフトデータに出勤行が見つかりません: ' + name };
    const r = found.sheet.getRange(found.row, 1, 1, 19).getValues()[0];
    const shiftTimeStr = String(r[1] || '');
    // ★ v5.9: 名前もgidもURL管理の同じ行から取得（ログイン・投稿先・本文の身元が常に一致＝
    //   別人投稿と「正しいアカウントに別の子の名前」を構造的に防止。シフト取り込みズレの影響を受けない）
    const umUrls = getUrlManageStoreUrls_(name);
    const storeDefs = [
      { store: 'delidosu',    nm: umUrls.delidosuName,    url: umUrls.delidosu },     // URL管理 B/C
      { store: 'anecan',      nm: umUrls.anecanName,      url: umUrls.anecan },       // URL管理 D/E
      { store: 'ainoshizuku', nm: umUrls.ainoshizukuName, url: umUrls.ainoshizuku },  // URL管理 F/G
    ];
    const stores = [];
    // ★ v5.15: 店舗別ON/OFF（キャストプロンプトの「◯◯日記」列）。空欄＝ON
    const storeFlagsM = getCastStoreFlags_(name);  // diaryGenerator.gs
    const storeOffM = [];
    for (let i = 0; i < storeDefs.length; i++) {
      const nm = String(storeDefs[i].nm || '').trim();
      if (!nm) continue;
      if (storeFlagsM && storeFlagsM[storeDefs[i].store] === false) { storeOffM.push(storeDefs[i].store); continue; }
      const gid = extractGid_(storeDefs[i].url);
      if (!gid) continue;
      stores.push({ store: storeDefs[i].store, castName: nm, gid: gid });
    }
    if (stores.length === 0) {
      return { success: false, message: storeOffM.length
        ? 'この子は全店舗で日記OFFです（キャストプロンプトの店舗別ON/OFF列）'
        : '投稿先の店舗（名前＋有効なURL）が見つかりません' };
    }

    // 6. 生成（未来スカーシティ・diaryGenerator.gs）
    const parsed = generateManryoDiary_(cast, weekEntries);
    if (!parsed || !parsed.body) return { success: false, message: '生成に失敗しました' + ((typeof __rtFailReason !== 'undefined' && __rtFailReason) ? '：' + __rtFailReason : '（時間をおいて再度お試しください）') };

    // 7. 保存（即投稿=pending / 確認あり=draft）。リアルタイムなので深夜の翌日シフトはしない(=true)
    const mode = PropertiesService.getScriptProperties().getProperty('REALTIME_POST_MODE') || '確認あり';
    const status = (mode === '即投稿') ? 'pending' : 'draft';
    const baseNow = new Date();
    const GAP_MIN = 5;
    const ss = getSS_();
    for (let i = 0; i < stores.length; i++) {
      const slot = new Date(baseNow.getTime() + i * GAP_MIN * 60000);
      const slotStr = Utilities.formatDate(slot, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
      const row = {
        mainName: cast.mainName,
        store: stores[i].store,
        castName: stores[i].castName,
        gid: stores[i].gid,
        title: (cast.titleMode === '固定' && cast.fixedTitle) ? replaceNames_(getFixedTitleForStore_(cast.fixedTitle, stores[i].store), stores[i].castName) : replaceNames_(parsed.title, stores[i].castName),
        body: replaceNames_(parsed.body, stores[i].castName),
        postTime: slotStr,
        diaryType: '本日満了',
        shiftTime: shiftTimeStr,
        scope: cast.scope,
        textAlign: cast.textAlign,
        mediaType: '画像',
      };
      saveDiary_(ss, row, status, true);
    }

    // 8. ロックをかける（S列に当日日付）
    setManryoLock(name);

    const nextDisp = weekEntries.length ? ('今週の出勤 ' + weekEntries.length + '件') : '次の出勤日は未定';
    return {
      success: true,
      posted: stores.length,
      status: status,
      mode: mode,
      nextShift: weekEntries.length ? (weekEntries[0].mdj + '(' + weekEntries[0].weekday + ')') : '',
      message: (status === 'pending')
        ? stores.length + '店舗に投稿予約しました（即投稿モード／' + nextDisp + '）'
        : stores.length + '店舗ぶん下書きを作成しました（' + nextDisp + '／日記出力シートで確認→pendingで投稿）'
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * ★ 空き予告: 全キャストの「空き予告」列の値（公開範囲）を {源氏名: 値} で返す。
 *   ミテネ側が読み、「なし」/空 の子のボタンを無効化する（doGet 'getRealtimeFlags'）。
 * @return {{success:boolean, flags:Object}}
 */
function getRealtimeFlags() {
  try {
    const ss = getSS_();
    const sheet = ss.getSheetByName(DIARY_SHEET_PROMPT);
    if (!sheet) return { success: false, error: 'キャストプロンプトが見つかりません', flags: {} };
    const lastRow = sheet.getLastRow();
    const lastCol = sheet.getLastColumn();
    if (lastRow < 2) return { success: true, flags: {} };

    // 空き予告列を見出し（1行目）から探す
    const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    let akiCol = -1;
    for (let i = 0; i < headers.length; i++) {
      if (String(headers[i]).trim() === '空き予告') { akiCol = i + 1; break; }
    }
    const flags = {};
    if (akiCol < 0) return { success: true, flags: flags };  // 列が無ければ全員フラグなし扱い

    const data = sheet.getRange(2, 1, lastRow - 1, akiCol).getValues();
    for (let i = 0; i < data.length; i++) {
      const name = String(data[i][0] || '').trim();
      if (!name) continue;
      flags[name] = String(data[i][akiCol - 1] || '').trim();  // 全公開 / マイガール限定 / なし / 空
    }
    const locks = getAvailabilityLocks_();  // ★ 空き予告グレーアウト（方式B）: 60分ロック中の {源氏名:残り分}
    const manryoLocks = getManryoLocks_();  // ★ 本日満了グレーアウト: 本日投稿済みの {源氏名:true}
    return { success: true, flags: flags, locks: locks, manryoLocks: manryoLocks };
  } catch (e) {
    return { success: false, error: e.toString(), flags: {} };
  }
}

// ============================================================
// ★ 源氏名メーカー（2026-08-20）— AI候補の生成
// ============================================================
/**
 * Gemini に源氏名の候補を作らせ、URL管理と突き合わせて使えるものだけ返す。
 *
 * ★被りの考え方（フロントと同じ）
 *   ・店舗別源氏名（URL管理 B/D/F列）… 同じ店舗の中だけ一意。店が違えば被ってOK
 *   ・メイン名（URL管理 A列）      … 全店横断で一意。被ると名寄せが別人に流れる
 *   ここでは「指定店舗で使用中の名前」を除外して返し、メイン名の重複判定はフロントで印を付ける。
 *
 * @param {Object} p e.parameter … { store, len, row, tastes }
 * @return {Object} { success, names: [...], model }
 */
function generateStageNames(p) {
  try {
    p = p || {};
    var storeKey = String(p.store || 'delidosu');
    var storeLabel = { delidosu: 'でりどす', anecan: 'アネキャン', ainoshizuku: '愛のしずく' }[storeKey] || '';
    var len    = parseInt(p.len, 10) || 0;
    var row    = String(p.row || '').trim();
    var tastes = String(p.tastes || '').trim();

    // ---- 除外リスト（URL管理の全名前。メイン名＋3店舗の店舗別名）----
    var exclude = {};
    var sheet = getSS_().getSheetByName(SHEET_NAME_URL);
    if (sheet) {
      var last = sheet.getLastRow();
      if (last >= 2) {
        var vals = sheet.getRange(2, 1, last - 1, 7).getValues();  // A〜G
        for (var i = 0; i < vals.length; i++) {
          [0, 1, 3, 5].forEach(function (c) {   // A=メイン名 / B=でり / D=アネ / F=しずく
            var v = String(vals[i][c] || '').trim();
            if (v) exclude[v] = true;
          });
        }
      }
    }
    var excludeList = Object.keys(exclude);

    // ---- プロンプト ----
    var cond = [];
    if (len) cond.push('・文字数はちょうど ' + len + '文字（「しょうこ」のように拗音も1文字として数える）');
    if (row) cond.push('・最初の1文字は「' + row + '行」（濁音・半濁音も同じ行として扱う）');
    if (tastes) cond.push('・雰囲気は次のどれかに寄せる：' + tastes);
    if (!cond.length) cond.push('・雰囲気は自由。ただし読みやすく呼びやすいもの');

    var prompt =
      '日本の接客業のお店で女性スタッフが使う「源氏名（お店での呼び名）」の候補を考えてください。\n' +
      'お客様が呼びやすく、覚えやすい名前にしてください。\n\n' +
      '【条件】\n' + cond.join('\n') + '\n' +
      '・ひらがな または カタカナ で書くこと（漢字は使わない）\n' +
      '・苗字は付けず、下の名前だけ\n' +
      '・実在の芸能人やキャラクターの名前は避ける\n' +
      '・次の名前は既に使われているので絶対に使わない：\n' + excludeList.join('、') + '\n\n' +
      '【出力】\n' +
      'JSON配列だけを出力してください。説明・前置き・コードブロックの記号は一切書かないこと。\n' +
      '例: ["あいり","ゆめか","りのん"]\n' +
      '20個ちょうど出してください。';

    var raw = callGemini_(prompt, 1.0);   // diaryGenerator.gs
    if (!raw) return { success: false, error: 'AIから応答がありませんでした。もう一度お試しください' };

    // ---- JSONの取り出し（コードブロックや前置きが付いても拾う）----
    var text = String(raw).replace(/```json/gi, '').replace(/```/g, '').trim();
    var m = text.match(/\[[\s\S]*\]/);
    var names = [];
    if (m) {
      try { names = JSON.parse(m[0]); } catch (e2) { names = []; }
    }
    if (!names.length) {
      // JSONで返らなかった場合の保険（改行・読点区切りを拾う）
      names = text.split(/[\n、,]/).map(function (x) {
        return String(x).replace(/["'\[\]\s]/g, '').trim();
      });
    }

    // ---- 条件・被りでフィルタ ----
    var seen = {};
    var out = [];
    for (var k = 0; k < names.length; k++) {
      var n = String(names[k] || '').trim();
      if (!n) continue;
      if (n.length < 2 || n.length > 5) continue;         // 明らかな文章・ゴミを落とす
      if (/[^ぁ-んァ-ヶー]/.test(n)) continue;             // ひらがな・カタカナ以外は捨てる
      if (len && n.length !== len) continue;
      if (exclude[n] || seen[n]) continue;
      seen[n] = true;
      out.push(n);
    }

    if (!out.length) {
      return { success: false, error: '条件に合う候補が作れませんでした。条件をゆるめてもう一度お試しください' };
    }
    return { success: true, names: out, store: storeLabel };

  } catch (err) {
    return { success: false, error: '源氏名の生成に失敗しました: ' + err.message };
  }
}