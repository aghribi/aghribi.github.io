// Home page beam animation and scroll reveal. Both stay off when the reader prefers reduced motion.
(() => {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!still) document.documentElement.classList.add("fx");

  // Scroll reveal
  const targets = document.querySelectorAll(".card-p, .skills > div, .entries li, .axes, main h2");
  if (!still && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }), { rootMargin: "0px 0px -8% 0px" });
    targets.forEach(el => {
      const i = [...el.parentElement.children].indexOf(el);
      el.style.transitionDelay = `${Math.min(i, 6) * 60}ms`;
      el.classList.add("reveal");
      io.observe(el);
    });
  }

  // Beam: bunches in a ring, betatron oscillation with a non-integer tune, radiation damping.
  const canvas = document.getElementById("beam");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const COLORS = ["#f92672", "#a6e22e", "#66d9ef", "#fd971f", "#ae81ff", "#e6db74"];
  const TUNE = 4.31, DAMPING = 0.9985, PER_BUNCH = 36, MAX_BUNCHES = 12;
  let W, H, R, bunches = [], running = false, visible = true;

  const resize = () => {
    const r = canvas.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    canvas.width = r.width * dpr; canvas.height = r.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = r.width; H = r.height; R = Math.min(W, H) * 0.36;
  };
  const bunch = (theta, amp) => ({
    color: COLORS[bunches.length % COLORS.length],
    parts: Array.from({ length: PER_BUNCH }, () => ({
      th: theta + (Math.random() - .5) * .12, a: amp * (.4 + Math.random() * .6), ph: Math.random() * 2 * Math.PI,
    })),
  });
  const ring = () => {
    ctx.strokeStyle = "rgba(248,248,242,.025)"; ctx.lineWidth = R * 0.16;  // trails accumulate it to about .1
    ctx.beginPath(); ctx.ellipse(W / 2, H / 2, R, R * (H / W < 1 ? H / W * 1.1 : 1), 0, 0, 2 * Math.PI); ctx.stroke();
  };
  const pos = (p) => {
    const ry = R * (H / W < 1 ? H / W * 1.1 : 1);
    const x = p.a * Math.cos(TUNE * p.th + p.ph);
    return [W / 2 + (R + x) * Math.cos(p.th), H / 2 + (ry + x) * Math.sin(p.th)];
  };
  const frame = (step) => {
    ctx.fillStyle = "rgba(30,31,28,.22)"; ctx.fillRect(0, 0, W, H);
    ring();
    for (const b of bunches) {
      ctx.fillStyle = b.color;
      for (const p of b.parts) {
        if (step) { p.th += 0.018; p.a = Math.max(p.a * DAMPING, 1.5); }
        const [x, y] = pos(p);
        ctx.beginPath(); ctx.arc(x, y, 2, 0, 2 * Math.PI); ctx.fill();
      }
    }
  };
  const loop = () => {
    if (!running) return;
    frame(true);
    requestAnimationFrame(loop);
  };
  const toggle = () => {
    const go = !still && visible && !document.hidden;
    if (go && !running) { running = true; requestAnimationFrame(loop); }
    if (!go) running = false;
  };

  resize();
  for (let i = 0; i < 6; i++) bunches.push(bunch(i * Math.PI / 3, R * 0.12));
  ctx.fillStyle = "#1e1f1c"; ctx.fillRect(0, 0, W, H);
  if (still) for (let i = 0; i < 40; i++) frame(true);
  frame(false);

  canvas.addEventListener("click", (e) => {
    const r = canvas.getBoundingClientRect();
    const th = Math.atan2(e.clientY - r.top - H / 2, e.clientX - r.left - W / 2);
    if (bunches.length >= MAX_BUNCHES) bunches.shift();
    bunches.push(bunch(th, R * 0.3));
    if (still) frame(false);
  });
  new ResizeObserver(() => { resize(); frame(false); }).observe(canvas);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; toggle(); }).observe(canvas);
  document.addEventListener("visibilitychange", toggle);
  toggle();
})();
