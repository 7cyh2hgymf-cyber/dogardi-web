/*
 * The sitter link page (Phase 6). The owner shares
 *   https://7cyh2hgymf-cyber.github.io/dogardi-web/s/?t=<token>
 * and the sitter opens it in any browser, with no app or account. Everything
 * on it comes from the `sitter` Edge Function (supabase/functions/sitter),
 * which checks the token on every visit and sends only what the owner chose:
 * today's routine (with Log it), house notes, medical info, and emergency
 * info (always). Expired, stopped and unknown links show nothing about the dog.
 */
(function () {
  var API = 'https://koljfhzxgcqcfwremdmq.supabase.co/functions/v1/sitter';
  var POISON_LINE = { name: 'Pet Poison Helpline', phone: '1-855-764-7661' };
  var DAY_START_HOUR = 5;
  var token = new URLSearchParams(location.search).get('t') || '';
  var data = null;

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
  // Loading
  // ---------------------------------------------------------------------------

  function load(quiet) {
    if (!token) return showProblem('notFound');
    return fetch(API + '?t=' + encodeURIComponent(token) + '&day=' + planDay(), { cache: 'no-store' })
      .then(function (res) {
        return res.json().then(function (body) {
          if (!res.ok) return showProblem(body.problem || 'server');
          data = body;
          render();
        });
      })
      .catch(function () {
        if (!quiet) showProblem('offline');
      });
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
    $('shared-by').textContent = 'Dogardi · no app needed';
    $('expires').textContent = problem === 'expired' ? 'Expired' : '';
    $('footer').hidden = true;
    closeEmergency();
    document.querySelectorAll('.sheet, .sheet-bg').forEach(function (n) {
      n.remove();
    });
    var page = $('page');
    page.removeAttribute('aria-busy');
    page.className = 'expired';
    page.innerHTML =
      '<div class="clock" aria-hidden="true"><svg width="56" height="56" viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><circle cx="128" cy="128" r="96"/><polyline points="128 72 128 128 184 128"/></svg></div>' +
      '<h1>' + esc(text[0]) + '</h1>' +
      '<p class="muted">' + esc(text[1]) + '</p>' +
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

  var PAW =
    '<svg width="34" height="34" viewBox="0 0 256 256" fill="none" stroke="currentColor" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"><circle cx="212" cy="108" r="20"/><circle cx="44" cy="108" r="20"/><circle cx="92" cy="60" r="20"/><circle cx="164" cy="60" r="20"/><path d="M187.9,161.1a36.6,36.6,0,0,1-15.4-20.4,46,46,0,0,0-89,0,36.6,36.6,0,0,1-15.4,20.4A36,36,0,0,0,96,224a35.6,35.6,0,0,0,14.1-2.9,45.8,45.8,0,0,1,35.8,0A35.6,35.6,0,0,0,160,224a36,36,0,0,0,27.9-62.9Z"/></svg>';
  var ATE = { all: 'Ate it all', some: 'Ate some', none: 'Didn’t eat' };

  function taskRow(t) {
    var what =
      '<span class="what"><span class="title">' + esc(t.title) + (t.important ? ' <span class="badge">Meds</span>' : '') + '</span>' +
      (t.subtitle ? '<span class="sub">' + esc(t.subtitle) + '</span>' : '') +
      (t.detail && t.detail !== 'Anyone' ? '<span class="sub">' + esc(t.detail) + '</span>' : '') +
      '</span>';
    var end = '';
    if (t.logged) {
      end = '<span class="done-tag">✓ ' + esc(t.logged.at) + (t.logged.ate ? ' · ' + esc(ATE[t.logged.ate] || '') : '') + '<span class="by">' + esc(t.logged.by) + '</span></span>';
    } else if (t.canLog) {
      end = '<button class="' + (t.important ? 'primary' : 'outline') + ' small" data-log="' + esc(t.id) + '" aria-label="Log it: ' + esc(t.title) + '">Log it</button>';
    }
    return '<div class="row" data-task="' + esc(t.id) + '"><span class="time">' + esc(t.time) + '</span>' + what + end + '</div>';
  }

  function render() {
    var d = data;
    var dog = d.dog;
    var owner = d.owner;
    document.title = 'Looking after ' + dog.name + ' · Dogardi';
    $('shared-by').textContent = 'Shared by ' + owner.name + ' · no app needed';
    $('expires').textContent = untilText(d.expiresAt);

    var about = [dog.breed, dog.ageYears != null ? years(dog.ageYears) : ''].filter(Boolean);
    var html =
      '<section class="hello">' +
      (dog.photoUrl ? '<img class="photo" src="' + esc(dog.photoUrl) + '" alt="' + esc(dog.name) + '">' : '<div class="paw" aria-hidden="true">' + PAW + '</div>') +
      '<div><h1>Hi' + (d.sitterName ? ' ' + esc(d.sitterName) : '') + '!</h1>' +
      '<p class="muted" style="margin:2px 0 0">You’re looking after ' + esc(dog.name) + (about.length ? ' · ' + esc(about.join(' · ')) : '') + '</p></div>' +
      '</section>';

    if (d.permissions.routine) {
      html += '<p class="label">Today’s routine</p>';
      html += d.tasks.length
        ? '<section class="card flush" aria-label="Today’s routine">' + d.tasks.map(taskRow).join('') + '</section>'
        : '<section class="card"><p class="muted" style="margin:0">Nothing planned for ' + esc(dog.name) + ' today.</p></section>';
      if (d.tasks.some(function (t) { return t.canLog; })) {
        html += '<p class="muted small-print">Tap Log it when it’s done. ' + esc(owner.name) + ' sees it straight away.</p>';
      }
    }

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

    html +=
      '<section class="card"><h2>If something’s wrong</h2>' +
      '<p class="muted" style="margin:6px 0 0">Who to call, and what to tell the vet about ' + esc(dog.name) + '.</p>' +
      '<button class="emergency block" style="margin-top:14px" data-emergency>Emergency mode</button></section>';

    var page = $('page');
    page.className = '';
    page.removeAttribute('aria-busy');
    page.innerHTML = html;

    var call = $('call-owner');
    call.hidden = !owner.phone;
    if (owner.phone) {
      call.textContent = 'Call ' + owner.name;
      call.href = 'tel:' + digits(owner.phone);
    }
    $('footer').hidden = false;
    renderEmergency();
  }

  // ---------------------------------------------------------------------------
  // Log it
  // ---------------------------------------------------------------------------

  function taskById(id) {
    for (var i = 0; i < data.tasks.length; i++) if (data.tasks[i].id === id) return data.tasks[i];
    return null;
  }

  /** Meals, when the owner tracks appetite: how much did they eat? (as in the app). */
  function askAte(btn, task) {
    var row = btn.parentNode;
    var choices = document.createElement('div');
    choices.className = 'ate';
    choices.setAttribute('role', 'group');
    choices.setAttribute('aria-label', 'How much did ' + data.dog.name + ' eat?');
    choices.innerHTML = Object.keys(ATE).map(function (k) {
      return '<button class="outline small" data-ate="' + k + '">' + ATE[k] + '</button>';
    }).join('');
    row.classList.add('asking');
    row.appendChild(choices);
    btn.remove();
    choices.querySelector('button').focus();
    choices.addEventListener('click', function (e) {
      var pick = e.target.closest('[data-ate]');
      if (pick) sendLog(task, pick.getAttribute('data-ate'));
    });
  }

  function sendLog(task, ate) {
    var row = document.querySelector('[data-task="' + CSS.escape(task.id) + '"]');
    if (row)
      row.querySelectorAll('button').forEach(function (b) {
        b.disabled = true;
      });
    var body = { t: token, taskId: task.id, day: data.day, at: clock(new Date()) };
    if (ate) body.ate = ate;
    fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      .then(function (res) {
        return res.json().then(function (reply) {
          if (res.status === 410 || reply.problem === 'notFound') return showProblem(reply.problem);
          if (!res.ok) throw new Error(reply.problem);
          task.logged = reply.logged;
          render();
          toast(task.title + ' logged · ' + data.owner.name + ' can see it');
        });
      })
      .catch(function () {
        if (!data) return;
        render();
        toast('Couldn’t log that. Check your connection and try again.');
      });
  }

  // ---------------------------------------------------------------------------
  // Emergency mode (always there, whatever else the owner chose)
  // ---------------------------------------------------------------------------

  function callButton(cls, label, phone, note) {
    if (!phone) return '';
    return '<a class="btn ' + cls + ' block" href="tel:' + digits(phone) + '">' + esc(label) + '</a>' + (note ? '<p class="muted note">' + esc(note) + '</p>' : '');
  }

  function renderEmergency() {
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
      '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="em-title">' +
      '<h1 id="em-title">Emergency mode</h1>' +
      '<p class="muted">Stay calm. Call first, then tell the vet about ' + esc(dog.name) + ' from the card below.</p>' +
      '<div class="stack">' + calls + '</div>' +
      (facts.length
        ? '<h2 style="margin-top:20px">About ' + esc(dog.name) + '</h2><ul class="facts">' +
          facts.map(function (f) {
            return '<li><b>' + esc(f[0]) + '</b>' + esc(f[1]) + '</li>';
          }).join('') +
          '</ul>'
        : '') +
      '<button class="outline block" style="margin-top:16px" data-close>Close</button>' +
      '</div>';
    while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
  }

  function openEmergency() {
    if (!data) return;
    document.body.classList.add('open');
    var first = document.querySelector('.sheet a, .sheet button');
    if (first) first.focus();
  }
  function closeEmergency() {
    document.body.classList.remove('open');
  }

  document.addEventListener('click', function (e) {
    var log = e.target.closest('[data-log]');
    if (log && data) {
      var task = taskById(log.getAttribute('data-log'));
      if (task && task.kind === 'meal' && data.trackAppetite) askAte(log, task);
      else if (task) sendLog(task);
    } else if (e.target.closest('[data-emergency]')) openEmergency();
    else if (e.target.closest('[data-close]')) closeEmergency();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closeEmergency();
  });

  document.addEventListener('DOMContentLoaded', function () {
    load();
    // The pack's own logs show up without reloading, and the page notices when the link ends.
    setInterval(function () {
      if (data && !document.hidden && !document.querySelector('.asking') && !document.body.classList.contains('open')) load(true);
    }, 60000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && data) load(true);
    });
  });
})();
