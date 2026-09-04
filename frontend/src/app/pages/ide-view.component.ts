import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SOURCES, readSource } from '../lib/generated-sources';

@Component({
  selector: 'app-ide-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex h-screen w-screen overflow-hidden bg-[#1e1e1e] text-[#cccccc] font-sans text-xs select-none">
      <!-- Activity Bar -->
      <div class="flex w-12 flex-col items-center justify-between border-r border-[#2b2b2b] bg-[#333333] py-2 text-[#858585]">
        <div class="flex flex-col items-center gap-4">
          <button class="text-white hover:text-white" title="Explorer">
            <svg class="h-6 w-6 fill-current" viewBox="0 0 24 24">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 14H7v-2h7v2zm3-4H7v-2h10v2zm0-4H7V7h10v2z"/>
            </svg>
          </button>
          <button class="hover:text-white" title="Search">
            <svg class="h-5 w-5 fill-current" viewBox="0 0 24 24">
              <path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
          </button>
          <button class="hover:text-white" title="Source Control">
            <svg class="h-5 w-5 fill-current" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.1-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z"/>
            </svg>
          </button>
        </div>
        <div class="flex flex-col items-center gap-3">
          <div class="h-2 w-2 rounded-full bg-blue-500" title="Copilot Active"></div>
          <button class="hover:text-white" title="Settings">
            <svg class="h-5 w-5 fill-current" viewBox="0 0 24 24">
              <path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Primary Sidebar (Explorer) -->
      <div class="flex w-64 flex-col border-r border-[#2b2b2b] bg-[#252526]">
        <div class="flex h-9 items-center justify-between px-4 text-[11px] font-bold tracking-wider text-[#bbbbbb]">
          <span>EXPLORER</span>
          <span class="text-xs text-[#858585]">...</span>
        </div>
        <div class="px-2 py-1 text-[11px] font-semibold text-[#c5c5c5] flex items-center gap-1">
          <svg class="h-3 w-3 fill-current" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5z"/></svg>
          <span>AG2-ANGULAR</span>
        </div>
        <div class="flex-1 overflow-y-auto px-2 py-1 text-xs">
          <!-- Folders & Files Explorer -->
          <div class="space-y-0.5">
            <!-- backend folder -->
            <div class="flex items-center gap-1.5 py-0.5 px-2 text-[#cccccc] hover:bg-[#2a2d2e] rounded cursor-pointer">
              <span class="text-[#e8ba36]">📁</span>
              <span class="font-medium">backend</span>
            </div>
            <div class="pl-4 space-y-0.5">
              <div 
                class="flex items-center gap-1.5 py-0.5 px-2 rounded cursor-pointer hover:bg-[#2a2d2e]"
                [class.bg-[#37373d]]="currentFile().includes('main.py')"
                [class.text-white]="currentFile().includes('main.py')"
                (click)="selectFile('../backend/main.py', 37)"
              >
                <span class="text-[#3572A5]">🐍</span>
                <span>main.py</span>
              </div>
              <div 
                class="flex items-center gap-1.5 py-0.5 px-2 rounded cursor-pointer hover:bg-[#2a2d2e]"
                [class.bg-[#37373d]]="currentFile().includes('pyproject.toml')"
                [class.text-white]="currentFile().includes('pyproject.toml')"
                (click)="selectFile('../backend/pyproject.toml', 1)"
              >
                <span class="text-[#999999]">⚙️</span>
                <span>pyproject.toml</span>
              </div>
            </div>

            <!-- frontend folder -->
            <div class="flex items-center gap-1.5 py-0.5 px-2 text-[#cccccc] hover:bg-[#2a2d2e] rounded cursor-pointer">
              <span class="text-[#e8ba36]">📁</span>
              <span class="font-medium">frontend</span>
            </div>
            <div class="pl-4 space-y-0.5">
              <div 
                class="flex items-center gap-1.5 py-0.5 px-2 rounded cursor-pointer hover:bg-[#2a2d2e]"
                [class.bg-[#37373d]]="currentFile() === 'server.ts'"
                [class.text-white]="currentFile() === 'server.ts'"
                (click)="selectFile('server.ts', 33)"
              >
                <span class="text-[#3178c6] font-bold">TS</span>
                <span>server.ts</span>
              </div>
              <div 
                class="flex items-center gap-1.5 py-0.5 px-2 rounded cursor-pointer hover:bg-[#2a2d2e]"
                [class.bg-[#37373d]]="currentFile() === 'src/app/app.config.ts'"
                [class.text-white]="currentFile() === 'src/app/app.config.ts'"
                (click)="selectFile('src/app/app.config.ts', 51)"
              >
                <span class="text-[#3178c6] font-bold">TS</span>
                <span>app.config.ts</span>
              </div>
              <div 
                class="flex items-center gap-1.5 py-0.5 px-2 rounded cursor-pointer hover:bg-[#2a2d2e]"
                [class.bg-[#37373d]]="currentFile() === 'src/styles.css'"
                [class.text-white]="currentFile() === 'src/styles.css'"
                (click)="selectFile('src/styles.css', 1)"
              >
                <span class="text-[#563d7c]">#</span>
                <span>styles.css</span>
              </div>

              <!-- features folder -->
              <div class="flex items-center gap-1.5 py-0.5 px-1 text-[#cccccc] hover:bg-[#2a2d2e] rounded cursor-pointer">
                <span class="text-[#e8ba36]">📁</span>
                <span>features</span>
              </div>
              <div class="pl-3 space-y-0.5">
                <div 
                  class="flex items-center gap-1.5 py-0.5 px-2 rounded cursor-pointer hover:bg-[#2a2d2e]"
                  [class.bg-[#37373d]]="currentFile().includes('quickstart-chat')"
                  [class.text-white]="currentFile().includes('quickstart-chat')"
                  (click)="selectFile('src/app/features/quickstart/quickstart-chat.ts', 1)"
                >
                  <span class="text-[#3178c6]">TS</span>
                  <span>quickstart-chat.ts</span>
                </div>
                <div 
                  class="flex items-center gap-1.5 py-0.5 px-2 rounded cursor-pointer hover:bg-[#2a2d2e]"
                  [class.bg-[#37373d]]="currentFile().includes('chat-ui-demo')"
                  [class.text-white]="currentFile().includes('chat-ui-demo')"
                  (click)="selectFile('src/app/features/chat-ui/chat-ui-demo.component.ts', 28)"
                >
                  <span class="text-[#3178c6]">TS</span>
                  <span>chat-ui-demo.component.ts</span>
                </div>
                <div 
                  class="flex items-center gap-1.5 py-0.5 px-2 rounded cursor-pointer hover:bg-[#2a2d2e]"
                  [class.bg-[#37373d]]="currentFile().includes('tools-chat')"
                  [class.text-white]="currentFile().includes('tools-chat')"
                  (click)="selectFile('src/app/features/tools/tools-chat.component.ts', 61)"
                >
                  <span class="text-[#3178c6]">TS</span>
                  <span>tools-chat.component.ts</span>
                </div>
                <div 
                  class="flex items-center gap-1.5 py-0.5 px-2 rounded cursor-pointer hover:bg-[#2a2d2e]"
                  [class.bg-[#37373d]]="currentFile().includes('hitl-chat')"
                  [class.text-white]="currentFile().includes('hitl-chat')"
                  (click)="selectFile('src/app/features/hitl/hitl-chat.component.ts', 19)"
                >
                  <span class="text-[#3178c6]">TS</span>
                  <span>hitl-chat.component.ts</span>
                </div>
                <div 
                  class="flex items-center gap-1.5 py-0.5 px-2 rounded cursor-pointer hover:bg-[#2a2d2e]"
                  [class.bg-[#37373d]]="currentFile().includes('shared-state-chat')"
                  [class.text-white]="currentFile().includes('shared-state-chat')"
                  (click)="selectFile('src/app/features/shared-state/shared-state-chat.component.ts', 16)"
                >
                  <span class="text-[#3178c6]">TS</span>
                  <span>shared-state-chat.component.ts</span>
                </div>
                <div 
                  class="flex items-center gap-1.5 py-0.5 px-2 rounded cursor-pointer hover:bg-[#2a2d2e]"
                  [class.bg-[#37373d]]="currentFile().includes('media-chat')"
                  [class.text-white]="currentFile().includes('media-chat')"
                  (click)="selectFile('src/app/features/attachments/media-chat.component.ts', 16)"
                >
                  <span class="text-[#3178c6]">TS</span>
                  <span>media-chat.component.ts</span>
                </div>
                <div 
                  class="flex items-center gap-1.5 py-0.5 px-2 rounded cursor-pointer hover:bg-[#2a2d2e]"
                  [class.bg-[#37373d]]="currentFile().includes('voice-chat')"
                  [class.text-white]="currentFile().includes('voice-chat')"
                  (click)="selectFile('src/app/features/media/voice-chat.component.ts', 13)"
                >
                  <span class="text-[#3178c6]">TS</span>
                  <span>voice-chat.component.ts</span>
                </div>
                <div 
                  class="flex items-center gap-1.5 py-0.5 px-2 rounded cursor-pointer hover:bg-[#2a2d2e]"
                  [class.bg-[#37373d]]="currentFile().includes('headless-chat')"
                  [class.text-white]="currentFile().includes('headless-chat')"
                  (click)="selectFile('src/app/features/headless/headless-chat.component.ts', 40)"
                >
                  <span class="text-[#3178c6]">TS</span>
                  <span>headless-chat.component.ts</span>
                </div>
                <div 
                  class="flex items-center gap-1.5 py-0.5 px-2 rounded cursor-pointer hover:bg-[#2a2d2e]"
                  [class.bg-[#37373d]]="currentFile().includes('a2ui-chat')"
                  [class.text-white]="currentFile().includes('a2ui-chat')"
                  (click)="selectFile('src/app/features/a2ui/a2ui-chat.component.ts', 15)"
                >
                  <span class="text-[#3178c6]">TS</span>
                  <span>a2ui-chat.component.ts</span>
                </div>
                <div 
                  class="flex items-center gap-1.5 py-0.5 px-2 rounded cursor-pointer hover:bg-[#2a2d2e]"
                  [class.bg-[#37373d]]="currentFile().includes('threads-demo')"
                  [class.text-white]="currentFile().includes('threads-demo')"
                  (click)="selectFile('src/app/features/threads/threads-demo.component.ts', 10)"
                >
                  <span class="text-[#3178c6]">TS</span>
                  <span>threads-demo.component.ts</span>
                </div>
                <div 
                  class="flex items-center gap-1.5 py-0.5 px-2 rounded cursor-pointer hover:bg-[#2a2d2e]"
                  [class.bg-[#37373d]]="currentFile().includes('memory-demo')"
                  [class.text-white]="currentFile().includes('memory-demo')"
                  (click)="selectFile('src/app/features/memory/memory-demo.component.ts', 10)"
                >
                  <span class="text-[#3178c6]">TS</span>
                  <span>memory-demo.component.ts</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Editor Main Container -->
      <div class="flex flex-1 flex-col overflow-hidden bg-[#1e1e1e]">
        <!-- Editor Tabs -->
        <div class="flex h-9 items-center border-b border-[#252526] bg-[#252526] overflow-x-auto">
          <div class="flex h-full items-center gap-2 border-r border-[#1e1e1e] bg-[#1e1e1e] px-4 text-[#ffffff] font-medium text-xs">
            <span [class]="fileIconColor()">{{ fileIconText() }}</span>
            <span>{{ displayFileName() }}</span>
            <span class="ml-2 text-[#858585] hover:text-white cursor-pointer">×</span>
          </div>
        </div>

        <!-- Breadcrumbs -->
        <div class="flex h-6 items-center px-4 text-[11px] text-[#999999] border-b border-[#252526] bg-[#1e1e1e] gap-1.5">
          <span>project</span>
          <span>›</span>
          <span>{{ currentFile() }}</span>
          <span>›</span>
          <span class="text-[#ffffff]">Ln {{ targetLine() }}</span>
        </div>

        <!-- Editor Content (Code Lines) -->
        <div #editorContainer id="editor-container" class="flex-1 overflow-auto bg-[#1e1e1e] font-mono text-[13px] leading-relaxed py-2 scroll-smooth">
          <div class="table w-full">
            @for (line of codeLines(); track $index; let i = $index) {
              <div 
                [id]="'line-' + (i + 1)"
                class="table-row hover:bg-[#282828] transition-colors"
                [class.bg-[#264f7880]]="isLineHighlighted(i + 1)"
                [class.border-l-4]="isLineHighlighted(i + 1)"
                [class.border-blue-400]="isLineHighlighted(i + 1)"
              >
                <!-- Line Number -->
                <div class="table-cell select-none pr-4 pl-4 text-right text-[#858585] w-12 text-xs">
                  {{ i + 1 }}
                </div>
                <!-- Line Text -->
                <div class="table-cell whitespace-pre pr-4 text-[#d4d4d4]">
                  {{ line }}
                </div>
              </div>
            }
          </div>
        </div>

        <!-- Status Bar -->
        <div class="flex h-6 items-center justify-between bg-[#007acc] px-3 text-[11px] text-white">
          <div class="flex items-center gap-3">
            <span class="flex items-center gap-1 font-semibold">
              <svg class="h-3.5 w-3.5 fill-current" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12c0 4.42 2.87 8.17 6.84 9.5.5.08.66-.23.66-.5v-1.69c-2.77.6-3.36-1.34-3.36-1.34-.46-1.16-1.11-1.47-1.11-1.47-.91-.62.07-.6.07-.6 1 .07 1.53 1.03 1.53 1.03.87 1.52 2.34 1.07 2.91.83.1-.65.35-1.09.63-1.34-2.22-.25-4.55-1.11-4.55-4.92 0-1.11.38-2 1.03-2.71-.1-.25-.45-1.29.1-2.64 0 0 .84-.27 2.75 1.02.79-.22 1.65-.33 2.5-.33.85 0 1.71.11 2.5.33 1.91-1.29 2.75-1.02 2.75-1.02.55 1.35.2 2.39.1 2.64.65.71 1.03 1.6 1.03 2.71 0 3.82-2.34 4.66-4.57 4.91.36.31.69.92.69 1.85V21c0 .27.16.59.67.5C19.14 20.16 22 16.42 22 12A10 10 0 0 0 12 2z"/></svg>
              main*
            </span>
            <span>0 errors, 0 warnings</span>
          </div>
          <div class="flex items-center gap-4">
            <span>Ln {{ targetLine() }}, Col 1</span>
            <span>Spaces: 2</span>
            <span>UTF-8</span>
            <span>{{ fileLanguage() }}</span>
            <span class="flex items-center gap-1 font-semibold">
              <span class="h-2 w-2 rounded-full bg-emerald-400"></span>
              Copilot: Active
            </span>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class IdeViewComponent {
  private readonly route = inject(ActivatedRoute);

  protected readonly currentFile = signal<string>('server.ts');
  protected readonly targetLine = signal<number>(33);

  constructor() {
    this.route.queryParams.subscribe((params) => {
      if (params['file']) {
        this.currentFile.set(params['file']);
      }
      if (params['line']) {
        this.targetLine.set(Number(params['line']));
      }
    });
  }

  protected selectFile(file: string, line: number): void {
    this.currentFile.set(file);
    this.targetLine.set(line);
  }

  protected readonly displayFileName = computed(() => {
    const parts = this.currentFile().split('/');
    return parts[parts.length - 1] ?? this.currentFile();
  });

  protected readonly fileIconColor = computed(() => {
    const file = this.currentFile();
    if (file.endsWith('.ts')) return 'text-[#3178c6] font-bold';
    if (file.endsWith('.py')) return 'text-[#3572A5] font-bold';
    if (file.endsWith('.css')) return 'text-[#563d7c] font-bold';
    if (file.endsWith('.toml') || file.endsWith('.example')) return 'text-[#f59e0b] font-bold';
    return 'text-[#999999] font-bold';
  });

  protected readonly fileIconText = computed(() => {
    const file = this.currentFile();
    if (file.endsWith('.ts')) return 'TS';
    if (file.endsWith('.py')) return '🐍';
    if (file.endsWith('.css')) return '#';
    if (file.endsWith('.toml')) return '⚙️';
    return '📄';
  });

  protected readonly fileLanguage = computed(() => {
    const file = this.currentFile();
    if (file.endsWith('.ts')) return 'TypeScript';
    if (file.endsWith('.py')) return 'Python';
    if (file.endsWith('.css')) return 'CSS';
    if (file.endsWith('.toml')) return 'TOML';
    return 'Plain Text';
  });

  protected readonly fileContent = computed(() => {
    const file = this.currentFile();
    return readSource(file) || SOURCES[file] || `// Loading ${file}...`;
  });

  protected readonly codeLines = computed(() => {
    return this.fileContent().split('\n');
  });

  protected isLineHighlighted(lineNum: number): boolean {
    const target = this.targetLine();
    return lineNum >= target - 1 && lineNum <= target + 5;
  }
}
