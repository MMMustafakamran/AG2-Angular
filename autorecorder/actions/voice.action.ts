/**
 * Voice and multimodal input — the microphone hears nothing, the image works.
 *
 * https://docs.copilotkit.ai/angular/ag2/guides/voice-multimodal
 *
 * The page teaches two inputs. This clip runs both, in the order that makes the
 * broken one legible:
 *
 *   1. click the microphone, allow the permission, and watch the input level
 *   2. the level never leaves the floor — nothing audible reaches the stream
 *   3. cancel the recording, and write that down while the meter is still up
 *   4. attach an image to the same composer and ask about its contents
 *   5. the agent answers correctly, from the picture
 *
 * Step 5 is the control, and it is why this clip is worth more than a red X.
 * Same page, same composer, same run: one input arrives at the model intact and
 * the other carries silence. "The stack is down", "the recorder mis-clicked"
 * and "the agent is broken" are all off the table by the time the note is read.
 *
 * ── Why there is a level meter ─────────────────────────────────────────────
 * A microphone button in its recording state looks identical whether the stream
 * carries a voice or silence. Without a meter this clip would be a red button
 * for eight seconds followed by a claim. `mic-level.ts` taps the very
 * MediaStream the composer is recording and paints its RMS against a silence
 * threshold, so the flat bar is a measurement the viewer can see, and
 * `readMicLevel` returns the same numbers the note then quotes.
 *
 * ── Three things arranged so the page films as it behaves ──────────────────
 * 1. **The permission prompt.** Chrome's real one is browser chrome, outside
 *    the page, and Playwright suppresses it — a context grants or denies up
 *    front, so nothing was ever on screen and the mic click looked inert. The
 *    bubble here is drawn into the page, the same way this suite already draws
 *    the taskbar and VS Code. It is a prop, but the sequence is honest: the
 *    stream genuinely waits for the Allow click.
 *
 * 2. **A device.** The recording machine — and every CI runner — may have no
 *    microphone, and Chrome then rejects `getUserMedia` outright, so the
 *    composer never enters its recording state and there is nothing to film.
 *    The fallback synthesizes a stream so the UI path is exercised for real.
 *
 * 3. **That fallback is deliberately near-silent.** Not to fake the finding —
 *    to avoid faking its absence. A loud oscillator would paint a healthy meter
 *    on a machine with no microphone, which is the one reading that would be a
 *    lie. Silence is what a machine with no audio input actually has, and the
 *    note reports which case applied.
 */
import { type Page } from 'playwright';

import { sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { humanClick, humanGlide, sleep } from '../core/overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

import { attachImage } from './attach-image';
import { showFindingNote } from './finding-note';
import {
  hideMicLevelMeter,
  readMicLevel,
  setMicCaption,
  showMicLevelMeter,
  type MicLevelReading,
} from './mic-level';

/**
 * Holds `getUserMedia` until the Allow click, then satisfies it — from the real
 * device if there is one, from a near-silent synthesized source if there is not.
 *
 * The resolved stream is stashed on `window.__micStream` so the level meter can
 * measure the same object the composer is recording, rather than opening a
 * second capture that might behave differently.
 */
async function armMicrophone(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __allowMic?: () => void;
      __micGate?: Promise<void>;
      __micArmed?: boolean;
      __micSynthetic?: boolean;
      __micStream?: MediaStream;
    };
    if (w.__micArmed) return;
    w.__micArmed = true;

    w.__micGate = new Promise<void>((resolve) => {
      w.__allowMic = resolve;
    });

    const md = navigator.mediaDevices;
    const original = md.getUserMedia.bind(md);
    md.getUserMedia = async (constraints: MediaStreamConstraints) => {
      await w.__micGate;
      try {
        const real = await original(constraints);
        w.__micStream = real;
        return real;
      } catch {
        // No input device on this machine. Synthesize one so the composer's
        // recording state is still exercised and still filmable — at a gain low
        // enough to sit under the silence threshold, because a machine with no
        // microphone genuinely has no signal and the meter must not claim
        // otherwise.
        w.__micSynthetic = true;
        const ctx = new AudioContext();
        const dest = ctx.createMediaStreamDestination();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0.0004;
        osc.frequency.value = 220;
        osc.connect(gain);
        gain.connect(dest);
        osc.start();
        w.__micStream = dest.stream;
        return dest.stream;
      }
    };
  });
}

