// パーティクル生成
function createParticles() {
    const container = document.getElementById('particles');
    if (!container) {
        // particles要素がない場合は何もしない
        return;
    }

    const particleCount = 50;

    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';

        // ランダムなサイズと位置
        const size = Math.random() * 4 + 2;
        particle.style.width = size + 'px';
        particle.style.height = size + 'px';
        particle.style.left = Math.random() * 100 + '%';
        particle.style.animationDuration = (Math.random() * 20 + 10) + 's';
        particle.style.animationDelay = Math.random() * 20 + 's';

        container.appendChild(particle);
    }
}

// グローバル変数
let csvFiles = [];
let mergedData = [];
window.mergedData = []; // グローバルに公開
let originalFiles = [];
let previewChangesData = [];
let brandsData = null;
let groupedData = null;
let isGrouped = false;
let PRODUCT_NAME_COL = 1; // 商品名の列インデックス（初期値：B列=1、グループ化後：C列=2）
window.currentFileFormat = null; // ファイル形式の自動判定結果

/**
 * ヘッダーあり/なし、列構成を自動判定
 */
function detectFileFormat(data) {
    if (!data || data.length === 0) {
        return { hasHeader: false, columns: {}, colCount: 0 };
    }

    const firstRow = data[0];
    const colCount = firstRow.length;

    // ヘッダー判定: 1行目に日本語キーワードがあるか
    const headerKeywords = ['サイト', '商品', '価格', '落札', '出品', 'タイトル', 'URL', 'ブランド', '状態', '品番', 'コード'];
    const firstRowText = firstRow.map(cell => String(cell || '')).join(' ');
    const hasHeader = headerKeywords.some(kw => firstRowText.includes(kw));

    // 列マッピング自動判定
    let columns = {};

    if (hasHeader) {
        // ヘッダーから列を特定
        firstRow.forEach((cell, i) => {
            const cellText = String(cell || '').toLowerCase();
            if (cellText.includes('サイト')) columns.site = i;
            if (cellText.includes('タイトル') || cellText.includes('商品名')) columns.productName = i;
            if (cellText.includes('価格') || cellText.includes('落札')) columns.price = i;
            if (cellText.includes('出品日')) columns.listingDate = i;
            if (cellText.includes('取引日')) columns.soldDate = i;
            if (cellText.includes('出品者')) columns.seller = i;
            if (cellText.includes('状態')) columns.condition = i;
            if (cellText.includes('url')) columns.url = i;
            if (cellText.includes('ブランド')) columns.brand = i;
            if (cellText.includes('品番') || cellText.includes('コード')) columns.productCode = i;
        });
    } else {
        // ヘッダーなし: 列数で判定
        // 最終列が数値っぽいか確認
        const sampleRows = data.slice(0, Math.min(10, data.length));
        const lastColNumeric = sampleRows.every(row => {
            const val = row[colCount - 1];
            return !isNaN(parseFloat(val));
        });

        if (colCount === 3 && lastColNumeric) {
            // WBC系3列: ブランド / 品番 / 価格
            columns = { brand: 0, productCode: 1, price: 2 };
        } else if (colCount === 4 && lastColNumeric) {
            // WBC系4列: ブランド / 品番 / 商品名 / 価格
            columns = { brand: 0, productCode: 1, productName: 2, price: 3 };
        } else {
            // 不明: とりあえず全列そのまま
            columns = { unknown: true };
        }
    }

    console.log('[detectFileFormat]', { hasHeader, colCount, columns });
    return { hasHeader, colCount, columns };
}

// プレビュー数変更時の処理
window.updatePreviewCount = function() {
    if (groupedData && groupedData.length > 0) {
        const groupsList = document.getElementById('groupsList');
        const previewCount = document.getElementById('previewCount').value;
        const previewGroups = previewCount === 'all' ? groupedData : groupedData.slice(0, parseInt(previewCount));

        groupsList.innerHTML = previewGroups.map(group => `
            <div class="group-item-preview">
                <div class="group-name">
                    ${escapeHtml(group.baseName || group.name)}
                    <span class="group-count">(${group.count}件)</span>
                </div>
                <div class="group-members">
                    ${group.items.slice(0, 3).map(item =>
                        escapeHtml(item.name)
                    ).join('<br>')}
                    ${group.items.length > 3 ? `<br>...他${group.items.length - 3}件` : ''}
                </div>
            </div>
        `).join('');
    }
};

function reloadFilesWithEncoding(encoding) {
    csvFiles = [];
    const encodingToUse = encoding === 'auto' ? 'UTF-8' :
                         encoding === 'shift-jis' ? 'Shift-JIS' : 'UTF-8';

    let loadedCount = 0;
    originalFiles.forEach(file => {
        const reader = new FileReader();
        reader.onload = (e) => {
            let content = e.target.result;

            // UTF-8の場合、BOMを削除
            if (encodingToUse === 'UTF-8' && content.charCodeAt(0) === 0xFEFF) {
                content = content.slice(1);
            }

            csvFiles.push({
                name: file.name,
                content: content,
                size: file.size
            });

            loadedCount++;
            if (loadedCount === originalFiles.length) {
                updateFileList();
                showSuccess(`${encodingToUse}で再読み込みしました`);
            }
        };

        if (encoding === 'auto') {
            // 自動検出モード
            const testReader = new FileReader();
            testReader.onload = (e) => {
                const testContent = e.target.result;
                if (hasGarbledText(testContent)) {
                    reader.readAsText(file, 'Shift-JIS');
                } else {
                    reader.readAsText(file, 'UTF-8');
                }
            };
            testReader.readAsText(file, 'UTF-8');
        } else {
            reader.readAsText(file, encodingToUse);
        }
    });
}

// DOM要素の初期化（DOMContentLoaded後に実行）
window.addEventListener('DOMContentLoaded', () => {
    console.log('[Fusion Studio] DOMContentLoaded イベント発火');

    // パーティクル生成
    createParticles();

    // DOM要素の取得
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const similarityThreshold = document.getElementById('similarityThreshold');
    const encoding = document.getElementById('encoding');

    console.log('[Fusion Studio] DOM要素取得:', {
        uploadArea: !!uploadArea,
        fileInput: !!fileInput,
        similarityThreshold: !!similarityThreshold,
        encoding: !!encoding
    });

    // 必須要素のチェック
    if (!uploadArea || !fileInput) {
        console.error('[Fusion Studio] CSV統合モードの必須要素が見つかりません');
        return;
    }

    console.log('[Fusion Studio] イベントリスナー設定開始');

    // スライダーの値をリアルタイムで表示
    if (similarityThreshold) {
        similarityThreshold.addEventListener('input', (e) => {
            const similarityValue = document.getElementById('similarityValue');
            if (similarityValue) {
                similarityValue.textContent = e.target.value + '%';
            }
        });
    }

    // エンコーディング変更時の処理
    if (encoding) {
        encoding.addEventListener('change', (e) => {
            if (originalFiles.length > 0) {
                reloadFilesWithEncoding(e.target.value);
            }
        });
    }

    // ドラッグ&ドロップの設定
    uploadArea.addEventListener('click', () => fileInput.click());

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleFiles(e.dataTransfer.files);
    });

    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });
});

function handleFiles(files) {
    console.log('[Fusion Studio] handleFiles 呼び出し:', files.length, 'ファイル');

    const fileList = Array.from(files).filter(file =>
        file.type === 'text/csv' ||
        file.name.endsWith('.csv') ||
        file.name.endsWith('.xlsx') ||
        file.name.endsWith('.xls') ||
        file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
        file.type === 'application/vnd.ms-excel'
    );

    console.log('[Fusion Studio] フィルター後:', fileList.length, 'ファイル');

    if (fileList.length === 0) {
        showError('CSV/Excelファイルを選択してください');
        return;
    }

    // 元のFileオブジェクトを保持
    originalFiles = [...originalFiles, ...fileList];

    const encoding = document.getElementById('encoding').value;
    let filesProcessed = 0;
    const totalFiles = fileList.length;

    fileList.forEach(file => {
        // Excelファイルの場合
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target.result);
                    // 品番が日付変換されるバグを防止（raw:trueで生データを保持）
                    const workbook = XLSX.read(data, {
                        type: 'array',
                        cellDates: false,
                        cellText: false,
                        raw: true,
                        cellNF: false
                    });

                    // 最初のシートを取得
                    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];

                    // CSVに変換（rawNumbersで数値をそのまま出力）
                    const csvContent = XLSX.utils.sheet_to_csv(firstSheet, {
                        rawNumbers: true,
                        blankrows: false
                    });

                    csvFiles.push({
                        name: file.name,
                        content: csvContent,
                        size: file.size
                    });
                    updateFileList();
                    filesProcessed++;
                    if (filesProcessed === totalFiles) {
                        setTimeout(() => {
                            smoothScrollToBottom();
                        }, 100);
                    }
                } catch (error) {
                    console.error('Excel読み込みエラー:', error);
                    showError(`${file.name}の読み込みに失敗しました`);
                    filesProcessed++;
                }
            };
            reader.readAsArrayBuffer(file);
            return;
        }

        // CSVファイルの場合（既存の処理）
        if (encoding === 'auto') {
            // 自動検出モード
            const reader = new FileReader();
            reader.onload = (e) => {
                let content = e.target.result;
                
                // BOMを削除（存在する場合）
                if (content.charCodeAt(0) === 0xFEFF) {
                    content = content.slice(1);
                }
                
                // 文字化けチェック
                if (hasGarbledText(content)) {
                    // Shift-JISで再読み込み
                    const reader2 = new FileReader();
                    reader2.onload = (e2) => {
                        csvFiles.push({
                            name: file.name,
                            content: e2.target.result,
                            size: file.size
                        });
                        updateFileList();
                        filesProcessed++;
                        if (filesProcessed === totalFiles) {
                            // 全ファイル処理完了後にスクロール
                            setTimeout(() => {
                                smoothScrollToBottom();
                            }, 100);
                        }
                    };
                    reader2.readAsText(file, 'Shift-JIS');
                } else {
                    csvFiles.push({
                        name: file.name,
                        content: content,
                        size: file.size
                    });
                    updateFileList();
                    filesProcessed++;
                    if (filesProcessed === totalFiles) {
                        // 全ファイル処理完了後にスクロール
                        setTimeout(() => {
                            smoothScrollToBottom();
                        }, 100);
                    }
                }
            };
            reader.readAsText(file, 'UTF-8');
        } else {
            // 手動選択モード
            const encodingToUse = encoding === 'shift-jis' ? 'Shift-JIS' : 'UTF-8';
            const reader = new FileReader();
            reader.onload = (e) => {
                let content = e.target.result;
                
                // UTF-8の場合、BOMを削除
                if (encodingToUse === 'UTF-8' && content.charCodeAt(0) === 0xFEFF) {
                    content = content.slice(1);
                }
                
                csvFiles.push({
                    name: file.name,
                    content: content,
                    size: file.size
                });
                updateFileList();
                filesProcessed++;
                if (filesProcessed === totalFiles) {
                    // 全ファイル処理完了後にスクロール
                    setTimeout(() => {
                        smoothScrollToBottom();
                    }, 100);
                }
            };
            reader.readAsText(file, encodingToUse);
        }
    });
}

// スムーススクロール関数
function smoothScrollToBottom() {
    const duration = 800; // ミリ秒
    const start = window.pageYOffset;
    const target = document.body.scrollHeight - window.innerHeight;
    const distance = target - start;
    const startTime = performance.now();

    function scrollAnimation(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // イージング関数（ease-out-cubic）
        const easeOutCubic = 1 - Math.pow(1 - progress, 3);
        
        window.scrollTo(0, start + distance * easeOutCubic);
        
        if (progress < 1) {
            requestAnimationFrame(scrollAnimation);
        }
    }

    requestAnimationFrame(scrollAnimation);
}

