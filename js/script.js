/* ==========================================================================
   VISUALIZE — script.js
   Vanilla JS only. Organized by feature. Every "backend" action here
   (auth, AI generation) is a clearly-marked mock/demo — no server calls.
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  initMobileNav();
  initSmoothScroll();
  initScrollReveal();
  initGalleryFilter();
  initLightbox();
  initTestimonialCarousel();
  initContactForm();
  initLoginForm();
  initRegisterForm();
  initPasswordToggles();
  initPasswordStrength();
});

/* ---------------------------------------------------------------------- */
/* Toast notifications (used across pages)                                 */
/* ---------------------------------------------------------------------- */
function showToast(message, type = 'success') {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.setAttribute('role', 'status');
  toast.innerHTML = `<span>${message}</span>`;
  stack.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('leaving');
    setTimeout(() => toast.remove(), 260);
  }, 3800);
}

/* ---------------------------------------------------------------------- */
/* Mobile navigation                                                       */
/* ---------------------------------------------------------------------- */
function initMobileNav() {
  const btn = document.querySelector('.hamburger');
  const menu = document.querySelector('.mobile-menu');
  if (!btn || !menu) return;

  btn.addEventListener('click', () => {
    const isOpen = menu.classList.toggle('is-open');
    btn.setAttribute('aria-expanded', String(isOpen));
    document.body.style.overflow = isOpen ? 'hidden' : '';
  });

  menu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      menu.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    });
  });
}

/* ---------------------------------------------------------------------- */
/* Smooth scroll for in-page anchors                                       */
/* ---------------------------------------------------------------------- */
function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(link => {
    link.addEventListener('click', (e) => {
      const id = link.getAttribute('href');
      if (id.length < 2) return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      const navHeight = 76;
      const top = target.getBoundingClientRect().top + window.scrollY - navHeight;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });
}

/* ---------------------------------------------------------------------- */
/* Scroll-triggered reveal animations                                      */
/* ---------------------------------------------------------------------- */
function initScrollReveal() {
  const items = document.querySelectorAll('.reveal');
  if (!items.length) return;

  if (!('IntersectionObserver' in window)) {
    items.forEach(i => i.classList.add('is-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('is-visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  items.forEach(item => observer.observe(item));
}

/* ---------------------------------------------------------------------- */
/* Sample design gallery — filtering + lightbox                            */
/* ---------------------------------------------------------------------- */
function initGalleryFilter() {
  const buttons = document.querySelectorAll('.filter-btn');
  const items = document.querySelectorAll('.gallery-item');
  if (!buttons.length || !items.length) return;

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      buttons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const filter = btn.dataset.filter;

      items.forEach(item => {
        const match = filter === 'all' || item.dataset.category === filter;
        item.classList.toggle('is-hidden', !match);
      });
    });
  });
}

function initLightbox() {
  const lightbox = document.querySelector('.lightbox');
  if (!lightbox) return;
  const img = lightbox.querySelector('.lightbox-img');
  const title = lightbox.querySelector('.lightbox-title');
  const desc = lightbox.querySelector('.lightbox-desc');
  const closeBtn = lightbox.querySelector('.lightbox-close');

  document.querySelectorAll('[data-lightbox-trigger]').forEach(trigger => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      const card = trigger.closest('.gallery-item');
      if (!card) return;
      img.src = card.querySelector('img').src;
      img.alt = card.querySelector('img').alt;
      title.textContent = card.dataset.title || '';
      desc.textContent = card.dataset.desc || '';
      lightbox.classList.add('is-open');
      document.body.style.overflow = 'hidden';
    });
  });

  function close() {
    lightbox.classList.remove('is-open');
    document.body.style.overflow = '';
  }
  closeBtn.addEventListener('click', close);
  lightbox.addEventListener('click', (e) => { if (e.target === lightbox) close(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
}

/* ---------------------------------------------------------------------- */
/* Testimonials carousel                                                   */
/* ---------------------------------------------------------------------- */
function initTestimonialCarousel() {
  const track = document.querySelector('.testi-track');
  const dotsWrap = document.querySelector('.testi-controls');
  if (!track || !dotsWrap) return;

  const cards = track.querySelectorAll('.testi-card');
  dotsWrap.innerHTML = '';
  cards.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'testi-dot' + (i === 0 ? ' active' : '');
    dot.setAttribute('aria-label', `Go to testimonial ${i + 1}`);
    dot.addEventListener('click', () => {
      cards[i].scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
    });
    dotsWrap.appendChild(dot);
  });
  const dots = dotsWrap.querySelectorAll('.testi-dot');

  let ticking = false;
  track.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const index = Math.round(track.scrollLeft / (cards[0].offsetWidth + 22));
      dots.forEach((d, i) => d.classList.toggle('active', i === index));
      ticking = false;
    });
  });

  let autoplay = setInterval(() => {
    const next = (Array.from(dots).findIndex(d => d.classList.contains('active')) + 1) % cards.length;
    cards[next].scrollIntoView({ behavior: 'smooth', inline: 'start', block: 'nearest' });
  }, 5500);
  track.addEventListener('mouseenter', () => clearInterval(autoplay));
}

