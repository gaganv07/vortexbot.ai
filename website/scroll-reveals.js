(function () {
  'use strict';
  var root = document.documentElement;
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) return;
  var selectors = '.feature-card, .step, .metric, .benefit, .session-callout, .preview-notice, .release-note, .pricing-main .card';
  var targets = Array.prototype.slice.call(document.querySelectorAll(selectors));
  if (!targets.length) return;
  if (!('IntersectionObserver' in window)) return;
  targets.forEach(function (element) { element.classList.add('scroll-reveal'); });
  root.classList.add('scroll-reveals');
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('is-revealed');
      observer.unobserve(entry.target);
    });
  }, { root: null, rootMargin: '0px 0px -36px 0px', threshold: 0.08 });
  targets.forEach(function (element) { observer.observe(element); });
  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (motionQuery.addEventListener) {
    motionQuery.addEventListener('change', function (event) {
      if (!event.matches) return;
      observer.disconnect();
      root.classList.remove('scroll-reveals');
      targets.forEach(function (element) {
        element.classList.remove('scroll-reveal', 'is-revealed');
      });
    }, { once: true });
  }
})();