function hasGarbledText(text) {
    // 文字化けの簡易チェック（制御文字や異常な文字を検出）
    const garbledPattern = /[\uFFFD\u0000-\u001F\u007F-\u009F]/;
    // ただしタブ、改行、復帰は除外
    const cleanedText = text.replace(/[\t\n\r]/g, '');
    return garbledPattern.test(cleanedText);
}

function updateFileList() {
    const fileList = document.getElementById('fileList');
    
    if (csvFiles.length === 0) {
        fileList.innerHTML = '';
        document.getElementById('optionsSection').style.display = 'none';
        document.getElementById('actionButtons').style.display = 'none';
        return;
    }

    fileList.innerHTML = csvFiles.map((file, index) => `
        <div class="file-item">
            <div class="file-name">
                <span class="file-icon">📄</span>
                <span>${file.name}</span>
                <small>(${formatFileSize(file.size)})</small>
            </div>
            <button class="remove-btn" onclick="removeFile(${index})">削除</button>
        </div>
    `).join('');

    document.getElementById('optionsSection').style.display = 'block';
    document.getElementById('actionButtons').style.display = 'flex';
}

window.removeFile = function(index) {
    csvFiles.splice(index, 1);
    originalFiles.splice(index, 1);
    updateFileList();
};

window.clearAll = function() {
    csvFiles = [];
    mergedData = [];
    window.mergedData = []; // グローバル変数もクリア
    originalFiles = [];
    groupedData = null;
    window.groupedData = null; // グローバル変数もクリア
    isGrouped = false;
    updateFileList();
    document.getElementById('previewSection').style.display = 'none';
    document.getElementById('groupCountCard').style.display = 'none';
    hideMessages();
}

function parseFusionCSV(content) {
    const lines = content.trim().split('\n');
    return lines.map(line => {
        const result = [];
        let current = '';
        let inQuotes = false;

        for (let i = 0; i < line.length; i++) {
            const char = line[i];

            if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim());
                current = '';
            } else {
                current += char;
            }
        }

        result.push(current.trim());
        return result;
    });
}

window.mergeCSV = function() {
    console.log('[Fusion Studio] mergeCSV 呼び出し, csvFiles:', csvFiles.length);

    if (csvFiles.length === 0) {
        console.warn('[Fusion Studio] CSVファイルが選択されていません');
        showError('CSVファイルを選択してください');
        return;
    }

    console.log('[Fusion Studio] 結合処理開始');
    hideMessages();
    isGrouped = false;
    groupedData = null;
    window.groupedData = null; // グローバル変数もクリア
    document.getElementById('groupCountCard').style.display = 'none';

    const mergeType = document.getElementById('mergeType').value;
    const includeHeaders = document.getElementById('includeHeaders').checked;
    const removeDuplicates = document.getElementById('removeDuplicates').checked;

    console.log('[Fusion Studio] 結合設定:', { mergeType, includeHeaders, removeDuplicates });

    try {
        console.log('[Fusion Studio] CSVパース開始');
        const parsedFiles = csvFiles.map(file => parseFusionCSV(file.content));
        console.log('[Fusion Studio] CSVパース完了:', parsedFiles.length, 'ファイル');
        console.log('[Fusion Studio] パースされた行数:', parsedFiles.map(f => f.length));

        // ファイル形式を自動判定（最初のファイルで判定）
        if (parsedFiles[0] && parsedFiles[0].length > 0) {
            const format = detectFileFormat(parsedFiles[0]);
            window.currentFileFormat = format;

            // ヘッダーありの場合、自動でチェックを入れる
            if (format.hasHeader) {
                document.getElementById('includeHeaders').checked = true;
                console.log('[Fusion Studio] ヘッダーあり自動検出: チェックボックスをONに設定');
            }
        }

        console.log('[Fusion Studio] パース結果サンプル（1ファイル目の最初の2行）:');
        if (parsedFiles[0] && parsedFiles[0][0]) {
            console.log('  行0:', typeof parsedFiles[0][0], Array.isArray(parsedFiles[0][0]));
            console.log('  行0 JSON:', JSON.stringify(parsedFiles[0][0]).substring(0, 200));
            console.log('  行0 length:', parsedFiles[0][0].length);
        }
        if (parsedFiles[0] && parsedFiles[0][1]) {
            console.log('  行1:', typeof parsedFiles[0][1], Array.isArray(parsedFiles[0][1]));
            console.log('  行1 JSON:', JSON.stringify(parsedFiles[0][1]).substring(0, 200));
        }

        if (mergeType === 'vertical') {
            console.log('[Fusion Studio] 縦結合開始');
            mergedData = [];
            window.mergedData = []; // グローバル変数もリセット

            parsedFiles.forEach((data, index) => {
                console.log(`[Fusion Studio] ファイル${index + 1}を結合中: ${data.length}行`);
                if (index === 0) {
                    mergedData = [...data];
                    window.mergedData = [...data]; // グローバル変数も更新
                } else {
                    const startIndex = includeHeaders ? 1 : 0;
                    mergedData.push(...data.slice(startIndex));
                    window.mergedData.push(...data.slice(startIndex)); // グローバル変数も更新
                }
            });
            console.log('[Fusion Studio] 縦結合完了: 合計', mergedData.length, '行');
            console.log('[Fusion Studio] 結合後サンプル（最初の2行）:');
            if (mergedData[0]) {
                console.log('  行0:', typeof mergedData[0], Array.isArray(mergedData[0]), mergedData[0]);
            }
            if (mergedData[1]) {
                console.log('  行1:', typeof mergedData[1], Array.isArray(mergedData[1]), mergedData[1]);
            }
        } else {
            // 横結合
            console.log('[Fusion Studio] 横結合開始');
            const maxRows = Math.max(...parsedFiles.map(data => data.length));
            mergedData = [];
            window.mergedData = []; // グローバル変数もリセット

            for (let i = 0; i < maxRows; i++) {
                const row = [];
                parsedFiles.forEach((data, fileIndex) => {
                    if (i < data.length) {
                        row.push(...data[i]);
                    } else {
                        // 空のセルで埋める
                        const cols = data[0] ? data[0].length : 1;
                        row.push(...Array(cols).fill(''));
                    }
                });
                mergedData.push(row);
                window.mergedData.push(row); // グローバル変数も更新
            }
            console.log('[Fusion Studio] 横結合完了: 合計', mergedData.length, '行');
        }

        // 重複削除
        if (removeDuplicates) {
            console.log('[Fusion Studio] 重複削除開始');
            const uniqueRows = new Set();
            const beforeCount = mergedData.length;
            mergedData = mergedData.filter(row => {
                const rowStr = JSON.stringify(row);
                if (uniqueRows.has(rowStr)) {
                    return false;
                }
                uniqueRows.add(rowStr);
                return true;
            });
            window.mergedData = mergedData; // グローバル変数も更新
            console.log('[Fusion Studio] 重複削除完了:', beforeCount - mergedData.length, '行削除');
        }

        // グローバル変数を最終的に更新
        window.mergedData = mergedData;

        console.log('[Fusion Studio] displayPreview呼び出し');
        console.log('[Fusion Studio] mergedData サンプル（最初の3行）:');
        mergedData.slice(0, 3).forEach((row, i) => {
            console.log(`  行${i}:`, typeof row, Array.isArray(row), row);
        });
        displayPreview();
        console.log('[Fusion Studio] displayPreview完了');

        showSuccess('CSVファイルを正常に結合しました！');
        console.log('[Fusion Studio] 成功メッセージ表示');
        
        // 結合結果プレビューまでスムーススクロール
        setTimeout(() => {
            const previewSection = document.getElementById('previewSection');
            if (previewSection) {
                const targetPosition = previewSection.getBoundingClientRect().top + window.pageYOffset - 20; // 20px余白
                smoothScrollToPosition(targetPosition);
            }
        }, 100);
    } catch (error) {
        console.error('[Fusion Studio] エラー発生:', error);
        console.error('[Fusion Studio] エラースタック:', error.stack);
        showError('結合中にエラーが発生しました: ' + error.message);
    }
    console.log('[Fusion Studio] mergeCSV関数終了');
}

// 特定の位置へのスムーススクロール関数
function smoothScrollToPosition(targetPosition) {
    const duration = 800; // ミリ秒
    const start = window.pageYOffset;
    const distance = targetPosition - start;
    const startTime = performance.now();

    function scrollAnimation(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // イージング関数（ease-out-cubic）
        const easeOutCubic = 1 - Math.pow(1 - progress, 3);
        
        window.scrollTo(0, start + distance * easeOutCubic);
        
        if (progress < 1) {
            requestAnimationFrame(scrollAnimation);
        }
    }

    requestAnimationFrame(scrollAnimation);
}

// クリーニング機能
window.showCleaningModal = function() {
    // デバッグ情報を表示
    const debugInfo = document.getElementById('debugInfo');
    if (mergedData.length > 0 && mergedData[0]) {
        debugInfo.innerHTML = `
            <strong>📊 データ情報:</strong> 
            総行数: ${mergedData.length}行、
            列数: ${mergedData[0].length}列、
            B列データ: ${mergedData[0].length >= 2 ? '存在' : '不足'}
        `;
        
        // B列のサンプルデータを表示（最初の3件）
        const samples = [];
        const includeHeaders = document.getElementById('includeHeaders').checked;
        const startRow = includeHeaders ? 1 : 0;
        
        for (let i = startRow; i < Math.min(startRow + 3, mergedData.length); i++) {
            if (mergedData[i] && mergedData[i].length > 1) {
                samples.push(mergedData[i][1]);
            }
        }
        
        if (samples.length > 0) {
            debugInfo.innerHTML += `<br><strong>B列サンプル:</strong> ${samples.join(', ')}`;
        }
    } else {
        debugInfo.innerHTML = '<strong>⚠️ データがありません</strong>';
    }
    
    document.getElementById('cleaningModal').style.display = 'block';
    document.getElementById('previewChanges').style.display = 'none';
    document.getElementById('cleaningStats').style.display = 'none';
}

window.closeCleaningModal = function() {
    document.getElementById('cleaningModal').style.display = 'none';
}

// 商品グループ化モーダル
window.showGroupingModal = function() {
    if (mergedData.length === 0) {
        showError('先にCSVを結合してください');
        return;
    }
    
    document.getElementById('groupingModal').style.display = 'block';
    document.getElementById('groupPreview').style.display = 'none';
    document.getElementById('groupingStats').style.display = 'none';
}

window.closeGroupingModal = function() {
    document.getElementById('groupingModal').style.display = 'none';
}

// 一般的すぎるカテゴリ名（これだけでグループ化しない）
const genericCategoryWords = [
    // アウター系
    'コート', 'ジャケット', 'ダウン', 'ブルゾン', 'パーカー', 'アウター',
    'カーディガン', 'ベスト', 'ガウン', 'ポンチョ', 'ケープ',
    'coat', 'jacket', 'down', 'blouson', 'parka', 'outer', 'cardigan', 'vest',
    // トップス系
    'シャツ', 'ブラウス', 'ニット', 'セーター', 'カットソー', 'Tシャツ',
    'タンクトップ', 'キャミソール', 'チュニック', 'トップス',
    'shirt', 'blouse', 'knit', 'sweater', 'tops', 'tank',
    // ボトムス系
    'パンツ', 'スカート', 'ジーンズ', 'デニム', 'ショーツ', 'スラックス',
    'チノ', 'ボトムス', 'ボトム',
    'pants', 'skirt', 'jeans', 'denim', 'shorts', 'slacks', 'bottoms',
    // ワンピース系
    'ワンピース', 'ドレス', 'オールインワン', 'サロペット',
    'dress', 'onepiece',
    // バッグ系
    'バッグ', 'トート', 'ショルダー', 'クラッチ', 'リュック', 'ポーチ',
    'bag', 'tote', 'shoulder', 'clutch', 'backpack', 'pouch',
    // 靴系
    'シューズ', 'パンプス', 'サンダル', 'ブーツ', 'スニーカー', 'ローファー',
    'shoes', 'pumps', 'sandals', 'boots', 'sneakers', 'loafers',
    // その他
    '小物', 'アクセサリー', 'ストール', 'スカーフ', 'マフラー',
    'accessory', 'stole', 'scarf', 'muffler'
];