/* ---------------------------------------------------------------------- */
/* Validation helpers                                                      */
/* ---------------------------------------------------------------------- */
function setFieldError(fieldEl, message) {
  fieldEl.classList.toggle('has-error', Boolean(message));
  const errEl = fieldEl.querySelector('.field-error');
  if (errEl) errEl.textContent = message || '';
}
function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/* ---------------------------------------------------------------------- */
/* Contact form (demo only — no backend connected)                         */
/* ---------------------------------------------------------------------- */
function initContactForm() {
  const form = document.querySelector('#contact-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let valid = true;

    const name = form.querySelector('#contact-name');
    const email = form.querySelector('#contact-email');
    const subject = form.querySelector('#contact-subject');
    const message = form.querySelector('#contact-message');

    if (!name.value.trim()) { setFieldError(name.closest('.field'), 'Enter your full name.'); valid = false; }
    else setFieldError(name.closest('.field'), '');

    if (!isValidEmail(email.value.trim())) { setFieldError(email.closest('.field'), 'Enter a valid email address.'); valid = false; }
    else setFieldError(email.closest('.field'), '');

    if (!subject.value.trim()) { setFieldError(subject.closest('.field'), 'Add a subject.'); valid = false; }
    else setFieldError(subject.closest('.field'), '');

    if (message.value.trim().length < 10) { setFieldError(message.closest('.field'), 'Message should be at least 10 characters.'); valid = false; }
    else setFieldError(message.closest('.field'), '');

    if (!valid) {
      showToast('Please fix the highlighted fields.', 'error');
      return;
    }

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending…';

    // Simulated submission — this form is a frontend demo with no backend connected.
    setTimeout(() => {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Send Message';
      form.reset();
      showToast('Message sent — this is a demo form, not connected to a backend yet.', 'success');
    }, 1100);
  });
}

/* ---------------------------------------------------------------------- */
/* Password show/hide toggles (login + register)                           */
/* ---------------------------------------------------------------------- */
function initPasswordToggles() {
  document.querySelectorAll('.password-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const input = btn.closest('.password-field').querySelector('input');
      const showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.textContent = showing ? 'Show' : 'Hide';
      btn.setAttribute('aria-label', showing ? 'Show password' : 'Hide password');
    });
  });
}

/* ---------------------------------------------------------------------- */
/* Password strength indicator (register page)                             */
/* ---------------------------------------------------------------------- */
function initPasswordStrength() {
  const input = document.querySelector('#register-password');
  const meter = document.querySelector('.strength-meter');
  const label = document.querySelector('.strength-label');
  if (!input || !meter) return;

  const bars = meter.querySelectorAll('i');

  input.addEventListener('input', () => {
    const val = input.value;
    let score = 0;
    if (val.length >= 8) score++;
    if (/[A-Z]/.test(val)) score++;
    if (/[0-9]/.test(val)) score++;
    if (/[^A-Za-z0-9]/.test(val)) score++;

    const colors = ['var(--danger)', 'var(--danger)', 'var(--amber)', 'var(--success)', 'var(--success)'];
    const labels = ['Too short', 'Weak', 'Fair', 'Good', 'Strong'];

    bars.forEach((bar, i) => {
      bar.style.background = i < score ? colors[score] : 'var(--line-strong)';
    });
    label.textContent = val ? labels[score] : 'Minimum 8 characters';
  });
}

/* ---------------------------------------------------------------------- */
/* Login form (demo — simulates auth, no backend)                          */
/* ---------------------------------------------------------------------- */
function initLoginForm() {
  const form = document.querySelector('#login-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let valid = true;
    const email = form.querySelector('#login-email');
    const password = form.querySelector('#login-password');

    if (!isValidEmail(email.value.trim())) { setFieldError(email.closest('.field'), 'Enter a valid email address.'); valid = false; }
    else setFieldError(email.closest('.field'), '');

    if (!password.value) { setFieldError(password.closest('.field'), 'Enter your password.'); valid = false; }
    else setFieldError(password.closest('.field'), '');

    if (!valid) { showToast('Please check your email and password.', 'error'); return; }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Signing in…';

    // Demo only — no authentication backend is connected.
    setTimeout(() => {
      showToast('Signed in — demo mode, taking you to the design studio.', 'success');
      setTimeout(() => { window.location.href = 'design.html'; }, 700);
    }, 900);
  });
}

/* ---------------------------------------------------------------------- */
/* Register form (demo — simulates account creation, no backend)           */
/* ---------------------------------------------------------------------- */
function initRegisterForm() {
  const form = document.querySelector('#register-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let valid = true;

    const name = form.querySelector('#register-name');
    const email = form.querySelector('#register-email');
    const password = form.querySelector('#register-password');
    const confirm = form.querySelector('#register-confirm');
    const terms = form.querySelector('#register-terms');

    if (!name.value.trim()) { setFieldError(name.closest('.field'), 'Enter your full name.'); valid = false; }
    else setFieldError(name.closest('.field'), '');

    if (!isValidEmail(email.value.trim())) { setFieldError(email.closest('.field'), 'Enter a valid email address.'); valid = false; }
    else setFieldError(email.closest('.field'), '');

    if (password.value.length < 8) { setFieldError(password.closest('.field'), 'Password must be at least 8 characters.'); valid = false; }
    else setFieldError(password.closest('.field'), '');

    if (confirm.value !== password.value || !confirm.value) { setFieldError(confirm.closest('.field'), 'Passwords do not match.'); valid = false; }
    else setFieldError(confirm.closest('.field'), '');

    const termsField = terms.closest('.field');
    if (!terms.checked) { setFieldError(termsField, 'You must accept the Terms & Conditions.'); valid = false; }
    else setFieldError(termsField, '');

    if (!valid) { showToast('Please fix the highlighted fields.', 'error'); return; }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Creating account…';

    // Demo only — no account is actually created on a server.
    setTimeout(() => {
      showToast('Account created — demo mode, taking you to the design studio.', 'success');
      setTimeout(() => { window.location.href = 'design.html'; }, 700);
    }, 900);
  });
}


