/* Crystallize UI. DOM only; all logic lives in game.js. No network, no trackers. */
(function () {
  'use strict';
  var G = window.CrystallizeGame, I = window.CrystallizeI18n;
  var errors = [];
  window.addEventListener('error', function (e) {
    errors.push(String(e.message));
    document.documentElement.setAttribute('data-errors', JSON.stringify(errors));
  });

  var $ = function (id) { return document.getElementById(id); };
  var SVGNS = 'http://www.w3.org/2000/svg';
  var STORE_KEY = 'crystallize.v1';

  /* ---------- storage (local only, failure tolerant) ---------- */
  function loadStore() {
    try { return G.sanitizeStore(JSON.parse(window.localStorage.getItem(STORE_KEY) || '{}')); }
    catch (e) { return G.sanitizeStore(null); }
  }
  var store = loadStore();
  function saveStore() { try { window.localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch (e) { /* private mode */ } }

  /* ---------- state ---------- */
  var today = G.localDateString(new Date());
  var hash = G.parseHash(window.location.hash);
  var lang = I.isLang(hash.lang) ? hash.lang : (I.isLang(store.lang) ? store.lang : I.detectLang(navigator));
  var S = {
    view: 'intro', mode: 'daily', seed: null, date: today, inst: null, n: 0, p1: null, p2: null,
    rep: null, result: null, beat: null, newBest: false
  };

  function t(key, vars) { return I.t(lang, key, vars); }
  function text(id, key, vars) { $(id).textContent = t(key, vars); }
  function show(view) {
    ['intro', 'play', 'commit', 'review', 'result'].forEach(function (v) { $('s-' + v).hidden = v !== view; });
    S.view = view;
  }
  function focusHeading(id) { var h = $(id); h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: false }); }

  /* ---------- svg helpers ---------- */
  function el(name, attrs) {
    var e = document.createElementNS(SVGNS, name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function line(a, ang, half, attrs) {
    var c = Math.cos(ang), s = Math.sin(ang);
    attrs.x1 = -half * c; attrs.y1 = half * s; attrs.x2 = half * c; attrs.y2 = -half * s; attrs['stroke-linecap'] = 'round';
    return el('line', attrs);
  }
  function drawGrid(g) {
    clear(g);
    for (var i = -4; i <= 4; i++) {
      if (i === 0) continue;
      g.appendChild(el('line', { x1: i, y1: -5, x2: i, y2: 5, stroke: '#16244f', 'stroke-width': 0.04 }));
      g.appendChild(el('line', { x1: -5, y1: i, x2: 5, y2: i, stroke: '#16244f', 'stroke-width': 0.04 }));
    }
    g.appendChild(el('line', { x1: -5, y1: 0, x2: 5, y2: 0, stroke: '#2a3b6e', 'stroke-width': 0.06 }));
    g.appendChild(el('line', { x1: 0, y1: -5, x2: 0, y2: 5, stroke: '#2a3b6e', 'stroke-width': 0.06 }));
  }
  function drawPlot(prefix, pts, n, opts) {
    opts = opts || {};
    drawGrid($(prefix + '-grid'));
    var gp = $(prefix + '-pts'), ga = $(prefix + '-axes');
    clear(gp); clear(ga);
    for (var i = 0; i < n; i++) {
      var x = Math.max(-4.9, Math.min(4.9, pts[i][0])), y = Math.max(-4.9, Math.min(4.9, pts[i][1]));
      var last = opts.highlightLast && i === n - 1;
      gp.appendChild(el('circle', { cx: x, cy: -y, r: last ? 0.17 : 0.12, fill: last ? '#e0c36a' : '#40d0e0', 'fill-opacity': last ? 1 : 0.8 }));
    }
    if (opts.trueAngle !== undefined && opts.trueAngle !== null) {
      ga.appendChild(line(0, opts.trueAngle, 4.9, { stroke: '#40d0e0', 'stroke-width': 0.1, 'stroke-dasharray': '0.35 0.25' }));
    }
    if (opts.angle !== undefined && opts.angle !== null) {
      var op = Math.min(1, 0.3 + Math.max(0, (opts.ratio || 1) - 1) / 2);
      ga.appendChild(line(0, opts.angle, opts.half || 4.6, { stroke: '#c9a84c', 'stroke-width': 0.14, 'stroke-opacity': op }));
    }
    if (opts.cross !== undefined) {
      ga.appendChild(line(0, opts.cross.angle, opts.cross.half, { stroke: '#eef2ff', 'stroke-width': 0.06, 'stroke-opacity': 0.35 }));
    }
  }

  /* ---------- rendering ---------- */
  function deg(a) { return Math.round(a * 180 / Math.PI) % 180; }
  function f2(x) { return x.toFixed(2); }
  function pts(x) { return String(Math.round(x)); }
  function signed(x) { var r = Math.round(x); return (r > 0 ? '+' : '') + r; }

  function renderStatic() {
    document.documentElement.lang = lang;
    document.title = t('doc.title');
    text('app-title', 'app.title');
    text('app-tagline', 'app.tagline');
    text('tag-synthetic', 'tag.synthetic');
    $('btn-help').textContent = t('btn.help');
    $('btn-lang').textContent = t('meta.code');
    $('btn-lang').setAttribute('aria-label', t('btn.lang') + ': ' + t('meta.name'));
    ['p1', 'p2', 'p3', 'p4', 'p5'].forEach(function (k) { text('help-' + k, 'help.' + k); });
    text('help-heading', 'help.heading');
    text('btn-help-close', 'btn.close');
    text('footer-privacy', 'footer.privacy');
    text('footer-disclaimer', 'footer.disclaimer');
    text('footer-license', 'footer.license', { version: G.VERSION });
  }

  function renderIntro() {
    var seedLabel = S.seed;
    var sd = G.seedDate(S.seed);
    if (sd) text('intro-heading', 'intro.heading', { day: G.dayNumber(sd), date: sd });
    else text('intro-heading', 'intro.heading_seed', { seed: S.seed });
    if (S.mode === 'daily') text('intro-mode', 'intro.mode_daily');
    else if (S.mode === 'challenge') text('intro-mode', 'intro.mode_challenge', { seed: seedLabel });
    else text('intro-mode', 'intro.mode_practice', { seed: seedLabel });
    var b = $('intro-beat');
    b.hidden = S.beat === null;
    if (S.beat !== null) b.textContent = t('intro.beat', { best: S.beat });
    text('intro-question', 'intro.question');
    var prior = G.makeInstance(S.seed).prior;
    text('intro-prior', 'intro.prior', { pct: Math.round(prior * 100) });
    text('intro-rules', 'intro.rules', { cost: G.COST, max: G.MAX_SAMPLES, repl: G.REPL_N });
    text('btn-start', 'intro.start');
    var done = S.mode === 'daily' && store.daily[today];
    $('btn-start').hidden = !!done;
    $('btn-see-result').hidden = !done;
    $('intro-already').hidden = !done;
    if (done) {
      text('btn-see-result', 'intro.see_result');
      text('intro-already', 'intro.already', { score: pts(done.score) });
    }
  }

  function renderPlay() {
    var inst = S.inst, n = S.n, st = G.stats(inst.points, n);
    text('play-heading', 'play.plot', { n: n });
    $('plot-title').textContent = t('play.plot', { n: n });
    drawPlot('plot', inst.points, n, {
      highlightLast: true, angle: n >= 2 ? st.angle : null, ratio: st.ratio,
      half: Math.min(4.6, 1.8 * Math.sqrt(st.lam1)),
      cross: n >= 2 ? { angle: st.angle + Math.PI / 2, half: Math.min(4.6, 1.8 * Math.sqrt(st.lam2)) } : undefined
    });
    text('play-n', 'play.n', { n: n, max: G.MAX_SAMPLES });
    text('play-ratio', 'play.ratio', { ratio: n >= 2 ? f2(st.ratio) : '-' });
    text('play-axis', 'play.axis', { deg: n >= 2 ? deg(st.angle) : '-' });
    text('play-cost', 'play.cost', { cost: f2(G.samplingCost(n)) });
    $('budget-fill').style.width = (100 * n / G.MAX_SAMPLES) + '%';
    $('trace-title').textContent = t('play.trace');
    var path = [];
    for (var k = 2; k <= n; k++) {
      var r = G.stats(inst.points, k).ratio;
      path.push((120 * k / G.MAX_SAMPLES).toFixed(1) + ',' + (35 - Math.min(r, 6) / 6 * 33).toFixed(1));
    }
    $('trace-line').setAttribute('points', path.join(' '));
    text('btn-s1', 'play.sample1');
    text('btn-s5', 'play.sample5');
    text('btn-commit', 'play.commit');
    $('btn-s1').disabled = n >= G.MAX_SAMPLES;
    $('btn-s5').disabled = n >= G.MAX_SAMPLES;
    $('btn-commit').disabled = n < G.MIN_SAMPLES;
    var msg = '';
    if (n >= G.MAX_SAMPLES) msg = t('play.budget_out');
    else if (n < G.MIN_SAMPLES) msg = t('play.min', { min: G.MIN_SAMPLES });
    $('play-msg').textContent = msg;
    text('play-hint', 'play.hint');
  }

  function sliderValue(id) { return parseInt($(id).value, 10) / 100; }
  function showValue(id, outId) { $(outId).textContent = t('commit.value', { pct: $(id).value }); }

  function renderCommit() {
    text('commit-heading', 'commit.heading');
    text('commit-question', 'commit.question');
    text('commit-slider-label', 'commit.slider');
    text('commit-note', 'commit.note');
    text('btn-submit-claim', 'commit.submit');
    showValue('commit-slider', 'commit-value');
  }

  function renderReview() {
    var rep = S.rep, d = deg(rep.angle);
    text('review-heading', 'review.heading');
    text('review-says', 'review.says', { deg: d, repl: G.REPL_N });
    $('rplot-title').textContent = t('review.plot', { repl: G.REPL_N });
    drawPlot('rplot', rep.points, rep.points.length, { angle: rep.angle, ratio: rep.ratio, half: 4.6 });
    text('review-ratio', 'review.ratio', { ratio: f2(rep.ratio) });
    text('review-ref', 'review.ref', { thr: f2(rep.threshold) });
    text('review-verdict', rep.supports ? 'review.supports' : 'review.not', { thr: f2(rep.threshold) });
    text('review-slider-label', 'review.revise');
    text('btn-final', 'review.final');
    showValue('review-slider', 'review-value');
  }

  function seedRef() {
    var sd = G.seedDate(S.seed);
    return sd ? { date: sd } : { seed: S.seed };
  }

  function shareText(r) {
    var labels = Object.assign({}, I.LANGS.en, I.LANGS[lang]);
    var url = window.location.href.split('#')[0] + G.buildChallengeHash(Object.assign(seedRef(), { lang: lang }));
    return G.buildShare({
      labels: labels, day: G.dayNumber(G.seedDate(S.seed) || S.date), date: G.seedDate(S.seed) || S.date, seed: G.seedDate(S.seed) ? null : S.seed, score: r.sc.total, ideal: r.ref.score,
      n: r.n, p2: r.p2, supports: r.supports, url: url
    });
  }

  function computeResult(inst, n, p1, p2) {
    var st = G.stats(inst.points, n);
    var rep = G.replication(inst, st.angle);
    var ref = G.referenceObserver(inst, n);
    var sc = G.roundScore({ p1: p1, p2: p2, truth: inst.real, n: n });
    return { inst: inst, n: n, p1: p1, p2: p2, st: st, rep: rep, ref: ref, sc: sc, supports: rep.supports };
  }

  function renderResult() {
    var r = S.result, inst = r.inst;
    text('result-heading', 'result.heading');
    $('xplot-title').textContent = t('result.plot');
    drawPlot('xplot', inst.points, r.n, {
      angle: r.st.angle, ratio: r.st.ratio, half: 4.6, trueAngle: inst.real ? inst.theta : null
    });
    if (inst.real) text('result-truth', 'result.truth_real', { deg: deg(inst.theta), tau: inst.tau });
    else text('result-truth', 'result.truth_null');
    var rows = [
      [t('result.row_first', { pct: Math.round(r.p1 * 100) }), signed(0.5 * r.sc.s1)],
      [t('result.row_second', { pct: Math.round(r.p2 * 100) }), signed(0.5 * r.sc.s2)],
      [t('result.row_cost', { n: r.n }), signed(-r.sc.cost)],
      [t('result.row_total'), pts(r.sc.total)]
    ];
    var tb = $('result-rows');
    clear(tb);
    rows.forEach(function (row, i) {
      var tr = document.createElement('tr');
      if (i === rows.length - 1) tr.className = 'total';
      row.forEach(function (c) { var td = document.createElement('td'); td.textContent = c; tr.appendChild(td); });
      tb.appendChild(tr);
    });
    text('result-ideal', 'result.ideal', { ideal: pts(r.ref.score) });
    var nb = $('result-best');
    nb.hidden = !S.newBest;
    if (S.newBest) text('result-best', 'result.new_best');
    var lk = G.pickLesson({ truth: inst.real, p1: r.p1, p2: r.p2, n: r.n, prior: inst.prior, supports: r.supports, ideal: r.ref.p2 });
    text('lesson-heading', 'result.lesson');
    text('lesson-title', 'lesson.' + lk + '.title');
    text('lesson-body', 'lesson.' + lk + '.body');
    text('share-heading', 'result.share_preview');
    $('share-text').textContent = shareText(r);
    text('btn-share', 'result.share');
    text('btn-challenge', 'result.challenge');
    text('btn-practice', 'result.practice');
    var nc = $('result-notcounted');
    nc.hidden = S.mode === 'daily';
    if (S.mode !== 'daily') text('result-notcounted', 'result.not_counted');
    $('result-msg').textContent = '';
    text('stats-heading', 'result.stats');
    renderStats();
    var wn = document.getElementById('result-weight');
    if (!wn) {
      wn = document.createElement('p'); wn.id = 'result-weight'; wn.className = 'muted small-text';
      $('result-rows').parentNode.insertAdjacentElement('afterend', wn);
    }
    wn.textContent = t('result.weight_note');
  }

  function renderStats() {
    var dates = Object.keys(store.daily);
    var sk = G.computeStreak(dates, today);
    var none = t('stats.none');
    var items = [
      t('stats.streak', { n: sk.current }), t('stats.best_streak', { n: sk.best }),
      t('stats.played', { n: dates.length }),
      t('stats.best_daily', { n: store.bestDaily === null ? none : store.bestDaily }),
      t('stats.best_practice', { n: store.bestPractice === null ? none : store.bestPractice })
    ];
    var ul = $('stats-list');
    clear(ul);
    items.forEach(function (s) { var li = document.createElement('li'); li.textContent = s; ul.appendChild(li); });
  }

  function render() {
    renderStatic();
    if (S.view === 'intro') renderIntro();
    else if (S.view === 'play') renderPlay();
    else if (S.view === 'commit') renderCommit();
    else if (S.view === 'review') renderReview();
    else if (S.view === 'result') renderResult();
  }

  /* ---------- flow ---------- */
  function newPuzzle(mode, seed, date, beat) {
    S.mode = mode; S.seed = seed; S.date = date; S.beat = beat === undefined ? null : beat;
    S.inst = null; S.n = 0; S.p1 = S.p2 = null; S.rep = null; S.result = null; S.newBest = false;
    show('intro'); render(); focusHeading('intro-heading');
  }
  function start() {
    S.inst = G.makeInstance(S.seed); S.n = 0;
    show('play'); renderPlay(); focusHeading('play-heading');
  }
  function sample(k) {
    if (S.view !== 'play') return;
    S.n = Math.min(G.MAX_SAMPLES, S.n + k);
    renderPlay();
  }
  function commit() {
    if (S.view !== 'play' || S.n < G.MIN_SAMPLES) return;
    var prior = S.inst.prior;
    $('commit-slider').value = Math.round(prior * 100);
    show('commit'); renderCommit(); focusHeading('commit-heading');
  }
  function submitClaim() {
    S.p1 = G.clampP(sliderValue('commit-slider'));
    var st = G.stats(S.inst.points, S.n);
    S.rep = G.replication(S.inst, st.angle);
    $('review-slider').value = Math.round(S.p1 * 100);
    show('review'); renderReview(); focusHeading('review-heading');
  }
  function finalAnswer() {
    S.p2 = G.clampP(sliderValue('review-slider'));
    S.result = computeResult(S.inst, S.n, S.p1, S.p2);
    var score = Math.round(S.result.sc.total);
    S.newBest = false;
    if (S.mode === 'daily') {
      store.daily[today] = { score: score, n: S.n, p1: S.p1, p2: S.p2 };
      if (store.bestDaily === null || score > store.bestDaily) { store.bestDaily = score; S.newBest = true; }
    } else if (store.bestPractice === null || score > store.bestPractice) { store.bestPractice = score; S.newBest = true; }
    saveStore();
    show('result'); renderResult(); focusHeading('result-heading');
  }
  function showStoredResult() {
    var d = store.daily[today];
    S.inst = G.makeInstance(S.seed); S.n = d.n; S.p1 = d.p1; S.p2 = d.p2;
    S.result = computeResult(S.inst, d.n, d.p1, d.p2); S.newBest = false;
    show('result'); renderResult(); focusHeading('result-heading');
  }

  function copy(textValue, msgId) {
    var done = function (ok) { $(msgId).textContent = t(ok ? 'result.copied' : 'result.copy_fail'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(textValue).then(function () { done(true); }, function () { done(fallbackCopy(textValue)); });
    } else done(fallbackCopy(textValue));
  }
  function fallbackCopy(v) {
    try {
      var ta = document.createElement('textarea');
      ta.value = v; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      var ok = document.execCommand('copy'); document.body.removeChild(ta); return ok;
    } catch (e) { return false; }
  }
  function challengeLink() {
    var best = Math.round(S.result.sc.total);
    return window.location.href.split('#')[0] + G.buildChallengeHash(Object.assign(seedRef(), { best: best, lang: lang }));
  }
  function randomSeed() {
    var s = '';
    var alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
    for (var i = 0; i < 6; i++) s += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
    return 'p' + s;
  }

  /* ---------- events ---------- */
  $('btn-start').addEventListener('click', start);
  $('btn-see-result').addEventListener('click', showStoredResult);
  $('btn-s1').addEventListener('click', function () { sample(1); });
  $('btn-s5').addEventListener('click', function () { sample(5); });
  $('btn-commit').addEventListener('click', commit);
  $('btn-submit-claim').addEventListener('click', submitClaim);
  $('btn-final').addEventListener('click', finalAnswer);
  $('commit-slider').addEventListener('input', function () { showValue('commit-slider', 'commit-value'); });
  $('review-slider').addEventListener('input', function () { showValue('review-slider', 'review-value'); });
  $('btn-share').addEventListener('click', function () { copy($('share-text').textContent, 'result-msg'); });
  $('btn-challenge').addEventListener('click', function () { copy(challengeLink(), 'result-msg'); });
  $('btn-practice').addEventListener('click', function () {
    if (window.history && window.history.replaceState) window.history.replaceState(null, '', window.location.pathname + window.location.search);
    newPuzzle('practice', randomSeed(), today);
  });
  $('btn-lang').addEventListener('click', function () {
    var codes = Object.keys(I.LANGS);
    lang = codes[(codes.indexOf(lang) + 1) % codes.length];
    store.lang = lang; saveStore(); render();
  });
  var lastFocus = null;
  function openHelp() { lastFocus = document.activeElement; $('help').hidden = false; $('btn-help-close').focus(); }
  function closeHelp() { $('help').hidden = true; if (lastFocus) lastFocus.focus(); }
  $('btn-help').addEventListener('click', openHelp);
  $('btn-help-close').addEventListener('click', closeHelp);
  $('help').addEventListener('click', function (e) { if (e.target === $('help')) closeHelp(); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && !$('help').hidden) { closeHelp(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || !$('help').hidden) return;
    var tag = (e.target && e.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    var k = e.key.toLowerCase();
    if (S.view === 'play') {
      if (k === 's') sample(1); else if (k === 'f') sample(5); else if (k === 'c') commit();
    }
  });

  /* ---------- boot ---------- */
  function boot() {
    var mode = 'daily', seed = G.dailySeed(today), date = today, beat = null;
    if (hash.seed) {
      if (hash.date === today) { mode = 'daily'; }
      else { mode = 'challenge'; seed = hash.seed; date = hash.date || today; beat = hash.best; }
      if (hash.date === today && hash.best !== null) beat = hash.best;
    }
    newPuzzle(mode, seed, date, beat);
    window.__crystallize = { errors: errors, ready: true };
    document.documentElement.setAttribute('data-ready', '1');
  }
  boot();
})();