// 商品名のベース部分を抽出する関数
function extractBaseName(productName, options = {}) {
    if (!productName) return '';

    let baseName = productName;

    // 色の除去
    if (options.ignoreColors) {
        const colors = [
            // 英語
            'Black', 'Navy', 'Gray', 'Grey', 'Beige', 'White', 'Brown', 'Khaki',
            'Blue', 'Red', 'Green', 'Pink', 'Yellow', 'Orange', 'Purple', 'Ivory',
            'Charcoal', 'Olive', 'Wine', 'Burgundy', 'Cream', 'Camel', 'Silver', 'Gold',
            // 日本語（カタカナ）
            'ブラック', 'ネイビー', 'グレー', 'グレイ', 'ベージュ', 'ホワイト',
            'ブラウン', 'カーキ', 'ブルー', 'レッド', 'グリーン', 'ピンク',
            'イエロー', 'オレンジ', 'パープル', 'アイボリー', 'チャコール',
            'オリーブ', 'ワイン', 'バーガンディ', 'クリーム', 'キャメル',
            'シルバー', 'ゴールド', 'マルチ',
            // 漢字
            '黒', '紺', '灰', '白', '茶', '赤', '青', '緑', '黄', '橙', '紫',
            // 略号
            'BLK', 'NVY', 'GRY', 'BEG', 'BRN', 'WHT'
        ];

        colors.forEach(color => {
            // 日本語対応：前後に区切り文字がある場合のみ削除
            const separators = '[\\s\\-_/・,、。:：;；\\(\\)（）\\[\\]［］{}【】「」『』]';
            const regex = new RegExp(`(^|${separators})${color}(?:色|系)?(?=${separators}|$)`, 'gi');
            baseName = baseName.replace(regex, '$1');
        });

        // 念のため、残った色名も全体置換
        colors.forEach(color => {
            baseName = baseName.replace(new RegExp(color, 'gi'), '');
        });
    }
    
    // サイズの除去
    if (options.ignoreSizes) {
        const sizes = [
            'XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL',
            'Free Size', 'F', 'ONE SIZE', 'OS',
            '36', '38', '40', '42', '44', '46', '48',
            'フリーサイズ', 'フリー'
        ];
        
        sizes.forEach(size => {
            const regex = new RegExp(`\\b${size}\\b`, 'gi');
            baseName = baseName.replace(regex, '');
        });
    }
    
    // 年代の除去
    if (options.ignoreYears) {
        // 2000-2099年の表記を削除
        baseName = baseName.replace(/\b20\d{2}\b/g, '');
        // 90s, 00s等の表記を削除
        baseName = baseName.replace(/\b\d{2}s\b/gi, '');
        // AW23, SS24等のシーズン表記を削除
        baseName = baseName.replace(/\b(AW|SS|FW)\d{2}\b/gi, '');
    }

    // 商品コードパターンを除去（例：22-020-220-6070, 14-020-220-7230）
    baseName = baseName.replace(/\b\d{2,}-\d{2,}-\d{2,}-\d{2,}\b/g, '');
    baseName = baseName.replace(/\b\d{2,}-\d{2,}-\d{2,}\b/g, '');

    // 末尾ノイズの除去
    baseName = baseName.replace(/\s*品\s*$/, '');  // 末尾の「品」
    baseName = baseName.replace(/\s*新品\s*$/, '');  // 末尾の「新品」
    baseName = baseName.replace(/\s*美品\s*$/, '');  // 末尾の「美品」
    baseName = baseName.replace(/\s*中古\s*$/, '');  // 末尾の「中古」

    // 余分なスペースを整理
    baseName = baseName.replace(/\s+/g, ' ').trim();

    return baseName;
}

// 文字列の類似度を計算（レーベンシュタイン距離ベース）
function calculateSimilarity(str1, str2) {
    const len1 = str1.length;
    const len2 = str2.length;
    const matrix = [];

    // 空文字列の場合
    if (len1 === 0) return len2 === 0 ? 100 : 0;
    if (len2 === 0) return 0;

    // 初期化
    for (let i = 0; i <= len2; i++) {
        matrix[i] = [i];
    }
    for (let j = 0; j <= len1; j++) {
        matrix[0][j] = j;
    }

    // 計算
    for (let i = 1; i <= len2; i++) {
        for (let j = 1; j <= len1; j++) {
            if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // 置換
                    matrix[i][j - 1] + 1,     // 挿入
                    matrix[i - 1][j] + 1      // 削除
                );
            }
        }
    }

    const distance = matrix[len2][len1];
    const maxLen = Math.max(len1, len2);
    return Math.round(((maxLen - distance) / maxLen) * 100);
}

// グループ化のプレビュー
window.previewGrouping = function() {
    const includeHeaders = document.getElementById('includeHeaders').checked;
    const startRow = includeHeaders ? 1 : 0;
    const threshold = parseInt(document.getElementById('similarityThreshold').value);
    const useProductCode = document.getElementById('useProductCode').checked;

    const options = {
        ignoreColors: document.getElementById('ignoreColors').checked,
        ignoreSizes: document.getElementById('ignoreSizes').checked,
        ignoreYears: document.getElementById('ignoreYears').checked
    };

    // 商品コードのみでグループ化する場合
    if (useProductCode) {
        previewProductCodeGrouping();
        return;
    }

    // グループ化処理
    const groups = {};
    const processed = new Set();
    
    for (let i = startRow; i < mergedData.length; i++) {
        if (processed.has(i)) continue;
        if (!mergedData[i] || mergedData[i].length < 2) continue;
        
        const productName = mergedData[i][1];
        const baseName = extractBaseName(productName, options);
        
        if (!baseName) continue;
        
        // 一般的なカテゴリ名だけの場合はグループ化をスキップ
        const isGenericOnly = genericCategoryWords.some(word =>
            baseName.toLowerCase() === word.toLowerCase() ||
            baseName.toLowerCase() === word.toLowerCase() + 's'
        );

        if (isGenericOnly) {
            // 一般的なカテゴリ名のみの場合は元の商品名でグループ化
            groups[productName] = {
                baseName: productName,
                items: [{
                    index: i,
                    name: productName,
                    row: mergedData[i]
                }]
            };
            processed.add(i);
            continue;
        }

        // 既存のグループを探す
        let foundGroup = null;
        for (const groupName in groups) {
            const groupBase = extractBaseName(groupName, options);

            // 両方が一般的なカテゴリ名だけの場合はスキップ
            const groupIsGeneric = genericCategoryWords.some(word =>
                groupBase.toLowerCase() === word.toLowerCase() ||
                groupBase.toLowerCase() === word.toLowerCase() + 's'
            );
            if (groupIsGeneric) continue;

            const similarity = calculateSimilarity(baseName, groupBase);

            if (similarity >= threshold) {
                foundGroup = groupName;
                break;
            }
        }
        
        if (foundGroup) {
            groups[foundGroup].items.push({
                index: i,
                name: productName,
                row: mergedData[i]
            });
        } else {
            // 新しいグループを作成
            groups[productName] = {
                baseName: baseName,
                items: [{
                    index: i,
                    name: productName,
                    row: mergedData[i]
                }]
            };
        }
        
        processed.add(i);
    }
    
    // グループを配列に変換してソート
    const groupArray = Object.entries(groups).map(([name, data]) => ({
        name: name,
        baseName: data.baseName,
        items: data.items,
        count: data.items.length
    }));
    
    const sortOrder = document.getElementById('sortOrder').value;
    if (sortOrder === 'count') {
        groupArray.sort((a, b) => b.count - a.count);
    } else if (sortOrder === 'name') {
        groupArray.sort((a, b) => a.name.localeCompare(b.name));
    }
    
    // プレビュー表示（共通関数を使用）
    displayGroupingPreview(groupArray);
}

/**
 * グループ内の商品から代表名（最頻出文字列）を抽出
 */
function deriveGroupName(group, options = {}) {
    const brands = window.BRANDS_DATA || brandsData || null;
    const freq = new Map();
    const wordFreq = new Map();

    // 各商品のクリーニング済みベース名を収集
    for (const item of group.items) {
        let name = item.name || '';
        const brand = (item.row && item.row[0]) ? item.row[0] : '';

        // ブランド名を除去
        if (brands && brand && brands[brand]) {
            const variations = brands[brand];
            variations.forEach(variation => {
                const regex = new RegExp(variation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                name = name.replace(regex, '');
            });
        }

        // 軽めのクリーニング
        name = lightCleanProductName(name);

        // 色・サイズ・年代を除去してベース名化
        let baseName = extractBaseName(name, options);
        baseName = baseName.replace(/\s+/g, ' ').trim();

        if (!baseName || baseName.length < 3) continue;

        // 完全一致の頻度カウント
        const currentCount = freq.get(baseName) || 0;
        freq.set(baseName, currentCount + 1);

        // 単語レベルの頻度カウント（商品コードっぽいものは除外）
        const words = baseName.split(/\s+/).filter(word => {
            if (word.length <= 2) return false;
            // 商品コードパターンを除外（数字-数字-数字-数字 など）
            if (/^\d{2,}-\d{2,}-\d{2,}/.test(word)) return false;
            // 数字とハイフンだけの文字列を除外
            if (/^[\d\-]+$/.test(word)) return false;
            return true;
        });
        words.forEach(word => {
            const wordCount = wordFreq.get(word) || 0;
            wordFreq.set(word, wordCount + 1);
        });
    }

    // 1) 完全一致から最適候補を選択
    if (freq.size > 0) {
        const sorted = [...freq.entries()].sort((a, b) => {
            if (b[1] !== a[1]) return b[1] - a[1];
            if (b[0].length !== a[0].length) return b[0].length - a[0].length;
            return a[0].localeCompare(b[0]);
        });

        const [representativeName, frequency] = sorted[0];
        const adoptionRate = frequency / group.items.length;

        if (frequency >= 2 && adoptionRate >= 0.4) {
            return representativeName;
        } else if (group.items.length === 1) {
            return representativeName;
        }
    }

    // 2) 単語レベルでの組み合わせ生成
    if (wordFreq.size > 0) {
        const sortedWords = [...wordFreq.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 2)
            .map(([word]) => word);
        return sortedWords.join(' ');
    }

    // 3) フォールバック
    const fallback = (group.baseName || group.name || '未分類')
        .replace(/[^\w\s\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]/g, '')
        .trim();
    return fallback || '未分類';
}

/**
 * 軽めのクリーニング関数
 */
function lightCleanProductName(text) {
    if (!text || typeof text !== 'string') return text;

    let cleaned = text;
    cleaned = cleaned.replace(/[様さま]専用/g, '');
    cleaned = cleaned.replace(/¥[\d,，\s]+/g, '');
    cleaned = cleaned.replace(/[\d,，]+円/g, '');
    cleaned = cleaned.replace(/送料[無込][料み]?/g, '');
    cleaned = cleaned.replace(/[★☆♪◆◇■□●○▲△▼▽]/g, '');
    cleaned = cleaned.replace(/【[^】]*】/g, '');
    cleaned = cleaned.replace(/\([^)]*\)/g, '');
    cleaned = cleaned.replace(/（[^）]*）/g, '');
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
}

/**
 * 商品名を色・サイズ順でソート
 */
