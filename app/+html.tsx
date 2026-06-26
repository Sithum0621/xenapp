import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

/**
 * Global web touch/scroll reset — native momentum on mobile browsers.
 * Complements scrollViewDefaults.ts and webScrollTouchBootstrap.ts.
 */
const globalScrollCss = `
html, body, #root {
  height: 100%;
  overflow: hidden;
  touch-action: pan-y;
}
body {
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}
/*
 * RN Web renders Views as divs — pan-y on interactive containers so vertical scroll
 * is never blocked by buttons, cards, or sections.
 */
#root div,
#root button,
#root section,
#root article,
#root main,
#root nav,
#root header,
#root footer,
#root a,
#root [role="button"],
#root [tabindex] {
  touch-action: pan-y;
}
#root input,
#root textarea,
#root select,
#root [contenteditable="true"] {
  touch-action: manipulation;
}
#root [data-touch-scroll="horizontal"],
#root [style*="overflow-x: auto"],
#root [style*="overflow-x: scroll"] {
  touch-action: pan-x pan-y;
}
/*
 * Scroll surfaces — iOS Safari momentum + Android overscroll.
 * Targets RN ScrollView, FlatList/VirtualizedList overflow nodes.
 */
[data-rn-scrollview],
[data-rn-scrollview] > div,
.css-view[style*="overflow-y: auto"],
.css-view[style*="overflow-y: scroll"],
.css-view[style*="overflow: auto"],
.css-view[style*="overflow: scroll"] {
  -webkit-overflow-scrolling: touch;
  overflow-scrolling: touch;
  overscroll-behavior-y: contain;
  touch-action: pan-y;
  scroll-behavior: auto;
}
@supports (-webkit-touch-callout: none) {
  [data-rn-scrollview],
  .css-view[style*="overflow-y: auto"],
  .css-view[style*="overflow-y: scroll"] {
    -webkit-overflow-scrolling: touch;
  }
}
/* Account / security alert banners — full-width, tappable actions on web */
#root [role="alert"],
#root [data-xen-alert-banner="true"] {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
}
#root [data-xen-alert-banner="true"] button,
#root [role="alert"] button {
  cursor: pointer;
  touch-action: manipulation;
}
`;

/** Passive listeners only — never preventDefault (keeps browser scroll pipeline fast). */
const passiveTouchBootstrapScript = `
(function () {
  if (typeof document === 'undefined' || window.__xenPassiveTouch) return;
  window.__xenPassiveTouch = true;
  var opts = { passive: true, capture: true };
  document.addEventListener('touchstart', function () {}, opts);
  document.addEventListener('touchmove', function () {}, opts);
  document.addEventListener('touchend', function () {}, opts);
})();
`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta
          httpEquiv="X-UA-Compatible"
          content="IE=edge"
        />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: globalScrollCss }} />
        <script dangerouslySetInnerHTML={{ __html: passiveTouchBootstrapScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
