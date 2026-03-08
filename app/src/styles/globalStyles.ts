export const GLOBAL_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Fredoka:wght@300;400;600;700&family=Nunito:wght@400;600;700;900&family=Teko:wght@700&display=swap');

  :root {
    --elly-sky: #89CFF0;
    --elly-lavender: #E0BBE4;
    --elly-mint: #B5EAD7;
    --elly-rose: #FFB7B2;
    --elly-cream: #FFFACD;
    --elly-ink: #2D2D44;
    --elly-dusk: #14112C;
    --elly-cloud: #C8D9EA;

    --inkbunny-charcoal: #333333;
    --inkbunny-slate: #2E3436;
    --inkbunny-smoke: #555753;
    --inkbunny-green: #4E9A06;
    --inkbunny-green-bright: #73D216;
    --inkbunny-green-soft: #8AE234;
    --inkbunny-green-ui: #76B900;
    --inkbunny-blue: #3465A4;
    --inkbunny-blue-soft: #729FCF;
    --inkbunny-orange: #CC5E00;
  }

  html {
    background: #ffffff;
    color: var(--theme-text, #333333);
  }

  html[data-theme='light'] {
    --theme-page: #ffffff;
    --theme-page-soft: #f4f5f2;
    --theme-text: #2e3436;
    --theme-title: #2e3436;
    --theme-muted: rgba(46, 52, 54, 0.76);
    --theme-subtle: rgba(85, 87, 83, 0.72);
    --theme-surface: rgba(255, 255, 255, 0.94);
    --theme-surface-strong: rgba(255, 255, 255, 0.985);
    --theme-surface-soft: rgba(186, 189, 182, 0.24);
    --theme-surface-muted: rgba(186, 189, 182, 0.16);
    --theme-input: rgba(255, 255, 255, 0.98);
    --theme-hover: rgba(186, 189, 182, 0.3);
    --theme-hover-strong: rgba(186, 189, 182, 0.44);
    --theme-border: rgba(186, 189, 182, 0.92);
    --theme-border-soft: rgba(186, 189, 182, 0.58);
    --theme-divider: rgba(186, 189, 182, 0.9);
    --theme-accent: #555753;
    --theme-accent-strong: #2e3436;
    --theme-accent-soft: rgba(85, 87, 83, 0.12);
    --theme-info: #555753;
    --theme-info-strong: #2e3436;
    --theme-danger: #2e3436;
    --theme-danger-soft: rgba(46, 52, 54, 0.12);
    --theme-success: #555753;
    --theme-success-soft: rgba(85, 87, 83, 0.12);
    --theme-overlay: rgba(46, 52, 54, 0.12);
    --theme-shadow: 0 22px 80px rgba(46, 52, 54, 0.14);
    --theme-image-overlay: linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0) 32%, rgba(85, 87, 83, 0.16) 100%);
  }

  html[data-theme='dark'] {
    --theme-page: #20242a;
    --theme-page-soft: #1b1f24;
    --theme-text: #eef1ec;
    --theme-title: #ffffff;
    --theme-muted: rgba(238, 241, 236, 0.74);
    --theme-subtle: rgba(210, 216, 206, 0.58);
    --theme-surface: rgba(37, 42, 49, 0.9);
    --theme-surface-strong: rgba(27, 31, 36, 0.95);
    --theme-surface-soft: rgba(46, 52, 58, 0.84);
    --theme-surface-muted: rgba(46, 52, 58, 0.56);
    --theme-input: rgba(31, 37, 43, 0.9);
    --theme-hover: rgba(255, 255, 255, 0.06);
    --theme-hover-strong: rgba(255, 255, 255, 0.11);
    --theme-border: rgba(79, 89, 101, 0.92);
    --theme-border-soft: rgba(79, 89, 101, 0.55);
    --theme-divider: rgba(79, 89, 101, 0.82);
    --theme-accent: #8ae234;
    --theme-accent-strong: #73d216;
    --theme-accent-soft: rgba(138, 226, 52, 0.14);
    --theme-info: #729fcf;
    --theme-info-strong: #89cff0;
    --theme-danger: #ffb07c;
    --theme-danger-soft: rgba(204, 94, 0, 0.18);
    --theme-success: #8ae234;
    --theme-success-soft: rgba(138, 226, 52, 0.14);
    --theme-overlay: rgba(20, 24, 29, 0.28);
    --theme-shadow: 0 22px 80px rgba(0, 0, 0, 0.24);
    --theme-image-overlay: linear-gradient(180deg, rgba(12, 12, 20, 0.44) 0%, rgba(20, 17, 44, 0.68) 42%, rgba(8, 8, 12, 0.84) 100%);
  }

  body {
    margin: 0;
    background: var(--theme-page, transparent);
    color: var(--theme-text, #333333);
  }

  body, .font-sans { font-family: 'Nunito', sans-serif; }
  .font-display { font-family: 'Fredoka', cursive; }
  .font-teko { font-family: 'Teko', sans-serif; }

  .theme-switch,
  .theme-switch :where(nav, section, aside, article, button, input, select, label, span, p, h1, h2, h3, h4, div) {
    transition-property: background-color, border-color, color, box-shadow, opacity;
    transition-duration: 280ms;
    transition-timing-function: ease;
  }

  ::-webkit-scrollbar { width: 12px; height: 12px; }
  ::-webkit-scrollbar-track { background: var(--theme-surface-strong, rgba(20, 17, 44, 0.75)); }
  ::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, var(--theme-info, var(--elly-rose)), var(--theme-accent-strong, var(--inkbunny-green-bright)));
    border-radius: 999px;
    border: 3px solid var(--theme-surface-strong, rgba(20, 17, 44, 0.8));
  }

  .rounded-toy { border-radius: 2rem; }
  .rounded-toy-lg { border-radius: 3rem; }
  .rounded-toy-sm { border-radius: 1rem; }
  .shadow-pop { box-shadow: 4px 4px 0px 0px rgba(0,0,0,0.12); }
  .shadow-pop-hover { box-shadow: 2px 2px 0px 0px rgba(0,0,0,0.12); }
  .shadow-pop-active { box-shadow: 0px 0px 0px 0px rgba(0,0,0,0.12); }
  .slide-panel { transition: flex-grow 0.5s cubic-bezier(0.4, 0, 0.2, 1); }
  .theme-shell { background: var(--theme-page); color: var(--theme-text); }
  .theme-panel {
    background: var(--theme-surface);
    border-color: var(--theme-border);
    color: var(--theme-text);
    box-shadow: var(--theme-shadow);
  }
  .theme-panel-strong {
    background: var(--theme-surface-strong);
    border-color: var(--theme-border);
    color: var(--theme-text);
  }
  .theme-panel-soft {
    background: var(--theme-surface-soft);
    border-color: var(--theme-border-soft);
    color: var(--theme-text);
  }
  .theme-panel-muted {
    background: var(--theme-surface-muted);
    border-color: var(--theme-border-soft);
    color: var(--theme-text);
  }
  .theme-chip {
    background: var(--theme-surface);
    border-color: var(--theme-border-soft);
    color: var(--theme-text);
  }
  .theme-input {
    background: var(--theme-input);
    border-color: var(--theme-border);
    color: var(--theme-text);
  }
  .theme-input::placeholder { color: var(--theme-subtle); }
  .theme-input:focus { border-color: var(--theme-accent-strong); }
  .theme-title { color: var(--theme-title); }
  .theme-muted { color: var(--theme-muted); }
  .theme-subtle { color: var(--theme-subtle); }
  .theme-divider { border-color: var(--theme-divider); }
  .theme-hover:hover { background: var(--theme-hover); }
  .theme-hover-strong:hover { background: var(--theme-hover-strong); }
  .theme-button-accent {
    background: var(--inkbunny-green-bright);
    border-color: var(--inkbunny-green);
    color: #ffffff;
  }
  .theme-button-accent:hover {
    background: var(--inkbunny-green);
    border-color: var(--inkbunny-green);
  }
  .theme-button-info {
    background: var(--theme-info);
    border-color: var(--theme-info-strong);
    color: #ffffff;
  }
  .theme-button-info:hover { background: var(--theme-info-strong); }
  .theme-button-secondary {
    background: var(--theme-surface-strong);
    border-color: var(--theme-border);
    color: var(--theme-text);
  }
  .theme-button-secondary:hover { background: var(--theme-hover); }
  .theme-button-danger {
    background: var(--theme-surface-strong);
    border-color: var(--theme-border);
    color: var(--theme-danger);
  }
  .theme-button-danger:hover {
    background: var(--theme-danger);
    border-color: var(--theme-danger);
    color: #ffffff;
  }
  .theme-badge {
    background: var(--theme-accent-soft);
    color: var(--theme-accent-strong);
  }
  .theme-overlay-scrim { background: var(--theme-overlay); }
  .theme-ring { box-shadow: 0 0 0 2px var(--theme-accent-soft); }

  @keyframes spin-slow {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }
  @keyframes spin-reverse-slow {
    from { transform: rotate(360deg); }
    to { transform: rotate(0deg); }
  }
  @keyframes float {
    0%, 100% { transform: translateY(0); }
    50% { transform: translateY(-18px); }
  }
  @keyframes fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
  }
  @keyframes commission-bounce {
    0% { transform: translate3d(0, 0, 0); }
    20% { transform: translate3d(-4px, 0, 0) rotate(-1deg); }
    40% { transform: translate3d(6px, 0, 0) rotate(1deg); }
    60% { transform: translate3d(-4px, 0, 0) rotate(-1deg); }
    80% { transform: translate3d(3px, 0, 0) rotate(0deg); }
    100% { transform: translate3d(0, 0, 0); }
  }
  .animate-spin-slow { animation: spin-slow 12s linear infinite; }
  .animate-spin-reverse-slow { animation: spin-reverse-slow 16s linear infinite; }
  .animate-float { animation: float 6s ease-in-out infinite; }
  .animate-fade-in { animation: fade-in 0.45s ease-in-out forwards; }
  .animate-commission-shake { animation: commission-bounce 0.65s ease; }

  .motion-reduced *,
  .motion-reduced *::before,
  .motion-reduced *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }

  @media (max-width: 768px) {
    .mobile-zoom {
      zoom: 0.82;
    }
  }
`