function sortItemsByColorSize(nameA, nameB) {
    const colorOrder = [
        'Black', 'ブラック', '黒',
        'Navy', 'ネイビー', '紺',
        'Gray', 'Grey', 'グレー', '灰',
        'Brown', 'ブラウン', '茶',
        'Beige', 'ベージュ',
        'White', 'ホワイト', '白'
    ];

    const sizeOrder = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', '36', '38', '40', '42', '44'];

    // 色での優先順位チェック
    for (const color of colorOrder) {
        const aHasColor = nameA.toLowerCase().includes(color.toLowerCase());
        const bHasColor = nameB.toLowerCase().includes(color.toLowerCase());
        if (aHasColor && !bHasColor) return -1;
        if (!aHasColor && bHasColor) return 1;
    }

    // サイズでの優先順位チェック
    for (const size of sizeOrder) {
        const aHasSize = nameA.includes(size);
        const bHasSize = nameB.includes(size);
        if (aHasSize && !bHasSize) return -1;
        if (!aHasSize && bHasSize) return 1;
    }

    return nameA.localeCompare(nameB);
}

// グループ化を適用（B列挿入版）
window.applyGrouping = function() {
    if (!groupedData || groupedData.length === 0) {
        showError('先にプレビューを実行してください');
        return;
    }

    const includeHeaders = document.getElementById('includeHeaders').checked;
    const newData = [];

    // オプション設定
    const options = {
        ignoreColors: document.getElementById('ignoreColors').checked,
        ignoreSizes: document.getElementById('ignoreSizes').checked,
        ignoreYears: document.getElementById('ignoreYears').checked
    };

    console.log(`📦 ${groupedData.length}グループのB列挿入処理を開始...`);

    // ヘッダー行の処理（B列にグループ名を挿入）
    if (includeHeaders && mergedData[0]) {
        const newHeader = [...mergedData[0]]; // 元のヘッダーをコピー
        newHeader.splice(1, 0, 'グループ名'); // インデックス1（B列）に挿入
        newData.push(newHeader);
        console.log('✅ ヘッダー行を更新:', newHeader);
    }

    // 各グループの代表名を事前計算
    groupedData.forEach(group => {
        const groupName = deriveGroupName(group, options);
        group.representativeName = groupName;
        console.log(`📦 グループ: "${groupName}" (${group.items.length}件)`);
    });

    // グループごとにデータを再配置
    groupedData.forEach((group, groupIndex) => {
        const groupName = group.representativeName;

        // グループ内でソート（色・サイズ順）
        const sortedItems = group.items.sort((a, b) => {
            return sortItemsByColorSize(a.name, b.name);
        });

        // グループのアイテムを追加
        sortedItems.forEach(item => {
            const newRow = [...item.row]; // 元データを完全にコピー

            // インデックス1（B列）にグループ名を挿入
            newRow.splice(1, 0, groupName);

            newData.push(newRow);
        });
    });

    // 結果を適用
    mergedData = newData;
    window.mergedData = newData;
    isGrouped = true;
    window.groupedData = groupedData;

    // 重要：商品名の列インデックスを更新（B列→C列にシフト）
    PRODUCT_NAME_COL = 2;

    // プレビューを更新
    displayPreview();

    // 統計更新
    const totalRows = newData.length;
    document.getElementById('rowCount').textContent = totalRows;
    document.getElementById('colCount').textContent = newData[0] ? newData[0].length : 0;
    document.getElementById('groupCount').textContent = groupedData.length;
    document.getElementById('groupCountCard').style.display = 'block';

    closeGroupingModal();
    showSuccess(`B列にグループ名を挿入しました！${groupedData.length}個のグループ、総${totalRows}行`);

    // 集計ボタンを表示
    document.getElementById('summaryBtn').style.display = 'inline-block';
}

/**
 * 価格列を検出する関数（シンプル版）
 */
function detectPriceColumn(headerRow) {
    // ヘッダーから「落札価格」列を探す
    if (headerRow && Array.isArray(headerRow)) {
        for (let i = 0; i < headerRow.length; i++) {
            const cellContent = (headerRow[i] || '').toString();
            if (cellContent.includes('落札価格') || cellContent.includes('価格')) {
                console.log(`💰 価格列検出: ${headerRow[i]} (列${i + 1})`);
                return i;
            }
        }
    }

    // 2) サンプルデータから推定
    const includeHeaders = document.getElementById('includeHeaders').checked;
    const startRow = includeHeaders ? 1 : 0;
    const sampleSize = Math.min(50, mergedData.length - startRow);
    const sampleRows = mergedData.slice(startRow, startRow + sampleSize);

    if (sampleRows.length === 0) return -1;

    const isAfterGrouping = headerRow && headerRow[1] === 'グループ名';
    const columnCount = mergedData[0] ? mergedData[0].length : 0;
    let bestColumn = -1;
    let bestScore = -Infinity;

    // 各列のスコアを計算
    for (let col = 0; col < columnCount; col++) {
        let score = 0;
        let validCount = 0;
        let priceHits = 0;
        let textHits = 0;

        // グループ化後の列を大幅減点（商品名・グループ名を避ける）
        if (isAfterGrouping && col <= 2) {
            score -= 10; // 大幅減点
        }

        const sampleValues = [];

        for (const row of sampleRows) {
            if (!row || row.length <= col) continue;
            const cellContent = row[col];
            if (cellContent == null || cellContent === '') continue;

            const cellStr = cellContent.toString();
            sampleValues.push(cellStr.substring(0, 20) + '...');

            // 価格らしさの判定
            const hasCurrencySymbol = /[¥￥]/.test(cellStr);
            const hasYenSuffix = /円/.test(cellStr);
            const hasNumbers = /\d/.test(cellStr);
            const hasComma = /[,，]/.test(cellStr);
            const hasAlpha = /[A-Za-zぁ-んァ-ン一-龥]/.test(cellStr);

            // 価格っぽいパターンに加点
            if (hasCurrencySymbol || hasYenSuffix) score += 5;
            if (hasNumbers && hasComma) score += 3;
            if (hasNumbers && !hasAlpha) score += 2;

            // 文字が多い場合は減点（商品名の可能性）
            if (hasAlpha && cellStr.length > 10) score -= 2;

            const numericValue = parsePrice(cellStr);
            if (!isNaN(numericValue) && numericValue >= 1000 && numericValue < 1000000) {
                priceHits++;
                score += 3;
            }

            if (hasAlpha) textHits++;
            validCount++;
        }

        // 最終スコア計算
        if (validCount > 0) {
            const priceRatio = priceHits / validCount;
            const textRatio = textHits / validCount;

            score += priceRatio * 10; // 有効価格比率で大幅加点
            score -= textRatio * 5;   // テキスト比率で減点

            console.log(`   列${String.fromCharCode('A'.charCodeAt(0) + col)}: スコア${score.toFixed(2)}, 価格率${Math.round(priceRatio * 100)}%, サンプル: [${sampleValues.slice(0, 2).join(', ')}]`);

            if (score > bestScore) {
                bestScore = score;
                bestColumn = col;
            }
        }
    }

    // 見つからない場合は5列目（インデックス4）を使用
    console.log('💰 価格列をデフォルト指定: 列5（落札価格）');
    return 4; // 0ベースインデックスで4 = 5列目
}

/**
 * 価格文字列を数値に変換（シンプル版）
 */
function parsePrice(value) {
    if (value == null || value === '') return NaN;

    // 落札価格列は既に数値なので、そのまま数値変換
    const num = parseFloat(value);

    // 妥当な価格範囲のみチェック
    if (!isNaN(num) && num >= 1000 && num < 10000000) {
        return num;
    }

    return NaN;
}

/**
 * グループ内で最も多いブランド名を取得
 */
function getMostFrequentBrand(items) {
    const brandFreq = new Map();

    items.forEach(item => {
        const brand = (item.row && item.row[0]) ? item.row[0].toString().trim() : '';
        if (brand) {
            brandFreq.set(brand, (brandFreq.get(brand) || 0) + 1);
        }
    });

    if (brandFreq.size === 0) return '';

    return [...brandFreq.entries()]
        .sort((a, b) => {
            if (b[1] !== a[1]) return b[1] - a[1];
            return a[0].localeCompare(b[0]);
        })[0][0];
}

/**
 * グループ内の価格統計を計算
 */
function calculatePriceStatistics(items, priceColumnIndex) {
    const prices = [];
    const priceFreq = new Map();

    // 価格データを収集
    items.forEach(item => {
        if (item.row && item.row.length > priceColumnIndex) {
            const priceValue = parsePrice(item.row[priceColumnIndex]);
            if (!isNaN(priceValue) && priceValue > 0 && priceValue < 10000000) {
                prices.push(priceValue);

                // 1000円単位に丸める（四捨五入）
                const roundedPrice = Math.round(priceValue / 1000) * 1000;
                priceFreq.set(roundedPrice, (priceFreq.get(roundedPrice) || 0) + 1);
            }
        }
    });

    if (prices.length === 0) {
        return {
            mode: 0,
            average: 0,
            range: '',
            confidence: 0
        };
    }

    // 最頻値を計算
    let maxCount = 0;
    let modePrice = 0;

    for (const [price, count] of priceFreq.entries()) {
        if (count > maxCount) {
            maxCount = count;
            modePrice = price;
        }
    }

    // その他の統計値
    const average = Math.round(prices.reduce((sum, price) => sum + price, 0) / prices.length);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    const range = `¥${minPrice.toLocaleString()}〜¥${maxPrice.toLocaleString()}`;
    const confidence = Math.round((maxCount / prices.length) * 100);

    return {
        mode: modePrice,
        average: average,
        range: range,
        confidence: confidence
    };
}

/**
 * 価格データの広がりに応じて適切な刻み幅を決定
 */
function choosePriceStep(prices) {
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const span = max - min;

    if (span <= 20000) return 1000;      // 2万円以下：1,000円刻み
    if (span <= 100000) return 5000;     // 10万円以下：5,000円刻み
    if (span <= 300000) return 10000;    // 30万円以下：10,000円刻み
    return 50000;                        // それ以上：50,000円刻み
}

/**
 * 価格を¥記号付きでフォーマット
 */
function formatYen(n) {
    return '¥' + Math.round(n).toLocaleString();
}

/**
 * 価格分布のヒストグラムを生成
 */
function buildPriceHistogram(prices, maxBinsToShow = 8) {
    if (!prices || prices.length === 0) return '分布なし';

    // 価格差が小さい場合は単一価格として扱う
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);
    if (maxPrice - minPrice < 2000) {
        return '単一価格帯';
    }

    const step = choosePriceStep(prices);
    const bins = new Map();

    // 各価格をレンジに分類
    prices.forEach(p => {
        const binStart = Math.floor(p / step) * step;
        bins.set(binStart, (bins.get(binStart) || 0) + 1);
    });

    // レンジを昇順でソート
    const allBinsSorted = [...bins.entries()].sort((a, b) => a[0] - b[0]);

    let binsToShow;
    if (allBinsSorted.length <= maxBinsToShow) {
        binsToShow = allBinsSorted;
    } else {
        // 多すぎる場合は件数上位を抜粋
        const topByCount = [...bins.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, maxBinsToShow)
            .sort((a, b) => a[0] - b[0]);
        binsToShow = topByCount;
    }

    // 分布の特徴を判定
    const distributionType = analyzeDistributionPattern(binsToShow, allBinsSorted.length);

    // レンジ表示を生成
    const parts = binsToShow.map(([start, cnt]) => {
        const end = start + step - 1;
        return `${formatYen(start)}〜${formatYen(end)}:${cnt}件`;
    });

    if (allBinsSorted.length > binsToShow.length) {
        parts.push(`他${allBinsSorted.length - binsToShow.length}レンジ`);
    }

    return `${distributionType} | ${parts.join(' | ')}`;
}

/**
 * 分布パターンを分析
 */
function analyzeDistributionPattern(binsToShow, totalBins) {
    if (totalBins <= 2) return '集中型';

    const counts = binsToShow.map(([, count]) => count);
    const maxCount = Math.max(...counts);
    const maxIndex = counts.indexOf(maxCount);

    // 分布の偏りを判定
    if (maxIndex === 0) {
        return '低価格寄り';
    } else if (maxIndex === counts.length - 1) {
        return '高価格寄り';
    } else if (counts.length >= 3 && maxIndex === Math.floor(counts.length / 2)) {
        return '中央集中';
    } else {
        // 分散度を計算
        const avg = counts.reduce((sum, val) => sum + val, 0) / counts.length;
        const variance = counts.reduce((sum, val) => sum + Math.pow(val - avg, 2), 0) / counts.length;
        return variance > avg * 0.5 ? '分散型' : '均等型';
    }
}

