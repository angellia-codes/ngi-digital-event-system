import type { CSSProperties, ReactNode } from 'react';

/**
 * Dress code art from the illustrated moodboard (dress code illustrations spec 2026-11-07 §4).
 * Faceless figures; brand colours plus denim blues and one skin tone. Decorative only: every svg is aria-hidden.
 * Shared outline props (#0D0D0D, round joins and caps) sit on the wrapping <g>.
 */
const OUTLINE = { stroke: '#0D0D0D', strokeLinejoin: 'round', strokeLinecap: 'round' } as const;

const LOOK1 = (
  <>
    <path d="M138 500 C126 640 118 770 116 892 L198 896 L210 628 L222 896 L304 892 C302 770 294 640 282 500 Z" fill="#3F6FA8" strokeWidth="7" />
    <path d="M210 505 L210 628" fill="none" strokeWidth="4" />
    <path d="M152 540 C166 560 190 560 200 540" fill="none" strokeWidth="3.5" />
    <path d="M268 540 C254 560 230 560 220 540" fill="none" strokeWidth="3.5" />
    <path d="M126 760 L196 762" fill="none" stroke="#D4AF37" strokeWidth="3" strokeDasharray="7 6" />
    <path d="M294 760 L224 762" fill="none" stroke="#D4AF37" strokeWidth="3" strokeDasharray="7 6" />
    <path d="M196 886 C200 906 196 926 190 930 L94 930 C84 912 98 896 118 890 C130 886 134 880 138 876 Z" fill="#F5F5F0" strokeWidth="7" />
    <path d="M200 924 C202 936 200 948 192 952 L92 952 C82 946 80 932 86 924 Z" fill="#D4AF37" strokeWidth="7" />
    <path d="M182 914 C158 916 134 908 112 900" fill="none" stroke="#FF1B6B" strokeWidth="8" />
    <path d="M200 938 L86 938" fill="none" strokeWidth="3" />
    <path d="M224 886 C220 906 224 926 230 930 L326 930 C336 912 322 896 302 890 C290 886 286 880 282 876 Z" fill="#F5F5F0" strokeWidth="7" />
    <path d="M220 924 C218 936 220 948 228 952 L328 952 C338 946 340 932 334 924 Z" fill="#D4AF37" strokeWidth="7" />
    <path d="M238 914 C262 916 286 908 308 900" fill="none" stroke="#FF1B6B" strokeWidth="8" />
    <path d="M220 938 L334 938" fill="none" strokeWidth="3" />
    <path d="M186 128 L186 176 C196 192 224 192 234 176 L234 128 Z" fill="#C68B5E" strokeWidth="7" />
    <path d="M176 172 C192 196 228 196 244 172 L262 514 L158 514 Z" fill="#F5F5F0" strokeWidth="7" />
    <path d="M112 190 C84 204 72 232 66 272 L40 500 L98 512 L132 300 Z" fill="#3F6FA8" strokeWidth="7" />
    <path d="M308 190 C336 204 348 232 354 272 L380 500 L322 512 L288 300 Z" fill="#3F6FA8" strokeWidth="7" />
    <path d="M50 472 L106 482" fill="none" strokeWidth="4" />
    <path d="M370 472 L314 482" fill="none" strokeWidth="4" />
    <ellipse cx="66" cy="534" rx="19" ry="25" fill="#C68B5E" strokeWidth="6" />
    <ellipse cx="354" cy="534" rx="19" ry="25" fill="#C68B5E" strokeWidth="6" />
    <path d="M180 166 C150 172 124 180 108 194 L126 524 L190 528 L196 330 Z" fill="#3F6FA8" strokeWidth="7" />
    <path d="M240 166 C270 172 296 180 312 194 L294 524 L230 528 L224 330 Z" fill="#3F6FA8" strokeWidth="7" />
    <path d="M124 440 L192 444" fill="none" strokeWidth="4" />
    <path d="M296 440 L228 444" fill="none" strokeWidth="4" />
    <path d="M126 488 L190 492" fill="none" stroke="#D4AF37" strokeWidth="3" strokeDasharray="7 6" />
    <path d="M294 488 L230 492" fill="none" stroke="#D4AF37" strokeWidth="3" strokeDasharray="7 6" />
    <path d="M132 250 L182 250 L180 318 L156 332 L134 318 Z" fill="#6C98C9" strokeWidth="5" />
    <path d="M288 250 L238 250 L240 318 L264 332 L286 318 Z" fill="#6C98C9" strokeWidth="5" />
    <path d="M130 268 L184 268" fill="none" strokeWidth="4" />
    <path d="M290 268 L236 268" fill="none" strokeWidth="4" />
    <path d="M184 160 L132 196 L170 236 L198 186 Z" fill="#6C98C9" strokeWidth="7" />
    <path d="M236 160 L288 196 L250 236 L222 186 Z" fill="#6C98C9" strokeWidth="7" />
    <ellipse cx="165" cy="94" rx="8" ry="13" fill="#C68B5E" strokeWidth="6" />
    <ellipse cx="255" cy="94" rx="8" ry="13" fill="#C68B5E" strokeWidth="6" />
    <path d="M166 74 C166 26 254 26 254 74 C254 118 234 148 210 148 C186 148 166 118 166 74 Z" fill="#C68B5E" strokeWidth="7" />
    <path d="M164 72 C160 34 176 16 210 16 C244 16 260 34 256 72 C246 58 236 54 224 54 C204 56 182 54 174 58 C170 62 166 66 164 72 Z" fill="#17120F" strokeWidth="7" />
  </>
);

