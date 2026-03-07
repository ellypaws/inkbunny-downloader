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
    background: radial-gradient(circle at top, rgba(137, 207, 240, 0.16), transparent 42%),
      linear-gradient(180deg, #17142F 0%, #14112C 36%, #101018 100%);
  }

  body, .font-sans { font-family: 'Nunito', sans-serif; }
  .font-display { font-family: 'Fredoka', cursive; }
  .font-teko { font-family: 'Teko', sans-serif; }

  ::-webkit-scrollbar { width: 12px; height: 12px; }
  ::-webkit-scrollbar-track { background: rgba(20, 17, 44, 0.75); }
  ::-webkit-scrollbar-thumb {
    background: linear-gradient(180deg, var(--elly-rose), var(--inkbunny-green-bright));
    border-radius: 999px;
    border: 3px solid rgba(20, 17, 44, 0.8);
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
