/**
 * CutterDuper — Overlay / Slide / Transition Renderer
 * =====================================================
 * Fade durations are configurable per segment.
 * Min: 300ms, Max: 3000ms
 */
var CD = window.CD || {};

CD.Overlay = (function() {

  var overlayEl = null;
  var isShowingSlide = false;
  var slideTimer = null;
  var fadeTimer = null;

  var FADE_MIN_MS = 300;
  var FADE_MAX_MS = 3000;
  var FADE_DEFAULT_MS = 800;

  function init() {
    var playerWrapper = document.querySelector('.cd-player-wrapper');
    if (!playerWrapper) return;

    overlayEl = document.createElement('div');
    overlayEl.className = 'cd-overlay';
    overlayEl.id = 'cd-overlay';
    playerWrapper.appendChild(overlayEl);
  }

  function clampDuration(ms) {
    ms = Number(ms) || FADE_DEFAULT_MS;
    return Math.max(FADE_MIN_MS, Math.min(FADE_MAX_MS, ms));
  }

  /**
   * Fade OUT the video (overlay goes from transparent to opaque).
   * Call this at the END of a segment to "close" it.
   */
  function fadeOut(type, durationMs) {
    if (!overlayEl) return Promise.resolve();
    durationMs = clampDuration(durationMs);
    var color = type === 'fade_white' ? '#ffffff' : '#000000';
    overlayEl.innerHTML = '';
    overlayEl.style.backgroundColor = color;
    overlayEl.style.opacity = '0';
    overlayEl.classList.add('cd-overlay--visible');

    // Force reflow so the browser registers opacity:0 before transitioning
    overlayEl.offsetHeight;

    overlayEl.style.transition = 'opacity ' + durationMs + 'ms ease';
    overlayEl.style.opacity = '1';

    return new Promise(function(resolve) {
      fadeTimer = setTimeout(resolve, durationMs);
    });
  }

  /**
   * Fade IN the video (overlay goes from opaque to transparent).
   * Call this at the START of a segment to "open" it.
   * The overlay must already be visible+opaque (from a prior fadeOut).
   */
  function fadeIn(type, durationMs) {
    if (!overlayEl) return Promise.resolve();
    durationMs = clampDuration(durationMs);

    // If overlay isn't visible yet, make it visible+opaque first
    var color = type === 'fade_white' ? '#ffffff' : '#000000';
    overlayEl.innerHTML = '';
    overlayEl.style.backgroundColor = color;
    overlayEl.style.transition = 'none';
    overlayEl.style.opacity = '1';
    overlayEl.classList.add('cd-overlay--visible');

    // Force reflow
    overlayEl.offsetHeight;

    overlayEl.style.transition = 'opacity ' + durationMs + 'ms ease';
    overlayEl.style.opacity = '0';

    return new Promise(function(resolve) {
      fadeTimer = setTimeout(function() {
        overlayEl.classList.remove('cd-overlay--visible');
        overlayEl.style.transition = '';
        overlayEl.innerHTML = '';
        resolve();
      }, durationMs);
    });
  }

  /**
   * Show a slide segment.
   */
  function showSlide(segment) {
    if (!overlayEl) return Promise.resolve();

    var payload = {};
    try { payload = JSON.parse(segment.payload_json || '{}'); } catch(e) {}

    var segType = String(segment.type || 'slide_text');
    var durationMs = Number(segment.duration_ms) || 5000;

    isShowingSlide = true;

    var html = '';
    switch (segType) {
      case 'slide_text': html = buildSlideText(payload, segment); break;
      case 'slide_image': html = buildSlideImage(payload, segment); break;
      case 'slide_mixed': html = buildSlideMixed(payload, segment); break;
      default: html = buildSlideText(payload, segment);
    }

    overlayEl.innerHTML = html;
    overlayEl.style.backgroundColor = payload.bg_color || '#1a1d27';
    overlayEl.style.transition = 'none';
    overlayEl.style.opacity = '1';
    overlayEl.classList.add('cd-overlay--visible', 'cd-overlay--slide');

    var content = overlayEl.querySelector('.cd-slide');
    if (content) {
      content.classList.add('cd-slide--enter');
      setTimeout(function() { content.classList.add('cd-slide--visible'); }, 50);
    }

    return new Promise(function(resolve) {
      var progress = overlayEl.querySelector('.cd-slide__progress-fill');
      if (progress) {
        progress.style.transition = 'width ' + durationMs + 'ms linear';
        setTimeout(function() { progress.style.width = '100%'; }, 50);
      }

      slideTimer = setTimeout(function() {
        isShowingSlide = false;
        resolve();
      }, durationMs);
    });
  }

  function hide() {
    clearTimeout(slideTimer);
    clearTimeout(fadeTimer);
    isShowingSlide = false;
    if (overlayEl) {
      overlayEl.style.transition = 'none';
      overlayEl.style.opacity = '0';
      overlayEl.classList.remove('cd-overlay--visible', 'cd-overlay--slide');
      overlayEl.innerHTML = '';
    }
  }

  function isActive() { return isShowingSlide; }

  // ============================================================
  // SLIDE BUILDERS
  // ============================================================
  function buildSlideText(payload, segment) {
    var title = esc(payload.title || segment.title || '');
    var subtitle = esc(payload.subtitle || '');
    var body = esc(payload.body || '');
    var textColor = payload.text_color || '#ffffff';
    return '<div class="cd-slide cd-slide--text" style="color:' + textColor + '">' +
      (title ? '<h2 class="cd-slide__title">' + title + '</h2>' : '') +
      (subtitle ? '<p class="cd-slide__subtitle">' + subtitle + '</p>' : '') +
      (body ? '<p class="cd-slide__body">' + body + '</p>' : '') +
      '<div class="cd-slide__progress"><div class="cd-slide__progress-fill"></div></div>' +
    '</div>';
  }

  function buildSlideImage(payload, segment) {
    var imageUrl = payload.image_url || '';
    var caption = esc(payload.caption || segment.title || '');
    var textColor = payload.text_color || '#ffffff';
    return '<div class="cd-slide cd-slide--image" style="color:' + textColor + '">' +
      (imageUrl ? '<img class="cd-slide__img" src="' + esc(imageUrl) + '" alt="">' : '') +
      (caption ? '<p class="cd-slide__caption">' + caption + '</p>' : '') +
      '<div class="cd-slide__progress"><div class="cd-slide__progress-fill"></div></div>' +
    '</div>';
  }

  function buildSlideMixed(payload, segment) {
    var title = esc(payload.title || segment.title || '');
    var body = esc(payload.body || '');
    var imageUrl = payload.image_url || '';
    var textColor = payload.text_color || '#ffffff';
    var layout = payload.layout || 'left';
    var imgHtml = imageUrl ? '<img class="cd-slide__img" src="' + esc(imageUrl) + '" alt="">' : '';
    return '<div class="cd-slide cd-slide--mixed cd-slide--layout-' + layout + '" style="color:' + textColor + '">' +
      '<div class="cd-slide__media">' + imgHtml + '</div>' +
      '<div class="cd-slide__content">' +
        (title ? '<h2 class="cd-slide__title">' + title + '</h2>' : '') +
        (body ? '<p class="cd-slide__body">' + body + '</p>' : '') +
      '</div>' +
      '<div class="cd-slide__progress"><div class="cd-slide__progress-fill"></div></div>' +
    '</div>';
  }

  function esc(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return {
    init: init,
    fadeOut: fadeOut,
    fadeIn: fadeIn,
    showSlide: showSlide,
    hide: hide,
    isActive: isActive,
    FADE_MIN_MS: FADE_MIN_MS,
    FADE_MAX_MS: FADE_MAX_MS,
    FADE_DEFAULT_MS: FADE_DEFAULT_MS
  };

})();
