# PixelForge roadmap

PixelForge will grow in small, verifiable releases. The app should remain free to use, with no subscription and no feature locked behind payment.

## Phase 1 — Display-aware static wallpapers

- Detect Windows displays, resolution, orientation, scale factor, and arrangement
- Import and organize a local wallpaper library
- Preview smart crop results before applying them
- Fit images without distortion using a configurable focal point
- Process and cache a display-specific copy without changing the original
- Apply one wallpaper or manually assign different wallpapers per monitor
- Save named monitor setups
- Use the PixelForge icon and a polished Windows UI

## Phase 2 — Quality and reliability

- Local AI upscaling using a permissively licensed model or optional external tool
- Quality presets and GPU/CPU controls
- Re-process when display configuration changes
- Restore the last manually selected wallpaper after restart
- Pause expensive processing while on battery
- Automated tests for crop, scaling, monitor profiles, and cache behavior

## Phase 3 — Live wallpapers

- Video wallpapers with hardware-accelerated playback where available
- GIF and animated image support
- Pause or reduce playback while fullscreen apps or games are active
- Pause on battery and configurable frame-rate limits
- Per-monitor live wallpaper assignments
- Audio-reactive wallpapers only after the core engine is stable

## Phase 4 — Creative wallpaper tools

- Web and WebGL wallpapers in a sandboxed renderer
- Shader templates and a beginner-friendly editor
- Import/export of portable PixelForge wallpaper packages
- Preview, inspect, and validate community builds before installation

## Phase 5 — Community and profiles

- Local-first user profile with display name and optional local avatar
- Personal creation library with editable projects
- Community wallpaper pages with ratings, comments, creator replies, and reports
- Anonymous browsing and downloading
- Optional identity for publishing, rating, and commenting to limit spam and preserve authorship
- Downloaded community wallpapers remain read-only originals; editing creates a separate copy
- Portable wallpaper packages and creator-selected licenses
- Community gallery, moderation, and safe-download guidance
- Optional donations and sponsorships; never required for core features

## Competitive direction

Lively Wallpaper is the strongest existing free Windows competitor for live wallpapers. PixelForge should not try to copy it immediately. We will first win on display-aware static-image preparation, library organization, transparent local processing, and simple per-monitor setups, then add live features without sacrificing performance or privacy.

## Definition of a good release

Every release should have a reproducible build, a clear changelog, tested core behavior, documented limitations, and no hidden network requirement.
