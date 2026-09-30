// Apple Watch Mode — squeezes the whole page onto a tiny wrist-sized screen.
// Purely cosmetic: shrinks the page into a watch-shaped frame with CSS.
// Games still run underneath at full resolution, just tiny and cramped —
// exactly the "Apple Watch experience" you asked for.
(function () {
  var STORAGE_KEY = 'retro-arcade-watch-mode';

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

    function label(on) {
      return on ? '⌘ EXIT APPLE WATCH MODE' : '⌘ APPLE WATCH MODE';
    }

    function setMode(on) {
      document.documentElement.classList.toggle('watch-mode', on);
      btn.textContent = label(on);
      try { localStorage.setItem(STORAGE_KEY, on ? '1' : '0'); } catch (e) {}
    }

    btn.addEventListener('click', function () {
      setMode(!document.documentElement.classList.contains('watch-mode'));
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