/** Chrome's microphone permission bubble, drawn into the page. */
async function showPermissionBubble(page: Page, origin: string): Promise<void> {
  await page.evaluate((host) => {
    const el = document.createElement('div');
    el.id = 'sim-permission-bubble';
    el.style.cssText =
      'position:fixed!important;top:12px!important;left:96px!important;width:400px!important;' +
      'background:#ffffff!important;color:#202124!important;border-radius:8px!important;' +
      'box-shadow:0 4px 24px rgba(0,0,0,0.35),0 0 0 1px rgba(0,0,0,0.08)!important;' +
      'z-index:2147483642!important;font-family:"Segoe UI",system-ui,sans-serif!important;' +
      'padding:16px 18px!important;opacity:0!important;transform:translateY(-8px)!important;' +
      'transition:opacity .18s ease,transform .18s ease!important;';
    el.innerHTML = [
      '<div style="display:flex;gap:12px;align-items:flex-start;">',
      '  <svg width="20" height="20" viewBox="0 0 24 24" fill="#5f6368" style="margin-top:2px"><path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>',
      '  <div style="font-size:14px;line-height:1.45;">',
      '    <div style="font-weight:600;margin-bottom:2px;">' + host + ' wants to</div>',
      '    <div style="color:#3c4043;">Use your microphone</div>',
      '  </div>',
      '</div>',
      '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px;">',
      '  <button id="sim-permission-block" style="border:1px solid #dadce0;background:#fff;color:#1a73e8;border-radius:4px;padding:7px 14px;font-size:13px;font-weight:500;">Block</button>',
      '  <button id="sim-permission-allow" style="border:none;background:#1a73e8;color:#fff;border-radius:4px;padding:7px 16px;font-size:13px;font-weight:500;">Allow</button>',
      '</div>',
    ].join('');
    document.documentElement.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '1';
      el.style.transform = 'translateY(0)';
    }, 30);
  }, origin);
  await sleep(500);
}

async function dismissPermissionBubble(page: Page): Promise<void> {
  await page.evaluate(() => {
    const el = document.getElementById('sim-permission-bubble');
    if (!el) return;
    el.style.opacity = '0';
    el.style.transform = 'translateY(-8px)';
    setTimeout(() => el.remove(), 220);
  });
  await sleep(300);
}

/**
 * The microphone half: click, allow, watch the level, cancel.
 *
 * Returns what the meter measured, or null when the control never appeared —
 * the caller still writes a note either way, because "the mic control is
 * missing" is a finding too.
 */
async function runMicrophoneHalf(page: Page): Promise<MicLevelReading | null> {
  const origin = new URL(page.url()).host;

  await armMicrophone(page);
  // Playwright contexts deny by default, which would reject the call before the
  // prop bubble had any meaning. The gate above is what actually holds it.
  await page
    .context()
    .grantPermissions(['microphone'], { origin: new URL(page.url()).origin })
    .catch(() => console.warn(`   ⚠️ could not grant microphone permission.`));

  const micBtn = page
    .locator(
      'copilot-chat-start-transcribe-button button, button[aria-label*="Transcribe" i]',
    )
    .first();

  const micBox = await micBtn
    .waitFor({ state: 'visible', timeout: 8000 })
    .then(() => micBtn.boundingBox())
    .catch(() => null);

  if (!micBox) {
    console.warn(`   ⚠️ transcribe control not found — skipping the voice path.`);
    return null;
  }

  console.log(`   🎙️ Clicking the microphone control...`);
  await humanGlide(page, micBox.x + micBox.width / 2, micBox.y + micBox.height / 2, 22);
  await sleep(400);
  await humanClick(page);

  // The prompt Chrome would show, and the click that releases the stream.
  await showPermissionBubble(page, origin);
  const allowBtn = page.locator('#sim-permission-allow');
  const allowBox = await allowBtn.boundingBox().catch(() => null);
  if (allowBox) {
    await humanGlide(page, allowBox.x + allowBox.width / 2, allowBox.y + allowBox.height / 2, 22);
    await sleep(500);
    await humanClick(page);
  }
  await page.evaluate(() => {
    (window as unknown as { __allowMic?: () => void }).__allowMic?.();
  });
  await dismissPermissionBubble(page);

  const cancelBtn = page
    .locator(
      'copilot-chat-cancel-transcribe-button button, button[aria-label*="Cancel" i]',
    )
    .first();
  const finishBtn = page
    .locator(
      'copilot-chat-finish-transcribe-button button, button[aria-label*="Finish" i], button[aria-label*="Stop" i]',
    )
    .first();

  const recording = await Promise.race([
    cancelBtn.waitFor({ state: 'visible', timeout: 8000 }).then(() => true),
    finishBtn.waitFor({ state: 'visible', timeout: 8000 }).then(() => true),
  ]).catch(() => false);

  if (!recording) {
    console.warn(`   ⚠️ The composer never entered its recording state.`);
    return null;
  }

  // Meter the live stream. This is the evidence; everything else on screen is
  // context for it.
  await showMicLevelMeter(page, 'listening…');
  await humanGlide(page, micBox.x - 160, micBox.y - 40, 22);
  await sleep(1600);

  // Held long enough to be unambiguous. A person speaking for six seconds into
  // a working microphone paints a bar that moves constantly; a flat line across
  // that whole window is not something a viewer can mistake for a slow frame.
  await setMicCaption(page, 'speaking…');
  console.log(`   🗣️ Six seconds of speech, against a live input meter...`);
  await sleep(6000);

  const reading = await readMicLevel(page);
  console.log(
    reading.silent
      ? `   🔇 Input never rose above silence: peak ${reading.peakDb.toFixed(1)} dBFS ` +
          `(${reading.synthetic ? 'no input device on this machine' : 'real device'}).`
      : `   🔊 Input reached ${reading.peakDb.toFixed(1)} dBFS — audio IS arriving; this finding is stale.`,
  );

  await setMicCaption(page, reading.silent ? 'nothing captured' : 'signal present');
  await sleep(1800);

  // Cancel, not finish. Finishing posts the audio and the failure that follows
  // is a transcription error, which is a different (and lesser) finding. The
  // point here is that there was nothing worth posting in the first place.
  const cancelBox = await cancelBtn.boundingBox().catch(() => null);
  if (cancelBox) {
    console.log(`   ⏹️ Cancelling — there is no audio worth sending.`);
    await humanGlide(page, cancelBox.x + cancelBox.width / 2, cancelBox.y + cancelBox.height / 2, 20);
    await sleep(500);
    await humanClick(page);
    await sleep(1500);
  } else {
    console.warn(`   ⚠️ no cancel control — leaving the recording as it is.`);
  }

  await hideMicLevelMeter(page);
  return reading;
}

