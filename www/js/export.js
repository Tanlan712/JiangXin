/* global XLSX */
// 匯出 Excel 與備份檔。手機 App（Capacitor）裡用「分享」把檔案傳出去，瀏覽器裡直接下載。

function isNative() {
  return !!window.Capacitor?.isNativePlatform?.();
}

function bytesToBase64(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

async function shareNative(name, base64) {
  const { Filesystem, Share } = window.Capacitor.Plugins;
  const { uri } = await Filesystem.writeFile({ path: name, data: base64, directory: 'CACHE' });
  await Share.share({ title: name, files: [uri] });
}

function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

export async function saveTextFile(name, text, mime) {
  if (isNative()) {
    await shareNative(name, bytesToBase64(new TextEncoder().encode(text)));
  } else {
    download(name, new Blob([text], { type: mime }));
  }
}

function sheet(rows, widths) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = widths.map((wch) => ({ wch }));
  return ws;
}

export async function exportWorkbook({ crew, ledger, from, to, crewHours }) {
  const wb = XLSX.utils.book_new();
  const byDate = (a, b) => a.date.localeCompare(b.date);

  const crewRows = [...crew].sort((a, b) => byDate(a, b) || a.site.localeCompare(b.site) || a.worker.localeCompare(b.worker));
  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      [
        ['日期', '工地地點', '人員', '上工', '收工', '休息(分)', '工時(小時)', '日薪', '工作內容／備註'],
        ...crewRows.map((r) => [r.date, r.site, r.worker, r.start, r.end, r.breakMin, Math.round(crewHours(r) * 100) / 100, r.wage === '' ? '' : r.wage, r.note]),
        [],
        ['合計', '', '', '', '', '', crewRows.reduce((s, r) => s + crewHours(r), 0), crewRows.reduce((s, r) => s + (Number(r.wage) || 0), 0)],
      ],
      [12, 18, 10, 7, 7, 9, 10, 9, 24],
    ),
    '工班紀錄',
  );

  const ledgerRows = [...ledger].sort(byDate);
  const inc = (r) => (r.type === 'income' ? r.amount : 0);
  const exp = (r) => (r.type === 'expense' ? r.amount : 0);
  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      [
        ['日期', '收支', '類別', '工地', '收入', '支出', '備註'],
        ...ledgerRows.map((r) => [r.date, r.type === 'income' ? '收入' : '支出', r.category, r.site, inc(r) || '', exp(r) || '', r.note]),
        [],
        ['合計', '', '', '', ledgerRows.reduce((s, r) => s + inc(r), 0), ledgerRows.reduce((s, r) => s + exp(r), 0)],
      ],
      [12, 6, 10, 18, 11, 11, 24],
    ),
    '收支明細',
  );

  const summarize = (keyOf) => {
    const map = new Map();
    for (const r of ledgerRows) {
      const k = keyOf(r);
      const cur = map.get(k) || { income: 0, expense: 0 };
      cur.income += inc(r);
      cur.expense += exp(r);
      map.set(k, cur);
    }
    return [...map.entries()].map(([k, v]) => [k, v.income, v.expense, v.income - v.expense]);
  };
  XLSX.utils.book_append_sheet(wb, sheet([['日期', '收入', '支出', '結餘'], ...summarize((r) => r.date)], [12, 11, 11, 11]), '每日收支');
  XLSX.utils.book_append_sheet(wb, sheet([['月份', '收入', '支出', '結餘'], ...summarize((r) => r.date.slice(0, 7))], [10, 11, 11, 11]), '每月收支');

  const name = from <= '2000-01-01' ? 'JiangXin_all.xlsx' : `JiangXin_${from}_${to}.xlsx`;
  if (isNative()) {
    await shareNative(name, XLSX.write(wb, { bookType: 'xlsx', type: 'base64' }));
  } else {
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    download(name, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }
  return name;
}
