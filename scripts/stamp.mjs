// 打包時寫入版本資訊：www/js/build.js（App 內顯示與比對用）和 version.json（線上更新用）
// 用法：node scripts/stamp.mjs <build 編號> [version.json 輸出路徑]
import { readFileSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const build = Number(process.argv[2]);
if (!Number.isInteger(build) || build < 1) throw new Error('build 編號要是正整數');

writeFileSync(
  'www/js/build.js',
  `// 版本資訊。GitHub Actions 打包時會用 scripts/stamp.mjs 覆寫這個檔案。
export const VERSION = '${pkg.version}';
export const BUILD = ${build};
export const NATIVE = ${pkg.nativeVersion};
`,
);

const out = process.argv[3];
if (out) {
  const info = { version: pkg.version, build, native: pkg.nativeVersion, url: `update/www-${build}.zip` };
  writeFileSync(out, JSON.stringify(info, null, 2) + '\n');
}
console.log(`v${pkg.version} build ${build} native ${pkg.nativeVersion}`);