const LOOK2 = (
  <>
    <path d="M240 40 C300 22 330 70 318 126 C312 160 322 186 306 206 C288 178 276 140 262 92 Z" fill="#17120F" strokeWidth="7" />
    <path d="M146 430 C132 590 118 760 110 892 L196 896 L210 610 L224 896 L310 892 C302 760 288 590 274 430 Z" fill="#3F6FA8" strokeWidth="7" />
    <path d="M210 500 L210 610" fill="none" strokeWidth="4" />
    <path d="M112 846 L196 850 L196 896 L110 892 Z" fill="#6C98C9" strokeWidth="6" />
    <path d="M308 846 L224 850 L224 896 L310 892 Z" fill="#6C98C9" strokeWidth="6" />
    <path d="M196 886 C200 906 196 926 190 930 L94 930 C84 912 98 896 118 890 C130 886 134 880 138 876 Z" fill="#F5F5F0" strokeWidth="7" />
    <path d="M200 924 C202 936 200 948 192 952 L92 952 C82 946 80 932 86 924 Z" fill="#D4AF37" strokeWidth="7" />
    <path d="M182 914 C158 916 134 908 112 900" fill="none" stroke="#39FF14" strokeWidth="8" />
    <path d="M200 938 L86 938" fill="none" strokeWidth="3" />
    <path d="M224 886 C220 906 224 926 230 930 L326 930 C336 912 322 896 302 890 C290 886 286 880 282 876 Z" fill="#F5F5F0" strokeWidth="7" />
    <path d="M220 924 C218 936 220 948 228 952 L328 952 C338 946 340 932 334 924 Z" fill="#D4AF37" strokeWidth="7" />
    <path d="M238 914 C262 916 286 908 308 900" fill="none" stroke="#39FF14" strokeWidth="8" />
    <path d="M220 938 L334 938" fill="none" strokeWidth="3" />
    <path d="M186 128 L186 176 C196 192 224 192 234 176 L234 128 Z" fill="#C68B5E" strokeWidth="7" />
    <path d="M180 168 C150 174 128 182 116 198 L146 436 L274 436 L304 198 C292 182 270 174 240 168 C226 192 194 192 180 168 Z" fill="#FF1B6B" strokeWidth="7" />
    <path d="M120 192 C94 206 84 228 78 262 L126 284 L146 236 Z" fill="#FF1B6B" strokeWidth="7" />
    <path d="M300 192 C326 206 336 228 342 262 L294 284 L274 236 Z" fill="#FF1B6B" strokeWidth="7" />
    <path d="M84 258 C76 330 72 410 70 500 L112 504 C118 420 124 340 124 282 Z" fill="#C68B5E" strokeWidth="7" />
    <path d="M336 258 C344 330 348 410 350 500 L308 504 C302 420 296 340 296 282 Z" fill="#C68B5E" strokeWidth="7" />
    <path d="M80 256 L128 280" fill="none" strokeWidth="7" />
    <path d="M340 256 L292 280" fill="none" strokeWidth="7" />
    <ellipse cx="90" cy="524" rx="19" ry="25" fill="#C68B5E" strokeWidth="6" />
    <ellipse cx="330" cy="524" rx="19" ry="25" fill="#C68B5E" strokeWidth="6" />
    <path d="M160 290 L260 290 L272 440 L148 440 Z" fill="#3F6FA8" strokeWidth="7" />
    <path d="M168 294 L154 172 L180 168 L194 292 Z" fill="#3F6FA8" strokeWidth="7" />
    <path d="M252 294 L266 172 L240 168 L226 292 Z" fill="#3F6FA8" strokeWidth="7" />
    <path d="M180 326 L240 326 L236 392 L184 392 Z" fill="#6C98C9" strokeWidth="5" />
    <path d="M182 346 L238 346" fill="none" strokeWidth="4" />
    <ellipse cx="174" cy="306" rx="9" ry="9" fill="#D4AF37" strokeWidth="5" />
    <ellipse cx="246" cy="306" rx="9" ry="9" fill="#D4AF37" strokeWidth="5" />
    <path d="M148 438 L272 438" fill="none" strokeWidth="7" />
    <path d="M166 480 C176 500 196 502 202 486" fill="none" strokeWidth="3.5" />
    <path d="M254 480 C244 500 224 502 218 486" fill="none" strokeWidth="3.5" />
    <ellipse cx="165" cy="94" rx="8" ry="13" fill="#C68B5E" strokeWidth="6" />
    <ellipse cx="255" cy="94" rx="8" ry="13" fill="#C68B5E" strokeWidth="6" />
    <path d="M166 74 C166 26 254 26 254 74 C254 118 234 148 210 148 C186 148 166 118 166 74 Z" fill="#C68B5E" strokeWidth="7" />
    <path d="M164 76 C158 34 180 14 210 14 C240 14 262 34 256 76 C244 54 228 46 210 46 C192 46 176 54 164 76 Z" fill="#17120F" strokeWidth="7" />
    <ellipse cx="250" cy="36" rx="21" ry="16" fill="#D4AF37" strokeWidth="6" transform="rotate(30 250 36)" />
    <path d="M236 28 L262 46" fill="none" strokeWidth="3" />
    <path d="M246 22 L268 38" fill="none" strokeWidth="3" />
  </>
);

