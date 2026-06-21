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
let realtimeFlags = {}; // ★ 空き予告: 源氏名→公開範囲（getRealtimeFlags）
let availLockUntil = {}; // ★ 空き予告グレーアウト（方式B）: 源氏名→ロック解除のmsタイムスタンプ（クライアント基準）
let currentEditName = null;
let currentDeleteName = null;
let currentShiftDate = '';
let weeklyHeadcount = [];  // 週間シフトの人数（日付ごと・店舗ごと）
let strategyFilledByUnified = false;  // 戦略フォームを相乗りで反映済みか
let publicationCategories = [];  // 掲載カテゴリ（プルダウン選択肢）
let publicationsFilledByUnified = false;  // 掲載を相乗りで反映済みか
let productFilledByUnified = false;  // 商品を相乗りで反映済みか
let currentStoreFilter = 'all'; // 現在の店舗フィルター
let currentOkiniFilter = 'all'; // ★v3.5 オキニフィルター（all/danger/warn/clear）
let autoRefreshInterval = null;  // 自動リロードのインターバルID
let autoRefreshSeconds = 300;     // 自動リロードの間隔(秒)
let cardIdCounter = 0;      // カードID用カウンター
let historyCache = {};      // 履歴キャッシュ
let commentCache = {};           // コメントキャッシュ { 源氏名: [コメント配列] }
let openAccordions = new Set();  // 開いているアコーディオンの源氏名
let expandedComments = new Set(); // 展開中のコメントを記録
let currentCommentName = null;   // コメント編集中の源氏名
let currentCommentRowIndex = null; // コメント編集中の行番号

// ★★★ デバッグログ制御 ★★★
// 本番運用時は false、開発時は true でログ詳細表示
const DEV_MODE = false;

/**
 * 開発時のみ出力するログ（DEV_MODE=falseで本番ではサイレント）
 * エラーログは console.error / console.warn を使うこと（こちらは常に出力）
 */
function devLog(...args) {
    if (DEV_MODE) console.log(...args);
}

// ★★★ v3.5追加: オキニトークデータ ★★★
let okiniData = [];

// ===============================
// localStorageキャッシュ（体感高速化用）
// ===============================
const CACHE_KEY = 'kitenemaster_cache_v1';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1時間

/**
 * 全データをlocalStorageにキャッシュ保存
 */
function saveCache() {
    try {
        const cacheData = {
            timestamp: Date.now(),
            currentShiftDate: currentShiftDate,
            shiftData: shiftData,
            urlData: urlData,
            okiniData: okiniData,
            commentCache: commentCache
        };
        localStorage.setItem(CACHE_KEY, JSON.stringify(cacheData));
    } catch (e) {
        console.warn('saveCache: 保存失敗', e);
    }
}

/**
 * localStorageからキャッシュを読み込み、グローバル変数に復元
 * @returns {boolean} 復元成功時 true、キャッシュなし・期限切れ・エラー時 false
 */
function loadCache() {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (!cached) return false;
        
        const cacheData = JSON.parse(cached);
        
        // 期限切れチェック
        if (!cacheData.timestamp || Date.now() - cacheData.timestamp > CACHE_TTL_MS) {
            devLog('loadCache: キャッシュ期限切れ');
            return false;
        }
        
        // グローバル変数に復元
        currentShiftDate = cacheData.currentShiftDate || '';
        shiftData = cacheData.shiftData || [];
        urlData = cacheData.urlData || [];
        okiniData = cacheData.okiniData || [];
        commentCache = cacheData.commentCache || {};
        
        devLog('loadCache: キャッシュから復元完了', {
            シフト件数: shiftData.length,
            URL件数: urlData.length,
            コメント件数: Object.keys(commentCache).length
        });
        return true;
    } catch (e) {
        console.warn('loadCache: 読み込み失敗', e);
        return false;
    }
}

/**
 * キャッシュを削除（強制最新化したいときに呼ぶ）
 */
function clearCache() {
    try {
        localStorage.removeItem(CACHE_KEY);
        devLog('clearCache: キャッシュ削除完了');
    } catch (e) {
        console.warn('clearCache: 削除失敗', e);
    }
}

// ===============================
// API共通ヘルパー（fetch呼び出しの統一・エラー処理強化）
// ===============================

/**
 * GAS APIへの統一的な呼び出し関数
 * @param {string} action - APIアクション名
 * @param {object} options - { method, body, query } の組み合わせ
 * @returns {Promise<object>} レスポンス（失敗時は { success: false, error: '...' }）
 */
async function apiCall(action, options = {}) {
    const { method = 'GET', body = null, query = null } = options;
    
    try {
        let url = `${API_URL}?action=${encodeURIComponent(action)}`;
        // GETパラメータ追加
        if (query && typeof query === 'object') {
            for (const key in query) {
                if (query[key] !== undefined && query[key] !== null) {
                    url += `&${encodeURIComponent(key)}=${encodeURIComponent(query[key])}`;
                }
            }
        }
        
        const fetchOptions = { method };
        if (body && method !== 'GET') {
            fetchOptions.headers = { 'Content-Type': 'text/plain' };
            fetchOptions.body = JSON.stringify(body);
        }
        
        const response = await fetch(url, fetchOptions);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        const result = await response.json();
        return result;
    } catch (error) {
        console.error(`apiCall(${action}) エラー:`, error);
        return { success: false, error: error.message };
    }
}

// ===============================
// 初期化
// ===============================

document.addEventListener('DOMContentLoaded', () => {
    devLog('=== キテネマスター 初期化開始 ===');
    devLog('API URL:', API_URL);
    devLog('XLSXライブラリ:', typeof XLSX !== 'undefined' ? '読み込み済み' : '未読み込み');
    
    // ★ 背景：満天の星空（チカチカ星＋流れ星）を初期化
    initStarfield();
    
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
    devLog('初期データをロード中...');
    loadAllData();
    
    // ★★★ PCのみ5分ごとに自動更新（スマホは画面リセット対策で自動更新せず、下スワイプで更新）★★★
    if (window.innerWidth >= 768) {
        startAutoRefresh();
    }
    
    // トップに戻るボタンのスクロール監視
    window.addEventListener('scroll', handleScroll);
});

// ===============================
// 背景：満天の星空（チカチカ星＋流れ星）
// ===============================

/**
 * 星空背景を初期化する
 * - チカチカ星: #star-twinkle に26個のspanを生成（CSSで別々のリズムで瞬く）
 * - 流れ星:     #shooting-layer に定期的に流星を発生（全域・ランダム角度）
 * モーション軽減設定がONのユーザーには、流れ星を発生させない（チカチカもCSS側で停止）
 */
function initStarfield() {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // --- チカチカ星 26個 ---
    const twinkleLayer = document.getElementById('star-twinkle');
    if (twinkleLayer && twinkleLayer.childElementCount === 0) {
        const positions = [
            '12% 18%', '28% 62%', '45% 30%', '61% 75%', '73% 22%',
            '84% 58%', '38% 85%', '92% 40%', '19% 45%', '55% 12%',
            '7% 70%',  '67% 48%', '33% 8%',  '78% 82%', '48% 65%',
            '95% 28%', '24% 35%', '88% 15%', '41% 52%', '15% 88%',
            '58% 38%', '5% 25%',  '70% 8%',  '82% 70%', '30% 75%',
            '50% 90%'
        ];
        const frag = document.createDocumentFragment();
        positions.forEach((pos, i) => {
            const [left, top] = pos.split(' ');
            const size = 2 + (i % 3 === 0 ? 1 : 0);
            const star = document.createElement('span');
            star.className = 'tw-star';
            star.style.left = left;
            star.style.top = top;
            star.style.width = size + 'px';
            star.style.height = size + 'px';
            // 別々の周期・開始タイミングで自然な瞬きに
            star.style.animationDuration = (2 + i * 0.28) + 's';
            star.style.animationDelay = (i * 0.18) + 's';
            frag.appendChild(star);
        });
        twinkleLayer.appendChild(frag);
    }

    // --- 流れ星（モーション軽減設定がONなら出さない） ---
    if (reduceMotion) return;

    const shootLayer = document.getElementById('shooting-layer');
    if (!shootLayer) return;

    function launchShootingStar() {
        const star = document.createElement('div');
        star.className = 'shooting-star';

        const len = 90 + Math.random() * 80;        // 尾の長さ 90〜170px
        const angle = 12 + Math.random() * 26;       // 角度 12〜38度
        const dist = 380 + Math.random() * 340;      // 飛距離 380〜720px
        const dur = 900 + Math.random() * 800;       // 0.9〜1.7秒

        star.style.width = len + 'px';
        star.style.left = (Math.random() * 85) + '%';   // 横位置：ほぼ全域
        star.style.top = (Math.random() * 55) + '%';    // 縦位置：上〜中段

        const rad = angle * Math.PI / 180;
        const dx = Math.cos(rad) * dist;
        const dy = Math.sin(rad) * dist;

        // WebAnimations APIで尾を引いて流れる
        const anim = star.animate([
            { transform: `translate(0, 0) rotate(${angle}deg)`, opacity: 0 },
            { opacity: 1, offset: 0.1 },
            { opacity: 1, offset: 0.7 },
            { transform: `translate(${dx}px, ${dy}px) rotate(${angle}deg)`, opacity: 0 }
        ], { duration: dur, easing: 'ease-out', fill: 'forwards' });

        shootLayer.appendChild(star);
        anim.onfinish = () => star.remove();
    }

    // 2秒ごとに70%の確率で発生（平均およそ3秒に1本）
    // タブが非表示の間はブラウザがsetIntervalを抑制するので負荷も気にならない
    setInterval(() => {
        if (document.hidden) return;
        if (Math.random() < 0.7) launchShootingStar();
    }, 2000);

    // 起動直後に1本流して「動いている」ことをすぐ見せる
    launchShootingStar();
}

