// Hard gates and recommended guidance for the wizard.
export const MIN_IMAGE_COUNT = 5;
export const RECOMMENDED_IMAGE_COUNT = 10;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024; // 15 MB
export const MIN_IMAGE_SHORT_SIDE_PX = 1024;
export const ACCEPTED_IMAGE_MIME = ["image/jpeg", "image/png", "image/heic", "image/heif", "image/webp"];

export const VOICE_MIN_SECONDS = 90;
export const VOICE_RECOMMENDED_SECONDS = 150;
export const VOICE_MAX_SECONDS = 480; // 8 min cap to keep uploads sane
export const ACCEPTED_VOICE_MIME = ["audio/webm", "audio/wav", "audio/mpeg", "audio/mp4", "audio/ogg"];

export const ACCEPTED_FILE_MIME = [
  "application/pdf",
  "image/svg+xml",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/postscript",
  "application/zip",
];

export const CONSENT_TEXT_VOICE_LIKENESS =
  "I authorize EMM to use my voice and likeness to create AI-generated audio and avatar assets for my advertising, and I confirm the voice and images I provide are my own.";

// CSS variables used to scope the wizard root to EMM brand styling. Mirrors
// the override in PortalLayout so the popup looks identical regardless of
// where it is opened from.
export const EMM_THEME: Record<string, string> = {
  "--background": "210 40% 98%",
  "--foreground": "222 47% 11%",
  "--card": "0 0% 100%",
  "--card-foreground": "222 47% 11%",
  "--popover": "0 0% 100%",
  "--popover-foreground": "222 47% 11%",
  "--primary": "218 64% 30%",
  "--primary-foreground": "0 0% 100%",
  "--secondary": "210 40% 96%",
  "--secondary-foreground": "222 47% 11%",
  "--muted": "210 40% 96%",
  "--muted-foreground": "215 16% 47%",
  "--accent": "217 91% 60%",
  "--accent-foreground": "0 0% 100%",
  "--destructive": "0 73% 51%",
  "--destructive-foreground": "0 0% 100%",
  "--border": "214 32% 91%",
  "--input": "214 32% 91%",
  "--ring": "218 64% 30%",
  "--success": "142 71% 35%",
  "--warning": "32 95% 44%",
};
