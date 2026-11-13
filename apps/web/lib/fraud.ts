'use client';

/**
 * Client-side anti-fraud signals (SEC-VOT-10). Collects a coarse device
 * fingerprint and lightweight behavioral counters, sent as request headers
 * (x-device-fp / x-fraud-behavior). The server stores only salted hashes —
 * these values are never persisted raw and never touch ballot records
 * (SEC-BAL-02). Everything here is best-effort: any failure yields no
 * header, never a broken request.
 */

const FP_KEY = 'vm_fp_v1';
const startedAt = typeof window !== 'undefined' ? Date.now() : 0;
let interactions = 0;
let listening = false;

function ensureListeners(): void {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) {
    window.addEventListener(ev, () => { interactions += 1; }, { passive: true });
  }
}

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function canvasHash(): string {
  try {
    const c = document.createElement('canvas');
    c.width = 240; c.height = 60;
    const g = c.getContext('2d');
    if (!g) return 'na';
    g.textBaseline = 'top';
    g.font = '16px Arial';
    g.fillStyle = '#f60';
    g.fillRect(10, 10, 80, 30);
    g.fillStyle = '#069';
    g.fillText('Votery·fp·☃·01', 12, 14);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = 'rgba(102,204,0,0.7)';
    g.fillText('Votery·fp·☃·01', 14, 16);
    return c.toDataURL().slice(-64);
  } catch {
    return 'na';
  }
}

function webglHash(): string {
  try {
    const c = document.createElement('canvas');
    const gl = (c.getContext('webgl') || c.getContext('experimental-webgl')) as WebGLRenderingContext | null;
    if (!gl) return 'na';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) : 'masked';
    const vendor = dbg ? String(gl.getParameter(dbg.UNMASKED_VENDOR_WEBGL)) : 'masked';
    return `${vendor}|${renderer}`.slice(0, 160);
  } catch {
    return 'na';
  }
}

function fontHash(): string {
  try {
    const fonts = ['monospace', 'sans-serif', 'serif', 'Arial', 'Courier New', 'Georgia', 'Times New Roman', 'Verdana', 'Trebuchet MS', 'Impact'];
    const test = 'mmmmmmmmmmlliWWW1234567890';
    const base = document.createElement('span');
    base.style.cssText = 'position:absolute;left:-9999px;font-size:72px';
    base.textContent = test;
    document.body.appendChild(base);
    const widths: Record<string, number> = {};
    for (const f of fonts) {
      base.style.fontFamily = f;
      widths[f] = Math.round(base.offsetWidth * 100) / 100;
    }
    base.style.fontFamily = 'monospace';
    const ref = base.offsetWidth;
    document.body.removeChild(base);
    // Bitmap: which fonts measure differently than monospace baseline.
    return fonts.map((f) => (widths[f] === ref ? '0' : '1')).join('');
  } catch {
    return 'na';
  }
}

async function audioHash(): Promise<string> {
  try {
    const Ctx = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
    if (!Ctx) return 'na';
    const ctx = new Ctx(1, 4410, 44100);
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = 1000;
    const comp = ctx.createDynamicsCompressor();
    osc.connect(comp);
    comp.connect(ctx.destination);
    osc.start(0);
    const buf = await ctx.startRendering();
    const data = buf.getChannelData(0);
    let acc = 0;
    for (let i = 0; i < Math.min(data.length, 2000); i += 7) acc = (acc * 31 + Math.round(data[i] * 1e6)) | 0;
    return String(acc);
  } catch {
    return 'na';
  }
}

/** Coarse, privacy-minimizing device fingerprint → stable per-session hash. */
export async function deviceFingerprint(): Promise<string | undefined> {
  if (typeof window === 'undefined') return undefined;
  try {
    const cached = sessionStorage.getItem(FP_KEY);
    if (cached) return cached;
    ensureListeners();
    const parts: Record<string, unknown> = {
      ua: navigator.userAgent,
      lang: navigator.language,
      langs: navigator.languages?.join(','),
      platform: navigator.platform,
      hw: navigator.hardwareConcurrency,
      mem: (navigator as unknown as { deviceMemory?: number }).deviceMemory,
      touch: navigator.maxTouchPoints,
      screen: [screen.width, screen.height, screen.colorDepth, window.devicePixelRatio],
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      tzOff: new Date().getTimezoneOffset(),
      cookie: navigator.cookieEnabled,
      dnt: navigator.doNotTrack,
      conn: (navigator as unknown as { connection?: { effectiveType?: string } }).connection?.effectiveType,
      canvas: canvasHash(),
      webgl: webglHash(),
      fonts: fontHash(),
      audio: await audioHash(),
    };
    const fp = (await sha256Hex(JSON.stringify(parts))).slice(0, 32);
    sessionStorage.setItem(FP_KEY, fp);
    return fp;
  } catch {
    return undefined;
  }
}

export function behaviorSnapshot(): { dwellMs: number; interactions: number } {
  return { dwellMs: Date.now() - startedAt, interactions };
}

/** Headers to merge into API calls. Never throws. */
export async function fraudHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  try {
    ensureListeners();
    const fp = await deviceFingerprint();
    if (fp) headers['x-device-fp'] = fp;
    headers['x-fraud-behavior'] = JSON.stringify(behaviorSnapshot());
  } catch {
    // best-effort
  }
  return headers;
}
