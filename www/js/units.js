// 單位換算資料：每個單位以「基準單位」的倍數表示
// 長度基準：公尺；面積基準：平方公尺；體積基準：立方公尺；重量基準：公斤

const TAI_CHI = 10 / 33; // 1 台尺 = 10/33 公尺 ≈ 0.30303 m
const PING = 400 / 121; // 1 坪 = 6台尺 × 6台尺 ≈ 3.30579 m²
const CAI_VOLUME = (TAI_CHI / 10) * (TAI_CHI / 10) * (TAI_CHI * 10); // 1 才 = 1台寸 × 1台寸 × 10台尺

export const UNIT_GROUPS = [
  {
    id: 'length',
    name: '長度',
    units: [
      { id: 'm', name: '公尺', factor: 1 },
      { id: 'cm', name: '公分', factor: 0.01 },
      { id: 'mm', name: '公釐 (mm)', factor: 0.001 },
      { id: 'taichi', name: '台尺', factor: TAI_CHI },
      { id: 'taicun', name: '台寸', factor: TAI_CHI / 10 },
      { id: 'taifen', name: '台分', factor: TAI_CHI / 100 },
      { id: 'taizhang', name: '台丈', factor: TAI_CHI * 10 },
      { id: 'ft', name: '英呎 (ft)', factor: 0.3048 },
      { id: 'in', name: '英吋 (in)', factor: 0.0254 },
      { id: 'yd', name: '碼 (yd)', factor: 0.9144 },
    ],
  },
  {
    id: 'area',
    name: '面積',
    units: [
      { id: 'm2', name: '平方公尺', factor: 1 },
      { id: 'ping', name: '坪', factor: PING },
      { id: 'cai2', name: '才（平方台尺）', factor: TAI_CHI * TAI_CHI },
      { id: 'cm2', name: '平方公分', factor: 0.0001 },
      { id: 'ft2', name: '平方英呎', factor: 0.3048 * 0.3048 },
      { id: 'in2', name: '平方英吋', factor: 0.0254 * 0.0254 },
      { id: 'jia', name: '甲', factor: PING * 2934 },
      { id: 'fen', name: '分（土地）', factor: PING * 293.4 },
      { id: 'ha', name: '公頃', factor: 10000 },
    ],
  },
  {
    id: 'volume',
    name: '材積／體積',
    units: [
      { id: 'm3', name: '立方公尺', factor: 1 },
      { id: 'cai', name: '才（木材）', factor: CAI_VOLUME },
      { id: 'shi', name: '石（100才）', factor: CAI_VOLUME * 100 },
      { id: 'taichi3', name: '立方台尺', factor: TAI_CHI ** 3 },
      { id: 'ft3', name: '立方英呎', factor: 0.3048 ** 3 },
      { id: 'bf', name: '板呎 (BF)', factor: 0.3048 * 0.3048 * 0.0254 },
      { id: 'l', name: '公升', factor: 0.001 },
    ],
  },
  {
    id: 'weight',
    name: '重量',
    units: [
      { id: 'kg', name: '公斤', factor: 1 },
      { id: 'g', name: '公克', factor: 0.001 },
      { id: 't', name: '公噸', factor: 1000 },
      { id: 'taijin', name: '台斤', factor: 0.6 },
      { id: 'tailiang', name: '台兩', factor: 0.0375 },
      { id: 'lb', name: '磅 (lb)', factor: 0.45359237 },
    ],
  },
];

export function convert(value, fromFactor, toFactor) {
  return (value * fromFactor) / toFactor;
}

// 木材材積：寬(台寸) × 厚(台寸) × 長(台尺) × 數量 ÷ 10 = 才
export function timberCai(widthCun, thickCun, lengthChi, qty) {
  return (widthCun * thickCun * lengthChi * qty) / 10;
}

export const CAI_TO_M3 = CAI_VOLUME;
export const PING_TO_M2 = PING;

export function formatNumber(n, digits = 4) {
  if (!Number.isFinite(n)) return '—';
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1e9 || abs < 1e-6) return n.toExponential(3);
  return n.toLocaleString('zh-TW', { maximumFractionDigits: digits });
}