// ===============================
// ビュー切り替え
// ===============================

function showView(viewName) {
    // ★ View Transitions API：対応ブラウザはタブ切り替えをクロスフェードに
    // 非対応ブラウザ・モーション軽減設定時は従来通り即時切り替え（壊れない）
    if (document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        document.startViewTransition(() => applyView(viewName));
    } else {
        applyView(viewName);
    }
}

function applyView(viewName) {
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
        // ★コメントロードはrenderInterviewList内で実行（レイアウトシフト防止）
    } else if (viewName === 'url') {
        document.getElementById('url-view').classList.add('active');
        document.querySelector('.nav-btn:nth-child(4)').classList.add('active');
        renderUrlList();
        updateJumpButtons('url');
    }
    
    // ★ カード入場アニメーション（タブ切り替え時のみ再生・通常の再描画では再生しない）
    playEntranceAnimation();
}

/**
 * アクティブなビューにカード入場アニメーションを一度だけ再生
 * animate-inクラスを短時間付与し、CSS側のスタガーアニメを発火させる
 */
function playEntranceAnimation() {
    const view = document.querySelector('.view.active');
    if (!view) return;
    view.classList.remove('animate-in');
    void view.offsetWidth;  // リフロー強制でアニメーションをリセット
    view.classList.add('animate-in');
    setTimeout(() => view.classList.remove('animate-in'), 700);
}

// ===============================
// データ読み込み
// ===============================

async function loadAllData() {
    devLog('loadAllData: 全データロード開始');
    const startTime = Date.now();
    strategyFilledByUnified = false;
    publicationsFilledByUnified = false;
    productFilledByUnified = false;
    
    // ★★★ Phase 1: localStorage から即時表示（体感速度0ms）★★★
    const hasCacheData = loadCache();
    if (hasCacheData) {
        // 日付表示
        if (currentShiftDate) {
            const dateDisplay = document.getElementById('date-display');
            if (dateDisplay) {
                dateDisplay.textContent = `📅 ${currentShiftDate}のシフト`;
                dateDisplay.classList.add('has-date');
            }
        }
        // 即座に画面描画
        renderShiftList();
        devLog(`loadAllData: キャッシュから即時表示 (${Date.now() - startTime}ms)`);
    }
    
    // ★★★ Phase 2: APIから最新データ取得 ★★★
    // まず統合API（高速・1往復）を試行、失敗時は並列ロードにフォールバック
    const unifiedSuccess = await loadAllDataUnified();
    
    if (!unifiedSuccess) {
        // フォールバック：従来の並列ロード
        devLog('loadAllData: 統合API失敗のため並列ロードにフォールバック');
        await Promise.all([
            loadShiftDate(),
            loadShiftData(),
            loadUrlData(),
            loadOkiniData()
        ]);
    }
    
    // ★ 全データ揃った状態で再描画
    await loadRealtimeFlags();  // ★ 空き予告フラグを取得してから描画
    startAvailLockTicker();     // ★ 空き予告グレーアウト: ロック残りの自動更新を起動（1回だけ）
    renderShiftList();
    renderUrlList();
    
    // ★ Phase 3: キャッシュ保存（次回起動時に使用）
    saveCache();
    
    devLog(`loadAllData: 主要データロード完了 (${Date.now() - startTime}ms)`);
    
    // ★ 明日の戦略：見出しは手元の日付で即更新。中身は相乗りで来ていなければ個別取得
    updateStrategyTitle(getStrategyTargetDate());
    if (!strategyFilledByUnified) {
        loadStrategyData();
    }
    // ★ 商品・イベント掲載：相乗りで来ていなければ個別取得
    if (!publicationsFilledByUnified) {
        loadPublicationsData();
    }
    // ★ 商品：相乗りで来ていなければ個別取得
    if (!productFilledByUnified) {
        loadProductData();
    }
    
    // ★ コメントは統合APIで取得済みかチェック、未取得なら追加で取得
    if (unifiedSuccess && Object.keys(commentCache).length > 0) {
        // 統合APIでコメントも取得済み
        setTimeout(renderNewCommentBar, 100);
        devLog(`loadAllData: 全データロード完了 (${Date.now() - startTime}ms)`);
    } else {
        // 統合API未使用時：コメントをバックグラウンド取得
        loadAllLatestComments().then(() => {
            saveCache();
            devLog(`loadAllData: 全データロード完了 (${Date.now() - startTime}ms)`);
        });
    }
}

/**
 * GAS統合API版：1回のリクエストで全データを取得（最大の高速化）
 * GAS側に getInitialData アクションが必要
 * @param {object} options - { skipForms: true } で戦略・掲載・商品フォームを上書きしない（更新ボタン・自動更新用）
 * @returns {Promise<boolean>} 成功時true、失敗時false（呼び出し側でフォールバック）
 */
async function loadAllDataUnified(options = {}) {
    const { skipForms = false } = options;
    const result = await apiCall('getInitialData');
    
    if (!result || result.success !== true) {
        // 失敗時はフォールバック（呼び出し側で並列ロードに切り替え）
        return false;
    }
    
    try {
        // 全データを一括代入
        if (result.shiftDate) {
            currentShiftDate = formatShiftDate(result.shiftDate);
            const dateDisplay = document.getElementById('date-display');
            if (dateDisplay) {
                dateDisplay.textContent = `📅 ${currentShiftDate}のシフト`;
                dateDisplay.classList.add('has-date');
            }
        }
        if (Array.isArray(result.shiftData)) shiftData = result.shiftData;
        if (Array.isArray(result.urlData)) urlData = result.urlData;
        if (Array.isArray(result.okiniData)) okiniData = result.okiniData;
        if (Array.isArray(result.weeklyHeadcount)) weeklyHeadcount = result.weeklyHeadcount;
        renderWeeklyStrip();
        // ★ フォーム系の反映（更新時 skipForms=true なら入力途中の内容を守るためスキップ）
        if (!skipForms) {
            // ★ 明日の戦略も相乗りで反映（時間差なし）
            if (result.strategy && result.strategy.stores) {
                updateStrategyTitle(result.strategy.date);
                fillStrategyForm('delidosu', result.strategy.stores.delidosu);
                fillStrategyForm('anecan', result.strategy.stores.anecan);
                fillStrategyForm('ainoshizuku', result.strategy.stores.ainoshizuku);
                strategyFilledByUnified = true;
            }
            // ★ 明日の戦略の「出勤人数」を週間シフトから自動表示
            fillStrategyCounts();
            // ★ 今日の戦略をメモとして表示（編集不可）
            if (result.todayStrategy && result.todayStrategy.stores) {
                const tmd = result.todayStrategy.dateMd || '';
                fillTodayMemo('delidosu', result.todayStrategy.stores.delidosu, tmd);
                fillTodayMemo('anecan', result.todayStrategy.stores.anecan, tmd);
                fillTodayMemo('ainoshizuku', result.todayStrategy.stores.ainoshizuku, tmd);
            }
            // ★ 商品・イベント掲載も相乗りで反映
            if (result.publications) {
                renderPublications(result.publications.items, result.publications.categories);
                publicationsFilledByUnified = true;
            }
            if (result.product !== undefined && result.product !== null) {
                const pEl = document.getElementById('product-text');
                if (pEl) pEl.value = result.product;
                productFilledByUnified = true;
            }
        }
        if (result.comments && typeof result.comments === 'object') {
            // コメントの整形（loadAllLatestCommentsと同じソート）
            for (const name in result.comments) {
                commentCache[name] = (result.comments[name] || []).map(item => ({
                    rowIndex: item.rowIndex,
                    name: item.name,
                    date: item.interviewDate || item.date,
                    staff: item.staff,
                    comment: item.comment,
                    createdAt: item.createdAt
                })).sort((a, b) => {
                    const dateA = new Date(a.date || 0);
                    const dateB = new Date(b.date || 0);
                    if (dateB - dateA !== 0) return dateB - dateA;
                    return b.rowIndex - a.rowIndex;
                });
            }
        }
        
        devLog('loadAllDataUnified: 統合API成功', {
            シフト件数: shiftData.length,
            URL件数: urlData.length,
            オキニ件数: okiniData.length,
            コメント対象: Object.keys(commentCache).length
        });
        return true;
    } catch (error) {
        console.warn('loadAllDataUnified: 統合API失敗（フォールバックします）', error);
        return false;
    }
}

