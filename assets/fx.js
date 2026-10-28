// Home page phase-space animation and scroll reveal. Both stay off when the reader prefers reduced motion.
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

  // Longitudinal phase space of a stationary RF bucket, normalised units: phi' = delta, delta' = -sin(phi).
  // Separatrix: delta = ±2 cos(phi/2). Leapfrog keeps the map symplectic, so bunches filament instead of decaying.
  const canvas = document.getElementById("beam");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const COLORS = ["#f92672", "#a6e22e", "#66d9ef", "#fd971f", "#ae81ff", "#e6db74"];
  const DT = 0.035, PER_BUNCH = 400, MAX_BUNCHES = 6, PHI = Math.PI * 1.08, DMAX = 2.6;
  let W, H, bunches = [], running = false, visible = true;

  const resize = () => {
    const r = canvas.getBoundingClientRect(), dpr = devicePixelRatio || 1;
    canvas.width = r.width * dpr; canvas.height = r.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = r.width; H = r.height;
  };
  const X = (phi) => W / 2 + phi / PHI * W / 2, Y = (d) => H / 2 - d / DMAX * H / 2;
  const gauss = () => Math.sqrt(-2 * Math.log(1 - Math.random())) * Math.cos(2 * Math.PI * Math.random());
  let injected = 0;
  const bunch = (phi, d) => ({
    color: COLORS[injected++ % COLORS.length],
    parts: Array.from({ length: PER_BUNCH }, () => ({ phi: phi + .18 * gauss(), d: d + .14 * gauss() })),
  });
  const axes = () => {
    ctx.strokeStyle = "rgba(248,248,242,.12)"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    ctx.strokeStyle = "rgba(117,113,94,.9)"; ctx.setLineDash([5, 5]); ctx.lineWidth = 1.5;
    for (const s of [1, -1]) {
      ctx.beginPath();
      for (let k = 0; k <= 200; k++) { const p = -Math.PI + 2 * Math.PI * k / 200; ctx[k ? "lineTo" : "moveTo"](X(p), Y(s * 2 * Math.cos(p / 2))); }
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(179,174,150,.9)"; ctx.font = "12px JetBrains Mono, monospace";
    ctx.fillText("φ", W - 16, H / 2 - 6); ctx.fillText("δ", W / 2 + 6, 14);
  };
  const push = (p) => {
    p.d -= Math.sin(p.phi) * DT / 2; p.phi += p.d * DT; p.d -= Math.sin(p.phi) * DT / 2;
    if (p.phi > Math.PI) p.phi -= 2 * Math.PI; else if (p.phi < -Math.PI) p.phi += 2 * Math.PI;
  };
  const frame = (step) => {
    ctx.fillStyle = "rgba(30,31,28,.35)"; ctx.fillRect(0, 0, W, H);
    axes();
    for (const b of bunches) {
      ctx.fillStyle = b.color;
      for (const p of b.parts) { if (step) push(p); ctx.fillRect(X(p.phi) - 1, Y(p.d) - 1, 2, 2); }
    }
  };
  const loop = () => { if (!running) return; frame(true); requestAnimationFrame(loop); };
  const toggle = () => {
    const go = !still && visible && !document.hidden;
    if (go && !running) { running = true; requestAnimationFrame(loop); }
    if (!go) running = false;
  };

  resize();
  bunches.push(bunch(1.6, 0), bunch(-.6, 1.2), bunch(.4, -1.75));
  ctx.fillStyle = "#1e1f1c"; ctx.fillRect(0, 0, W, H);
  if (still) for (let i = 0; i < 300; i++) bunches.forEach(b => b.parts.forEach(push));
  frame(false);

  canvas.addEventListener("click", (e) => {
    const r = canvas.getBoundingClientRect();
    const phi = ((e.clientX - r.left) / W * 2 - 1) * PHI, d = (1 - (e.clientY - r.top) / H * 2) * DMAX;
    if (bunches.length >= MAX_BUNCHES) bunches.shift();
    bunches.push(bunch(phi, d));
    if (still) frame(false);
  });
  new ResizeObserver(() => { resize(); ctx.fillStyle = "#1e1f1c"; ctx.fillRect(0, 0, W, H); frame(false); }).observe(canvas);
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; toggle(); }).observe(canvas);
  document.addEventListener("visibilitychange", toggle);
  toggle();
})();