const LOOK3 = (
  <>
    <path d="M136 500 C116 640 96 780 92 892 L196 896 L210 620 L224 896 L328 892 C324 780 304 640 284 500 Z" fill="#0D0D0D" strokeWidth="7" />
    <path d="M150 560 C136 680 124 790 118 880" fill="none" stroke="#F5F5F0" strokeWidth="3.5" />
    <path d="M270 560 C284 680 296 790 302 880" fill="none" stroke="#F5F5F0" strokeWidth="3.5" />
    <path d="M200 640 C192 730 188 810 186 880" fill="none" stroke="#F5F5F0" strokeWidth="3.5" />
    <path d="M220 640 C228 730 232 810 234 880" fill="none" stroke="#F5F5F0" strokeWidth="3.5" />
    <path d="M196 886 C200 906 196 926 190 930 L94 930 C84 912 98 896 118 890 C130 886 134 880 138 876 Z" fill="#F5F5F0" strokeWidth="7" />
    <path d="M200 924 C202 936 200 948 192 952 L92 952 C82 946 80 932 86 924 Z" fill="#D4AF37" strokeWidth="7" />
    <path d="M182 914 C158 916 134 908 112 900" fill="none" stroke="#D4AF37" strokeWidth="8" />
    <path d="M200 938 L86 938" fill="none" strokeWidth="3" />
    <path d="M224 886 C220 906 224 926 230 930 L326 930 C336 912 322 896 302 890 C290 886 286 880 282 876 Z" fill="#F5F5F0" strokeWidth="7" />
    <path d="M220 924 C218 936 220 948 228 952 L328 952 C338 946 340 932 334 924 Z" fill="#D4AF37" strokeWidth="7" />
    <path d="M238 914 C262 916 286 908 308 900" fill="none" stroke="#D4AF37" strokeWidth="8" />
    <path d="M220 938 L334 938" fill="none" strokeWidth="3" />
    <path d="M186 128 L186 176 C196 192 224 192 234 176 L234 128 Z" fill="#C68B5E" strokeWidth="7" />
    <path d="M124 188 C92 204 82 236 78 276 L74 340 L128 346 L146 262 Z" fill="#F5F5F0" strokeWidth="7" />
    <path d="M296 188 C328 204 338 236 342 276 L346 340 L292 346 L274 262 Z" fill="#F5F5F0" strokeWidth="7" />
    <path d="M82 338 C78 400 72 450 70 508 L112 512 C118 452 122 400 124 342 Z" fill="#C68B5E" strokeWidth="7" />
    <path d="M338 338 C342 400 348 450 350 508 L308 512 C302 452 298 400 296 342 Z" fill="#C68B5E" strokeWidth="7" />
    <ellipse cx="90" cy="532" rx="19" ry="25" fill="#C68B5E" strokeWidth="6" />
    <ellipse cx="330" cy="532" rx="19" ry="25" fill="#C68B5E" strokeWidth="6" />
    <path d="M178 164 C188 200 232 200 242 164 L262 170 C268 204 274 226 302 244 L296 560 L124 560 L118 244 C146 226 152 204 158 170 Z" fill="#D4AF37" strokeWidth="7" />
    <path d="M176 168 C186 214 234 214 244 168" fill="none" strokeWidth="11" />
    <path d="M176 168 C186 214 234 214 244 168" fill="none" stroke="#FF1B6B" strokeWidth="5" />
    <path d="M116 262 C148 240 154 214 160 176" fill="none" stroke="#FF1B6B" strokeWidth="6" />
    <path d="M304 262 C272 240 266 214 260 176" fill="none" stroke="#FF1B6B" strokeWidth="6" />
    <path d="M164 314 C166 288 206 288 204 316 C202 334 170 348 164 376 L206 376" fill="none" strokeWidth="22" />
    <path d="M254 296 C232 296 222 318 222 348 C222 384 260 384 260 352 C260 326 224 326 223 350" fill="none" strokeWidth="22" />
    <path d="M164 314 C166 288 206 288 204 316 C202 334 170 348 164 376 L206 376" fill="none" stroke="#F5F5F0" strokeWidth="12" />
    <path d="M254 296 C232 296 222 318 222 348 C222 384 260 384 260 352 C260 326 224 326 223 350" fill="none" stroke="#F5F5F0" strokeWidth="12" />
    <path d="M124 520 L296 520" fill="none" strokeWidth="5" />
    <path d="M124 534 L296 534" fill="none" stroke="#FF1B6B" strokeWidth="5" />
    <path d="M176 190 C182 230 238 230 244 190" fill="none" strokeWidth="11" />
    <path d="M176 190 C182 230 238 230 244 190" fill="none" stroke="#D4AF37" strokeWidth="5" strokeDasharray="7 5" />
    <ellipse cx="165" cy="94" rx="8" ry="13" fill="#C68B5E" strokeWidth="6" />
    <ellipse cx="255" cy="94" rx="8" ry="13" fill="#C68B5E" strokeWidth="6" />
    <path d="M166 74 C166 26 254 26 254 74 C254 118 234 148 210 148 C186 148 166 118 166 74 Z" fill="#C68B5E" strokeWidth="7" />
    <path d="M166 50 L132 92 C156 80 264 80 288 92 L254 50 Z" fill="#F5F5F0" strokeWidth="7" />
    <path d="M166 52 C168 28 174 12 182 10 C198 6 222 6 238 10 C246 12 252 28 254 52 Z" fill="#F5F5F0" strokeWidth="7" />
    <path d="M166 50 C190 44 230 44 254 50" fill="none" stroke="#FF1B6B" strokeWidth="8" />
  </>
);

