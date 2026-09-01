/**
 * A live input-level meter, drawn over the page.
 *
 * The Voice finding is "you speak and nothing arrives". That is invisible on
 * video: a microphone button in its recording state looks identical whether the
 * stream carries a voice or silence, which is exactly why the defect is easy to
 * miss and worth filming carefully. Without a meter the clip shows a red button
 * for eight seconds and then a claim, and the viewer has to take the claim on
 * trust.
 *
 * So this taps the very `MediaStream` the composer is recording, runs it
 * through an `AnalyserNode`, and paints the RMS level at 30fps next to a
 * silence threshold. A flat bar pinned to the floor while the caption says
 * "speaking" is the evidence. It is measured off the real stream, not
 * simulated — if audio ever did arrive, this meter would move, and the note
 * that follows reads the same measurement and would say so.
 *
 * Like `notepad.ts` and `finding-note.ts` this is framework-agnostic and
 * **belongs in `core/`**; it lives in `actions/` only because `core/` is
 * frozen.
 */
import { type Page } from 'playwright';

import { sleep } from '../core/overlays/cursor';

/** Below this RMS (0..1) the input is treated as silence. ~-60 dBFS. */
export const SILENCE_RMS = 0.001;

export interface MicLevelReading {
  /** Highest RMS seen across the whole observation window, 0..1. */
  peak: number;
  /** Mean RMS across the window, 0..1. */
  mean: number;
  /** Peak expressed in dBFS, floored at -100. */
  peakDb: number;
  /** True when the peak never rose above SILENCE_RMS. */
  silent: boolean;
  /** Whether the stream came from a real device or the synthesized fallback. */
  synthetic: boolean;
}

/**
 * Starts metering whatever stream `getUserMedia` most recently returned.
 *
 * `armMicrophone` in voice.action.ts stashes it on `window.__micStream`; if
 * nothing is there the meter still draws, reporting a hard zero, which is the
 * honest reading for "the composer never got a stream at all".
 */