async function loadShiftData() {
    const result = await apiCall('getShiftData');
    
    if (result.success) {
        // ★★★ 時刻データをformatTimeで変換 ★★★
        shiftData = result.data.map(shift => ({
            ...shift,
            time: formatTime(shift.time),
            originalTime: shift.originalTime ? formatTime(shift.originalTime) : ''
        }));
        devLog('loadShiftData: データ件数', shiftData.length);
        
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
        
        renderShiftList();
    } else {
        console.error('loadShiftData: エラー:', result.error);
    }
}

async function loadUrlData() {
    const result = await apiCall('getUrlData');
    
    if (result.success) {
        urlData = result.data;
        devLog('loadUrlData: データ件数', urlData.length);
        renderUrlList();
        return result.data;
    } else {
        console.error('loadUrlData: エラー:', result.error);
        return [];
    }
}

// ===============================
// Excelアップロード
// ===============================

async function handleExcelUpload(file) {
    try {
        devLog('=== デバッグ: Excelアップロード開始 ===');
        devLog('ファイル名:', file.name);
        devLog('ファイルサイズ:', file.size, 'bytes');
        
        showLoading();
        
        // ステップ1: Excelファイルを読み込み（今日＝ファイル名先頭日で絞る／週間も同時取得）
        devLog('ステップ1: Excelファイルを読み込み中...');
        let targetISO = '';
        const fnMatch = file.name.match(/(\d{4})(\d{2})(\d{2})/);
        if (fnMatch) targetISO = fnMatch[1] + '-' + fnMatch[2] + '-' + fnMatch[3];
        const parsed = await readExcelFile(file, targetISO);
        const shiftData = parsed.today;
        devLog('ステップ1完了: 今日', shiftData.length, '人 / 週間', parsed.weekly.length, '行');
        
        if (!shiftData || shiftData.length === 0) {
            throw new Error('今日（' + (parsed.dateStr || targetISO) + '）の出勤予定データが見つかりませんでした');
        }
        
        // 日付を抽出
        const dateMatch = file.name.match(/(\d{4})(\d{2})(\d{2})/);
        if (dateMatch) {
            const [, year, month, day] = dateMatch;
            devLog('日付抽出:', year, month, day);
            currentShiftDate = `${year}年${month}月${day}日`;
            
            // ★★★ 日付表示を更新 ★★★
            const dateDisplay = document.getElementById('date-display');
            dateDisplay.textContent = `📅 ${currentShiftDate}のシフト`;
            dateDisplay.classList.add('has-date');
            
            // ★★★ 日付をスプレッドシートに保存 ★★★
            await saveShiftDate(currentShiftDate);
        }
        
        // ★★★ チェックを全リセット ★★★
        devLog('チェック状態をリセット中...');
        await resetAllChecks();
        devLog('チェック状態リセット完了');
        
        // ★★★ ステップ2: URL管理データを取得（追加） ★★★
        devLog('ステップ2: URL管理データを取得中...');
        const urlData = await loadUrlData();
        devLog('ステップ2完了: URL管理データ取得完了', urlData.length, '件');
        
        // ★★★ ステップ3: URL照合（追加） ★★★
        devLog('ステップ3: URL照合中...');
        const dataWithUrls = shiftData.map(employee => {
            // 源氏名で照合
            const urlInfo = urlData.find(u => u.name === employee.name);
            
            if (urlInfo) {
                devLog(`URL照合成功: ${employee.name} → でりどす: ${urlInfo.delidosuUrl ? 'あり' : 'なし'}, アネキャン: ${urlInfo.anecanUrl ? 'あり' : 'なし'}, 愛のしずく: ${urlInfo.ainoshizukuUrl ? 'あり' : 'なし'}`);
            } else {
                devLog(`URL照合失敗: ${employee.name} → URL管理に未登録`);
            }
            
            return {
                ...employee,
                delidosuUrl: urlInfo?.delidosuUrl || '',
                anecanUrl: urlInfo?.anecanUrl || '',
                ainoshizukuUrl: urlInfo?.ainoshizukuUrl || ''
            };
        });
        devLog('ステップ3完了: URL照合完了');
        devLog('URL付きデータ:', dataWithUrls);
        
        // ステップ4: Googleスプレッドシートにアップロード（URL情報も含む）
        devLog('ステップ4: Googleスプレッドシートにアップロード中...');
        devLog('API URL:', API_URL);
        await uploadShiftData(dataWithUrls);
        devLog('ステップ4完了: アップロード成功');
        
        // ★ ステップ4.1: 週間シフトシートにも7日ぶんを書き込む
        devLog('ステップ4.1: 週間シフトに書き込み中...', parsed.weekly.length, '行');
        await uploadWeeklyShift(parsed.weekly);
        devLog('ステップ4.1完了: 週間シフト書き込み');
        
        // ★ ステップ4.2: 週間シフトの人数を取得（明日の戦略の出勤人数に反映）
        await loadWeeklyHeadcount();
        
        // ★★★ ステップ4.5: 最終出勤日を自動更新 ★★★
        devLog('ステップ4.5: 最終出勤日を更新中...');
        const shiftNames = dataWithUrls.map(d => d.name);
        if (currentShiftDate && shiftNames.length > 0) {
            await updateLastWorkDate(shiftNames, currentShiftDate);
            devLog('ステップ4.5完了: 最終出勤日を更新しました');
        }
        
        // ステップ5: データをリロード
        await loadShiftData();
        
        hideLoading();
        // ★ 明日の戦略を読み込み（取り込んだ日付の翌日）
        await loadStrategyData();
        
        devLog('=== デバッグ: アップロード完了 ===');
        
    } catch (error) {
        console.error('Excelアップロードエラー:', error);
        hideLoading();
        alert(`エラーが発生しました: ${error.message}`);
    }
}

