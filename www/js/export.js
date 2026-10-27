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

export async function exportWorkbook({ crew, ledger, invoices = [], payroll = [], from, to, crewHours }) {
  const wb = XLSX.utils.book_new();
  const byDate = (a, b) => a.date.localeCompare(b.date);

  const crewRows = [...crew].sort((a, b) => byDate(a, b) || a.site.localeCompare(b.site) || a.worker.localeCompare(b.worker));
  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      [
        ['日期', '工地地點', '人員', '上工', '收工', '休息(分)', '工時(小時)', '日薪', '付款', '工作內容／備註'],
        ...crewRows.map((r) => [r.date, r.site, r.worker, r.start, r.end, r.breakMin, Math.round(crewHours(r) * 100) / 100, r.wage === '' ? '' : r.wage, r.wage ? (r.paid ? '已付' : '未付') : '', r.note]),
        [],
        ['合計', '', '', '', '', '', crewRows.reduce((s, r) => s + crewHours(r), 0), crewRows.reduce((s, r) => s + (Number(r.wage) || 0), 0)],
      ],
      [12, 18, 10, 7, 7, 9, 10, 9, 6, 24],
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

  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      [
        ['師傅', '出工天數', '工時(小時)', '應付', '已付', '未付'],
        ...payroll.map((p) => [p.worker, p.days.size, Math.round(p.hours * 100) / 100, p.total, p.paid, p.total - p.paid]),
      ],
      [10, 9, 10, 11, 11, 11],
    ),
    '薪資結算',
  );

  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      [
        ['請款日期', '工地', '請款金額', '收款期限', '已收', '未收', '最後收款日', '備註'],
        ...[...invoices].sort(byDate).map((i) => [i.date, i.site, i.amount, i.dueDate || '', i.receivedAmount || 0, i.amount - (i.receivedAmount || 0), i.receivedDate || '', i.note]),
      ],
      [12, 18, 11, 12, 11, 11, 12, 24],
    ),
    '請款應收',
  );

  const name = from <= '2000-01-01' ? 'JiangXin_all.xlsx' : `JiangXin_${from}_${to}.xlsx`;
  if (isNative()) {
    await shareNative(name, XLSX.write(wb, { bookType: 'xlsx', type: 'base64' }));
  } else {
    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    download(name, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  }
  return name;
}
