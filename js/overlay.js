/**
 * CutterDuper — Overlay / Slide / Transition Renderer
 * =====================================================
 * Renders slides and fade transitions as HTML overlays
 * on top of the YouTube player iframe.
 *
 * Transition types: direct_cut, fade_black, fade_white
 * Slide types: slide_text, slide_image, slide_mixed
 */
var CD = window.CD || {};

CD.Overlay = (function() {

  var overlayEl = null;
  var isShowingSlide = false;
  var slideTimer = null;
  var fadeTimer = null;

  function init() {
    // Create the overlay div that sits on top of the player
    var playerWrapper = document.querySelector('.cd-player-wrapper');
    if (!playerWrapper) return;

    overlayEl = document.createElement('div');
    overlayEl.className = 'cd-overlay';
    overlayEl.id = 'cd-overlay';
    playerWrapper.appendChild(overlayEl);
  }

  /**
   * Show a fade transition (fade to black/white then back).
   * Returns a Promise that resolves when the transition is complete.
   */
  function showFade(type, durationMs) {
    if (!overlayEl) return Promise.resolve();
    durationMs = durationMs || 600;
    var halfDur = Math.round(durationMs / 2);

    var color = type === 'fade_white' ? '#ffffff' : '#000000';
    overlayEl.style.backgroundColor = color;
    overlayEl.style.transition = 'opacity ' + halfDur + 'ms ease';

    return new Promise(function(resolve) {
      // Fade in (overlay appears)
      overlayEl.classList.add('cd-overlay--visible');
      overlayEl.style.opacity = '1';

      fadeTimer = setTimeout(function() {
        // Fade out (overlay disappears)
        overlayEl.style.opacity = '0';
        fadeTimer = setTimeout(function() {
          overlayEl.classList.remove('cd-overlay--visible');
          overlayEl.style.transition = '';
          resolve();
        }, halfDur);
      }, halfDur);
    });
  }

  /**
   * Show a fade-out only (before a slide or at segment end).
   */
  function fadeOut(type, durationMs) {
    if (!overlayEl) return Promise.resolve();
    durationMs = durationMs || 400;
    var color = type === 'fade_white' ? '#ffffff' : '#000000';
    overlayEl.style.backgroundColor = color;
    overlayEl.style.transition = 'opacity ' + durationMs + 'ms ease';
    overlayEl.innerHTML = '';

    return new Promise(function(resolve) {
      overlayEl.classList.add('cd-overlay--visible');
      overlayEl.style.opacity = '1';
      fadeTimer = setTimeout(resolve, durationMs);
    });
  }

  /**
   * Show a fade-in only (after a slide or at segment start).
   */
  function fadeIn(durationMs) {
    if (!overlayEl) return Promise.resolve();
    durationMs = durationMs || 400;
    overlayEl.style.transition = 'opacity ' + durationMs + 'ms ease';

    return new Promise(function(resolve) {
      overlayEl.style.opacity = '0';
      fadeTimer = setTimeout(function() {
        overlayEl.classList.remove('cd-overlay--visible');
        overlayEl.style.transition = '';
        overlayEl.innerHTML = '';
        resolve();
      }, durationMs);
    });
  }

  /**
   * Show a slide (text, image, or mixed).
   * The slide stays visible for its duration, then resolves.
   */
  function showSlide(segment) {
    if (!overlayEl) return Promise.resolve();

    var payload = {};
    try {
      payload = JSON.parse(segment.payload_json || '{}');
    } catch(e) { payload = {}; }

    var segType = String(segment.type || 'slide_text');
    var durationMs = Number(segment.duration_ms) || 5000;
    var html = '';

    isShowingSlide = true;

    switch (segType) {
      case 'slide_text':
        html = buildSlideText(payload, segment);
        break;
      case 'slide_image':
        html = buildSlideImage(payload, segment);
        break;
      case 'slide_mixed':
        html = buildSlideMixed(payload, segment);
        break;
      default:
        html = buildSlideText(payload, segment);
    }

    overlayEl.innerHTML = html;
    overlayEl.style.backgroundColor = payload.bg_color || '#1a1d27';
    overlayEl.style.opacity = '1';
    overlayEl.classList.add('cd-overlay--visible', 'cd-overlay--slide');

    // Animate content in
    var content = overlayEl.querySelector('.cd-slide');
    if (content) {
      content.classList.add('cd-slide--enter');
      setTimeout(function() { content.classList.add('cd-slide--visible'); }, 50);
    }

    return new Promise(function(resolve) {
      // Progress bar for slide
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

  /**
   * Hide the overlay immediately.
   */
  function hide() {
    clearTimeout(slideTimer);
    clearTimeout(fadeTimer);
    isShowingSlide = false;
    if (overlayEl) {
      overlayEl.style.opacity = '0';
      overlayEl.classList.remove('cd-overlay--visible', 'cd-overlay--slide');
      overlayEl.innerHTML = '';
      overlayEl.style.transition = '';
    }
  }

  function isActive() {
    return isShowingSlide;
  }

  // ============================================================
  // SLIDE BUILDERS
  // ============================================================

  function buildSlideText(payload, segment) {
    var title = escapeHtml(payload.title || segment.title || '');
    var subtitle = escapeHtml(payload.subtitle || '');
    var body = escapeHtml(payload.body || '');
    var textColor = payload.text_color || '#ffffff';
    var fontSize = payload.font_size || 'normal';

    var sizeClass = fontSize === 'large' ? 'cd-slide--large' : fontSize === 'small' ? 'cd-slide--small' : '';

    return '<div class="cd-slide cd-slide--text ' + sizeClass + '" style="color:' + textColor + '">' +
      (title ? '<h2 class="cd-slide__title">' + title + '</h2>' : '') +
      (subtitle ? '<p class="cd-slide__subtitle">' + subtitle + '</p>' : '') +
      (body ? '<p class="cd-slide__body">' + body + '</p>' : '') +
      '<div class="cd-slide__progress"><div class="cd-slide__progress-fill"></div></div>' +
    '</div>';
  }

  function buildSlideImage(payload, segment) {
    var imageUrl = payload.image_url || '';
    var caption = escapeHtml(payload.caption || segment.title || '');
    var textColor = payload.text_color || '#ffffff';

    return '<div class="cd-slide cd-slide--image" style="color:' + textColor + '">' +
      (imageUrl ? '<img class="cd-slide__img" src="' + escapeHtml(imageUrl) + '" alt="">' : '') +
      (caption ? '<p class="cd-slide__caption">' + caption + '</p>' : '') +
      '<div class="cd-slide__progress"><div class="cd-slide__progress-fill"></div></div>' +
    '</div>';
  }

  function buildSlideMixed(payload, segment) {
    var title = escapeHtml(payload.title || segment.title || '');
    var body = escapeHtml(payload.body || '');
    var imageUrl = payload.image_url || '';
    var textColor = payload.text_color || '#ffffff';
    var layout = payload.layout || 'left'; // image left or right

    var imgHtml = imageUrl ? '<img class="cd-slide__img" src="' + escapeHtml(imageUrl) + '" alt="">' : '';

    return '<div class="cd-slide cd-slide--mixed cd-slide--layout-' + layout + '" style="color:' + textColor + '">' +
      '<div class="cd-slide__media">' + imgHtml + '</div>' +
      '<div class="cd-slide__content">' +
        (title ? '<h2 class="cd-slide__title">' + title + '</h2>' : '') +
        (body ? '<p class="cd-slide__body">' + body + '</p>' : '') +
      '</div>' +
      '<div class="cd-slide__progress"><div class="cd-slide__progress-fill"></div></div>' +
    '</div>';
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return {
    init: init,
    showFade: showFade,
    fadeOut: fadeOut,
    fadeIn: fadeIn,
    showSlide: showSlide,
    hide: hide,
    isActive: isActive
  };

})();
