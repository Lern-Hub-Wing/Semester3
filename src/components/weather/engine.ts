/**
 * Wetter-Ebene hinter den Karten (Canvas, fest im Fenster).
 *
 * – Wolken ziehen langsam hinter den Karten vorbei (vorgerenderte, weiche
 *   Wolkenbilder in drei Tiefen).
 * – Regen und Schnee fallen im Fenster; trifft ein Tropfen die Oberkante
 *   einer Karte (inkl. abgerundeter Ecken und der Bergspitze über dem
 *   Countdown), platscht er dort auf. Die Kanten werden in jedem Bild neu
 *   gemessen – beim Scrollen treffen die Tropfen also immer die richtige
 *   Stelle; Spritzer wandern mit der Karte mit.
 * – Nachts: Sterne und gelegentlich Sternschnuppen. Gewitter: Blitze.
 */
import type { WeatherScene } from '../../lib/weather';

interface Surface {
  left: number;
  right: number;
  top: number;
  bottom: number;
  radius: number;
  /** Bergspitze: Abstand der Kontur von `top` je Spalte (px), Infinity = keine Kontur */
  profile?: Float32Array;
}
interface Drop {
  x: number;
  y: number;
  vx: number;
  vy: number;
  len: number;
}
interface Flake {
  x: number;
  y: number;
  vy: number;
  r: number;
  phase: number;
  sway: number;
}
interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  r: number;
}
interface Ripple {
  x: number;
  y: number;
  life: number;
  max: number;
  size: number;
}
interface Settled {
  x: number;
  y: number;
  r: number;
  life: number;
}
interface Cloud {
  img: HTMLCanvasElement;
  x: number;
  y: number;
  w: number;
  h: number;
  speed: number;
  alpha: number;
}
interface Star {
  x: number;
  y: number;
  r: number;
  phase: number;
  speed: number;
}
interface Shooting {
  x: number;
  y: number;
  vx: number;
  vy: number;
  len: number;
  life: number;
  max: number;
}
interface Bolt {
  paths: { x: number; y: number }[][];
  life: number;
}

