import { Routes } from '@angular/router';

import { AppChrome } from './components/app-chrome';

/**
 * Doc routes render inside the sidebar chrome; demo routes render outside it,
 * so a demo can be screen-recorded with no page furniture. Paths here mirror
 * `src/app/lib/nav-config.ts`.
 */
export const routes: Routes = [
  // Chrome-free IDE Simulator.
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