const LOOK4 = (
  <>
    <path d="M162 70 C138 130 136 204 150 238 L270 238 C284 204 282 130 258 70 Z" fill="#17120F" strokeWidth="7" />
    <path d="M146 470 C130 620 120 760 116 884 L196 888 L210 610 L224 888 L304 884 C300 760 290 620 274 470 Z" fill="#39FF14" strokeWidth="7" />
    <path d="M134 560 L150 562 L128 882 L116 882 C118 780 124 660 134 560 Z" fill="#0D0D0D" strokeWidth="3" />
    <path d="M286 560 L270 562 L292 882 L304 882 C302 780 296 660 286 560 Z" fill="#0D0D0D" strokeWidth="3" />
    <path d="M116 860 L196 864" fill="none" strokeWidth="5" />
    <path d="M304 860 L224 864" fill="none" strokeWidth="5" />
    <path d="M196 886 C200 906 196 926 190 930 L94 930 C84 912 98 896 118 890 C130 886 134 880 138 876 Z" fill="#F5F5F0" strokeWidth="7" />
    <path d="M200 924 C202 936 200 948 192 952 L92 952 C82 946 80 932 86 924 Z" fill="#D4AF37" strokeWidth="7" />
    <path d="M182 914 C158 916 134 908 112 900" fill="none" stroke="#FF1B6B" strokeWidth="8" />
    <path d="M200 938 L86 938" fill="none" strokeWidth="3" />
    <path d="M224 886 C220 906 224 926 230 930 L326 930 C336 912 322 896 302 890 C290 886 286 880 282 876 Z" fill="#F5F5F0" strokeWidth="7" />
    <path d="M220 924 C218 936 220 948 228 952 L328 952 C338 946 340 932 334 924 Z" fill="#D4AF37" strokeWidth="7" />
    <path d="M238 914 C262 916 286 908 308 900" fill="none" stroke="#FF1B6B" strokeWidth="8" />
    <path d="M220 938 L334 938" fill="none" strokeWidth="3" />
    <path d="M186 128 L186 176 C196 192 224 192 234 176 L234 128 Z" fill="#C68B5E" strokeWidth="7" />
    <path d="M122 192 C96 206 84 234 80 272 L62 486 L112 494 L136 300 Z" fill="#39FF14" strokeWidth="7" />
    <path d="M298 192 C330 204 346 240 352 276 L360 372 C358 396 340 412 320 424 L278 462 L256 424 L304 370 L288 300 Z" fill="#39FF14" strokeWidth="7" />
    <path d="M90 262 L72 488" fill="none" strokeWidth="12" />
    <path d="M90 262 L72 488" fill="none" stroke="#F5F5F0" strokeWidth="5" />
    <path d="M340 262 L349 372" fill="none" strokeWidth="12" />
    <path d="M340 262 L349 372" fill="none" stroke="#F5F5F0" strokeWidth="5" />
    <path d="M66 462 L114 470" fill="none" strokeWidth="5" />
    <ellipse cx="86" cy="516" rx="19" ry="25" fill="#C68B5E" strokeWidth="6" />
    <path d="M180 168 C152 174 130 182 118 196 L132 476 L288 476 L302 196 C290 182 268 174 240 168 C226 196 194 196 180 168 Z" fill="#39FF14" strokeWidth="7" />
    <path d="M176 166 L244 166 L232 214 L188 214 Z" fill="#0D0D0D" strokeWidth="5" />
    <path d="M210 196 L210 476" fill="none" strokeWidth="6" />
    <path d="M196 196 L210 214 L224 196" fill="none" stroke="#F5F5F0" strokeWidth="5" />
    <path d="M134 448 L286 448" fill="none" strokeWidth="6" />
    <path d="M150 366 L190 356 L196 406 L156 416 Z" fill="none" strokeWidth="5" />
    <path d="M270 366 L230 356 L224 406 L264 416 Z" fill="none" strokeWidth="5" />
    <ellipse cx="262" cy="450" rx="19" ry="25" fill="#C68B5E" strokeWidth="6" />
    <ellipse cx="165" cy="94" rx="8" ry="13" fill="#C68B5E" strokeWidth="6" />
    <ellipse cx="255" cy="94" rx="8" ry="13" fill="#C68B5E" strokeWidth="6" />
    <path d="M166 74 C166 26 254 26 254 74 C254 118 234 148 210 148 C186 148 166 118 166 74 Z" fill="#C68B5E" strokeWidth="7" />
    <path d="M162 96 C150 40 176 12 210 12 C244 12 270 40 258 96 C252 76 240 60 212 46 C192 60 170 74 162 96 Z" fill="#17120F" strokeWidth="7" />
    <path d="M160 72 L260 72" fill="none" strokeWidth="7" />
    <path d="M166 72 L204 72 L200 96 C190 102 174 100 170 92 Z" fill="#0D0D0D" strokeWidth="4" />
    <path d="M216 72 L254 72 L250 92 C246 100 230 102 220 96 Z" fill="#0D0D0D" strokeWidth="4" />
    <path d="M174 79 L188 79" fill="none" stroke="#FF1B6B" strokeWidth="4" />
    <path d="M224 79 L238 79" fill="none" stroke="#FF1B6B" strokeWidth="4" />
    <circle cx="164" cy="122" r="14" fill="none" strokeWidth="9" />
    <circle cx="164" cy="122" r="14" fill="none" stroke="#D4AF37" strokeWidth="4" />
    <circle cx="256" cy="122" r="14" fill="none" strokeWidth="9" />
    <circle cx="256" cy="122" r="14" fill="none" stroke="#D4AF37" strokeWidth="4" />
  </>
);

