'use client';

export interface ModalTab {
  id: string;
  label: string;
  hasError?: boolean;
}

interface ModalTabsProps {
  tabs: ModalTab[];
  activeTabId: string;
  onTabChange: (id: string) => void;
  testIdPrefix: string;
}

export function ModalTabs({ tabs, activeTabId, onTabChange, testIdPrefix }: ModalTabsProps) {
  return (
    <div role="tablist" className="flex shrink-0 gap-1 border-b border-white/10">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onTabChange(tab.id)}
            data-testid={`${testIdPrefix}-tab-${tab.id}`}
            className={`relative px-3 py-2 text-xs uppercase tracking-wide transition-colors ${
              isActive
                ? 'border-b-2 border-silver text-white'
                : 'border-b-2 border-transparent text-white/50 hover:text-white/80'
            }`}
          >
            {tab.label}
            {tab.hasError && (
              <span
                data-testid={`${testIdPrefix}-tab-${tab.id}-error-dot`}
                className="absolute right-1 top-1.5 h-1.5 w-1.5 rounded-full bg-red-400"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
