// 스탬프 카메라 코드를 결함마킹 앱이 그대로 쓸 수 있는 한 파일(stampcam.js)로 묶는다.
//
// src/ 의 6개 파일은 번호 스탬프 카메라(yeop9701/stamp-camera v1.7.0) js/ 를 그대로 복사한 것이다.
// 결함마킹 앱은 모듈이 아닌 일반 <script> 로 돌아가고, 파일로 열거나(file://) 데스크톱 앱으로도
// 쓰기 때문에 ES 모듈 import 를 쓸 수 없다. 그래서 파일마다 함수 안에 가두고(이름 충돌 방지)
// export 만 꺼내 붙인 뒤, 마지막에 bridge.js(결함마킹 ↔ 스탬프 카메라 연결)를 잇는다.
//
// 스탬프 카메라를 고치면 src/ 에 다시 복사하고  node stampcam/build.mjs  를 돌린다.
import { readFileSync, writeFileSync } from 'node:fs';

const dir = new URL('./', import.meta.url);
const MODULES = ['counter', 'settings', 'stamp', 'save', 'storage', 'camera'];

let out = '/* 자동 생성 파일 — 직접 고치지 말 것. 원본 : stampcam/src/*.js + stampcam/bridge.js, 만들기 : node stampcam/build.mjs */\n';
out += '(function () {\n"use strict";\n';
for (const m of MODULES) {
  let src = readFileSync(new URL(`src/${m}.js`, dir), 'utf8');
  if (/^\s*import\s/m.test(src)) throw new Error(`${m}.js 에 import 가 있다 — build.mjs 를 고쳐야 한다`);
  const names = [];
  src = src.replace(/^export\s+(async\s+function|function|class|const|let)\s+([A-Za-z0-9_$]+)/gm, (_, kind, name) => {
    names.push(name);
    return `${kind} ${name}`;
  });
  if (/^export\s/m.test(src)) throw new Error(`${m}.js 에 처리하지 못한 export 가 있다`);
  out += `\n/* ── ${m}.js ── */\nconst { ${names.join(', ')} } = (function () {\n${src}\nreturn { ${names.join(', ')} };\n})();\n`;
}
out += '\n/* ── bridge.js ── */\n' + readFileSync(new URL('bridge.js', dir), 'utf8');
out += '\n})();\n';
writeFileSync(new URL('stampcam.js', dir), out);
console.log('stampcam/stampcam.js', out.length, 'bytes');
