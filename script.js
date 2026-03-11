/**
 * キテネマスター v5.0 - JavaScript
 */

// Google Apps Script API URL
const API_URL = 'https://script.google.com/macros/s/AKfycbzuZppKM-9ZQCm5YITAN0zmLNMEAmvj6FaRXy-45ygjuz2HqLHGiCOTF8lcFMOx6QnA/exec';

// 新着コメントの日数設定（今日含めてこの日数以内を新着とする）
const NEW_COMMENT_DAYS = 5;

// グローバル変数
let shiftData = [];
let urlData = [];
let currentEditName = null;
let currentDeleteName = null;
let currentShiftDate = '';
let currentStoreFilter = 'all'; // 現在の店舗フィルター
let currentOkiniFilter = 'all'; // ★v3.5 オキニフィルター（all/danger/warn/clear）
let autoRefreshInterval = null;  // 自動リロードのインターバルID
let autoRefreshSeconds = 300;     // 自動リロードの間隔(秒)
let cardIdCounter = 0;      // カードID用カウンター
let historyCache = {};      // 履歴キャッシュ
let openedCardNames = [];   // ★開いているアコーディオンの源氏名リスト
let commentCache = {};           // コメントキャッシュ { 源氏名: [コメント配列] }
let openAccordions = new Set();  // 開いているアコーディオンの源氏名
let expandedComments = new Set(); // 展開中のコメントを記録
let currentCommentName = null;   // コメント編集中の源氏名
let currentCommentRowIndex = null; // コメント編集中の行番号

// ★★★ v3.5追加: オキニトークデータ ★★★
let okiniData = [];

// ===============================
// 初期化
// ===============================

document.addEventListener('DOMContentLoaded', () => {
    console.log('=== キテネマスター 初期化開始 ===');
    console.log('API URL:', API_URL);
    console.log('XLSXライブラリ:', typeof XLSX !== 'undefined' ? '読み込み済み' : '未読み込み');
    
    // Excelアップロードイベント
    document.getElementById('excel-upload').addEventListener('change', (event) => {
        const file = event.target.files[0];
        if (file) {
            handleExcelUpload(file);
        }
        // ファイル入力をリセット
        event.target.value = '';
    });
    
    // ★★★ メイン店舗チェックボックスの排他制御を追加 ★★★
    document.querySelectorAll('.main-store-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                // 他のチェックボックスを外す
                document.querySelectorAll('.main-store-checkbox').forEach(cb => {
                    if (cb !== e.target) {
                        cb.checked = false;
                    }
                });
            }
        });
    });
    
    // データの読み込み
    console.log('初期データをロード中...');
    loadAllData();
    
    // ★★★ デフォルトで自動更新を開始 ★★★
    startAutoRefresh();
    document.querySelector('.auto-refresh').classList.add('active');
    
    // トップに戻るボタンのスクロール監視
    window.addEventListener('scroll', handleScroll);
});

// ===============================
// ビュー切り替え
// ===============================

function showView(viewName) {
    // 全てのビューを非表示
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    
    // 全てのナビボタンを非アクティブ
    document.querySelectorAll('.nav-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // 指定のビューを表示
    if (viewName === 'shift') {
        document.getElementById('shift-view').classList.add('active');
        document.querySelector('.nav-btn:nth-child(1)').classList.add('active');
        renderShiftList();
    } else if (viewName === 'all') {
        document.getElementById('all-view').classList.add('active');
        document.querySelector('.nav-btn:nth-child(2)').classList.add('active');
        renderAllCastList();
        updateJumpButtons('all');
    } else if (viewName === 'interview') {
        document.getElementById('interview-view').classList.add('active');
        document.querySelector('.nav-btn:nth-child(3)').classList.add('active');
        renderInterviewList();
        updateJumpButtons('interview');
        // 全カードの最新コメントを読み込む（アコーディオン状態も復元）
        setTimeout(() => loadAllLatestComments(), 100);
    } else if (viewName === 'url') {
        document.getElementById('url-view').classList.add('active');
        document.querySelector('.nav-btn:nth-child(4)').classList.add('active');
        renderUrlList();
        updateJumpButtons('url');
    }
}

// ===============================
// データ読み込み
// ===============================

async function loadAllData() {
    console.log('loadAllData: 全データロード開始');
    await loadShiftDate();
    await loadShiftData();
    await loadUrlData();
    await loadOkiniData();  // ★★★ v3.5追加 ★★★
    await loadAllLatestComments();
    console.log('loadAllData: 全データロード完了');
}

async function loadShiftData() {
    try {
        console.log('loadShiftData: シフトデータ取得中...');
        const response = await fetch(`${API_URL}?action=getShiftData`);
        console.log('loadShiftData: レスポンス受信', response.status);
        
        const result = await response.json();
        console.log('loadShiftData: レスポンス:', result);
        
        if (result.success) {
            // ★★★ 時刻データをformatTimeで変換 ★★★
            shiftData = result.data.map(shift => ({
                ...shift,
                time: formatTime(shift.time),
                originalTime: shift.originalTime ? formatTime(shift.originalTime) : ''
            }));
            console.log('loadShiftData: データ件数', shiftData.length);
            console.log('loadShiftData: 時刻変換後の最初のデータ:', shiftData[0]);
            
            // ★★★ v3.5改善: シフトデータからオキニデータを生成 ★★★
            okiniData = shiftData
                .filter(s => s.okiniDelidosu || s.okiniAnecan || s.okiniAinoshizuku ||
                             s.talkedDelidosu || s.talkedAnecan || s.talkedAinoshizuku)
                .map(s => ({
                    name: s.name,
                    delidosu: s.okiniDelidosu || '',
                    anecan: s.okiniAnecan || '',
                    ainoshizuku: s.okiniAinoshizuku || '',
                    delidosuTalked: s.talkedDelidosu || '',
                    anecanTalked: s.talkedAnecan || '',
                    ainoshizukuTalked: s.talkedAinoshizuku || ''
                }));
            console.log('loadShiftData: オキニデータ', okiniData.length, '件');
            
            renderShiftList();
        } else {
            console.error('loadShiftData: エラー:', result.error);
        }
    } catch (error) {
        console.error('loadShiftData: 例外:', error);
    }
}

async function loadUrlData() {
    try {
        console.log('loadUrlData: URL管理データ取得中...');
        const response = await fetch(`${API_URL}?action=getUrlData`);
        console.log('loadUrlData: レスポンス受信', response.status);
        
        const result = await response.json();
        console.log('loadUrlData: レスポンス:', result);
        
        if (result.success) {
            urlData = result.data;
            console.log('loadUrlData: データ件数', urlData.length);
            renderUrlList();
            return result.data; // 戻り値を追加
        } else {
            console.error('loadUrlData: エラー:', result.error);
            return []; // エラー時は空配列を返す
        }
    } catch (error) {
        console.error('loadUrlData: 例外:', error);
        return []; // 例外時も空配列を返す
    }
}

// ===============================
// Excelアップロード
// ===============================

async function handleExcelUpload(file) {
    try {
        console.log('=== デバッグ: Excelアップロード開始 ===');
        console.log('ファイル名:', file.name);
        console.log('ファイルサイズ:', file.size, 'bytes');
        
        showLoading();
        
        // ステップ1: Excelファイルを読み込み
        console.log('ステップ1: Excelファイルを読み込み中...');
        const shiftData = await readExcelFile(file);
        console.log('ステップ1完了: データ件数', shiftData.length);
        console.log('読み込んだデータ:', shiftData);
        
        if (!shiftData || shiftData.length === 0) {
            throw new Error('出勤予定のデータが見つかりませんでした');
        }
        
        // 日付を抽出
        const dateMatch = file.name.match(/(\d{4})(\d{2})(\d{2})/);
        if (dateMatch) {
            const [, year, month, day] = dateMatch;
            console.log('日付抽出:', year, month, day);
            currentShiftDate = `${year}年${month}月${day}日`;
            
            // ★★★ 日付表示を更新 ★★★
            const dateDisplay = document.getElementById('date-display');
            dateDisplay.textContent = `📅 ${currentShiftDate}のシフト`;
            dateDisplay.classList.add('has-date');
            
            // ★★★ 日付をスプレッドシートに保存 ★★★
            await saveShiftDate(currentShiftDate);
        }
        
        // ★★★ チェックを全リセット ★★★
        console.log('チェック状態をリセット中...');
        await resetAllChecks();
        console.log('チェック状態リセット完了');
        
        // ★★★ ステップ2: URL管理データを取得（追加） ★★★
        console.log('ステップ2: URL管理データを取得中...');
        const urlData = await loadUrlData();
        console.log('ステップ2完了: URL管理データ取得完了', urlData.length, '件');
        
        // ★★★ ステップ3: URL照合（追加） ★★★
        console.log('ステップ3: URL照合中...');
        const dataWithUrls = shiftData.map(employee => {
            // 源氏名で照合
            const urlInfo = urlData.find(u => u.name === employee.name);
            
            if (urlInfo) {
                console.log(`URL照合成功: ${employee.name} → でりどす: ${urlInfo.delidosuUrl ? 'あり' : 'なし'}, アネキャン: ${urlInfo.anecanUrl ? 'あり' : 'なし'}, 愛のしずく: ${urlInfo.ainoshizukuUrl ? 'あり' : 'なし'}`);
            } else {
                console.log(`URL照合失敗: ${employee.name} → URL管理に未登録`);
            }
            
            return {
                ...employee,
                delidosuUrl: urlInfo?.delidosuUrl || '',
                anecanUrl: urlInfo?.anecanUrl || '',
                ainoshizukuUrl: urlInfo?.ainoshizukuUrl || ''
            };
        });
        console.log('ステップ3完了: URL照合完了');
        console.log('URL付きデータ:', dataWithUrls);
        
        // ステップ4: Googleスプレッドシートにアップロード（URL情報も含む）
        console.log('ステップ4: Googleスプレッドシートにアップロード中...');
        console.log('API URL:', API_URL);
        await uploadShiftData(dataWithUrls);
        console.log('ステップ4完了: アップロード成功');
        
        // ★★★ ステップ4.5: 最終出勤日を自動更新 ★★★
        console.log('ステップ4.5: 最終出勤日を更新中...');
        const shiftNames = dataWithUrls.map(d => d.name);
        if (currentShiftDate && shiftNames.length > 0) {
            await updateLastWorkDate(shiftNames, currentShiftDate);
            console.log('ステップ4.5完了: 最終出勤日を更新しました');
        }
        
        // ステップ5: データをリロード
        await loadShiftData();
        
        hideLoading();
        console.log('=== デバッグ: アップロード完了 ===');
        
    } catch (error) {
        console.error('Excelアップロードエラー:', error);
        hideLoading();
        alert(`エラーが発生しました: ${error.message}`);
    }
}

function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        console.log('readExcelFile: ファイル読み込み開始');
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                console.log('readExcelFile: FileReader onload実行');
                const data = new Uint8Array(e.target.result);
                console.log('readExcelFile: データサイズ', data.length);
                
                const workbook = XLSX.read(data, { type: 'array', cellDates: false });
                console.log('readExcelFile: ワークブック読み込み完了（シリアル値モード）');
                console.log('シート名:', workbook.SheetNames);
                
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                console.log('readExcelFile: JSON変換完了、行数:', jsonData.length);
                console.log('最初の3行:', jsonData.slice(0, 3));
                
                // 「出勤予」と「出勤確」のデータを抽出
                const filteredData = jsonData
                    .filter(row => {
                        const status = row['シフト状態'];
                        const isMatch = status === '出勤予' || status === '出勤確';
                        if (!isMatch) {
                            console.log('❌ フィルタアウト:', {
                                name: row['源氏名'],
                                time: row['出勤時間'],
                                status: status,
                                statusType: typeof status
                            });
                        } else {
                            console.log('✅ OK:', {
                                name: row['源氏名'],
                                time: row['出勤時間'],
                                status: status
                            });
                        }
                        return isMatch;
                    })
                    .map(row => ({
                        name: row['源氏名'] || '',
                        time: formatTimeRange(row['出勤時間'], row['退勤時間']),
                        status: row['シフト状態'] || '',
                        delidosuName: row['でりどす'] || '',
                        anecanName: row['アネキャン'] || '',
                        ainoshizukuName: row['人妻本舗愛のしずく'] || ''
                    }))
                    .sort((a, b) => {
                        // 時間順にソート
                        const timeA = parseTime(a.time);
                        const timeB = parseTime(b.time);
                        return timeA - timeB;
                    });
                
                // ★★★ v3.5: 重複排除（同じ源氏名は最初の1件だけ） ★★★
                const seenNames = {};
                const uniqueData = filteredData.filter(item => {
                    if (seenNames[item.name]) {
                        console.log('⚠️ 重複排除:', item.name);
                        return false;
                    }
                    seenNames[item.name] = true;
                    return true;
                });
                if (filteredData.length !== uniqueData.length) {
                    console.log('★ 重複排除: ' + filteredData.length + '件 → ' + uniqueData.length + '件');
                }
                
                console.log('readExcelFile: フィルタ後の件数', uniqueData.length);
                console.log('フィルタ後のデータ:', uniqueData);
                resolve(uniqueData);
            } catch (error) {
                console.error('readExcelFile: エラー', error);
                reject(error);
            }
        };
        
        reader.onerror = () => {
            console.error('readExcelFile: FileReaderエラー');
            reject(new Error('ファイル読み込みエラー'));
        };
        
        reader.readAsArrayBuffer(file);
    });
}

