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
    background: #20242a;
    color: var(--theme-text, #333333);
  }

  html[data-theme='light'] {
    --theme-text: #333333;
    --theme-muted: rgba(51, 51, 51, 0.72);
    --theme-subtle: rgba(85, 87, 83, 0.7);
    --theme-surface: rgba(240, 241, 234, 0.92);
    --theme-surface-strong: rgba(247, 248, 242, 0.96);
    --theme-surface-soft: rgba(231, 234, 225, 0.86);
    --theme-border: rgba(178, 184, 170, 0.9);
    --theme-border-soft: rgba(190, 196, 183, 0.6);
    --theme-divider: rgba(186, 191, 182, 0.9);
    --theme-accent: #76b900;
    --theme-accent-strong: #4e9a06;
    --theme-accent-soft: rgba(118, 185, 0, 0.12);
    --theme-info: #3465a4;
    --theme-danger: #cc5e00;
    --theme-overlay: rgba(255, 255, 255, 0.05);
  }

  html[data-theme='dark'] {
    --theme-text: #eef1ec;
    --theme-muted: rgba(238, 241, 236, 0.74);
    --theme-subtle: rgba(210, 216, 206, 0.58);
    --theme-surface: rgba(37, 42, 49, 0.9);
    --theme-surface-strong: rgba(27, 31, 36, 0.95);
    --theme-surface-soft: rgba(46, 52, 58, 0.84);
    --theme-border: rgba(79, 89, 101, 0.92);
    --theme-border-soft: rgba(79, 89, 101, 0.55);
    --theme-divider: rgba(79, 89, 101, 0.82);
    --theme-accent: #8ae234;
    --theme-accent-strong: #73d216;
    --theme-accent-soft: rgba(138, 226, 52, 0.14);
    --theme-info: #729fcf;
    --theme-danger: #ffb07c;
    --theme-overlay: rgba(20, 24, 29, 0.28);
  }

  body {
    margin: 0;
    background: transparent;
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
