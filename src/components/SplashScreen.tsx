import React from 'react';

interface SplashScreenProps {
  statusText?: string;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  statusText = 'Personal Intelligence',
}) => {
  return (
    <>
      <style>{`
        #splash-screen {
          position: fixed; inset: 0; background: #04060b;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
          z-index: 9999; overflow: hidden; transition: opacity 0.7s ease;
        }

        /* Smooth Water-Like Flowing Indian Flag (Tiranga) Silk Waves */
        .tiranga-water-stage {
          position: absolute; inset: 0; overflow: hidden; pointer-events: none;
          filter: blur(42px); opacity: 0.78;
        }
        .water-wave {
          position: absolute; left: -25%; width: 150%; height: 220px;
          border-radius: 45% 55% 48% 52%;
          animation: waterFlow 7s ease-in-out infinite alternate;
        }
        .wave-saffron {
          top: 14%;
          background: linear-gradient(90deg, transparent, #FF9933, #ff7b00, transparent);
          animation-duration: 6.5s;
        }
        .wave-white {
          top: 38%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.85), rgba(59,130,246,0.55), rgba(255,255,255,0.85), transparent);
          animation-duration: 8s; animation-direction: alternate-reverse;
        }
        .wave-green {
          bottom: 14%;
          background: linear-gradient(90deg, transparent, #138808, #0ea53a, transparent);
          animation-duration: 7.2s;
        }

        @keyframes waterFlow {
          0% { transform: translateX(-6%) translateY(-10px) rotate(-2deg) scaleY(0.92); }
          50% { transform: translateX(4%) translateY(12px) rotate(1.5deg) scaleY(1.08); }
          100% { transform: translateX(8%) translateY(-8px) rotate(-1deg) scaleY(0.96); }
        }

        /* Cinematic Title Reveal */
        .aura-cinematic-title {
          position: relative; z-index: 2; font-size: 48px; font-weight: 700;
          letter-spacing: 14px; color: #ffffff;
          text-shadow: 0 0 28px rgba(255, 255, 255, 0.8), 0 0 55px rgba(29, 78, 216, 0.65);
          animation: cinematicReveal 1.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
        @keyframes cinematicReveal {
          0% { opacity: 0; filter: blur(14px); letter-spacing: 26px; transform: scale(0.92); }
          100% { opacity: 1; filter: blur(0px); letter-spacing: 12px; transform: scale(1); }
        }

        .aura-sub-tagline {
          position: relative; z-index: 2; margin-top: 10px; font-size: 11px;
          letter-spacing: 4px; text-transform: uppercase; color: rgba(255, 255, 255, 0.82);
          opacity: 0; animation: fadeUpTag 1s ease 0.45s forwards;
        }
        @keyframes fadeUpTag {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }

        /* Sleek Tiranga Waterline Progress Bar */
        .tiranga-line-wrap {
          position: relative; z-index: 2; width: 170px; height: 2.5px;
          background: rgba(255, 255, 255, 0.14); border-radius: 4px; margin-top: 26px; overflow: hidden;
        }
        .tiranga-line-fill {
          width: 0%; height: 100%;
          background: linear-gradient(90deg, #FF9933, #FFFFFF, #138808);
          animation: fillTiranga 1.7s ease-in-out forwards;
        }
        @keyframes fillTiranga { to { width: 100%; } }
      `}</style>

      <div id="splash-screen" data-testid="splash-screen">
        <div className="tiranga-water-stage">
          <div className="water-wave wave-saffron"></div>
          <div className="water-wave wave-white"></div>
          <div className="water-wave wave-green"></div>
        </div>

        <div className="aura-cinematic-title">AURA</div>
        <div className="aura-sub-tagline" id="splash-text">
          {statusText}
        </div>
        <div className="tiranga-line-wrap">
          <div className="tiranga-line-fill"></div>
        </div>
      </div>
    </>
  );
};
