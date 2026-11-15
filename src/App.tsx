import { AppShell } from './ui/layout/AppShell';
import { Tabs } from './ui/layout/Tabs';

export default function App() {
  return (
    <AppShell>
      <Tabs
        items={[
          { id: 'deck', label: 'デッキ' },
          { id: 'groups', label: 'カードグループ' },
          { id: 'patterns', label: '初動パターン' },
        ]}
      />
    </AppShell>
  );
}