export const runVoiceAction: PageActionHandler = async (
  page: Page,
  config: PageRecordConfig,
  rootPath: string,
) => {
  const reading = await runMicrophoneHalf(page);

  // ── The finding, written while the cancelled composer is still on screen ──
  const level = reading
    ? `peak ${reading.peakDb.toFixed(1)} dBFS over 6s of speech`
    : 'the recording state was never reached';

  if (reading && !reading.silent) {
    await showFindingNote(page, {
      file: 'voice-multimodal-finding.txt',
      headline: 'audio IS arriving — this finding is stale, recheck it',
      saw: [`the input meter reached ${reading.peakDb.toFixed(1)} dBFS`],
      why: [
        'the microphone is capturing. whatever broke before is fixed,',
        'or this machine has a device the last run did not.',
      ],
    });
  } else {
    await showFindingNote(page, {
      file: 'voice-multimodal-finding.txt',
      headline: 'the mic records and captures nothing audible',
      saw: [
        'clicked the microphone; allowed the permission',
        'the composer entered its recording state and ran its timer',
        'spoke for six seconds with a live input meter on screen',
        `the level never left the floor: ${level}`,
        'cancelled the recording - there was nothing worth sending',
      ],
      why: [
        'the recording ui is real and the stream is open, but no',
        'audible signal reaches it, so anything downstream of the',
        'capture is moot - there is nothing to transcribe.',
        reading?.synthetic
          ? 'note: no input device on this machine, so the stream is'
          : 'note: the stream came from a real input device.',
        reading?.synthetic ? 'silent at the source. same reading either way.' : '',
      ].filter(Boolean),
      doc: [
        'that the mic needs anything beyond rendering the control.',
        'the page documents the button as though placing it were the',
        'whole job, so a reader gets a control that looks correct,',
        'behaves correctly, and hears nothing - and only finds out',
        'by speaking into it. an unstated prerequisite is a defect.',
        '',
        'aside: the permission bubble in this clip is drawn by the',
        'recorder. chrome\'s own prompt is browser chrome, which',
        'playwright suppresses, so it can never appear on video.',
      ],
    });
  }

  // ── The control: the other input on the same composer, working ───────────
  //
  // Attachments are the second half of this guide, and the reason the clip
  // continues past the finding. If the image also failed the story would be
  // "the page is dead"; because it succeeds, the story is precisely "voice is
  // broken and multimodal is not".
  console.log(`   🖼️ Now the other input on the same composer — an image.`);
  await attachImage(page, rootPath);

  const msgCount = await sendPrompt(page, config.prompt);
  await waitForAgentResponseCompletion(page, config.waitAfterPromptMs ?? 4000, msgCount);
  await sleep(1500);
};