function readExcelFile(file, targetDate) {
    return new Promise((resolve, reject) => {
        devLog('readExcelFile: ファイル読み込み開始');
        const reader = new FileReader();
        
        reader.onload = (e) => {
            try {
                devLog('readExcelFile: FileReader onload実行');
                const data = new Uint8Array(e.target.result);
                devLog('readExcelFile: データサイズ', data.length);
                
                const workbook = XLSX.read(data, { type: 'array', cellDates: false });
                devLog('readExcelFile: ワークブック読み込み完了（シリアル値モード）');
                devLog('シート名:', workbook.SheetNames);
                
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet);
                devLog('readExcelFile: JSON変換完了、行数:', jsonData.length);
                devLog('最初の3行:', jsonData.slice(0, 3));
                
                // ★ 出勤扱い（出勤予/出勤確/受付終）
                const WORKING = ['出勤予', '出勤確', '受付終'];
                const norm = (v) => String(v == null ? '' : v).trim();
                // 日付を 'YYYY-MM-DD' に正規化（文字列/スラッシュ/Excelシリアル対応）
                const toISO = (v) => {
                    const str = norm(v);
                    const m = str.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
                    if (m) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
                    const n = Number(str);
                    if (!isNaN(n) && n > 30000 && n < 80000) {
                        const d = new Date(Math.round((n - 25569) * 86400 * 1000));
                        return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
                    }
                    return str;
                };

                // 全行を正規化
                const allRows = jsonData.map(row => ({
                    date: toISO(row['日付']),
                    name: norm(row['源氏名']),
                    inTime: norm(row['出勤時間']),
                    outTime: norm(row['退勤時間']),
                    status: norm(row['シフト状態']),
                    delidosu: norm(row['でりどす']),
                    anecan: norm(row['アネキャン']),
                    ainoshizuku: norm(row['人妻本舗愛のしずく']),
                    comment: norm(row['コメント'])
                })).filter(r => r.name);

                // 今日 = targetDate（ファイル名先頭日）がデータにあればそれ／無ければファイル内の最古日にフォールバック
                const allDates = allRows.map(r => r.date).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
                const earliest = allDates.length ? allDates[0] : '';
                const todayDate = (targetDate && allDates.indexOf(targetDate) !== -1) ? targetDate : earliest;
                devLog('readExcelFile: 今日=', todayDate, '(指定=', targetDate, '/最古=', earliest, ')');

                // ===== シフトデータ（今日の出勤者・源氏名でまとめる）=====
                const byName = {};
                const today = [];
                allRows.filter(r => r.date === todayDate && WORKING.indexOf(r.status) !== -1).forEach(r => {
                    if (!byName[r.name]) {
                        byName[r.name] = {
                            name: r.name,
                            time: formatTimeRange(r.inTime, r.outTime),
                            status: r.status,
                            delidosuName: r.delidosu,
                            anecanName: r.anecan,
                            ainoshizukuName: r.ainoshizuku
                        };
                        today.push(byName[r.name]);
                    } else {
                        // 同じ子が同じ日に複数店舗 → 店舗名をマージ
                        const exist = byName[r.name];
                        if (!exist.delidosuName && r.delidosu) exist.delidosuName = r.delidosu;
                        if (!exist.anecanName && r.anecan) exist.anecanName = r.anecan;
                        if (!exist.ainoshizukuName && r.ainoshizuku) exist.ainoshizukuName = r.ainoshizuku;
                    }
                });
                today.sort((a, b) => parseTime(a.time) - parseTime(b.time));

                // ===== 週間シフト（7日ぶんの出勤行・全部）=====
                const weekly = allRows
                    .filter(r => WORKING.indexOf(r.status) !== -1)
                    .map(r => ({
                        date: r.date, name: r.name, time: r.inTime, end: r.outTime, status: r.status,
                        delidosu: r.delidosu, anecan: r.anecan, ainoshizuku: r.ainoshizuku, comment: r.comment
                    }));

                devLog('readExcelFile: 今日' + today.length + '人 / 週間' + weekly.length + '行');
                resolve({ today: today, weekly: weekly, dateStr: todayDate });
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
    
    devLog('formatTime: 入力値 =', timeValue, '型 =', typeof timeValue);
    
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
            devLog('formatTime: ISO形式 → JST変換 =', result);
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
        devLog('formatTime: シリアル値変換 =', result);
        return result;
    }
    
    // それ以外は文字列化
    devLog('formatTime: 文字列化 =', String(timeValue));
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
    devLog(`parseTime: ${timeStr} → ${adjustedHours}:${minutes} (${totalMinutes}分)`);
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
    devLog('filterByStore:', store);
    currentStoreFilter = store;
    renderWeeklyStrip();
    
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
    devLog('filterByOkini:', level);
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


async function uploadWeeklyShift(rows) {
    try {
        devLog('uploadWeeklyShift: 送信中...', rows.length, '行');
        const response = await fetch(`${API_URL}?action=updateWeeklyShift`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ rows: rows })
        });
        const resultText = await response.text();
        const result = JSON.parse(resultText);
        if (result.success) {
            devLog('uploadWeeklyShift: 成功 -', result.message);
        } else {
            console.error('uploadWeeklyShift: APIエラー', result.error);
        }
        return result;
    } catch (error) {
        // 週間シフトの失敗は致命的ではない（シフトデータは別途成功している）ので投げない
        console.error('uploadWeeklyShift: 例外', error);
        return { success: false, error: String(error) };
    }
}

