/**
 * Voiceover muxing — mux the narration tracks onto the clips already in
 * `videos/`.
 *
 * `npm run record -- --shared-state` writes a silent clip; this puts the
 * narration on it without re-recording. Re-running is safe: the ffmpeg call
 * maps only the video stream out of the existing clip, so a second run
 * replaces the voiceover rather than layering a second track under it.
 *
 * Four pages carry a voiceover: Frontend Tools & Generative UI, Voice &
 * multimodal, Shared State and Threads.
 *
 * Three of the tracks are shared verbatim with the other Angular repos in this
 * workspace — `thread-angular.m4a`, `angular-frontendtoolsv1.71.m4a` and
 * `angular- voice and attachments.m4a`. Each narrates the CopilotKit concept
 * rather than the agent framework behind it, and all five Angular repos now run
 * the same handler for those three pages, so one recording fits them all.
 *
 * `sharedstate-botherror.m4a` is the exception and is this repo's own. Do not
 * "resync" it with the sibling repos: shared state fails differently on AG2
 * than on the backends they test, so it narrates a different clip.
 *
 * Every other clip stays silent and is skipped by the table below.
 *
 * ── Why the narration is normalised on the way in ──────────────────────────
 * These tracks are recorded quietly: measured end to end they land between
 * -27 and -36 LUFS, against the -16 LUFS a browser plays other web video at.
 * Muxed as-is the voiceover is present but 10-20 dB under everything else the
 * viewer watches that day, which is indistinguishable from a silent clip
 * without reaching for the volume slider — and it is exactly why the first
 * runs of this were reported as "the video has no audio". `loudnorm` measures
 * each track and applies a flat gain so every clip in a run comes out at the
 * same, audible level. It is two passes because a single-pass loudnorm
 * compresses dynamically and pumps on speech; measuring first lets the second
 * pass normalise linearly, which changes the level and nothing else.
 *
 * The ffmpeg call below pins output to the VIDEO's length, so a narration
 * longer than its clip is truncated rather than extending it. At 88s the
 * Frontend Tools track is the one to watch: that clip runs a little over two
 * minutes, so it fits, but it is the constraint to check first if a voiceover
 * ever cuts off mid-sentence.
 *
 * WebM carries only Vorbis or Opus, and the choice is not free: Windows Media
 * Player renders VP8 fine and has no Opus decoder, so an Opus track plays as
 * silence there with no error and no warning — which is how a correctly muxed
 * and correctly normalised clip still gets reported as "the video has no
 * audio". Loudness was only half that story. Vorbis is decoded by WMP and by
 * every browser, so it is what these are encoded with; it wants 48 kHz, hence
 * the explicit `aresample`. Missing ffmpeg is a skip, not a failure: a silent
 * demo still beats no demo.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RECORDER_DIR = path.dirname(fileURLToPath(import.meta.url));
const VIDEOS_DIR = path.join(RECORDER_DIR, 'videos');
const AUDIO_DIR = path.join(RECORDER_DIR, 'audio');

/**
 * Which audio track belongs to which video. `videoMatch` is matched against
 * the video filename, which carries the demo name
 * (e.g. `AG2-angular-08-Threads.webm`).
 *
 * The mapping is explicit rather than inferred from filenames, so a renamed
 * demo drops its voiceover visibly instead of quietly muxing it onto the wrong
 * clip. All four matches are unique across this repo's `videoName`s.
 *
 * @type {{ audioFile: string, videoMatch: string }[]}
 */
const AUDIO_TRACKS = [
  { audioFile: 'angular-frontendtoolsv1.71.m4a', videoMatch: 'FrontendToolsGenerativeUi' },
  { audioFile: 'angular- voice and attachments.m4a', videoMatch: 'VoiceMultimodal' },
  { audioFile: 'sharedstate-botherror.m4a', videoMatch: 'SharedState' },
  { audioFile: 'thread-angular.m4a', videoMatch: 'Threads' },
];

/** Web playback loudness. Matches what YouTube and the browser default to. */
const TARGET_I = -16;
const TARGET_TP = -1.5;
const TARGET_LRA = 11;

function hasFfmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Pass one: ask loudnorm what the track actually measures.
 *
 * Returns the filter string for pass two — linear when the measurement parsed,
 * and the plain single-pass filter when it did not. A track that cannot be
 * measured is still worth normalising dynamically; it is only the pumping that
 * is lost, not the audibility.
 */
function loudnormFilter(audioPath) {
  const base = `loudnorm=I=${TARGET_I}:TP=${TARGET_TP}:LRA=${TARGET_LRA}`;
  try {
    // loudnorm prints its JSON on stderr, after the encode log — and execSync
    // only ever hands back stdout, so the stream is folded in the shell rather
    // than piped. Reading stdout with stderr on 'pipe' returns null, which is
    // how the first cut of this silently fell back to single-pass on every run.
    const out = execSync(
      `ffmpeg -hide_banner -nostats -i "${audioPath}" -af ${base}:print_format=json -f null - 2>&1`,
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const json = out.slice(out.lastIndexOf('{'), out.lastIndexOf('}') + 1);
    const m = JSON.parse(json);
    const measured =
      `:measured_I=${m.input_i}:measured_LRA=${m.input_lra}` +
      `:measured_TP=${m.input_tp}:measured_thresh=${m.input_thresh}` +
      `:offset=${m.target_offset}:linear=true:print_format=summary`;
    console.log(
      `   📏 ${path.basename(audioPath)} measures ${m.input_i} LUFS → normalising to ${TARGET_I}.`,
    );
    return base + measured;
  } catch (err) {
    console.warn(
      `   ⚠️ Could not measure ${path.basename(audioPath)} (${err.message || err}); ` +
        `falling back to single-pass loudnorm.`,
    );
    return base;
  }
}

export function muxAudioFiles() {
  const tracks = AUDIO_TRACKS.filter((t) =>
    fs.existsSync(path.join(AUDIO_DIR, t.audioFile)),
  );
  if (tracks.length === 0) return;
  if (!fs.existsSync(VIDEOS_DIR)) return;

  if (!hasFfmpeg()) {
    console.log('ℹ️ [Audio Mux] ffmpeg not found in PATH; skipping (videos stay silent).');
    return;
  }

  const files = fs.readdirSync(VIDEOS_DIR);

  for (const track of tracks) {
    const audioPath = path.join(AUDIO_DIR, track.audioFile);
    const video = files.find(
      (f) => f.includes(track.videoMatch) && f.endsWith('.webm') && !f.startsWith('temp_'),
    );

    if (!video) {
      console.log(
        `ℹ️ [Audio Mux] No ${track.videoMatch} video in this run; skipping ${track.audioFile}.`,
      );
      continue;
    }

    const inputPath = path.join(VIDEOS_DIR, video);
    const tempPath = path.join(VIDEOS_DIR, `temp_${video}`);
    console.log(`\n🎵 [Audio Mux] Adding ${track.audioFile} to ${video}...`);

    try {
      // `apad` + `-shortest` together pin the output to the VIDEO's length.
      // `-shortest` alone would truncate: these narrations are shorter than the
      // clips they describe (29s of audio over a 76s Threads demo), so the bare
      // flag cut the demo off mid-scene. apad pads the track with silence and
      // -shortest then stops at the video, which also keeps a track that
      // overruns from extending the clip past its last frame.
      //
      // aresample sits between them because loudnorm runs its own internal
      // resampling and hands back 192 kHz, which libvorbis will not take.
      const filter = `${loudnormFilter(audioPath)},aresample=48000,apad`;
      execSync(
        `ffmpeg -y -i "${inputPath}" -i "${audioPath}" -c:v copy -c:a libvorbis -q:a 5 ` +
          `-filter:a "${filter}" -map 0:v:0 -map 1:a:0 -shortest "${tempPath}"`,
        { stdio: 'ignore' },
      );
      fs.copyFileSync(tempPath, inputPath);
      fs.unlinkSync(tempPath);
      console.log(`✅ [Audio Mux] Added audio to ${video}`);
    } catch (err) {
      console.warn(`⚠️ [Audio Mux] Could not mux ${track.audioFile}:`, err.message || err);
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    }
  }
}

muxAudioFiles();