function formatTime(timeValue) {
    if (!timeValue) return '';
    
    console.log('formatTime: 入力値 =', timeValue, '型 =', typeof timeValue);
    
    // 既に "HH:MM" 形式の場合はそのまま返す
    if (typeof timeValue === 'string' && /^\d{1,2}:\d{2}$/.test(timeValue)) {
        return timeValue;
    }
    
    // ★ "HH:MM〜HH:MM" range形式の場合もそのまま返す
    if (typeof timeValue === 'string' && /^\d{1,2}:\d{2}[〜～~\-]\d{1,2}:\d{2}$/.test(timeValue)) {
        return timeValue;
    }
    
    // ★★★ ISO 8601形式の場合 - JSTとして取得 ★★★
    if (typeof timeValue === 'string' && timeValue.includes('T')) {
        try {
            const date = new Date(timeValue);
            // getHours()でローカル時刻（JST）として取得
            const hours = date.getHours().toString().padStart(2, '0');
            const minutes = date.getMinutes().toString().padStart(2, '0');
            const result = `${hours}:${minutes}`;
            console.log('formatTime: ISO形式 → JST変換 =', result);
            return result;
        } catch (e) {
            console.error('formatTime: ISO形式の変換エラー', e);
        }
    }
    
    // Excelシリアルナンバーの場合（最も確実）
    if (typeof timeValue === 'number') {
        const totalMinutes = Math.round(timeValue * 24 * 60);
        const hours = Math.floor(totalMinutes / 60) % 24;
        const minutes = totalMinutes % 60;
        const result = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
        console.log('formatTime: シリアル値変換 =', result);
        return result;
    }
    
    // それ以外は文字列化
    console.log('formatTime: 文字列化 =', String(timeValue));
    return String(timeValue);
}

/**
 * ★ 出勤時間+退勤時間 → "HH:MM〜HH:MM" 形式に結合
 * 例: formatTimeRange("18:00", "03:00") → "18:00〜03:00"
 */
function formatTimeRange(startValue, endValue) {
    const start = formatTime(startValue);
    const end = formatTime(endValue);
    if (start && end) {
        return start + '〜' + end;
    }
    return start || '';
}

function parseTime(timeStr) {
    if (!timeStr) return 0;
    if (timeStr === '当欠') return 99999;  // ★★★ v3.5: 当欠は最後尾 ★★★
    
    // ★ "HH:MM〜HH:MM" range形式 → 開始時間だけ取り出してソート
    if (typeof timeStr === 'string' && /\d{1,2}:\d{2}[〜～~\-]/.test(timeStr)) {
        timeStr = timeStr.split(/[〜～~\-]/)[0].trim();
    }
    
    const [hours, minutes] = timeStr.split(':').map(Number);
    
    // ★★★ 深夜営業ルール: 0:00～9:59は翌日深夜として扱う ★★★
    // 10:00～23:59 → そのまま
    // 0:00～9:59 → +24時間（翌日深夜）
    let adjustedHours = hours;
    if (hours >= 0 && hours < 10) {
        adjustedHours = hours + 24;  // 翌日深夜として扱う
    }
    
    const totalMinutes = adjustedHours * 60 + minutes;
    console.log(`parseTime: ${timeStr} → ${adjustedHours}:${minutes} (${totalMinutes}分)`);
    return totalMinutes;
}

/**
 * メイン店舗バッジのHTMLを取得
 */
function getMainStoreBadge(name) {
    const person = urlData.find(u => u.name === name);
    if (!person || !person.mainStore) return '';
    
    const storeNames = {
        'delidosu': 'でりどす',
        'anecan': 'アネキャン',
        'ainoshizuku': 'しずく'
    };
    
    const storeName = storeNames[person.mainStore] || '';
    if (!storeName) return '';
    
    return `<span class="main-store-badge ${person.mainStore}">${storeName}</span>`;
}

/**
 * URL管理用のメイン店舗バッジを取得
 */
function getMainStoreBadgeForUrl(url) {
    if (!url.mainStore) return '';
    
    const storeNames = {
        'delidosu': 'でりどす',
        'anecan': 'アネキャン',
        'ainoshizuku': 'しずく'
    };
    
    const storeName = storeNames[url.mainStore] || '';
    if (!storeName) return '';
    
    return `<span class="main-store-badge ${url.mainStore}">${storeName}</span>`;
}

// ===============================
// 店舗フィルター機能
// ===============================

/**
 * 店舗フィルターを切り替え
 */