async function uploadShiftData(data) {
    try {
        devLog('uploadShiftData: リクエスト送信中...');
        devLog('送信データ件数:', data.length);
        
        // シンプルリクエストにするため、Content-Type: text/plain を使用
        const response = await fetch(`${API_URL}?action=updateShiftData`, {
            method: 'POST',
            headers: {
                'Content-Type': 'text/plain',
            },
            body: JSON.stringify({ data: data })
        });
        
        devLog('uploadShiftData: レスポンス受信');
        devLog('ステータスコード:', response.status);
        
        const resultText = await response.text();
        devLog('レスポンステキスト:', resultText);
        
        const result = JSON.parse(resultText);
        devLog('パース済みレスポンス:', result);
        
        if (result.success) {
            devLog('uploadShiftData: 成功');
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
    devLog('renderShiftList: シフトリスト描画開始');
    devLog('シフトデータ件数:', shiftData.length);
    
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
    devLog('フィルター後のデータ件数:', filteredData.length, '(店舗:', currentStoreFilter, ', オキニ:', currentOkiniFilter, ')');
    
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
                ${getAvailabilitySection(shift.name)}
            </div>
        `;
    }).join('');
    
    // 日付表示（handleExcelUpload関数で設定済みなので、ここでは何もしない）
    
    devLog('renderShiftList: 描画完了');
}

// ============================================================
// ★ 空き予告（リアルタイム）UI
// ============================================================
const RT_HOURS = (function(){var a=[];for(var h=10;h<=23;h++)a.push(('0'+h).slice(-2));for(var h=0;h<=5;h++)a.push(('0'+h).slice(-2));return a;})(); // 営業時間 10時〜翌5時
const RT_MINS  = (function(){var a=[];for(var m=0;m<60;m+=5)a.push(('0'+m).slice(-2));return a;})();
const RT_ITEM_H = 36;

// 空き予告フラグ取得（源氏名→公開範囲）
async function loadRealtimeFlags() {
    try {
        const r = await apiCall('getRealtimeFlags', {});
        if (r && r.success && r.flags) realtimeFlags = r.flags;
        if (r && r.success) setAvailLockFromServer(r.locks || {}); // ★ 60分ロック状態を取り込み
    } catch (e) {
        devLog('loadRealtimeFlags エラー: ' + (e && e.message));
    }
}

// ★ 空き予告グレーアウト（方式B）: サーバーのロック {源氏名:残り分} をクライアントのタイムスタンプに反映
//   既存のクライアント側ロック（未来のもの）は残し、サーバー値で上書き（残り時間はサーバーが正）
function setAvailLockFromServer(locks) {
    const now = Date.now();
    const merged = {};
    for (const nm in availLockUntil) {
        if (availLockUntil[nm] > now) merged[nm] = availLockUntil[nm];
    }
    for (const nm in locks) {
        const rem = Number(locks[nm]) || 0;
        if (rem > 0) merged[nm] = now + rem * 60000;
    }
    availLockUntil = merged;
}
function isAvailLocked(name) {
    const until = availLockUntil[name];
    return !!(until && until > Date.now());
}
function availLockRemainMin(name) {
    const until = availLockUntil[name];
    if (!until) return 0;
    const m = Math.ceil((until - Date.now()) / 60000);
    return m > 0 ? m : 0;
}
// ★ ロック残りの自動更新（30秒ごと・1回だけ起動）。解除されたらそのカードの空き予告だけ再描画
function startAvailLockTicker() {
    if (window.__availTickStarted) return;
    window.__availTickStarted = true;
    setInterval(function () {
        const secs = document.querySelectorAll('.availability-section[data-rt-name]');
        secs.forEach(function (sec) {
            const name = sec.getAttribute('data-rt-name');
            if (!name) return;
            const lockedNow = isAvailLocked(name);
            const wasLocked = sec.getAttribute('data-locked') === '1';
            if (lockedNow) {
                const lbl = sec.querySelector('.btn-availability.locked .lk-min');
                if (lbl) lbl.textContent = '（あと' + availLockRemainMin(name) + '分）';
            } else if (wasLocked) {
                sec.outerHTML = getAvailabilitySection(name); // ロック解除 → フル再描画
            }
        });
    }, 30000);
}

// カードに差し込む空き予告セクションのHTML
function getAvailabilitySection(name) {
    const flagsLoaded = realtimeFlags && Object.keys(realtimeFlags).length > 0;
    const scope = flagsLoaded ? (realtimeFlags[name] || '') : '';
    // フラグ未取得のうちは楽観的に有効（取得後の再描画で「なし」は無効化）
    const enabled = !flagsLoaded || (scope === '全公開' || scope === 'マイガール限定');
    const esc = String(name).replace(/'/g, "\\'");
    if (!enabled) {
        return `
                <div class="availability-section" data-rt-name="${esc}" data-locked="0">
                    <button class="btn-availability dis" disabled>🔔 空き予告</button>
                    <div class="off-note">リアルタイムOFF（空き予告列＝なし）</div>
                </div>`;
    }
    // ★ 空き予告グレーアウト（方式B）: 60分ロック中は空き予告だけグレー（本日満了は別ロックなので有効）
    if (isAvailLocked(name)) {
        const rem = availLockRemainMin(name);
        return `
                <div class="availability-section" data-rt-name="${esc}" data-locked="1">
                    <button class="btn-availability locked" disabled>🔒 空き予告<span class="lk-min">（あと${rem}分）</span></button>
                    <div class="manryo">
                        <button class="btn-manryo" onclick="doManryo('${esc}',this)">🈵 本日満了</button>
                        <div class="rt-res" hidden></div>
                    </div>
                </div>`;
    }
    return `
                <div class="availability-section" data-rt-name="${esc}" data-locked="0">
                    <button class="btn-availability" onclick="toggleAvailability(this)">🔔 空き予告</button>
                    <div class="availability-picker" hidden>
                        <div class="rt-row2">
                            <button class="btn-now" onclick="doAvailability('${esc}','',this)">今から<br>出す</button>
                            <div class="wheelwrap"><div class="wheel">
                                <div class="wcol" data-kind="hour"></div><span class="wsep">:</span><div class="wcol" data-kind="min"></div>
                                <div class="whl-bar"></div>
                            </div></div>
                        </div>
                        <div class="rt-plab">在籍3店舗にまとめて／店舗ごと5分あけて投稿</div>
                        <button class="btn-go" onclick="doAvailabilityWheel('${esc}',this)">21:30 で空き予告</button>
                        <div class="rt-res" hidden></div>
                    </div>
                    <div class="manryo">
                        <button class="btn-manryo" onclick="doManryo('${esc}',this)">🈵 本日満了</button>
                        <div class="rt-res" hidden></div>
                    </div>
                </div>`;
}

function toggleAvailability(btn) {
    const sec = btn.closest('.availability-section');
    const picker = sec.querySelector('.availability-picker');
    if (picker.hasAttribute('hidden')) {
        picker.removeAttribute('hidden');
        btn.classList.add('open');
        buildWheel(picker);
    } else {
        picker.setAttribute('hidden', '');
        btn.classList.remove('open');
    }
}

function buildWheel(picker) {
    if (picker.dataset.built) return;
    fillWheelCol(picker.querySelector('.wcol[data-kind="hour"]'), RT_HOURS, '21', picker);
    fillWheelCol(picker.querySelector('.wcol[data-kind="min"]'), RT_MINS, '30', picker);
    picker.dataset.built = '1';
    updateGoLabel(picker);
}

function fillWheelCol(col, values, def, picker) {
    let h = '<div class="wpad"></div>';
    for (let i = 0; i < values.length; i++) h += '<div class="witem">' + values[i] + '</div>';
    h += '<div class="wpad"></div>';
    col.innerHTML = h;
    const idx = Math.max(0, values.indexOf(def));
    col.scrollTop = idx * RT_ITEM_H;
    markWheelCol(col);
    let t, raf;
    col.addEventListener('scroll', function () {
        if (raf) cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () { markWheelCol(col); }); // スクロール中もハイライト追従
        clearTimeout(t);
        t = setTimeout(function () { markWheelCol(col); updateGoLabel(picker); }, 60);
    }, { passive: true });
}

function markWheelCol(col) {
    const idx = Math.round(col.scrollTop / RT_ITEM_H);
    const items = col.querySelectorAll('.witem');
    for (let i = 0; i < items.length; i++) items[i].classList.toggle('sel', i === idx);
}

function wheelVal(col) {
    const idx = Math.round(col.scrollTop / RT_ITEM_H);
    const items = col.querySelectorAll('.witem');
    return items[idx] ? items[idx].textContent : '';
}

function pickerTime(picker) {
    return wheelVal(picker.querySelector('.wcol[data-kind="hour"]')) + ':' + wheelVal(picker.querySelector('.wcol[data-kind="min"]'));
}

function updateGoLabel(picker) {
    const go = picker.querySelector('.btn-go');
    if (go) go.textContent = pickerTime(picker) + ' で空き予告';
}

function doAvailabilityWheel(name, goBtn) {
    const picker = goBtn.closest('.availability-picker');
    doAvailability(name, pickerTime(picker), goBtn);
}

// 空き予告を実行（postAvailability を呼ぶ）
async function doAvailability(name, time, btn) {
    const sec = btn.closest('.availability-section');
    const res = sec.querySelector('.rt-res');
    if (sec.dataset.busy) return;          // 連打防止
    sec.dataset.busy = '1';
    res.className = 'rt-res';
    res.textContent = '送信中…';
    res.removeAttribute('hidden');
    try {
        const r = await apiCall('postAvailability', { method: 'POST', body: { name: name, time: time } });
        if (r && r.success) {
            res.className = 'rt-res ok';
            res.textContent = '✓ ' + (r.message || '空き予告を出しました') + (r.timing ? '（' + r.timing + '）' : '');
            // ★ 投稿成功 → この子の空き予告を60分グレーアウト（UI即反映。サーバーR列も更新済み）
            availLockUntil[name] = Date.now() + 60 * 60000;
            const tgl = sec.querySelector('.btn-availability');
            if (tgl) {
                tgl.classList.add('locked');
                tgl.classList.remove('open');
                tgl.disabled = true;
                tgl.innerHTML = '🔒 空き予告<span class="lk-min">（あと60分）</span>';
            }
            sec.setAttribute('data-locked', '1');
            // ★ ピッカーを折りたたんでロック表示にする（投稿後に折りたためない問題の対策）。✓を少し見せてから再描画
            setTimeout(function () {
                if (!sec || !sec.isConnected) return;
                const mw = sec.querySelector('.manryo');
                if (mw && mw.dataset.busy) return; // 本日満了の処理中は畳まない（次の再描画で畳まれる）
                sec.outerHTML = getAvailabilitySection(name);
            }, 1800);
        } else if (r && r.locked) {
            res.className = 'rt-res warn';
            res.textContent = '⏳ ' + (r.message || 'ロック中です');
        } else {
            res.className = 'rt-res warn';
            res.textContent = '⚠️ ' + ((r && (r.message || r.error)) || '失敗しました');
        }
    } catch (e) {
        res.className = 'rt-res warn';
        res.textContent = '⚠️ 通信エラー: ' + (e && e.message);
    } finally {
        sec.dataset.busy = '';
    }
}

/**
 * ★ 本日満了（手順8）。doAvailabilityの本日満了版。
 *   時間は選ばない（次の出勤日はGAS側が週間シフトから決める）。S列の1日1回ロック。
 */
async function doManryo(name, btn) {
    // ★ 誤操作防止: 本日満了は即生成されるので確認を挟む
    if (!confirm(name + ' の「🈵 本日満了」を出します。\n\n次の出勤日を週間シフトから取得して下書きを作成します（店舗ごとに投稿）。\nよろしいですか？')) return;
    const wrap = btn.closest('.manryo');
    const res = wrap.querySelector('.rt-res');
    if (wrap.dataset.busy) return;          // 連打防止
    wrap.dataset.busy = '1';
    res.className = 'rt-res';
    res.textContent = '送信中…';
    res.removeAttribute('hidden');
    try {
        const r = await apiCall('postManryo', { method: 'POST', body: { name: name } });
        if (r && r.success) {
            res.className = 'rt-res ok';
            res.textContent = '✓ ' + (r.message || '本日満了を出しました');
        } else if (r && r.locked) {
            res.className = 'rt-res warn';
            res.textContent = '⏳ ' + (r.message || '本日はもう出せません');
        } else {
            res.className = 'rt-res warn';
            res.textContent = '⚠️ ' + ((r && (r.message || r.error)) || '失敗しました');
        }
    } catch (e) {
        res.className = 'rt-res warn';
        res.textContent = '⚠️ 通信エラー: ' + (e && e.message);
    } finally {
        wrap.dataset.busy = '';
    }
}

/**
 * ★v3.5 出勤人数カウンターを更新
 * 店舗フィルター後のデータを受け取り、出勤/当欠の人数を表示
 */
let lastShiftCount = null;  // ★カウントアップ用：前回表示した出勤人数

/**
 * 数字をカウントアップ表示するアニメーション
 * @param {HTMLElement} el - 数字を表示する要素
 * @param {number} from - 開始値
 * @param {number} to - 終了値
 */
function animateNumber(el, from, to, duration = 450) {
    if (!el) return;
    if (from === to || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.textContent = to;
        return;
    }
    const start = performance.now();
    const ease = t => 1 - Math.pow(1 - t, 3);  // easeOutCubic
    function frame(now) {
        const p = Math.min((now - start) / duration, 1);
        el.textContent = Math.round(from + (to - from) * ease(p));
        if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

function updateShiftCounter(storeFilteredData) {
    const counter = document.getElementById('shift-counter');
    if (!counter) return;
    
    if (storeFilteredData.length === 0) {
        counter.style.display = 'none';
        lastShiftCount = null;
        return;
    }
    
    const total = storeFilteredData.length;
    const touketuCount = storeFilteredData.filter(s => s.time === '当欠').length;
    const activeCount = total - touketuCount;
    
    counter.style.display = 'block';
    
    if (touketuCount > 0) {
        counter.innerHTML = 
            '<span class="count-main">出勤 <span class="count-num">' + activeCount + '</span>人</span>' +
            '<span class="count-detail">/ 元' + total + '人' +
            '（<span class="count-touketu">当欠' + touketuCount + '人</span>）</span>';
    } else {
        counter.innerHTML = 
            '<span class="count-main">出勤 <span class="count-num">' + activeCount + '</span>人</span>';
    }
    
    // ★ カウントアップアニメーション（初回は0から、人数変化時は前回値から）
    const numEl = counter.querySelector('.count-num');
    const from = (lastShiftCount === null) ? 0 : lastShiftCount;
    animateNumber(numEl, from, activeCount);
    lastShiftCount = activeCount;
}

// ===============================
// 全キャストリスト表示
// ===============================

function renderAllCastList() {
    devLog('renderAllCastList: 全キャストリスト描画開始');
    devLog('URLデータ件数:', urlData.length);
    
    const listElement = document.getElementById('all-cast-list');
    const emptyElement = document.getElementById('all-empty-state');
    
    if (!listElement) {
        console.error('all-cast-list要素が見つかりません');
        return;
    }
    
    // ★★★ 店舗フィルターを適用 ★★★
    const filteredUrlData = filterUrlDataByStore(urlData, currentStoreFilter);
    devLog('フィルター後のデータ件数:', filteredUrlData.length, '(フィルター:', currentStoreFilter, ')');
    
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
    devLog('renderAllCastList: 描画完了');
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
        devLog('saveShiftDate: 結果', result);
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
    const result = await apiCall('getShiftDate');
    
    if (result.success && result.date) {
        // ★★★ 日付をフォーマット ★★★
        currentShiftDate = formatShiftDate(result.date);
        const dateDisplay = document.getElementById('date-display');
        if (dateDisplay) {
            dateDisplay.textContent = `📅 ${currentShiftDate}のシフト`;
            dateDisplay.classList.add('has-date');
        }
    }
    
    return result;
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
        devLog('resetAllChecks: 結果', result);
        
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
    devLog('toggleStoreCheck:', name, store, isChecked);
    
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
        devLog('toggleStoreCheck: 保存結果', result);
        
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
    devLog('renderUrlList: フィルター後のデータ件数:', filteredUrlData.length, '(フィルター:', currentStoreFilter, ')');
    
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
/**
 * コアデータの再取得（更新ボタン・自動更新の共通処理）
 * 統合API（1往復・高速）を優先し、失敗時は従来の並列ロードにフォールバック
 * 戦略・掲載・商品フォームは上書きしない（入力途中の内容を守る）
 */
async function reloadCoreData() {
    const unifiedSuccess = await loadAllDataUnified({ skipForms: true });

    if (!unifiedSuccess) {
        // フォールバック：従来の並列ロード
        // ※ okiniData は loadShiftData 内で shiftData から生成されるため loadOkiniData は不要
        devLog('reloadCoreData: 統合API失敗のため並列ロードにフォールバック');
        await Promise.all([
            loadShiftDate(),
            loadShiftData(),
            loadUrlData()
        ]);
    }

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

    // ★ キャッシュも最新化（次回起動時の即時表示用）
    saveCache();

    // 最終更新時刻を表示
    updateLastRefreshTime();
}

async function refreshData() {
    const refreshBtn = document.querySelector('.refresh-btn');
    
    // ボタンを無効化
    refreshBtn.classList.add('loading');
    refreshBtn.textContent = '🔄 更新中...';
    
    try {
        await reloadCoreData();
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
        devLog('自動リロード実行:', new Date().toLocaleTimeString());
        
        try {
            await reloadCoreData();
            
            // ★★★ 自動更新時もトースト通知を表示 ★★★
            showToast('データを更新しました', 'success');
        } catch (error) {
            console.error('自動リロードエラー:', error);
            showToast('自動更新に失敗しました', 'error');
        }
    }, autoRefreshSeconds * 1000);
    
    devLog(`自動リロード開始: ${autoRefreshSeconds}秒間隔`);
}

/**
 * 自動リロードを停止
 */
function stopAutoRefresh() {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
        autoRefreshInterval = null;
        devLog('自動リロード停止');
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
    if (!refreshBtn) return;
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
async function renderInterviewList() {
    devLog('renderInterviewList: 面談リスト描画開始');
    cardIdCounter = 0;  // カウンターリセット
    // ★注意: historyCacheとopenAccordionsはクリアしない（自動更新で状態保持）
    devLog('URLデータ件数:', urlData.length);
    
    const listElement = document.getElementById('interview-list');
    const emptyElement = document.getElementById('interview-empty-state');
    
    if (!listElement) {
        console.error('interview-list要素が見つかりません');
        return;
    }
    
    // ★★★ レイアウトシフト防止: コメントキャッシュが空なら先にロード ★★★
    if (Object.keys(commentCache).length === 0) {
        listElement.innerHTML = '<div style="text-align:center; padding:60px 20px; color:var(--text-secondary, #999); font-size:0.95rem;">面談データを読み込み中...</div>';
        if (emptyElement) emptyElement.style.display = 'none';
        try {
            await loadAllLatestComments();
        } catch (e) {
            console.error('renderInterviewList: コメント読み込みエラー', e);
        }
    }
    
    // ★★★ 店舗フィルターを適用 ★★★
    let filteredUrlData = filterUrlDataByStore(urlData, currentStoreFilter);
    
    // ★★★ スタッフを除外 ★★★
    filteredUrlData = filteredUrlData.filter(cast => cast.class !== 'スタッフ');
    
    devLog('フィルター後のデータ件数:', filteredUrlData.length, '(フィルター:', currentStoreFilter, ')');
    
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
    
    // ★★★ レイアウトシフト防止: コメントは既にcommentCacheから描画済みのため、差し替え不要 ★★★
    // 省略判定を実行
    setTimeout(checkCommentOverflow, 100);
    
    // 新着コメントバーを更新
    setTimeout(renderNewCommentBar, 100);
    
    devLog('renderInterviewList: 描画完了');
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
        devLog('updateLastWorkDate: 結果', result);
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
        devLog('renderNewCommentBar: バー要素が見つかりません');
        return;
    }
    
    // ★★★ スクロール補正: 表示前の高さを記録 ★★★
    const oldHeight = bar.style.display === 'none' ? 0 : bar.offsetHeight;
    const oldScrollY = window.scrollY;
    
    const newCommentsByDate = getNewCommentsByDate();
    
    if (Object.keys(newCommentsByDate).length === 0) {
        bar.style.display = 'none';
        // ★ 非表示にする時：高さがあった分、上にスクロール補正
        if (oldHeight > 0 && oldScrollY > 0) {
            window.scrollBy(0, -oldHeight);
        }
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
    
    // ★★★ スクロール補正: 表示後の高さ変化分だけスクロール位置を補正 ★★★
    // ユーザーが最上部にいる時は補正しない（バーが自然に見えるように）
    const newHeight = bar.offsetHeight;
    const heightDiff = newHeight - oldHeight;
    if (heightDiff !== 0 && oldScrollY > 0) {
        window.scrollBy(0, heightDiff);
    }
    
    devLog('renderNewCommentBar: 新着表示完了 (oldH=' + oldHeight + ', newH=' + newHeight + ', diff=' + heightDiff + ')');
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
            devLog('scrollToInterview: カードが見つかりません', name);
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
        devLog('loadOkiniData: シフトデータから', okiniData.length, '件取得');
    } else {
        const result = await apiCall('getOkiniData');
        if (result.success) {
            okiniData = result.data;
            devLog('loadOkiniData: API経由', okiniData.length, '件取得');
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
        devLog('話したよ更新:', name, store, newTalked);
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
        devLog('当欠更新:', name, shift.time);
        showToast(isCurrentlyTouketu ? name + ' の当欠を解除しました' : name + ' を当欠にしました', 'success');
    } catch (error) {
        console.error('当欠保存エラー:', error);
        showToast('当欠の保存に失敗しました', 'error');
    }
}

// ===============================
// ★ 明日の戦略スペース
// ===============================

/**
 * currentShiftDate（取り込んだシフト日付）の翌日を「YYYY年MM月DD日」で返す
 */
function getStrategyTargetDate() {
    if (!currentShiftDate) return '';
    const m = currentShiftDate.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (!m) return '';
    const date = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    date.setDate(date.getDate() + 1);
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}年${mo}月${d}日`;
}

/**
 * 指定店舗のフォームに値をセット
 */
/**
 * 戦略の見出しを「明日（M/D）の戦略」に更新
 */
function updateStrategyTitle(targetDate) {
    const titleEl = document.getElementById('strategy-title');
    if (!titleEl) return;
    const m = targetDate ? String(targetDate).match(/(\d{4})年(\d{1,2})月(\d{1,2})日/) : null;
    if (!m) {
        titleEl.textContent = '明日の戦略';
        return;
    }
    titleEl.textContent = `明日（${Number(m[2])}/${Number(m[3])}）の戦略`;
}

// ★ 戦略の日付("2026年06月22日") → "2026-06-22"
function strategyDateToISO(jpDate) {
    const m = String(jpDate || '').match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
    if (!m) return '';
    return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
}

// ★ 明日の戦略の「出勤人数」を週間シフトの人数から自動表示（読み取り専用）
function fillStrategyCounts() {
    const targetISO = strategyDateToISO(getStrategyTargetDate());
    const day = (weeklyHeadcount || []).find(function (d) { return d.date === targetISO; });
    ['delidosu', 'anecan', 'ainoshizuku'].forEach(function (store) {
        const el = document.getElementById('strategy-' + store + '-count');
        if (!el) return;
        el.value = day ? String(day[store]) : '';
        el.readOnly = true;
    });
}

// ★ 週間シフトの人数を取得（取り込み後の再取得用）
async function loadWeeklyHeadcount() {
    const result = await apiCall('getWeeklyHeadcount');
    if (result && result.success) {
        weeklyHeadcount = result.days || [];
        fillStrategyCounts();
        renderWeeklyStrip();
    }
}

// ★ 出勤タブ：週間シフトの人数を横スライドで表示（店舗フィルタ連動）
function renderWeeklyStrip() {
    const el = document.getElementById('weekly-strip');
    if (!el) return;
    if (!weeklyHeadcount || weeklyHeadcount.length === 0) {
        el.style.display = 'none';
        el.innerHTML = '';
        return;
    }
    el.style.display = '';
    const store = currentStoreFilter;
    const storeLabel = ({ all: '全店', delidosu: 'でりどす', anecan: 'アネキャン', ainoshizuku: 'しずく' })[store] || '全店';
    const weekdays = ['日', '月', '火', '水', '木', '金', '土'];
    const todayISO = strategyDateToISO(currentShiftDate); // 取り込んだ日（今日）
    let html = '<div class="wk-head">週間人数（' + storeLabel + '）</div><div class="wk-row">';
    html += weeklyHeadcount.map(function (d) {
        const dm = String(d.date).match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
        const md = dm ? (Number(dm[2]) + '/' + Number(dm[3])) : String(d.date);
        const wd = dm ? (weekdays[new Date(Number(dm[1]), Number(dm[2]) - 1, Number(dm[3])).getDay()] || '') : '';
        const main = (store === 'all') ? d.total : (d[store] || 0);
        const sub = (store === 'all') ? ('で' + d.delidosu + '/ア' + d.anecan + '/し' + d.ainoshizuku) : '';
        const isToday = (d.date === todayISO);
        const cls = 'wk-day' + (main === 0 ? ' wk-zero' : '') + (isToday ? ' wk-today' : '')
                  + (wd === '日' ? ' wk-sun' : '') + (wd === '土' ? ' wk-sat' : '');
        return '<div class="' + cls + '">'
             + '<div class="wk-date">' + md + '<span class="wk-wd">(' + wd + ')</span></div>'
             + '<div class="wk-count">' + main + '<span class="wk-unit">人</span></div>'
             + (sub ? '<div class="wk-sub">' + sub + '</div>' : '')
             + '</div>';
    }).join('');
    html += '</div>';
    el.innerHTML = html;
}

function fillStrategyForm(storeKey, data) {
    data = data || {};
    ['chat', 'mail'].forEach((field) => {
        const el = document.getElementById(`strategy-${storeKey}-${field}`);
        if (el) {
            const v = data[field];
            el.value = (v !== undefined && v !== null) ? v : '';
        }
    });
}

/**
 * 明日の戦略を読み込んでフォームに反映
 */
async function loadStrategyData() {
    const targetDate = getStrategyTargetDate();
    if (!targetDate) {
        updateStrategyTitle('');
        return;
    }
    updateStrategyTitle(targetDate);

    const result = await apiCall('getStrategy', { query: { date: targetDate } });
    if (!result || result.success !== true) {
        devLog('loadStrategyData: 取得失敗', result);
        return;
    }
    const stores = result.stores || {};
    fillStrategyForm('delidosu', stores.delidosu);
    fillStrategyForm('anecan', stores.anecan);
    fillStrategyForm('ainoshizuku', stores.ainoshizuku);
    fillStrategyCounts();
    devLog('loadStrategyData: 読み込み完了', targetDate);
}

/**
 * 明日の戦略を保存（3店舗まとめて1回）
 */
async function saveStrategyData() {
    const targetDate = getStrategyTargetDate();
    if (!targetDate) {
        alert('シフト日付が未取得です。先にシフト（Excel）を取り込んでください。');
        return;
    }
    const btn = document.getElementById('strategy-save-btn');
    const status = document.getElementById('strategy-save-status');
    if (btn) btn.disabled = true;
    if (status) status.textContent = '保存中...';

    const getVal = (storeKey, field) => {
        const el = document.getElementById(`strategy-${storeKey}-${field}`);
        return el ? el.value : '';
    };
    const collect = (storeKey) => ({
        chat: getVal(storeKey, 'chat'),
        mail: getVal(storeKey, 'mail')
    });
    const stores = {
        delidosu: collect('delidosu'),
        anecan: collect('anecan'),
        ainoshizuku: collect('ainoshizuku')
    };

    try {
        const response = await fetch(`${API_URL}?action=saveStrategy`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ date: targetDate, stores: stores })
        });
        const result = await response.json();
        if (result && result.success) {
            if (status) {
                status.textContent = '✅ 保存しました';
                setTimeout(() => { if (status) status.textContent = ''; }, 3000);
            }
            devLog('saveStrategyData: 保存成功', targetDate);
        } else {
            if (status) status.textContent = '❌ 保存に失敗しました';
            console.error('saveStrategyData: 失敗', result);
        }
    } catch (error) {
        if (status) status.textContent = '❌ エラーが発生しました';
        console.error('saveStrategyData: 例外', error);
    } finally {
        if (btn) btn.disabled = false;
    }
}

