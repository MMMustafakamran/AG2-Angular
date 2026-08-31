// frontend tools : register a browser tool (change_background) start
/**
 * The guide's `change_background` frontend tool.
 * https://docs.copilotkit.ai/angular/ag2/guides/frontend-tools-generative-ui
 *
 * `createBackgroundTool` is the guide's function, unchanged. Everything above
 * it is not in the guide: the snippet is quoted from the live Showcase without
 * its `BackgroundToolArgs` type, its `resolveGradient` helper, or its imports,
 * so those are defined here to make it runnable.
 */

import { type WritableSignal } from '@angular/core';
import { type FrontendToolConfig } from '@copilotkit/angular';
import { z } from 'zod';

/** Arguments the agent may send to `change_background`. */
export type BackgroundToolArgs = {
  background?: string;
  color?: string;
};

/** Named presets so the agent can ask for a look without writing CSS. */
const GRADIENT_PRESETS: Record<string, string> = {
  blue: 'linear-gradient(180deg, #0c4a6e 0%, #38bdf8 100%)',
  violet: 'linear-gradient(180deg, #4c1d95 0%, #c084fc 100%)',
  sunset: 'linear-gradient(180deg, #f97316 0%, #db2777 55%, #7c3aed 100%)',
  forest: 'linear-gradient(180deg, #14532d 0%, #4ade80 100%)',
  slate: 'linear-gradient(180deg, #0f172a 0%, #475569 100%)',
};

export const DEFAULT_BACKGROUND = GRADIENT_PRESETS['slate'];

/**
 * Accept a preset name, a bare CSS color, or a full gradient and always return
 * something safe to drop into a `background` style binding.
 */
export function resolveGradient(value: string | undefined): string {
  const raw = value?.trim();
  if (!raw) {
    return DEFAULT_BACKGROUND;
  }

  const preset = GRADIENT_PRESETS[raw.toLowerCase()];
  if (preset) {
    return preset;
  }

  return raw.includes('gradient(')
    ? raw
    : `linear-gradient(180deg, ${raw} 0%, ${raw} 100%)`;
}

/** Create the frontend tool that applies a requested CSS gradient. */
export function createBackgroundTool(
  background: WritableSignal<string>,
): FrontendToolConfig<BackgroundToolArgs> {
  return {
    name: 'change_background',
    description: 'Change the application background to a CSS gradient.',
    parameters: z.object({
      background: z.string().optional(),
      color: z.string().optional(),
    }),
    handler: async (args) => {
      const next = resolveGradient(args.background ?? args.color);
      background.set(next);
      return { background: next };
    },
  };
}
// frontend tools : register a browser tool (change_background) end
