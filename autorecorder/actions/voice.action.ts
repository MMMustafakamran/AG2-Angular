/**
 * Voice and multimodal input — the microphone is real, the transcription is not.
 *
 * https://docs.copilotkit.ai/angular/ag2/guides/voice-multimodal
 *
 * Three things have to be arranged before this page films as it behaves:
 *
 * 1. **The permission prompt.** Chrome's real one is browser chrome, outside the
 *    page, and Playwright suppresses it — a context grants or denies up front,
 *    so nothing was ever on screen and the mic click looked like it did nothing.
 *    The bubble here is drawn into the page, the same way this suite already
 *    draws the taskbar and VS Code. It is a prop, and the recording is honest
 *    about the sequence because the stream genuinely waits for the Allow click.
 *
 * 2. **A device.** The recording machine may have no microphone, and Chrome then
 *    rejects `getUserMedia` instantly — so the composer never entered its
 *    recording state and there was nothing to see. `getUserMedia` is wrapped to
 *    fall back to a synthesized stream, so the *UI* path is exercised for real
 *    even where the hardware is absent.
 *
 * 3. **The failure that is the actual finding.** Once recording stops, the
 *    composer posts the audio for transcription, and this runtime configures no
 *    transcription service — so that request fails by design. The Notepad note
 *    says so while it is on screen, and the turn is then completed by keyboard,
 *    so the video ends on a real agent reply rather than on an error.
 */
import { type Page } from 'playwright';

import { sendPrompt, waitForAgentResponseCompletion } from '../core/actions';
import { humanClick, humanGlide, sleep } from '../core/overlays/cursor';
import { type PageActionHandler, type PageRecordConfig } from '../core/types';

import { closeNotepadNote, showNotepadNote } from './notepad';

/**
 * Holds `getUserMedia` until the Allow click, then satisfies it — from the real
 * device if there is one, from an oscillator if there is not.
 */
async function armMicrophone(page: Page): Promise<void> {
  await page.evaluate(() => {
    const w = window as unknown as {
      __allowMic?: () => void;
      __micGate?: Promise<void>;
      __micArmed?: boolean;
      __micSynthetic?: boolean;
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
        return await original(constraints);
      } catch {
        // No input device on this machine. Synthesize one so the composer's
        // recording state is still exercised and still filmable.
        w.__micSynthetic = true;
        const ctx = new AudioContext();
        const dest = ctx.createMediaStreamDestination();
        const osc = ctx.createOscillator();
        osc.frequency.value = 220;
        osc.connect(dest);
        osc.start();
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

export const runVoiceAction: PageActionHandler = async (
  page: Page,
  config: PageRecordConfig,
) => {
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
  } else {
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

    // Recording is now live: rest on the composer so the recording state, the
    // elapsed timer and the stop control are all on screen for long enough to
    // read.
    const stopBtn = page
      .locator(
        'copilot-chat-finish-transcribe-button button, copilot-chat-cancel-transcribe-button button, ' +
          'button[aria-label*="Finish" i], button[aria-label*="Stop" i]',
      )
      .first();

    const recording = await stopBtn
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);

    const synthetic = await page
      .evaluate(() => (window as unknown as { __micSynthetic?: boolean }).__micSynthetic === true)
      .catch(() => false);

    console.log(
      recording
        ? `   🔴 Recording — stream is ${synthetic ? 'synthesized (no input device)' : 'from the real device'}.`
        : `   ⚠️ The composer never entered its recording state.`,
    );

    await humanGlide(page, micBox.x - 120, micBox.y + micBox.height / 2, 20);
    await sleep(4000);

    // Stopping is what posts the audio for transcription -- i.e. what fails.
    if (recording) {
      const stopBox = await stopBtn.boundingBox().catch(() => null);
      if (stopBox) {
        console.log(`   ⏹️ Stopping — this is the request that has no service behind it.`);
        await humanGlide(page, stopBox.x + stopBox.width / 2, stopBox.y + stopBox.height / 2, 20);
        await sleep(400);
        await humanClick(page);
        await sleep(3000);
      }
    }
  }

  await showNotepadNote(page, 'voice-notes.txt', [
    'voice / transcription',
    '',
    '- the microphone control renders, asks for permission and records',
    '- this Copilot Runtime configures no transcription service,',
    '  so the transcribe request fails — expected, not a defect',
    '- attachments on the same composer work: image/* and application/pdf',
    '',
    'note for the viewer: the permission bubble in this recording is drawn',
    'by the recorder. Chrome’s own prompt is browser chrome and Playwright',
    'suppresses it, so it could never appear in a captured video.',
  ]);
  await closeNotepadNote(page);
  await sleep(800);

  // Typed, not spoken — so the page still ends on a real agent reply.
  console.log(`   ⌨️ Falling back to the keyboard for the actual turn...`);
  const msgCount = await sendPrompt(page, config.prompt);
  await waitForAgentResponseCompletion(page, config.waitAfterPromptMs ?? 4000, msgCount);
};