/**
 * 店舗アコーディオンの開閉
 */
// 今日の戦略を編集不可メモとして表示
function fillTodayMemo(storeKey, data, dateMd) {
    const el = document.getElementById('strategy-today-' + storeKey);
    if (!el) return;
    el.innerHTML = '';
    data = data || {};
    const items = [['チャット', data.chat], ['メール', data.mail]].filter(function (x) { return x[1]; });
    if (items.length === 0) return;
    const head = document.createElement('div');
    head.className = 'today-memo-head';
    head.textContent = '今日' + (dateMd ? '(' + dateMd + ')' : '');
    el.appendChild(head);
    items.forEach(function (pair) {
        const row = document.createElement('div');
        row.className = 'today-memo-row';
        const label = document.createElement('span');
        label.className = 'today-memo-label';
        label.textContent = pair[0] + ': ';
        row.appendChild(label);
        row.appendChild(document.createTextNode(pair[1]));
        el.appendChild(row);
    });
}

function toggleStrategyAccordion(storeKey) {
    const el = document.getElementById('strategy-store-' + storeKey);
    if (el) el.classList.toggle('open');
}

// 明日の戦略：全体を開閉
function toggleStrategy() {
    const space = document.getElementById('strategy-space');
    if (space) space.classList.toggle('collapsed');
}