const SURFACE_SELECTOR = 'main .card, main .glass, main .photo-stage, main [data-weather-surface]';
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export class WeatherEngine {
  private ctx: CanvasRenderingContext2D;
  private w = 0;
  private h = 0;
  private dpr = 1;
  private scene: WeatherScene;
  private dark = false;
  private drops: Drop[] = [];
  private flakes: Flake[] = [];
  private particles: Particle[] = [];
  private ripples: Ripple[] = [];
  private settled: Settled[] = [];
  private clouds: Cloud[] = [];
  private stars: Star[] = [];
  private shooting: Shooting | null = null;
  private nextShoot = 0;
  private bolt: Bolt | null = null;
  private flash = 0;
  private nextBolt = 0;
  private spawnAcc = 0;
  private lastT = 0;
  private lastScroll = 0;
  private surfaces: Surface[] = [];
  private radii = new WeakMap<Element, number>();
  private peak: { key: string; data: Float32Array } | null = null;
  private time = 0;
  /** linke Kante des Inhalts (rechts neben der Seitenleiste) */
  private x0 = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    scene: WeatherScene,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.scene = scene;
    this.dark = document.documentElement.classList.contains('dark');
    this.lastScroll = window.scrollY;
    this.resize();
  }

  setScene(scene: WeatherScene) {
    const changed = scene.kind !== this.scene.kind || scene.night !== this.scene.night || scene.intensity !== this.scene.intensity;
    this.scene = scene;
    if (changed) this.build();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, this.w > 900 ? 2 : 1.75);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = `${this.w}px`;
    this.canvas.style.height = `${this.h}px`;
    // Nur hinter dem Inhalt – nicht hinter der (durchscheinenden) Seitenleiste
    const aside = document.querySelector('aside');
    const ar = aside?.getBoundingClientRect();
    this.x0 = ar && ar.width > 0 && getComputedStyle(aside!).display !== 'none' ? Math.round(ar.right) : 0;
    this.build();
  }

  /** Wolken und Sterne passend zu Szene, Fenstergröße und Hell/Dunkel neu anlegen */
  private build() {
    const { kind, night } = this.scene;
    const small = this.w < 700;
    const count = { clear: 0, partly: small ? 3 : 5, cloudy: small ? 6 : 10, rain: small ? 5 : 8, thunder: small ? 6 : 10, snow: small ? 4 : 7 }[kind];
    this.clouds = [];
    for (let i = 0; i < count; i++) {
      const depth = i / Math.max(1, count - 1); // 0 = weit weg, 1 = nah
      const w = (small ? rand(240, 420) : rand(380, 720)) * (0.75 + depth * 0.45);
      const h = w * 0.46;
      this.clouds.push({
        img: makeCloud(w, h, this.palette()),
        x: rand(this.x0 - w, this.w),
        y: Math.pow(Math.random(), 1.5) * this.h * 0.8 - h * 0.35,
        w,
        h,
        speed: rand(5, 9) + depth * 10,
        alpha: (kind === 'partly' ? 0.85 : 1) * (0.7 + depth * 0.3),
      });
    }
    this.clouds.sort((a, b) => a.speed - b.speed);
    this.stars = [];
    if (night && (kind === 'clear' || kind === 'partly')) {
      const n = Math.min(260, Math.round((this.w * this.h) / 6500));
      for (let i = 0; i < n; i++) {
        const bright = Math.random() < 0.08;
        this.stars.push({ x: rand(this.x0, this.w), y: Math.pow(Math.random(), 1.35) * this.h, r: bright ? rand(1.6, 2.3) : rand(0.5, 1.4), phase: rand(0, Math.PI * 2), speed: rand(0.6, 2.2) });
      }
    }
    if (kind !== 'rain' && kind !== 'thunder') this.drops = [];
    if (kind !== 'snow') {
      this.flakes = [];
      this.settled = [];
    }
    this.nextShoot = this.time + rand(2, 5);
    this.nextBolt = this.time + rand(1.5, 4);
  }

  private palette(): CloudPalette {
    const { kind, night } = this.scene;
    const storm = kind === 'thunder' || kind === 'rain';
    if (this.dark || night) {
      return storm ? { base: [96, 98, 128], shade: [30, 30, 52], alpha: 0.62 } : { base: [128, 132, 172], shade: [44, 44, 78], alpha: 0.5 };
    }
    return storm ? { base: [210, 210, 228], shade: [112, 110, 148], alpha: 1 } : { base: [252, 251, 255], shade: [136, 130, 188], alpha: 1 };
  }

  // ---------------------------------------------------------------
  // Kanten der Karten
  // ---------------------------------------------------------------
  private measure() {
    const out: Surface[] = [];
    for (const el of document.querySelectorAll<HTMLElement>(SURFACE_SELECTOR)) {
      const r = el.getBoundingClientRect();
      if (r.width < 40 || r.height < 24 || r.bottom < 0 || r.top > this.h) continue;
      let radius = this.radii.get(el);
      if (radius === undefined) {
        radius = Math.min(r.height / 2, parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0);
        this.radii.set(el, radius);
      }
      out.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, radius });
    }
    // Bergspitze über dem Countdown: Kontur aus dem freigestellten Bild
    const pop = document.querySelector<HTMLElement>('main .peak-pop');
    const img = pop?.querySelector('img');
    if (pop && img && img.complete && img.naturalWidth > 0) {
      const r = pop.getBoundingClientRect();
      if (r.bottom > 0 && r.top < this.h) {
        const data = this.peakProfile(pop, img, Math.round(r.width), Math.round(r.height));
        if (data) out.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom, radius: 0, profile: data });
      }
    }
    this.surfaces = out;
  }

  private peakProfile(pop: HTMLElement, img: HTMLImageElement, w: number, h: number): Float32Array | null {
    const left = parseFloat(img.style.left) || 0;
    const top = parseFloat(img.style.top) || 0;
    const iw = img.offsetWidth;
    const ih = img.offsetHeight;
    const key = `${w}x${h}|${left}|${top}|${iw}x${ih}|${img.currentSrc}`;
    if (this.peak?.key === key) return this.peak.data;
    if (w <= 0 || h <= 0) return null;
    try {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true })!;
      g.drawImage(img, left, top, iw, ih);
      const px = g.getImageData(0, 0, w, h).data;
      const data = new Float32Array(w).fill(Infinity);
      for (let x = 0; x < w; x++) {
        // nur der Teil über dem Fenster (die unteren 2 px überlappen die Kante)
        for (let y = 0; y < h - 2; y++) {
          if (px[(y * w + x) * 4 + 3] > 110) {
            data[x] = y;
            break;
          }
        }
      }
      this.peak = { key, data };
      void pop;
      return data;
    } catch {
      return null;
    }
  }

  private edgeAt(s: Surface, x: number): number {
    if (s.profile) {
      const v = s.profile[Math.round(x - s.left)];
      return v === undefined ? Infinity : s.top + v;
    }
    const d = Math.min(x - s.left, s.right - x);
    if (d < 0) return Infinity;
    if (d >= s.radius) return s.top;
    const k = s.radius - d;
    return s.top + s.radius - Math.sqrt(Math.max(0, s.radius * s.radius - k * k));
  }

  /** Trifft die Bahn y0→y1 bei x eine Kante? → y der Kante; hinter einer Karte → -1; sonst null */
  private hit(x: number, y0: number, y1: number): number | null {
    let best: number | null = null;
    for (const s of this.surfaces) {
      if (x < s.left || x > s.right) continue;
      const e = this.edgeAt(s, x);
      if (!Number.isFinite(e)) continue;
      if (y0 <= e && y1 >= e) {
        if (best === null || best < 0 || e < best) best = e;
      } else if (y0 > e && y0 < s.bottom && best === null) {
        best = -1; // fällt (z. B. nach dem Scrollen) hinter einer Karte – unsichtbar, entfernen
      }
    }
    return best;
  }

  // ---------------------------------------------------------------
  // Bild für Bild
  // ---------------------------------------------------------------
  frame(t: number) {
    const dt = this.lastT ? Math.min(0.05, (t - this.lastT) / 1000) : 0.016;
    this.lastT = t;
    this.time += dt;
    this.dark = document.documentElement.classList.contains('dark');
    const scroll = window.scrollY;
    const dScroll = scroll - this.lastScroll;
    this.lastScroll = scroll;
    // Spritzer und liegender Schnee kleben an den Karten → wandern beim Scrollen mit
    if (dScroll) {
      for (const p of this.particles) p.y -= dScroll;
      for (const r of this.ripples) r.y -= dScroll;
      for (const s of this.settled) s.y -= dScroll;
    }
    const { kind, night, intensity } = this.scene;
    const wet = kind === 'rain' || kind === 'thunder';
    if (wet || kind === 'snow') this.measure();

    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.x0, 0, this.w - this.x0, this.h);
    ctx.clip();
    if ((kind === 'cloudy' || kind === 'partly' || kind === 'snow') && !this.dark && !night) {
      // bedeckter Himmel: etwas grauer, damit sich die hellen Wolken abheben
      const g = ctx.createLinearGradient(0, 0, 0, this.h);
      g.addColorStop(0, `rgba(84, 84, 128, ${kind === 'partly' ? 0.05 : 0.09})`);
      g.addColorStop(1, 'rgba(84, 84, 128, 0.02)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
    }

    // Himmel: nachts im hellen Design leicht abdunkeln, bei Gewitter dunkler
    if (night && !this.dark) {
      const g = ctx.createLinearGradient(0, 0, 0, this.h * 0.75);
      g.addColorStop(0, 'rgba(36, 32, 92, 0.16)');
      g.addColorStop(1, 'rgba(36, 32, 92, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, this.w, this.h);
    }
    if (wet) {
      ctx.fillStyle = kind === 'thunder' ? (this.dark ? 'rgba(8, 8, 20, 0.28)' : 'rgba(40, 40, 72, 0.16)') : this.dark ? 'rgba(8, 8, 20, 0.14)' : 'rgba(60, 60, 100, 0.07)';
      ctx.fillRect(0, 0, this.w, this.h);
    }

    this.drawStars(dt);
    this.drawClouds(dt);
    if (kind === 'thunder') this.drawLightning(dt);
    if (wet) this.drawRain(dt, intensity * (kind === 'thunder' ? 1.35 : 1));
    if (kind === 'snow') this.drawSnow(dt, intensity);
    this.drawSplashes(dt);

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${this.flash * (this.dark ? 0.32 : 0.5)})`;
      ctx.fillRect(0, 0, this.w, this.h);
      this.flash = Math.max(0, this.flash - dt * 4.5);
    }
    ctx.restore();
  }

  private drawStars(dt: number) {
    if (!this.stars.length) return;
    const ctx = this.ctx;
    const base = this.dark ? '255, 255, 255' : '88, 78, 170';
    const dim = this.scene.kind === 'partly' ? 0.55 : 1;
    for (const s of this.stars) {
      const a = (0.45 + 0.55 * (0.5 + 0.5 * Math.sin(this.time * s.speed + s.phase))) * dim * (this.dark ? 0.9 : 0.6);
      ctx.fillStyle = `rgba(${base}, ${a.toFixed(3)})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
      if (s.r > 1.5) {
        // helle Sterne funkeln mit einem feinen Kreuz
        const l = s.r * (2.6 + 1.6 * Math.sin(this.time * s.speed + s.phase));
        ctx.strokeStyle = `rgba(${base}, ${(a * 0.55).toFixed(3)})`;
        ctx.lineWidth = 0.7;
        ctx.beginPath();
        ctx.moveTo(s.x - l, s.y);
        ctx.lineTo(s.x + l, s.y);
        ctx.moveTo(s.x, s.y - l);
        ctx.lineTo(s.x, s.y + l);
        ctx.stroke();
      }
    }
    // Sternschnuppe
    if (!this.shooting && this.time > this.nextShoot) {
      const dir = Math.random() < 0.5 ? -1 : 1;
      const speed = rand(700, 1000);
      const ang = rand(0.32, 0.6);
      this.shooting = { x: rand(this.x0 + (this.w - this.x0) * 0.15, this.w * 0.85), y: rand(0, this.h * 0.35), vx: Math.cos(ang) * speed * dir, vy: Math.sin(ang) * speed, len: rand(110, 210), life: 0, max: rand(0.7, 1.05) };
      this.nextShoot = this.time + rand(4, 10);
    }
    const sh = this.shooting;
    if (sh) {
      sh.life += dt;
      sh.x += sh.vx * dt;
      sh.y += sh.vy * dt;
      const k = sh.life / sh.max;
      const a = k < 0.15 ? k / 0.15 : 1 - (k - 0.15) / 0.85;
      const n = Math.hypot(sh.vx, sh.vy);
      const tx = sh.x - (sh.vx / n) * sh.len;
      const ty = sh.y - (sh.vy / n) * sh.len;
      const g = ctx.createLinearGradient(sh.x, sh.y, tx, ty);
      g.addColorStop(0, `rgba(${base}, ${Math.max(0, a).toFixed(3)})`);
      g.addColorStop(1, `rgba(${base}, 0)`);
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sh.x, sh.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      if (k >= 1) this.shooting = null;
    }
  }

  private drawClouds(dt: number) {
    const ctx = this.ctx;
    for (const c of this.clouds) {
      c.x += c.speed * dt;
      if (c.x > this.w + 20) {
        c.x = this.x0 - c.w - rand(0, 200);
        c.y = Math.pow(Math.random(), 1.5) * this.h * 0.8 - c.h * 0.35;
      }
      ctx.globalAlpha = c.alpha;
      ctx.drawImage(c.img, c.x, c.y, c.w, c.h);
    }
    ctx.globalAlpha = 1;
  }

  private drawRain(dt: number, strength: number) {
    const ctx = this.ctx;
    // Neue Tropfen (Anzahl nach Fensterbreite und Stärke)
    this.spawnAcc += this.w * 0.17 * strength * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      const vy = rand(950, 1350);
      this.drops.push({ x: rand(this.x0 - 40, this.w + 60), y: rand(-60, -10), vx: -vy * 0.07, vy, len: rand(12, 22) });
    }
    ctx.strokeStyle = this.dark ? 'rgba(200, 210, 255, 0.34)' : 'rgba(92, 100, 158, 0.38)';
    ctx.lineWidth = 1.1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    const keep: Drop[] = [];
    for (const d of this.drops) {
      const y0 = d.y;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      const hit = this.hit(d.x, y0, d.y);
      if (hit !== null) {
        if (hit >= 0) this.splash(d.x, hit, d.vy);
        continue;
      }
      if (d.y - d.len > this.h) continue;
      ctx.moveTo(d.x - d.vx * 0.018, d.y - d.len);
      ctx.lineTo(d.x, d.y);
      keep.push(d);
    }
    ctx.stroke();
    this.drops = keep;
  }

  private splash(x: number, y: number, vy: number) {
    this.ripples.push({ x, y, life: 0, max: rand(0.26, 0.38), size: rand(5, 9) });
    const n = Math.random() < 0.35 ? 0 : Math.round(rand(1, 3.4));
    for (let i = 0; i < n; i++) {
      const max = rand(0.25, 0.42);
      this.particles.push({ x, y: y - 1, vx: rand(-110, 110), vy: -rand(0.12, 0.22) * vy, life: 0, max, r: rand(0.7, 1.3) });
    }
    if (this.ripples.length > 400) this.ripples.splice(0, this.ripples.length - 400);
    if (this.particles.length > 700) this.particles.splice(0, this.particles.length - 700);
  }

  private drawSplashes(dt: number) {
    const ctx = this.ctx;
    const col = this.dark ? '210, 220, 255' : '92, 100, 158';
    // Ringe an der Kante (flache Ellipse)
    const ripples: Ripple[] = [];
    for (const r of this.ripples) {
      r.life += dt;
      const k = r.life / r.max;
      if (k >= 1) continue;
      ctx.strokeStyle = `rgba(${col}, ${((1 - k) * 0.55).toFixed(3)})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, 1 + r.size * k, 0.6 + 1.6 * k, 0, Math.PI, Math.PI * 2);
      ctx.stroke();
      ripples.push(r);
    }
    this.ripples = ripples;
    // Spritzer
    const parts: Particle[] = [];
    ctx.fillStyle = `rgba(${col}, 0.55)`;
    for (const p of this.particles) {
      p.life += dt;
      if (p.life >= p.max) continue;
      p.vy += 1500 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      ctx.globalAlpha = 1 - p.life / p.max;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      parts.push(p);
    }
    ctx.globalAlpha = 1;
    this.particles = parts;
    // Liegender Schnee
    const settled: Settled[] = [];
    for (const s of this.settled) {
      s.life -= dt;
      if (s.life <= 0) continue;
      ctx.globalAlpha = Math.min(1, s.life / 1.2);
      this.flakeDot(s.x, s.y, s.r);
      settled.push(s);
    }
    ctx.globalAlpha = 1;
    this.settled = settled.slice(-500);
  }

  private flakeDot(x: number, y: number, r: number) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = this.dark ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.95)';
    ctx.fill();
    if (!this.dark) {
      ctx.strokeStyle = 'rgba(120, 118, 170, 0.35)';
      ctx.lineWidth = 0.6;
      ctx.stroke();
    }
  }

  private drawSnow(dt: number, strength: number) {
    this.spawnAcc += this.w * 0.05 * strength * dt;
    while (this.spawnAcc >= 1) {
      this.spawnAcc -= 1;
      this.flakes.push({ x: rand(this.x0 - 20, this.w + 20), y: -8, vy: rand(38, 85), r: rand(1.4, 3.4), phase: rand(0, 6.28), sway: rand(10, 28) });
    }
    const keep: Flake[] = [];
    for (const f of this.flakes) {
      const y0 = f.y;
      f.y += f.vy * dt;
      f.x += Math.cos(this.time * 1.2 + f.phase) * f.sway * dt;
      const hit = this.hit(f.x, y0, f.y);
      if (hit !== null) {
        if (hit >= 0) this.settled.push({ x: f.x, y: hit - f.r * 0.6, r: f.r, life: rand(2.2, 4) });
        continue;
      }
      if (f.y - f.r > this.h) continue;
      this.flakeDot(f.x, f.y, f.r);
      keep.push(f);
    }
    this.flakes = keep;
  }

  private drawLightning(dt: number) {
    if (this.time > this.nextBolt) {
      this.flash = 1;
      if (Math.random() < 0.7) this.bolt = { paths: makeBolt(rand(this.x0 + (this.w - this.x0) * 0.1, this.w * 0.92), this.h * rand(0.45, 0.75)), life: 0.22 };
      // manchmal ein zweiter, kurzer Blitz gleich danach
      this.nextBolt = this.time + (Math.random() < 0.3 ? rand(0.18, 0.35) : rand(4, 10));
    }
    const b = this.bolt;
    if (!b) return;
    b.life -= dt;
    if (b.life <= 0) {
      this.bolt = null;
      return;
    }
    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha = Math.min(1, b.life / 0.12);
    ctx.shadowColor = 'rgba(196, 186, 255, 1)';
    ctx.shadowBlur = 18;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    b.paths.forEach((path, i) => {
      ctx.lineWidth = i === 0 ? 2.2 : 1.1;
      ctx.beginPath();
      path.forEach((p, j) => (j === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      ctx.stroke();
    });
    ctx.restore();
  }
}

// -----------------------------------------------------------------
// Bausteine
// -----------------------------------------------------------------
interface CloudPalette {
  base: [number, number, number];
  shade: [number, number, number];
  alpha: number;
}

/** Weiche Haufenwolke aus überlagerten Kugeln mit Licht oben und Schatten unten */
function makeCloud(w: number, h: number, pal: CloudPalette): HTMLCanvasElement {
  const s = 1; // Auflösung reicht – Wolken sind weich
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * s);
  c.height = Math.ceil(h * s);
  const g = c.getContext('2d')!;
  g.scale(s, s);
  const [r, gr, b] = pal.base;
  const puff = (x: number, y: number, rad: number, a: number) => {
    const grad = g.createRadialGradient(x, y - rad * 0.15, rad * 0.1, x, y, rad);
    grad.addColorStop(0, `rgba(${r}, ${gr}, ${b}, ${a})`);
    grad.addColorStop(0.62, `rgba(${r}, ${gr}, ${b}, ${a * 0.82})`);
    grad.addColorStop(1, `rgba(${r}, ${gr}, ${b}, 0)`);
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x, y, rad, 0, Math.PI * 2);
    g.fill();
  };
  const n = 8 + Math.floor(Math.random() * 5);
  const base = h * 0.7;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const rad = h * (0.2 + 0.26 * Math.sin(Math.PI * t)) * rand(0.85, 1.15);
    puff(w * (0.14 + 0.72 * t) + rand(-8, 8), base - rad * 0.45 + rand(-6, 6), rad, pal.alpha);
  }
  // Türme in der Mitte
  for (let i = 0; i < 3; i++) {
    const rad = h * rand(0.26, 0.38);
    puff(w * rand(0.3, 0.7), base - h * rand(0.3, 0.42), rad, pal.alpha);
  }
  // flacher Boden
  g.fillStyle = `rgba(${r}, ${gr}, ${b}, ${pal.alpha * 0.7})`;
  g.beginPath();
  g.ellipse(w * 0.5, base, w * 0.38, h * 0.12, 0, 0, Math.PI * 2);
  g.fill();
  // Licht und Schatten (nur auf der Wolke)
  g.globalCompositeOperation = 'source-atop';
  const [sr, sg, sb] = pal.shade;
  const shade = g.createLinearGradient(0, h * 0.15, 0, h);
  shade.addColorStop(0, `rgba(${sr}, ${sg}, ${sb}, 0)`);
  shade.addColorStop(0.5, `rgba(${sr}, ${sg}, ${sb}, 0.3)`);
  shade.addColorStop(1, `rgba(${sr}, ${sg}, ${sb}, 0.78)`);
  g.fillStyle = shade;
  g.fillRect(0, 0, w, h);
  return c;
}

/** Zackiger Blitz mit ein, zwei Verästelungen */
function makeBolt(x: number, toY: number): { x: number; y: number }[][] {
  const main: { x: number; y: number }[] = [{ x, y: -10 }];
  let cx = x;
  let cy = -10;
  while (cy < toY) {
    cy += rand(18, 42);
    cx += rand(-26, 26);
    main.push({ x: cx, y: cy });
  }
  const paths = [main];
  for (let k = 0; k < 2; k++) {
    const from = main[Math.floor(rand(2, main.length - 2))];
    if (!from) continue;
    const br: { x: number; y: number }[] = [from];
    let bx = from.x;
    let by = from.y;
    const dir = Math.random() < 0.5 ? -1 : 1;
    for (let i = 0; i < 4; i++) {
      by += rand(14, 30);
      bx += dir * rand(8, 26);
      br.push({ x: bx, y: by });
    }
    paths.push(br);
  }
  return paths;
}
