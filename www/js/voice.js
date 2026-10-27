// 語音輸入：App 裡用 Android 內建語音辨識，瀏覽器裡用 Web Speech API
import { toast } from './util.js';

function nativePlugin() {
  const cap = window.Capacitor;
  return cap?.isNativePlatform?.() ? cap.Plugins?.SpeechRecognition : null;
}

const WebSpeech = window.SpeechRecognition || window.webkitSpeechRecognition;

export function voiceSupported() {
  return !!(nativePlugin() || WebSpeech);
}

export async function listen() {
  const plugin = nativePlugin();
  if (plugin) {
    const perm = await plugin.requestPermissions();
    if (perm.speechRecognition !== 'granted') throw new Error('沒有麥克風權限');
    const { matches } = await plugin.start({ language: 'zh-TW', maxResults: 1, popup: true, partialResults: false, prompt: '請說話' });
    return matches?.[0] || '';
  }
  return new Promise((resolve, reject) => {
    const rec = new WebSpeech();
    rec.lang = 'zh-TW';
    rec.interimResults = false;
    rec.onresult = (e) => resolve(e.results[0][0].transcript);
    rec.onerror = (e) => reject(new Error(e.error === 'not-allowed' ? '沒有麥克風權限' : '聽不清楚，再試一次'));
    rec.onend = () => resolve('');
    rec.start();
  });
}

// 在輸入框旁加上 🎤 按鈕；按了把辨識結果接在後面
export function attachMic(input) {
  if (!voiceSupported()) return;
  const wrap = document.createElement('div');
  wrap.className = 'with-mic';
  input.replaceWith(wrap);
  wrap.append(input);
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'mic';
  btn.textContent = '🎤';
  btn.setAttribute('aria-label', '語音輸入');
  wrap.append(btn);
  btn.addEventListener('click', async () => {
    btn.classList.add('listening');
    try {
      const text = await listen();
      if (text) {
        input.value = input.value ? input.value + ' ' + text : text;
        input.dispatchEvent(new Event('input', { bubbles: true }));
      }
    } catch (err) {
      toast(err.message);
    } finally {
      btn.classList.remove('listening');
    }
  });
}