export async function showMicLevelMeter(page: Page, caption: string): Promise<void> {
  await page.evaluate(
    ({ captionText, silenceRms }) => {
      const w = window as unknown as {
        __micStream?: MediaStream;
        __micMeterStop?: () => void;
        __micMeterPeak?: number;
        __micMeterSum?: number;
        __micMeterCount?: number;
      };

      document.getElementById('sim-mic-meter')?.remove();
      w.__micMeterPeak = 0;
      w.__micMeterSum = 0;
      w.__micMeterCount = 0;

      const panel = document.createElement('div');
      panel.id = 'sim-mic-meter';
      panel.style.cssText =
        'position:fixed!important;left:50%!important;top:96px!important;' +
        'transform:translateX(-50%)!important;width:560px!important;' +
        'background:rgba(17,17,20,0.96)!important;color:#f3f4f6!important;' +
        'border:1px solid rgba(255,255,255,0.14)!important;border-radius:12px!important;' +
        'box-shadow:0 20px 50px rgba(0,0,0,0.65)!important;z-index:2147483641!important;' +
        'font-family:"Segoe UI",system-ui,sans-serif!important;padding:16px 20px!important;' +
        'opacity:0!important;transition:opacity .25s ease!important;';

      panel.innerHTML = [
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;">',
        '  <span id="sim-mic-dot" style="width:11px;height:11px;border-radius:50%;background:#ef4444;box-shadow:0 0 0 0 rgba(239,68,68,.6);"></span>',
        '  <span style="font-size:13px;font-weight:600;letter-spacing:.2px;">Microphone input</span>',
        '  <span id="sim-mic-caption" style="margin-left:auto;font-size:12px;color:#fbbf24;font-weight:600;"></span>',
        '</div>',
        '<div style="position:relative;height:22px;background:#0b0b0d;border-radius:6px;overflow:hidden;border:1px solid rgba(255,255,255,0.08);">',
        '  <div id="sim-mic-bar" style="height:100%;width:0%;background:linear-gradient(90deg,#22c55e,#eab308,#ef4444);transition:width .06s linear;"></div>',
        // The silence threshold, drawn where it actually is, so "pinned to the
        // floor" is a position on a scale rather than an impression.
        '  <div style="position:absolute;left:6%;top:0;bottom:0;width:1px;background:rgba(255,255,255,0.45);"></div>',
        '</div>',
        '<div style="display:flex;justify-content:space-between;margin-top:8px;font-size:11.5px;font-family:Consolas,monospace;color:#9ca3af;">',
        '  <span id="sim-mic-db">-inf dBFS</span>',
        '  <span id="sim-mic-peak">peak -inf</span>',
        '  <span style="color:#6b7280;">silence threshold -60 dBFS</span>',
        '</div>',
      ].join('');

      document.documentElement.appendChild(panel);
      setTimeout(() => (panel.style.opacity = '1'), 30);

      const captionEl = panel.querySelector('#sim-mic-caption') as HTMLElement;
      const barEl = panel.querySelector('#sim-mic-bar') as HTMLElement;
      const dbEl = panel.querySelector('#sim-mic-db') as HTMLElement;
      const peakEl = panel.querySelector('#sim-mic-peak') as HTMLElement;
      const dotEl = panel.querySelector('#sim-mic-dot') as HTMLElement;

      captionEl.textContent = captionText;

      // Pulse the record dot, so the panel reads as live even when the bar is
      // not moving — otherwise a flat meter looks like a frozen overlay.
      let pulse = 0;
      const pulseTimer = window.setInterval(() => {
        pulse = (pulse + 1) % 2;
        dotEl.style.opacity = pulse ? '1' : '0.35';
      }, 550);

      const toDb = (rms: number) =>
        rms <= 0 ? -100 : Math.max(-100, 20 * Math.log10(rms));

      let raf = 0;
      const stream = w.__micStream;

      if (!stream) {
        // No stream at all. Report it as a hard zero rather than leaving the
        // meter blank, because "the composer never received a stream" is itself
        // a finding and must not read as "the meter failed".
        dbEl.textContent = 'no stream';
        peakEl.textContent = 'peak -inf';
      } else {
        const ctx = new AudioContext();
        const src = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        src.connect(analyser);
        const buf = new Float32Array(analyser.fftSize);

        const tick = () => {
          analyser.getFloatTimeDomainData(buf);
          let sum = 0;
          for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
          const rms = Math.sqrt(sum / buf.length);

          w.__micMeterPeak = Math.max(w.__micMeterPeak ?? 0, rms);
          w.__micMeterSum = (w.__micMeterSum ?? 0) + rms;
          w.__micMeterCount = (w.__micMeterCount ?? 0) + 1;

          // Log scale, floored at -60 dBFS so the silence threshold sits at 6%
          // and near-silence is visibly distinct from actual zero.
          const db = toDb(rms);
          const pct = Math.max(0, Math.min(100, ((db + 60) / 60) * 100));
          barEl.style.width = `${pct}%`;
          dbEl.textContent = rms > 0 ? `${db.toFixed(1)} dBFS` : '-inf dBFS';
          const pk = w.__micMeterPeak ?? 0;
          peakEl.textContent = pk > 0 ? `peak ${toDb(pk).toFixed(1)}` : 'peak -inf';

          raf = requestAnimationFrame(tick);
        };
        tick();
      }

      w.__micMeterStop = () => {
        if (raf) cancelAnimationFrame(raf);
        window.clearInterval(pulseTimer);
      };
    },
    { captionText: caption, silenceRms: SILENCE_RMS },
  );

  await sleep(400);
}

/** Updates the caption without disturbing the meter — e.g. "speaking now". */
export async function setMicCaption(page: Page, caption: string): Promise<void> {
  await page.evaluate((text) => {
    const el = document.getElementById('sim-mic-caption');
    if (el) el.textContent = text;
  }, caption);
}

/** Stops metering and returns what was observed across the whole window. */
export async function readMicLevel(page: Page): Promise<MicLevelReading> {
  const raw = await page.evaluate(() => {
    const w = window as unknown as {
      __micMeterStop?: () => void;
      __micMeterPeak?: number;
      __micMeterSum?: number;
      __micMeterCount?: number;
      __micSynthetic?: boolean;
    };
    w.__micMeterStop?.();
    const count = w.__micMeterCount ?? 0;
    return {
      peak: w.__micMeterPeak ?? 0,
      mean: count > 0 ? (w.__micMeterSum ?? 0) / count : 0,
      synthetic: w.__micSynthetic === true,
    };
  });

  return {
    ...raw,
    peakDb: raw.peak <= 0 ? -100 : Math.max(-100, 20 * Math.log10(raw.peak)),
    silent: raw.peak < SILENCE_RMS,
  };
}

/** Fades the meter out. */
export async function hideMicLevelMeter(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as { __micMeterStop?: () => void };
    w.__micMeterStop?.();
    const el = document.getElementById('sim-mic-meter');
    if (!el) return;
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 300);
  });
  await sleep(350);
}