function filterByStore(store) {
    console.log('filterByStore:', store);
    currentStoreFilter = store;
    
    // フィルターボタンのアクティブ状態を更新
    document.querySelectorAll('.filter-btn').forEach(btn => {
        if (btn.dataset.store === store) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // 現在表示中のタブに応じて再描画
    if (document.getElementById('shift-view').classList.contains('active')) {
        renderShiftList();
    } else if (document.getElementById('all-view').classList.contains('active')) {
        renderAllCastList();
        updateJumpButtons('all');
    } else if (document.getElementById('interview-view').classList.contains('active')) {
        renderInterviewList();
        updateJumpButtons('interview');
    } else if (document.getElementById('url-view').classList.contains('active')) {
        renderUrlList();
        updateJumpButtons('url');
    }
}

/**
 * 店舗フィルターでデータを絞り込み
 */
function filterDataByStore(data, store) {
    if (store === 'all') {
        return data;
    }
    
    return data.filter(item => {
        // urlDataからメイン店舗を取得
        const person = urlData.find(u => u.name === item.name);
        return person && person.mainStore === store;
    });
}

/**
 * 店舗フィルターでurlDataを絞り込み（在籍・管理タブ用）
 */
function filterUrlDataByStore(data, store) {
    if (store === 'all') {
        return data;
    }
    
    return data.filter(item => item.mainStore === store);
}

/**
 * ★v3.5 オキニフィルター切り替え
 */
function filterByOkini(level) {
    console.log('filterByOkini:', level);
    currentOkiniFilter = level;
    
    // ボタンのアクティブ状態を更新
    document.querySelectorAll('.okini-filter-btn').forEach(btn => {
        if (btn.dataset.okini === level) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    // 出勤タブを再描画
    renderShiftList();
}

/**
 * ★v3.5 オキニレベルでフィルター
 * 全店舗のオキニ数を見て、該当するキャストだけ返す
 */
function filterDataByOkini(data, level) {
    if (level === 'all') return data;
    
    return data.filter(item => {
        const okini = okiniData.find(o => o.name === item.name);
        if (!okini) {
            // オキニデータなし → "clear"フィルターでは表示しない
            return false;
        }
        
        // 全店舗のオキニ数を集める
        const counts = [okini.delidosu, okini.anecan, okini.ainoshizuku]
            .filter(c => c !== '' && c !== undefined && c !== null);
        
        if (counts.length === 0) return false;
        
        // 各レベルの判定
        switch(level) {
            case 'danger':
                // 9+または10以上がある
                return counts.some(c => c === '9+' || (parseInt(c) || 0) >= 10);
            case 'warn':
                // 1〜9がある（9+は含まない）
                return counts.some(c => {
                    if (c === '9+') return false;
                    const n = parseInt(c) || 0;
                    return n >= 1 && n <= 9;
                });
            case 'clear':
                // 全て0
                return counts.every(c => c === '0' || c === 0);
            default:
                return true;
        }
    });
}

// ===============================
// あいうえお順グループ化
// ===============================

const KANA_GROUPS = {
    'あ': ['あ', 'い', 'う', 'え', 'お'],
    'か': ['か', 'き', 'く', 'け', 'こ', 'が', 'ぎ', 'ぐ', 'げ', 'ご'],
    'さ': ['さ', 'し', 'す', 'せ', 'そ', 'ざ', 'じ', 'ず', 'ぜ', 'ぞ'],
    'た': ['た', 'ち', 'つ', 'て', 'と', 'だ', 'ぢ', 'づ', 'で', 'ど'],
    'な': ['な', 'に', 'ぬ', 'ね', 'の'],
    'は': ['は', 'ひ', 'ふ', 'へ', 'ほ', 'ば', 'び', 'ぶ', 'べ', 'ぼ', 'ぱ', 'ぴ', 'ぷ', 'ぺ', 'ぽ'],
    'ま': ['ま', 'み', 'む', 'め', 'も'],
    'や': ['や', 'ゆ', 'よ'],
    'ら': ['ら', 'り', 'る', 'れ', 'ろ'],
    'わ': ['わ', 'を', 'ん']
};

function getKanaGroup(name) {
    if (!name) return 'その他';
    const firstChar = name.charAt(0);
    
    for (const [group, chars] of Object.entries(KANA_GROUPS)) {
        if (chars.includes(firstChar)) {
            return group;
        }
    }
    
    return 'その他';
}


async function uploadShiftData(data) {
    try {
        console.log('uploadShiftData: リクエスト送信中...');
        console.log('送信データ件数:', data.length);
        
        // シンプルリクエストにするため、Content-Type: text/plain を使用
        const response = await fetch(`${API_URL}?action=updateShiftData`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
            },
            body: JSON.stringify({ data: data })
        });
        
        console.log('uploadShiftData: レスポンス受信');
        console.log('ステータスコード:', response.status);
        
        const resultText = await response.text();
        console.log('レスポンステキスト:', resultText);
        
        const result = JSON.parse(resultText);
        console.log('パース済みレスポンス:', result);
        
        if (result.success) {
            console.log('uploadShiftData: 成功');
            await loadShiftData();
        } else {
            console.error('uploadShiftData: APIエラー', result.error);
            throw new Error(result.error);
        }
    } catch (error) {
        console.error('uploadShiftData: 例外発生', error);
        throw error;
    }
}

// ===============================
// シフトリスト表示
// ===============================

function renderShiftList() {
    console.log('renderShiftList: シフトリスト描画開始');
    console.log('シフトデータ件数:', shiftData.length);
    
    const listElement = document.getElementById('shift-list');
    const emptyElement = document.getElementById('empty-state');
    
    if (!listElement) {
        console.error('shift-list要素が見つかりません');
        return;
    }
    
    // ★★★ 店舗フィルターを適用 ★★★
    const storeFiltered = filterDataByStore(shiftData, currentStoreFilter);
    
    // ★★★ v3.5: オキニフィルターを適用 ★★★
    const filteredData = filterDataByOkini(storeFiltered, currentOkiniFilter);
    console.log('フィルター後のデータ件数:', filteredData.length, '(店舗:', currentStoreFilter, ', オキニ:', currentOkiniFilter, ')');
    
    // ★★★ v3.5: 出勤人数カウンターを更新 ★★★
    updateShiftCounter(storeFiltered);
    
    if (filteredData.length === 0) {
        listElement.style.display = 'none';
        emptyElement.style.display = 'block';
        return;
    }
    
    listElement.style.display = 'flex';
    emptyElement.style.display = 'none';
    
    // ★★★ URL管理データを取得してチェック状態を反映 ★★★
    const mergedData = filteredData.map(shift => {
        const urlInfo = urlData.find(u => u.name === shift.name);
        return {
            ...shift,
            checked: urlInfo?.checked || '',
            mainStore: urlInfo?.mainStore || ''
        };
    });
    
    // ★★★ 出勤時間順にソート ★★★
    mergedData.sort((a, b) => {
        // 当欠の子は元の時間(originalTime)で並べる
        const timeA = parseTime(a.time === '当欠' ? (a.originalTime || '00:00') : a.time);
        const timeB = parseTime(b.time === '当欠' ? (b.originalTime || '00:00') : b.time);
        if (timeA !== timeB) return timeA - timeB;
        return a.name.localeCompare(b.name, 'ja');
    });
    
    listElement.innerHTML = mergedData.map(shift => {
        // ★★★ 時刻フォーマット ★★★
        const isTouketu = shift.time === '当欠';
        const formattedTime = isTouketu ? '当欠(' + formatTime(shift.originalTime || '') + ')' : formatTime(shift.time);
        const timeClass = isTouketu ? 'shift-time touketu' : 'shift-time';
        const cardClass = isTouketu ? 'shift-item touketu-card' : 'shift-item';
        
        return `
            <div class="${cardClass}" data-name="${shift.name}">
                <div class="shift-header">
                    <div class="shift-info">
                        <span class="shift-name">${shift.name}</span>
                        <span class="${timeClass}" 
                              onclick="toggleTouketu('${shift.name}')"
                              title="クリックで当欠切り替え"
                        >${formattedTime}</span>
                        ${getMainStoreBadge(shift.name)}
                    </div>
                </div>
                <div class="check-buttons">
                    <div class="check-btn-wrapper ${getCheckStatus(shift.name, 'delidosu') ? 'checked' : ''}">
                        <div style="display:flex; align-items:center; gap:4px; width:100%;">
                            <input type="checkbox" 
                                   class="store-checkbox" 
                                   data-name="${shift.name}" 
                                   data-store="delidosu"
                                   ${getCheckStatus(shift.name, 'delidosu') ? 'checked' : ''}
                                   onchange="toggleStoreCheck('${shift.name}', 'delidosu', this.checked)"
                                   ${!shift.delidosuUrl ? 'disabled' : ''}>
                            <button class="btn-link btn-delidosu" 
                                    onclick="window.open('${shift.delidosuUrl}', '_blank')"
                                    ${!shift.delidosuUrl ? 'disabled' : ''}>
                                ${shift.delidosuUrl ? 'でりどす' : '未登録'}
                            </button>
                        </div>
                        ${getOkiniBadge(shift.name, 'delidosu')}
                    </div>
                    <div class="check-btn-wrapper ${getCheckStatus(shift.name, 'anecan') ? 'checked' : ''}">
                        <div style="display:flex; align-items:center; gap:4px; width:100%;">
                            <input type="checkbox" 
                                   class="store-checkbox" 
                                   data-name="${shift.name}" 
                                   data-store="anecan"
                                   ${getCheckStatus(shift.name, 'anecan') ? 'checked' : ''}
                                   onchange="toggleStoreCheck('${shift.name}', 'anecan', this.checked)"
                                   ${!shift.anecanUrl ? 'disabled' : ''}>
                            <button class="btn-link btn-anecan" 
                                    onclick="window.open('${shift.anecanUrl}', '_blank')"
                                    ${!shift.anecanUrl ? 'disabled' : ''}>
                                ${shift.anecanUrl ? 'アネキャン' : '未登録'}
                            </button>
                        </div>
                        ${getOkiniBadge(shift.name, 'anecan')}
                    </div>
                    <div class="check-btn-wrapper ${getCheckStatus(shift.name, 'ainoshizuku') ? 'checked' : ''}">
                        <div style="display:flex; align-items:center; gap:4px; width:100%;">
                            <input type="checkbox" 
                                   class="store-checkbox" 
                                   data-name="${shift.name}" 
                                   data-store="ainoshizuku"
                                   ${getCheckStatus(shift.name, 'ainoshizuku') ? 'checked' : ''}
                                   onchange="toggleStoreCheck('${shift.name}', 'ainoshizuku', this.checked)"
                                   ${!shift.ainoshizukuUrl ? 'disabled' : ''}>
                            <button class="btn-link btn-ainoshizuku" 
                                    onclick="window.open('${shift.ainoshizukuUrl}', '_blank')"
                                    ${!shift.ainoshizukuUrl ? 'disabled' : ''}>
                                ${shift.ainoshizukuUrl ? '愛のしずく' : '未登録'}
                            </button>
                        </div>
                        ${getOkiniBadge(shift.name, 'ainoshizuku')}
                    </div>
                </div>
            </div>
        `;
    }).join('');
    
    // 日付表示（handleExcelUpload関数で設定済みなので、ここでは何もしない）
    
    console.log('renderShiftList: 描画完了');
}

/**
 * ★v3.5 出勤人数カウンターを更新
 * 店舗フィルター後のデータを受け取り、出勤/当欠の人数を表示
 */
function updateShiftCounter(storeFilteredData) {
    const counter = document.getElementById('shift-counter');
    if (!counter) return;
    
    if (storeFilteredData.length === 0) {
        counter.style.display = 'none';
        return;
    }
    
    const total = storeFilteredData.length;
    const touketuCount = storeFilteredData.filter(s => s.time === '当欠').length;
    const activeCount = total - touketuCount;
    
    counter.style.display = 'block';
    
    if (touketuCount > 0) {
        counter.innerHTML = 
            '<span class="count-main">出勤 ' + activeCount + '人</span>' +
            '<span class="count-detail">/ 元' + total + '人' +
            '（<span class="count-touketu">当欠' + touketuCount + '人</span>）</span>';
    } else {
        counter.innerHTML = 
            '<span class="count-main">出勤 ' + activeCount + '人</span>';
    }
}

// ===============================
// 全キャストリスト表示
// ===============================

function renderAllCastList() {
    console.log('renderAllCastList: 全キャストリスト描画開始');
    console.log('URLデータ件数:', urlData.length);
    
    const listElement = document.getElementById('all-cast-list');
    const emptyElement = document.getElementById('all-empty-state');
    
    if (!listElement) {
        console.error('all-cast-list要素が見つかりません');
        return;
    }
    
    // ★★★ 店舗フィルターを適用 ★★★
    const filteredUrlData = filterUrlDataByStore(urlData, currentStoreFilter);
    console.log('フィルター後のデータ件数:', filteredUrlData.length, '(フィルター:', currentStoreFilter, ')');
    
    if (filteredUrlData.length === 0) {
        listElement.style.display = 'none';
        if (emptyElement) emptyElement.style.display = 'block';
        return;
    }
    
    listElement.style.display = 'flex';
    if (emptyElement) emptyElement.style.display = 'none';
    
    // ★★★ クラス別にグループ化（姫デコ → 新人 → 通常）※スタッフは非表示 ★★★
    const classGroups = {
        '姫デコ': [],
        '新人': [],
        '通常': []
    };
    
    filteredUrlData.forEach(cast => {
        const castClass = cast.class || '通常';
        // スタッフは在籍タブに表示しない
        if (castClass === 'スタッフ') return;
        
        if (classGroups[castClass]) {
            classGroups[castClass].push(cast);
        } else {
            classGroups['通常'].push(cast);
        }
    });
    
    // 各クラス内で名前順にソート
    Object.values(classGroups).forEach(group => {
        group.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    });
    
    let html = '';
    
    // ★★★ 姫デコ ★★★
    if (classGroups['姫デコ'].length > 0) {
        html += '<div class="class-header himede" id="all-group-himede"><h3>👑 姫デコ</h3></div>';
        classGroups['姫デコ'].forEach(cast => {
            html += renderCastCard(cast);
        });
    }
    
    // ★★★ 新人 ★★★
    if (classGroups['新人'].length > 0) {
        html += '<div class="class-header newbie" id="all-group-newbie"><h3>🆕 新人</h3></div>';
        classGroups['新人'].forEach(cast => {
            html += renderCastCard(cast);
        });
    }
    
    // ★★★ 通常（あいうえお順でグループ化） ★★★
    if (classGroups['通常'].length > 0) {
        const kanaGroups = {};
        classGroups['通常'].forEach(cast => {
            const group = getKanaGroup(cast.name);
            if (!kanaGroups[group]) {
                kanaGroups[group] = [];
            }
            kanaGroups[group].push(cast);
        });
        
        const groupOrder = ['あ', 'か', 'さ', 'た', 'な', 'は', 'ま', 'や', 'ら', 'わ', 'その他'];
        groupOrder.forEach(group => {
            if (kanaGroups[group] && kanaGroups[group].length > 0) {
                html += `<div class="class-header kana" id="all-group-${group}"><h3>📋 ${group}行</h3></div>`;
                kanaGroups[group].forEach(cast => {
                    html += renderCastCard(cast);
                });
            }
        });
    }
    
    listElement.innerHTML = html;
    console.log('renderAllCastList: 描画完了');
}

/**
 * キャストカードを生成（シフト一覧と同じレイアウト）
 */
function renderCastCard(cast) {
    // メイン店舗バッジ
    let mainBadge = '';
    if (cast.mainStore) {
        const storeNames = {
            'delidosu': 'でりどす',
            'anecan': 'アネキャン',
            'ainoshizuku': 'しずく'
        };
        const storeName = storeNames[cast.mainStore] || '';
        if (storeName) {
            mainBadge = `<span class="main-store-badge ${cast.mainStore}">${storeName}</span>`;
        }
    }
    
    return `
        <div class="shift-item" data-name="${cast.name}">
            <div class="shift-header">
                <div class="shift-info">
                    <span class="shift-name">${cast.name}</span>
                    ${mainBadge}
                </div>
            </div>
            <div class="check-buttons">
                <div class="check-btn-wrapper ${getCheckStatus(cast.name, 'delidosu') ? 'checked' : ''}">
                    <div style="display:flex; align-items:center; gap:4px; width:100%;">
                        <input type="checkbox" 
                               class="store-checkbox" 
                               data-name="${cast.name}" 
                               data-store="delidosu"
                               ${getCheckStatus(cast.name, 'delidosu') ? 'checked' : ''}
                               onchange="toggleStoreCheck('${cast.name}', 'delidosu', this.checked)"
                               ${!cast.delidosuUrl ? 'disabled' : ''}>
                        <button class="btn-link btn-delidosu" 
                                onclick="window.open('${cast.delidosuUrl}', '_blank')"
                                ${!cast.delidosuUrl ? 'disabled' : ''}>
                            ${cast.delidosuUrl ? 'でりどす' : '未登録'}
                        </button>
                    </div>
                </div>
                <div class="check-btn-wrapper ${getCheckStatus(cast.name, 'anecan') ? 'checked' : ''}">
                    <div style="display:flex; align-items:center; gap:4px; width:100%;">
                        <input type="checkbox" 
                               class="store-checkbox" 
                               data-name="${cast.name}" 
                               data-store="anecan"
                               ${getCheckStatus(cast.name, 'anecan') ? 'checked' : ''}
                               onchange="toggleStoreCheck('${cast.name}', 'anecan', this.checked)"
                               ${!cast.anecanUrl ? 'disabled' : ''}>
                        <button class="btn-link btn-anecan" 
                                onclick="window.open('${cast.anecanUrl}', '_blank')"
                                ${!cast.anecanUrl ? 'disabled' : ''}>
                            ${cast.anecanUrl ? 'アネキャン' : '未登録'}
                        </button>
                    </div>
                </div>
                <div class="check-btn-wrapper ${getCheckStatus(cast.name, 'ainoshizuku') ? 'checked' : ''}">
                    <div style="display:flex; align-items:center; gap:4px; width:100%;">
                        <input type="checkbox" 
                               class="store-checkbox" 
                               data-name="${cast.name}" 
                               data-store="ainoshizuku"
                               ${getCheckStatus(cast.name, 'ainoshizuku') ? 'checked' : ''}
                               onchange="toggleStoreCheck('${cast.name}', 'ainoshizuku', this.checked)"
                               ${!cast.ainoshizukuUrl ? 'disabled' : ''}>
                        <button class="btn-link btn-ainoshizuku" 
                                onclick="window.open('${cast.ainoshizukuUrl}', '_blank')"
                                ${!cast.ainoshizukuUrl ? 'disabled' : ''}>
                            ${cast.ainoshizukuUrl ? '愛のしずく' : '未登録'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
}


function filterAllCastList() {
    const searchText = document.getElementById('all-search-input').value.toLowerCase();
    const items = document.querySelectorAll('#all-cast-list .shift-item');
    
    items.forEach(item => {
        const name = item.dataset.name.toLowerCase();
        if (name.includes(searchText)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

// ===============================
// 3チェック機能
// ===============================

/**
 * チェック状態を取得
 */
function getCheckStatus(name, store) {
    const person = urlData.find(u => u.name === name);
    if (!person) return false;
    
    switch(store) {
        case 'delidosu':
            return person.checkedDelidosu === '済';
        case 'anecan':
            return person.checkedAnecan === '済';
        case 'ainoshizuku':
            return person.checkedAinoshizuku === '済';
        default:
            return false;
    }
}

/**
 * シフト日付を保存（API呼び出し）
 */
async function saveShiftDate(date) {
    try {
        const response = await fetch(`${API_URL}?action=saveShiftDate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
            },
            body: JSON.stringify({ date: date })
        });
        
        const result = await response.json();
        console.log('saveShiftDate: 結果', result);
        return result;
    } catch (error) {
        console.error('saveShiftDate: 例外', error);
        return { success: false, error: error.message };
    }
}

/**
 * シフト日付を取得（API呼び出し）
 */
async function loadShiftDate() {
    try {
        const response = await fetch(`${API_URL}?action=getShiftDate`);
        const result = await response.json();
        console.log('loadShiftDate: 結果', result);
        
        if (result.success && result.date) {
            // ★★★ 日付をフォーマット ★★★
            currentShiftDate = formatShiftDate(result.date);
            const dateDisplay = document.getElementById('date-display');
            dateDisplay.textContent = `📅 ${currentShiftDate}のシフト`;
            dateDisplay.classList.add('has-date');
        }
        
        return result;
    } catch (error) {
        console.error('loadShiftDate: 例外', error);
        return { success: false, error: error.message };
    }
}

/**
 * シフト日付をフォーマット
 * ISO形式やDate型を「YYYY年MM月DD日」形式に変換
 */
