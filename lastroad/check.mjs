/* 마지막 국도 자체 점검 — 의존성 없음. 실행: node check.mjs
   창귀록 회고에서 얻은 지뢰들을 구조적으로 막는지만 본다. 깨지면 종료코드 1.
   1) 막다른 화면 0 (소프트락 금지)  2) 엔딩 전부 도달 가능 (죽은 분기 금지)
   3) 좌석 불변식  4) 자원 고갈은 엔딩이지 브릭이 아님 */
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('./lastroad.html', import.meta.url), 'utf8');
const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));

let pass = 0, ran = 0;
const ok = (name, fn) => {
  ran++;
  try { fn(); console.log('  OK   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
};

console.log('마지막 국도 점검\n');

ok('스크립트가 구문 오류 없이 컴파일된다', () => { new Script(js); });

/* ── 정적 구조 검사 ── */
ok('엔딩 도감 키와 end() 분기가 정확히 일치한다', () => {
  const keys = [...js.matchAll(/(\w+):\{ key:'([^']+)'/g)].map(m => m[2]);
  const cases = [...js.matchAll(/case '([^']+)':/g)].map(m => m[1]);
  assert.ok(keys.length >= 6, `엔딩이 ${keys.length}종 — 최소 6종`);
  for (const k of keys)
    assert.ok(cases.includes(k), `엔딩 '${k}'를 그리는 case가 end()에 없다 → 도달해도 빈 화면`);
  for (const c of cases)
    assert.ok(keys.includes(c), `case '${c}'가 ENDINGS 테이블에 없다`);
});

ok('모든 동승자 특성(trait)이 실제 코드에서 쓰인다 (죽은 특성 금지)', () => {
  // 창귀록 교훈: 엔딩/씬에 반영 안 되는 상태·특성을 두지 않는다.
  assert.ok(/aboard\('dohyeon'\)/.test(js), '도현(정비) 특성이 어디서도 안 쓰인다');
  assert.ok(/aboard\('hanna'\)/.test(js), '한나(의사) 특성이 어디서도 안 쓰인다');
  assert.ok(/aboard\('jun'\)/.test(js), '준(군인) 특성이 어디서도 안 쓰인다');
  assert.ok(/id==='eunwoo'|aboard\('eunwoo'\)/.test(js), '은우(희망) 특성이 어디서도 안 쓰인다');
});

ok('양자택일 조사 표기가 없다 (받침 판별 J()로 처리 — 한국어 프로즈 폴리시)', () => {
  const bad = [...js.matchAll(/[가-힣]?(을\(를\)|를\(을\)|은\(는\)|는\(은\)|이\(가\)|가\(이\)|과\(와\)|와\(과\))/g)].map(m => m[0]);
  assert.deepEqual(bad, [], `조사 '${bad.join(', ')}' — 이름 뒤 조사는 J(name,'을/를') 형태로 골라라`);
  assert.match(js, /function J\(w, pair\)/, '조사 헬퍼 J()가 사라졌다');
});

ok('수치가 같은 no-op 삼항이 없다 (항상-참 게이트 — 문자열 검사가 놓치는 형태)', () => {
  // res('hope', aboard('eunwoo')?0:-0) 같은 코드는 '특성이 쓰인다' 검사를 통과하면서
  // 실제로는 아무것도 하지 않는다. 창귀록 hasYugo와 같은 죽은 게이트다.
  const noops = [...js.matchAll(/\?\s*(-?\d+(?:\.\d+)?)\s*:\s*(-?\d+(?:\.\d+)?)/g)]
    .filter(m => Number(m[1]) === Number(m[2])).map(m => m[0]);
  assert.deepEqual(noops, [], `양 분기 값이 같은 삼항: ${noops.join(', ')}`);
});

ok('숨김이 필요한 HUD가 CSS 특정도에 지지 않는다', () => {
  // #hud(1,0,0)는 UA의 [hidden]{display:none}(0,1,0)을 이긴다.
  // paint()가 HUD.hidden을 세워도 명시 규칙이 없으면 화면에 남는다.
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  assert.match(css, /#hud\[hidden\]\s*\{[^}]*display:\s*none/,
    'HUD.hidden이 무효가 된다 — 표지/엔딩에 HUD가 남아 서사와 모순된다');
  assert.match(js, /HUD\.hidden\s*=\s*true/, 'paint()가 HUD를 숨기려는 시도 자체가 사라졌다');
});

ok('한글 본문에 합성 이탤릭을 쓰지 않는다 (한국어 타이포 폴리시)', () => {
  const css = html.slice(html.indexOf('<style>'), html.indexOf('</style>'));
  assert.doesNotMatch(css, /font-style:\s*italic/,
    '한글엔 이탤릭 자족이 없어 브라우저가 네모틀을 밀어 그린다 — 색/여백으로 구분하라');
});

ok('설정한 플래그는 모두 어딘가에서 읽힌다 (죽은 상태 금지 — 창귀록 gukVisited 교훈)', () => {
  const set = [...js.matchAll(/S\.flags\.add\('(\w+)'\)/g)].map(m => m[1]);
  assert.ok(set.length >= 3, `플래그가 ${set.length}개 — 정규식을 확인하라`);
  for (const f of new Set(set))
    assert.ok(new RegExp(`has\\('${f}'\\)`).test(js), `플래그 '${f}'가 설정만 되고 읽히지 않는다`);
});

ok('연료 0은 좌초 엔딩, 희망 0은 붕괴 엔딩으로 간다 (조용한 브릭 금지)', () => {
  assert.match(js, /S\.fuel\s*<\s*0.*end\('stranded'\)/, '연료 음수가 좌초로 가지 않는다');
  assert.match(js, /S\.hope\s*<=\s*0.*end\('collapse'\)/, '희망 0이 붕괴로 가지 않는다');
});

ok('인카운터 풀에 항상 반복 가능한 것이 있다 (빈손 추첨 금지)', () => {
  const repeats = [...js.matchAll(/repeat:true/g)].length;
  assert.ok(repeats >= 2, `반복 인카운터가 ${repeats}개 — 풀이 비면 추첨이 undefined를 반환한다`);
  assert.match(js, /const FALLBACK\s*=/, '폴백 인카운터가 없다');
});

/* ── 실제로 굴러가는가: 손수 깎은 DOM 껍데기 (jsdom 없음) ── */
function boot(seed) {
  const el = () => ({
    style: {}, hidden: false, kids: [], disabled: false, className: '', onclick: null,
    _h: '', _t: '',
    set innerHTML(v){ this._h = v; this.kids.length = 0; }, get innerHTML(){ return this._h; },
    set textContent(v){ this._t = v; }, get textContent(){ return this._t; },
    appendChild(c){ this.kids.push(c); }, remove(){},
    addEventListener(){}, getContext: () => null,
  });
  const byId = {};
  const store = new Map();
  let rng = seed;
  const ctx = {
    Math: Object.create(Math), JSON, Set, console, Object, Array,
    document: { getElementById: (id) => (byId[id] ||= el()), createElement: () => el() },
    localStorage: {
      setItem: (k, v) => store.set(k, String(v)),
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      removeItem: (k) => store.delete(k),
    },
    location: { search: '', hash: '' },
    addEventListener(){}, innerWidth: 800, innerHeight: 600, scrollTo(){}, confirm: () => true,
  };
  ctx.window = ctx; ctx.globalThis = ctx;
  ctx.Math.random = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  new Script(js +
    '\n;globalThis.__getS=()=>S;globalThis.__set=(o)=>Object.assign(S,o);' +
    'globalThis.__enc=(id)=>{const e=ENC.find(x=>x.id===id)||FALLBACK;e.f();};' +
    'globalThis.__harbor=()=>harbor();globalThis.__drive=()=>drive();'
  ).runInNewContext(ctx);
  return {
    ctx, store,
    buttons: () => byId.acts.kids,
    // 렌더된 본문 텍스트. crash()는 '고장' 헤더를 그리므로 이걸로 삼켜진 예외를 잡는다.
    main: () => (byId.main ? byId.main.kids.map(k => k._h).join('\n') : ''),
    crashed: () => /고장/.test(byId.main ? byId.main.kids.map(k => k._h).join('\n') : ''),
    enabled: () => byId.acts.kids.filter(b => typeof b.onclick === 'function' && !b.disabled),
    click: (re) => {
      const b = byId.acts.kids.find(x => typeof x.onclick === 'function' && re.test(x.innerHTML));
      assert.ok(b, `버튼을 못 찾았다: ${re}\n       현재: ${byId.acts.kids.map(x=>x.innerHTML).join(' | ')}`);
      b.onclick();
    },
    S: () => ctx.__getS(),
    reached: () => new Set(JSON.parse(store.get('lastroad.endings.v1') || '[]')),
  };
}

ok('게임이 부팅되고 표지에 선택지가 뜬다', () => {
  const g = boot(1);
  assert.ok(g.enabled().length > 0, '표지에 누를 버튼이 없다');
});

/* ── 무작위 플레이: 크래시도, 막다른 화면도, 좌석 초과도 없어야 한다 ── */
const seenAll = new Set();
let games = 0, arrivals = 0;
ok('무작위 500판에서 크래시·막다른 화면·좌석 초과가 없다', () => {
  const bad = [];
  for (let s = 1; s <= 500 && bad.length < 5; s++) {
    const g = boot(s);
    let r = s * 2 + 1;
    const pick = (n) => ((r = (r * 1103515245 + 12345) & 0x7fffffff) % n);
    // 새 판이 시작될 때마다 표지→출발이 한 번 더 눌리며 여러 게임이 이어진다
    for (let step = 0; step < 300; step++) {
      const S = g.S();
      const bs = g.enabled();
      if (S.party && S.party.length > 3) { bad.push(`seed ${s} step ${step}: 좌석 초과 ${S.party.length}`); break; }
      if (!bs.length) {
        // 버튼이 없어도 되는 유일한 상태는 없다 — 표지/씬/엔딩 모두 버튼을 준다
        bad.push(`seed ${s} step ${step}: 누를 것이 없다 (over=${S.over})`); break;
      }
      try { bs[pick(bs.length)].onclick(); }
      catch (e) { bad.push(`seed ${s} step ${step}: ${e.message}`); break; }
      // crash()가 예외를 삼켜 '고장' 화면을 그렸는가 — 버튼은 멀쩡해 위 검사를 통과하므로 따로 본다
      if (g.crashed()) { bad.push(`seed ${s} step ${step}: 삼켜진 예외 (고장 화면)`); break; }
    }
    games++;
    for (const k of g.reached()) { seenAll.add(k); if (k === 'together' || k === 'gaveseat' || k === 'alone') arrivals++; }
  }
  assert.deepEqual(bad.slice(0, 5), [], `${bad.length}건`);
});

/* ── 엔딩 6+종을 직접 구동해 도달성을 증명한다 (무작위가 못 밟는 것 포함) ── */
function drives(setup, then) {
  const g = boot(42);
  ctx_set(g, setup);
  then(g);
  return g;
}
function ctx_set(g, o) { g.ctx.__set(o); }

ok('[좌초] 연료 0에서 달리면 좌초 엔딩', () => {
  const g = boot(10);
  g.ctx.__set({ fuel: 0, food: 3, hope: 4, dist: 4 });
  g.ctx.__drive();
  assert.ok(g.reached().has('stranded'), '좌초에 닿지 않았다');
});
ok('[붕괴] 굶주림이 희망을 0으로 밀면 붕괴 엔딩', () => {
  const g = boot(11);
  g.ctx.__set({ fuel: 3, food: 0, hope: 1, hungry: 1, dist: 4 });
  g.ctx.__drive();
  assert.ok(g.reached().has('collapse'), '붕괴에 닿지 않았다');
});
ok('[빈 부두] 희망 없이 북항에 닿으면 배가 없다', () => {
  const g = boot(12);
  g.ctx.__set({ hope: 2, dist: 0, party: [] });
  g.ctx.__harbor();
  assert.ok(g.reached().has('empty'), '빈 부두에 닿지 않았다');
});
ok('[홀로] 동승자 없이 배에 오르면 홀로 엔딩', () => {
  const g = boot(13);
  g.ctx.__set({ hope: 4, dist: 0, party: [] });
  g.ctx.__harbor();
  g.click(/배에 오른다/);
  assert.ok(g.reached().has('alone'), '홀로에 닿지 않았다');
});
ok('[함께] 동승자를 태우고 함께 떠난다', () => {
  const g = boot(14);
  g.ctx.__set({ hope: 4, dist: 0, party: ['dohyeon', 'eunwoo'] });
  g.ctx.__harbor();
  g.click(/함께 간다/);
  assert.ok(g.reached().has('together'), '함께에 닿지 않았다');
  // 한 명은 부두에 남아야 한다(자리는 늘 하나 모자라다)
  assert.equal(g.S().party.length, 1, '아무도 남지 않았다 — 좌석 산술이 깨졌다');
});
ok('[빈자리] 모두 태우고 내가 남는다', () => {
  const g = boot(15);
  g.ctx.__set({ hope: 4, dist: 0, party: ['hanna', 'jun'] });
  g.ctx.__harbor();
  g.click(/내가 남는다/);
  assert.ok(g.reached().has('gaveseat'), '빈자리에 닿지 않았다');
});
ok('[골짜기] 골짜기에서 남으면 되돌아감 엔딩', () => {
  const g = boot(16);
  g.ctx.__set({ dist: 2, hope: 4, party: ['eunwoo'] });
  g.ctx.__enc('valley');
  g.click(/여기 남는다/);
  assert.ok(g.reached().has('turnback'), '되돌아감에 닿지 않았다');
});

ok('일곱 엔딩이 모두 도달 가능하다 (죽은 분기 0)', () => {
  const want = ['together', 'gaveseat', 'alone', 'turnback', 'stranded', 'collapse', 'empty'];
  const hit = new Set();
  // 위 개별 테스트가 채운 seenAll + 직접 구동 결과를 합산해도 되지만,
  // 여기서는 각 엔딩을 다시 한 번 독립적으로 구동해 이 테스트만으로 자족하게 한다
  const drive = (setup, click) => {
    const g = boot(100 + hit.size);
    g.ctx.__set(setup.s);
    if (setup.enc) g.ctx.__enc(setup.enc); else g.ctx.__harbor === undefined || (setup.harbor && g.ctx.__harbor());
    if (setup.drive) g.ctx.__drive();
    if (setup.harbor && !setup.enc) g.ctx.__harbor();
    if (click) g.click(click);
    // markSeen은 예외 전에 실행되므로 도감만으론 부족하다 — 실제 렌더가 크래시가 아닌지 본다
    assert.ok(!g.crashed(), `엔딩 렌더가 예외로 고장 화면이 됐다: ${click || 'drive/harbor'}`);
    for (const k of g.reached()) hit.add(k);
  };
  drive({ s: { fuel: 0, food: 3, hope: 4, dist: 3 }, drive: true });
  drive({ s: { fuel: 3, food: 0, hope: 1, hungry: 1, dist: 3 }, drive: true });
  drive({ s: { hope: 2, dist: 0, party: [] }, harbor: true });
  drive({ s: { hope: 4, dist: 0, party: [] }, harbor: true }, /배에 오른다/);
  drive({ s: { hope: 4, dist: 0, party: ['dohyeon', 'eunwoo'] }, harbor: true }, /함께 간다/);
  drive({ s: { hope: 4, dist: 0, party: ['hanna'] }, harbor: true }, /내가 남는다/);
  drive({ s: { dist: 2, hope: 4, party: ['eunwoo'] }, enc: 'valley' }, /여기 남는다/);
  for (const k of want) assert.ok(hit.has(k), `엔딩 '${k}'에 도달하지 못했다 — 죽은 분기`);
});

/* ── 주입이 아니라 '플레이'로 도달하는가 ──
   상태를 직접 주입한 도달성은 증명이 아니다. 창귀록의 pansaEdge가 죽은 가지 위에서
   테스트를 통과했듯, alone은 hope>=3 + 무동승을 동시에 요구해 실제 플레이로는
   0.0%였는데 주입 테스트만 통과했다. 정책을 정해 끝까지 눌러 본다. */
function play(policy, seed, maxStep = 200) {
  const g = boot(seed);
  let r = seed;
  for (let step = 0; step < maxStep; step++) {
    const bs = g.enabled();
    if (!bs.length) break;
    if (g.S().over) break;
    const b = policy(bs, g.S()) || bs[(r = (r * 1103515245 + 12345) & 0x7fffffff) % bs.length];
    try { b.onclick(); } catch (e) { return { crash: e.message, reached: g.reached() }; }
  }
  return { reached: g.reached(), S: g.S() };
}
const hit = (bs, re) => bs.find(b => re.test(b.innerHTML));

ok('[플레이 도달] 아무도 태우지 않고 완주하면 홀로 엔딩에 닿는다', () => {
  // 거절에 희망 페널티가 붙으면 이 경로는 전부 붕괴로 끝나 alone이 죽은 엔딩이 된다.
  const go = bs => hit(bs, /지나친다|두고 간다/) || hit(bs, /뽑는다/) || hit(bs, /가져간다/)
    || hit(bs, /북항으로 계속/) || hit(bs, /우회한다|버틴다/)
    || hit(bs, /다이얼|계속 간다|다시 길로|나선다|가속한다|출발한다|북쪽으로|빠져나온다|간다$/)
    || hit(bs, /배에 오른다/);
  let alone = 0;
  for (let s = 1; s <= 40; s++) if (play(go, s * 13 + 5).reached.has('alone')) alone++;
  assert.ok(alone >= 8, `40판 중 ${alone}판만 alone — 실제 플레이로 닿지 않는 죽은 엔딩이다`);
});

ok('[플레이 도달] 연료를 챙기며 완주하면 대부분 항구에 닿는다 (좌초가 기본값이 아니다)', () => {
  // 연료 원장이 적자면 판의 승패가 선택이 아니라 인카운터 추첨에 걸린다(전작 knife-edge).
  const go = bs => hit(bs, /뽑는다/) || hit(bs, /태운다$|을 태운다|를 태운다/) || hit(bs, /가져간다/)
    || hit(bs, /앞을 뚫는다|고쳐 준다/) || hit(bs, /헤드라이트/) || hit(bs, /내리고/)
    || hit(bs, /북항으로 계속/)
    || hit(bs, /다이얼|계속 간다|다시 길로|나선다|가속한다|출발한다|북쪽으로|빠져나온다|간다$/)
    || hit(bs, /함께 간다/) || hit(bs, /배에 오른다/);
  let arrived = 0;
  for (let s = 1; s <= 40; s++) {
    const R = play(go, s * 7 + 1).reached;
    if (R.has('together') || R.has('gaveseat') || R.has('alone')) arrived++;
  }
  assert.ok(arrived >= 24, `40판 중 ${arrived}판만 항구 도달 — 연료 원장이 적자인지 확인하라`);
});

ok('[플레이 도달] 만석 좌석 교환이 실제 플레이에서 충분히 자주 열린다', () => {
  // pickEnc가 만석일 때 합류를 억제하면 게임의 심장을 대부분이 못 본다.
  const go = bs => hit(bs, /태운다$|을 태운다|를 태운다/) || hit(bs, /뽑는다/) || hit(bs, /가져간다/)
    || hit(bs, /북항으로 계속/)
    || hit(bs, /다이얼|계속 간다|다시 길로|나선다|가속한다|출발한다|북쪽으로|빠져나온다|간다$/);
  let saw = 0;
  for (let s = 1; s <= 60; s++) {
    const g = boot(s * 7 + 1); let r = s, seen = false;
    for (let step = 0; step < 200; step++) {
      const bs = g.enabled(); if (!bs.length || g.S().over) break;
      if (g.S().party.length >= 3 && bs.some(b => /내리고/.test(b.innerHTML))) { seen = true; break; }
      const b = go(bs) || bs[(r = (r * 1103515245 + 12345) & 0x7fffffff) % bs.length];
      try { b.onclick(); } catch (e) { break; }
    }
    if (seen) saw++;
  }
  assert.ok(saw >= 12, `60판 중 ${saw}판만 좌석 교환에 닿는다 — pickEnc의 join 가중을 확인하라`);
});

/* ── 좌석 교환(테마의 심장)이 실제로 작동하는가 ── */
ok('만석에서 새 동승자를 태우면 한 명이 내려가고 좌석은 3을 넘지 않는다', () => {
  const g = boot(20);
  g.ctx.__set({ party: ['dohyeon', 'hanna', 'jun'], hope: 5, leg: 1, dist: 5 });
  g.ctx.__enc('kid');                 // 은우 합류 시도 (만석)
  const before = g.S().party.length;
  assert.equal(before, 3, '전제: 만석 3인');
  // 교환 버튼(누구를 내리고 은우를 태운다) 하나를 누른다
  g.click(/내리고 은우/);
  const S = g.S();
  assert.ok(S.party.length <= 3, `좌석이 ${S.party.length} — 3을 넘었다`);
  assert.ok(S.party.includes('eunwoo'), '은우가 타지 않았다');
  assert.equal(Object.values(S.fate).filter(v => v === 'left').length, 1, '내린 사람이 left로 기록되지 않았다');
});

ok('fate/mark 태그가 모두 실제 문구를 갖는다 (빈 문구 = 엔딩에서 인물 소실)', () => {
  // 한때 EPI에 deal:''/saved:''가 있어, 발전기를 고쳐 주거나 사람을 살린 동승자가
  // 엔딩에서 통째로 사라졌다. partyLines()의 if(line) 필터가 빈 문자열을 걸러냈기 때문이다.
  const empties = [...js.matchAll(/(\w+):''/g)].map(m => m[1]);
  const placements = [...js.matchAll(/S\.fate\[?\.?(?:\w+)\]?\s*=\s*'(\w+)'/g)].map(m => m[1]);
  const marks = [...js.matchAll(/S\.mark\[?\.?(?:\w+)\]?\s*=\s*'(\w+)'/g)].map(m => m[1]);
  for (const t of new Set([...placements, ...marks]))
    assert.ok(!empties.includes(t), `태그 '${t}'가 빈 문구다 — 그 인물이 엔딩에서 사라진다`);
  assert.ok(marks.length >= 3, `mark 태그가 ${marks.length}개 — deal/saved/blood 셋이어야`);
  // 표식은 배치를 대체하지 않고 덧붙어야 한다
  assert.match(js, /put\(\(MARK\[id\]\|\|\{\}\)\[S\.mark\[id\]\]\)/,
    'partyLines()가 MARK를 배치 문구 뒤에 덧붙이지 않는다');
});

ok('[회귀] 엔딩마다 개별 문구가 서로 다르다 (동승자별 작별)', () => {
  const m = js.match(/const EPI\s*=\s*\{[\s\S]*?\n\};/);
  assert.ok(m, 'EPI 테이블이 없다');
  const coasts = [...m[0].matchAll(/coast:'([^']+)'/g)].map(x => x[1]);
  assert.ok(coasts.length >= 4, `동승자 도착 문구가 ${coasts.length}개 — 4명분이어야`);
  assert.equal(new Set(coasts).size, coasts.length, '동승자 도착 문구에 중복이 있다 (창귀록 자기표절 교훈)');
});

console.log(`\n${pass}/${ran} 통과`);
console.log(`\n계측 (무작위 500판)`);
console.log(`  완료 게임: ${games} · 배 도착 엔딩 누계: ${arrivals}`);
console.log(`  무작위로 밟은 엔딩: ${[...seenAll].join(' · ') || '없음'}`);
console.log(`  ※ 좋은 엔딩(빈자리 등)은 선택이 필요해 위에서 직접 구동으로 검증한다.`);
if (process.exitCode) console.log('\n실패 있음');
