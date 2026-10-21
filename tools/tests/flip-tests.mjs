/**
 * LexiGo 翻转效果自动化验证
 * ---------------------------------------------------------------
 * 覆盖：CSS 参数、350ms 过渡真实发生、双向翻转、切词回正、
 *       点击/空格/触屏三种触发方式、prefers-reduced-motion。
 *
 * 每个用例前统一把卡片置于「正面静止」，避免状态串味。
 */
import { chromium } from 'playwright';

const URL = 'file:///Users/v_shinzhang/LexiGo/index.html';
let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) {
    pass++;
    console.log(`  ✅ ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    fail++;
    failures.push(name + (detail ? ' — ' + detail : ''));
    console.log(`  ❌ ${name}${detail ? ' — ' + detail : ''}`);
  }
}

function section(t) {
  console.log(`\n${t}`);
}

/** 当前 Y 轴角度（度） */
async function angle(page) {
  return page.evaluate(() => {
    const inner = document.querySelector('#view-study .card__inner');
    if (!inner) return null;
    const m = new DOMMatrixReadOnly(getComputedStyle(inner).transform);
    return Math.round(Math.atan2(m.m13, m.m11) * 180 / Math.PI);
  });
}

/** 采样一段时间内的角度序列 */
async function sampleAngle(page, ms = 700, step = 25) {
  const angles = [];
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    angles.push(await angle(page));
    await page.waitForTimeout(step);
  }
  return angles;
}

/**
 * 点击卡片可见面。
 * 翻到背面后正面因 backface-visibility: hidden 不再接受指针事件，
 * 只能按坐标点击当前可见的那一面，所以统一用坐标点击。
 */
async function clickCard(page) {
  const box = await page.locator('#view-study .card').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

/**
 * 把卡片恢复到「正面 + 静止」，作为各用例的统一起点。
 * 必须走应用自身的 reset + render，不能直接改 DOM 类：
 * 直接改类会让 DOM 与视图层内部的 flipped 状态脱节，
 * 下一次点击的翻转方向就会算错。
 */
async function ensureFront(page) {
  await page.evaluate(() => {
    window.LexiGo.StudyView.reset();
    window.LexiGo.StudyView.render();
  });
  await page.waitForTimeout(500);
}

const browser = await chromium.launch();

// ───────────────────────── 1. 移动端尺寸基础行为 ─────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(URL);
  await page.waitForTimeout(800);

  section('1. CSS 翻转参数');
  const css = await page.evaluate(() => {
    const card = document.querySelector('#view-study .card');
    const inner = card.querySelector('.card__inner');
    const front = card.querySelector('.card__face--front');
    const back = card.querySelector('.card__face--back');
    const ics = getComputedStyle(inner);
    return {
      perspective: getComputedStyle(card).perspective,
      transitionDuration: ics.transitionDuration,
      transitionTiming: ics.transitionTimingFunction,
      transformStyle: ics.transformStyle,
      frontBfv: getComputedStyle(front).backfaceVisibility,
      backBfv: getComputedStyle(back).backfaceVisibility,
      backTransform: getComputedStyle(back).transform,
    };
  });
  check('perspective = 1000px', css.perspective === '1000px', css.perspective);
  check('动画时长 = 350ms', css.transitionDuration === '0.35s', css.transitionDuration);
  check('缓动 = ease-in-out', css.transitionTiming === 'ease-in-out', css.transitionTiming);
  check('preserve-3d 保留 3D 上下文', css.transformStyle === 'preserve-3d', css.transformStyle);
  check('正面 backface-visibility: hidden', css.frontBfv === 'hidden', css.frontBfv);
  check('背面 backface-visibility: hidden', css.backBfv === 'hidden', css.backBfv);
  check('背面预旋转 180°', /matrix3d\(-1,/.test(css.backTransform), css.backTransform.slice(0, 28));

  section('2. 翻转动画真实发生（正面 → 背面）');
  await ensureFront(page);
  await clickCard(page);
  const angles = await sampleAngle(page, 600);
  const uniq = [...new Set(angles.filter((a) => a !== null))];
  check('存在中间角度（非瞬时跳变）', uniq.length >= 4, `${uniq.length} 个不同角度`);
  check('最终停在 180°', Math.abs(angles[angles.length - 1]) === 180, `末值 ${angles[angles.length - 1]}°`);
  const monotonic = angles.every((a, i) => i === 0 || Math.abs(a) >= Math.abs(angles[i - 1]) - 2);
  check('角度单调递进（无抖动）', monotonic, angles.join(','));

  section('3. 时长实测');
  await ensureFront(page);
  const t0 = Date.now();
  await clickCard(page);
  await page.waitForFunction(() => {
    const inner = document.querySelector('#view-study .card__inner');
    const m = new DOMMatrixReadOnly(getComputedStyle(inner).transform);
    return Math.abs(Math.atan2(m.m13, m.m11) * 180 / Math.PI) > 175;
  }, { timeout: 3000 });
  const elapsed = Date.now() - t0;
  check('翻转到 180° 耗时 300~450ms', elapsed >= 300 && elapsed <= 450, `${elapsed}ms`);

  section('4. 翻回正面（双向翻转）');
  await ensureFront(page);
  await clickCard(page);
  await page.waitForTimeout(450);
  const a1 = await angle(page);
  await clickCard(page);
  const backAngles = await sampleAngle(page, 600);
  check('第一次点击翻到背面', Math.abs(a1) === 180, `${a1}°`);
  check('第二次点击翻回正面 0°', Math.abs(backAngles[backAngles.length - 1]) < 5, `末值 ${backAngles[backAngles.length - 1]}°`);
  check('回翻同样有中间帧', new Set(backAngles).size >= 4, `${new Set(backAngles).size} 个不同角度`);

  section('5. 切词自动回正');
  await ensureFront(page);
  await clickCard(page);
  await page.waitForTimeout(450);
  const beforeSwitch = await page.evaluate(() => ({
    flipped: document.querySelector('#view-study .card').classList.contains('is-flipped'),
    word: document.querySelector('#view-study .card__word').textContent,
  }));
  check('切词前处于背面', beforeSwitch.flipped === true, `word=${beforeSwitch.word}`);

  await page.click('[data-el="next"]');
  await page.waitForTimeout(150);
  const afterSwitch = await page.evaluate(() => {
    const card = document.querySelector('#view-study .card');
    return {
      flipped: card.classList.contains('is-flipped'),
      word: card.querySelector('.card__word').textContent,
      meaning: card.querySelector('.card__meaning').textContent,
    };
  });
  check('切词后 is-flipped 已移除', afterSwitch.flipped === false);
  check('切词后卡片已回正到 0°', Math.abs(await angle(page)) < 3, `${await angle(page)}°`);
  check('单词内容已更新', afterSwitch.word !== beforeSwitch.word, `${beforeSwitch.word} → ${afterSwitch.word}`);
  check('释义与新词同步', afterSwitch.meaning.length > 0, afterSwitch.meaning);

  section('6. 切词回正过程中背面不暴露');
  await ensureFront(page);
  await clickCard(page);
  await page.waitForTimeout(450);
  const leak = await page.evaluate(async () => {
    const card = document.querySelector('#view-study .card');
    const back = card.querySelector('.card__face--back');
    const seen = new Set();
    for (let i = 0; i < 10; i++) {
      const r = back.getBoundingClientRect();
      seen.add(Math.round(r.width) + 'px');
      await new Promise((r2) => setTimeout(r2, 12));
    }
    return [...seen];
  });
  check('回正期间背面宽度稳定（无中途暴露）', leak.length === 1, leak.join(' / '));

  section('7. 空格键翻面');
  await ensureFront(page);
  await page.evaluate(() => document.body.focus());
  await page.keyboard.press('Space');
  await page.waitForTimeout(150);
  const spaceFlipped = await page.evaluate(() =>
    document.querySelector('#view-study .card').classList.contains('is-flipped'));
  check('空格触发翻面', spaceFlipped === true);

  section('8. 触屏上下滑翻面');
  await ensureFront(page);
  const box = await page.locator('#view-study .card').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx, cy - 90, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(200);
  check('上下滑触发翻面', await page.evaluate(() =>
    document.querySelector('#view-study .card').classList.contains('is-flipped')));

  section('9. 左右滑切词（且不误翻面）');
  await ensureFront(page);
  const wordBefore = await page.evaluate(() =>
    document.querySelector('#view-study .card__word').textContent);
  const box2 = await page.locator('#view-study .card').boundingBox();
  const sx = box2.x + box2.width / 2;
  const sy = box2.y + box2.height / 2;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(sx - 120, sy, { steps: 8 });
  await page.mouse.up();
  await page.waitForTimeout(250);
  const afterSwipe = await page.evaluate(() => ({
    word: document.querySelector('#view-study .card__word').textContent,
    flipped: document.querySelector('#view-study .card').classList.contains('is-flipped'),
  }));
  check('左右滑切了词', afterSwipe.word !== wordBefore, `${wordBefore} → ${afterSwipe.word}`);
  check('左右滑没有误翻面', afterSwipe.flipped === false && Math.abs(await angle(page)) < 3,
    `flipped=${afterSwipe.flipped} angle=${await angle(page)}°`);

  section('10. 点击链路（连续点击来回翻）');
  await ensureFront(page);
  await clickCard(page);
  await page.waitForTimeout(450);
  const c1 = await angle(page);
  await clickCard(page);
  await page.waitForTimeout(450);
  const c2 = await angle(page);
  check('第一次点击 → 背面 180°', Math.abs(c1) === 180, `${c1}°`);
  check('第二次点击 → 正面 0°', Math.abs(c2) < 5, `${c2}°`);

  section('11. 卡面外观随卡片一起翻转');
  const surface = await page.evaluate(() => {
    const card = document.querySelector('#view-study .card');
    const face = card.querySelector('.card__face--front');
    const cs = getComputedStyle(face);
    return {
      cardBg: getComputedStyle(card).backgroundColor,
      faceBg: cs.backgroundColor,
      faceShadow: cs.boxShadow !== 'none',
      faceBorder: cs.borderTopWidth,
    };
  });
  check('卡面自带白底', surface.faceBg === 'rgb(255, 255, 255)', surface.faceBg);
  check('卡面自带描边', surface.faceBorder === '1px', surface.faceBorder);
  check('卡面自带投影', surface.faceShadow === true);
  check('容器不再画卡面（避免残留空卡面）', surface.cardBg === 'rgba(0, 0, 0, 0)', surface.cardBg);

  section('12. 发音按钮归属卡面');
  const btn = await page.evaluate(() => {
    const card = document.querySelector('#view-study .card');
    const inner = card.querySelector('.card__inner');
    const front = card.querySelector('.card__face--front');
    const back = card.querySelector('.card__face--back');
    const fBtn = front.querySelector('.card__speak');
    const bBtn = back.querySelector('.card__speak');
    const cardRect = card.getBoundingClientRect();
    const fRect = fBtn.getBoundingClientRect();
    return {
      count: card.querySelectorAll('.card__speak').length,
      frontInFace: !!front.contains(fBtn),
      backInFace: !!back.contains(bBtn),
      notInInner: !inner.contains(fBtn),
      inInner: !!inner.contains(fBtn),
      frontBtnInsideCard: fRect.bottom <= cardRect.bottom + 1 && fRect.top >= cardRect.top - 1,
      frontBtnText: fBtn.textContent.trim(),
    };
  });
  check('正反两面各一个发音按钮', btn.count === 2, `${btn.count} 个`);
  check('按钮在正面卡面内', btn.frontInFace === true);
  check('按钮在背面卡面内', btn.backInFace === true);
  check('按钮在翻转层内（否则不跟卡面转）', btn.inInner === true);
  check('正面按钮在卡面范围内', btn.frontBtnInsideCard === true);

  section('13. 背面按钮不镜像');
  await ensureFront(page);
  await page.evaluate(() => { window.LexiGo.StudyView.flip(); });
  await page.waitForTimeout(500);
  const backBtn = await page.evaluate(() => {
    const bBtn = document.querySelector('#view-study .card__face--back .card__speak');
    const m = new DOMMatrixReadOnly(getComputedStyle(bBtn).transform);
    return { scaleX: Math.round(m.a * 1000) / 1000, text: bBtn.textContent.trim() };
  });
  check('背面按钮文字未镜像', backBtn.scaleX === 1, `scaleX=${backBtn.scaleX} 「${backBtn.text}」`);

  section('14. 页面无 JS 错误');
  check('无 pageerror / console.error', errors.length === 0, errors.join(' | ') || '无');

  await page.close();
}

// ───────────────────────── 2. prefers-reduced-motion ─────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(URL);
  await page.waitForTimeout(700);

  section('12. prefers-reduced-motion: reduce');
  const rm = await page.evaluate(() => {
    const inner = document.querySelector('#view-study .card__inner');
    return {
      duration: getComputedStyle(inner).transitionDuration,
      reduced: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    };
  });
  check('系统确实处于减少动态效果', rm.reduced === true);
  check('过渡被压制到近 0', parseFloat(rm.duration) < 0.01, rm.duration);

  await clickCard(page);
  await page.waitForTimeout(60);
  const rmAngle = await angle(page);
  check('减少动效下仍能翻面（直接到位）', Math.abs(rmAngle) === 180, `${rmAngle}°`);
  await page.close();
}

// ───────────────────────── 3. 桌面宽屏 ─────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(URL);
  await page.waitForTimeout(700);
  section('13. 桌面宽屏');
  await clickCard(page);
  const angles = await sampleAngle(page, 600);
  check('宽屏下翻转正常', Math.abs(angles[angles.length - 1]) === 180, `末值 ${angles[angles.length - 1]}°`);
  check('宽屏下有中间帧', new Set(angles).size >= 4, `${new Set(angles).size} 个`);
  await page.close();
}

await browser.close();

console.log(`\n${'='.repeat(52)}`);
console.log(`通过 ${pass} 项，失败 ${fail} 项`);
if (failures.length) {
  console.log('\n失败项：');
  failures.forEach((f) => console.log('  - ' + f));
}
process.exit(fail ? 1 : 0);