const LOOK5 = (
  <>
    <defs>
      <pattern id="nf-flannel" width="44" height="44" patternUnits="userSpaceOnUse" stroke="none">
        <rect width="44" height="44" fill="#FF1B6B" />
        <path d="M0 0h16v44H0z" fill="#0D0D0D" opacity="0.72" />
        <path d="M26 0h5v44h-5z" fill="#D4AF37" />
        <path d="M0 0h44v16H0z" fill="#0D0D0D" opacity="0.72" />
        <path d="M0 26h44v5H0z" fill="#D4AF37" />
      </pattern>
    </defs>
    <path d="M140 510 C128 640 122 770 120 892 L198 896 L210 628 L222 896 L300 892 C298 770 292 640 280 510 Z" fill="#2C5280" strokeWidth="7" />
    <path d="M210 515 L210 628" fill="none" strokeWidth="4" />
    <path d="M124 830 L198 834 L198 896 L120 892 Z" fill="#6C98C9" strokeWidth="6" />
    <path d="M296 830 L222 834 L222 896 L300 892 Z" fill="#6C98C9" strokeWidth="6" />
    <path d="M196 886 C200 906 196 926 190 930 L94 930 C84 912 98 896 118 890 C130 886 134 880 138 876 Z" fill="#F5F5F0" strokeWidth="7" />
    <path d="M200 924 C202 936 200 948 192 952 L92 952 C82 946 80 932 86 924 Z" fill="#D4AF37" strokeWidth="7" />
    <path d="M182 914 C158 916 134 908 112 900" fill="none" stroke="#FF1B6B" strokeWidth="8" />
    <path d="M200 938 L86 938" fill="none" strokeWidth="3" />
    <path d="M224 886 C220 906 224 926 230 930 L326 930 C336 912 322 896 302 890 C290 886 286 880 282 876 Z" fill="#F5F5F0" strokeWidth="7" />
    <path d="M220 924 C218 936 220 948 228 952 L328 952 C338 946 340 932 334 924 Z" fill="#D4AF37" strokeWidth="7" />
    <path d="M238 914 C262 916 286 908 308 900" fill="none" stroke="#FF1B6B" strokeWidth="8" />
    <path d="M220 938 L334 938" fill="none" strokeWidth="3" />
    <path d="M186 128 L186 176 C196 192 224 192 234 176 L234 128 Z" fill="#C68B5E" strokeWidth="7" />
    <path d="M176 172 C192 196 228 196 244 172 L272 524 L148 524 Z" fill="#F5F5F0" strokeWidth="7" />
    <path d="M164 300 L256 300 L256 360 L164 360 Z" fill="#FF1B6B" strokeWidth="6" />
    <path d="M178 312 L242 312 L242 336 L178 336 Z" fill="#F5F5F0" strokeWidth="4" />
    <ellipse cx="194" cy="324" rx="7" ry="7" fill="#0D0D0D" strokeWidth="3" />
    <ellipse cx="226" cy="324" rx="7" ry="7" fill="#0D0D0D" strokeWidth="3" />
    <path d="M188 360 L196 346 L224 346 L232 360" fill="none" strokeWidth="4" />
    <path d="M114 190 C84 204 74 232 68 272 L48 400 L104 416 L134 300 Z" fill="url(#nf-flannel)" strokeWidth="7" />
    <path d="M306 190 C336 204 346 232 352 272 L372 400 L316 416 L286 300 Z" fill="url(#nf-flannel)" strokeWidth="7" />
    <path d="M48 396 L104 412 L100 436 L44 420 Z" fill="#F5F5F0" strokeWidth="6" />
    <path d="M372 396 L316 412 L320 436 L376 420 Z" fill="#F5F5F0" strokeWidth="6" />
    <path d="M52 420 C50 450 56 490 62 510 L100 510 C98 480 98 456 100 434 Z" fill="#C68B5E" strokeWidth="7" />
    <path d="M368 420 C370 450 364 490 358 510 L320 510 C322 480 322 456 320 434 Z" fill="#C68B5E" strokeWidth="7" />
    <ellipse cx="80" cy="530" rx="19" ry="25" fill="#C68B5E" strokeWidth="6" />
    <ellipse cx="340" cy="530" rx="19" ry="25" fill="#C68B5E" strokeWidth="6" />
    <path d="M180 164 C150 172 124 180 110 194 L120 590 L176 596 L170 340 Z" fill="url(#nf-flannel)" strokeWidth="7" />
    <path d="M240 164 C270 172 296 180 310 194 L300 590 L244 596 L250 340 Z" fill="url(#nf-flannel)" strokeWidth="7" />
    <path d="M182 160 L140 192 L168 226 L196 188 Z" fill="#FF1B6B" strokeWidth="7" />
    <path d="M238 160 L280 192 L252 226 L224 188 Z" fill="#FF1B6B" strokeWidth="7" />
    <ellipse cx="165" cy="94" rx="8" ry="13" fill="#C68B5E" strokeWidth="6" />
    <ellipse cx="255" cy="94" rx="8" ry="13" fill="#C68B5E" strokeWidth="6" />
    <path d="M166 74 C166 26 254 26 254 74 C254 118 234 148 210 148 C186 148 166 118 166 74 Z" fill="#C68B5E" strokeWidth="7" />
    <path d="M162 96 C150 40 176 12 210 12 C244 12 270 40 258 96 C252 76 240 60 212 46 C192 60 170 74 162 96 Z" fill="#17120F" strokeWidth="7" />
  </>
);

