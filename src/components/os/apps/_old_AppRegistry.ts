import { Terminal, Shield, Activity, Folder } from 'lucide-react';
import type { AppManifest } from '../../../types/os.types';

export const AppRegistry: Record<string, AppManifest> = {
  'kestrel-terminal': {
    id: 'kestrel-terminal',
    title: 'Terminal',
    icon: Terminal,
    permissions: ['ui:window', 'events:publish', 'events:subscribe'],
    mount: () => import('./TerminalApp.jsx') as any,
  },
  'kestrel-files': {
    id: 'kestrel-files',
    title: 'Files',
    icon: Folder,
    permissions: ['ui:window'],
    mount: () => import('./FilesApp.jsx') as any,
  },
  'security-events': {
    id: 'security-events',
    title: 'Security Events',
    icon: Shield,
    permissions: ['ui:window', 'events:subscribe', 'data:alerts.read'],
    mount: () => import('./WidgetApp.jsx').then(m => ({ default: m.WidgetApp('securityEvents') })) as any,
  },
  'system-health': {
    id: 'system-health',
    title: 'System Health',
    icon: Activity,
    permissions: ['ui:window', 'events:subscribe', 'data:metrics.read'],
    mount: () => import('./WidgetApp.jsx').then(m => ({ default: m.WidgetApp('systemHealth') })) as any,
  },
};
