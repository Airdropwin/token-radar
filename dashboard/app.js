// Token Radar dashboard (model radar-2). Reads window.RADAR from data.js beside dashboard/
// and renders the ranked board, filters, and a per-protocol detail drawer with the model's own
// breakdown and the protocol's farm plan. No network: every byte shown is in data.js.
(function () {
  'use strict';
  var DATA = window.RADAR;
  if (!DATA) return;
  var state = { q: '', category: 'all', chain: 'all', watchlistOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };
  var $ = function (id) { return document.getElementById(id); };
  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) { if (n === null || n === undefined || !isFinite(n)) return 'n/a'; return (n > 0 ? '+' : '') + n.toFixed(2) + '%'; }
  function fmtAge(d) { if (d === null || d === undefined) return 'unknown'; if (d >= 365) return (d / 365).toFixed(1) + 'y'; return Math.max(0, Math.round(d)) + 'd'; }
  function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

  // The model, recomputed in the page from the snapshot figures, so the page's code and the
  // board's data are visibly the same arithmetic: base, growth, maturity and breadth multipliers.
  function impliedParts(row, model) {
    var growth = clamp(row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d, model.growth_floor, model.growth_cap);
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var maturity = model.maturity_floor + (clamp(age, 0, model.maturity_days) / model.maturity_days) * model.maturity_range;
    var breadth = 1 + model.breadth_per_chain * Math.min((row.chains || []).length, model.breadth_max_chains);
    var base = row.tvl_usd * model.base_multiple;
    return { base: base, growth: growth, growthMult: growthMult, maturity: maturity, breadth: breadth, implied: Math.max(1, Math.round(base * growthMult * maturity * breadth)) };
  }
  function impliedOf(row, model) { return impliedParts(row, model).implied; }

  // The farm plan: the same derivation board.json carries — category, chains, TVL and age decide
  // the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) { if (p.tvl_usd >= 5e9) return 250; if (p.tvl_usd >= 1e9) return 150; if (p.tvl_usd >= 1e8) return 100; return 50; }
  function holdDaysFor(age) { if (age === null || age === undefined) return 30; if (age < 180) return 60; if (age < 365) return 45; return 30; }
  function isBridge(p) { return (p.category || '').toLowerCase().indexOf('bridge') >= 0; }
  function isStaking(p) { return (p.category || '').toLowerCase().indexOf('stak') >= 0; }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase(), name = p.name;
    if (c === 'cex') return 'Open an account on ' + name + ', finish its identity check, and place one spot trade of $' + capital + ' of USDC.';
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('stak') >= 0) return 'Stake $' + capital + " of the chain's staking asset through " + name + ' and keep the receipt token.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedged position.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return 'Mint $' + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('basis') >= 0) return 'Deposit $' + capital + ' of USDC into the ' + name + ' basis vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('launchpad') >= 0) return 'Commit $' + capital + ' of USDC to the ' + name + ' launch pool on ' + chain + ' and follow the sale.';
    if (c.indexOf('farm') >= 0) return 'Deposit $' + capital + ' of USDC into the ' + name + ' farm vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('nft') >= 0) return 'Buy or list one item worth about $' + capital + ' on ' + name + ' and keep the receipt.';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return 'Spend $' + capital + ' through ' + name + ' on ' + chain + ' and keep the receipt.';
    if (c.indexOf('governance') >= 0) return 'Hold $' + capital + ' of the governance asset on ' + name + ' and cast one vote.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function riskStep(p, age, capital, chain) {
    var name = p.name, check = { cost: 'nothing to check; a test withdrawal costs a few dollars of gas', time: '15 minutes' };
    if (p.category === 'CEX') return { text: 'Treat ' + name + ' as a custodian, not a wallet: keep only the $' + capital + ' you farm with on the exchange, turn on withdrawal allow-listing, and move any reward off the exchange within a day of claiming it.', cost: check.cost, time: check.time };
    if (isBridge(p)) return { text: 'Bridges are the most-attacked contracts in DeFi: bridge only the $' + capital + ' you need, check the destination address and chain on ' + chain + ' before you confirm, and never sign a claim transaction a stranger sends you.', cost: check.cost, time: check.time };
    if (age !== null && age !== undefined && age < 180) return { text: name + ' has run for ' + age + ' days, under six months: cap the position at $' + capital + ', check whether its contracts are audited before you add more, and never deposit funds you need back this month.', cost: check.cost, time: check.time };
    if (age === null || age === undefined) return { text: name + ' records no listing date, so its age is assumed at 365 days: treat it as unproven, cap the position at $' + capital + ', and verify its contract address on ' + chain + ' before the first deposit.', cost: check.cost, time: check.time };
    if (isStaking(p)) return { text: "Staking receipts can lose their peg: check the receipt token's price against its backing on " + chain + ' once a week, and keep the position at $' + capital + ' until you have unstaked once successfully.', cost: check.cost, time: check.time };
    if (p.tvl_usd >= 1e9) return { text: name + ' holds over $1B of TVL, which is size, not safety: verify the contract address on ' + chain + ', check the audit record, and keep the position at $' + capital + ' until you have withdrawn once successfully.', cost: check.cost, time: check.time };
    return { text: 'Verify ' + name + "'s contract address on " + chain + ' before the first deposit, ignore claim links sent by strangers, and keep the position at $' + capital + ' until you have withdrawn once successfully.', cost: check.cost, time: check.time };
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p), capital = capitalFor(p), hold = holdDaysFor(p.age_days);
    var gas = p.category === 'CEX' ? '$' + capital + ' of capital and under $1 of exchange fees' : '$' + capital + ' of capital and about $' + (capital >= 150 ? 8 : 4) + ' of gas';
    var setup = p.category === 'CEX' ? '20 minutes to set up' : '15 minutes to set up';
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline on paper.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: gas, time: setup },
      { text: 'Make one qualifying action each week on ' + chain + ', such as a deposit, a borrow, a swap or a vote, and note the date.', cost: 'about $2 of gas a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page from its own site and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet address, the dates and every transaction hash in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' },
      riskStep(p, p.age_days, capital, chain)
    ].map(stepText);
  }
  // Verification hooks: the build checks the page's farm plan and implied value against board.json.
  window.__radarFarm = farmSteps;
  window.__radarImplied = impliedOf;
  window.__radarParts = impliedParts;

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') node.className = attrs[k];
      else if (k === 'text') node.textContent = attrs[k];
      else if (k === 'html') node.innerHTML = attrs[k];
      else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
    });
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }
  function poolLabel(pool) { return pool === 'watchlist' ? 'watchlist' : pool === 'early' ? 'early' : 'above floor'; }

  // Deterministic screenshot views and deep links: ?view=board | detail&slug=… | filtered&category=… | live.
  function readQuery() {
    var params = new URLSearchParams(window.location.search);
    var view = params.get('view') || 'board';
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('q')) state.q = params.get('q');
    if (params.get('watchlist') === '1') state.watchlistOnly = true;
    if (view === 'live') state.tab = 'live';
    if (view === 'detail') state.selected = params.get('slug') || (DATA.rows[0] ? DATA.rows[0].slug : null);
    if (view === 'filtered' && !params.get('category')) state.category = 'Dexs';
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchlistOnly && r.pool !== 'watchlist') return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortVal(r, key) {
    if (key === 'rank') return r.rank;
    if (key === 'name') return r.name.toLowerCase();
    if (key === 'category') return (r.category || 'Other').toLowerCase();
    if (key === 'chains') return (r.chains || []).length;
    if (key === 'tvl') return r.tvl_usd;
    if (key === 'growth') return r.change_7d === null ? -Infinity : r.change_7d;
    if (key === 'age') return r.age_days === null ? Infinity : r.age_days;
    return r.implied_value_usd;
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av = sortVal(a, key), bv = sortVal(b, key);
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function fillSelects() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var catSel = $('category'), chainSel = $('chain');
    cats.forEach(function (c) { catSel.appendChild(el('option', { value: c, text: c })); });
    chains.forEach(function (c) { chainSel.appendChild(el('option', { value: c, text: c })); });
    catSel.value = state.category; chainSel.value = state.chain;
    if (catSel.value !== state.category) { state.category = 'all'; catSel.value = 'all'; }
    if (chainSel.value !== state.chain) { state.chain = 'all'; chainSel.value = 'all'; }
  }

  function renderBoard() {
    var list = sortedRows(filteredRows());
    var tbody = $('rows');
    tbody.textContent = '';
    $('caption').textContent = 'Pre-token protocols, strongest implied value first. Select a row for its model breakdown and farm plan.';
    $('count').textContent = list.length + ' of ' + DATA.board_size + ' rows shown';
    if (list.length === 0) {
      tbody.appendChild(el('tr', null, el('td', { colspan: '8' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false; syncControls(); render(); } })
      ))));
      return;
    }
    var max = DATA.rows[0].implied_value_usd || 1;
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var chainText = (r.chains || []).length === 0 ? '—' : (r.chains || [])[0] + ((r.chains || []).length > 1 ? ' +' + ((r.chains || []).length - 1) : '');
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false', tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: r.slug + ' · ' }, el('span', { class: 'pool ' + (r.pool === 'watchlist' ? 'wl' : r.pool === 'early' ? 'early' : ''), text: poolLabel(r.pool) })))),
        el('td', { text: r.category || 'Other' }),
        el('td', { class: 'num', text: chainText, title: (r.chains || []).join(', ') }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', null,
          el('span', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num amber', text: fmtUsd(r.implied_value_usd) })))
      );
      tbody.appendChild(tr);
    });
  }

  function renderLive() {
    var tbody = $('rows');
    tbody.textContent = '';
    $('caption').textContent = 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.';
    $('count').textContent = DATA.live.length + ' live-token protocols';
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: r.slug }))),
        el('td', { text: r.category || 'Other' }),
        el('td', { class: 'num', text: (r.chains || []).length ? (r.chains[0] + ((r.chains || []).length > 1 ? ' +' + ((r.chains || []).length - 1) : '')) : '—', title: (r.chains || []).join(', ') }),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: '—' }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) })
      ));
    });
  }

  var dialog = $('detail');
  dialog.addEventListener('close', function () { state.selected = null; render(); });

  function openDetail(slug) {
    var row = null;
    DATA.rows.forEach(function (r) { if (r.slug === slug) row = r; });
    if (!row) return;
    state.selected = slug;
    dialog.textContent = '';
    var parts = impliedParts(row, DATA.model);
    var recomputed = parts.implied;
    var agree = recomputed === row.implied_value_usd;
    var steps = farmSteps(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'sub', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + ' · ' }, el('span', { class: 'pool ' + (row.pool === 'watchlist' ? 'wl' : row.pool === 'early' ? 'early' : ''), text: poolLabel(row.pool) })),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + ((row.chains || []).length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value — model radar-2' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Base = TVL x 0.30' }), el('b', { class: 'num', text: fmtUsd(parts.base) })),
        el('div', null, el('span', { text: '7d growth (clamped -60..120)' }), el('b', { class: 'num', text: fmtPct(row.change_7d) + ' -> x' + parts.growthMult.toFixed(4) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) + ' -> x' + parts.maturity.toFixed(4) })),
        el('div', null, el('span', { text: 'Breadth (' + (row.chains || []).length + ' chains, capped at 5)' }), el('b', { class: 'num', text: 'x' + parts.breadth.toFixed(4) })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Page recompute: ' + fmtUsd(recomputed) + ' — ' + (agree ? 'matches the value board.json carries.' : 'DIFFERS from the board value: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan — 7 steps' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') { if (!dialog.open) dialog.showModal(); }
    else dialog.setAttribute('open', '');
  }

  function syncControls() {
    $('q').value = state.q;
    $('category').value = state.category;
    $('chain').value = state.chain;
    $('watchlist-only').checked = state.watchlistOnly;
    $('tab-pre').setAttribute('aria-pressed', state.tab === 'pre-token' ? 'true' : 'false');
    $('tab-live').setAttribute('aria-pressed', state.tab === 'live' ? 'true' : 'false');
  }

  function render() {
    syncControls();
    document.querySelectorAll('th button[data-sort]').forEach(function (b) {
      var arrow = b.querySelector('.arrow');
      if (arrow) arrow.textContent = state.sort === b.getAttribute('data-sort') ? (state.dir < 0 ? ' ▼' : ' ▲') : '';
    });
    if (state.tab === 'pre-token') renderBoard(); else renderLive();
    if (state.selected) {
      var row = null;
      DATA.rows.forEach(function (r) { if (r.slug === state.selected) row = r; });
      if (row && !dialog.open) openDetail(state.selected);
    }
  }

  function init() {
    $('meta-asof').textContent = 'Snapshot ' + DATA.as_of;
    var facts = $('facts');
    facts.appendChild(el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })));
    facts.appendChild(el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })));
    facts.appendChild(el('div', { class: 'fact' }, el('span', { text: 'Early rows (non-watchlist)' }), el('b', { text: String(DATA.early_size) })));
    facts.appendChild(el('div', { class: 'fact' }, el('span', { text: 'Live-token set aside' }), el('b', { text: String(DATA.live_size) })));
    var m = DATA.model;
    $('formula').innerHTML = '';
    $('formula').appendChild(el('div', { html: 'implied = round( <b>TVL x 0.30</b> x (1 + clamp(7d, -60, 120) / 100 x 0.6) x (0.6 + min(age, 1095) / 1095 x 0.4) x (1 + 0.04 x min(chains, 5)) )' }));
    $('model-note').textContent = 'TVL and seven-day growth come from the snapshot. Age is the time since the protocol was first listed, the best record of how long it has run with no token; an unlisted age uses 365 days. Breadth rewards protocols live on more chains, capped at five. Source: ' + DATA.source + '.';
    readQuery();
    fillSelects();
    $('q').addEventListener('input', function () { state.q = $('q').value; render(); });
    $('category').addEventListener('change', function () { state.category = $('category').value; render(); });
    $('chain').addEventListener('change', function () { state.chain = $('chain').value; render(); });
    $('watchlist-only').addEventListener('change', function () { state.watchlistOnly = $('watchlist-only').checked; render(); });
    $('tab-pre').addEventListener('click', function () { state.tab = 'pre-token'; render(); });
    $('tab-live').addEventListener('click', function () { state.tab = 'live'; render(); });
    document.querySelectorAll('th button[data-sort]').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-sort');
        if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = key === 'name' || key === 'category' ? 1 : -1; }
        render();
      });
    });
    window.addEventListener('keydown', function (e) { if (e.key === 'Escape' && dialog.open) dialog.close(); });
    render();
  }
  init();
})();
