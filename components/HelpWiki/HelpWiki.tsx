import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icon';
import {
  getWikiPageForTopic,
  HelpTopic,
  WIKI_PAGES,
  WikiPageId,
} from './wikiContent';

export type { HelpTopic } from './wikiContent';

interface HelpWikiProps {
  topic: HelpTopic | null;
  onClose: () => void;
}

export const HelpWiki: React.FC<HelpWikiProps> = ({ topic, onClose }) => {
  const initialPage = getWikiPageForTopic(topic || 'getting_started');
  const [activePageId, setActivePageId] = useState<WikiPageId>(initialPage.id);
  const contentRef = useRef<HTMLDivElement>(null);

  const activePage = useMemo(
    () => WIKI_PAGES.find(page => page.id === activePageId) || WIKI_PAGES[0],
    [activePageId],
  );

  useEffect(() => {
    if (!topic) return;
    const page = getWikiPageForTopic(topic);
    setActivePageId(page.id);

    window.requestAnimationFrame(() => {
      const target = document.getElementById(`wiki-${topic}`);
      if (target) {
        target.scrollIntoView({ block: 'start' });
      } else {
        contentRef.current?.scrollTo({ top: 0 });
      }
    });
  }, [topic]);

  if (!topic) return null;

  const selectPage = (pageId: WikiPageId) => {
    setActivePageId(pageId);
    window.requestAnimationFrame(() => contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' }));
  };

  return (
    <div className="fixed inset-3 z-[100] flex justify-end pointer-events-none sm:inset-5">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="wiki-title"
        className="pointer-events-auto flex h-full w-full max-w-[900px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-950/20 dark:border-slate-700 dark:bg-slate-950"
      >
        <header className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950 sm:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Icon name="menu_book" className="text-base" />
            </div>
            <div className="min-w-0">
              <p className="text-[8px] font-black uppercase tracking-[0.2em] text-primary">F3D Studio</p>
              <h2 id="wiki-title" className="truncate text-sm font-black tracking-tight text-slate-800 dark:text-slate-100">User guide</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close user guide"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <Icon name="close" className="text-base" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          <aside className="hidden w-44 shrink-0 border-r border-slate-200 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900/40 sm:block">
            <p className="mb-2 px-2 text-[8px] font-black uppercase tracking-[0.18em] text-slate-400">Workflow</p>
            <nav aria-label="User guide sections" className="space-y-1">
              {WIKI_PAGES.map(page => (
                <button
                  type="button"
                  key={page.id}
                  onClick={() => selectPage(page.id)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2.5 text-left text-[10px] font-bold transition-colors ${
                    activePageId === page.id
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-slate-500 hover:bg-white hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`}
                >
                  <Icon name={page.icon} className="text-sm" />
                  <span>{page.label}</span>
                </button>
              ))}
            </nav>
          </aside>

          <div ref={contentRef} className="min-w-0 flex-1 overflow-y-auto custom-scrollbar scroll-smooth">
            <div className="flex gap-1 overflow-x-auto border-b border-slate-200 px-4 py-2 sm:hidden dark:border-slate-800">
              {WIKI_PAGES.map(page => (
                <button
                  type="button"
                  key={page.id}
                  onClick={() => selectPage(page.id)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[8px] font-black uppercase tracking-wider ${
                    activePageId === page.id ? 'bg-primary text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'
                  }`}
                >
                  {page.label}
                </button>
              ))}
            </div>

            <article className="mx-auto max-w-2xl px-5 py-7 sm:px-9 sm:py-10">
              <header className="mb-9">
                <div className="mb-3 flex items-center gap-2 text-primary">
                  <Icon name={activePage.icon} className="text-lg" />
                  <span className="text-[9px] font-black uppercase tracking-[0.2em]">Workflow tab</span>
                </div>
                <h1 className="text-3xl font-black tracking-tight text-slate-900 dark:text-white">{activePage.label}</h1>
                <p className="mt-3 max-w-xl text-[12px] font-medium leading-6 text-slate-500 dark:text-slate-400">{activePage.intro}</p>
              </header>

              <div>
                {activePage.sections.map((section, index) => (
                  <section
                    id={`wiki-${section.id}`}
                    key={section.id}
                    className={`scroll-mt-6 py-8 ${index === 0 ? 'border-t border-slate-300 dark:border-slate-700' : 'border-t border-slate-200 dark:border-slate-800'}`}
                  >
                    <span className="font-mono text-[9px] font-black text-primary/70">{String(index + 1).padStart(2, '0')}</span>
                    <h2 className="mt-1 text-xl font-black tracking-tight text-slate-850 dark:text-slate-100">{section.title}</h2>

                    <div className="mt-5">
                      <h3 className="text-[9px] font-black uppercase tracking-[0.16em] text-slate-400">How it works</h3>
                      <p className="mt-2 text-[12px] font-semibold leading-6 text-slate-700 dark:text-slate-200">{section.purpose}</p>
                      <ul className="mt-3 space-y-2">
                        {section.details.map(detail => (
                          <li key={detail} className="flex gap-3 text-[11px] font-medium leading-5 text-slate-500 dark:text-slate-400">
                            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                            <span>{detail}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    {section.bio && (
                      <div className="mt-6 border-l-2 border-emerald-500 pl-4">
                        <h3 className="flex items-center gap-2 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-700 dark:text-emerald-400">
                          <Icon name="biotech" className="text-sm" />
                          Bio result guidance
                        </h3>
                        <p className="mt-2 text-[11px] font-semibold leading-5 text-slate-700 dark:text-slate-200">{section.bio.summary}</p>
                        <ul className="mt-2 space-y-1.5">
                          {section.bio.tips.map(tip => (
                            <li key={tip} className="text-[10px] font-medium leading-5 text-slate-500 dark:text-slate-400">— {tip}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </section>
                ))}
              </div>
            </article>
          </div>
        </div>
      </section>
    </div>
  );
};
