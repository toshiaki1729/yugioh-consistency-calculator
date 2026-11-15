import { useId, useRef, useState } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';

interface TabsProps {
  items: { id: string; label: string; content?: ReactNode }[];
  activeId?: string;
  onSelect?: (id: string) => void;
}

/** 矢印キーで切り替えられる編集タブと対応パネルを表示する。 */
export function Tabs({ items, activeId, onSelect }: TabsProps) {
  const [localIndex, setLocalIndex] = useState(0);
  const activeIndex = activeId === undefined
    ? localIndex : items.findIndex(item => item.id === activeId);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();
  function setActiveIndex(index: number) {
    setLocalIndex(index);
    onSelect?.(items[index].id);
  }
  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    let nextIndex: number;
    switch (event.key) {
      case 'ArrowRight': nextIndex = (index + 1) % items.length; break;
      case 'ArrowLeft': nextIndex = (index - 1 + items.length) % items.length; break;
      case 'Home': nextIndex = 0; break;
      case 'End': nextIndex = items.length - 1; break;
      default: return;
    }
    event.preventDefault();
    setActiveIndex(nextIndex);
    tabRefs.current[nextIndex]?.focus();
    tabRefs.current[nextIndex]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function renderTab(item: TabsProps['items'][number], index: number) {
    return <TabButton key={item.id} item={item} id={id} isActive={activeIndex === index}
      onRef={element => { tabRefs.current[index] = element; }}
      onSelect={() => setActiveIndex(index)}
      onKeyDown={event => handleKeyDown(event, index)} />;
  }
  function renderPanel(item: TabsProps['items'][number], index: number) {
    return <TabPanel key={item.id} item={item} id={id} isActive={activeIndex === index} />;
  }
  return <>
    <div className="tabs" role="tablist" aria-label="デッキ編集">{items.map(renderTab)}</div>
    {items.map(renderPanel)}
  </>;
}

interface TabItemProps {
  item: TabsProps['items'][number];
  id: string;
  isActive: boolean;
}

function TabButton({ item, id, isActive, onRef, onSelect, onKeyDown }: TabItemProps & {
  onRef: (element: HTMLButtonElement | null) => void;
  onSelect: () => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  return <button ref={onRef} type="button" role="tab" id={`${id}-tab-${item.id}`}
    aria-controls={`${id}-panel-${item.id}`} aria-selected={isActive}
    tabIndex={isActive ? 0 : -1} onClick={onSelect} onKeyDown={onKeyDown}>
    {item.label}
  </button>;
}

function TabPanel({ item, id, isActive }: TabItemProps) {
  return <div className="tab-panel" role="tabpanel" id={`${id}-panel-${item.id}`}
    aria-labelledby={`${id}-tab-${item.id}`} hidden={!isActive} tabIndex={0}>
    {item.content}
  </div>;
}