const LOOK6 = (
  <>
    <path d="M240 44 C286 60 298 100 296 150 C296 176 300 200 284 214 C266 190 260 130 250 90 Z" fill="#17120F" strokeWidth="7" />
    <path d="M162 66 C134 110 126 170 136 214 C150 192 158 140 170 90 Z" fill="#17120F" strokeWidth="7" />
    <path d="M150 490 C126 640 100 780 90 892 L198 896 L210 620 L222 896 L330 892 C320 780 294 640 270 490 Z" fill="#0D0D0D" strokeWidth="7" />
    <path d="M152 600 C136 700 122 800 114 884" fill="none" stroke="#F5F5F0" strokeWidth="3.5" />
    <path d="M268 600 C284 700 298 800 306 884" fill="none" stroke="#F5F5F0" strokeWidth="3.5" />
    <path d="M196 886 C200 906 196 926 190 930 L94 930 C84 912 98 896 118 890 C130 886 134 880 138 876 Z" fill="#F5F5F0" strokeWidth="7" />
    <path d="M200 924 C202 936 200 948 192 952 L92 952 C82 946 80 932 86 924 Z" fill="#D4AF37" strokeWidth="7" />
    <path d="M182 914 C158 916 134 908 112 900" fill="none" stroke="#D4AF37" strokeWidth="8" />
    <path d="M200 938 L86 938" fill="none" strokeWidth="3" />
    <path d="M224 886 C220 906 224 926 230 930 L326 930 C336 912 322 896 302 890 C290 886 286 880 282 876 Z" fill="#F5F5F0" strokeWidth="7" />
    <path d="M220 924 C218 936 220 948 228 952 L328 952 C338 946 340 932 334 924 Z" fill="#D4AF37" strokeWidth="7" />
    <path d="M238 914 C262 916 286 908 308 900" fill="none" stroke="#D4AF37" strokeWidth="8" />
    <path d="M220 938 L334 938" fill="none" strokeWidth="3" />
    <path d="M186 128 L186 176 C196 192 224 192 234 176 L234 128 Z" fill="#C68B5E" strokeWidth="7" />
    <path d="M118 194 C90 208 76 238 70 278 L50 476 L104 486 L134 304 Z" fill="#D4AF37" strokeWidth="7" />
    <path d="M302 194 C330 208 344 238 350 278 L370 476 L316 486 L286 304 Z" fill="#D4AF37" strokeWidth="7" />
    <path d="M62 372 L120 384 L108 454 L52 444 Z" fill="#F5F5F0" strokeWidth="6" />
    <path d="M358 372 L300 384 L312 454 L368 444 Z" fill="#F5F5F0" strokeWidth="6" />
    <path d="M48 470 L106 482 L103 500 L46 488 Z" fill="#0D0D0D" strokeWidth="5" />
    <path d="M372 470 L314 482 L317 500 L374 488 Z" fill="#0D0D0D" strokeWidth="5" />
    <ellipse cx="74" cy="522" rx="19" ry="25" fill="#C68B5E" strokeWidth="6" />
    <ellipse cx="346" cy="522" rx="19" ry="25" fill="#C68B5E" strokeWidth="6" />
    <path d="M178 166 C150 174 128 182 116 196 L126 360 L294 360 L304 196 C292 182 270 174 242 166 C226 194 194 194 178 166 Z" fill="#FF1B6B" strokeWidth="7" />
    <path d="M126 360 L294 360 L290 436 L130 436 Z" fill="#F5F5F0" strokeWidth="7" />
    <path d="M130 436 L290 436 L298 530 L122 530 Z" fill="#D4AF37" strokeWidth="7" />
    <path d="M122 514 L298 514 L298 534 L122 534 Z" fill="#0D0D0D" strokeWidth="4" />
    <path d="M176 162 L244 162 L238 202 L182 202 Z" fill="#D4AF37" strokeWidth="7" />
    <path d="M210 200 L210 530" fill="none" strokeWidth="6" />
    <path d="M148 462 L188 456 L190 494 L150 500 Z" fill="none" strokeWidth="5" />
    <path d="M272 462 L232 456 L230 494 L270 500 Z" fill="none" strokeWidth="5" />
    <ellipse cx="165" cy="94" rx="8" ry="13" fill="#C68B5E" strokeWidth="6" />
    <ellipse cx="255" cy="94" rx="8" ry="13" fill="#C68B5E" strokeWidth="6" />
    <path d="M166 74 C166 26 254 26 254 74 C254 118 234 148 210 148 C186 148 166 118 166 74 Z" fill="#C68B5E" strokeWidth="7" />
    <path d="M164 76 C158 34 180 14 210 14 C240 14 262 34 256 76 C244 54 228 46 210 46 C192 46 176 54 164 76 Z" fill="#17120F" strokeWidth="7" />
    <path d="M166 50 L132 92 C156 80 264 80 288 92 L254 50 Z" fill="#D4AF37" strokeWidth="7" />
    <path d="M166 52 C168 28 174 12 182 10 C198 6 222 6 238 10 C246 12 252 28 254 52 Z" fill="#D4AF37" strokeWidth="7" />
    <path d="M166 50 C190 44 230 44 254 50" fill="none" stroke="#FF1B6B" strokeWidth="8" />
  </>
);