// 商品スペース：開閉
function toggleProduct() {
    const space = document.getElementById('product-space');
    if (space) space.classList.toggle('collapsed');
}


// ===============================
// ★ 商品・イベント掲載
// ===============================

/**
 * 「5/27」→「2026-05-27」（今日にいちばん近い年で補完）
 */
function mdToFullDate(md) {
    const s = String(md || '').trim();
    if (!s) return '';
    const m = s.match(/^(\d{1,2})\s*[\/／]\s*(\d{1,2})$/);
    if (!m) return s;
    const month = Number(m[1]);
    const day = Number(m[2]);
    const today = new Date();
    let best = null, bestDiff = Infinity;
    [today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1].forEach((y) => {
        const d = new Date(y, month - 1, day);
        const diff = Math.abs(d.getTime() - today.getTime());
        if (diff < bestDiff) { bestDiff = diff; best = d; }
    });
    const y = best.getFullYear();
    const mm = String(best.getMonth() + 1).padStart(2, '0');
    const dd = String(best.getDate()).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
}

/**
 * 「2026-05-27」→「5/27」（表示用）
 */
function fullDateToMd(full) {
    const m = String(full || '').match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (!m) return String(full || '');
    return `${Number(m[2])}/${Number(m[3])}`;
}

/**
 * 掲載の日付フィールド（「5/27」表示＋タップでカレンダーが開く）を生成
 */
