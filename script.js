/**
 * キテネマスター - JavaScript
 */

// Google Apps Script API URL
const API_URL = 'https://script.google.com/macros/s/AKfycbzuZppKM-9ZQCm5YITAN0zmLNMEAmvj6FaRXy-45ygjuz2HqLHGiCOTF8lcFMOx6QnA/exec';

// グローバル変数
let shiftData = [];
let urlData = [];
let currentEditName = null;
let currentDeleteName = null;
let currentShiftDate = '';
let currentStoreFilter = 'all'; // 現在の店舗フィルター

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
        // ★★★ チェック連動: シフトリストを再描画 ★★★
        renderShiftList();
    } else if (viewName === 'all') {
        document.getElementById('all-view').classList.add('active');
        document.querySelector('.nav-btn:nth-child(2)').classList.add('active');
        // ★★★ チェック連動: 全キャストリストを再描画 ★★★
        renderAllCastList();
    } else if (viewName === 'url') {
        document.getElementById('url-view').classList.add('active');
        document.querySelector('.nav-btn:nth-child(3)').classList.add('active');
        loadUrlData();
    }
}

// ===============================
// データ読み込み
// ===============================

async function loadAllData() {
    console.log('loadAllData: 全データロード開始');
    await loadShiftData();
    await loadUrlData();
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
                time: formatTime(shift.time)
            }));
            console.log('loadShiftData: データ件数', shiftData.length);
            console.log('loadShiftData: 時刻変換後の最初のデータ:', shiftData[0]);
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
        }
        
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
                
                // 「出勤予」のデータのみ抽出
                const filteredData = jsonData
                    .filter(row => {
                        const isMatch = row['シフト状態'] === '出勤予';
                        if (!isMatch) {
                            console.log('フィルタアウト:', row['源氏名'], 'シフト状態:', row['シフト状態']);
                        }
                        return isMatch;
                    })
                    .map(row => ({
                        name: row['源氏名'] || '',
                        time: formatTime(row['出勤時間']),
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
                
                console.log('readExcelFile: フィルタ後の件数', filteredData.length);
                console.log('フィルタ後のデータ:', filteredData);
                resolve(filteredData);
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

function parseTime(timeStr) {
    if (!timeStr) return 0;
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
    } else if (document.getElementById('url-view').classList.contains('active')) {
        renderUrlList();
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
    const filteredData = filterDataByStore(shiftData, currentStoreFilter);
    console.log('フィルター後のデータ件数:', filteredData.length, '(フィルター:', currentStoreFilter, ')');
    
    if (filteredData.length === 0) {
        listElement.style.display = 'none';
        emptyElement.style.display = 'block';
        if (document.getElementById('date-display')) {
            document.getElementById('date-display').textContent = currentShiftDate || '';
        }
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
    
    // ★★★ 出勤時間順にソート（深夜営業対応） ★★★
    mergedData.sort((a, b) => {
        const timeA = parseTime(a.time);
        const timeB = parseTime(b.time);
        if (timeA !== timeB) return timeA - timeB;
        return a.name.localeCompare(b.name, 'ja');
    });
    
    listElement.innerHTML = mergedData.map(shift => {
        // ★★★ 時刻を適切にフォーマット ★★★
        const formattedTime = formatTime(shift.time);
        
        // ★★★ メイン店舗バッジの生成 ★★★
        let mainBadge = '';
        if (shift.mainStore) {
            const storeNames = {
                'delidosu': 'でりどす',
                'anecan': 'アネキャン',
                'ainoshizuku': 'しずく'
            };
            const storeName = storeNames[shift.mainStore] || '';
            if (storeName) {
                mainBadge = `<span class="main-store-badge ${shift.mainStore}">${storeName}</span>`;
            }
        }
        
        return `
            <div class="shift-item" data-name="${shift.name}">
                <div class="shift-header">
                    <div class="shift-info">
                        <span class="shift-name">${shift.name}</span>
                        <span class="shift-time">${formattedTime}</span>
                        ${getMainStoreBadge(shift.name)}
                    </div>
                </div>
                <div class="check-buttons">
                    <div class="check-btn-wrapper ${getCheckStatus(shift.name, 'delidosu') ? 'checked' : ''}">
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
                    <div class="check-btn-wrapper ${getCheckStatus(shift.name, 'anecan') ? 'checked' : ''}">
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
                    <div class="check-btn-wrapper ${getCheckStatus(shift.name, 'ainoshizuku') ? 'checked' : ''}">
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
                </div>
            </div>
        `;
    }).join('');
    
    // ★★★ 日付表示 ★★★
    if (currentShiftDate && document.getElementById('date-display')) {
        document.getElementById('date-display').textContent = currentShiftDate;
    }
    
    console.log('renderShiftList: 描画完了');
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
        html += '<div class="class-header himede"><h3>👑 姫デコ</h3></div>';
        classGroups['姫デコ'].forEach(cast => {
            html += renderCastCard(cast);
        });
    }
    
    // ★★★ 新人 ★★★
    if (classGroups['新人'].length > 0) {
        html += '<div class="class-header newbie"><h3>🆕 新人</h3></div>';
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
                html += `<div class="class-header"><h3>📋 ${group}行</h3></div>`;
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
                <div class="check-btn-wrapper ${getCheckStatus(cast.name, 'anecan') ? 'checked' : ''}">
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
                <div class="check-btn-wrapper ${getCheckStatus(cast.name, 'ainoshizuku') ? 'checked' : ''}">
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
    
    listElement.innerHTML = filteredUrlData.map(url => `
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
    `).join('');
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
    if (document.getElementById('modal-deli-main').checked) {
        mainStore = 'delidosu';
    } else if (document.getElementById('modal-ane-main').checked) {
        mainStore = 'anecan';
    } else if (document.getElementById('modal-aino-main').checked) {
        mainStore = 'ainoshizuku';
    }
    
    const data = {
        name: name,
        class: document.getElementById('modal-class').value, // ★★★ クラスを追加 ★★★
        delidosuName: document.getElementById('modal-deli-name').value.trim(),
        delidosuUrl: document.getElementById('modal-deli-url').value.trim(),
        anecanName: document.getElementById('modal-ane-name').value.trim(),
        anecanUrl: document.getElementById('modal-ane-url').value.trim(),
        ainoshizukuName: document.getElementById('modal-aino-name').value.trim(),
        ainoshizukuUrl: document.getElementById('modal-aino-url').value.trim(),
        mainStore: mainStore // ★★★ メイン店舗を追加 ★★★
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

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}
