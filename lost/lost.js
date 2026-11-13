/*
 * The lost dog page (Phase 7). A lost pet flyer's QR code opens
 *   https://7cyh2hgymf-cyber.github.io/dogardi-web/lost/?t=<token>
 * for anyone, with no app or account. It shows what's on the flyer (from the
 * `lost` Edge Function, supabase/functions/lost) and "I saw {dog}", which
 * sends the owner's pack where the person is right now and a short note.
 * Once the dog is marked found, it only says they're home safe.
 */
(function () {
  var API = 'https://koljfhzxgcqcfwremdmq.supabase.co/functions/v1/lost';
  var token = new URLSearchParams(location.search).get('t') || '';
  var dog = null;

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
  function show(html, banner) {
    var page = $('page');
    page.removeAttribute('aria-busy');
    page.innerHTML = html;
    $('banner').textContent = banner;
    $('banner').className = 'banner' + (banner === 'LOST DOG' ? '' : ' calm');
  }

  function load() {
    if (!token) return problem('This link doesn’t work', 'Check you scanned the whole code on the flyer.');
    fetch(API + '?t=' + encodeURIComponent(token), { cache: 'no-store' })
      .then(function (res) {
        return res.json().then(function (body) {
          if (res.status === 404) return problem('This link doesn’t work', 'Check you scanned the whole code on the flyer.');
          if (!res.ok) return problem('Something went wrong', 'Try again in a minute, or call the number on the flyer.');
          if (body.found) return found(body.name);
          dog = body;
          render();
        });
      })
      .catch(function () {
        problem('Can’t load the page', 'Check your connection, or call the number on the flyer.');
      });
  }

  function problem(title, text) {
    document.title = 'Lost dog · Dogardi';
    show('<section class="found"><h1>' + esc(title) + '</h1><p class="muted">' + esc(text) + '</p></section>', 'DOGARDI');
  }

  function found(name) {
    document.title = name + ' is home · Dogardi';
    show('<section class="found"><h1>' + esc(name) + ' is home safe</h1><p class="muted">Thank you for looking out.</p></section>', 'FOUND');
  }

  function render() {
    var d = dog;
    var them = d.pronoun === 'she' ? 'her' : 'him';
    var caller = d.callName || 'the owner';
    document.title = 'Lost dog: ' + d.name + ' · Dogardi';
    var tags = (d.microchipped ? '<span class="tag sage">Microchipped</span>' : '') + (d.reward ? '<span class="tag oat">' + esc(d.reward) + '</span>' : '');
    show(
      (d.photoUrl ? '<img class="photo" src="' + esc(d.photoUrl) + '" alt="' + esc(d.name) + '">' : '') +
        '<h1>' + esc(d.name) + '</h1>' +
        (d.details ? '<p class="details">' + esc(d.details) + '</p>' : '') +
        (d.lastSeen || d.when || tags || d.note
          ? '<section class="card">' +
            (d.lastSeen || d.when ? '<p class="label">Last seen</p>' : '') +
            (d.lastSeen ? '<p class="strong">' + esc(d.lastSeen) + '</p>' : '') +
            (d.when ? '<p class="muted">' + esc(d.when) + '</p>' : '') +
            (tags ? '<div class="tags">' + tags + '</div>' : '') +
            (d.note ? '<p class="note">' + esc(d.note) + '</p>' : '') +
            '</section>'
          : '') +
        '<section class="card" id="seen-card">' +
        '<label class="label" for="seen-note">Seen ' + them + '?</label>' +
        '<textarea id="seen-note" maxlength="300" rows="2" placeholder="Where, and which way ' + (d.pronoun === 'she' ? 'she' : 'he') + ' went (optional)"></textarea>' +
        '<button class="seen" type="button" id="seen">I saw ' + esc(d.name) + '</button>' +
        '<p class="muted center small" id="seen-help">Sends ' + esc(caller === 'the owner' ? 'the owner' : titleCase(caller)) + ' where you are right now, so they can come. Your location is only shared when you tap.</p>' +
        '</section>' +
        (d.phone ? '<a class="call" href="tel:' + digits(d.phone) + '">Call ' + esc(caller === 'the owner' ? 'the owner' : titleCase(caller)) + ' · ' + esc(d.phone) + '</a>' : '') +
        (d.phone2 ? '<a class="call" href="tel:' + digits(d.phone2) + '">Or call ' + esc(d.phone2) + '</a>' : ''),
      'LOST DOG',
    );
    $('seen').addEventListener('click', seen);
  }

  /** The flyer says "CALL JADEN"; the page says "Jaden". */
  function titleCase(name) {
    return name.charAt(0) + name.slice(1).toLowerCase();
  }

  function seen() {
    var button = $('seen');
    var note = $('seen-note').value.trim();
    button.disabled = true;
    button.textContent = 'Finding where you are…';
    var send = function (spot) {
      button.textContent = 'Sending…';
      var body = { t: token, note: note };
      if (spot) {
        body.latitude = spot.latitude;
        body.longitude = spot.longitude;
        body.accuracy = spot.accuracy;
      }
      fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        .then(function (res) {
          return res.json().then(function (reply) {
            if (reply.problem === 'found') return found(dog.name);
            if (res.status === 429) return failed('Lots of people have sent sightings in the last hour. Please call instead.');
            if (!res.ok) return failed('That didn’t send. Please call instead.');
            sent(spot);
          });
        })
        .catch(function () {
          failed('That didn’t send. Check your connection, or call instead.');
        });
    };
    if (!navigator.geolocation) return note ? send(null) : failed('We couldn’t get your location. Write where you saw ' + dog.name + ' above, then tap again, or call.');
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        send({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy });
      },
      function () {
        if (note) return send(null);
        failed('We couldn’t get your location. Write where you saw ' + dog.name + ' above, then tap again, or call.');
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
    );
  }

  function failed(text) {
    var button = $('seen');
    button.disabled = false;
    button.textContent = 'I saw ' + dog.name;
    $('seen-help').textContent = text;
    $('seen-help').className = 'problem center small';
  }

  function sent(spot) {
    var caller = dog.callName ? titleCase(dog.callName) : 'The owner';
    $('seen-card').innerHTML =
      '<div class="sent" role="status"><p class="strong">Thank you! ' + esc(caller) + ' has been told.</p>' +
      '<p class="muted">' + (spot ? 'They can see where you were on a map.' : 'They’ll see your note.') + ' If ' + esc(dog.name) + ' is still with you or close by, please call too.</p></div>';
  }

  document.addEventListener('DOMContentLoaded', load);
})();
