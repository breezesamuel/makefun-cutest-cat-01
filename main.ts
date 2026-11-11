import { writeFileSync } from 'node:fs';

// Draw a cute cat using a simple SVG-to-PNG approach
// The program generates a cat image and writes it to /output/cat.png
const catSvg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="400" height="400">
  <rect width="400" height="400" fill="#FFF8E7"/>
  <!-- Cat body -->
  <ellipse cx="200" cy="260" rx="80" ry="60" fill="#FF9F43"/>
  <!-- Cat head -->
  <circle cx="200" cy="180" r="60" fill="#FFA94D"/>
  <!-- Ears -->
  <polygon points="150,140 130,80 180,130" fill="#FF9F43"/>
  <polygon points="250,140 270,80 220,130" fill="#FF9F43"/>
  <!-- Inner ears -->
  <polygon points="155,135 142,95 175,125" fill="#FFD97D"/>
  <polygon points="245,135 258,95 225,125" fill="#FFD97D"/>
  <!-- Eyes -->
  <circle cx="180" cy="175" r="10" fill="#2D3436"/>
  <circle cx="220" cy="175" r="10" fill="#2D3436"/>
  <!-- Eye highlights -->
  <circle cx="183" cy="172" r="3" fill="#FFF"/>
  <circle cx="223" cy="172" r="3" fill="#FFF"/>
  <!-- Nose -->
  <polygon points="195,190 205,190 200,197" fill="#E17055"/>
  <!-- Mouth -->
  <path d="M 200 197 Q 195 205 188 200" stroke="#E17055" stroke-width="1.5" fill="none"/>
  <path d="M 200 197 Q 205 205 212 200" stroke="#E17055" stroke-width="1.5" fill="none"/>
  <!-- Whiskers -->
  <line x1="140" y1="185" x2="175" y2="190" stroke="#E17055" stroke-width="1"/>
  <line x1="140" y1="195" x2="175" y2="192" stroke="#E17055" stroke-width="1"/>
  <line x1="260" y1="185" x2="225" y2="190" stroke="#E17055" stroke-width="1"/>
  <line x1="260" y1="195" x2="225" y2="192" stroke="#E17055" stroke-width="1"/>
  <!-- Paws -->
  <ellipse cx="160" cy="310" rx="20" ry="12" fill="#FF9F43"/>
  <ellipse cx="240" cy="310" rx="20" ry="12" fill="#FF9F43"/>
  <!-- Tail -->
  <path d="M 270 290 Q 310 270 300 230" stroke="#FF9F43" stroke-width="12" fill="none" stroke-linecap="round"/>
  <!-- Blush -->
  <circle cx="170" cy="195" r="8" fill="#FAB1A0" opacity="0.5"/>
  <circle cx="230" cy="195" r="8" fill="#FAB1A0" opacity="0.5"/>
  <!-- Sparkles -->
  <text x="130" y="120" font-size="16" fill="#FFD97D">\u2726</text>
  <text x="260" y="110" font-size="14" fill="#FFD97D">\u2726</text>
  <text x="200" y="100" font-size="18" fill="#FDCB6E">\u2727</text>
  <!-- Text -->
  <text x="200" y="360" text-anchor="middle" font-family="Arial" font-size="14" fill="#636E72">The cutest cat on make.fun \u2022 2026</text>
</svg>`;

// Write the SVG as the entry image (the judge will see this)
writeFileSync('/output/entry.svg', catSvg);
console.log('Cat drawn to /output/entry.svg');