/**
 * グループを集計して1行にまとめる（価格分布対応版）
 */
window.generateGroupSummary = function() {
    if (!isGrouped || !groupedData || groupedData.length === 0) {
        showError('先に商品グループ化を実行してください');
        return;
    }

    showSuccess('グループ集計を開始します...');

    // 現在のテーブルのヘッダーから価格列を特定
    const headerRow = mergedData[0];
    const includeHeaders = document.getElementById('includeHeaders').checked;
    let priceCol = -1;

    // 価格列を検索（優先順位：価格、落札価格、平均価格など）
    for (let i = 0; i < headerRow.length; i++) {
        const colName = (headerRow[i] || '').toString().toLowerCase();
        if (colName.includes('価格') || colName.includes('price')) {
            priceCol = i;
            break;
        }
    }

    // ヘッダーから見つからない場合、データから価格列を推定
    if (priceCol === -1) {
        const colCount = headerRow.length;
        const startRow = includeHeaders ? 1 : 0;
        const sampleSize = Math.min(20, mergedData.length - startRow);

        // 各列の数値スコアを計算
        const colScores = [];
        for (let col = 0; col < colCount; col++) {
            let numericCount = 0;
            let priceRangeCount = 0;

            for (let i = startRow; i < startRow + sampleSize && i < mergedData.length; i++) {
                const row = mergedData[i];
                if (!row || row.length <= col) continue;

                const cellStr = (row[col] || '').toString().replace(/[¥,円]/g, '').trim();
                const num = parseFloat(cellStr);

                if (!isNaN(num)) {
                    numericCount++;
                    // 価格らしい範囲（100〜10000000）
                    if (num >= 100 && num <= 10000000) {
                        priceRangeCount++;
                    }
                }
            }

            colScores.push({
                col: col,
                numericCount: numericCount,
                priceRangeCount: priceRangeCount,
                score: priceRangeCount * 2 + numericCount
            });
        }

        // スコアが最も高い列を価格列とする（ただしA列とB列は除外）
        const candidates = colScores
            .filter(c => c.col >= 2 && c.priceRangeCount > 0)
            .sort((a, b) => b.score - a.score);

        if (candidates.length > 0) {
            priceCol = candidates[0].col;
            console.log('🔍 価格列を推定:', candidates);
        } else {
            // フォールバック：最後の列を使用
            priceCol = colCount - 1;
            console.log('⚠️ 価格列が見つからないため最終列を使用:', priceCol);
        }
    }

    console.log(`💰 価格列: ${headerRow[priceCol]} (列${priceCol}: ${String.fromCharCode(65 + priceCol)}列)`);

    const summaryData = [];
    summaryData.push(['ブランド', 'グループ名', '件数', '最頻値価格', '商品コード', '価格帯', '追加日時']);

    // 各グループを処理
    groupedData.forEach(group => {
        const prices = [];
        let brandName = '';

        // 現在のテーブルから価格を直接取得
        for (let i = 1; i < mergedData.length; i++) { // ヘッダーをスキップ
            const row = mergedData[i];
            if (row[1] === group.representativeName) { // グループ名で一致確認
                // 価格列から数値を取得（¥記号やカンマを除去）
                const priceStr = (row[priceCol] || '').toString().replace(/[¥,円]/g, '').trim();
                const price = parseFloat(priceStr);
                if (!isNaN(price) && price > 0) {  // 0より大きければOK（1000円未満も含める）
                    prices.push(price);
                }
                if (!brandName && row[0]) {
                    brandName = row[0];
                }
            }
        }

        // 価格が見つかった場合の処理
        if (prices.length > 0) {
            // 統計計算
            const avgPrice = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
            const minPrice = Math.min(...prices);
            const maxPrice = Math.max(...prices);

            // 最頻値（1000円単位）
            const priceFreq = {};
            prices.forEach(price => {
                const rounded = Math.round(price / 1000) * 1000;
                priceFreq[rounded] = (priceFreq[rounded] || 0) + 1;
            });

            let modePrice = 0;
            let maxCount = 0;
            Object.entries(priceFreq).forEach(([price, count]) => {
                if (count > maxCount) {
                    maxCount = count;
                    modePrice = parseInt(price);
                }
            });

            // 価格分布を計算
            const priceDistribution = buildPriceHistogram(prices);

            summaryData.push([
                brandName || '',
                group.representativeName,
                `${prices.length}件`,
                modePrice > 0 ? `¥${modePrice.toLocaleString()}` : '価格不明',
                group.representativeName,  // 商品コード = グループ名
                `¥${minPrice.toLocaleString()}〜¥${maxPrice.toLocaleString()}`,
                new Date().toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
            ]);
        } else {
            // 価格が見つからない場合でもグループは出力
            summaryData.push([
                brandName || '',
                group.representativeName,
                `${group.count}件`,
                '価格不明',
                group.representativeName,  // 商品コード = グループ名
                '価格不明',
                new Date().toLocaleString('ja-JP', { year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' })
            ]);
        }
    });

    // 件数多い順にソート（ヘッダーを除く）
    const header = summaryData.shift();
    summaryData.sort((a, b) => {
        // 件数列（3列目 = インデックス2）から数値を抽出して比較
        const countA = parseInt((a[2] || '').toString().replace(/[^0-9]/g, '')) || 0;
        const countB = parseInt((b[2] || '').toString().replace(/[^0-9]/g, '')) || 0;
        return countB - countA; // 降順（多い順）
    });
    summaryData.unshift(header);

    // 結果をmergedDataに適用
    mergedData = summaryData;
    window.mergedData = summaryData;

    // 状態をリセット
    isGrouped = false;
    groupedData = null;
    window.groupedData = null;
    PRODUCT_NAME_COL = 1;

    // プレビューを更新
    displayPreview();

    // 統計更新
    document.getElementById('rowCount').textContent = summaryData.length;
    document.getElementById('colCount').textContent = summaryData[0] ? summaryData[0].length : 0;
    document.getElementById('groupCount').textContent = summaryData.length - 1;
    document.getElementById('groupCountCard').style.display = 'block';

    // 集計ボタンを非表示
    document.getElementById('summaryBtn').style.display = 'none';

    showSuccess(`グループ集計完了！価格分布付きで集計しました。`);
}

function cleanProductName(text) {
    if (!text || typeof text !== 'string') return text;
    
    let cleaned = text;
    
    // 各オプションに応じてクリーニング
    if (document.getElementById('removeExclusive').checked) {
        // 〇〇様専用パターン（強化版）
        cleaned = cleaned.replace(/[^\s]+[様さま]専用/g, '');
        cleaned = cleaned.replace(/[^\s]+[様さま]用/g, '');
        cleaned = cleaned.replace(/専用出品/g, '');
        cleaned = cleaned.replace(/出品/g, '');
        cleaned = cleaned.replace(/[^\s]*様/g, '');
        cleaned = cleaned.replace(/専用/g, '');
        cleaned = cleaned.replace(/\d+月まで/g, '');
        cleaned = cleaned.replace(/月末まで/g, '');
    }
    
    if (document.getElementById('removePrice').checked) {
        // 価格情報（強化版）
        cleaned = cleaned.replace(/定価[\d,，\s]*円?/g, '');
        cleaned = cleaned.replace(/¥[\d,，\s]+/g, '');
        cleaned = cleaned.replace(/￥[\d,，\s]+/g, '');
        cleaned = cleaned.replace(/[\d,，]+円/g, '');
        cleaned = cleaned.replace(/[\d,，]+万円?/g, '');
        cleaned = cleaned.replace(/約?[\d,，]+万/g, '');
        cleaned = cleaned.replace(/価格[\d,，\s]*円?/g, '');
        cleaned = cleaned.replace(/価格/g, '');
        cleaned = cleaned.replace(/送料込み?/g, '');
        cleaned = cleaned.replace(/送料無料/g, '');
        cleaned = cleaned.replace(/税込/g, '');
        cleaned = cleaned.replace(/税抜/g, '');
        cleaned = cleaned.replace(/値下げ/g, '');
        cleaned = cleaned.replace(/値下/g, '');
        cleaned = cleaned.replace(/値引き?不可/g, '');
        cleaned = cleaned.replace(/値引き?/g, '');
        cleaned = cleaned.replace(/OFF/gi, '');
        cleaned = cleaned.replace(/\d+%/g, '');
        cleaned = cleaned.replace(/最高[\d,，]+円?/g, '');
        cleaned = cleaned.replace(/最高[\d,，]+万/g, '');
        cleaned = cleaned.replace(/最安/g, '');
        cleaned = cleaned.replace(/格安/g, '');
        cleaned = cleaned.replace(/底値/g, '');
        cleaned = cleaned.replace(/万/g, '');
        cleaned = cleaned.replace(/最終/g, '');
    }
    
    if (document.getElementById('removeCondition').checked) {
        // 商品状態（強化版）
        cleaned = cleaned.replace(/新品/g, '');
        cleaned = cleaned.replace(/美品/g, '');
        cleaned = cleaned.replace(/極美品/g, '');
        cleaned = cleaned.replace(/未使用/g, '');
        cleaned = cleaned.replace(/未開封/g, '');
        cleaned = cleaned.replace(/中古/g, '');
        cleaned = cleaned.replace(/ジャンク/g, '');
        cleaned = cleaned.replace(/難あり/g, '');
        cleaned = cleaned.replace(/訳あり/g, '');
        cleaned = cleaned.replace(/使用感あり/g, '');
        cleaned = cleaned.replace(/傷あり/g, '');
        cleaned = cleaned.replace(/汚れあり/g, '');
        cleaned = cleaned.replace(/キズあり/g, '');
        cleaned = cleaned.replace(/やや傷/g, '');
        cleaned = cleaned.replace(/目立った傷/g, '');
        cleaned = cleaned.replace(/状態良好/g, '');
        cleaned = cleaned.replace(/良品/g, '');
        cleaned = cleaned.replace(/並品/g, '');
        cleaned = cleaned.replace(/開封済み/g, '');
        cleaned = cleaned.replace(/タグ付き/g, '');
        cleaned = cleaned.replace(/タグなし/g, '');
        cleaned = cleaned.replace(/箱あり/g, '');
        cleaned = cleaned.replace(/箱なし/g, '');
        cleaned = cleaned.replace(/付属品完備/g, '');
        cleaned = cleaned.replace(/欠品あり/g, '');
        cleaned = cleaned.replace(/極/g, '');
        cleaned = cleaned.replace(/ほぼ/g, '');
        cleaned = cleaned.replace(/超/g, '');
    }
    
    if (document.getElementById('removeMarketing').checked) {
        // 宣伝文句と購入場所
        cleaned = cleaned.replace(/[^\s]+購入/g, '');
        cleaned = cleaned.replace(/[^\s]+で購入/g, '');
        cleaned = cleaned.replace(/[^\s]+にて購入/g, '');
        cleaned = cleaned.replace(/人気/g, '');
        cleaned = cleaned.replace(/激安/g, '');
        cleaned = cleaned.replace(/お買い得/g, '');
        cleaned = cleaned.replace(/限定/g, '');
        cleaned = cleaned.replace(/レア/g, '');
        cleaned = cleaned.replace(/希少/g, '');
        cleaned = cleaned.replace(/大特価/g, '');
        cleaned = cleaned.replace(/セール/g, '');
        cleaned = cleaned.replace(/在庫処分/g, '');
        cleaned = cleaned.replace(/早い者勝ち/g, '');
        cleaned = cleaned.replace(/最終値下げ/g, '');
        cleaned = cleaned.replace(/大幅値下げ/g, '');
        cleaned = cleaned.replace(/即購入/g, '');
        cleaned = cleaned.replace(/即買い/g, '');
        cleaned = cleaned.replace(/最高/g, '');
        cleaned = cleaned.replace(/最強/g, '');
        cleaned = cleaned.replace(/最新/g, '');
        cleaned = cleaned.replace(/話題/g, '');
        cleaned = cleaned.replace(/大人気/g, '');
        cleaned = cleaned.replace(/売れ筋/g, '');
        cleaned = cleaned.replace(/おすすめ/g, '');
        cleaned = cleaned.replace(/オススメ/g, '');
        cleaned = cleaned.replace(/入手困難/g, '');
        cleaned = cleaned.replace(/プロフ必読/g, '');
        cleaned = cleaned.replace(/プロフ/g, '');
        cleaned = cleaned.replace(/必読/g, '');
        cleaned = cleaned.replace(/名品/g, '');
    }
    
    if (document.getElementById('removeSymbols').checked) {
        // 過剰な記号と絵文字の残骸
        cleaned = cleaned.replace(/[★☆♪◆◇■□●○▲△▼▽]/g, '');
        cleaned = cleaned.replace(/[？?]+/g, '');
        cleaned = cleaned.replace(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g, '');
        cleaned = cleaned.replace(/[\u2600-\u27BF]/g, '');
        cleaned = cleaned.replace(/[\uFE00-\uFE0F]/g, '');
        cleaned = cleaned.replace(/！+/g, '');
        cleaned = cleaned.replace(/!+/g, '');
        cleaned = cleaned.replace(/【[^】]*】/g, '');
        cleaned = cleaned.replace(/≪[^≫]*≫/g, '');
        cleaned = cleaned.replace(/《[^》]*》/g, '');
        cleaned = cleaned.replace(/\[[^\]]*\]/g, '');
        cleaned = cleaned.replace(/［[^］]*］/g, '');
        cleaned = cleaned.replace(/〔[^〕]*〕/g, '');
        cleaned = cleaned.replace(/\([^)]*\)/g, '');
        cleaned = cleaned.replace(/（[^）]*）/g, '');
        // 単体で残った括弧も削除
        cleaned = cleaned.replace(/[【】≪≫《》\[\]［］〔〕()（）]/g, '');
        // その他の記号
        cleaned = cleaned.replace(/[・\.·]/g, '');
        cleaned = cleaned.replace(/\*/g, '');
        cleaned = cleaned.replace(/\//g, '');
        cleaned = cleaned.replace(/\|/g, '');
        cleaned = cleaned.replace(/〜/g, '');
        cleaned = cleaned.replace(/~/g, '');
    }
    
    if (document.getElementById('removeGarbage').checked) {
        // 意味不明な文字列
        cleaned = cleaned.replace(/[あ]{3,}/g, '');
        cleaned = cleaned.replace(/[ア]{3,}/g, '');
        cleaned = cleaned.replace(/[ー]{3,}/g, '');
        cleaned = cleaned.replace(/[\.]{3,}/g, '...');
        cleaned = cleaned.replace(/[！]{3,}/g, '！');
        cleaned = cleaned.replace(/[!]{3,}/g, '!');
    }
    
    if (document.getElementById('removeNumbers').checked) {
        // 商品番号・管理番号
        cleaned = cleaned.replace(/No\.[\d]+/g, '');
        cleaned = cleaned.replace(/#[\d]+/g, '');
        cleaned = cleaned.replace(/管理番号[:：]?[\w\d]+/g, '');
        cleaned = cleaned.replace(/商品番号[:：]?[\w\d]+/g, '');
        cleaned = cleaned.replace(/品番[:：]?[\w\d]+/g, '');
    }
    
    if (document.getElementById('removeStore') && document.getElementById('removeStore').checked) {
        // 購入場所・店舗名
        const stores = [
            'Amazon', 'アマゾン', '楽天', 'メルカリ', 'ヤフオク', 
            'ラクマ', 'PayPay', 'Yahoo', 'ヤフー', '店舗', 
            '公式', 'オンライン', 'ネット', '通販', 'EC',
            'ZOZOTOWN', 'ゾゾタウン', 'ユニクロ', 'GU', 'しまむら',
            '無印', 'ニトリ', 'イオン', 'ドンキ', 'コストコ'
        ];
        
        stores.forEach(store => {
            cleaned = cleaned.replace(new RegExp(store + '購入', 'gi'), '');
            cleaned = cleaned.replace(new RegExp(store + 'で購入', 'gi'), '');
            cleaned = cleaned.replace(new RegExp(store + 'にて購入', 'gi'), '');
            cleaned = cleaned.replace(new RegExp(store + '限定', 'gi'), '');
        });
        
        // 一般的な購入パターン
        cleaned = cleaned.replace(/[^\s]+購入/g, '');
        cleaned = cleaned.replace(/[^\s]+で購入/g, '');
        cleaned = cleaned.replace(/[^\s]+にて購入/g, '');
        cleaned = cleaned.replace(/購入時期[^\s]*/g, '');
        cleaned = cleaned.replace(/\d+年購入/g, '');
        cleaned = cleaned.replace(/\d+月購入/g, '');
    }
    
    if (document.getElementById('removeModel') && document.getElementById('removeModel').checked) {
        // 着用者・モデル情報
        cleaned = cleaned.replace(/[^\s]+着用/g, '');
        cleaned = cleaned.replace(/[^\s]+モデル/g, '');
        cleaned = cleaned.replace(/[^\s]+使用/g, '');
        cleaned = cleaned.replace(/[^\s]+愛用/g, '');
        cleaned = cleaned.replace(/芸能人/g, '');
        cleaned = cleaned.replace(/有名人/g, '');
        cleaned = cleaned.replace(/タレント/g, '');
        cleaned = cleaned.replace(/モデル/g, '');
        cleaned = cleaned.replace(/着用/g, '');
        cleaned = cleaned.replace(/使用/g, '');
        cleaned = cleaned.replace(/愛用/g, '');
        cleaned = cleaned.replace(/コラボ/g, '');
        cleaned = cleaned.replace(/プロデュース/g, '');
        cleaned = cleaned.replace(/監修/g, '');
        cleaned = cleaned.replace(/cm/gi, '');
        cleaned = cleaned.replace(/TV/gi, '');
        cleaned = cleaned.replace(/雑誌掲載/g, '');
        cleaned = cleaned.replace(/掲載/g, '');
    }
    
    // カスタムパターン
    const customPatterns = document.getElementById('customPatterns').value;
    if (customPatterns) {
        const patterns = customPatterns.split('\n').filter(p => p.trim());
        patterns.forEach(pattern => {
            const regex = new RegExp(pattern.trim(), 'g');
            cleaned = cleaned.replace(regex, '');
        });
    }
    
    if (document.getElementById('normalizeSpaces').checked) {
        // 余分なスペースを整理
        cleaned = cleaned.replace(/\s+/g, ' ');
        cleaned = cleaned.trim();
    }
    
    return cleaned;
}

window.previewCleaning = function() {
    if (mergedData.length === 0) {
        showError('先にCSVを結合してください');
        return;
    }
    
    previewChangesData = [];
    let totalProcessed = 0;
    let totalChanged = 0;
    
    // B列（インデックス1）をクリーニング
    const includeHeaders = document.getElementById('includeHeaders').checked;
    const startRow = includeHeaders ? 1 : 0;
    
    // デバッグ用ログ
    console.log('プレビュー開始:', {
        mergedDataLength: mergedData.length,
        startRow: startRow,
        includeHeaders: includeHeaders
    });
    
    // プレビュー用の最初の10件を処理
    for (let i = startRow; i < mergedData.length && previewChangesData.length < 10; i++) {
        if (mergedData[i] && mergedData[i].length > 1) {
            const original = mergedData[i][1];
            const cleaned = cleanProductName(original);
            
            if (original !== cleaned) {
                previewChangesData.push({
                    row: i + 1,
                    before: original,
                    after: cleaned
                });
            }
        }
    }
    
    // 全体の統計を計算
    for (let i = startRow; i < mergedData.length; i++) {
        if (mergedData[i] && mergedData[i].length > 1) {
            const original = mergedData[i][1];
            const cleaned = cleanProductName(original);
            if (original !== cleaned) {
                totalChanged++;
            }
            totalProcessed++;
        }
    }
    
    console.log('プレビュー結果:', {
        totalProcessed: totalProcessed,
        totalChanged: totalChanged,
        previewChanges: previewChangesData.length
    });
    
    // プレビュー表示
    const changesList = document.getElementById('changesList');
    if (previewChangesData.length > 0) {
        changesList.innerHTML = previewChangesData.map(change => `
            <div class="change-item">
                <span class="change-before">${escapeHtml(change.before)}</span>
                <span class="change-arrow">→</span>
                <span class="change-after">${escapeHtml(change.after)}</span>
            </div>
        `).join('');
    } else {
        changesList.innerHTML = '<p>変更される項目がありません</p>';
    }
    
    // 統計表示
    document.getElementById('totalProcessed').textContent = totalProcessed;
    document.getElementById('totalChanged').textContent = totalChanged;
    document.getElementById('changeRate').textContent = 
        totalProcessed > 0 ? Math.round(totalChanged / totalProcessed * 100) + '%' : '0%';
    
    document.getElementById('previewChanges').style.display = 'block';
    document.getElementById('cleaningStats').style.display = 'flex';
}

window.applyCleaning = function() {
    if (mergedData.length === 0) {
        showError('先にCSVを結合してください');
        return;
    }
    
    const includeHeaders = document.getElementById('includeHeaders').checked;
    const startRow = includeHeaders ? 1 : 0;
    
    let changedCount = 0;
    
    // デバッグ用ログ
    console.log('クリーニング開始:', {
        mergedDataLength: mergedData.length,
        startRow: startRow,
        includeHeaders: includeHeaders
    });
    
    // B列（インデックス1）をクリーニング
    for (let i = startRow; i < mergedData.length; i++) {
        if (mergedData[i] && mergedData[i].length > 1) {
            const original = mergedData[i][1];
            const cleaned = cleanProductName(original);
            if (original !== cleaned) {
                mergedData[i][1] = cleaned;
                changedCount++;
                console.log(`行${i+1}: "${original}" → "${cleaned}"`);
            }
        }
    }
    
    console.log('クリーニング完了:', {
        changedCount: changedCount
    });
    
    // プレビューを更新
    displayPreview();
    
    // モーダルを閉じる
    closeCleaningModal();
    
    // 成功メッセージ
    showSuccess(`B列の商品名を${changedCount}件クリーニングしました！`);
}

function displayPreview() {
    const previewSection = document.getElementById('previewSection');
    const previewTable = document.getElementById('previewTable');
    
    // 統計情報を更新
    document.getElementById('rowCount').textContent = mergedData.length;
    document.getElementById('colCount').textContent = mergedData[0] ? mergedData[0].length : 0;
    document.getElementById('fileCount').textContent = csvFiles.length;
    
    // テーブルを作成（最初の100行のみ表示）
    const displayRows = Math.min(100, mergedData.length);
    let tableHTML = '';
    
    // グループ化されている場合の表示
    if (isGrouped && groupedData) {
        let currentGroupIndex = 0;
        let itemsInGroup = 0;
        let currentGroup = groupedData[currentGroupIndex];
        
        mergedData.slice(0, displayRows).forEach((row, index) => {
            if (index === 0 && document.getElementById('includeHeaders').checked) {
                tableHTML += '<thead><tr>';
                row.forEach(cell => {
                    tableHTML += `<th>${escapeHtml(cell)}</th>`;
                });
                tableHTML += '</tr></thead><tbody>';
            } else {
                // グループヘッダーの判定
                if (itemsInGroup >= currentGroup.count) {
                    currentGroupIndex++;
                    if (currentGroupIndex < groupedData.length) {
                        currentGroup = groupedData[currentGroupIndex];
                        itemsInGroup = 0;
                    }
                }
                
                const isGroupStart = itemsInGroup === 0;
                const rowClass = isGroupStart ? 'group-header' : 'group-item';
                
                if (index === 1) tableHTML += '<tbody>';
                tableHTML += `<tr class="${rowClass}">`;
                row.forEach(cell => {
                    tableHTML += `<td>${escapeHtml(cell)}</td>`;
                });
                tableHTML += '</tr>';
                
                itemsInGroup++;
            }
        });
    } else {
        // 通常の表示
        mergedData.slice(0, displayRows).forEach((row, index) => {
            if (index === 0 && document.getElementById('includeHeaders').checked) {
                tableHTML += '<thead><tr>';
                row.forEach(cell => {
                    tableHTML += `<th>${escapeHtml(cell)}</th>`;
                });
                // グループ集計結果の場合、アクション列を追加
                const isSummaryTable = (row.includes('最頻値価格') || row.includes('価格最頻値')) && (row.includes('価格帯') || row.includes('価格分布'));
                if (isSummaryTable) {
                    tableHTML += '<th>アクション</th>';
                }
                tableHTML += '</tr></thead><tbody>';
            } else {
                if (index === 1) tableHTML += '<tbody>';
                tableHTML += '<tr>';
                row.forEach(cell => {
                    tableHTML += `<td>${escapeHtml(cell)}</td>`;
                });

                // グループ集計結果の場合、ストックボタンを追加
                const headerRow = mergedData[0];
                const isSummaryTable = headerRow && (headerRow.includes('最頻値価格') || headerRow.includes('価格最頻値')) && (headerRow.includes('価格帯') || headerRow.includes('価格分布'));
                if (isSummaryTable && index > 0) {
                    // データを準備
                    const stockData = {
                        brandName: row[0],
                        groupName: row[1],
                        count: row[2],
                        modePrice: row[3],
                        productCode: row[4],
                        priceRange: row[5]
                    };
                    const jsonData = JSON.stringify(stockData).replace(/"/g, '&quot;');
                    tableHTML += `<td>
                        <button class="add-to-stock-btn"
                                data-stock-info="${jsonData}"
                                onclick='addToStock(${JSON.stringify(stockData).replace(/'/g, "&#39;")})'>
                            + ストック
                        </button>
                    </td>`;
                }

                tableHTML += '</tr>';
            }
        });
    }
    
    if (displayRows < mergedData.length) {
        tableHTML += `<tr><td colspan="${mergedData[0].length}" style="text-align: center; font-style: italic;">
            ... さらに ${mergedData.length - displayRows} 行あります ...
        </td></tr>`;
    }
    
    tableHTML += '</tbody>';
    previewTable.innerHTML = tableHTML;
    previewSection.style.display = 'block';
}

window.downloadCSV = function() {
    if (mergedData.length === 0) {
        showError('ダウンロードするデータがありません');
        return;
    }

    const csvContent = mergedData.map(row => 
        row.map(cell => {
            // セルに改行、カンマ、ダブルクォートが含まれる場合は引用符で囲む
            const cellStr = String(cell || ''); // nullやundefinedを空文字に変換
            if (cellStr.includes(',') || cellStr.includes('"') || cellStr.includes('\n')) {
                return `"${cellStr.replace(/"/g, '""')}"`;
            }
            return cellStr;
        }).join(',')
    ).join('\n');

    // BOM付きUTF-8で出力（Excelで文字化けしないように）
    const bom = '\uFEFF';
    const blob = new Blob([bom + csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // ファイル名にグループ化情報を含める
    const timestamp = new Date().getTime();
    const filename = isGrouped ? `grouped_${timestamp}.csv` : `merged_${timestamp}.csv`;
    link.download = filename;
    
    link.click();
    URL.revokeObjectURL(url);
    
    showSuccess('CSVファイルをダウンロードしました！（UTF-8 with BOM）');
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = String(text || ''); // nullやundefinedを空文字に変換
    return div.innerHTML;
}

function showError(message) {
    const errorEl = document.getElementById('errorMessage');
    errorEl.textContent = message;
    errorEl.style.display = 'block';
    setTimeout(() => errorEl.style.display = 'none', 5000);
}

function showSuccess(message) {
    const successEl = document.getElementById('successMessage');
    successEl.textContent = message;
    successEl.style.display = 'block';
    setTimeout(() => successEl.style.display = 'none', 5000);
}

function hideMessages() {
    document.getElementById('errorMessage').style.display = 'none';
    document.getElementById('successMessage').style.display = 'none';
}

// ブランド処理機能（シンプル版）
function loadBrandsData() {
    // brands.jsから直接取得（すでにグローバル変数として存在）
    if (!brandsData) {
        brandsData = getBrandsData ? getBrandsData() : window.brandsData;
    }
    return brandsData;
}

// ブランド検索用の正規化関数
function normalizeBrandSearch(text) {
    if (!text) return '';

    let normalized = text
        .normalize('NFKC')  // 全角半角統一
        .toLowerCase()      // 小文字化
        .replace(/[・\s\-_''"“”/]/g, '')  // 区切り文字・記号除去
        .replace(/＆/g, 'and')          // 全角&を統一
        .replace(/&/g, 'and');          // &をandに統一

    // アクセント記号除去（agnès → agnes）
    normalized = normalized.normalize('NFD').replace(/[\u0300-\u036f]/g, '');

    return normalized;
}

// N-gramを使った文字列類似度計算用関数
function charNgrams(str, n = 2) {
    const ngrams = new Set();
    const normalized = str.toLowerCase();
    for (let i = 0; i <= normalized.length - n; i++) {
        ngrams.add(normalized.substring(i, i + n));
    }
    return ngrams;
}

// Jaccard係数を使った集合類似度
function jaccard(set1, set2) {
    if (set1.size === 0 && set2.size === 0) return 1;
    if (set1.size === 0 || set2.size === 0) return 0;

    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return intersection.size / union.size;
}

// 危険な短縮語（誤爆防止）
const RISKY_SHORT_BRANDS = new Set(['js', 'ua', 'by', 'cos', 'tan', 'eg', 'mm6', 'ap']);
const FUZZY_THRESHOLD = 0.75; // あいまい一致の闾値（75%の類似度）

window.processBrands = function() {
    if (mergedData.length === 0) {
        showError('先にCSVを結合してください');
        return;
    }

    showSuccess('ブランド処理を開始します...');
    
    // ブランドデータを読み込み（同期処理）
    const brands = loadBrandsData();
    if (!brands) {
        showError('ブランドデータの読み込みに失敗しました');
        return;
    }

    const includeHeaders = document.getElementById('includeHeaders').checked;
    const startRow = includeHeaders ? 1 : 0;
    
    // ヘッダー行の処理
    if (includeHeaders && mergedData[0]) {
        // A列のヘッダーを「ブランド」に変更
        mergedData[0][0] = 'ブランド';
        
        // 出品者列（通常D列=index3）を探して削除
        let sellerIndex = -1;
        for (let i = 0; i < mergedData[0].length; i++) {
            if (mergedData[0][i] && (mergedData[0][i].includes('出品者') || mergedData[0][i].includes('seller'))) {
                sellerIndex = i;
                break;
            }
        }
        
        // 出品者列を削除
        if (sellerIndex >= 0) {
            for (let row of mergedData) {
                row.splice(sellerIndex, 1);
            }
        }
    }

    let processedCount = 0;
    let brandFoundCount = 0;

    // 各行を処理
    for (let i = startRow; i < mergedData.length; i++) {
        if (mergedData[i] && mergedData[i].length > 1) {
            const originalName = mergedData[i][1] || '';
            
            // ブランド検出と正規化
            const result = detectAndNormalizeBrand(originalName, brands);
            
            // 出品者列がまだある場合は削除（ヘッダーなしの場合）
            if (!includeHeaders) {
                // 出品者列があれば削除（通常4列目）
                if (mergedData[i].length > 3) {
                    // 出品者っぽい列を探して削除
                    let sellerIndex = 3; // デフォルトはD列
                    // E列以降にある可能性も考慮
                    for (let j = 3; j < mergedData[i].length; j++) {
                        const cellContent = mergedData[i][j] || '';
                        // 出品者名っぽいパターン（日本語の名前やIDっぽいもの）
                        if (cellContent && !cellContent.match(/^\d+$/) && !cellContent.includes('円')) {
                            sellerIndex = j;
                            break;
                        }
                    }
                    if (sellerIndex < mergedData[i].length) {
                        mergedData[i].splice(sellerIndex, 1);
                    }
                }
            }
            
            if (result.brandFound) {
                // A列（インデックス0）にブランド名を設定
                mergedData[i][0] = result.brandName;
                
                // B列の商品名を正規化し、さらにブランド名を完全削除
                let cleanedName = result.normalizedName;
                
                // クリーニング処理を適用
                cleanedName = cleanProductName(cleanedName);
                
                // ブランド名のすべてのバリエーションを削除
                cleanedName = removeAllBrandVariations(cleanedName, result.brandName, brands);
                
                mergedData[i][1] = cleanedName;
                brandFoundCount++;
            } else {
                // ブランドが見つからない場合はA列を空にする
                mergedData[i][0] = '';
                // B列はクリーニングのみ適用
                mergedData[i][1] = cleanProductName(originalName);
            }
            
            processedCount++;
        }
    }

    // プレビューを更新
    displayPreview();
    
    // 未認識商品のデバッグ表示
    const unrecognizedItems = [];
    for (let i = startRow; i < mergedData.length; i++) {
        if (mergedData[i] && mergedData[i][0] === '') {  // A列が空 = 未認識
            unrecognizedItems.push(mergedData[i][1]);
        }
    }

    if (unrecognizedItems.length > 0) {
        console.log('🔍 未認識商品（最初の10件）:', unrecognizedItems.slice(0, 10));
        console.log(`📊 未認識率: ${Math.round(unrecognizedItems.length / processedCount * 100)}%`);
    }

    // 結果を表示
    showSuccess(`ブランド処理完了！ ${processedCount}件中${brandFoundCount}件でブランドを検出。商品名からブランド名を削除しました。`);
}

// スペルミス対応版のブランド検出関数
function detectAndNormalizeBrand(productName, brandsData) {
    if (!productName) {
        return { brandFound: false, brandName: '', normalizedName: cleanProductName(productName) };
    }

    let bestBrand = '';
    let bestMatchedVariant = '';
    let maxScore = 0;

    const searchText = normalizeBrandSearch(productName);

    // ========== フェーズ1: 完全一致・部分一致（最優先） ==========
    for (const [officialBrandName, variations] of Object.entries(brandsData)) {
        for (const variant of variations) {
            const normalizedVariant = normalizeBrandSearch(variant);

            // 短すぎる or 危険な略称は完全一致以外スキップ
            if (normalizedVariant.length <= 2 && RISKY_SHORT_BRANDS.has(normalizedVariant) && searchText !== normalizedVariant) {
                continue;
            }

            let currentScore = 0;
            if (searchText === normalizedVariant) {
                // 完全一致は最高スコア
                currentScore = 1000 + normalizedVariant.length;
            } else if (searchText.includes(normalizedVariant)) {
                // 部分一致は次点
                currentScore = 500 + normalizedVariant.length;
            }

            if (currentScore > maxScore) {
                maxScore = currentScore;
                bestBrand = officialBrandName;
                bestMatchedVariant = variant;
            }
        }
    }

    // 強力なマッチが見つかった場合は即座に採用
    if (bestBrand && maxScore >= 500) {
        let normalizedName = productName;
        const variantRegex = new RegExp(bestMatchedVariant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        normalizedName = normalizedName.replace(variantRegex, bestBrand);
        normalizedName = cleanProductNameWithBrandProtection(normalizedName, bestBrand);
        normalizedName = removeAllBrandVariations(normalizedName, bestBrand, brandsData);

        return {
            brandFound: true,
            brandName: bestBrand,
            normalizedName: normalizedName
        };
    }

    // ========== フェーズ2: あいまい一致（スペルミス対応） ==========
    let fuzzyBestBrand = '';
    let fuzzyMaxSimilarity = 0;
    let fuzzyBestMatchVariant = '';

    // 2-gramでスペルミスに強く
    const searchTextNgrams = charNgrams(searchText, 2);

    for (const [officialBrandName, variations] of Object.entries(brandsData)) {
        for (const variant of variations) {
            const normalizedVariant = normalizeBrandSearch(variant);

            // 短すぎる・危険な略称はあいまい一致しない（誤爆防止）
            if (normalizedVariant.length < 3 || RISKY_SHORT_BRANDS.has(normalizedVariant)) {
                continue;
            }

            // Jaccard係数で類似度計算
            const variantNgrams = charNgrams(normalizedVariant, 2);
            const similarity = jaccard(searchTextNgrams, variantNgrams);

            if (similarity >= FUZZY_THRESHOLD && similarity > fuzzyMaxSimilarity) {
                fuzzyMaxSimilarity = similarity;
                fuzzyBestBrand = officialBrandName;
                fuzzyBestMatchVariant = variant;
            }
        }
    }

    if (fuzzyBestBrand) {
        let normalizedName = productName;

        // スペルミス検出をコンソールに出力（デバッグ用）
        console.log(`🔍 スペルミス検出: "${productName}" → "${fuzzyBestBrand}" (類似度: ${Math.round(fuzzyMaxSimilarity * 100)}%)`);

        normalizedName = cleanProductNameWithBrandProtection(normalizedName, fuzzyBestBrand);
        normalizedName = removeAllBrandVariations(normalizedName, fuzzyBestBrand, brandsData);

        return {
            brandFound: true,
            brandName: fuzzyBestBrand,
            normalizedName: normalizedName
        };
    }

    // ========== フェーズ3: マッチなし ==========
    return {
        brandFound: false,
        brandName: '',
        normalizedName: cleanProductName(productName)
    };
}

function cleanProductNameWithBrandProtection(text, brandName) {
    if (!text || typeof text !== 'string') return text;
    
    // ブランド名を一時的に置換
    const placeholder = '###BRAND###';
    let cleaned = text.replace(new RegExp(brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), placeholder);
    
    // 通常のクリーニング処理（簡易版）
    // 〇〇様専用パターン
    cleaned = cleaned.replace(/[^\s]+[様さま]専用/g, '');
    cleaned = cleaned.replace(/専用出品/g, '');
    
    // 価格情報
    cleaned = cleaned.replace(/定価[\d,，\s]*円?/g, '');
    cleaned = cleaned.replace(/[\d,，]+円/g, '');
    cleaned = cleaned.replace(/送料込み?/g, '');
    cleaned = cleaned.replace(/送料無料/g, '');
    
    // 商品状態
    cleaned = cleaned.replace(/新品/g, '');
    cleaned = cleaned.replace(/美品/g, '');
    cleaned = cleaned.replace(/未使用/g, '');
    
    // 宣伝文句
    cleaned = cleaned.replace(/人気/g, '');
    cleaned = cleaned.replace(/激安/g, '');
    cleaned = cleaned.replace(/限定/g, '');
    
    // 記号
    cleaned = cleaned.replace(/[★☆♪◆◇■□●○▲△▼▽]/g, '');
    cleaned = cleaned.replace(/【[^】]*】/g, '');
    cleaned = cleaned.replace(/[【】≪≫《》\[\]［］〔〕]/g, '');
    
    // 購入場所
    cleaned = cleaned.replace(/[^\s]+購入/g, '');
    
    // 着用者情報
    cleaned = cleaned.replace(/[^\s]+着用/g, '');
    cleaned = cleaned.replace(/[^\s]+モデル/g, '');
    
    // 余分なスペースを整理
    cleaned = cleaned.replace(/\s+/g, ' ');
    cleaned = cleaned.trim();
    
    // ブランド名を復元
    cleaned = cleaned.replace(placeholder, brandName);
    
    return cleaned;
}

function removeAllBrandVariations(text, brandName, brandsData) {
    if (!text || typeof text !== 'string') return text;
    
    let cleaned = text;
    
    // brandsDataがオブジェクト形式の場合、すべてのバリエーションを削除
    if (typeof brandsData === 'object' && !Array.isArray(brandsData)) {
        // 該当ブランドのバリエーションを取得
        const variations = brandsData[brandName];
        if (variations && Array.isArray(variations)) {
            // すべてのバリエーションを削除
            variations.forEach(variant => {
                // 大文字小文字を無視して削除
                const regex = new RegExp(variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
                cleaned = cleaned.replace(regex, '');
            });
        }
        
        // 追加でよくあるパターンも削除
        // スペースなしバージョン
        const noSpaceBrand = brandName.replace(/\s+/g, '');
        cleaned = cleaned.replace(new RegExp(noSpaceBrand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
        
        // &と and の変換パターン
        const andPattern = brandName.replace(/&/g, 'and');
        const ampPattern = brandName.replace(/and/gi, '&');
        cleaned = cleaned.replace(new RegExp(andPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
        cleaned = cleaned.replace(new RegExp(ampPattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
    }
    
    // 通常のブランド名も削除（念のため）
    cleaned = cleaned.replace(new RegExp(brandName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '');
    
    // 余分なスペースを整理
    cleaned = cleaned.replace(/\s+/g, ' ');
    cleaned = cleaned.trim();
    
    return cleaned;
}

// モーダル外クリックで閉じる
window.onclick = function(event) {
    const cleaningModal = document.getElementById('cleaningModal');
    const groupingModal = document.getElementById('groupingModal');
    
    if (event.target == cleaningModal) {
        closeCleaningModal();
    }
    if (event.target == groupingModal) {
        closeGroupingModal();
    }
}

/**
 * 商品コードのみでグループ化するプレビュー関数
 */
function previewProductCodeGrouping() {
    const includeHeaders = document.getElementById('includeHeaders').checked;
    const startRow = includeHeaders ? 1 : 0;
    const headerRow = mergedData[0];

    // 商品コード列を検出
    let productCodeCol = -1;
    for (let i = 0; i < headerRow.length; i++) {
        const colName = (headerRow[i] || '').toString().toLowerCase();
        if (colName.includes('商品コード') || colName.includes('productcode') || colName.includes('product_code')) {
            productCodeCol = i;
            break;
        }
    }

    if (productCodeCol === -1) {
        showError('商品コード列が見つかりません。列名に「商品コード」を含めてください。');
        return;
    }

    console.log(`🔢 商品コード列: ${headerRow[productCodeCol]} (列${productCodeCol})`);

    // 商品コードでグループ化
    const groups = {};
    for (let i = startRow; i < mergedData.length; i++) {
        const row = mergedData[i];
        if (!row || row.length <= productCodeCol) continue;

        const productCode = (row[productCodeCol] || '').toString().trim();
        if (!productCode) continue;

        if (!groups[productCode]) {
            groups[productCode] = {
                productCode: productCode,
                items: []
            };
        }

        groups[productCode].items.push({
            index: i,
            name: row[1] || '',
            row: row
        });
    }

    // グループを配列に変換
    const groupArray = Object.entries(groups).map(([code, data]) => ({
        name: code,
        baseName: code,
        representativeName: code,
        items: data.items,
        count: data.items.length
    }));

    // 件数でソート
    const sortOrder = document.getElementById('sortOrder').value;
    if (sortOrder === 'count') {
        groupArray.sort((a, b) => b.count - a.count);
    } else if (sortOrder === 'name') {
        groupArray.sort((a, b) => a.name.localeCompare(b.name));
    }

    console.log(`📦 ${groupArray.length}個の商品コードグループを作成`);

    // プレビュー表示
    displayGroupingPreview(groupArray);
}

/**
 * グループ化プレビューを表示する共通関数
 */
function displayGroupingPreview(groupArray) {
    // groupedDataをグローバルに保存
    groupedData = groupArray;
    window.groupedData = groupArray;

    const preview = document.getElementById('groupPreview');
    const stats = document.getElementById('groupingStats');

    preview.style.display = 'block';
    stats.style.display = 'flex';

    // 統計情報を更新
    const totalItems = groupArray.reduce((sum, g) => sum + g.count, 0);
    const totalGroups = groupArray.length;
    const avgGroupSize = (totalItems / totalGroups).toFixed(1);

    document.getElementById('totalItems').textContent = totalItems;
    document.getElementById('totalGroups').textContent = totalGroups;
    document.getElementById('avgGroupSize').textContent = avgGroupSize;

    // プレビュー件数を更新（既存の関数を使用）
    updatePreviewCount();
}

/**
 * 商品コードのみでグループ化する関数（削除予定）
 * 商品コード列を探してグループ化し、B列にグループ名（商品コード）を挿入
 */
function groupByProductCode() {
    if (!mergedData || mergedData.length < 2) {
        showError('先にファイルを結合してください');
        return;
    }

    const includeHeaders = document.getElementById('includeHeaders').checked;
    const startRow = includeHeaders ? 1 : 0;
    const headerRow = mergedData[0];

    // 商品コード列を検出
    let productCodeCol = -1;
    for (let i = 0; i < headerRow.length; i++) {
        const colName = (headerRow[i] || '').toString().toLowerCase();
        if (colName.includes('商品コード') || colName.includes('productcode') || colName.includes('product_code')) {
            productCodeCol = i;
            break;
        }
    }

    if (productCodeCol === -1) {
        showError('商品コード列が見つかりません。列名に「商品コード」を含めてください。');
        return;
    }

    console.log(`🔢 商品コード列: ${headerRow[productCodeCol]} (列${productCodeCol})`);

    // 商品コードでグループ化
    const groups = {};
    for (let i = startRow; i < mergedData.length; i++) {
        const row = mergedData[i];
        if (!row || row.length <= productCodeCol) continue;

        const productCode = (row[productCodeCol] || '').toString().trim();
        if (!productCode) continue;

        if (!groups[productCode]) {
            groups[productCode] = {
                productCode: productCode,
                items: []
            };
        }

        groups[productCode].items.push({
            index: i,
            name: row[1] || '', // 商品名（B列またはA列）
            row: row
        });
    }

    // グループを配列に変換
    const groupArray = Object.entries(groups).map(([code, data]) => ({
        name: code,
        baseName: code,
        representativeName: code,
        items: data.items,
        count: data.items.length
    }));

    // 件数でソート
    groupArray.sort((a, b) => b.count - a.count);

    console.log(`📦 ${groupArray.length}個の商品コードグループを作成`);

    // 新しいデータ配列を作成（B列にグループ名を挿入）
    const newData = [];

    // ヘッダー行の処理
    if (includeHeaders && mergedData[0]) {
        const newHeader = [...mergedData[0]];
        newHeader.splice(1, 0, 'グループ名');
        newData.push(newHeader);
    }

    // グループごとにデータを追加
    groupArray.forEach(group => {
        group.items.forEach(item => {
            const newRow = [...item.row];
            newRow.splice(1, 0, group.productCode); // B列に商品コードを挿入
            newData.push(newRow);
        });
    });

    // 結果を適用
    mergedData = newData;
    window.mergedData = newData;
    isGrouped = true;
    groupedData = groupArray;
    window.groupedData = groupArray;

    // 商品名の列インデックスを更新
    PRODUCT_NAME_COL = 2;

    // プレビューを更新
    displayPreview();

    // 統計更新
    document.getElementById('rowCount').textContent = newData.length;
    document.getElementById('colCount').textContent = newData[0] ? newData[0].length : 0;
    document.getElementById('groupCount').textContent = groupArray.length;
    document.getElementById('groupCountCard').style.display = 'block';
    document.getElementById('summaryBtn').style.display = 'inline-block';

    showSuccess(`商品コードで${groupArray.length}個のグループを作成しました！（総${newData.length}行）`);
}
