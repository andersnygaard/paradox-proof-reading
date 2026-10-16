// player.js: the chapter player, and the listening progress on the overview. Plain script, no build step.
// An <audio> element plays the chapter; the Media Session API gives Android (and iOS) the chapter title,
// the cover and play, pause and skip buttons in the notification and on the lock screen, and playback
// carries on with the screen off or another app in front. Positions are remembered per chapter in this
// browser, and at the end of a chapter the next narrated one starts on its own.
(function () {
  'use strict';
  var PREFIX = 'paradox-book:';
  function load(k, d) { try { var v = localStorage.getItem(PREFIX + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } }
  function save(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) {} }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function clock(s) { s = Math.max(0, Math.floor(s || 0)); var h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); return (h ? h + ':' + pad(m) : m) + ':' + pad(s % 60); }
  function $(id) { return document.getElementById(id); }

  var dataEl = $('page-data');
  if (!dataEl) return;
  var page = JSON.parse(dataEl.textContent);
  if (page.kind === 'index') return overview();

  var audio = $('audio');
  if (!audio) return;
  var ui = { box: $('player'), play: $('play'), back: $('back'), fwd: $('fwd'), rate: $('rate'), seek: $('seek'), cur: $('cur'), dur: $('dur'), now: $('now') };
  audio.removeAttribute('controls');
  ui.box.classList.add('ready');

  var ms = 'mediaSession' in navigator ? navigator.mediaSession : null;
  var RATES = [1, 1.25, 1.5, 1.75, 2, 0.75];
  var rate = load('rate', 1);
  var restored = false, fromStart = false, dragging = false, lastSave = 0;

  function duration() { return isFinite(audio.duration) && audio.duration > 0 ? audio.duration : page.seconds; }

  function applyRate() {
    audio.defaultPlaybackRate = rate;
    audio.playbackRate = rate;
    ui.rate.textContent = String(rate).replace(/^0\./, '.') + '×';
  }

  function render() {
    var d = duration();
    if (!dragging) { ui.seek.max = Math.floor(d); ui.seek.value = Math.floor(audio.currentTime); ui.cur.textContent = clock(audio.currentTime); }
    ui.dur.textContent = clock(d);
  }

  function positionState() {
    if (!ms || !ms.setPositionState || !isFinite(audio.duration)) return;
    try { ms.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate, position: Math.min(audio.currentTime, audio.duration) }); } catch (e) {}
  }

  function metadata() {
    if (!ms || typeof MediaMetadata === 'undefined') return;
    var art = function (f, size) { return { src: new URL(f, location.href).href, sizes: size, type: 'image/png' }; };
    ms.metadata = new MediaMetadata({ title: page.label, artist: page.book.author, album: page.book.title, artwork: [art('cover-512.png', '512x512'), art('cover-192.png', '192x192')] });
  }

  function persist(force) {
    var now = Date.now();
    if (!restored || (!force && now - lastSave < 4000)) return;
    lastSave = now;
    save('pos:' + page.id, { t: audio.currentTime, d: duration(), at: now });
    save('last', { id: page.id, href: page.href, label: page.label, t: audio.currentTime, at: now });
  }

  // Back to where this chapter was left, unless it was finished or the player moved on to it by itself.
  function restore() {
    if (restored || !isFinite(audio.duration)) return;
    restored = true;
    var p = load('pos:' + page.id, null);
    if (!fromStart && p && !p.done && p.t > 3 && p.t < audio.duration - 3) audio.currentTime = p.t;
    fromStart = false;
    render(); positionState();
  }

  function skip(s) {
    audio.currentTime = Math.max(0, Math.min(duration() - 0.5, audio.currentTime + s));
    render(); positionState(); persist(true);
  }

  function sync() {
    var playing = !audio.paused;
    ui.play.classList.toggle('playing', playing);
    ui.play.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    if (ms) ms.playbackState = playing ? 'playing' : 'paused';
  }

  function nextNarrated() {
    var list = page.list, i = 0;
    while (i < list.length && list[i].id !== page.id) i++;
    for (i++; i < list.length; i++) if (list[i].audio) return list[i];
    return null;
  }

  // Start the next chapter at once, so playback carries on with the screen off; then bring in its text.
  function continueWith(entry) {
    var list = page.list, book = page.book;
    page = { kind: 'page', id: entry.id, href: entry.href, label: entry.label, audio: entry.audio, seconds: entry.seconds, list: list, book: book };
    restored = false; fromStart = true;
    audio.src = entry.audio;
    applyRate();
    audio.play().catch(function () {});
    metadata();
    ui.now.textContent = entry.label;
    save('last', { id: entry.id, href: entry.href, label: entry.label, t: 0, at: Date.now() });
    fetch(entry.href).then(function (r) { return r.ok ? r.text() : Promise.reject(r.status); }).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      ['content', 'pager'].forEach(function (id) { var a = $(id), b = doc.getElementById(id); if (a && b) a.replaceWith(document.importNode(b, true)); });
      document.title = doc.title;
      history.replaceState(null, '', entry.href);
      window.scrollTo(0, 0);
    }).catch(function () {});
  }

  ui.play.addEventListener('click', function () { if (audio.paused) audio.play().catch(function () {}); else audio.pause(); });
  ui.back.addEventListener('click', function () { skip(-15); });
  ui.fwd.addEventListener('click', function () { skip(30); });
  ui.rate.addEventListener('click', function () {
    rate = RATES[(RATES.indexOf(rate) + 1) % RATES.length] || 1;
    save('rate', rate); applyRate(); positionState();
  });
  ui.seek.addEventListener('input', function () { dragging = true; ui.cur.textContent = clock(+ui.seek.value); });
  ui.seek.addEventListener('change', function () { audio.currentTime = +ui.seek.value; dragging = false; render(); positionState(); persist(true); });

  audio.addEventListener('loadedmetadata', restore);
  audio.addEventListener('durationchange', render);
  audio.addEventListener('timeupdate', function () { render(); persist(false); });
  audio.addEventListener('play', function () { sync(); positionState(); });
  audio.addEventListener('pause', function () { sync(); persist(true); });
  audio.addEventListener('ratechange', positionState);
  audio.addEventListener('seeked', positionState);
  audio.addEventListener('ended', function () {
    save('pos:' + page.id, { t: 0, d: duration(), done: true, at: Date.now() });
    var next = nextNarrated();
    if (next) continueWith(next); else sync();
  });
  document.addEventListener('visibilitychange', function () { if (document.hidden) persist(true); });
  window.addEventListener('pagehide', function () { persist(true); });

  if (ms) {
    var handlers = {
      play: function () { audio.play().catch(function () {}); },
      pause: function () { audio.pause(); },
      stop: function () { audio.pause(); },
      seekbackward: function (d) { skip(-((d && d.seekOffset) || 15)); },
      seekforward: function (d) { skip((d && d.seekOffset) || 30); },
      seekto: function (d) {
        if (d.fastSeek && 'fastSeek' in audio) audio.fastSeek(d.seekTime); else audio.currentTime = d.seekTime;
        render(); positionState(); persist(true);
      }
    };
    Object.keys(handlers).forEach(function (k) { try { ms.setActionHandler(k, handlers[k]); } catch (e) {} });
  }

  applyRate();
  metadata();
  render();
  if (audio.readyState >= 1) restore();

  // ---------------------------------------------------------------- overview
  function overview() {
    var last = load('last', null), box = $('continue');
    if (last && box && last.href) {
      var a = document.createElement('a');
      a.href = last.href;
      a.textContent = last.label;
      box.textContent = 'Continue listening: ';
      box.appendChild(a);
      if (last.t > 3) box.appendChild(document.createTextNode(', at ' + clock(last.t)));
      box.hidden = false;
    }
    var items = document.querySelectorAll('[data-id]');
    for (var i = 0; i < items.length; i++) {
      var li = items[i], p = load('pos:' + li.getAttribute('data-id'), null), s = li.querySelector('.state');
      if (!p || !s) continue;
      if (p.done) { s.textContent = 'Heard'; li.classList.add('done'); }
      else if (p.t > 3) { s.textContent = clock(p.t) + ' of ' + clock(p.d); li.classList.add('started'); }
    }
  }
})();
