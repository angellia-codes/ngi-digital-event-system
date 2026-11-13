'use client';
import { translate, type Lang } from '@/lib/i18n/strings';
import type { ClosingText } from '@/lib/screen-cache';

/**
 * The closing card, and (with `brandOnly`) the fallback shown instead of black when a video cannot be played.
 * Drawn on the same 1280 × 720 board as the draw, in the Retro Rewind look.
 */
export function ClosingCard({ lang, text, brandOnly = false }: { lang: Lang; text: ClosingText; brandOnly?: boolean }) {
  const lines = text ? text[lang] : [translate(lang, 'stage.closing_1'), translate(lang, 'stage.closing_2')];
  return (
    <div className="board">
      <main className="board__main">
        <h1 className="idle__mark" aria-label="NourishFest 2026"><span>NOURISH</span><span>FEST 2026</span></h1>
        <span className="idle__theme">{translate(lang, 'brand.theme')}</span>
        {!brandOnly && (
          <>
            {lines[0] && <p className="closing__main">{lines[0]}</p>}
            {lines[1] && <p className="closing__sub">{lines[1]}</p>}
          </>
        )}
      </main>
    </div>
  );
}