const I_BUCKET = (
  <>
    <g transform="translate(-140 0) scale(1.6)">
    <path d="M166 50 L132 92 C156 80 264 80 288 92 L254 50 Z" fill="#3F6FA8" strokeWidth="7" />
    <path d="M166 52 C168 28 174 12 182 10 C198 6 222 6 238 10 C246 12 252 28 254 52 Z" fill="#3F6FA8" strokeWidth="7" />
    <path d="M166 50 C190 44 230 44 254 50" fill="none" strokeWidth="8" />
    </g>
  </>
);

const I_SCRUNCHIE = (
  <>
    <ellipse cx="212" cy="110" rx="38" ry="30" fill="#D4AF37" strokeWidth="6" transform="rotate(90 212 110)" />
    <ellipse cx="203.7" cy="141" rx="38" ry="30" fill="#FF1B6B" strokeWidth="6" transform="rotate(120 203.7 141)" />
    <ellipse cx="181" cy="163.7" rx="38" ry="30" fill="#D4AF37" strokeWidth="6" transform="rotate(150 181 163.7)" />
    <ellipse cx="150" cy="172" rx="38" ry="30" fill="#FF1B6B" strokeWidth="6" transform="rotate(180 150 172)" />
    <ellipse cx="119" cy="163.7" rx="38" ry="30" fill="#D4AF37" strokeWidth="6" transform="rotate(210 119 163.7)" />
    <ellipse cx="96.3" cy="141" rx="38" ry="30" fill="#FF1B6B" strokeWidth="6" transform="rotate(240 96.3 141)" />
    <ellipse cx="88" cy="110" rx="38" ry="30" fill="#D4AF37" strokeWidth="6" transform="rotate(270 88 110)" />
    <ellipse cx="96.3" cy="79" rx="38" ry="30" fill="#FF1B6B" strokeWidth="6" transform="rotate(300 96.3 79)" />
    <ellipse cx="119" cy="56.3" rx="38" ry="30" fill="#D4AF37" strokeWidth="6" transform="rotate(330 119 56.3)" />
    <ellipse cx="150" cy="48" rx="38" ry="30" fill="#FF1B6B" strokeWidth="6" transform="rotate(360 150 48)" />
    <ellipse cx="181" cy="56.3" rx="38" ry="30" fill="#D4AF37" strokeWidth="6" transform="rotate(390 181 56.3)" />
    <ellipse cx="203.7" cy="79" rx="38" ry="30" fill="#FF1B6B" strokeWidth="6" transform="rotate(420 203.7 79)" />
    <ellipse cx="150" cy="110" rx="36" ry="36" fill="none" strokeWidth="6" />
  </>
);