function formatShiftDate(dateValue) {
    // 既に「YYYY年MM月DD日」形式ならそのまま返す
    if (typeof dateValue === 'string' && dateValue.includes('年')) {
        return dateValue;
    }
    
    // ISO形式やDate型の場合は変換
    try {
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}年${month}月${day}日`;
        }
    } catch (e) {
        console.error('formatShiftDate: 変換エラー', e);
    }
    
    // 変換できない場合はそのまま返す
    return dateValue;
}

/**
 * 全チェック状態をリセット（API呼び出し）
 */
async function resetAllChecks() {
    try {
        const response = await fetch(`${API_URL}?action=resetAllChecks`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
            },
            body: JSON.stringify({})
        });
        
        const result = await response.json();
        console.log('resetAllChecks: 結果', result);
        
        if (result.success) {
            // メモリ上のurlDataもリセット
            urlData.forEach(person => {
                person.checkedDelidosu = '';
                person.checkedAnecan = '';
                person.checkedAinoshizuku = '';
            });
            showToast('チェックをリセットしました', 'success');
        } else {
            console.error('resetAllChecks: エラー', result.error);
        }
        
        return result;
    } catch (error) {
        console.error('resetAllChecks: 例外', error);
        return { success: false, error: error.message };
    }
}

/**
 * 店舗別チェック状態を切り替え
 */
async function toggleStoreCheck(name, store, isChecked) {
    console.log('toggleStoreCheck:', name, store, isChecked);
    
    // メモリ上のurlDataを更新
    const person = urlData.find(p => p.name === name);
    if (person) {
        switch(store) {
            case 'delidosu':
                person.checkedDelidosu = isChecked ? '済' : '';
                break;
            case 'anecan':
                person.checkedAnecan = isChecked ? '済' : '';
                break;
            case 'ainoshizuku':
                person.checkedAinoshizuku = isChecked ? '済' : '';
                break;
        }
    }
    
    // DOM上のすべての該当チェックボックスとラッパーを更新（タブ間連動）
    document.querySelectorAll(`.store-checkbox[data-name="${name}"][data-store="${store}"]`).forEach(checkbox => {
        checkbox.checked = isChecked;
        const wrapper = checkbox.closest('.check-btn-wrapper');
        if (wrapper) {
            if (isChecked) {
                wrapper.classList.add('checked');
            } else {
                wrapper.classList.remove('checked');
            }
        }
    });
    
    // スプレッドシートに保存
    try {
        const response = await fetch(`${API_URL}?action=updateCheckStatus`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
            },
            body: JSON.stringify({ 
                name: name, 
                store: store,
                checked: isChecked 
            })
        });
        
        const result = await response.json();
        console.log('toggleStoreCheck: 保存結果', result);
        
        if (!result.success) {
            console.error('toggleStoreCheck: 保存失敗', result.error);
        }
    } catch (error) {
        console.error('toggleStoreCheck: 例外', error);
    }
}


// ===============================
// URLリスト表示
// ===============================

function renderUrlList() {
    const listElement = document.getElementById('url-list');
    const emptyElement = document.getElementById('url-empty-state');
    
    // ★★★ 店舗フィルターを適用 ★★★
    const filteredUrlData = filterUrlDataByStore(urlData, currentStoreFilter);
    console.log('renderUrlList: フィルター後のデータ件数:', filteredUrlData.length, '(フィルター:', currentStoreFilter, ')');
    
    if (filteredUrlData.length === 0) {
        listElement.style.display = 'none';
        emptyElement.style.display = 'block';
        return;
    }
    
    listElement.style.display = 'flex';
    emptyElement.style.display = 'none';
    
    // ★★★ スタッフと通常キャストを分離 ★★★
    const normalCasts = filteredUrlData.filter(cast => cast.class !== 'スタッフ');
    const staffCasts = filteredUrlData.filter(cast => cast.class === 'スタッフ');
    
    // ★★★ クラス別にグループ化（姫デコ → 新人 → 通常）★★★
    const classGroups = {
        '姫デコ': [],
        '新人': [],
        '通常': []
    };
    
    normalCasts.forEach(cast => {
        const castClass = cast.class || '通常';
        if (classGroups[castClass]) {
            classGroups[castClass].push(cast);
        } else {
            classGroups['通常'].push(cast);
        }
    });
    
    // 各クラス内で名前順にソート
    Object.values(classGroups).forEach(group => {
        group.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    });
    
    // スタッフを名前順にソート
    staffCasts.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    
    let html = '';
    
    // ★★★ 姫デコ ★★★
    if (classGroups['姫デコ'].length > 0) {
        html += '<div class="class-header himede" id="url-group-himede"><h3>👑 姫デコ</h3></div>';
        classGroups['姫デコ'].forEach(cast => {
            html += renderUrlCard(cast);
        });
    }
    
    // ★★★ 新人 ★★★
    if (classGroups['新人'].length > 0) {
        html += '<div class="class-header newbie" id="url-group-newbie"><h3>🆕 新人</h3></div>';
        classGroups['新人'].forEach(cast => {
            html += renderUrlCard(cast);
        });
    }
    
    // ★★★ 通常（あいうえお順でグループ化）★★★
    if (classGroups['通常'].length > 0) {
        const kanaGroups = {};
        classGroups['通常'].forEach(cast => {
            const group = getKanaGroup(cast.name);
            if (!kanaGroups[group]) {
                kanaGroups[group] = [];
            }
            kanaGroups[group].push(cast);
        });
        
        const groupOrder = ['あ', 'か', 'さ', 'た', 'な', 'は', 'ま', 'や', 'ら', 'わ', 'その他'];
        groupOrder.forEach(group => {
            if (kanaGroups[group] && kanaGroups[group].length > 0) {
                html += `<div class="class-header kana" id="url-group-${group}"><h3>📋 ${group}行</h3></div>`;
                kanaGroups[group].forEach(cast => {
                    html += renderUrlCard(cast);
                });
            }
        });
    }
    
    // ★★★ スタッフを一番下に表示 ★★★
    if (staffCasts.length > 0) {
        html += '<div class="class-header staff" id="url-group-staff"><h3>👥 スタッフ</h3></div>';
        staffCasts.forEach(cast => {
            html += renderUrlCard(cast);
        });
    }
    
    listElement.innerHTML = html;
}

/**
 * URL管理カード1件を生成
 */
function renderUrlCard(url) {
    return `
        <div class="url-item url-item-compact" data-name="${url.name}">
            <div class="url-item-header">
                <div class="url-item-info">
                    <h3 class="url-item-name">${url.name}</h3>
                    ${getMainStoreBadgeForUrl(url)}
                </div>
                <div class="url-item-actions">
                    <button class="btn-edit" onclick="showEditModal('${url.name}')">編集</button>
                    <button class="btn-delete" onclick="showDeleteModal('${url.name}')">削除</button>
                </div>
            </div>
        </div>
    `;
}

// ===============================
// URL検索
// ===============================

function filterUrlList() {
    const searchText = document.getElementById('search-input').value.toLowerCase();
    const items = document.querySelectorAll('.url-item');
    
    items.forEach(item => {
        const name = item.dataset.name.toLowerCase();
        if (name.includes(searchText)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

// ===============================
// モーダル管理
// ===============================

function showAddModal() {
    currentEditName = null;
    document.getElementById('modal-title').textContent = 'URL情報を追加';
    document.getElementById('modal-name').value = '';
    document.getElementById('modal-name').disabled = false;
    
    // ★★★ クラスを初期値に設定 ★★★
    document.getElementById('modal-class').value = '通常';
    
    // ★★★ 各店舗の情報をクリア ★★★
    document.getElementById('modal-deli-name').value = '';
    document.getElementById('modal-deli-url').value = '';
    document.getElementById('modal-ane-name').value = '';
    document.getElementById('modal-ane-url').value = '';
    document.getElementById('modal-aino-name').value = '';
    document.getElementById('modal-aino-url').value = '';
    
    // ★★★ メイン店舗チェックボックスをクリア ★★★
    document.getElementById('modal-deli-main').checked = false;
    document.getElementById('modal-ane-main').checked = false;
    document.getElementById('modal-aino-main').checked = false;
    
    // ★★★ 面談情報をクリア ★★★
    document.getElementById('modal-last-work-date').value = '';
    document.getElementById('modal-last-interview-date').value = '';
    document.getElementById('modal-interview-staff').value = '';
    document.getElementById('modal-last-photo-date').value = '';
    document.getElementById('modal-last-video-date').value = '';
    
    // 面談スタッフのドロップダウンを更新
    updateStaffDropdown('');
    
    document.getElementById('url-modal').classList.add('active');
}

function showEditModal(name) {
    currentEditName = name;
    const urlInfo = urlData.find(u => u.name === name);
    
    if (!urlInfo) return;
    
    document.getElementById('modal-title').textContent = 'URL情報を編集';
    document.getElementById('modal-name').value = urlInfo.name;
    document.getElementById('modal-name').disabled = true;
    
    // ★★★ クラスを設定 ★★★
    document.getElementById('modal-class').value = urlInfo.class || '通常';
    
    // ★★★ 各店舗の情報を設定 ★★★
    document.getElementById('modal-deli-name').value = urlInfo.delidosuName || '';
    document.getElementById('modal-deli-url').value = urlInfo.delidosuUrl || '';
    document.getElementById('modal-ane-name').value = urlInfo.anecanName || '';
    document.getElementById('modal-ane-url').value = urlInfo.anecanUrl || '';
    document.getElementById('modal-aino-name').value = urlInfo.ainoshizukuName || '';
    document.getElementById('modal-aino-url').value = urlInfo.ainoshizukuUrl || '';
    
    // ★★★ メイン店舗チェックボックスを設定 ★★★
    document.getElementById('modal-deli-main').checked = (urlInfo.mainStore === 'delidosu');
    document.getElementById('modal-ane-main').checked = (urlInfo.mainStore === 'anecan');
    document.getElementById('modal-aino-main').checked = (urlInfo.mainStore === 'ainoshizuku');
    
    // ★★★ 面談情報を設定 ★★★
    document.getElementById('modal-last-work-date').value = urlInfo.lastWorkDate || '';
    document.getElementById('modal-last-interview-date').value = formatDateForInput(urlInfo.lastInterviewDate);
    // 面談スタッフのドロップダウンを更新
    updateStaffDropdown(urlInfo.interviewStaff || '');
    document.getElementById('modal-last-photo-date').value = formatDateForInput(urlInfo.lastPhotoDate);
    document.getElementById('modal-last-video-date').value = formatDateForInput(urlInfo.lastVideoDate);
    
    document.getElementById('url-modal').classList.add('active');
}

function closeModal() {
    document.getElementById('url-modal').classList.remove('active');
}

function showDeleteModal(name) {
    currentDeleteName = name;
    document.getElementById('delete-name').textContent = name;
    document.getElementById('delete-modal').classList.add('active');
}

function closeDeleteModal() {
    document.getElementById('delete-modal').classList.remove('active');
}

// ===============================
// URL保存
// ===============================

async function saveUrlData() {
    const name = document.getElementById('modal-name').value.trim();
    
    if (!name) {
        showToast('源氏名を入力してください', 'error');
        return;
    }
    
    // ★★★ メイン店舗の判定 ★★★
    let mainStore = '';
    const deliChecked = document.getElementById('modal-deli-main').checked;
    const aneChecked = document.getElementById('modal-ane-main').checked;
    const ainoChecked = document.getElementById('modal-aino-main').checked;
    
    if (deliChecked) {
        mainStore = 'delidosu';
    } else if (aneChecked) {
        mainStore = 'anecan';
    } else if (ainoChecked) {
        mainStore = 'ainoshizuku';
    }
    
    // ★★★ バリデーション: メイン店舗が選択されている場合、該当店舗のURLが必須 ★★★
    if (mainStore) {
        const deliUrl = document.getElementById('modal-deli-url').value.trim();
        const aneUrl = document.getElementById('modal-ane-url').value.trim();
        const ainoUrl = document.getElementById('modal-aino-url').value.trim();
        
        if (mainStore === 'delidosu' && !deliUrl) {
            showToast('メイン店舗に設定する場合、でりどすのURLを入力してください', 'error');
            return;
        }
        if (mainStore === 'anecan' && !aneUrl) {
            showToast('メイン店舗に設定する場合、アネキャンのURLを入力してください', 'error');
            return;
        }
        if (mainStore === 'ainoshizuku' && !ainoUrl) {
            showToast('メイン店舗に設定する場合、愛のしずくのURLを入力してください', 'error');
            return;
        }
    }
    
    // スタッフクラス以外はメイン店舗必須
    const selectedClass = document.getElementById('modal-class').value;
    if (selectedClass !== 'スタッフ' && !mainStore) {
        showToast('メイン店舗を選択してください', 'error');
        return;
    }
    
    const data = {
        name: name,
        class: document.getElementById('modal-class').value,
        delidosuName: document.getElementById('modal-deli-name').value.trim(),
        delidosuUrl: document.getElementById('modal-deli-url').value.trim(),
        anecanName: document.getElementById('modal-ane-name').value.trim(),
        anecanUrl: document.getElementById('modal-ane-url').value.trim(),
        ainoshizukuName: document.getElementById('modal-aino-name').value.trim(),
        ainoshizukuUrl: document.getElementById('modal-aino-url').value.trim(),
        mainStore: mainStore,
        // ★★★ 面談情報を追加 ★★★
        lastWorkDate: document.getElementById('modal-last-work-date').value.trim(),
        lastInterviewDate: document.getElementById('modal-last-interview-date').value.trim(),
        interviewStaff: document.getElementById('modal-interview-staff').value.trim(),
        lastPhotoDate: document.getElementById('modal-last-photo-date').value.trim(),
        lastVideoDate: document.getElementById('modal-last-video-date').value.trim()
    };
    
    try {
        const action = currentEditName ? 'updateUrlData' : 'addUrlData';
        
        const response = await fetch(`${API_URL}?action=${action}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
            },
            body: JSON.stringify(data)
        });
        
        const result = await response.json();
        
        if (result.success) {
            closeModal();
            await loadUrlData();
            await loadShiftData();
            showToast(result.message, 'success');
        } else {
            showToast(result.error, 'error');
        }
    } catch (error) {
        console.error('URL保存エラー:', error);
        showToast('URL情報の保存に失敗しました', 'error');
    }
}