function createPubDateField(cls, value) {
    const wrap = document.createElement('div');
    wrap.className = 'pub-date-wrap';

    const label = document.createElement('span');
    label.className = 'pub-date-label';
    label.textContent = value ? fullDateToMd(value) : '日付';

    const picker = document.createElement('input');
    picker.type = 'date';
    picker.className = 'pub-date-picker ' + cls;
    if (value) picker.value = value;
    picker.addEventListener('click', function () {
        if (typeof picker.showPicker === 'function') {
            try { picker.showPicker(); } catch (e) {}
        }
    });
    picker.addEventListener('change', function () {
        label.textContent = picker.value ? fullDateToMd(picker.value) : '日付';
    });

    wrap.appendChild(label);
    wrap.appendChild(picker);
    return wrap;
}

/**
 * 掲載1行のDOMを生成して返す
 */
function createPublicationRow(data) {
    data = data || {};
    const row = document.createElement('div');
    row.className = 'pub-row';

    const move = document.createElement('div');
    move.className = 'pub-move';
    const moveUp = document.createElement('button');
    moveUp.type = 'button';
    moveUp.className = 'pub-move-btn';
    moveUp.textContent = '▲';
    moveUp.onclick = function () { movePublicationRow(row, 'up'); };
    const moveDown = document.createElement('button');
    moveDown.type = 'button';
    moveDown.className = 'pub-move-btn';
    moveDown.textContent = '▼';
    moveDown.onclick = function () { movePublicationRow(row, 'down'); };
    move.appendChild(moveUp);
    move.appendChild(moveDown);

    const start = createPubDateField('pub-start', data.start);

    const tilde = document.createElement('span');
    tilde.className = 'pub-tilde';
    tilde.textContent = '〜';

    const end = createPubDateField('pub-end', data.end);

    const sel = document.createElement('select');
    sel.className = 'pub-category';
    const optEmpty = document.createElement('option');
    optEmpty.value = '';
    optEmpty.textContent = '（選択）';
    sel.appendChild(optEmpty);
    const cats = publicationCategories.slice();
    if (data.category && cats.indexOf(data.category) === -1) cats.push(data.category);
    cats.forEach((c) => {
        const o = document.createElement('option');
        o.value = c;
        o.textContent = c;
        sel.appendChild(o);
    });
    if (data.category) sel.value = data.category;

    const content = document.createElement('input');
    content.type = 'text';
    content.className = 'pub-content';
    content.placeholder = '内容';
    if (data.content) content.value = data.content;

    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'pub-del-btn';
    del.textContent = '✕';
    del.onclick = function () {
        if (confirm('この行を削除しますか？')) {
            row.remove();
        }
    };

    row.appendChild(move);
    row.appendChild(start);
    row.appendChild(tilde);
    row.appendChild(end);
    row.appendChild(sel);
    row.appendChild(content);
    row.appendChild(del);
    return row;
}

/**
 * 掲載一覧を描画（カテゴリ選択肢も更新）
 */
function renderPublications(items, categories) {
    if (Array.isArray(categories)) publicationCategories = categories;
    const container = document.getElementById('publication-rows');
    if (!container) return;
    container.innerHTML = '';
    const list = Array.isArray(items) ? items : [];
    if (list.length === 0) {
        container.appendChild(createPublicationRow({}));
    } else {
        list.forEach((it) => container.appendChild(createPublicationRow(it)));
    }
}

/**
 * 行を上下に移動（並べ替え）
 */
function movePublicationRow(row, dir) {
    const container = row.parentElement;
    if (!container) return;
    if (dir === 'up') {
        const prev = row.previousElementSibling;
        if (prev) container.insertBefore(row, prev);
    } else {
        const next = row.nextElementSibling;
        if (next) container.insertBefore(next, row);
    }
}

/**
 * 行を1つ追加
 */
function addPublicationRow() {
    const container = document.getElementById('publication-rows');
    if (container) container.appendChild(createPublicationRow({}));
}

/**
 * 掲載一覧を読み込み（相乗りで来なかった場合の個別取得）
 */
async function loadProductData() {
    const result = await apiCall('getProduct');
    if (!result || result.success !== true) {
        devLog('loadProductData: 取得失敗', result);
        return;
    }
    const el = document.getElementById('product-text');
    if (el) el.value = result.text || '';
}

async function saveProductData() {
    const el = document.getElementById('product-text');
    if (!el) return;
    const btn = document.getElementById('product-save-btn');
    const status = document.getElementById('product-save-status');
    if (btn) btn.disabled = true;
    if (status) status.textContent = '保存中...';
    try {
        const response = await fetch(`${API_URL}?action=saveProduct`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ text: el.value })
        });
        const result = await response.json();
        if (status) status.textContent = (result && result.success) ? '✅ 保存しました' : '❌ 保存に失敗しました';
    } catch (e) {
        if (status) status.textContent = '❌ 保存に失敗しました';
    }
    if (btn) btn.disabled = false;
    setTimeout(function () { if (status) status.textContent = ''; }, 3000);
}

async function loadPublicationsData() {
    const result = await apiCall('getPublications');
    if (!result || result.success !== true) {
        devLog('loadPublicationsData: 取得失敗', result);
        return;
    }
    renderPublications(result.items, result.categories);
}

/**
 * 掲載一覧をまとめて保存
 */
async function savePublicationsData() {
    const container = document.getElementById('publication-rows');
    if (!container) return;
    const rows = container.querySelectorAll('.pub-row');
    const items = [];
    rows.forEach((row) => {
        const start = (row.querySelector('.pub-start') || {}).value || '';
        const end = (row.querySelector('.pub-end') || {}).value || '';
        const category = (row.querySelector('.pub-category') || {}).value || '';
        const content = (row.querySelector('.pub-content') || {}).value || '';
        if (start || end || category || content) {
            items.push({ start: start, end: end, category: category, content: content });
        }
    });

    const btn = document.getElementById('pub-save-btn');
    const status = document.getElementById('pub-save-status');
    if (btn) btn.disabled = true;
    if (status) status.textContent = '保存中...';

    try {
        const response = await fetch(`${API_URL}?action=savePublications`, {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: JSON.stringify({ items: items })
        });
        const result = await response.json();
        if (result && result.success) {
            if (status) {
                status.textContent = '✅ 保存しました';
                setTimeout(() => { if (status) status.textContent = ''; }, 3000);
            }
            devLog('savePublicationsData: 保存成功', items.length, '件');
        } else {
            if (status) status.textContent = '❌ 保存に失敗しました';
            console.error('savePublicationsData: 失敗', result);
        }
    } catch (error) {
        if (status) status.textContent = '❌ エラーが発生しました';
        console.error('savePublicationsData: 例外', error);
    } finally {
        if (btn) btn.disabled = false;
    }
}


// ===============================
// ★ スマホ：下にスワイプで更新（プルトゥリフレッシュ）
// ===============================
(function setupPullToRefresh() {
    let startY = 0;
    let pulling = false;
    let refreshing = false;
    const THRESHOLD = 70;   // この距離を超えて離すと更新
    const SHOW_AT = 20;     // この距離から説明を表示

    function indicator() {
        return document.getElementById('ptr-indicator');
    }

    document.addEventListener('touchstart', function (e) {
        if (refreshing) return;
        // ページ最上部のときだけ反応
        if (window.scrollY <= 0) {
            startY = e.touches[0].clientY;
            pulling = true;
        } else {
            pulling = false;
        }
    }, { passive: true });

    document.addEventListener('touchmove', function (e) {
        if (!pulling || refreshing) return;
        const dy = e.touches[0].clientY - startY;
        const ind = indicator();
        if (!ind) return;
        if (dy > SHOW_AT && window.scrollY <= 0) {
            ind.classList.add('visible');
            ind.textContent = (dy > THRESHOLD) ? '指を離して更新' : '↓ 下に引っ張って更新';
        } else {
            ind.classList.remove('visible');
        }
    }, { passive: true });

    document.addEventListener('touchend', async function (e) {
        if (!pulling || refreshing) return;
        pulling = false;
        const dy = e.changedTouches[0].clientY - startY;
        const ind = indicator();
        if (!ind) return;
        if (dy > THRESHOLD && window.scrollY <= 0) {
            refreshing = true;
            ind.classList.add('visible');
            ind.textContent = '🔄 更新中...';
            try {
                await loadAllData();
                ind.textContent = '✅ 更新しました';
            } catch (err) {
                console.error('プルトゥリフレッシュ更新エラー:', err);
                ind.textContent = '更新に失敗しました';
            }
            setTimeout(function () {
                ind.classList.remove('visible');
                refreshing = false;
            }, 800);
        } else {
            ind.classList.remove('visible');
        }
    }, { passive: true });
})();