const I_SHADES = (
  <>
    <path d="M26 62 L374 62 L362 46 L38 46 Z" fill="#D4AF37" strokeWidth="7" />
    <path d="M40 62 L180 62 C186 110 170 150 120 152 C70 154 40 120 40 62 Z" fill="#0D0D0D" strokeWidth="7" />
    <path d="M220 62 L360 62 C360 120 330 154 280 152 C230 150 214 110 220 62 Z" fill="#0D0D0D" strokeWidth="7" />
    <path d="M68 88 L122 88" fill="none" stroke="#FF1B6B" strokeWidth="8" />
    <path d="M248 88 L302 88" fill="none" stroke="#FF1B6B" strokeWidth="8" />
    <path d="M178 74 C190 62 210 62 222 74" fill="none" strokeWidth="10" />
  </>
);

const I_CHAIN = (
  <>
    <path d="M60 20 C80 170 320 170 340 20" fill="none" strokeWidth="26" />
    <path d="M60 20 C80 170 320 170 340 20" fill="none" stroke="#D4AF37" strokeWidth="13" strokeDasharray="18 10" />
    <path d="M170 168 L230 168 L230 214 L200 234 L170 214 Z" fill="#D4AF37" strokeWidth="7" />
    <path d="M186 186 L214 186" fill="none" strokeWidth="5" />
  </>
);

const I_APRON = (
  <>
    <path d="M92 74 C86 40 114 40 110 74 M130 74 C126 40 154 40 150 74" fill="none" strokeWidth="7" />
    <path d="M84 70 L176 70 L176 118 L216 138 L216 280 L44 280 L44 138 L84 118 Z" fill="#F5F5F0" strokeWidth="7" />
    <path d="M44 150 L6 170" fill="none" strokeWidth="7" />
    <path d="M216 150 L254 170" fill="none" strokeWidth="7" />
    <path d="M92 196 L168 196 L168 244 L92 244 Z" fill="none" strokeWidth="5" />
  </>
);

const I_BLAZER = (
  <>
    <path d="M92 30 L20 62 L8 280 L60 284 L66 180 L70 290 L190 290 L194 180 L200 284 L252 280 L240 62 L168 30 Z" fill="#2A2A28" stroke="#F5F5F0" strokeWidth="7" />
    <path d="M92 30 L130 120 L168 30 Z" fill="#F5F5F0" strokeWidth="6" />
    <path d="M120 40 L140 40 L134 60 L146 150 L130 170 L114 150 L126 60 Z" fill="#FF1B6B" strokeWidth="5" />
    <path d="M92 30 L74 88 L130 170" fill="none" stroke="#F5F5F0" strokeWidth="6" />
    <path d="M168 30 L186 88 L130 170" fill="none" stroke="#F5F5F0" strokeWidth="6" />
  </>
);

const PAIRS = [[LOOK1, LOOK2], [LOOK3, LOOK4], [LOOK5, LOOK6]];

function Art({ viewBox, className, style, children }: { viewBox: string; className?: string; style?: CSSProperties; children: ReactNode }) {
  return <svg viewBox={viewBox} className={className} style={style} aria-hidden="true"><g {...OUTLINE}>{children}</g></svg>;
}

/** The two figures of look 1, 2 or 3; they slide in from the left and right (spec §5). */
export function LookPair({ n }: { n: 1 | 2 | 3 }) {
  const [l, r] = PAIRS[n - 1];
  return (
    <div className="look__figs">
      <Art viewBox="0 0 420 980" className="look__fig m m-slide-l" style={{ '--d': 1 } as CSSProperties}>{l}</Art>
      <Art viewBox="0 0 420 980" className="look__fig m m-slide-r" style={{ '--d': 1.25 } as CSSProperties}>{r}</Art>
    </div>
  );
}

const BLING = {
  bucket: ['0 0 400 170', I_BUCKET], scrunchie: ['0 0 300 220', I_SCRUNCHIE],
  shades: ['0 0 400 200', I_SHADES], chain: ['0 0 400 240', I_CHAIN],
} as const;
export type Bling = keyof typeof BLING;

export function BlingItem({ name }: { name: Bling }) {
  return <Art viewBox={BLING[name][0]}>{BLING[name][1]}</Art>;
}

const SKIP = { apron: ['0 0 260 300', I_APRON], blazer: ['0 0 260 300', I_BLAZER] } as const;

export function SkipItem({ name }: { name: keyof typeof SKIP }) {
  return <Art viewBox={SKIP[name][0]}>{SKIP[name][1]}</Art>;
}
