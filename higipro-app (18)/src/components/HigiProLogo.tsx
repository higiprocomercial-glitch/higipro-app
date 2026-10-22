import React from 'react';

interface LogoProps {
  className?: string;
  showText?: boolean;
  theme?: 'dark' | 'light';
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

export const LogoHigiPro: React.FC<LogoProps> = ({ 
  className = "w-10 h-10", 
  showText = false, 
  theme = 'dark',
  size = 'md'
}) => {
  const sizeClasses = {
    sm: { svg: "w-8 h-9", text: "text-lg" },
    md: { svg: "w-12 h-14", text: "text-2xl" },
    lg: { svg: "w-20 h-22", text: "text-3xl" },
    xl: { svg: "w-32 h-36", text: "text-5xl" },
  };

  const currentSize = sizeClasses[size];

  return (
    <div className={`flex flex-col items-center justify-center ${showText ? 'gap-2' : ''}`}>
      <div className={`relative ${className || currentSize.svg}`}>
        <svg 
          viewBox="0 0 100 110" 
          className="w-full h-full drop-shadow-md" 
          fill="none" 
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* Gold Gradient Outer Shield */}
          <path 
            d="M50,5 C72,5 94,10 95,35 C95,65 72,92 50,105 C28,92 5,65 5,35 C6,10 28,5 50,5 Z" 
            fill="#0b2447" 
            stroke="url(#higiProGoldGradient)" 
            strokeWidth="4" 
            strokeLinejoin="round" 
          />
          
          {/* Inner Shield border */}
          <path 
            d="M50,8 C69,8 89,12 90,35 C90,62 69,87 50,99 C31,87 10,62 10,35 C11,12 31,8 50,8 Z" 
            fill="#071a33" 
          />

          {/* Glossy 3D Highlight layer */}
          <path 
            d="M50,8 L90,35 C90,62 69,87 50,99 Z" 
            fill="white" 
            fillOpacity="0.04" 
          />

          {/* Couch/Sofa Silhouette */}
          {/* Back cushions */}
          <path 
            d="M26,52 C26,45 33,40 49,40 L50,40 L50,70 L26,70 Z" 
            fill="white" 
            fillOpacity="0.95"
          />
          <path 
            d="M74,52 C74,45 67,40 51,40 L50,40 L50,70 L74,70 Z" 
            fill="white" 
            fillOpacity="0.95"
          />
          
          {/* Cushion vertical division line */}
          <line x1="50" y1="40" x2="50" y2="70" stroke="#071a33" strokeWidth="1.5" />

          {/* Modern Armrest Left */}
          <path 
            d="M20,49 C20,45 24,45 26,49 L30,70 C30,73 26,73 24,73 L20,70 Z" 
            fill="#e2e8f0" 
          />
          {/* Modern Armrest Right */}
          <path 
            d="M80,49 C80,45 76,45 74,49 L70,70 C70,73 74,73 76,73 L80,70 Z" 
            fill="#e2e8f0" 
          />

          {/* Seat Cushion Area */}
          <path 
            d="M25,60 H75 V70 C75,73 72,74 69,74 H31 C28,74 25,73 25,70 Z" 
            fill="white" 
          />
          <line x1="50" y1="60" x2="50" y2="74" stroke="#071a33" strokeWidth="1.5" />
          <line x1="25" y1="60" x2="75" y2="60" stroke="#071a33" strokeWidth="1" />

          {/* Couch legs */}
          <path d="M31,74 L25,88 H30 L36,74 Z" fill="white" />
          <path d="M69,74 L75,88 H70 L64,74 Z" fill="white" />

          {/* Gradients definition */}
          <defs>
            <linearGradient id="higiProGoldGradient" x1="50" y1="5" x2="50" y2="105" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#FFE082" />
              <stop offset="30%" stopColor="#FFC107" />
              <stop offset="70%" stopColor="#FFB300" />
              <stop offset="100%" stopColor="#FFA000" />
            </linearGradient>
          </defs>
        </svg>
      </div>

      {showText && (
        <div className="text-center font-display leading-none mt-1">
          <span 
            className={`font-black tracking-wide ${currentSize.text} ${
              theme === 'dark' 
                ? 'text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)] bg-linear-to-b from-white to-slate-300 bg-clip-text' 
                : 'text-slate-800'
            }`}
            style={{
              textShadow: theme === 'dark' ? '0px 2px 3px rgba(0,0,0,0.4), 0px 4px 10px rgba(0,0,0,0.1)' : 'none',
              fontFamily: 'system-ui, -apple-system, sans-serif'
            }}
          >
            HigiPro
          </span>
          <p className={`text-[8px] font-black tracking-widest uppercase mt-1 ${theme === 'dark' ? 'text-amber-400' : 'text-amber-600'}`}>
            Gestão de Estofados
          </p>
        </div>
      )}
    </div>
  );
};