// ===============================
// URL削除
// ===============================

async function confirmDelete() {
    if (!currentDeleteName) return;
    
    try {
        const response = await fetch(`${API_URL}?action=deleteUrlData`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
            },
            body: JSON.stringify({ name: currentDeleteName })
        });
        
        const result = await response.json();
        
        if (result.success) {
            closeDeleteModal();
            await loadUrlData();
            await loadShiftData();
            showToast(result.message, 'success');
        } else {
            showToast(result.error, 'error');
        }
    } catch (error) {
        console.error('URL削除エラー:', error);
        showToast('URL情報の削除に失敗しました', 'error');
    }
}

// ===============================
// UI制御
// ===============================

function showLoading(show) {
    const loading = document.getElementById('loading');
    const shiftList = document.getElementById('shift-list');
    const emptyState = document.getElementById('empty-state');
    
    if (show === undefined || show === true) {
        loading.style.display = 'block';
        shiftList.style.display = 'none';
        emptyState.style.display = 'none';
    } else {
        loading.style.display = 'none';
    }
}

function hideLoading() {
    showLoading(false);
}

// ===============================
// 更新・自動リロード
// ===============================

/**
 * データを手動更新
 */
async function refreshData() {
    const refreshBtn = document.querySelector('.refresh-btn');
    
    // ボタンを無効化
    refreshBtn.classList.add('loading');
    refreshBtn.textContent = '🔄 更新中...';
    
    try {
        // データを再読み込み
        await loadUrlData();
        await loadShiftData();
        await loadOkiniData();  // ★★★ v3.5追加 ★★★
        
        // 現在のタブに応じて再描画
        if (document.getElementById('shift-view').classList.contains('active')) {
            renderShiftList();
        } else if (document.getElementById('all-view').classList.contains('active')) {
            renderAllCastList();
        } else if (document.getElementById('interview-view').classList.contains('active')) {
            renderInterviewList();
        } else if (document.getElementById('url-view').classList.contains('active')) {
            renderUrlList();
        }
        
        // 最終更新時刻を表示
        updateLastRefreshTime();
        
        showToast('データを更新しました', 'success');
    } catch (error) {
        console.error('refreshData: エラー', error);
        showToast('更新に失敗しました', 'error');
    } finally {
        // ボタンを有効化
        refreshBtn.classList.remove('loading');
        refreshBtn.textContent = '🔄 更新';
    }
}

/**
 * 自動リロードのON/OFF切り替え
 */
function toggleAutoRefresh() {
    const checkbox = document.getElementById('auto-refresh-toggle');
    const autoRefreshDiv = document.querySelector('.auto-refresh');
    
    if (checkbox.checked) {
        // 自動リロードを開始
        startAutoRefresh();
        autoRefreshDiv.classList.add('active');
        showToast(`自動更新を開始しました（${autoRefreshSeconds}秒間隔）`, 'success');
    } else {
        // 自動リロードを停止
        stopAutoRefresh();
        autoRefreshDiv.classList.remove('active');
        showToast('自動更新を停止しました', 'success');
    }
}

/**
 * 自動リロード間隔を変更
 */
function updateAutoRefreshInterval() {
    const select = document.getElementById('auto-refresh-interval');
    autoRefreshSeconds = parseInt(select.value);
    
    // 自動リロードが有効なら再起動
    if (document.getElementById('auto-refresh-toggle').checked) {
        stopAutoRefresh();
        startAutoRefresh();
        showToast(`自動更新間隔を${autoRefreshSeconds}秒に変更しました`, 'success');
    }
}

/**
 * 自動リロードを開始
 */
function startAutoRefresh() {
    // 既存のインターバルをクリア
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    
    // 新しいインターバルを設定
    autoRefreshInterval = setInterval(async () => {
        console.log('自動リロード実行:', new Date().toLocaleTimeString());
        
        try {
            await loadUrlData();
            await loadShiftData();
            await loadOkiniData();  // ★★★ v3.5追加 ★★★
            
            // 現在のタブに応じて再描画
            if (document.getElementById('shift-view').classList.contains('active')) {
                renderShiftList();
            } else if (document.getElementById('all-view').classList.contains('active')) {
                renderAllCastList();
            } else if (document.getElementById('interview-view').classList.contains('active')) {
                renderInterviewList();
            } else if (document.getElementById('url-view').classList.contains('active')) {
                renderUrlList();
            }
            
            updateLastRefreshTime();
            
            // ★★★ 自動更新時もトースト通知を表示 ★★★
            showToast('データを更新しました', 'success');
        } catch (error) {
            console.error('自動リロードエラー:', error);
            showToast('自動更新に失敗しました', 'error');
        }
    }, autoRefreshSeconds * 1000);
    
    console.log(`自動リロード開始: ${autoRefreshSeconds}秒間隔`);
}

/**
 * 自動リロードを停止
 */
function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
        console.log('自動リロード停止');
    }
}

/**
 * 最終更新時刻を表示
 */
function updateLastRefreshTime() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    
    // 既存の最終更新表示を削除
    const existing = document.querySelector('.last-updated');
    if (existing) {
        existing.remove();
    }
    
    // 新しい最終更新表示を追加
    const refreshBtn = document.querySelector('.refresh-btn');
    const lastUpdated = document.createElement('span');
    lastUpdated.className = 'last-updated';
    lastUpdated.textContent = `最終更新: ${timeStr}`;
    refreshBtn.parentNode.insertBefore(lastUpdated, refreshBtn.nextSibling);
}

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ===============================
// 面談タブ
// ===============================

/**
 * 面談リストを描画
 */
function renderInterviewList() {
    console.log('renderInterviewList: 面談リスト描画開始');
    cardIdCounter = 0;  // カウンターリセット
    // ★注意: historyCacheとopenedCardNamesはクリアしない（自動更新で状態保持）
    console.log('URLデータ件数:', urlData.length);
    
    const listElement = document.getElementById('interview-list');
    const emptyElement = document.getElementById('interview-empty-state');
    
    if (!listElement) {
        console.error('interview-list要素が見つかりません');
        return;
    }
    
    // ★★★ 店舗フィルターを適用 ★★★
    let filteredUrlData = filterUrlDataByStore(urlData, currentStoreFilter);
    
    // ★★★ スタッフを除外 ★★★
    filteredUrlData = filteredUrlData.filter(cast => cast.class !== 'スタッフ');
    
    console.log('フィルター後のデータ件数:', filteredUrlData.length, '(フィルター:', currentStoreFilter, ')');
    
    if (filteredUrlData.length === 0) {
        listElement.style.display = 'none';
        if (emptyElement) emptyElement.style.display = 'block';
        return;
    }
    
    listElement.style.display = 'flex';
    if (emptyElement) emptyElement.style.display = 'none';
    
    // ★★★ クラス別にグループ化（姫デコ → 新人 → 通常） ★★★
    const classGroups = {
        '姫デコ': [],
        '新人': [],
        '通常': []
    };
    
    filteredUrlData.forEach(cast => {
        const castClass = cast.class || '通常';
        if (classGroups[castClass]) {
            classGroups[castClass].push(cast);
        } else {
            classGroups['通常'].push(cast);
        }
    });
    
    // 各クラス内で名前順にソート
    Object.values(classGroups).forEach(group => {
        group.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    });
    
    let html = '';
    
    // ★★★ 姫デコ ★★★
    if (classGroups['姫デコ'].length > 0) {
        html += '<div class="class-header himede" id="interview-group-himede"><h3>👑 姫デコ</h3></div>';
        classGroups['姫デコ'].forEach(cast => {
            html += renderInterviewCard(cast);
        });
    }
    
    // ★★★ 新人 ★★★
    if (classGroups['新人'].length > 0) {
        html += '<div class="class-header newbie" id="interview-group-newbie"><h3>🆕 新人</h3></div>';
        classGroups['新人'].forEach(cast => {
            html += renderInterviewCard(cast);
        });
    }
    
    // ★★★ 通常（あいうえお順でグループ化）★★★
    if (classGroups['通常'].length > 0) {
        const kanaGroups = {};
        classGroups['通常'].forEach(cast => {
            const group = getKanaGroup(cast.name);
            if (!kanaGroups[group]) {
                kanaGroups[group] = [];
            }
            kanaGroups[group].push(cast);
        });
        
        const groupOrder = ['あ', 'か', 'さ', 'た', 'な', 'は', 'ま', 'や', 'ら', 'わ', 'その他'];
        groupOrder.forEach(group => {
            if (kanaGroups[group] && kanaGroups[group].length > 0) {
                html += `<div class="class-header kana" id="interview-group-${group}"><h3>📋 ${group}行</h3></div>`;
                kanaGroups[group].forEach(cast => {
                    html += renderInterviewCard(cast);
                });
            }
        });
    }
    
    listElement.innerHTML = html;
    
    // コメントを非同期で読み込み
    loadAllLatestComments().then(() => {
        // コメント部分を更新
        const cards = listElement.querySelectorAll('.interview-card');
        cards.forEach(card => {
            const name = card.dataset.name;
            const section = card.querySelector('.comment-section');
            if (section && commentCache[name]) {
                section.outerHTML = renderCommentSection(name);
            }
        });
        // 省略判定を実行
        setTimeout(checkCommentOverflow, 500);
        
        // 新着コメントバーを更新
        setTimeout(renderNewCommentBar, 600);
    });
    
    console.log('renderInterviewList: 描画完了');
}

/**
 * 面談カード1件を生成
 */
/**
 * 面談カード1件を生成
 */
/**
 * 面談カード1件を生成
 */
function renderInterviewCard(cast) {
    // メイン店舗バッジ
    let mainBadge = '';
    if (cast.mainStore) {
        const storeNames = {
            'delidosu': 'でりどす',
            'anecan': 'アネキャン',
            'ainoshizuku': 'しずく'
        };
        const storeName = storeNames[cast.mainStore] || '';
        if (storeName) {
            mainBadge = `<span class="main-store-badge ${cast.mainStore}">${storeName}</span>`;
        }
    }
    
    // アラート状態
    const alertStatus = calculateAlertStatus(cast);
    let alertBadge = '';
    
    // 出勤アラート（3段階）
    if (alertStatus.work === 'red') {
        alertBadge += '<span class="alert-badge alert-red">🔴 30日以上</span>';
    } else if (alertStatus.work === 'orange') {
        alertBadge += '<span class="alert-badge alert-orange">🟠 20日以上</span>';
    } else if (alertStatus.work === 'blue') {
        alertBadge += '<span class="alert-badge alert-blue">🔵 10日以上</span>';
    }
    
    // 面談アラート
    if (alertStatus.interview === 'yellow') {
        alertBadge += '<span class="alert-badge alert-yellow">🟡 面談60日↑</span>';
    }
    
    // 日付表示
    const lastWorkDisplay = cast.lastWorkDate ? formatDisplayDate(cast.lastWorkDate) : '未登録';
    const lastInterviewDisplay = cast.lastInterviewDate ? formatDisplayDate(cast.lastInterviewDate) : '未登録';
    const lastPhotoDisplay = cast.lastPhotoDate ? formatDisplayDate(cast.lastPhotoDate) : '未登録';
    const lastVideoDisplay = cast.lastVideoDate ? formatDisplayDate(cast.lastVideoDate) : '未登録';
    
    // スタッフ表示
    const staffDisplay = cast.interviewStaff ? ` (担当: ${escapeHtml(cast.interviewStaff)})` : '';
    
    // コメントセクションHTML
    const commentSectionHtml = renderCommentSection(cast.name);
    
    return `
        <div class="interview-card" data-name="${cast.name}">
            <div class="interview-card-header">
                <div class="interview-card-title">
                    <span class="interview-card-name">${cast.name}</span>
                    ${mainBadge}
                    ${alertBadge}
                </div>
                <div class="interview-card-actions">
                    <button class="btn-edit" onclick="showEditModal('${cast.name}')">編集</button>
                </div>
            </div>
            <div class="interview-card-body">
                <div class="interview-info-item">
                    <span class="interview-info-label">📅 最終出勤</span>
                    <span class="interview-info-value ${!cast.lastWorkDate ? 'empty' : ''}">${lastWorkDisplay}</span>
                </div>
                <div class="interview-info-item">
                    <span class="interview-info-label">💬 最終面談</span>
                    <span class="interview-info-value ${!cast.lastInterviewDate ? 'empty' : ''}">${lastInterviewDisplay}${staffDisplay}</span>
                </div>
                <div class="interview-info-item">
                    <span class="interview-info-label">📷 最終撮影</span>
                    <span class="interview-info-value ${!cast.lastPhotoDate ? 'empty' : ''}">${lastPhotoDisplay}</span>
                </div>
                <div class="interview-info-item">
                    <span class="interview-info-label">🎬 動画更新</span>
                    <span class="interview-info-value ${!cast.lastVideoDate ? 'empty' : ''}">${lastVideoDisplay}</span>
                </div>
            </div>
            ${commentSectionHtml}
        </div>
    `;
}

/**
 * アラート状態を計算（複数アラート対応）
 * @returns { work: 'red'|'orange'|'blue'|null, interview: 'yellow'|null }
 */
