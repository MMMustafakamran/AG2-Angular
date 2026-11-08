/**
 * Which handler serves which page id. Pages not listed here use runStandardAction
 * (send the page's prompt, wait for the reply).
 */
import { type ActionContext, type PageActionHandler, type PageRecordConfig } from '../core/types';
import { runStandardAction } from '../core/actions';
import { type Page } from 'playwright';

import { waitForPageReady } from './page-ready';
import {
  runA2uiAction,
  runFrontendToolsAction,
  runGenUiAction,
  runHitlAction,
  runInspectorAction,
  runQuickstartAction,
  runSharedStateAction,
  runSubagentsAction,
  runVoiceAction,
} from './ag2.actions';

/** Keys are page ids from `config/pages.config.ts`. Doctor flags any orphans. */
export const ACTION_MAP: Record<string, PageActionHandler> = {
  quickstart: runQuickstartAction,
  'frontend-tools-generative-ui': runFrontendToolsAction,
  'generative-ui-components': runGenUiAction,
  a2ui: runA2uiAction,
  'voice-multimodal': runVoiceAction,
  'human-in-the-loop': runHitlAction,
  'shared-state': runSharedStateAction,
  'multi-agent-subagents': runSubagentsAction,
  inspector: runInspectorAction,
};

export async function executePageAction(
  page: Page,
  config: PageRecordConfig,
  rootPath: string,
  ctx: ActionContext,
): Promise<void> {
  // ng serve loads lazy route chunks on demand, so markup can be on screen before it is wired.
  await waitForPageReady(page, { label: config.id });

  const handler = ACTION_MAP[config.id] ?? runStandardAction;
  await handler(page, config, rootPath, ctx);
}
