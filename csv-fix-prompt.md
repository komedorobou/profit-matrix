# fusion-studio.js CSV/Excel読み込み改修

## やりたいこと
1. 品番 `14-020-220-7230` が `20-22` になるバグを直す
2. ヘッダーあり/なしを自動判定
3. 列が3つでも4つでも9つでも対応
4. どんなファイルが来ても読み込める

---

## 修正1: Excel読み込みの日付変換バグ

`handleFiles`関数内（212行目付近）を修正：

```javascript
// Before
const workbook = XLSX.read(data, { type: 'array' });
const csvContent = XLSX.utils.sheet_to_csv(firstSheet);

// After
const workbook = XLSX.read(data, { 
    type: 'array',
    cellDates: false,
    cellText: false,
    raw: true,
    cellNF: false
});

const csvContent = XLSX.utils.sheet_to_csv(firstSheet, {
    rawNumbers: true,
    blankrows: false
});
```

---

## 修正2: ファイル形式の自動判定

新しい関数を追加：

```javascript
/**
 * ヘッダーあり/なし、列構成を自動判定
 */
function detectFileFormat(data) {
    if (!data || data.length === 0) {
        return { hasHeader: false, columns: {} };
    }

    const firstRow = data[0];
    const colCount = firstRow.length;
    
    // ヘッダー判定: 1行目に日本語キーワードがあるか
    const headerKeywords = ['サイト', '商品', '価格', '落札', '出品', 'タイトル', 'URL', 'ブランド', '状態'];
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
            if (cellText.includes('url') || cellText.includes('URL')) columns.url = i;
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
```

---

## 修正3: 判定結果を使った処理

CSVパース後に`detectFileFormat`を呼んで、結果を`mergedData`と一緒に保持：

```javascript
// CSVパース後に追加
const parsedData = parseCSV(csvContent);
const format = detectFileFormat(parsedData);

// グローバルに保持
window.currentFileFormat = format;

// ヘッダーありの場合、1行目をスキップするかどうかのフラグをセット
// （既存のincludeHeadersチェックボックスと連動させる）
if (format.hasHeader) {
    document.getElementById('includeHeaders').checked = true;
}
```

---

## テストパターン

### パターンA: WBC系3列（ヘッダーなし）
```
FRAMeWORK,14-020-220-7230,22000
FRAMeWORK,23-011-220-7620,13000
```
→ ヘッダーなしと判定、品番そのまま表示

### パターンB: WBC系4列（ヘッダーなし）
```
FRAMeWORK,14-020-220-7230,撥水ナイロンコート,22000
FRAMeWORK,23-011-220-7620,デニムジャケット,13000
```
→ ヘッダーなしと判定、4列すべて正しく表示

### パターンC: オークファン系（ヘッダーあり、9列）
```
サイト名,商品タイトル,落札価格,出品日,取引日,出品者,商品状態,サムネURL,商品URL
メルカリ,ドゥーズィエムクラス コート,18000,2025年9月21日,...
```
→ ヘッダーありと判定、1行目がカラム名として認識