function calculateAlertStatus(cast) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const result = {
        work: null,
        interview: null
    };
    
    // 出勤アラート（3段階）
    if (cast.lastWorkDate) {
        const lastWork = new Date(cast.lastWorkDate);
        lastWork.setHours(0, 0, 0, 0);
        const diffDays = Math.floor((today - lastWork) / (1000 * 60 * 60 * 24));
        
        if (diffDays >= 30) {
            result.work = 'red';       // 🔴 30日以上
        } else if (diffDays >= 20) {
            result.work = 'orange';    // 🟠 20日以上
        } else if (diffDays >= 10) {
            result.work = 'blue';      // 🔵 10日以上
        }
    }
    
    // 面談アラート
    if (cast.lastInterviewDate) {
        const lastInterview = new Date(cast.lastInterviewDate);
        lastInterview.setHours(0, 0, 0, 0);
        const diffDays = Math.floor((today - lastInterview) / (1000 * 60 * 60 * 24));
        
        if (diffDays >= 60) {
            result.interview = 'yellow';  // 🟡 60日以上
        }
    }
    
    return result;
}

/**
 * 日付を表示用にフォーマット（YYYY/MM/DD）
 */
function formatDisplayDate(dateValue) {
    if (!dateValue) return '';
    
    try {
        const date = new Date(dateValue);
        if (!isNaN(date.getTime())) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}/${month}/${day}`;
        }
    } catch (e) {
        console.error('formatDisplayDate: エラー', e);
    }
    
    return dateValue;
}

/**
 * 日付をinput type="date"用にフォーマット（YYYY-MM-DD形式）
 */
function formatDateForInput(dateValue) {
    if (!dateValue) return '';
    try {
        const date = new Date(dateValue);
        if (isNaN(date.getTime())) return '';
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    } catch (e) {
        return '';
    }
}

/**
 * 面談スタッフのドロップダウンを更新
 */
function updateStaffDropdown(selectedValue = '') {
    const select = document.getElementById('modal-interview-staff');
    if (!select) return;
    
    // スタッフクラスの人を取得
    const staffList = urlData.filter(u => u.class === 'スタッフ');
    
    // 選択肢を生成
    let options = '<option value="">選択してください</option>';
    staffList.forEach(staff => {
        const selected = staff.name === selectedValue ? 'selected' : '';
        options += `<option value="${staff.name}" ${selected}>${staff.name}</option>`;
    });
    
    select.innerHTML = options;
}

/**
 * HTMLエスケープ
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * 面談タブの検索
 */
function filterInterviewList() {
    const searchText = document.getElementById('interview-search-input').value.toLowerCase();
    const items = document.querySelectorAll('#interview-list .interview-card');
    
    items.forEach(item => {
        const name = item.dataset.name.toLowerCase();
        if (name.includes(searchText)) {
            item.style.display = 'block';
        } else {
            item.style.display = 'none';
        }
    });
}

// ===============================
// ジャンプ機能
// ===============================

/**
 * ジャンプボタンの状態を更新
 */
function updateJumpButtons(tabName) {
    const jumpContainer = document.getElementById(`${tabName}-jump-buttons`);
    if (!jumpContainer) return;
    
    // 店舗フィルターを適用したデータを取得
    let filteredData = filterUrlDataByStore(urlData, currentStoreFilter);
    
    // 面談・在籍タブではスタッフを除外
    if (tabName === 'interview' || tabName === 'all') {
        filteredData = filteredData.filter(cast => cast.class !== 'スタッフ');
    }
    
    // 通常クラスのみを対象にかな行を集計
    const normalCasts = filteredData.filter(cast => {
        const castClass = cast.class || '通常';
        return castClass === '通常';
    });
    
    const existingGroups = new Set();
    normalCasts.forEach(cast => {
        const group = getKanaGroup(cast.name);
        existingGroups.add(group);
    });
    
    // 管理タブではスタッフも確認
    if (tabName === 'url') {
        const hasStaff = filteredData.some(cast => cast.class === 'スタッフ');
        if (hasStaff) {
            existingGroups.add('スタッフ');
        }
    }
    
    // 姫デコ・新人の存在確認
    const hasHimede = filteredData.some(cast => cast.class === '姫デコ');
    const hasNewbie = filteredData.some(cast => cast.class === '新人');
    
    // ボタンの有効/無効を更新
    const buttons = jumpContainer.querySelectorAll('.jump-btn');
    buttons.forEach(btn => {
        const group = btn.dataset.group;
        let isEnabled = false;
        
        if (group === 'himede') {
            isEnabled = hasHimede;
        } else if (group === 'newbie') {
            isEnabled = hasNewbie;
        } else if (group === 'staff') {
            isEnabled = existingGroups.has('スタッフ');
        } else if (group === 'その他') {
            isEnabled = existingGroups.has('その他') || existingGroups.has('スタッフ');
        } else {
            isEnabled = existingGroups.has(group);
        }
        
        if (isEnabled) {
            btn.classList.remove('disabled');
        } else {
            btn.classList.add('disabled');
        }
    });
}

/**
 * 指定のグループにジャンプ
 */
function jumpToGroup(tabName, group) {
    let targetId = '';
    
    if (group === 'himede') {
        targetId = `${tabName}-group-himede`;
    } else if (group === 'newbie') {
        targetId = `${tabName}-group-newbie`;
    } else if (group === 'staff') {
        targetId = `${tabName}-group-staff`;
    } else {
        targetId = `${tabName}-group-${group}`;
    }
    
    const target = document.getElementById(targetId);
    if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
}

// ===============================
// 最終出勤日更新API
// ===============================

/**
 * 最終出勤日を更新（API呼び出し）
 */
async function updateLastWorkDate(names, date) {
    try {
        const response = await fetch(`${API_URL}?action=updateLastWorkDate`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
            },
            body: JSON.stringify({ 
                names: names, 
                date: date 
            })
        });
        
        const result = await response.json();
        console.log('updateLastWorkDate: 結果', result);
        return result;
    } catch (error) {
        console.error('updateLastWorkDate: 例外', error);
        return { success: false, error: error.message };
    }
}

// ===============================
// トップに戻るボタン
// ===============================

/**
 * スクロール時の処理
 */
function handleScroll() {
    const backToTopBtn = document.getElementById('back-to-top');
    if (!backToTopBtn) return;
    
    // 200px以上スクロールしたら表示
    if (window.scrollY > 200) {
        backToTopBtn.classList.add('show');
    } else {
        backToTopBtn.classList.remove('show');
    }
}

/**
 * トップにスクロール
 */
function scrollToTop() {
    window.scrollTo({
        top: 0,
        behavior: 'smooth'
    });
}


// ===============================
// 面談履歴機能 v5.1完全版
// ===============================

/**
 * 全カードの最新コメントを読み込み
 */
async function loadAllLatestComments() {
    const cards = document.querySelectorAll('.interview-card');
    
    for (const card of cards) {
        const cardId = card.dataset.cardId;
        const name = card.dataset.name;
        
        if (cardId && name) {
            await loadLatestComment(cardId, name);
        }
    }
    
    // アコーディオン状態を復元
    restoreOpenedAccordions();
}

/**
 * 自動更新後にアコーディオンの開閉状態を復元
 */
function restoreOpenedAccordions() {
    if (openedCardNames.length === 0) return;
    
    openedCardNames.forEach(name => {
        // 該当する名前のカードを探す
        const cards = document.querySelectorAll('.interview-card');
        for (const card of cards) {
            if (card.dataset.name === name) {
                const cardId = card.dataset.cardId;
                const historyList = document.getElementById(`${cardId}-history-list`);
                const toggleText = document.getElementById(`${cardId}-toggle-text`);
                
                if (historyList && !historyList.classList.contains('expanded')) {
                    // アコーディオンを開く
                    historyList.classList.remove('collapsed');
                    historyList.classList.add('expanded');
                    
                    if (toggleText) {
                        const cache = historyCache[cardId];
                        const count = cache ? cache.data.length - 1 : 0;
                        toggleText.textContent = `▲ 過去の履歴を閉じる (${count}件)`;
                    }
                }
                break;
            }
        }
    });
}

/**
 * カードの最新コメントを読み込み
 */
async function loadLatestComment(cardId, name) {
    const latestDiv = document.getElementById(`${cardId}-latest`);
    const historyBtn = document.getElementById(`${cardId}-history-btn`);
    const historyList = document.getElementById(`${cardId}-history-list`);
    
    if (!latestDiv) return;
    
    try {
        const response = await fetch(`${API_URL}?action=getInterviewHistory&name=${encodeURIComponent(name)}`);
        const result = await response.json();
        
        if (result.success && result.data && result.data.length > 0) {
            // キャッシュに保存
            historyCache[cardId] = {
                name: name,
                data: result.data
            };
            
            const latest = result.data[0];
            
            // 最新コメントを表示
            latestDiv.innerHTML = renderCommentItem(latest, cardId);
            
            // 履歴が2件以上ある場合のみトグルボタンを表示
            if (result.data.length > 1) {
                historyBtn.style.display = 'block';
                
                const toggleText = document.getElementById(`${cardId}-toggle-text`);
                if (toggleText) {
                    const isExpanded = historyList && historyList.classList.contains('expanded');
                    const count = result.data.length - 1;
                    toggleText.textContent = isExpanded 
                        ? `▲ 過去の履歴を閉じる (${count}件)` 
                        : `▼ 過去の履歴を見る (${count}件)`;
                }
                
                // 過去履歴をレンダリング（アコーディオンが開いている場合）
                if (historyList && historyList.classList.contains('expanded')) {
                    const pastHistory = result.data.slice(1);
                    historyList.innerHTML = pastHistory.map(item => renderCommentItem(item, cardId)).join('');
                }
            } else {
                historyBtn.style.display = 'none';
                if (historyList) {
                    historyList.innerHTML = '';
                    historyList.classList.remove('expanded');
                    historyList.classList.add('collapsed');
                }
            }
        } else {
            // コメントなし
            latestDiv.innerHTML = '<div class="comment-none">コメントなし</div>';
            if (historyBtn) historyBtn.style.display = 'none';
            if (historyList) {
                historyList.innerHTML = '';
                historyList.classList.remove('expanded');
                historyList.classList.add('collapsed');
            }
        }
    } catch (error) {
        console.error('最新コメント取得エラー:', error);
        latestDiv.innerHTML = '<div class="comment-none">エラー</div>';
    }
}

/**
 * コメントアイテムのHTMLを生成
 */
function renderCommentItem(item, cardId) {
    const dateDisplay = formatDisplayDate(item.interviewDate);
    const staffDisplay = item.staff ? escapeHtml(item.staff) : '不明';
    const commentText = escapeHtml(item.comment || '').replace(/\n/g, '<br>');
    
    return `
        <div class="comment-item">
            <div class="comment-item-header">
                <span class="comment-date">${dateDisplay}</span>
                <span class="comment-staff">${staffDisplay}</span>
                <div class="comment-item-actions">
                    <button class="btn-history-edit" onclick="editHistory(${item.rowIndex}, '${cardId}')">編集</button>
                    <button class="btn-history-delete" onclick="showHistoryDeleteModal(${item.rowIndex}, '${cardId}')">削除</button>
                </div>
            </div>
            <div class="comment-text">${commentText}</div>
        </div>
    `;
}

/**
 * 履歴アコーディオンの開閉
 */
function toggleHistory(cardId, name) {
    const historyList = document.getElementById(`${cardId}-history-list`);
    const toggleText = document.getElementById(`${cardId}-toggle-text`);
    
    if (!historyList) return;
    
    if (historyList.classList.contains('collapsed')) {
        // 開く
        historyList.classList.remove('collapsed');
        historyList.classList.add('expanded');
        
        // ★ 開いた状態を記録
        if (!openedCardNames.includes(name)) {
            openedCardNames.push(name);
        }
        
        // キャッシュから過去履歴を表示
        const cache = historyCache[cardId];
        if (cache && cache.data.length > 1) {
            const pastHistory = cache.data.slice(1);
            historyList.innerHTML = pastHistory.map(item => renderCommentItem(item, cardId)).join('');
        }
        
        if (toggleText) {
            const count = cache ? cache.data.length - 1 : 0;
            toggleText.textContent = `▲ 過去の履歴を閉じる (${count}件)`;
        }
    } else {
        // 閉じる
        historyList.classList.remove('expanded');
        historyList.classList.add('collapsed');
        
        // ★ 閉じた状態を記録
        openedCardNames = openedCardNames.filter(n => n !== name);
        
        if (toggleText) {
            const cache = historyCache[cardId];
            const count = cache ? cache.data.length - 1 : 0;
            toggleText.textContent = `▼ 過去の履歴を見る (${count}件)`;
        }
    }
}

/**
 * 履歴追加モーダルを表示
 */
function showHistoryModal(name, cardId) {
    document.getElementById('history-modal-title').textContent = '面談履歴を追加';
    document.getElementById('history-modal-name').value = name;
    document.getElementById('history-modal-row-index').value = '';  // 新規追加
    document.getElementById('history-modal-date').value = new Date().toISOString().split('T')[0];
    document.getElementById('history-modal-comment').value = '';
    
    // 現在のカードIDを保存
    document.getElementById('history-modal').dataset.cardId = cardId;
    
    updateHistoryStaffDropdown('');
    document.getElementById('history-modal').classList.add('active');
}

/**
 * 履歴編集モーダルを表示
 */
function editHistory(rowIndex, cardId) {
    const cache = historyCache[cardId];
    if (!cache) return;
    
    const item = cache.data.find(h => h.rowIndex === rowIndex);
    if (!item) return;
    
    document.getElementById('history-modal-title').textContent = '面談履歴を編集';
    document.getElementById('history-modal-name').value = item.name;
    document.getElementById('history-modal-row-index').value = rowIndex;
    document.getElementById('history-modal-date').value = formatDateForInput(item.interviewDate);
    document.getElementById('history-modal-comment').value = item.comment || '';
    
    document.getElementById('history-modal').dataset.cardId = cardId;
    
    updateHistoryStaffDropdown(item.staff || '');
    document.getElementById('history-modal').classList.add('active');
}

/**
 * 履歴モーダルを閉じる
 */
function closeHistoryModal() {
    document.getElementById('history-modal').classList.remove('active');
}

/**
 * 履歴削除確認モーダルを表示
 */
function showHistoryDeleteModal(rowIndex, cardId) {
    document.getElementById('history-delete-row-index').value = rowIndex;
    document.getElementById('history-delete-card-id').value = cardId;
    document.getElementById('history-delete-modal').classList.add('active');
}

/**
 * 履歴削除モーダルを閉じる
 */
function closeHistoryDeleteModal() {
    document.getElementById('history-delete-modal').classList.remove('active');
}

/**
 * 履歴スタッフドロップダウンを更新
 */
function updateHistoryStaffDropdown(selectedValue) {
    const select = document.getElementById('history-modal-staff');
    if (!select) return;
    
    const staffList = urlData.filter(u => u.class === 'スタッフ');
    
    let options = '<option value="">選択してください</option>';
    staffList.forEach(staff => {
        const selected = staff.name === selectedValue ? 'selected' : '';
        options += `<option value="${staff.name}" ${selected}>${staff.name}</option>`;
    });
    
    select.innerHTML = options;
}

/**
 * 面談履歴を保存
 */
async function saveInterviewHistory() {
    const name = document.getElementById('history-modal-name').value;
    const rowIndex = document.getElementById('history-modal-row-index').value;
    const date = document.getElementById('history-modal-date').value;
    const staff = document.getElementById('history-modal-staff').value;
    const comment = document.getElementById('history-modal-comment').value.trim();
    const cardId = document.getElementById('history-modal').dataset.cardId;
    
    if (!date) {
        showToast('面談日を入力してください', 'error');
        return;
    }
    
    if (!comment) {
        showToast('コメントを入力してください', 'error');
        return;
    }
    
    try {
        let action, body;
        
        if (rowIndex) {
            // 更新
            action = 'updateInterviewHistory';
            body = {
                rowIndex: parseInt(rowIndex),
                name: name,
                interviewDate: date,
                staff: staff,
                comment: comment
            };
        } else {
            // 新規追加
            action = 'addInterviewHistory';
            body = {
                name: name,
                interviewDate: date,
                staff: staff,
                comment: comment
            };
        }
        
        const response = await fetch(`${API_URL}?action=${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(body)
        });
        
        const result = await response.json();
        
        if (result.success) {
            closeHistoryModal();
            showToast(result.message, 'success');
            
            // URL管理データを再読み込み
            await loadUrlData();
            
            // 該当カードの最新コメントを再読み込み
            if (cardId) {
                await loadLatestComment(cardId, name);
            }
        } else {
            showToast(result.error || '保存に失敗しました', 'error');
        }
    } catch (error) {
        console.error('saveInterviewHistory error:', error);
        showToast('保存に失敗しました', 'error');
    }
}

