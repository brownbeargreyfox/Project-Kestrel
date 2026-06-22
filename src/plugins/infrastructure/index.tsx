//src/plugins/infrastructure/index.tsx

import React from 'react';
import InfrastructureTab from './InfrastructureTab';
import { InfraDataProvider } from './data/context';
import { MockInfraSource } from './data/mockSource';
import { LiveInfraSource } from './data/liveSource';
import type { PluginManifest } from '../../types/plugin';

const useMock = import.meta.env.VITE_USE_MOCK_INFRA === 'true';
const source = useMock ? new MockInfraSource() : new LiveInfraSource();

const WrappedTab = React.forwardRef(function WrappedTab(_, ref: any) {
  return (
    <InfraDataProvider source={source}>
      <InfrastructureTab ref={ref as any} />
    </InfraDataProvider>
  );
});

export const manifest: PluginManifest = {
  id: 'infrastructure',
  name: 'Infrastructure',
  version: '1.0.0',
  tabs: [{ id: 'infrastructure-tab', label: 'Infrastructure', component: WrappedTab }],
  permissions: ['ui:window', 'events:subscribe', 'data:topology.read', 'data:metrics.read'],
};

export default manifest;