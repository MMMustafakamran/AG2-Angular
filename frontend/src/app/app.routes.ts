import { Routes } from '@angular/router';

import { AppChrome } from './components/app-chrome';

/**
 * Doc routes render inside the sidebar chrome; demo routes render outside it,
 * so a demo can be screen-recorded with no page furniture. Paths here mirror
 * `src/app/lib/nav-config.ts`.
 */
export const routes: Routes = [
  // Chrome-free IDE Simulator.
  // HARNESS: demo routes for WebMCP, Authentication, Sub-agents, Native generative UI.
  { path: 'webmcp/demo', loadComponent: () => import('./pages/demos').then((m) => m.WebmcpDemo) },
  { path: 'auth/demo', loadComponent: () => import('./pages/demos').then((m) => m.AuthDemo) },
  { path: 'subagents/demo', loadComponent: () => import('./pages/demos').then((m) => m.SubagentsDemo) },
  { path: 'generative-ui-components/demo', loadComponent: () => import('./pages/demos').then((m) => m.GenUiDemo) },
  // HARNESS: demo routes for the nine Components and surfaces pages (2026-11-09).
  { path: 'cmp-components/demo', loadComponent: () => import('./pages/demos').then((m) => m.CmpComponentsDemo) },
  { path: 'cmp-surfaces/demo', loadComponent: () => import('./pages/demos').then((m) => m.CmpSurfacesDemo) },
  { path: 'cmp-catalogs/demo', loadComponent: () => import('./pages/demos').then((m) => m.CmpCatalogsDemo) },
  { path: 'cmp-standard-catalog/demo', loadComponent: () => import('./pages/demos').then((m) => m.CmpStandardCatalogDemo) },
  { path: 'cmp-state-and-actions/demo', loadComponent: () => import('./pages/demos').then((m) => m.CmpStateAndActionsDemo) },
  { path: 'cmp-theming/demo', loadComponent: () => import('./pages/demos').then((m) => m.CmpThemingDemo) },
  { path: 'cmp-transports/demo', loadComponent: () => import('./pages/demos').then((m) => m.CmpTransportsDemo) },
  { path: 'cmp-markdown-mode/demo', loadComponent: () => import('./pages/demos').then((m) => m.CmpMarkdownModeDemo) },
  { path: 'cmp-from-a2ui/demo', loadComponent: () => import('./pages/demos').then((m) => m.CmpFromA2uiDemo) },
  {
    path: 'ide',
    loadComponent: () =>
      import('./pages/ide-view.component').then((m) => m.IdeViewComponent),
  },

  // Chrome-free demos.
  {
    path: 'quickstart/demo',
    loadComponent: () => import('./pages/demos').then((m) => m.QuickstartDemo),
  },
  {
    path: 'inspector/demo',
    loadComponent: () => import('./pages/demos').then((m) => m.InspectorDemo),
  },
  {
    path: 'chat-ui/demo',
    loadComponent: () => import('./pages/demos').then((m) => m.ChatUiDemo),
  },
  {
    path: 'frontend-tools-generative-ui/demo',
    loadComponent: () => import('./pages/demos').then((m) => m.ToolsDemo),
  },
  {
    path: 'a2ui/demo',
    loadComponent: () => import('./pages/demos').then((m) => m.A2uiDemo),
  },
  {
    path: 'voice-multimodal/demo',
    loadComponent: () => import('./pages/demos').then((m) => m.VoiceDemo),
  },
  {
    path: 'human-in-the-loop/demo',
    loadComponent: () => import('./pages/demos').then((m) => m.HitlDemo),
  },
  {
    path: 'shared-state/demo',
    loadComponent: () => import('./pages/demos').then((m) => m.SharedStateDemo),
  },
  {
    path: 'threads/demo',
    loadComponent: () => import('./pages/demos').then((m) => m.ThreadsDemo),
  },
  {
    path: 'memory/demo',
    loadComponent: () => import('./pages/demos').then((m) => m.MemoryDemo),
  },
  {
    path: 'attachments/demo',
    loadComponent: () => import('./pages/demos').then((m) => m.AttachmentsDemo),
  },
  {
    path: 'headless/demo',
    loadComponent: () => import('./pages/demos').then((m) => m.HeadlessDemo),
  },

  // Doc routes, inside the sidebar chrome.
  {
    path: '',
    component: AppChrome,
    children: [
      { path: '', loadComponent: () => import('./pages/introduction') },
      { path: 'quickstart', loadComponent: () => import('./pages/quickstart') },
      { path: 'inspector', loadComponent: () => import('./pages/inspector') },
      { path: 'chat-ui', loadComponent: () => import('./pages/chat-ui') },
      {
        path: 'frontend-tools-generative-ui',
        loadComponent: () => import('./pages/frontend-tools-generative-ui'),
      },
      { path: 'a2ui', loadComponent: () => import('./pages/a2ui') },
      {
        path: 'voice-multimodal',
        loadComponent: () => import('./pages/voice-multimodal'),
      },
      {
        path: 'human-in-the-loop',
        loadComponent: () => import('./pages/human-in-the-loop'),
      },
      {
        path: 'shared-state',
        loadComponent: () => import('./pages/shared-state'),
      },
      { path: 'threads', loadComponent: () => import('./pages/threads') },
      { path: 'memory', loadComponent: () => import('./pages/memory') },
      {
        path: 'attachments',
        loadComponent: () => import('./pages/attachments'),
      },
      { path: 'headless', loadComponent: () => import('./pages/headless') },
      { path: 'status', loadComponent: () => import('./pages/status') },
      { path: '**', redirectTo: '' },
    ],
  },
];