/**
 * 履歴削除を実行
 */
async function confirmHistoryDelete() {
    const rowIndex = document.getElementById('history-delete-row-index').value;
    const cardId = document.getElementById('history-delete-card-id').value;
    
    if (!rowIndex) return;
    
    try {
        const response = await fetch(`${API_URL}?action=deleteInterviewHistory`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ rowIndex: parseInt(rowIndex) })
        });
        
        const result = await response.json();
        
        if (result.success) {
            closeHistoryDeleteModal();
            showToast('履歴を削除しました', 'success');
            
            // URL管理データを再読み込み
            await loadUrlData();
            
            // 該当カードを更新
            const cache = historyCache[cardId];
            if (cache && cardId) {
                await loadLatestComment(cardId, cache.name);
            }
        } else {
            showToast(result.error || '削除に失敗しました', 'error');
        }
    } catch (error) {
        console.error('confirmHistoryDelete error:', error);
        showToast('削除に失敗しました', 'error');
    }
}

// ===============================
// コメント履歴機能（v5.1）
// ===============================

/**
 * コメントセクションのHTMLを生成
 */
function renderCommentSection(name) {
    const comments = commentCache[name] || [];
    const isOpen = openAccordions.has(name);
    
    // 最新コメント
    const latestComment = comments.length > 0 ? comments[0] : null;
    
    // 過去のコメント（2件目以降）
    const pastComments = comments.slice(1);
    
    let latestHtml = '';
    if (latestComment) {
        const dateStr = latestComment.date ? formatDisplayDate(latestComment.date) : '';
        const staffStr = latestComment.staff || '';
        const metaStr = [dateStr, staffStr].filter(s => s).join(' ');
        
        latestHtml = `
            <div class="latest-comment">
                <div class="comment-meta">
                    <span class="comment-date-staff">${metaStr}</span>
                    <div class="comment-actions">
                        <button class="btn-comment-edit" onclick="showEditCommentModal('${name}', ${latestComment.rowIndex})">編集</button>
                        <button class="btn-comment-delete" onclick="showDeleteCommentModal('${name}', ${latestComment.rowIndex})">削除</button>
                    </div>
                </div>
                <div class="comment-wrapper" onclick="toggleCommentExpand(this)">
                    <div class="comment-text ${expandedComments.has(name) ? 'expanded' : 'collapsed'}">${escapeHtml(latestComment.comment || '')}</div>
                    <span class="expand-hint"></span>
                </div>
            </div>
        `;
    } else {
        latestHtml = '<div class="no-comment">コメントなし</div>';
    }
    
    // 過去の履歴
    let historyHtml = '';
    if (pastComments.length > 0) {
        const historyItems = pastComments.map(c => {
            const dateStr = c.date ? formatDisplayDate(c.date) : '';
            const staffStr = c.staff || '';
            const metaStr = [dateStr, staffStr].filter(s => s).join(' ');
            
            return `
                <div class="history-comment">
                    <div class="comment-meta">
                        <span class="comment-date-staff">${metaStr}</span>
                        <div class="comment-actions">
                            <button class="btn-comment-edit" onclick="showEditCommentModal('${name}', ${c.rowIndex})">編集</button>
                            <button class="btn-comment-delete" onclick="showDeleteCommentModal('${name}', ${c.rowIndex})">削除</button>
                        </div>
                    </div>
                    <div class="comment-wrapper" onclick="toggleCommentExpand(this)">
                        <div class="comment-text ${expandedComments.has(name) ? 'expanded' : 'collapsed'}">${escapeHtml(c.comment || '')}</div>
                        <span class="expand-hint"></span>
                    </div>
                </div>
            `;
        }).join('');
        
        historyHtml = `
            <button class="comment-history-toggle ${isOpen ? 'open' : ''}" onclick="toggleCommentHistory('${name}')">
                <span class="toggle-icon">▼</span>
                過去の履歴を見る (${pastComments.length}件)
            </button>
            <div class="comment-history-list ${isOpen ? 'open' : ''}" id="history-${name}">
                ${historyItems}
            </div>
        `;
    }
    
    return `
        <div class="comment-section">
            <div class="comment-header">
                <span class="comment-title">💬 コメント</span>
                <button class="btn-add-comment" onclick="showAddCommentModal('${name}')">+追加</button>
            </div>
            ${latestHtml}
            ${historyHtml}
        </div>
    `;
}

/**
 * コメント履歴のアコーディオン切り替え
 */
function toggleCommentHistory(name) {
    const historyList = document.getElementById(`history-${name}`);
    const toggle = historyList?.previousElementSibling;
    
    if (openAccordions.has(name)) {
        openAccordions.delete(name);
        historyList?.classList.remove('open');
        toggle?.classList.remove('open');
    } else {
        openAccordions.add(name);
        historyList?.classList.add('open');
        toggle?.classList.add('open');
    }
}

/**
 * 指定キャストのコメント履歴を読み込み
 */
async function loadCommentHistory(name) {
    try {
        // ★ GETリクエストで取得
        const response = await fetch(`${API_URL}?action=getInterviewHistory&name=${encodeURIComponent(name)}`);
        const result = await response.json();
        
        if (result.success) {
            commentCache[name] = result.data.map(item => ({
                rowIndex: item.rowIndex,
                name: item.name,
                date: item.interviewDate || item.date,
                staff: item.staff,
                comment: item.comment,
                createdAt: item.createdAt
            }));
            return commentCache[name];
        }
        return [];
    } catch (error) {
        console.error('loadCommentHistory: エラー', error);
        return [];
    }
}

/**
 * 全キャストの最新コメントを読み込み（一括取得）
 */
async function loadAllLatestComments() {
    try {
        // 一括取得APIを使用（CORSエラー対策）
        const response = await fetch(`${API_URL}?action=getAllInterviewHistory`);
        const result = await response.json();
        
        if (result.success) {
            // キャストごとのデータをキャッシュに格納
            for (const name in result.data) {
                commentCache[name] = result.data[name].map(item => ({
                    rowIndex: item.rowIndex,
                    name: item.name,
                    date: item.interviewDate || item.date,
                    staff: item.staff,
                    comment: item.comment,
                    createdAt: item.createdAt
                })).sort((a, b) => {
                    // 日付で降順ソート（新しい順）
                    const dateA = new Date(a.date || 0);
                    const dateB = new Date(b.date || 0);
                    if (dateB - dateA !== 0) {
                        return dateB - dateA;
                    }
                    // 同じ日付ならrowIndexで降順（大きい方が新しい）
                    return b.rowIndex - a.rowIndex;
                });
            }
        }
    } catch (error) {
        console.error('loadAllLatestComments: エラー', error);
    }
    
    // 新着コメントバーを更新
    setTimeout(renderNewCommentBar, 100);
}

/**
 * コメント追加モーダルを表示
 */
function showAddCommentModal(name) {
    currentCommentName = name;
    currentCommentRowIndex = null;
    
    document.getElementById('comment-modal-title').textContent = 'コメントを追加';
    document.getElementById('comment-cast-name').value = name;
    document.getElementById('comment-row-index').value = '';
    
    // 今日の日付をデフォルトに
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('comment-date').value = today;
    
    // スタッフドロップダウンを更新
    updateCommentStaffDropdown('');
    
    document.getElementById('comment-text').value = '';
    
    document.getElementById('comment-modal').classList.add('active');
}

/**
 * コメント編集モーダルを表示
 */
async function showEditCommentModal(name, rowIndex) {
    currentCommentName = name;
    currentCommentRowIndex = rowIndex;
    
    // キャッシュからコメントを取得
    const comments = commentCache[name] || [];
    const comment = comments.find(c => c.rowIndex === rowIndex);
    
    if (!comment) {
        showToast('コメントが見つかりません', 'error');
        return;
    }
    
    document.getElementById('comment-modal-title').textContent = 'コメントを編集';
    document.getElementById('comment-cast-name').value = name;
    document.getElementById('comment-row-index').value = rowIndex;
    document.getElementById('comment-date').value = formatDateForInput(comment.date);
    updateCommentStaffDropdown(comment.staff || '');
    document.getElementById('comment-text').value = comment.comment || '';
    
    document.getElementById('comment-modal').classList.add('active');
}

/**
 * コメントモーダルを閉じる
 */
function closeCommentModal() {
    document.getElementById('comment-modal').classList.remove('active');
    currentCommentName = null;
    currentCommentRowIndex = null;
}

/**
 * コメント削除確認モーダルを表示
 */
function showDeleteCommentModal(name, rowIndex) {
    document.getElementById('delete-comment-name').value = name;
    document.getElementById('delete-comment-row-index').value = rowIndex;
    document.getElementById('comment-delete-modal').classList.add('active');
}

/**
 * コメント削除確認モーダルを閉じる
 */
function closeCommentDeleteModal() {
    document.getElementById('comment-delete-modal').classList.remove('active');
}

/**
 * コメント用スタッフドロップダウンを更新
 */
function updateCommentStaffDropdown(selectedValue = '') {
    const select = document.getElementById('comment-staff');
    if (!select) return;
    
    const staffList = urlData.filter(u => u.class === 'スタッフ');
    
    let options = '<option value="">選択してください</option>';
    staffList.forEach(staff => {
        const selected = staff.name === selectedValue ? 'selected' : '';
        options += `<option value="${staff.name}" ${selected}>${staff.name}</option>`;
    });
    
    select.innerHTML = options;
}

/**
 * コメントを保存
 */
