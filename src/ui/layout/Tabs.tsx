import { useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface TabsProps {
  items: { id: string; label: string; content?: ReactNode }[];
}

export function Tabs({ items }: TabsProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const id = useId();

  return (
    <>
      <div className="tabs" role="tablist" aria-label="デッキ編集">
        {items.map((item, index) => (
          <button
            key={item.id}
            ref={(element) => { tabRefs.current[index] = element; }}
            type="button"
            role="tab"
            id={`${id}-tab-${item.id}`}
            aria-controls={`${id}-panel-${item.id}`}
            aria-selected={activeIndex === index}
            tabIndex={activeIndex === index ? 0 : -1}
            onClick={() => setActiveIndex(index)}
            onKeyDown={(event) => {
              let nextIndex: number;
              switch (event.key) {
                case 'ArrowRight':
                  nextIndex = (index + 1) % items.length;
                  break;
                case 'ArrowLeft':
                  nextIndex = (index - 1 + items.length) % items.length;
                  break;
                case 'Home':
                  nextIndex = 0;
                  break;
                case 'End':
                  nextIndex = items.length - 1;
                  break;
                default:
                  return;
              }
              event.preventDefault();
              setActiveIndex(nextIndex);
              tabRefs.current[nextIndex]?.focus();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
      {items.map((item, index) => (
        <div
          key={item.id}
          className="tab-panel"
          role="tabpanel"
          id={`${id}-panel-${item.id}`}
          aria-labelledby={`${id}-tab-${item.id}`}
          hidden={activeIndex !== index}
          tabIndex={0}
        >
          {item.content}
        </div>
      ))}
    </>
  );
}
