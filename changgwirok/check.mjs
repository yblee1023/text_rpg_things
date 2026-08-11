/* 창귀록 자체 점검 — 의존성 없음. 실행: node check.mjs
   고친 네 가지가 실제로 살아 있는지만 본다. 깨지면 종료코드 1. */
import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
import assert from 'node:assert/strict';

const html = readFileSync(new URL('./changgwirok.html', import.meta.url), 'utf8');
const js = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));

let pass = 0;
let ran = 0;
const ok = (name, fn) => {
  ran++;
  try { fn(); console.log('  OK   ' + name); pass++; }
  catch (e) { console.log('  FAIL ' + name + '\n       ' + e.message); process.exitCode = 1; }
};

console.log('창귀록 점검\n');

ok('스크립트가 구문 오류 없이 컴파일된다', () => {
  new Script(js); // 실행하지 않고 파싱만 — 편집으로 깨진 괄호를 잡는다
});

// ── 무병 하한이 HUD에 노출되는가 (중대 3) ──
const tierSrc = js.match(/function tier\(\)\{[\s\S]*?\n\}/)[0];
const tier = (mu) => new Script(`(()=>{const S={mu:${mu}};${tierSrc};return tier();})()`).runInNewContext();

ok('무병 40~59 구간이 문턱 미달을 알린다', () => {
  assert.match(tier(50), /문턱/, '40~59에서 문턱 경고가 없다');
  assert.match(tier(20), /문턱/, '40 미만에서 문턱 경고가 없다');
});
ok('무병 60 이상에서는 문턱 경고를 하지 않는다', () => {
  assert.doesNotMatch(tier(60), /문턱/);
  assert.doesNotMatch(tier(85), /문턱/);
});

// ── 부적이 자격을 깎을 때만 경고하는가 (중대 3) ──
const bujaCond = (mu) => new Script(`(()=>{const S={mu:${mu}};return !!(S.mu>=60&&S.mu-20<60);})()`).runInNewContext();
ok('부적 경고는 60 이상에서 60 미만으로 떨어질 때만 뜬다', () => {
  assert.equal(js.includes('문턱 아래로 내려간다'), true, '부적 경고 문구가 없다');
  assert.equal(bujaCond(70), true, 'mu=70에서 경고해야 한다');
  assert.equal(bujaCond(85), false, 'mu=85는 떨어져도 60 이상이라 경고하면 안 된다');
  assert.equal(bujaCond(50), false, 'mu=50은 이미 미달이라 새 경고가 아니다');
});