async function saveComment() {
    // 二重送信防止
    const saveBtn = document.querySelector('#comment-modal .btn-primary, #comment-modal button[onclick*="saveComment"]');
    if (saveBtn && saveBtn.disabled) return;
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = '保存中...';
    }
    
    const name = document.getElementById('comment-cast-name').value;
    const rowIndex = document.getElementById('comment-row-index').value;
    const date = document.getElementById('comment-date').value;
    const staff = document.getElementById('comment-staff').value;
    const comment = document.getElementById('comment-text').value.trim();
    
    if (!date) {
        showToast('日付を入力してください', 'error');
        return;
    }
    if (!staff) {
        showToast('スタッフを選択してください', 'error');
        return;
    }
    if (!comment) {
        showToast('コメントを入力してください', 'error');
        return;
    }
    
    try {
        let action, body;
        
        if (rowIndex) {
            // 更新
            action = 'updateInterviewHistory';
            body = { rowIndex: parseInt(rowIndex), interviewDate: date, staff, comment };
        } else {
            // 追加
            action = 'addInterviewHistory';
            body = { name, interviewDate: date, staff, comment };
        }
        
        const response = await fetch(`${API_URL}?action=${action}`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify(body)
        });
        
        const result = await response.json();
        
        if (result.success) {
            closeCommentModal();
            
            // コメントキャッシュを更新
            await loadCommentHistory(name);
            
            // URLデータも再読み込み（最終面談日が更新されるため）
            await loadUrlData();
            
            // 面談カードを再描画
            renderInterviewList();
            
            showToast(result.message, 'success');
        } else {
            showToast(result.error, 'error');
        }
    } catch (error) {
        console.error('saveComment: エラー', error);
        showToast('コメントの保存に失敗しました', 'error');
    } finally {
        // ボタンを元に戻す
        const saveBtn = document.querySelector('#comment-modal .btn-primary, #comment-modal button[onclick*="saveComment"]');
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = '保存';
        }
    }
}

/**
 * コメントを削除
 */
async function confirmDeleteComment() {
    const name = document.getElementById('delete-comment-name').value;
    const rowIndex = document.getElementById('delete-comment-row-index').value;
    
    try {
        const response = await fetch(`${API_URL}?action=deleteInterviewHistory`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ rowIndex: parseInt(rowIndex) })
        });
        
        const result = await response.json();
        
        if (result.success) {
            closeCommentDeleteModal();
            
            // コメントキャッシュをクリア
            delete commentCache[name];
            
            // データ再取得
            await loadUrlData();
            
            // 面談カードを再描画
            renderInterviewList();
            
            showToast('コメントを削除しました', 'success');
        } else {
            showToast(result.error || '削除に失敗しました', 'error');
        }
    } catch (error) {
        console.error('confirmDeleteComment: エラー', error);
        showToast('削除中にエラーが発生しました', 'error');
    }
}

// ===============================
// コメント展開切り替え
// ===============================

/**
 * コメントの展開/折りたたみを切り替え
 */
function toggleCommentExpand(wrapper) {
    const element = wrapper.querySelector('.comment-text');
    const hint = wrapper.querySelector('.expand-hint');
    const name = wrapper.closest('.interview-card')?.dataset.name || '';
    
    if (element.classList.contains('collapsed')) {
        element.classList.remove('collapsed');
        element.classList.add('expanded');
        if (hint && hint.classList.contains('has-overflow')) {
            hint.textContent = ' [折りたたむ]';
        }
        if (name) expandedComments.add(name);
    } else {
        element.classList.remove('expanded');
        element.classList.add('collapsed');
        if (hint && hint.classList.contains('has-overflow')) {
            hint.textContent = ' [続きを表示]';
        }
        if (name) expandedComments.delete(name);
    }
}

/**
 * 省略されているコメントを検出してヒントを表示
 */
function checkCommentOverflow() {
    const comments = document.querySelectorAll('.comment-text.collapsed');
    comments.forEach(el => {
        const hint = el.nextElementSibling;
        const wrapper = el.closest('.comment-wrapper');
        const name = wrapper?.closest('.interview-card')?.dataset.name || '';
        
        if (hint && hint.classList.contains('expand-hint')) {
            // scrollHeight > clientHeight なら省略されている
            if (el.scrollHeight > el.clientHeight) {
                hint.classList.add('has-overflow');
                
                // 以前展開していた場合は展開状態を復元
                if (name && expandedComments.has(name)) {
                    el.classList.remove('collapsed');
                    el.classList.add('expanded');
                    hint.textContent = ' [折りたたむ]';
                } else {
                    hint.textContent = ' [続きを表示]';
                }
            } else {
                hint.classList.remove('has-overflow');
                hint.textContent = '';
            }
        }
    });
}

/**
 * コメントが新着かどうか判定
 * @param {string} dateStr - コメントの日付
 * @returns {boolean} 新着ならtrue
 */
function isNewComment(dateStr) {
    if (!dateStr) return false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const commentDate = new Date(dateStr);
    commentDate.setHours(0, 0, 0, 0);
    
    const diffTime = today - commentDate;
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    
    // 今日を含めてNEW_COMMENT_DAYS日以内
    return diffDays < NEW_COMMENT_DAYS;
}

/**
 * 新着コメントを集計
 * @returns {Array} [{name: 'キャスト名', count: 件数}, ...]
 */
function getNewComments() {
    const newComments = {};
    
    Object.keys(commentCache).forEach(name => {
        const comments = commentCache[name] || [];
        const newCount = comments.filter(c => isNewComment(c.date)).length;
        
        if (newCount > 0) {
            newComments[name] = newCount;
        }
    });
    
    // 件数が多い順にソート
    return Object.entries(newComments)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
}

/**
 * 新着コメントを日付ごとに集計
 * @returns {Object} { '2024-12-17': [{name, count}], '2024-12-18': [{name, count}] }
 */
function getNewCommentsByDate() {
    const result = {};
    
    Object.keys(commentCache).forEach(name => {
        const comments = commentCache[name] || [];
        
        comments.forEach(c => {
            if (isNewComment(c.date)) {
                const d = new Date(c.date);
                const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                
                if (!result[dateKey]) {
                    result[dateKey] = {};
                }
                if (!result[dateKey][name]) {
                    result[dateKey][name] = 0;
                }
                result[dateKey][name]++;
            }
        });
    });
    
    // 各日付のキャストを配列に変換
    Object.keys(result).forEach(dateKey => {
        result[dateKey] = Object.entries(result[dateKey])
            .map(([name, count]) => ({ name, count }))
            .sort((a, b) => b.count - a.count);
    });
    
    return result;
}

/**
 * 新着コメント通知バーを表示
 */
function renderNewCommentBar() {
    const bar = document.getElementById('new-comment-bar');
    const listEl = document.getElementById('new-comment-list');
    
    if (!bar || !listEl) {
        console.log('renderNewCommentBar: バー要素が見つかりません');
        return;
    }
    
    const newCommentsByDate = getNewCommentsByDate();
    
    if (Object.keys(newCommentsByDate).length === 0) {
        bar.style.display = 'none';
        return;
    }
    
    // 日付ごとにグループ化して表示（段分け）
    const dateGroups = Object.entries(newCommentsByDate)
        .sort((a, b) => new Date(a[0]) - new Date(b[0])) // 日付昇順
        .map(([dateStr, names]) => {
            const date = new Date(dateStr);
            const displayDate = `${date.getMonth() + 1}/${date.getDate()}`;
            const nameItems = names.map(({ name, count }) => {
                const countStr = count > 1 ? `②③④⑤⑥⑦⑧⑨⑩`.charAt(count - 2) || `(${count})` : '';
                const cast = urlData.find(c => c.name === name);
                const storeClass = cast?.mainStore || '';
                return `<span class="new-comment-item ${storeClass}" onclick="scrollToInterview('${name}')">${name}${countStr}</span>`;
            }).join('');
            return `<div class="new-comment-date-group"><span class="new-comment-date">${displayDate}</span>${nameItems}</div>`;
        }).join('');
    
    listEl.innerHTML = dateGroups;
    bar.style.display = 'flex';
    
    console.log('renderNewCommentBar: 新着表示完了');
}

/**
 * 指定キャストの面談カードにスクロール
 * @param {string} name - キャスト名
 */
function scrollToInterview(name) {
    // 面談タブに切り替え
    if (typeof showView === 'function') {
        showView('interview');
    }
    
    // カードが表示されるまでリトライ
    let retryCount = 0;
    const maxRetries = 20;
    
    const tryScroll = () => {
        const card = document.querySelector(`.interview-card[data-name="${name}"]`);
        if (card) {
            // スクロール
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
            
            // ハイライト
            card.classList.add('highlight');
            setTimeout(() => {
                card.classList.remove('highlight');
            }, 2000);
        } else if (retryCount < maxRetries) {
            retryCount++;
            setTimeout(tryScroll, 200);
        } else {
            console.log('scrollToInterview: カードが見つかりません', name);
        }
    };
    
    setTimeout(tryScroll, 100);
}

// =============================================
// ★★★ v3.5追加: オキニトーク・話したよ・当欠 ★★★
// =============================================

/**
 * オキニトークデータを読み込み
 */
async function loadOkiniData() {
    // ★ v3.5改善: シフトデータから直接取得済み（loadShiftDataで生成）
    // フォールバックとしてAPI呼び出しも残す
    if (shiftData.length > 0) {
        okiniData = shiftData
            .filter(s => s.okiniDelidosu || s.okiniAnecan || s.okiniAinoshizuku ||
                         s.talkedDelidosu || s.talkedAnecan || s.talkedAinoshizuku)
            .map(s => ({
                name: s.name,
                delidosu: s.okiniDelidosu || '',
                anecan: s.okiniAnecan || '',
                ainoshizuku: s.okiniAinoshizuku || '',
                delidosuTalked: s.talkedDelidosu || '',
                anecanTalked: s.talkedAnecan || '',
                ainoshizukuTalked: s.talkedAinoshizuku || ''
            }));
        console.log('loadOkiniData: シフトデータから', okiniData.length, '件取得');
    } else {
        try {
            const response = await fetch(`${API_URL}?action=getOkiniData`);
            const result = await response.json();
            if (result.success) {
                okiniData = result.data;
                console.log('loadOkiniData: API経由', okiniData.length, '件取得');
            }
        } catch (error) {
            console.error('loadOkiniData: エラー:', error);
        }
    }
}

/**
 * オキニバッジHTML生成
 * 店舗ボタンの下にバッジ + 話したよボタンを表示
 */
function getOkiniBadge(name, store) {
    const castOkini = okiniData.find(o => o.name === name);
    if (!castOkini) return '';
    
    const count = castOkini[store];
    const talked = castOkini[store + 'Talked'] === '済';
    
    // 未登録（空欄）: 非表示
    if (count === '' || count === undefined || count === null) return '';
    
    // バッジクラスとテキスト
    let badgeClass, badgeText;
    const numCount = parseInt(count) || 0;
    
    if (count === '9+' || numCount >= 10) {
        badgeClass = 'okini-danger';
        badgeText = '💬9+';
    } else if (numCount >= 1) {
        badgeClass = 'okini-warn';
        badgeText = '💬' + count;
    } else {
        badgeClass = 'okini-clear';
        badgeText = '✓ 0';
    }
    
    // 話したよボタン（1件以上の場合のみ）
    let talkedHtml = '';
    if (numCount >= 1 || count === '9+') {
        const talkedClass = talked ? 'talked' : '';
        const talkedText = talked ? '✅済' : '☐未';
        talkedHtml = '<span class="okini-talked-btn ' + talkedClass + '" ' +
            'onclick="event.stopPropagation(); toggleOkiniTalked(\'' + name + '\', \'' + store + '\')" ' +
            'title="' + (talked ? '話し済み' : 'クリックで話したよマーク') + '"' +
            '>' + talkedText + '</span>';
    }
    
    return '<div class="okini-row">' +
        '<span class="okini-badge ' + badgeClass + '">' + badgeText + '</span>' +
        talkedHtml +
    '</div>';
}

/**
 * 話したよ✅トグル
 */
async function toggleOkiniTalked(name, store) {
    const castOkini = okiniData.find(o => o.name === name);
    if (!castOkini) return;
    
    const currentTalked = castOkini[store + 'Talked'] === '済';
    const newTalked = !currentTalked;
    
    // 即座にUI更新（楽観的更新）
    castOkini[store + 'Talked'] = newTalked ? '済' : '';
    renderShiftList();
    
    // GASに保存
    try {
        await fetch(API_URL + '?action=updateOkiniTalked', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ name: name, store: store, talked: newTalked })
        });
        console.log('話したよ更新:', name, store, newTalked);
    } catch (error) {
        console.error('話したよ保存エラー:', error);
    }
}

/**
 * 当欠トグル
 */
async function toggleTouketu(name) {
    const shift = shiftData.find(s => s.name === name);
    if (!shift) return;
    
    const isCurrentlyTouketu = shift.time === '当欠';
    
    if (isCurrentlyTouketu) {
        // 当欠 → 元の時間に戻す
        shift.time = shift.originalTime || '00:00';
        shift.originalTime = '';
    } else {
        // 通常 → 当欠にする
        shift.originalTime = shift.time;
        shift.time = '当欠';
    }
    
    // 即座にUI更新
    renderShiftList();
    
    // GASに保存
    try {
        await fetch(API_URL + '?action=updateShiftTime', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({
                name: name,
                time: shift.time,
                originalTime: shift.originalTime || ''
            })
        });
        console.log('当欠更新:', name, shift.time);
        showToast(isCurrentlyTouketu ? name + ' の当欠を解除しました' : name + ' を当欠にしました', 'success');
    } catch (error) {
        console.error('当欠保存エラー:', error);
        showToast('当欠の保存に失敗しました', 'error');
    }
}
