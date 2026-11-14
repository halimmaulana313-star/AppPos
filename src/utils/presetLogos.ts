/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface PresetLogo {
  id: string;
  name: string;
  category: string;
  dataUrl: string;
}

// Crisp inline SVGs encoded as data URLs
export const PRESET_LOGOS: PresetLogo[] = [
  {
    id: 'kopi-literasi',
    name: 'Kopi & Buku Literasi',
    category: 'Literasi & Buku',
    dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <defs>
          <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#059669"/>
            <stop offset="100%" stop-color="#0f766e"/>
          </linearGradient>
          <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#fbbf24"/>
            <stop offset="100%" stop-color="#d97706"/>
          </linearGradient>
        </defs>
        <rect width="200" height="200" rx="44" fill="url(#grad1)"/>
        <!-- Steam -->
        <path d="M92 48 C92 40, 86 36, 90 28" stroke="url(#gold)" stroke-width="4.5" stroke-linecap="round" fill="none" opacity="0.9"/>
        <path d="M108 50 C108 42, 114 38, 110 30" stroke="url(#gold)" stroke-width="4.5" stroke-linecap="round" fill="none" opacity="0.9"/>
        <!-- Cup -->
        <path d="M72 58 L128 58 L122 100 C121 112, 111 120, 100 120 C89 120, 79 112, 78 100 Z" fill="#ffffff"/>
        <path d="M128 66 C140 66, 146 76, 144 88 C142 98, 134 104, 124 104" stroke="#ffffff" stroke-width="6" stroke-linecap="round" fill="none"/>
        <!-- Open Book below cup -->
        <path d="M100 144 L60 132 C48 128, 40 134, 40 144 L40 166 C40 174, 50 178, 62 180 L100 168 L138 180 C150 178, 160 174, 160 166 L160 144 C160 134, 152 128, 140 132 Z" fill="#ffffff" opacity="0.95"/>
        <path d="M100 144 L100 168" stroke="#059669" stroke-width="4" stroke-linecap="round"/>
        <circle cx="100" cy="85" r="14" fill="#059669"/>
        <path d="M96 85 C96 79, 104 79, 104 85 C104 91, 96 91, 96 85" fill="#fbbf24"/>
      </svg>
    `.trim())}`,
  },
  {
    id: 'cangkir-modern',
    name: 'Cangkir Kopi Modern',
    category: 'Modern Cafe',
    dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <defs>
          <linearGradient id="warmBrown" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#78350f"/>
            <stop offset="100%" stop-color="#451a03"/>
          </linearGradient>
        </defs>
        <rect width="200" height="200" rx="44" fill="url(#warmBrown)"/>
        <!-- Minimal Cup and Saucer -->
        <ellipse cx="100" cy="148" rx="55" ry="12" fill="#d97706" opacity="0.8"/>
        <ellipse cx="100" cy="146" rx="46" ry="9" fill="#fef3c7"/>
        <path d="M65 72 L135 72 L128 126 C126 138, 114 146, 100 146 C86 146, 74 138, 72 126 Z" fill="#ffffff"/>
        <path d="M135 84 C148 84, 156 94, 154 108 C152 118, 142 124, 130 124" stroke="#ffffff" stroke-width="7" stroke-linecap="round" fill="none"/>
        <!-- Heart Latte Art -->
        <path d="M100 86 C94 76, 80 80, 80 92 C80 104, 100 116, 100 116 C100 116, 120 104, 120 92 C120 80, 106 76, 100 86 Z" fill="#b45309"/>
      </svg>
    `.trim())}`,
  },
  {
    id: 'biji-kopi-emas',
    name: 'Artisan Coffee Bean',
    category: 'Premium Roastery',
    dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <defs>
          <linearGradient id="darkBg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#18181b"/>
            <stop offset="100%" stop-color="#09090b"/>
          </linearGradient>
          <linearGradient id="goldBean" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#fde68a"/>
            <stop offset="50%" stop-color="#d97706"/>
            <stop offset="100%" stop-color="#92400e"/>
          </linearGradient>
        </defs>
        <rect width="200" height="200" rx="44" fill="url(#darkBg)"/>
        <!-- Outer circle dashed -->
        <circle cx="100" cy="100" r="74" fill="none" stroke="#d97706" stroke-width="3" stroke-dasharray="6 6"/>
        <circle cx="100" cy="100" r="64" fill="none" stroke="#f59e0b" stroke-width="2"/>
        <!-- Bean tilted -->
        <g transform="translate(100, 100) rotate(-28) translate(-100, -100)">
          <path d="M100 48 C128 48, 146 72, 146 100 C146 128, 128 152, 100 152 C72 152, 54 128, 54 100 C54 72, 72 48, 100 48 Z" fill="url(#goldBean)"/>
          <path d="M100 52 C108 72, 88 94, 100 100 C112 106, 92 128, 100 148" stroke="#18181b" stroke-width="7" stroke-linecap="round" fill="none"/>
        </g>
      </svg>
    `.trim())}`,
  },
  {
    id: 'daun-kopi-organik',
    name: 'Eco Coffee & Leaf',
    category: 'Organik & Sehat',
    dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <defs>
          <linearGradient id="forest" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#065f46"/>
            <stop offset="100%" stop-color="#022c22"/>
          </linearGradient>
        </defs>
        <rect width="200" height="200" rx="44" fill="url(#forest)"/>
        <!-- Coffee Cup -->
        <path d="M70 90 L130 90 L124 136 C122 148, 112 154, 100 154 C88 154, 78 148, 76 136 Z" fill="#ecfdf5"/>
        <path d="M130 98 C142 98, 148 106, 146 118 C144 126, 136 132, 126 132" stroke="#ecfdf5" stroke-width="6" stroke-linecap="round" fill="none"/>
        <!-- Fresh green leaves growing out -->
        <path d="M100 88 C100 60, 70 50, 70 50 C70 50, 80 80, 100 88 Z" fill="#34d399"/>
        <path d="M100 88 C100 56, 130 42, 130 42 C130 42, 124 74, 100 88 Z" fill="#10b981"/>
        <path d="M100 88 L100 54" stroke="#065f46" stroke-width="2.5" stroke-linecap="round"/>
      </svg>
    `.trim())}`,
  },
  {
    id: 'vintage-badge',
    name: 'Vintage Roastery Badge',
    category: 'Retro & Klasik',
    dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <defs>
          <linearGradient id="retroBg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#9a3412"/>
            <stop offset="100%" stop-color="#7c2d12"/>
          </linearGradient>
        </defs>
        <rect width="200" height="200" rx="44" fill="url(#retroBg)"/>
        <!-- Octagon / Star Badge -->
        <circle cx="100" cy="100" r="76" fill="#fffbeb" stroke="#fef3c7" stroke-width="4"/>
        <circle cx="100" cy="100" r="66" fill="none" stroke="#9a3412" stroke-width="3"/>
        <!-- Coffee pot silhouette -->
        <path d="M80 72 L120 72 L124 94 L132 128 L68 128 L76 94 Z" fill="#7c2d12"/>
        <path d="M90 60 L110 60 L108 72 L92 72 Z" fill="#b45309"/>
        <circle cx="100" cy="54" r="5" fill="#b45309"/>
        <!-- Pot handle -->
        <path d="M74 84 C62 84, 58 98, 62 116 L69 116" stroke="#7c2d12" stroke-width="5" stroke-linecap="round" fill="none"/>
        <path d="M90 144 L110 144" stroke="#9a3412" stroke-width="4" stroke-linecap="round"/>
        <circle cx="82" cy="144" r="3" fill="#b45309"/>
        <circle cx="118" cy="144" r="3" fill="#b45309"/>
      </svg>
    `.trim())}`,
  },
  {
    id: 'pena-literasi',
    name: 'Pena & Kopi Inspirasi',
    category: 'Literasi & Seni',
    dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <defs>
          <linearGradient id="indigoTeal" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#1e1b4b"/>
            <stop offset="100%" stop-color="#0f766e"/>
          </linearGradient>
        </defs>
        <rect width="200" height="200" rx="44" fill="url(#indigoTeal)"/>
        <circle cx="100" cy="100" r="72" fill="none" stroke="#2dd4bf" stroke-width="2.5" opacity="0.6"/>
        <!-- Quill Pen crossed with Coffee Mug -->
        <!-- Mug -->
        <path d="M72 80 L122 80 L118 126 C116 136, 108 142, 97 142 C86 142, 78 136, 76 126 Z" fill="#ffffff"/>
        <path d="M122 88 C132 88, 138 96, 136 108 C134 116, 126 122, 118 122" stroke="#ffffff" stroke-width="5.5" stroke-linecap="round" fill="none"/>
        <!-- Feather Quill diagonal -->
        <path d="M145 35 C145 35, 110 65, 102 105 L96 135 L106 128 C122 108, 155 75, 155 45 C155 35, 145 35, 145 35 Z" fill="#facc15"/>
        <path d="M102 105 L145 35" stroke="#ca8a04" stroke-width="2" stroke-linecap="round"/>
      </svg>
    `.trim())}`,
  },
  {
    id: 'estetik-minimalis',
    name: 'Estetik Line Coffee',
    category: 'Minimalis Estetik',
    dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <rect width="200" height="200" rx="44" fill="#fafaf9"/>
        <circle cx="100" cy="100" r="74" fill="#f5f5f4" stroke="#e7e5e4" stroke-width="2"/>
        <!-- Elegant continuous line coffee cup -->
        <path d="M68 84 L132 84 L126 130 C124 142, 112 150, 100 150 C88 150, 76 142, 74 130 Z" fill="#292524"/>
        <path d="M132 94 C144 94, 152 104, 150 116 C148 124, 140 130, 128 130" stroke="#292524" stroke-width="6" stroke-linecap="round" fill="none"/>
        <!-- Minimal Steam swirl -->
        <path d="M90 62 C88 50, 98 44, 94 34" stroke="#78716c" stroke-width="3.5" stroke-linecap="round" fill="none"/>
        <path d="M108 60 C106 48, 116 42, 112 32" stroke="#78716c" stroke-width="3.5" stroke-linecap="round" fill="none"/>
      </svg>
    `.trim())}`,
  },
  {
    id: 'baker-pastry',
    name: 'Cafe, Bakery & Pastry',
    category: 'Bakery & Cafe',
    dataUrl: `data:image/svg+xml;utf8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
        <defs>
          <linearGradient id="pastryBg" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ea580c"/>
            <stop offset="100%" stop-color="#9a3412"/>
          </linearGradient>
        </defs>
        <rect width="200" height="200" rx="44" fill="url(#pastryBg)"/>
        <!-- Croissant icon -->
        <path d="M100 60 C128 60, 156 80, 160 110 C162 124, 144 140, 134 132 C126 126, 128 114, 122 106 C116 98, 108 94, 100 94 C92 94, 84 98, 78 106 C72 114, 74 126, 66 132 C56 140, 38 124, 40 110 C44 80, 72 60, 100 60 Z" fill="#fed7aa"/>
        <path d="M84 76 C94 72, 106 72, 116 76" stroke="#ea580c" stroke-width="4" stroke-linecap="round"/>
        <path d="M72 96 C80 92, 90 90, 100 90 C110 90, 120 92, 128 96" stroke="#ea580c" stroke-width="3.5" stroke-linecap="round"/>
        <!-- Sparkles -->
        <circle cx="50" cy="54" r="4" fill="#ffedd5"/>
        <circle cx="150" cy="54" r="4" fill="#ffedd5"/>
        <circle cx="100" cy="154" r="4" fill="#ffedd5"/>
      </svg>
    `.trim())}`,
  },
];
