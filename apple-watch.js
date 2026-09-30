// Apple Watch Mode — squeezes the whole page onto a tiny wrist-sized screen.
// Real Apple Watch browsers have no keyboard, so every game here (Snake,
// Pong, Breakout, Tetris, Invaders, Pac-Man, Tennis) would otherwise be
// unplayable — they all listen for arrow keys + Space on `window`. This
// adds a touch D-pad that dispatches those same key events, so the games
// underneath don't know the difference.
(function () {
  var STORAGE_KEY = 'retro-arcade-watch-mode';

  function dispatchKey(type, key, repeat) {
    var evt;
    try {
      evt = new KeyboardEvent(type, { key: key, bubbles: true, cancelable: true, repeat: !!repeat });
    } catch (e) {
      evt = document.createEvent('Event');
      evt.initEvent(type, true, true);
      evt.key = key;
      evt.repeat = !!repeat;
    }
    window.dispatchEvent(evt);
  }

  function wireButton(btn) {
    var key = btn.getAttribute('data-key');
    var delayId = null;
    var intervalId = null;

    function stopTimers() {
      clearTimeout(delayId);
      clearInterval(intervalId);
      delayId = null;
      intervalId = null;
    }

    function start(e) {
      e.preventDefault();
      if (delayId || intervalId) return;
      dispatchKey('keydown', key, false);
      delayId = setTimeout(function () {
        intervalId = setInterval(function () { dispatchKey('keydown', key, true); }, 90);
      }, 350);
    }

    function stop(e) {
      if (e) e.preventDefault();
      if (!delayId && !intervalId) return;
      stopTimers();
      dispatchKey('keyup', key, false);
    }

    btn.addEventListener('pointerdown', start);
    btn.addEventListener('pointerup', stop);
    btn.addEventListener('pointercancel', stop);
    btn.addEventListener('pointerleave', stop);
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  }

  function init() {
    var content = document.createElement('div');
    content.id = 'watch-content';
    while (document.body.firstChild) {
      content.appendChild(document.body.firstChild);
    }
    document.body.appendChild(content);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'watch-toggle-btn';
    document.body.appendChild(btn);

    var crown = document.createElement('div');
    crown.className = 'watch-crown';
    document.body.appendChild(crown);

    var sideBtn = document.createElement('div');
    sideBtn.className = 'watch-side-btn';
    document.body.appendChild(sideBtn);

    var controls = document.createElement('div');
    controls.className = 'watch-controls';
    controls.innerHTML =
      '<div class="watch-dpad">' +
        '<button type="button" class="watch-btn wd-up" data-key="ArrowUp">▲</button>' +
        '<button type="button" class="watch-btn wd-left" data-key="ArrowLeft">◀</button>' +
        '<button type="button" class="watch-btn wd-right" data-key="ArrowRight">▶</button>' +
        '<button type="button" class="watch-btn wd-down" data-key="ArrowDown">▼</button>' +
      '</div>' +
      '<div class="watch-side-controls">' +
        '<button type="button" class="watch-btn watch-action" data-key=" ">●</button>' +
        '<button type="button" class="watch-btn watch-reset" data-key="r">R</button>' +
      '</div>';
    document.body.appendChild(controls);
    var buttons = controls.querySelectorAll('[data-key]');
    for (var i = 0; i < buttons.length; i++) wireButton(buttons[i]);

    function label(on) {
      return on ? '⌘ EXIT APPLE WATCH MODE' : '⌘ APPLE WATCH MODE';
    }

    // Measure the page at its real, normal-mode size (no watch transform
    // applied) so the watch frame is exactly that size, just scaled down —
    // nothing gets force-fit, cropped, or squashed into an arbitrary box.
    function measure() {
      document.documentElement.classList.remove('watch-mode');
      var rect = content.getBoundingClientRect();
      var w = Math.max(1, Math.round(rect.width));
      var h = Math.max(1, Math.round(rect.height));
      var scale = Math.min(190 / w, 230 / h, 0.6);
      scale = Math.max(scale, 0.06);
      var root = document.documentElement.style;
      root.setProperty('--watch-w', w + 'px');
      root.setProperty('--watch-h', h + 'px');
      root.setProperty('--watch-scale', scale.toFixed(4));
    }

    function setMode(on) {
      if (on) measure();
      document.documentElement.classList.toggle('watch-mode', on);
      btn.textContent = label(on);
      try { localStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch (e) {}
    }

    btn.addEventListener('click', function () {
      setMode(!document.documentElement.classList.contains('watch-mode'));
    });

    var resizeTimer = null;
    window.addEventListener('resize', function () {
      if (!document.documentElement.classList.contains('watch-mode')) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () { setMode(true); }, 120);
    });

    var saved = false;
    try { saved = localStorage.getItem(STORAGE_KEY) === '1'; } catch (e) {}
    setMode(saved);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
