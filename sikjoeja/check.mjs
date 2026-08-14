/* 식죄자 자체 점검 — 의존성 없음. 실행: node check.mjs
   앞선 두 게임(창귀록·마지막 국도)에서 밟은 지뢰를 전부 가드로 세우고,
   추가로 **이 게임이 RPG인지**를 검사한다:
     1. 캐릭터가 결과를 매개하는가 (죄가 없으면 단서가 안 보이는가)
     2. 캐릭터가 변하면 보이는 것이 변하는가
     3. 모든 결말이 '주입'이 아니라 '플레이'로 도달하는가
   깨지면 종료코드 1. */
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('./sikjoeja.html', import.meta.url), 'utf8');
const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));

let pass = 0, ran = 0;
const ok = (name, fn) => {
  ran++;
  try { fn(); console.log('  OK   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
};
console.log('식죄자 점검\n');

ok('스크립트가 구문 오류 없이 컴파일된다', () => { new Script(js); });

/* ══════ DOM 껍데기 — jsdom 없이 손으로 깎았다 ══════ */
function boot(seed = 1) {
  const el = () => ({
    style: {}, hidden: false, kids: [], disabled: false, className: '', onclick: null,
    _h: '', _t: '',
    set innerHTML(v) { this._h = v; this.kids.length = 0; }, get innerHTML() { return this._h; },
    set textContent(v) { this._t = v; }, get textContent() { return this._t; },
    appendChild(c) { this.kids.push(c); }, remove() {},
    addEventListener() {}, getContext: () => null, focus() {},
  });
  const byId = {}, store = new Map();
  let rng = seed;
  const ctx = {
    Math: Object.create(Math), JSON, Set, console, Object, Array, String, Number,
    document: { getElementById: id => (byId[id] ||= el()), createElement: () => el() },
    localStorage: {
      setItem: (k, v) => store.set(k, String(v)),
      getItem: k => (store.has(k) ? store.get(k) : null),
      removeItem: k => store.delete(k),
    },
    location: { search: '', hash: '' },
    addEventListener() {}, innerWidth: 800, innerHeight: 600, scrollTo() {}, confirm: () => true,
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  ctx.Math.random = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  new Script(js +
    '\n;globalThis.__S=()=>S;globalThis.__set=o=>Object.assign(S,o);' +
    'globalThis.__reveal=(ci,li)=>reveal(CASES[ci].look[li]);' +
    'globalThis.__cases=()=>CASES;globalThis.__sid=()=>SID;globalThis.__kmax=()=>KARMA_MAX;'
  ).runInNewContext(ctx);
  return {
    ctx, store, byId,
    buttons: () => byId.acts.kids,
    enabled: () => byId.acts.kids.filter(b => typeof b.onclick === 'function' && !b.disabled),
    main: () => byId.main.kids.map(k => k._h).join('\n'),
    crashed: () => /끊김/.test(byId.main.kids.map(k => k._h).join('\n')),
    S: () => ctx.__S(),
    reached: () => new Set(JSON.parse(store.get('sikjoeja.endings.v1') || '[]')),
  };
}
const hit = (bs, re) => bs.find(b => re.test(b.innerHTML));

/* ══════ RPG 조건 1 — 캐릭터가 지각을 매개하는가 ══════ */
ok('[RPG] 죄가 없으면 단서 줄이 화면에 아예 안 뜬다', () => {
  const g = boot();
  const CASES = g.ctx.__cases();
  let gatedTotal = 0;
  for (let ci = 0; ci < CASES.length; ci++) {
    for (let li = 0; li < CASES[ci].look.length; li++) {
      g.ctx.__set({ sin: { no: 0, tam: 0, ae: 0, wi: 0, geop: 0 } });
      const blind = g.ctx.__reveal(ci, li);
      g.ctx.__set({ sin: { no: 5, tam: 5, ae: 5, wi: 5, geop: 5 } });
      const seer = g.ctx.__reveal(ci, li);
      assert.equal(blind.length, 1, `상${ci} 항목${li}: 죄 0인데 ${blind.length}줄 — 게이트가 없다`);
      assert.ok(seer.length > blind.length, `상${ci} 항목${li}: 죄를 다 져도 더 보이는 게 없다`);
      gatedTotal += seer.length - blind.length;
    }
  }
  assert.ok(gatedTotal >= 30, `게이트된 줄이 ${gatedTotal}개뿐 — 캐릭터 매개가 얕다`);
});

ok('[RPG] 죄가 오르면 같은 자리에서 더 보인다 (단조 증가)', () => {
  const g = boot();
  const SID = g.ctx.__sid();
  for (const id of SID) {
    g.ctx.__set({ sin: { no: 0, tam: 0, ae: 0, wi: 0, geop: 0 } });
    let low = 0;
    const CASES = g.ctx.__cases();
    for (let ci = 0; ci < CASES.length; ci++)
      for (let li = 0; li < CASES[ci].look.length; li++) low += g.ctx.__reveal(ci, li).length;
    const s = { no: 0, tam: 0, ae: 0, wi: 0, geop: 0 }; s[id] = 2;
    g.ctx.__set({ sin: s });
    let high = 0;
    for (let ci = 0; ci < CASES.length; ci++)
      for (let li = 0; li < CASES[ci].look.length; li++) high += g.ctx.__reveal(ci, li).length;
    assert.ok(high > low, `${id}를 2까지 져도 보이는 줄이 안 는다 — 죽은 능력치다`);
  }
});

ok('[RPG] 모든 상의 정답 죄는 읽어낼 수 있다 (불가능한 퍼즐 금지)', () => {
  const g = boot();
  const CASES = g.ctx.__cases();
  for (const c of CASES) {
    if (!c.dominant) continue;                 // 마지막 상엔 정답이 없다(설계)
    const tells = c.look.flatMap(l => l.tells || []).filter(t => t.sin === c.dominant);
    assert.ok(tells.length >= 1,
      `상 '${c.id}'의 정답(${c.dominant})을 알려주는 단서가 없다 — 찍기밖에 안 된다`);
  }
});

ok('[RPG] 프로즈 제거 테스트 — 정답 죄는 숫자로 새어나가지 않는다', () => {
  // 정답이 HUD/상태/선택지 문구 어디에도 노출되면 산문을 안 읽고 풀 수 있다.
  assert.doesNotMatch(js, /dominant[^:]*\}\s*\)|innerHTML[^;]*dominant/,
    'dominant가 화면 렌더에 새어 있다');
  const paintFn = js.match(/function paint\(\)\{[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(paintFn, /dominant/, 'HUD가 정답을 노출한다');
  const mealFn = js.match(/function mealPhase\(\)\{[\s\S]*?\n\s*show\(n, ch\);\n\}/)[0];
  assert.doesNotMatch(mealFn, /c\.dominant[^)]*\?[^:]*:[^;]*k:/,
    '선택지 라벨이 정답에 따라 달라진다 — 읽지 않고 풀 수 있다');
});

ok('[RPG] 다섯 죄가 모두 눈·손·목소리를 갖고 실제로 쓰인다', () => {
  const g = boot();
  const SID = g.ctx.__sid();
  assert.equal(SID.length, 5, `죄가 ${SID.length}개`);
  const SIN = new Script(js.match(/const SIN = \{[\s\S]*?\n\};/)[0] + 'SIN').runInNewContext();
  for (const id of SID) {
    for (const f of ['name', 'full', 'eye', 'hand', 'voice'])
      assert.ok(SIN[id][f] && SIN[id][f].length > 0, `${id}의 ${f}가 비어 있다`);
  }
  // 목소리가 실제로 장면에 끼어드는 경로가 있는가
  assert.match(js, /function voiceLine\(\)/, 'voiceLine 없음');
  assert.ok((js.match(/voiceLine\(\)/g) || []).length >= 3, '목소리를 부르는 곳이 너무 적다');
  // 죄가 결말에 반영되는가
  assert.match(js, /function echoes\(\)/, 'echoes 없음');
});

/* ══════ 회귀 가드 — 앞선 두 게임의 지뢰 ══════ */
ok('[회귀] 결말 도감 키와 end()의 case가 정확히 일치한다', () => {
  const keys = [...js.matchAll(/(\w+):\s*\{key:'([^']+)'/g)].map(m => m[2]);
  const cases = [...js.matchAll(/case '([^']+)':/g)].map(m => m[1]);
  assert.ok(keys.length >= 5, `결말이 ${keys.length}종`);
  for (const k of keys) assert.ok(cases.includes(k), `결말 '${k}'를 그리는 case가 없다`);
  for (const c of cases) assert.ok(keys.includes(c), `case '${c}'가 도감에 없다`);
});

ok('[회귀] 산문 필드에 빈 문자열이 없다 (문구가 비면 그 줄이 조용히 사라진다)', () => {
  // t(버튼 부제)·cls는 비어도 되는 UI 속성이다. 산문을 담는 키만 본다.
  const empties = [...js.matchAll(
    /\b(line|base|rest|unrest|eye|hand|voice|name|full|title|grade|place|who|k):\s*''/g)].map(m => m[1]);
  assert.deepEqual(empties, [], `빈 산문 필드: ${empties.join(', ')}`);
});

ok('[회귀] 수치가 같은 no-op 삼항이 없다', () => {
  const noops = [...js.matchAll(/\?\s*(-?\d+(?:\.\d+)?)\s*:\s*(-?\d+(?:\.\d+)?)/g)]
    .filter(m => Number(m[1]) === Number(m[2])).map(m => m[0]);
  assert.deepEqual(noops, [], `양 분기가 같은 삼항: ${noops.join(', ')}`);
});

ok('[회귀] 양자택일 조사 표기가 없다 (J()로 처리)', () => {
  const bad = [...js.matchAll(/[가-힣]?(을\(를\)|은\(는\)|이\(가\)|과\(와\))/g)].map(m => m[0]);
  assert.deepEqual(bad, [], `조사: ${bad.join(', ')}`);
});

ok('[회귀] HUD가 CSS 특정도에 지지 않는다', () => {
  assert.match(css, /#hud\[hidden\]\s*\{[^}]*display:\s*none/,
    'HUD.hidden이 무효가 되어 표지·결말에 남는다');
});

ok('[회귀] 한글 본문에 합성 이탤릭을 쓰지 않는다', () => {
  assert.doesNotMatch(css, /font-style:\s*italic/, '한글엔 이탤릭 자족이 없다');
});

ok('[회귀] 설정한 플래그는 모두 읽힌다', () => {
  const set = [...js.matchAll(/S\.flags\.add\('(\w+)'\)/g)].map(m => m[1]);
  for (const f of new Set(set))
    assert.ok(new RegExp(`has\\('${f}'\\)`).test(js), `플래그 '${f}'가 설정만 되고 안 읽힌다`);
});

/* ══════ 실제로 굴러가는가 ══════ */
ok('게임이 부팅되고 표지에 선택지가 뜬다', () => {
  const g = boot();
  assert.ok(g.enabled().length > 0, '표지에 버튼이 없다');
});

ok('무작위 400판에서 크래시·막다른 화면이 없다', () => {
  const bad = [];
  for (let s = 1; s <= 400 && bad.length < 5; s++) {
    const g = boot(s);
    let r = s;
    for (let step = 0; step < 120; step++) {
      const bs = g.enabled();
      if (!bs.length) { bad.push(`seed ${s} step ${step}: 누를 것이 없다`); break; }
      try { bs[(r = (r * 1103515245 + 12345) & 0x7fffffff) % bs.length].onclick(); }
      catch (e) { bad.push(`seed ${s} step ${step}: ${e.message}`); break; }
      if (g.crashed()) { bad.push(`seed ${s} step ${step}: 삼켜진 예외`); break; }
    }
  }
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length}건`);
});

/* ══════ 결말 도달 — 주입이 아니라 플레이로 ══════
   상태를 직접 넣어 "도달 가능"이라고 하는 것은 증명이 아니다(마지막 국도 alone 교훈).
   정책을 정해 표지부터 끝까지 실제로 눌러 본다. */
function playOut(policy, seed = 3, maxStep = 200) {
  const g = boot(seed);
  let r = seed;
  for (let step = 0; step < maxStep; step++) {
    const bs = g.enabled();
    if (!bs.length) break;
    const b = policy(bs, g.S(), g) || bs[(r = (r * 1103515245 + 12345) & 0x7fffffff) % bs.length];
    try { b.onclick(); } catch (e) { return { crash: e.message, reached: g.reached(), g }; }
    if (g.crashed()) return { crash: '고장 화면', reached: g.reached(), g };
    if (g.S().over && /기록을 본다/.test(g.buttons().map(x => x.innerHTML).join(''))) break;
  }
  return { reached: g.reached(), g };
}
const advance = bs => hit(bs, /첫 상을 받으러|첫 마을로|방을 살핀다|상 앞에 앉는다|다음 마을로|그리고 겨울이|…$/);

ok('[플레이 도달] 다 먹으며 완주하면 침식된다', () => {
  const p = bs => hit(bs, /다 먹는다/) || advance(bs);
  const R = playOut(p, 3);
  assert.ok(!R.crash, R.crash);
  assert.ok(R.reached.has('sik'), `침식에 닿지 않았다 (닿은 것: ${[...R.reached]})`);
});

ok('[플레이 도달] 정답을 알고 골라 먹으면 저울(최선)에 닿는다', () => {
  // 회차를 거듭해 정답을 아는 플레이어. 업 예산이 실제로 맞는지가 핵심이다.
  const g0 = boot();
  const CASES = g0.ctx.__cases();
  const SIN = new Script(js.match(/const SIN = \{[\s\S]*?\n\};/)[0] + 'SIN').runInNewContext();
  const p = (bs, S) => {
    const c = CASES[S.at];
    if (c) {
      const want = c.dominant || 'ae';
      const b = hit(bs, new RegExp(`${SIN[want].full.replace(/[()]/g, '\\$&')}만 먹는다`));
      if (b) return b;
    }
    return advance(bs);
  };
  const R = playOut(p, 5);
  assert.ok(!R.crash, R.crash);
  assert.ok(R.reached.has('scale'),
    `저울에 닿지 않았다 (닿은 것: ${[...R.reached]}) — 업 예산이 어긋났는지 확인하라`);
});

ok('[플레이 도달] 계속 물리면 깨끗한 손에 닿는다', () => {
  const p = bs => hit(bs, /물린다/) || advance(bs);
  const R = playOut(p, 7);
  assert.ok(!R.crash, R.crash);
  assert.ok(R.reached.has('clean'), `깨끗한 손에 닿지 않았다 (닿은 것: ${[...R.reached]})`);
});

ok('[플레이 도달] 한 죄만 계속 먹으면 이름을 잃는다', () => {
  const p = bs => hit(bs, /노\(怒\)만 먹는다/) || advance(bs);
  const R = playOut(p, 11);
  assert.ok(!R.crash, R.crash);
  assert.ok(R.reached.has('name'), `이름을 잃다에 닿지 않았다 (닿은 것: ${[...R.reached]})`);
});

ok('[플레이 도달] 다섯 결말이 모두 실제 플레이로 열린다', () => {
  const g0 = boot();
  const CASES = g0.ctx.__cases();
  const SIN = new Script(js.match(/const SIN = \{[\s\S]*?\n\};/)[0] + 'SIN').runInNewContext();
  const all = new Set();
  const run = (p, s) => { for (const k of playOut(p, s).reached) all.add(k); };
  run(bs => hit(bs, /다 먹는다/) || advance(bs), 3);
  run((bs, S) => {
    const c = CASES[S.at];
    if (c) { const b = hit(bs, new RegExp(`${SIN[c.dominant || 'ae'].full.replace(/[()]/g, '\\$&')}만 먹는다`)); if (b) return b; }
    return advance(bs);
  }, 5);
  run(bs => hit(bs, /물린다/) || advance(bs), 7);
  run(bs => hit(bs, /노\(怒\)만 먹는다/) || advance(bs), 11);
  // 반쪽: 앞 절반은 다 먹고 뒤 절반은 물린다
  run((bs, S) => (S.at < 3 ? hit(bs, /다 먹는다/) : hit(bs, /물린다/)) || advance(bs), 13);
  for (const k of ['sik', 'scale', 'clean', 'name', 'half'])
    assert.ok(all.has(k), `결말 '${k}'가 플레이로 열리지 않는다 — 죽은 분기`);
});

/* ══════ 진행 불변식 ══════ */
ok('한 상에서 살필 수 있는 것은 둘뿐이다', () => {
  const g = boot(2);
  g.enabled()[0].onclick();                       // 첫 상을 받으러 간다
  hit(g.enabled(), /첫 마을로/)?.onclick();
  hit(g.enabled(), /방을 살핀다/).onclick();
  let looks = 0;
  for (let i = 0; i < 6; i++) {
    const b = g.enabled().find(x => !/상 앞에 앉는다/.test(x.innerHTML));
    if (!b) break;
    b.onclick(); looks++;
  }
  assert.equal(looks, 2, `${looks}군데를 봤다 — 주의 예산이 새고 있다`);
  assert.ok(hit(g.enabled(), /상 앞에 앉는다/), '살핀 뒤에 상으로 갈 길이 없다');
});

ok('업이 한계에 닿으면 침식으로 끝난다 (조용한 진행 금지)', () => {
  assert.match(js, /if\(k >= KARMA_MAX\)[\s\S]{0,160}?end\('sik'\)/, '업 한계가 결말로 이어지지 않는다');
  const g = boot();
  assert.equal(typeof g.ctx.__kmax(), 'number');
});

console.log(`\n${pass}/${ran} 통과`);
if (process.exitCode) console.log('실패 있음');
