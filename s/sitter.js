/*
 * The sitter link page (Phase 6). The owner shares
 *   https://7cyh2hgymf-cyber.github.io/dogardi-web/s/?t=<token>
 * and the sitter opens it in any browser, with no app or account. Everything
 * on it comes from the `sitter` Edge Function (supabase/functions/sitter),
 * which checks the token on every visit and sends only what the owner chose:
 * today's routine (with Log it), house notes, medical info, and emergency
 * info (always). Expired, stopped and unknown links show nothing about the dog.
 *
 * It looks like the app's Home: the Forest header band, then Today's tasks
 * drawn and animated as in src/features/home/TodaysTasks.tsx.
 */
(function () {
  var API = 'https://koljfhzxgcqcfwremdmq.supabase.co/functions/v1/sitter';
  var POISON_LINE = { name: 'Pet Poison Helpline', phone: '1-855-764-7661' };
  var DAY_START_HOUR = 5;
  var token = new URLSearchParams(location.search).get('t') || '';
  var data = null;

  // Log it's animation: the same timings, easings and keyframes as the app (src/lib/trafficMotion.ts).
  var POP = { ms: 300, burstAtMs: 120 };
  var BURST = { dots: 10, ms: 500, minPx: 60, maxPx: 110, vertical: 0.5, endScale: 0.3 };
  var TRAFFIC = { staggerMs: 90, moveMs: 600, gapPx: 12, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)' };
  var SIMPLE_SLIDE_MS = 400;
  var PROGRESS_MS = 800;
  var GROW_MS = 300;
  var CELEBRATE_GROW_MS = 700;
  var reduceMotion = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

  /** Tasks that have been tapped: popping, or popped and waiting their turn to leave. */
  var leaving = {};
  /** When the current move has fully settled (ms since 1970); only one runs at a time. */
  var busyUntil = 0;
  var sending = 0;
  var showCompleted = false;
  /** What the progress bar shows right now (it fills from empty when the page opens). */
  var shownDone = 0;
  var progressRun = 0;
  var sizeRun = 0;

  function esc(text) {
    return String(text == null ? '' : text).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function digits(phone) {
    return String(phone || '').replace(/[^0-9+]/g, '');
  }
  function $(id) {
    return document.getElementById(id);
  }
  function years(n) {
    return n + (n === 1 ? ' year' : ' years');
  }
  function later(fn, ms) {
    return setTimeout(fn, Math.max(0, ms));
  }

  /** The dog's day runs 5 AM to 5 AM, as in the app: at 1 AM it's still yesterday's routine. */
  function planDay() {
    var now = new Date();
    if (now.getHours() < DAY_START_HOUR) now = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  }
  function clock(date) {
    var h = date.getHours();
    return (h % 12 === 0 ? 12 : h % 12) + ':' + String(date.getMinutes()).padStart(2, '0') + ' ' + (h < 12 ? 'AM' : 'PM');
  }
  /** Minutes into the 5 AM day: 2:00 AM comes after 11:00 PM. */
  function dayMinutes(time) {
    var m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(time || '').trim());
    if (!m) return null;
    var minutes = ((+m[1] % 12) + (/pm/i.test(m[3]) ? 12 : 0)) * 60 + +m[2];
    return minutes < DAY_START_HOUR * 60 ? minutes + 1440 : minutes;
  }
  function isOverdue(time) {
    var due = dayMinutes(time);
    var now = new Date();
    var at = now.getHours() * 60 + now.getMinutes();
    if (at < DAY_START_HOUR * 60) at += 1440;
    return due !== null && at > due;
  }
  /** "Until Sun 8:00 PM", "Until today 8:00 PM", or with the date when it's over a week away. */
  function untilText(iso) {
    var end = new Date(iso);
    var now = new Date();
    var day = end.toDateString() === now.toDateString() ? 'today' : end.toLocaleDateString([], end - now > 6 * 864e5 ? { weekday: 'short', month: 'short', day: 'numeric' } : { weekday: 'short' });
    return 'Until ' + day + ' ' + clock(end);
  }

  var toastTimer;
  function toast(text) {
    var el = $('toast');
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('show');
    }, 2600);
  }

  // ---------------------------------------------------------------------------
  // Icons: the app's Phosphor icons (bold) and its own dog bowl
  // ---------------------------------------------------------------------------

  var PATHS = {
    walk: 'M152 84a36 36 0 1 0-36-36 36 36 0 0 0 36 36m0-48a12 12 0 1 1-12 12 12 12 0 0 1 12-12m68 112a12 12 0 0 1-12 12c-37 0-55.27-18.47-70-33.3-1.71-1.72-3.36-3.4-5-5l-8.63 19.85L159 166.23a12 12 0 0 1 5 9.77v56a12 12 0 0 1-24 0v-49.83l-25.37-18.12L83 236.78a12 12 0 1 1-22-9.57l50.06-115.13q-10.64.75-25 8.4a159.8 159.8 0 0 0-29.83 21.23 12 12 0 0 1-16.43-17.5c2.61-2.45 64.36-59.67 104.09-25.18 3.94 3.42 7.64 7.16 11.22 10.78C168.43 123.28 181 136 208 136a12 12 0 0 1 12 12',
    meds: 'M219.26 36.77a57.28 57.28 0 0 0-81 0L36.77 138.26a57.26 57.26 0 0 0 81 81l101.49-101.52a57.33 57.33 0 0 0 0-80.97M100.78 202.26a33.26 33.26 0 1 1-47-47L96 113l47 47Zm101.5-101.49L160 143l-47-47 42.27-42.26a33.26 33.26 0 0 1 47 47Zm-9.77-25.26a12 12 0 0 1 0 17l-24 24a12 12 0 1 1-17-17l24-24a12 12 0 0 1 17 0',
    potty: 'M236 108a24 24 0 1 1-24-24 24 24 0 0 1 24 24m-168 0a24 24 0 1 0-24 24 24 24 0 0 0 24-24m24-24a24 24 0 1 0-24-24 24 24 0 0 0 24 24m72 0a24 24 0 1 0-24-24 24 24 0 0 0 24 24m48 100a44 44 0 0 1-61.1 40.55 60.15 60.15 0 0 0-45.8 0A44 44 0 0 1 67 145.34a31.33 31.33 0 0 0 14.91-18.74 48 48 0 0 1 92.18 0A31.34 31.34 0 0 0 189 145.34 44 44 0 0 1 212 184m-24 0a20 20 0 0 0-10.49-17.6l-.1-.06a55.22 55.22 0 0 1-26.37-33 24 24 0 0 0-46.08 0 55.2 55.2 0 0 1-26.37 33.05l-.1.06A20 20 0 0 0 88 204a19.8 19.8 0 0 0 7.8-1.58h.13a84 84 0 0 1 64.14 0h.13A19.8 19.8 0 0 0 168 204a20 20 0 0 0 20-20',
    play: 'M204.4 51.6a108 108 0 1 0 0 152.8 108.16 108.16 0 0 0 0-152.8m-135.82 17a83.47 83.47 0 0 1 46.2-23.52 84.09 84.09 0 0 1-69.72 69.72 83.47 83.47 0 0 1 23.52-46.22Zm-23.84 70.47a107.27 107.27 0 0 0 63.45-30.88 107.27 107.27 0 0 0 30.88-63.45 83.84 83.84 0 0 1 72.19 72.19 108.11 108.11 0 0 0-94.33 94.32 83.82 83.82 0 0 1-72.19-72.18m142.68 48.35a83.53 83.53 0 0 1-46.2 23.52 84.09 84.09 0 0 1 69.72-69.72 83.47 83.47 0 0 1-23.52 46.2',
    grooming: 'M238.78 183.79 98.28 87.65A40.2 40.2 0 0 0 100 76a40 40 0 1 0-15.29 31.45l30 20.56-30 20.56a40 40 0 1 0 3.57 59.74A39.73 39.73 0 0 0 100 180a40.2 40.2 0 0 0-1.72-11.66l37.72-25.8 89.22 61.06a12 12 0 0 0 13.56-19.81m-167.47 7.54A16 16 0 1 1 76 180a16 16 0 0 1-4.69 11.33M48.69 87.3a16 16 0 1 1 22.62 0 16 16 0 0 1-22.62 0m112.82 23.24a12 12 0 0 1 3.13-16.68l60.58-41.46a12 12 0 0 1 13.56 19.81l-60.59 41.46a12 12 0 0 1-16.68-3.13',
    teeth: 'M172.46 83.15 160.31 88l12.15 4.85a12 12 0 1 1-8.92 22.29L128 100.93l-35.54 14.22a12 12 0 0 1-8.92-22.29L95.69 88l-12.15-4.85a12 12 0 0 1 8.92-22.29L128 75.08l35.54-14.22a12 12 0 0 1 8.92 22.29m55.54-3.4c.08 76.45-25.2 135.68-49 152.59a20 20 0 0 1-31.44-14.92c-.67-9.06-2.33-22-6.46-32.23C135.76 172 129.92 172 128 172c-7.76 0-11.77 9.92-13.08 13.18-4.13 10.22-5.79 23.17-6.46 32.23A20 20 0 0 1 88.51 236 19.86 19.86 0 0 1 77 232.34C53.2 215.43 27.92 156.2 28 79.75A60 60 0 0 1 88 20h80a60 60 0 0 1 60 59.75m-24 0A36 36 0 0 0 168 44H88a36 36 0 0 0-36 35.78c-.06 61.09 17.83 109.52 33.3 127.66C91.24 156 114.32 148 128 148s36.76 8 42.7 59.43c15.47-18.12 33.36-66.55 33.3-127.65Z',
    vet: 'M216 52h-36v-8a28 28 0 0 0-28-28h-48a28 28 0 0 0-28 28v8H40a20 20 0 0 0-20 20v128a20 20 0 0 0 20 20h176a20 20 0 0 0 20-20V72a20 20 0 0 0-20-20m-116-8a4 4 0 0 1 4-4h48a4 4 0 0 1 4 4v8h-56Zm112 152H44V76h168Zm-48-60a12 12 0 0 1-12 12h-12v12a12 12 0 0 1-24 0v-12h-12a12 12 0 0 1 0-24h12v-12a12 12 0 0 1 24 0v12h12a12 12 0 0 1 12 12',
    training: 'm249.8 85.49-116-64a12 12 0 0 0-11.6 0l-116 64a12 12 0 0 0 0 21l21.8 12v47.76a19.9 19.9 0 0 0 5.09 13.32C46.63 194.7 77 220 128 220a136.9 136.9 0 0 0 40-5.75V240a12 12 0 0 0 24 0v-35.88a119.5 119.5 0 0 0 30.91-24.51 19.9 19.9 0 0 0 5.09-13.32v-47.76l21.8-12a12 12 0 0 0 0-21ZM128 45.71 219.16 96 186 114.3a2 2 0 0 1-.18-.12l-52-28.69a12 12 0 0 0-11.6 21l39 21.49L128 146.3 36.84 96ZM128 196c-40.42 0-64.65-19.07-76-31.27v-33l70.2 38.74a12 12 0 0 0 11.6 0l34.2-18.83v37.23a110.5 110.5 0 0 1-40 7.13m76-31.27a93 93 0 0 1-12 10.81v-37.15l12-6.62Z',
    other: 'M208 28h-20v-4a12 12 0 0 0-24 0v4H92v-4a12 12 0 0 0-24 0v4H48a20 20 0 0 0-20 20v160a20 20 0 0 0 20 20h160a20 20 0 0 0 20-20V48a20 20 0 0 0-20-20M68 52a12 12 0 0 0 24 0h72a12 12 0 0 0 24 0h16v24H52V52ZM52 204V100h152v104Z',
    todo: 'M79.51 144.49a12 12 0 1 1 17-17L112 143l47.51-47.52a12 12 0 0 1 17 17l-56 56a12 12 0 0 1-17 0ZM228 48v160a20 20 0 0 1-20 20H48a20 20 0 0 1-20-20V48a20 20 0 0 1 20-20h160a20 20 0 0 1 20 20m-24 4H52v152h152Z',
    appointment: 'M208 28h-20v-4a12 12 0 0 0-24 0v4H92v-4a12 12 0 0 0-24 0v4H48a20 20 0 0 0-20 20v160a20 20 0 0 0 20 20h160a20 20 0 0 0 20-20V48a20 20 0 0 0-20-20M68 52a12 12 0 0 0 24 0h72a12 12 0 0 0 24 0h16v24H52V52ZM52 204V100h152v104Zm120.49-84.49a12 12 0 0 1 0 17l-48 48a12 12 0 0 1-17 0l-24-24a12 12 0 0 1 17-17L116 159l39.51-39.52a12 12 0 0 1 16.98.03',
    check: 'm232.49 80.49-128 128a12 12 0 0 1-17 0l-56-56a12 12 0 1 1 17-17L96 183 215.51 63.51a12 12 0 0 1 17 17Z',
    caretDown: 'm216.49 104.49-80 80a12 12 0 0 1-17 0l-80-80a12 12 0 0 1 17-17L128 159l71.51-71.52a12 12 0 0 1 17 17Z',
    warning: 'M240.26 186.1 152.81 34.23a28.74 28.74 0 0 0-49.62 0L15.74 186.1a27.45 27.45 0 0 0 0 27.71A28.31 28.31 0 0 0 40.55 228h174.9a28.31 28.31 0 0 0 24.79-14.19 27.45 27.45 0 0 0 .02-27.71m-20.8 15.7a4.46 4.46 0 0 1-4 2.2H40.55a4.46 4.46 0 0 1-4-2.2 3.56 3.56 0 0 1 0-3.73L124 46.2a4.77 4.77 0 0 1 8 0l87.44 151.87a3.56 3.56 0 0 1 .02 3.73M116 136v-32a12 12 0 0 1 24 0v32a12 12 0 0 1-24 0m28 40a16 16 0 1 1-16-16 16 16 0 0 1 16 16',
    shieldPlusFill: 'M208 40H48a16 16 0 0 0-16 16v56c0 52.72 25.52 84.67 46.93 102.19 23.06 18.86 46 25.27 47 25.53a8 8 0 0 0 4.2 0c1-.26 23.91-6.67 47-25.53C198.48 196.67 224 164.72 224 112V56a16 16 0 0 0-16-16m-48 96h-24v24a8 8 0 0 1-16 0v-24H96a8 8 0 0 1 0-16h24V96a8 8 0 0 1 16 0v24h24a8 8 0 0 1 0 16',
    paw: 'M240 108a28 28 0 1 1-28-28 28 28 0 0 1 28 28m-168 0a28 28 0 1 0-28 28 28 28 0 0 0 28-28m20-20a28 28 0 1 0-28-28 28 28 0 0 0 28 28m72 0a28 28 0 1 0-28-28 28 28 0 0 0 28 28m23.12 60.86a35.3 35.3 0 0 1-16.87-21.14 44 44 0 0 0-84.5 0A35.25 35.25 0 0 1 69 148.82 40 40 0 0 0 88 224a39.5 39.5 0 0 0 15.52-3.13 64.1 64.1 0 0 1 48.87 0 40 40 0 0 0 34.73-72Z',
  };

  function icon(name, size) {
    return '<svg width="' + size + '" height="' + size + '" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true"><path d="' + PATHS[name] + '"/></svg>';
  }
  /** Meals: the app's own dog bowl (src/components/ui/DogBowlIcon.tsx), bold. */
  function dogBowl(size) {
    return (
      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.25" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M3.4 8.6 C3.6 5.4 8 3.8 12 3.8 C16 3.8 20.4 5.4 20.6 8.6 L22.4 16.2 C22.6 18.6 17.8 20.2 12 20.2 C6.2 20.2 1.4 18.6 1.6 16.2 Z"/>' +
      '<ellipse cx="12" cy="8.6" rx="6.4" ry="1.8"/></svg>'
    );
  }
  function kindIcon(kind) {
    return kind === 'meal' ? dogBowl(20) : icon(PATHS[kind] ? kind : 'other', 20);
  }

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------

  function load(quiet) {
    if (!token) return showProblem('notFound');
    return fetch(API + '?t=' + encodeURIComponent(token) + '&day=' + planDay(), { cache: 'no-store' })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) return showProblem(body.problem || 'server');
          // A tap or a move that started while this was loading wins.
          if (quiet && busy()) return;
          data = body;
          render();
        });
      })
      .catch(function () {
        if (!quiet) showProblem('offline');
      });
  }

  /** Something's moving, sending or open: a background refresh would interrupt it. */
  function busy() {
    return Date.now() < busyUntil + 500 || sending > 0 || Object.keys(leaving).length > 0 || !!document.querySelector('.sheet.open');
  }

  var PROBLEMS = {
    expired: ['This link has expired', 'Sitter links end on their own, to keep the dog’s home and info private. Ask the owner for a new one.'],
    stopped: ['This link was turned off', 'The owner stopped sharing this page. Ask them for a new link if you’re still looking after their dog.'],
    notFound: ['This link doesn’t work', 'Check you opened the whole link from the message. If it still doesn’t work, ask the owner to send it again.'],
    offline: ['Can’t load the page', 'Check your connection, then try again.'],
    server: ['Something went wrong', 'Try again in a minute.'],
  };

  function showProblem(problem) {
    data = null;
    var text = PROBLEMS[problem] || PROBLEMS.server;
    document.title = text[0] + ' · Dogardi';
    $('band').innerHTML =
      '<div class="band-row"><div class="band-text"><p class="eyebrow">Dogardi · no app needed</p><h1 class="band-title">Sitter link</h1></div></div>' +
      (problem === 'expired' ? '<p class="band-meta">Expired</p>' : '');
    $('footer').hidden = true;
    document.querySelectorAll('.sheet, .sheet-bg').forEach(function (n) {
      n.remove();
    });
    var page = $('page');
    page.removeAttribute('aria-busy');
    page.className = 'expired';
    page.innerHTML =
      '<div class="clock" aria-hidden="true"><svg width="56" height="56" viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><circle cx="128" cy="128" r="96"/><polyline points="128 72 128 128 184 128"/></svg></div>' +
      '<h1>' + esc(text[0]) + '</h1>' +
      '<p class="muted" style="margin-top:8px">' + esc(text[1]) + '</p>' +
      '<div class="stack">' +
      (problem === 'offline' || problem === 'server' ? '<button class="primary block" id="retry">Try again</button>' : '') +
      '<a class="btn outline block" href="tel:' + digits(POISON_LINE.phone) + '">Emergency? Call the ' + esc(POISON_LINE.name) + '</a>' +
      '</div>';
    var retry = $('retry');
    if (retry)
      retry.addEventListener('click', function () {
        load();
      });
  }

  // ---------------------------------------------------------------------------
  // The page
  // ---------------------------------------------------------------------------

  var ATE = { all: 'Ate it all', some: 'Ate some', none: 'Didn’t eat' };

  function render() {
    var d = data;
    var dog = d.dog;
    var owner = d.owner;
    document.title = dog.name + '’s day · Dogardi';

    // Home's header band: photo with a Golden Oat ring, a hello, "{Dog}'s day", and Emergency.
    $('band').innerHTML =
      '<div class="band-row">' +
      (dog.photoUrl ? '<img class="avatar" src="' + esc(dog.photoUrl) + '" alt="' + esc(dog.name) + '">' : '<div class="avatar" aria-hidden="true">' + icon('paw', 28) + '</div>') +
      '<div class="band-text"><p class="eyebrow">Hi' + (d.sitterName ? ' ' + esc(d.sitterName) : '') + '!</p>' +
      '<h1 class="band-title">' + esc(dog.name) + '’s day</h1></div>' +
      '<button class="icon-btn" data-emergency aria-label="Emergency mode">' + icon('shieldPlusFill', 24) + '</button>' +
      '</div>' +
      '<p class="band-meta">Shared by ' + esc(owner.name) + ' · ' + esc(untilText(d.expiresAt)) + '</p>';

    var about = [dog.breed, dog.ageYears != null ? years(dog.ageYears) : ''].filter(Boolean);
    var html = '<p class="muted">You’re looking after ' + esc(dog.name) + (about.length ? ' · ' + esc(about.join(' · ')) : '') + '. No app needed.</p>';

    if (d.permissions.routine) html += '<section class="tasks" id="tasks" aria-label="Today’s tasks"></section><p class="muted small-print" id="hint"></p>';

    if (d.avoid.length || d.houseNotes) {
      html += '<section class="card warm"><h2>' + (d.houseNotes ? 'House notes from ' + esc(owner.name) : 'Food') + '</h2>';
      if (d.avoid.length) html += '<p class="avoid"><strong>Never give ' + esc(dog.name) + ':</strong> ' + esc(d.avoid.join(', ')) + '</p>';
      if (d.houseNotes) html += '<p class="notes">' + esc(d.houseNotes) + '</p>';
      html += '</section>';
    }

    if (d.medical && d.medical.length) {
      html +=
        '<section class="card"><h2>' + esc(dog.name) + '’s medical info</h2><ul class="facts">' +
        d.medical.map(function (m) {
          return '<li><b>' + esc(m.label) + '</b>' + esc(m.value) + '</li>';
        }).join('') +
        '</ul></section>';
    }

    var page = $('page');
    page.className = '';
    page.removeAttribute('aria-busy');
    page.innerHTML = html;
    if (d.permissions.routine) renderTasks();

    var call = $('call-owner');
    call.hidden = !owner.phone;
    if (owner.phone) {
      call.textContent = 'Call ' + owner.name;
      call.href = 'tel:' + digits(owner.phone);
    }
    $('footer').hidden = false;
    renderSheets();
  }

  // ---------------------------------------------------------------------------
  // Today's tasks: Home's card, with Log it popping the task
  // ---------------------------------------------------------------------------

  function taskById(id) {
    for (var i = 0; i < data.tasks.length; i++) if (data.tasks[i].id === id) return data.tasks[i];
    return null;
  }
  /** Still to do, counting tasks mid-pop (the server may have saved them already). */
  function remainingTasks() {
    return data.tasks.filter(function (t) {
      return !t.logged || leaving[t.id];
    });
  }
  function completedTasks() {
    return data.tasks.filter(function (t) {
      return t.logged;
    });
  }
  function nextId() {
    var next = remainingTasks().filter(function (t) {
      return !leaving[t.id];
    })[0];
    return next ? next.id : null;
  }
  function isImportant(t) {
    return !!t.important || t.kind === 'meds';
  }
  /** The sitter's own logs say "You", as the app does for the person logged in. */
  function whoLabel(by) {
    return data.sitterName && by === data.sitterName + ' (sitter)' ? 'you' : by;
  }
  function loggedBy(entry) {
    var by = 'Logged by ' + whoLabel(entry.by) + (entry.at ? ' · ' + entry.at : '');
    return entry.ate ? ATE[entry.ate] + ' · ' + by : by;
  }

  /** One task: its icon chip, name, the time under it ("Next ·" or "Overdue ·") and Log it. */
  function taskLine(t, next) {
    var meds = t.kind === 'meds';
    var overdue = isOverdue(t.time);
    return (
      '<div class="line" data-task="' + esc(t.id) + '">' +
      (isImportant(t) ? '<span class="important"></span>' : '') +
      '<span class="chip' + (meds ? ' meds' : '') + '">' + kindIcon(t.kind) + '</span>' +
      '<span class="what"' + ' aria-label="' + esc((isImportant(t) ? 'Important. ' : '') + t.title + ', ' + t.time) + '">' +
      '<span class="title">' + esc(t.title) + '</span>' +
      (t.subtitle ? '<span class="sub">' + esc(t.subtitle) + '</span>' : '') +
      '<span class="time">' + esc(t.time) + '</span>' +
      '</span>' +
      (t.canLog ? '<button class="log quiet" data-log="' + esc(t.id) + '" aria-label="Log ' + esc(t.title) + '">Log it</button>' : '') +
      '</div>'
    );
  }

  /** Next and Overdue labels, and which Log it is the filled one (only the next task's). */
  function refreshLines() {
    var list = $('list');
    if (!list) return;
    var nid = nextId();
    list.querySelectorAll('.line').forEach(function (row) {
      var t = taskById(row.getAttribute('data-task'));
      if (!t) return;
      var next = t.id === nid;
      var overdue = isOverdue(t.time);
      var time = row.querySelector('.time');
      time.className = 'time' + (overdue ? ' overdue' : next ? ' next' : '');
      time.textContent = overdue ? 'Overdue · ' + t.time : next ? 'Next · ' + t.time : t.time;
      var btn = row.querySelector('.log');
      if (btn) btn.className = 'log ' + (next ? 'highlight' : 'quiet');
    });
  }

  function allDoneHtml() {
    return (
      '<div class="all-done" role="status" aria-label="All done for today! ' + esc(data.dog.name) + ' is one happy pup.">' +
      '<span class="tick">' + icon('check', 26) + '</span>' +
      '<h3>All done for today!</h3><p>' + esc(data.dog.name) + ' is one happy pup.</p></div>'
    );
  }

  function renderTasks() {
    var box = $('tasks');
    if (!box) return;
    var total = data.tasks.length;
    var left = remainingTasks();
    var done = total - left.length;
    var head =
      '<div class="tasks-head"><h2>Today’s tasks</h2>' +
      (total ? '<span class="count" id="count" aria-label="' + done + ' of ' + total + ' done">' + Math.round(shownDone) + ' of ' + total + ' done</span>' : '') +
      '</div>';
    if (!total) {
      box.innerHTML = head + '<p class="empty-day" style="margin-top:8px">Nothing planned for ' + esc(data.dog.name) + ' today.</p>';
      updateHint();
      return;
    }
    box.innerHTML =
      head +
      '<div class="track" role="progressbar" aria-valuemin="0" aria-valuemax="100" id="track"><div class="fill" id="fill"></div></div>' +
      '<div class="list" id="list">' + (left.length ? left.map(function (t) { return taskLine(t); }).join('') : allDoneHtml()) + '</div>' +
      '<div id="note-slot"></div>' +
      '<div class="completed" id="completed"></div>';
    $('fill').style.width = (shownDone / total) * 100 + '%';
    refreshLines();
    renderCompleted();
    updateHint();
    animateProgress(done, total, 0);
  }

  function updateHint() {
    var hint = $('hint');
    if (!hint) return;
    var canLog = data.tasks.some(function (t) {
      return t.canLog && !t.logged;
    });
    hint.hidden = !canLog;
    hint.textContent = canLog ? 'Tap Log it when it’s done. ' + data.owner.name + ' sees it straight away.' : '';
  }

  /** The bar fills smoothly (0.8 s, ease-out) and the number counts up with it, as on Home. */
  function animateProgress(done, total, delayMs) {
    var run = ++progressRun;
    var from = shownDone;
    var track = $('track');
    if (track) track.setAttribute('aria-valuenow', String(Math.round((done / total) * 100)));
    var count = $('count');
    if (count) count.setAttribute('aria-label', done + ' of ' + total + ' done');
    if (from === done) return;
    later(function () {
      var start = performance.now();
      function step(now) {
        if (run !== progressRun) return;
        var u = Math.min(1, (now - start) / PROGRESS_MS);
        var eased = 1 - Math.pow(1 - u, 3);
        shownDone = from + (done - from) * eased;
        var fill = $('fill');
        var count = $('count');
        if (fill) fill.style.width = (shownDone / total) * 100 + '%';
        if (count) count.textContent = Math.round(shownDone) + ' of ' + total + ' done';
        if (u < 1) requestAnimationFrame(step);
        else shownDone = done;
      }
      requestAnimationFrame(step);
    }, delayMs);
  }

  /** "Show completed (X)": today's logged tasks, and who logged them. */
  function renderCompleted() {
    var box = $('completed');
    if (!box) return;
    var items = completedTasks().filter(function (t) {
      return !leaving[t.id];
    });
    if (!items.length) {
      box.innerHTML = '';
      return;
    }
    box.innerHTML =
      '<button class="completed-toggle" id="completed-toggle" aria-expanded="' + showCompleted + '">' +
      '<span>' + (showCompleted ? 'Hide completed' : 'Show completed (' + items.length + ')') + '</span>' + icon('caretDown', 16) + '</button>' +
      (showCompleted
        ? '<div class="completed-list">' +
          items.map(function (t) {
            return (
              '<div class="done-row"><span class="tick">' + icon('check', 14) + '</span>' +
              '<span><span class="title">' + esc(t.title) + '</span><br><span class="by">' + esc(loggedBy(t.logged)) + '</span></span></div>'
            );
          }).join('') +
          '</div>'
        : '');
  }

  function showNote(text) {
    var slot = $('note-slot');
    if (!slot) return;
    slot.innerHTML = '<p class="note" role="status">' + icon('check', 16) + '<span>' + esc(text) + '</span></p>';
    later(function () {
      if (slot.textContent === text) slot.innerHTML = '';
    }, 2600);
  }

  /** Log it on a meal asks how much was eaten first (when the owner tracks it); everything else logs straight away. */
  function logIt(task) {
    if (leaving[task.id] || task.logged) return;
    if (task.kind === 'meal' && data.trackAppetite) return askAte(task);
    pop(task);
  }

  /**
   * The pop: 300 ms, ease-in, scale 1 → 1.06 (35%) → 0.5 while fading out.
   * At 120 ms ten dots burst from its centre; when it ends the task leaves and
   * the tasks below move up. It's saved straight away; if that fails, the task
   * comes back.
   */
  function pop(task, ate) {
    var row = document.querySelector('.line[data-task="' + CSS.escape(task.id) + '"]');
    if (!row) return;
    leaving[task.id] = true;
    var btn = row.querySelector('.log');
    if (btn) btn.disabled = true;
    refreshLines();
    if (navigator.vibrate) navigator.vibrate(15);
    var entry = { by: (data.sitterName || 'Sitter') + ' (sitter)', at: clock(new Date()) };
    if (ate) entry.ate = ate;
    save(task, entry);
    row.style.transformOrigin = 'center';
    row.animate(
      [
        { transform: 'scale(1)', opacity: 1 },
        { transform: 'scale(1.06)', opacity: 1, offset: 0.35 },
        { transform: 'scale(0.5)', opacity: 0 },
      ],
      { duration: POP.ms, easing: 'ease-in', fill: 'forwards' },
    );
    later(function () {
      burstFrom(row);
    }, POP.burstAtMs);
    later(function () {
      leave(task, entry);
    }, POP.ms);
  }

  /** 10 dots fly out from the task's centre: 60–110 px out (half that up and down), shrinking and fading over 500 ms. */
  function burstFrom(row) {
    var list = $('list');
    if (!list || !row.isConnected) return;
    var burst = document.createElement('div');
    burst.className = 'burst';
    burst.style.top = row.offsetTop + row.offsetHeight / 2 + 'px';
    var colours = ['var(--golden-oat)', 'var(--clay)', 'var(--mist)', 'var(--warm-white)'];
    for (var i = 0; i < BURST.dots; i++) {
      var angle = (i / BURST.dots) * Math.PI * 2;
      var distance = BURST.minPx + Math.random() * (BURST.maxPx - BURST.minPx);
      var dx = Math.cos(angle) * distance;
      var dy = Math.sin(angle) * distance * BURST.vertical;
      var dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = colours[i % colours.length];
      burst.appendChild(dot);
      dot.animate(
        [
          { transform: 'translate(0, 0) scale(1)', opacity: 1 },
          { transform: 'translate(' + dx + 'px, ' + dy + 'px) scale(' + BURST.endScale + ')', opacity: 0 },
        ],
        { duration: BURST.ms, easing: 'ease-out', fill: 'forwards' },
      );
    }
    list.appendChild(burst);
    later(function () {
      burst.remove();
    }, BURST.ms + 50);
  }

  /**
   * The popped task leaves and the tasks below move up into its space like
   * traffic at a green light: 90 ms apart, 600 ms each, squishing from their
   * top edge (with Reduce Motion, a plain slide together). Only one move runs
   * at a time; a task logged mid-move waits its turn.
   */
  function leave(task, entry) {
    if (!data) return;
    var wait = busyUntil - Date.now();
    if (wait > 0) return later(function () {
      leave(task, entry);
    }, wait);
    var list = $('list');
    var row = list && list.querySelector('.line[data-task="' + CSS.escape(task.id) + '"]');
    delete leaving[task.id];
    if (!task.logged) task.logged = entry;
    if (!row) return renderTasks();

    var below = [];
    for (var el = row.nextElementSibling; el; el = el.nextElementSibling) if (el.classList.contains('line')) below.push(el);
    var distance = row.offsetHeight + TRAFFIC.gapPx;
    var simple = reduceMotion.matches;
    var moveMs = simple ? (below.length ? SIMPLE_SLIDE_MS : 0) : below.length ? (below.length - 1) * TRAFFIC.staggerMs + TRAFFIC.moveMs : 0;
    busyUntil = Date.now() + moveMs;

    // Hold the card's size while the rows move; it eases to the new size once they've nearly settled.
    var held = list.offsetHeight;
    list.classList.remove('sizing');
    list.style.height = held + 'px';
    row.remove();
    var left = remainingTasks().length;
    var allDone = null;
    if (!left && !list.querySelector('.all-done')) {
      list.insertAdjacentHTML('afterbegin', allDoneHtml());
      allDone = list.querySelector('.all-done');
    }
    list.style.height = 'auto';
    var target = list.offsetHeight;
    list.style.height = held + 'px';

    below.forEach(function (line, i) {
      line.style.transformOrigin = 'top center';
      if (simple) {
        line.animate([{ transform: 'translateY(' + distance + 'px)' }, { transform: 'none' }], { duration: SIMPLE_SLIDE_MS, easing: 'cubic-bezier(0.45, 0, 0.55, 1)' });
        return;
      }
      line.animate(
        [
          { transform: 'translateY(' + distance + 'px) scale(1, 1)' },
          { transform: 'translateY(' + distance * 0.3 + 'px) scale(1.02, 0.9)', offset: 0.45 },
          { transform: 'translateY(-5px) scale(1.01, 0.94)', offset: 0.7 },
          { transform: 'translateY(1px) scale(1, 1.01)', offset: 0.87 },
          { transform: 'translateY(0) scale(1, 1)' },
        ],
        { duration: TRAFFIC.moveMs, delay: i * TRAFFIC.staggerMs, easing: TRAFFIC.easing, fill: 'backwards' },
      );
    });

    if (allDone) {
      // "All done for today!" eases down into place, then its tick pops in.
      allDone.animate([{ opacity: 0, transform: 'translateY(-25px)' }, { opacity: 1, transform: 'none' }], { duration: 600, delay: 150, easing: 'ease-out', fill: 'backwards' });
      allDone.querySelector('.tick').animate([{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 450, delay: 350, easing: 'ease-out', fill: 'backwards' });
    }
    var growMs = target > held ? (allDone ? CELEBRATE_GROW_MS : GROW_MS) : GROW_MS;
    var run = ++sizeRun;
    later(function () {
      if (!list.isConnected || run !== sizeRun) return;
      list.style.transitionDuration = growMs + 'ms';
      list.classList.add('sizing');
      list.style.height = target + 'px';
      later(function () {
        if (run !== sizeRun) return;
        list.classList.remove('sizing');
        list.style.height = '';
        list.style.transitionDuration = '';
      }, growMs + 50);
    }, target > held ? 0 : Math.max(0, moveMs - 250));

    refreshLines();
    animateProgress(data.tasks.length - left, data.tasks.length, moveMs);
    renderCompleted();
    updateHint();
    showNote((entry.ate ? ATE[entry.ate] : task.title + ' logged') + ' · ' + data.owner.name + ' can see it');
  }

  /** Saves the log for the owner. If it doesn't go through, the task comes back once things have settled. */
  function save(task, entry) {
    sending++;
    var body = { t: token, taskId: task.id, day: data.day, at: entry.at };
    if (entry.ate) body.ate = entry.ate;
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return {};
          })
          .then(function (reply) {
            return { res: res, reply: reply };
          });
      })
      .then(
        function (r) {
          sending--;
          if (r.res.status === 410 || r.reply.problem === 'notFound') return showProblem(r.reply.problem);
          if (!r.res.ok) return putBack(task);
          if (r.reply.logged) task.logged = r.reply.logged;
        },
        function () {
          sending--;
          putBack(task);
        },
      );
  }
  function putBack(task) {
    if (!data) return;
    var wait = leaving[task.id] ? POP.ms + 50 : busyUntil - Date.now() + 50;
    if (wait > 0) return later(function () {
      putBack(task);
    }, wait);
    task.logged = null;
    renderTasks();
    toast('Couldn’t log ' + task.title + '. Check your connection and try again.');
  }

  // ---------------------------------------------------------------------------
  // Sheets: how much a meal was eaten, and Emergency mode
  // ---------------------------------------------------------------------------

  function openSheet(id) {
    closeSheets();
    var sheet = $(id);
    if (!sheet) return;
    sheet.classList.add('open');
    document.querySelector('.sheet-bg').classList.add('open');
    var first = sheet.querySelector('a, button');
    if (first) first.focus();
  }
  function closeSheets() {
    document.querySelectorAll('.sheet.open, .sheet-bg.open').forEach(function (n) {
      n.classList.remove('open');
    });
  }

  var askingFor = null;
  /** "Log Breakfast": Ate it all (Sage), Ate some (Golden Oat), Didn't eat (Clay), as in the app. */
  function askAte(task) {
    askingFor = task;
    $('ate-title').textContent = 'Log ' + task.title;
    openSheet('ate-sheet');
  }

  function callButton(cls, label, phone, note) {
    if (!phone) return '';
    return '<a class="btn ' + cls + ' block" href="tel:' + digits(phone) + '">' + esc(label) + '</a>' + (note ? '<p class="muted note-under">' + esc(note) + '</p>' : '');
  }

  function renderSheets() {
    document.querySelectorAll('.sheet, .sheet-bg').forEach(function (n) {
      n.remove();
    });
    var d = data;
    var e = d.emergency;
    var dog = d.dog;
    var calls = '';
    if (e.erVet) calls += callButton('emergency', 'Call ' + e.erVet.name, e.erVet.phone, e.erVet.open24h ? 'Emergency vet · open 24 hours' : 'Emergency vet');
    if (e.vet) calls += callButton(e.erVet ? 'outline' : 'emergency', 'Call ' + dog.name + '’s vet' + (e.vet.name ? ' · ' + e.vet.name : ''), e.vet.phone, [e.vet.hours, e.vet.address].filter(Boolean).join(' · '));
    calls += callButton('outline', 'Call ' + d.owner.name, d.owner.phone);
    e.contacts.forEach(function (c) {
      calls += callButton('outline', 'Call ' + c.name + (c.relation ? ' (' + c.relation + ')' : ''), c.phone);
    });
    calls += callButton('outline', POISON_LINE.name, POISON_LINE.phone, 'If ' + dog.name + ' ate something poisonous (a fee may apply)');

    var facts = [];
    if (dog.breed) facts.push(['Breed', dog.breed + (dog.ageYears != null ? ', ' + years(dog.ageYears) : '')]);
    if (d.avoid.length) facts.push(['Never give', d.avoid.join(', ')]);
    (d.medical || []).forEach(function (m) {
      facts.push([m.label, m.value]);
    });
    if (d.medical && dog.microchip) facts.push(['Microchip', dog.microchip]);

    var wrap = document.createElement('div');
    wrap.innerHTML =
      '<div class="sheet-bg" data-close></div>' +
      '<div class="sheet" id="em-sheet" role="dialog" aria-modal="true" aria-labelledby="em-title">' +
      '<h1 id="em-title">Emergency mode</h1>' +
      '<p class="muted" style="margin-top:4px">Stay calm. Call first, then tell the vet about ' + esc(dog.name) + ' from the card below.</p>' +
      '<div class="stack">' + calls + '</div>' +
      (facts.length
        ? '<h2 style="margin-top:20px">About ' + esc(dog.name) + '</h2><ul class="facts">' +
          facts.map(function (f) {
            return '<li><b>' + esc(f[0]) + '</b>' + esc(f[1]) + '</li>';
          }).join('') +
          '</ul>'
        : '') +
      '<button class="outline block" style="margin-top:16px" data-close>Close</button>' +
      '</div>' +
      '<div class="sheet" id="ate-sheet" role="dialog" aria-modal="true" aria-labelledby="ate-title">' +
      '<h2 id="ate-title">Log meal</h2>' +
      '<div class="ate-choices" role="group" aria-label="How much did ' + esc(dog.name) + ' eat?">' +
      '<button class="ate-choice all" data-ate="all">' + icon('check', 20) + ATE.all + '</button>' +
      '<button class="ate-choice some" data-ate="some">' + ATE.some + '</button>' +
      '<button class="ate-choice none" data-ate="none">' + icon('warning', 20) + ATE.none + '</button>' +
      '</div></div>';
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
  }

  document.addEventListener('click', function (e) {
    var log = e.target.closest('[data-log]');
    var ate = e.target.closest('[data-ate]');
    if (log && data) {
      var task = taskById(log.getAttribute('data-log'));
      if (task) logIt(task);
    } else if (ate && askingFor) {
      var meal = askingFor;
      askingFor = null;
      closeSheets();
      pop(meal, ate.getAttribute('data-ate'));
    } else if (e.target.closest('#completed-toggle')) {
      showCompleted = !showCompleted;
      renderCompleted();
    } else if (e.target.closest('[data-emergency]')) {
      if (data) openSheet('em-sheet');
    } else if (e.target.closest('[data-close]')) {
      askingFor = null;
      closeSheets();
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      askingFor = null;
      closeSheets();
    }
  });

  document.addEventListener('DOMContentLoaded', function () {
    load();
    // The pack's own logs show up without reloading, Overdue keeps up with the clock, and the page notices when the link ends.
    setInterval(function () {
      if (!data || document.hidden) return;
      if (busy()) return refreshLines();
      load(true);
    }, 60000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && data && !busy()) load(true);
    });
  });
})();
