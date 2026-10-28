// App 線上更新：畫面與功能（www/）從 GitHub Pages 下載新版直接套用，資料不會動。
// 只有原生部分（外掛、權限）改版時才需要重新安裝 APK，這時會提示下載。
import { VERSION, BUILD, NATIVE } from './build.js';
import { $, toast, ask } from './util.js';

const SITE = 'https://tanlan712.github.io/JiangXin/';
const APK_URL = 'https://github.com/Tanlan712/JiangXin/releases/latest/download/JiangXin.apk';

function plugin() {
  return window.Capacitor?.isNativePlatform?.() ? window.Capacitor.Plugins.CapacitorUpdater : null;
}

let busy = false;
async function checkUpdate(manual) {
  const up = plugin();
  if (!up || busy) return;
  busy = true;
  const btn = $('#up-check');
  btn.disabled = true;
  try {
    const res = await fetch(SITE + 'version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const v = await res.json();

    if (v.native > NATIVE) {
      const ok = await ask(`有新版 App（v${v.version}）需要重新安裝 APK，資料會保留。要現在下載嗎？\n下載後點開，選「更新」即可。`, '下載 APK');
      if (ok) location.href = APK_URL;
      return;
    }
    if (v.native !== NATIVE || !(v.build > BUILD)) {
      if (manual) toast('已經是最新版');
      return;
    }

    const version = String(v.build);
    const { bundles } = await up.list();
    let bundle = bundles.find((b) => b.version === version && b.status !== 'error');
    if (!bundle) {
      if (manual) toast('下載更新中…');
      bundle = await up.download({ url: new URL(v.url, SITE).href, version });
    }
    await up.next({ id: bundle.id });
    const now = await ask(`新版 v${v.version}（${v.build}）已下載好，要現在重新開啟套用嗎？\n資料不會受影響。`, '立即更新');
    if (now) await up.set({ id: bundle.id });
    else toast('下次開啟 App 時會自動套用');
  } catch (e) {
    console.warn('update check failed', e);
    if (manual) toast('檢查更新失敗，請確認網路');
  } finally {
    busy = false;
    btn.disabled = false;
  }
}

export function initUpdater() {
  $('#app-version').textContent = `匠心工地 v${VERSION}${BUILD ? `（${BUILD}）` : ''} · 可離線使用`;
  const up = plugin();
  if (!up) return;
  // 告訴更新元件這一版能正常開啟；新版若開不起來，會自動退回上一版
  up.notifyAppReady().catch(() => {});
  $('#up-check').hidden = false;
  $('#up-check').addEventListener('click', () => checkUpdate(true));
  setTimeout(() => checkUpdate(false), 3000);
}
