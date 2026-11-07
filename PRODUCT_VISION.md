# PixelForge product vision

PixelForge is a free, cross-platform wallpaper creation and community platform. It is not only a wallpaper setter.

## The three user paths

### 1. Create
Users can create wallpapers inside PixelForge using tools such as:

- Static images and layered compositions
- Cropping, framing, color adjustments, filters, and effects
- Text, shapes, overlays, and animation controls
- Video and GIF timelines
- Web or shader-based scenes as an advanced option
- Optional audio-reactive behavior

A user-created wallpaper starts without a title so the creator can name it.

### 2. Import
Users can import wallpapers from their computer or download them from elsewhere, then prepare them for their display.

- Original files remain untouched
- Images are cropped and resized intelligently
- Live media is adapted to the target display
- Low-resolution images can be enhanced locally when possible
- Audio can be muted, enabled, or adjusted
- The default imported title is the original file name
- Users can rename imported wallpapers at any time

### 3. Community

Users can browse, download, install, and freely use community wallpapers when the creator's license permits it.

Community wallpapers support:

- Star ratings or another simple quality rating
- Comments and creator replies
- Follow/unfollow creators and show follower counts
- Reporting and moderation tools
- Creator attribution and download counts
- A clear distinction between downloading a wallpaper and editing it

A community wallpaper is read-only to other users. A user may download a permitted wallpaper, create an independent editable copy, and publish that copy as a new work with appropriate attribution when the original license allows it.

Community packages should contain:

- Wallpaper title
- Creator name
- Description and preview
- Wallpaper type
- Supported platforms
- Audio and network behavior
- License and attribution
- Required dependencies

Creators keep credit for their work. PixelForge should never silently remove attribution or misrepresent someone else's creation.

## User profiles

PixelForge should start with a local-first profile rather than requiring an email address.

- On first launch, the user chooses a display name.
- The user may choose a local profile picture.
- The user can edit the name and picture later.
- The profile shows the user's creations, imported items, editable projects, published wallpapers, ratings, and comments.
- Users can reopen and edit their own projects at any time.
- Downloading another creator's wallpaper creates a separate local copy; it does not grant permission to modify the original community item.

Email is unnecessary for the local library and personal profile. Community browsing and downloading can work anonymously. Posting ratings, comments, or publishing work will eventually need an optional community identity for spam control and authorship. We should prefer optional sign-in methods such as GitHub, passkeys, or another privacy-respecting account method rather than forcing email collection. A user should never need an account to use local wallpapers.

## Universal optimization

Every wallpaper passes through a platform-specific preparation layer. The layer detects the user's display configuration and adapts the wallpaper without changing the source:

- Resolution and aspect ratio
- Portrait, landscape, ultrawide, and mixed-monitor layouts
- DPI and scaling where relevant
- GPU capability and available memory
- Battery state and performance mode
- Live wallpaper frame-rate and quality limits

The user can preview the result and override automatic choices.

## Audio controls

Live wallpapers may contain sound. The editor and playback settings should support:

- Mute
- Unmute
- Volume slider
- Start muted or remember the user's choice
- Optional audio-reactive mode
- Pause or mute when another application is playing audio

Audio behavior must be visible before installation for community wallpapers.

## Platforms

- Windows is the first target because it is the current development machine and has the largest initial feature scope.
- macOS is a planned target with a separate desktop integration layer.
- Linux is planned with desktop-environment-specific adapters rather than pretending every compositor behaves the same way.

The shared parts should include the wallpaper package format, metadata, optimizer, library, editor model, and community protocol. Platform adapters should handle rendering behind desktop icons, window embedding, audio APIs, power state, and multi-monitor behavior.

## Safety boundary

"Any wallpaper" means any supported and declared wallpaper format, not arbitrary untrusted executable code. Executable or script-based wallpapers must be sandboxed or require an explicit warning and opt-in. Imported community content must be inspectable and removable.