// ── 판사 방치 페널티가 임계에 닿는가 (중대 1) ──
ok('pansaEdge 증가 지점이 2곳이라 임계 2에 닿는다', () => {
  const incs = [...js.matchAll(/S\.pansaEdge\s*(?:\+\+|\+=\s*1|=\s*\(?S\.pansaEdge[^;]*\+\s*1)/g)].length;
  assert.equal(incs, 2, `증가 지점이 ${incs}곳 — 2곳이어야 unravel 엔딩에 도달한다`);
  assert.match(js, /S\.pansaEdge[^;]*>=\s*2\)\s*return end\('unravel'\)/, '임계 판정이 사라졌다');
});
ok('두 방해 사건이 서로 다른 id라 둘 다 발동한다', () => {
  const ids = [...js.matchAll(/\{id:'(recant|summon)'/g)].map(m => m[1]);
  assert.deepEqual(ids.sort(), ['recant', 'summon']);
});

// ── 끊긴 사슬의 뒷사람이 목록에서 내려가는가 (중대 2) ──
const CHAIN = new Script(js.match(/const CHAIN=\{[^;]*\};/)[0] + 'CHAIN').runInNewContext();
const visible = (lost, id) => {
  const S = { done: new Set(), lost: new Set(lost) };
  (lost.flatMap(x => CHAIN[x] || [])).forEach(x => S.lost.add(x));
  return !S.lost.has(id);
};
ok('서운관을 압박해 일지를 잃으면 뒷사람 넷이 목록에서 사라진다', () => {
  for (const p of ['hwarin', 'gyusu', 'gukmu', 'uigeum'])
    assert.equal(visible(['seoun'], p), false, `${p}가 아직 목록에 남아 발품을 빨아먹는다`);
});
ok('종친가를 잃으면 성수청·의금부만 닫히고 활인서는 남는다', () => {
  assert.equal(visible(['gyusu'], 'gukmu'), false);
  assert.equal(visible(['gyusu'], 'uigeum'), false);
  assert.equal(visible(['gyusu'], 'hwarin'), true, '활인서는 종친가와 무관하다');
});
ok('의금부는 사슬의 끝이라 뒤가 없다', () => {
  assert.equal(CHAIN.uigeum, undefined);
});

ok('CHAIN 차단이 과하지 않다 — 막힌 인물의 열쇠는 우회로가 없다', () => {
  // CHAIN이 막는 넷의 ready() 조건. 이 단서들이 다른 데서 나오면 차단은 과잉이다.
  const gates = ['ilji', 'jinryo', 'saju', 'jangbu'];
  for (const g of gates)
    assert.match(js, new RegExp(`ready:\\(\\)=>has\\('${g}'\\)`), `${g}가 더 이상 게이트가 아니다 — CHAIN을 다시 계산하라`);
  // 게임 내 유일한 우회 공급자는 도깨비다
  const dok = [...js.matchAll(/give:'(\w+)'/g)].map((m) => m[1]);
  for (const g of gates)
    assert.equal(dok.includes(g), false, `${g}는 도깨비로도 얻을 수 있어 차단이 과잉이다`);
  // 각 게이트 단서의 공급자가 하나뿐인지 (둘이면 사슬이 선형이 아니다)
  for (const g of gates) {
    const n = [...js.matchAll(new RegExp(`win:\\[[^\\]]*'${g}'`, 'g'))].length;
    assert.ok(n >= 1, `${g}를 주는 곳이 없다`);
  }
});

ok('pansaEdge는 활인서 재심문으로 되돌릴 수 있다 (난이도 폭주 방지)', () => {
  assert.match(js, /S\.pansaEdge\s*=\s*Math\.max\(0,\s*\(?S\.pansaEdge[^;]*-\s*1\)/,
    '되돌릴 수단이 없으면 방치 두 번으로 검거가 확정 붕괴한다');
});

ok('준비 조건이 있는 인물은 모두 brush를 갖는다 (grill의 폴백을 지웠으므로)', () => {
  // ready()가 항상 참이 아닌 인물은 헛걸음 화면을 그릴 수 있어야 한다
  const gated = [...js.matchAll(/\{id:'(\w+)',[^}]*?ready:\(\)=>(?!true)/g)].map((m) => m[1]);
  assert.ok(gated.length >= 5, `게이트 인물이 ${gated.length}명뿐 — 정규식이 놓쳤는지 확인하라`);
  for (const id of gated) {
    const fn = js.match(new RegExp(`function ${id}\\(\\)\\{grill\\(\\{[\\s\\S]*?\\n\\}\\);\\}`));
    assert.ok(fn, `${id}의 grill 블록을 못 찾았다`);
    assert.match(fn[0], /brush:/, `${id}에 brush가 없다 — 헛걸음 시 undefined 전개로 크래시한다`);
  }
});

ok('진엔딩 관문은 실질 4개다 — hasYugo는 추격 조건에 흡수된 잉여', () => {
  // 추격이 yugo를 요구하고, done.pansa가 추격에서만 서고, 단서가 사라지지 않으므로
  // vowScene의 hasYugo는 항상 참이다. 셋 중 하나라도 바뀌면 이 전제가 깨진다.
  assert.match(js, /if\(S\.act2 && has\('chingching'\) && has\('yugo'\)/,
    '추격 진입에서 yugo 요구가 빠졌다 — hasYugo가 진짜 관문이 되었으니 엔딩 설계를 다시 보라');
  assert.equal([...js.matchAll(/S\.done\.add\('pansa'\)/g)].length, 1,
    "done.pansa를 세우는 곳이 늘었다 — 추격을 거치지 않는 경로가 생겼는지 확인하라");
  assert.equal([...js.matchAll(/S\.clues\.delete|clues\.clear\(\)/g)].length, 0,
    '단서를 되뺏는 코드가 생겼다 — 한번 얻은 yugo가 사라질 수 있으면 위 전제가 무너진다');
});

// ── 서장 외면 분기의 복선 (중대 4) ──
ok('신안을 외면해도 아버지 필체 복선이 남는다', () => {
  const introB = js.match(/function introB\(saw\)\{[\s\S]*?\n\}/)[0];
  const elseBranch = introB.slice(introB.indexOf('}else{'));
  assert.match(elseBranch, /획을 맺는 버릇/, '외면 분기에 복선이 없어 뒤의 대사가 붕 뜬다');
});

// ── 회귀 방지: 이미 통과한 불변식 ──
ok('엔딩 도감 키와 final() 인자가 정확히 일치한다', () => {
  const keys = [...js.matchAll(/\{key:'([^']+)'/g)].map(m => m[1]);
  const calls = new Set([...js.matchAll(/final\('([^']+)'/g)].map(m => m[1]));
  assert.equal(keys.length, 8);
  for (const k of keys) assert.equal(calls.has(k), true, `도감 키 '${k}'를 부르는 final()이 없다 → 8/8 수집 불가 → 프리퀄 영구 잠김`);
  for (const c of calls) assert.equal(keys.includes(c), true, `final('${c}')가 도감에 없다`);
});

// ── 실제로 굴러가는가 ──
/* 최소 DOM 껍데기. jsdom을 붙이지 않으려고 손으로 깎았다.
   ponytail: show()가 쓰는 것만 흉내낸다. 렌더링을 검사하지 않고 크래시만 잡는다. */
function boot(seed) {
  const el = () => ({
    style: {}, hidden: false, kids: [], _h: '', _t: '',
    set innerHTML(v) { this._h = v; this.kids.length = 0; }, get innerHTML() { return this._h; },
    set textContent(v) { this._t = v; }, get textContent() { return this._t; },
    appendChild(c) { this.kids.push(c); }, remove() {},
    addEventListener() {}, getContext: () => null,
  });
  const byId = {};
  const store = new Map();
  let rng = seed;
  const ctx = {
    Math: Object.create(Math), JSON, Set, console,
    document: {
      getElementById: (id) => (byId[id] ||= el()),
      createElement: () => el(),
    },
    localStorage: {
      setItem: (k, v) => store.set(k, String(v)),
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      removeItem: (k) => store.delete(k),
    },
    location: { search: '', hash: '' },
    addEventListener() {}, innerWidth: 800, innerHeight: 600,
    scrollTo() {}, confirm: () => true,
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  // 결정론적 난수 — 같은 seed면 같은 플레이가 재현된다
  ctx.Math.random = () => ((rng = (rng * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  // S는 vm 컨텍스트 밖에서 안 보인다. 게터로 내보낸다 — reset/restore가 S를 재할당하므로
  // 값을 한 번 캡처하면 그 뒤로 옛 객체를 보게 된다.
  new Script(js + '\n;globalThis.__getS=()=>S;').runInNewContext(ctx);
  return {
    buttons: () => byId.acts.kids, main: () => byId.main, S: () => ctx.__getS(), day: () => ctx.day(),
    save: (at) => ctx.save(at), restore: (d) => ctx.restore(d),
    skipIntro: () => ctx.skipIntro(), free: (k) => ctx.free(k, () => {}), turn2: () => ctx.turn2(), store,
  };
}

ok('세이브 → 이어하기 왕복에서 23개 필드가 모두 보존된다', () => {
  const g = boot(3);
  const S = g.S();
  Object.assign(S, {
    day: 3, acts: 2, mu: 57, buja: 1, met: true, act2: true, rank: 2,
    pansaGone: false, chase: 1, pansaEdge: 1, gukSeed: true, gukVisited: true,
    wary: { hwarin: 1 }, recalled: { kkokdu: true },
  });
  S.clues.add('jeung'); S.clues.add('chang'); S.clues.add('ilji');
  S.freed.add(1); S.done.add('kkokdu'); S.lost.add('seoun');
  S.names.add(2); S.asked.add('q1'); S.sabo.add('jongsa'); S.incidents.add('recant');
  g.save('day');

  const blob = JSON.parse(g.store.get('changgwirok.save.v1'));
  const g2 = boot(4);
  g2.restore(blob);
  const T = g2.S();

  for (const [k, v] of Object.entries({ day: 3, acts: 2, mu: 57, buja: 1, met: true,
    act2: true, rank: 2, chase: 1, pansaEdge: 1, gukSeed: true, gukVisited: true }))
    assert.equal(T[k], v, `${k}가 복원되지 않았다`);
  for (const k of ['sabo', 'incidents', 'clues', 'freed', 'done', 'lost', 'names', 'asked'])
    assert.ok(T[k] instanceof Set, `${k}가 Set이 아니라 ${typeof T[k]}로 복원됐다`);
  assert.deepEqual([...T.clues].sort(), ['chang', 'ilji', 'jeung']);
  assert.deepEqual([...T.freed], [1], 'freed의 숫자 키가 문자열로 변질됐다');
  assert.deepEqual([...T.names], [2]);
  assert.deepEqual([...T.lost], ['seoun']);
  assert.deepEqual(T.wary, { hwarin: 1 });
  assert.deepEqual(T.recalled, { kkokdu: true });
  assert.equal(T.over, false, '게임오버 상태로 재개되면 안 된다');
});

ok('세이브에 없는 필드는 초기값을 지킨다 (구버전 세이브 방어)', () => {
  const g = boot(5);
  g.restore({ at: 'day', day: 2, mu: 40, clues: ['jeung'] }); // 대부분이 빠진 세이브
  const T = g.S();
  assert.equal(T.day, 2);
  assert.equal(T.acts, 3, 'acts가 undefined로 새어 NaN을 만든다');
  assert.equal(T.buja, 3);
  assert.equal(T.pansaEdge, 0);
  assert.ok(T.freed instanceof Set && T.freed.size === 0);
});

ok('게임이 부팅되고 표지에 선택지가 뜬다', () => {
  const g = boot(1);
  assert.ok(g.buttons().length > 0, '표지에 버튼이 하나도 없다');
});

const seen = new Set();
let maxEdge = 0, act2Runs = 0;
ok('무작위 300판에서 크래시도 막다른 화면도 없다', () => {
  const dead = [];
  for (let s = 1; s <= 300; s++) {
    const g = boot(s);
    let r = s;
    const pick = (n) => ((r = (r * 1103515245 + 12345) & 0x7fffffff) % n);
    for (let step = 0; step < 400; step++) {
      const bs = g.buttons().filter((b) => !b.disabled);
      if (!bs.length) { dead.push(`seed ${s} step ${step}: 누를 것이 없다`); break; }
      const b = bs[pick(bs.length)];
      try { b.onclick(); }
      catch (e) { dead.push(`seed ${s} step ${step}: ${e.message}`); break; }
    }
    const S = g.S();
    if (S) { maxEdge = Math.max(maxEdge, S.pansaEdge || 0); if (S.act2) act2Runs++; }
    for (const k of JSON.parse(g.store.get('changgwirok.endings.v1') || '[]')) seen.add(k);
  }
  assert.deepEqual(dead.slice(0, 5), [], `${dead.length}건 발생`);
});

ok('두 방해를 모두 방치하면 pansaEdge가 임계 2에 닿는다', () => {
  const g = boot(7);
  const S = g.S();
  const click = (re) => {
    const b = g.buttons().find((x) => re.test(x.innerHTML));
    assert.ok(b, `버튼을 못 찾았다: ${re}`);
    b.onclick();
  };
  Object.assign(S, { act2: true, chase: 1, acts: 3, pansaGone: false });
  S.done.add('hwarin'); // recant 발동 조건

  g.day();
  click(/내버려 둔다/);
  assert.equal(S.pansaEdge, 1, '첫 방치가 pansaEdge를 올리지 않는다');

  S.acts = 3; // 이튿날 아침
  g.day();
  click(/응하지 않는다/);
  assert.equal(S.pansaEdge, 2,
    'pansaEdge가 2에 닿지 않는다 — unravel 엔딩은 여전히 죽은 분기다');
});

ok('활인서 재심문은 정황과 증언 회복을 한 번에 준다 (보험 소진 함정 방지)', () => {
  const g = boot(11);
  const S = g.S();
  const click = (re) => {
    const b = g.buttons().find((x) => re.test(x.innerHTML));
    assert.ok(b, `버튼을 못 찾았다: ${re}`);
    b.onclick();
  };
  // 정황을 아직 못 얻은 채로 방치 둘을 겪은 상태
  Object.assign(S, { act2: true, acts: 3, pansaEdge: 2, pansaGone: false });
  S.done.add('hwarin');
  S.incidents.add('recant'); S.incidents.add('summon'); // 사건은 이미 지나갔다
  assert.equal(S.clues.has('chingching'), false, '전제: 아직 정황이 없다');

  g.day();
  click(/심문한다/);
  click(/다시, 별제/);

  assert.equal(S.clues.has('chingching'), true, '재심문이 정황을 주지 않았다');
  assert.equal(S.pansaEdge, 1,
    '정황을 여기서 얻으면 pansaEdge를 못 내린다 — 1회뿐인 재심문이 보험으로 못 쓰인다');
});

// ── 개선 5항목 회귀 가드 ──
ok('[항목5] 도깨비 기분은 3종이다 (sleepy 삭제)', () => {
  const ids = [...js.matchAll(/\{id:'(genial|greedy|trickster|sleepy)',intro/g)].map((m) => m[1]);
  assert.deepEqual(ids.sort(), ['genial', 'greedy', 'trickster']);
  assert.equal(js.includes("'sleepy'"), false, 'dokMood pool에 sleepy가 남아 있다');
});

ok('[항목1] 죽은 판 신호가 세 손실을 갈라 알린다', () => {
  const DF = new Script(js.match(/const DEADFALL=\{[\s\S]*?\};/)[0] + 'DEADFALL').runInNewContext();
  for (const id of ['seoun', 'gyusu', 'uigeum']) assert.ok(DF[id], `${id} 신호 없음`);
  assert.match(DF.uigeum, /산군|나례/, 'uigeum은 산군 대면 불가를 알려야 한다');
  assert.doesNotMatch(DF.seoun, /산군/, 'seoun이 산군을 말한다 — 2막은 애초에 불가라 오정보');
  assert.doesNotMatch(DF.gyusu, /산군/);
  assert.notEqual(DF.seoun, DF.gyusu, '두 신호가 같은 문자열이다');
  // 손실 처리부가 실제로 신호를 밀어넣는지
  assert.match(js, /if\(DEADFALL\[cfg\.id\]\)n\.push\(\['sp',DEADFALL\[cfg\.id\]\]\)/, 'r.lose가 DEADFALL을 밀지 않는다');
});

ok('[항목4] 창귀 3인이 서로 다른 텍스트로 해방되고 sp가 씬을 닫는다', () => {
  const o = JSON.parse(new Script(js.match(/const FREED=\{[\s\S]*?\n\};/)[0] + 'JSON.stringify(FREED)').runInNewContext());
  for (const k of ['1', '2', '3']) assert.ok(o[k]?.length, `FREED[${k}] 없음`);
  assert.equal(new Set(['1', '2', '3'].map((k) => JSON.stringify(o[k]))).size, 3, '세 텍스트가 서로 다르지 않다');
  for (const k of ['1', '2', '3']) assert.equal(o[k].at(-1)[0], 'sp', `FREED[${k}] 마지막이 sp가 아니다`);
  const dup = ['1', '2', '3'].filter((k) => /이름을 듣고/.test(o[k][0][1])).length;
  assert.ok(dup <= 1, `'이름을 듣고' 도입이 ${dup}개 — 신규 텍스트 안의 자기표절`);
  assert.match(js, /\.\.\.FREED\[k\]\.slice\(0,-1\)/, 'free()가 FREED 몸통을 앞에 펼치지 않는다');
  assert.match(js, /FREED\[k\]\.at\(-1\)/, 'free()가 sp를 got 뒤로 보내지 않는다 — 씬이 배지로 끝난다');
});

ok('[항목4] free()가 런타임에 sp로 씬을 닫는다', () => {
  const g = boot(2);
  const S = g.S();
  S.names.add(1); // 굴각 이름 확보 → free(1) 가능
  g.free(1);
  const nodes = g.main().kids;
  assert.ok(nodes.length >= 5, `해방 씬 노드가 ${nodes.length}개뿐`);
  // 마지막 서사 노드가 sp(.p.sp) 여야 한다. 버튼은 acts에 따로 있다.
  const last = nodes[nodes.length - 1];
  assert.match(last.className || '', /\bsp\b/, `해방 씬이 sp로 끝나지 않는다 (끝: "${last.className}")`);
});

ok('[항목3] 활인서 승리 후 판윤댁 도령 씬으로 분기한다', () => {
  assert.match(js, /function doryeong\(\)/, 'doryeong 함수 없음');
  assert.match(js, /r\.win\.includes\('jinryo'\)\)\?doryeong:day/, 'resolve가 doryeong으로 분기하지 않는다');
  const fn = js.match(/function doryeong\(\)\{[\s\S]*?\n\}/)[0];
  assert.doesNotMatch(fn, /give\(|S\.acts/, '도령 씬이 단서를 주거나 발품을 쓴다 — 발품 0이어야 한다');
  assert.match(fn, /f:day/, '도령 씬이 day로 복귀하지 않는다');
});

ok('[항목2] 서장 건너뛰기가 상태를 초기화하고 신안 선택을 보존한다', () => {
  assert.match(js, /const INTRO_PICK=\[/, 'INTRO_PICK 상수 없음');
  const fn = js.match(/function skipIntro\(\)\{[\s\S]*?\n\}/)[0];
  assert.match(fn, /wipe\(\);S=INIT\(\)/, 'skipIntro가 상태를 초기화하지 않는다 — 이전 판이 샌다');
  assert.match(fn, /INTRO_PICK/, 'skipIntro가 신안 선택을 재사용하지 않는다');
  assert.match(js, /seen\(\)\.size>0\)\|\|DEV\)c\.push\(\{k:'서장을 건너뛴다'/, '건너뛰기 버튼 게이트가 2회차+가 아니다');
  // intro()도 같은 상수를 써야 무병 +8이 한 곳에만 있다
  assert.equal((js.match(/mu\(8\);introB\(true\)/g) || []).length, 1, 'mu(8) 신안 선택이 두 곳에 복제됐다');
});

ok('[항목2] skipIntro가 신안/외면 2택으로 부팅된다', () => {
  const g = boot(9);
  g.skipIntro();
  assert.equal(g.buttons().length, 2, `건너뛰기 후 선택지가 ${g.buttons().length}개 (신안/외면 2개여야 함)`);
});

ok('[회귀] 2막 진입 경로가 살아 있다 (무작위 0판을 대신 검증)', () => {
  // 흐름을 건드렸으니 turn2 도달성을 직접 확인한다. 무작위 300판은 이 1% 경로를 못 밟는다.
  assert.match(js, /r\.win\.includes\('jangbu'\)&&!S\.act2\)\{[\s\S]*?f:gukmuVow/, 'jangbu 승리 → gukmuVow 배선이 끊겼다');
  assert.match(js, /f:turn2/, 'gukmuVow → turn2 배선이 끊겼다');
  const g = boot(5);
  g.turn2();
  assert.equal(g.S().act2, true, 'turn2가 act2를 세우지 않는다');
});

console.log(`\n${pass}/${ran} 통과`);
console.log(`\n계측 (무작위 300판)`);
console.log(`  2막 도달: ${act2Runs}판 · pansaEdge 최대: ${maxEdge}`);
console.log(`  도달 엔딩: ${[...seen].join(' · ') || '없음'}`);
console.log(`  ※ 무작위 플레이는 좋은 결말에 닿지 않는다. 완주가 필요하다.`);
if (process.exitCode) console.log('실패 있음');
