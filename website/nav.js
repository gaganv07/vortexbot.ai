/**
 * VORTEX AI — Accessible Responsive Navigation Handler
 * Implements mobile drawer toggle, ARIA synchronization, keyboard focus/escape traps,
 * and body scroll locking.
 */
(function() {
  function initNav() {
    const toggle = document.querySelector('.nav-toggle');
    const menu = document.getElementById('mobile-menu');
    if (!toggle || !menu) return;

    let isOpen = false;
    let previousActiveElement = null;

    function getFocusableElements() {
      return Array.from(menu.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'));
    }

    function openMenu() {
      isOpen = true;
      previousActiveElement = document.activeElement;
      toggle.setAttribute('aria-expanded', 'true');
      toggle.setAttribute('aria-label', 'Close navigation menu');
      menu.classList.add('is-open');
      menu.hidden = false;
      menu.setAttribute('aria-hidden', 'false');
      document.body.classList.add('nav-open');
      document.body.style.overflow = 'hidden';

      // Focus first link in menu for keyboard accessibility
      const focusables = getFocusableElements();
      if (focusables.length > 0) {
        focusables[0].focus();
      }
    }

    function closeMenu(restoreFocus = true) {
      if (!isOpen) return;
      isOpen = false;
      toggle.setAttribute('aria-expanded', 'false');
      toggle.setAttribute('aria-label', 'Toggle navigation menu');
      menu.classList.remove('is-open');
      menu.hidden = true;
      menu.setAttribute('aria-hidden', 'true');
      document.body.classList.remove('nav-open');
      document.body.style.overflow = '';

      if (restoreFocus) {
        if (toggle && typeof toggle.focus === 'function') {
          toggle.focus();
        } else if (previousActiveElement && typeof previousActiveElement.focus === 'function') {
          previousActiveElement.focus();
        }
      }
    }

    toggle.addEventListener('click', function(e) {
      e.stopPropagation();
      if (isOpen) {
        closeMenu(false);
      } else {
        openMenu();
      }
    });

    // Close when clicking any navigation link inside mobile menu
    menu.querySelectorAll('a').forEach(function(link) {
      link.addEventListener('click', function() {
        closeMenu(false);
      });
    });

    // Close when clicking outside / backdrop
    document.addEventListener('click', function(e) {
      if (isOpen && !menu.contains(e.target) && !toggle.contains(e.target)) {
        closeMenu(false);
      }
    });

    // Keyboard support: Escape closes menu; Tab traps focus inside modal menu
    document.addEventListener('keydown', function(e) {
      if (!isOpen) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu(true);
        return;
      }

      if (e.key === 'Tab') {
        const focusables = getFocusableElements();
        if (focusables.length === 0) return;

        const firstElement = focusables[0];
        const lastElement = focusables[focusables.length - 1];

        if (e.shiftKey) {
          // Shift + Tab: if on first element, wrap to last
          if (document.activeElement === firstElement || document.activeElement === toggle) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          // Tab: if on last element, wrap to first
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    });

    // UF-06: Touch swipe-to-close gesture on mobile drawer
    let touchStartX = 0;
    let touchStartY = 0;
    menu.addEventListener('touchstart', function(e) {
      if (e.changedTouches && e.changedTouches.length > 0) {
        touchStartX = e.changedTouches[0].screenX;
        touchStartY = e.changedTouches[0].screenY;
      }
    }, { passive: true });

    menu.addEventListener('touchend', function(e) {
      if (e.changedTouches && e.changedTouches.length > 0) {
        const touchEndX = e.changedTouches[0].screenX;
        const touchEndY = e.changedTouches[0].screenY;
        const diffX = touchEndX - touchStartX;
        const diffY = touchEndY - touchStartY;
        // Detect left swipe (diffX < -50) with horizontal intent (|diffX| > |diffY|)
        if (diffX < -50 && Math.abs(diffX) > Math.abs(diffY)) {
          closeMenu(true);
        }
      }
    }, { passive: true });

    // Close mobile menu on resize past mobile breakpoint (> 850px)
    window.addEventListener('resize', function() {
      if (window.innerWidth > 850 && isOpen) {
        closeMenu(false);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNav);
  } else {
    initNav();
  }
})();
