// Un solo IntersectionObserver per [data-reveal] (aggiunge .visible)
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  },
  { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
);

document.querySelectorAll('[data-reveal]').forEach((el) => observer.observe(el));
