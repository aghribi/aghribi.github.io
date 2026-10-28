// Home page: terminal typing, record timeline, scroll reveal. Motion stays off when the reader prefers reduced motion.
(() => {
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!still) document.documentElement.classList.add("fx");

  // Scroll reveal
  if (!still && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }), { rootMargin: "0px 0px -8% 0px" });
    document.querySelectorAll(".card-p, .skills > div, .entries li, .axes, main h2").forEach(el => {
      const i = [...el.parentElement.children].indexOf(el);
      el.style.transitionDelay = `${Math.min(i, 6) * 60}ms`;
      el.classList.add("reveal");
      io.observe(el);
    });
  }

  // Terminal: type each command, then show its output. Text is in the HTML, so nothing is lost without JS.
  const screen = document.querySelector(".hero.term .screen");
  if (screen && !still) {
    const steps = [...screen.children], wait = ms => new Promise(r => setTimeout(r, ms));
    steps.forEach(el => el.classList.add("pending"));
    (async () => {
      for (const el of steps) {
        const cmd = el.querySelector(".in");
        el.classList.remove("pending");
        if (!cmd) { await wait(70); continue; }
        const text = cmd.textContent; cmd.textContent = "";
        await wait(250);
        for (const ch of text) { cmd.textContent += ch; await wait(38); }
        await wait(160);
      }
    })();
  }

  // Record: one mark per publication (stacked above the axis by year), per talk (below), then one bar per project.
  const svg = document.getElementById("record");
  if (!svg) return;
  const [pubs, ...talkLists] = [...document.querySelectorAll(".rec-data")].map(box => [...box.children].map(({ dataset: a }) => ({ t: a.t, v: a.v, y: a.y, d: a.d, c: a.c, u: a.u || null })));
  const talks = talkLists.flat();  // public talks, then pre-2021 talks known only from local slides (no link)
  const TYPES = [["journal", "--pink"], ["conference", "--cyan"], ["book", "--orange"], ["thesis", "--purple"], ["patent", "--yellow"],
    ["preprint", "--fg"], ["dataset", "--green"], ["other", "--muted"], ["collaboration", "--muted"], ["talk", "--green"]];
  let color;
  const order = Object.fromEntries(TYPES.map(([k], i) => [k, i]));
  const yearOf = it => +(it.y || it.d.slice(0, 4));
  const projects = [...document.querySelector(".rec-career").children].map(({ dataset: a }) => ({ t: a.t, r: a.r, from: +a.from, to: a.to ? +a.to : null }));
  projects.forEach((p, i) => p.f = document.querySelector(".rec-career").children[i].dataset.f);
  const today = new Date(), now = today.getFullYear() + today.getMonth() / 12;
  const FIELDS = [["cosmology", "--purple"], ["accelerators", "--cyan"], ["ai", "--orange"]];
  const all = [...pubs, ...talks];
  const y0 = Math.min(...all.map(yearOf), ...projects.map(p => p.from)), y1 = Math.max(...all.map(yearOf), ...projects.map(p => p.to || 0)) + 1;
  const tip = document.getElementById("rec-tip"), NS = "http://www.w3.org/2000/svg";
  const show = it => { tip.textContent = `${it.t} · ${it.v}${it.v ? ", " : ""}${it.d || it.y}`; };
  const showP = p => { tip.textContent = `${p.t}${p.r ? " · " + p.r : ""} · ${p.from} to ${p.to || "now"}`; };

  const present = new Set(all.map(it => it.c)), legend = document.getElementById("rec-legend");
  const draw = () => {
    const css = getComputedStyle(document.body);
    color = Object.fromEntries(TYPES.map(([k, n]) => [k, css.getPropertyValue(n).trim()]));
    const fcol = Object.fromEntries(FIELDS.map(([k, n]) => [k, css.getPropertyValue(n).trim()]));
    legend.innerHTML = TYPES.filter(([k]) => present.has(k)).map(([k]) => `<span><i class="${k}" style="--c:${color[k]}"></i>${k}</span>`).join("")
      + FIELDS.map(([k]) => `<span><i class="bar" style="--c:${fcol[k]}"></i>${k === "ai" ? "AI and coordination" : k} projects</span>`).join("");
    svg.replaceChildren();
    const W = svg.clientWidth, R = W < 600 ? 3 : 4.5, STEP = 2 * R + 2;
    const stackUp = {}, stackDown = {};
    pubs.forEach(p => stackUp[yearOf(p)] = (stackUp[yearOf(p)] || 0) + 1);
    talks.forEach(t => stackDown[yearOf(t)] = (stackDown[yearOf(t)] || 0) + 1);
    const BAR = W < 600 ? 13 : 16, talksDown = Math.max(0, ...Object.values(stackDown)) * STEP + 16;
    const up = Math.max(...Object.values(stackUp)) * STEP + 10, down = talksDown + projects.length * BAR + 28;
    const H = up + down, AX = up, X = y => 10 + (y - y0) / (y1 - y0) * (W - 20);
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`); svg.style.height = H + "px";
    const add = (tag, a, parent = svg) => { const n = document.createElementNS(NS, tag); for (const k in a) n.setAttribute(k, a[k]); parent.appendChild(n); return n; };
    for (let y = y0; y <= y1; y++) {
      add("line", { x1: X(y), x2: X(y), y1: 0, y2: H - 18, class: "grid" });
      if ((y - y0) % (W < 600 ? 4 : 2) === 0 && X(y) + 34 < W) add("text", { x: X(y) + 3, y: H - 4, class: "yr" }).textContent = y;
    }
    add("line", { x1: 0, x2: W, y1: AX, y2: AX, class: "axis" });
    const mark = (it, cx, cy, i) => {
      const a = add("a", it.u ? { href: it.u, tabindex: 0 } : { tabindex: 0 });
      add("title", {}, a).textContent = it.t;
      const col = color[it.c] || color.other, talk = it.c === "talk";
      const c = add("circle", { cx, cy, r: talk ? R - 1 : R, fill: talk ? "none" : col, stroke: talk ? col : "none", "stroke-width": 2, "fill-opacity": it.c === "collaboration" ? .5 : 1, class: "mk" }, a);
      c.style.animationDelay = `${i * 6}ms`;
      a.addEventListener("mouseenter", () => show(it)); a.addEventListener("focus", () => show(it));
    };
    const filled = {};
    [...pubs].sort((a, b) => order[a.c] - order[b.c]).forEach((p, i) => {
      const y = yearOf(p), k = filled["u" + y] = (filled["u" + y] || 0) + 1;
      mark(p, X(y + .5), AX - k * STEP + R - 2, i);
    });
    [...talks].sort((a, b) => (a.d || a.y).localeCompare(b.d || b.y)).forEach((t, i) => {
      const y = yearOf(t), k = filled["d" + y] = (filled["d" + y] || 0) + 1;
      mark(t, X(y + .5), AX + k * STEP - R + 2, pubs.length + i);
    });
    projects.forEach((p, i) => {
      const x0 = X(p.from), x1 = X(p.to ? p.to + 1 : now), y = AX + talksDown + i * BAR, right = x1 + 6 < W - 160;
      const g = add("g", { tabindex: 0, class: "pj" });
      add("title", {}, g).textContent = p.t;
      add("rect", { x: x0, y, width: Math.max(4, x1 - x0), height: BAR - 5, rx: 3, fill: fcol[p.f], class: "mk" }, g);
      if (!p.to) add("rect", { x: x1 - 2, y, width: 4, height: BAR - 5, fill: fcol[p.f], opacity: .4 }, g);
      add("text", { x: right ? x1 + 6 : x0 - 6, y: y + BAR - 7, "text-anchor": right ? "start" : "end", class: "pl" }, g).textContent = p.t;
      g.addEventListener("mouseenter", () => showP(p)); g.addEventListener("focus", () => showP(p));
    });
  };
  new MutationObserver(() => setTimeout(draw, 60)).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  let lastW = 0;
  new ResizeObserver(() => { if (svg.clientWidth !== lastW) { lastW = svg.clientWidth; draw(); } }).observe(svg.parentElement);
})();
