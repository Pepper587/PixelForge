import "./styles.css";
import { invoke } from "@tauri-apps/api/core";

type Profile = {
  name: string;
  avatar?: string;
  bio?: string;
  followers?: number;
  following?: number;
};

type Wallpaper = {
  id: string;
  name: string;
  sourceName: string;
  dataUrl: string;
  width: number;
  height: number;
  type: "image";
  createdAt: number;
  sourceBytes?: number;
};

type Display = {
  index: number;
  name: string;
  width: number;
  height: number;
  is_primary: boolean;
  is_virtual: boolean;
};

type PublishedNote = { user: string; text: string; time: string };

/**
 * A wallpaper the user chose to publish.
 *
 * There is no community server yet, so these records live only in this
 * browser's local storage. Every number rendered next to one of these is a
 * real count of zero until a server exists to hold other people's ratings,
 * comments and downloads. Nothing here is sample data.
 */
type PublishedWork = {
  id: string;
  wallpaperId: string;
  title: string;
  publishedAt: number;
  notes: PublishedNote[];
};

const profileKey = "pixelforge.profile";
const libraryKey = "pixelforge.library";

const app = document.querySelector<HTMLDivElement>("#app")!;

let profile: Profile =
  JSON.parse(localStorage.getItem(profileKey) || "null") ||
  { name: "", avatar: "", bio: "", followers: 0, following: 0 };
let library: Wallpaper[] = JSON.parse(localStorage.getItem(libraryKey) || "[]");
let selected: Wallpaper | null = library[0] || null;
let focalX = 50;
let focalY = 50;
let fitMode: "fill" | "stretch" | "fit" = "fill";
let activeView: "library" | "create" | "community" | "profile" = "library";
let displays: Display[] = [];
let activeDisplayIndex = 0;
let searchTerm = "";
let applying = false;
let toastTimer = 0;

const publishedKey = "pixelforge.published";

let published: PublishedWork[] =
  JSON.parse(localStorage.getItem(publishedKey) || "null") || [];

// Older builds shipped a hardcoded set of invented community posts. Drop that
// key so the fake creators, ratings and download counts never come back.
localStorage.removeItem("pixelforge.community");

function save() {
  localStorage.setItem(profileKey, JSON.stringify(profile));
  localStorage.setItem(libraryKey, JSON.stringify(library));
  localStorage.setItem(publishedKey, JSON.stringify(published));
}

function esc(value: string) {
  return value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] || char,
  );
}

function initials(name: string) {
  const clean = name.trim();
  if (!clean) return "?";
  const parts = clean.split(/\s+/);
  return (parts.length > 1 ? parts[0][0] + parts[1][0] : parts[0].slice(0, 2)).toUpperCase();
}

function handleFor(name: string) {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20) || "creator";
}

function formatBytes(bytes?: number) {
  if (!bytes) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function ratioLabel(w: number, h: number) {
  const ratio = w / h;
  if (Math.abs(ratio - 16 / 9) < 0.04) return "16:9";
  if (Math.abs(ratio - 16 / 10) < 0.04) return "16:10";
  if (Math.abs(ratio - 21 / 9) < 0.04) return "21:9";
  if (ratio > 1.9) return "Ultrawide";
  if (ratio < 0.85) return "Portrait";
  return `${w} × ${h}`;
}

function currentDisplay(): Display {
  return (
    displays[activeDisplayIndex] ||
    displays[0] || {
      index: 0,
      name: "Primary display",
      width: window.screen.width,
      height: window.screen.height,
      is_primary: true,
      is_virtual: false,
    }
  );
}

function toast(message: string, kind: "ok" | "error" = "ok") {
  const node = document.querySelector<HTMLDivElement>("#toast");
  if (!node) return;
  node.textContent = message;
  node.className = `toast visible ${kind}`;
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    node.className = "toast";
  }, 3600);
}

function avatarMarkup(size: "small" | "large" | "tiny") {
  const inner = profile.avatar
    ? `<img src="${profile.avatar}" alt="" />`
    : esc(profile.name ? initials(profile.name) : "?");
  return `<div class="avatar avatar-${size}">${inner}</div>`;
}

function render() {
  const hasProfile = Boolean(profile.name.trim());

  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">PF</div>
          <div><strong>PixelForge</strong><span>Wallpaper studio</span></div>
        </div>
        <nav>
          <button class="nav-item ${activeView === "library" ? "active" : ""}" data-view="library"><span>▦</span>Library</button>
          <button class="nav-item ${activeView === "create" ? "active" : ""}" data-view="create"><span>✦</span>Create</button>
          <button class="nav-item ${activeView === "community" ? "active" : ""}" data-view="community"><span>◉</span>Community</button>
          <button class="nav-item ${activeView === "profile" ? "active" : ""}" data-view="profile"><span>☺</span>Profile</button>
        </nav>
        <div class="sidebar-stats">
          <p class="eyebrow">DISPLAYS</p>
          ${displayPickerMarkup()}
        </div>
        <div class="sidebar-bottom">
          <button class="profile-chip" id="profile-button">
            ${avatarMarkup("small")}
            <div><strong>${hasProfile ? esc(profile.name) : "Set up profile"}</strong><span>${library.length} creations · ${profile.followers || 0} followers</span></div>
            <span class="chevron">›</span>
          </button>
        </div>
      </aside>
      <main class="content">
        ${viewMarkup()}
      </main>
    </div>
    <input id="file-input" type="file" accept="image/png,image/jpeg,image/webp" hidden />
    <div id="toast" class="toast"></div>
    ${profileDialogMarkup()}
    ${editorDialogMarkup()}
  `;
  bindEvents();
}

function displayPickerMarkup() {
  if (!displays.length) {
    return `<div class="display-item"><span class="display-dot"></span><div><strong>Detecting displays…</strong></div></div>`;
  }
  return displays
    .map(
      (display, index) => `
      <button class="display-item ${index === activeDisplayIndex ? "active" : ""}" data-display-index="${index}">
        <span class="display-dot ${display.is_primary ? "primary" : ""}"></span>
        <div><strong>${display.width} × ${display.height}</strong><span>${display.is_primary ? "Primary" : "Secondary"}</span></div>
      </button>`,
    )
    .join("");
}

function viewMarkup(): string {
  if (activeView === "community") return communityViewMarkup();
  if (activeView === "profile") return profileViewMarkup();
  if (activeView === "create") return createViewMarkup();
  return libraryViewMarkup();
}

function libraryViewMarkup(): string {
  const display = currentDisplay();
  const filtered = library.filter((item) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">YOUR WORKSPACE</p>
        <h1>Wallpaper library</h1>
        <p class="subheading">Every image prepared for ${display.width} × ${display.height}.</p>
      </div>
      <div class="header-actions">
        <div class="search-box">
          <span>⌕</span>
          <input id="search-input" type="search" placeholder="Search your library" value="${esc(searchTerm)}" />
        </div>
        <button class="primary" id="import-button">＋ Import wallpaper</button>
      </div>
    </header>
    ${
      filtered.length
        ? `<div class="library-grid">${filtered.map(cardMarkup).join("")}</div>`
        : `<section class="empty-state">
            <div class="empty-icon">✦</div>
            <h2>${library.length ? "No matches" : "Start with one wallpaper"}</h2>
            <p>${
              library.length
                ? "Try a different search term, or import a new image."
                : "Import an image and PixelForge will crop, upscale, and match it to your exact display resolution."
            }</p>
            <button class="primary" id="empty-import">Import your first wallpaper</button>
            <div class="feature-row"><span>✓ Original preserved</span><span>✓ Smart crop</span><span>✓ Native apply</span></div>
          </section>`
    }
  `;
}

function cardMarkup(item: Wallpaper) {
  const display = currentDisplay();
  const tooSmall = item.width < display.width || item.height < display.height;
  return `
    <article class="wall-card">
      <div class="wall-card-preview" style="background-image:url('${item.dataUrl}')">
        <div class="wall-card-badges">
          <span class="badge ${tooSmall ? "badge-warn" : "badge-good"}">${tooSmall ? "Needs upscale" : "Native res"}</span>
        </div>
        <div class="wall-card-actions">
          <button class="ghost-btn" data-edit-id="${item.id}">Edit</button>
          <button class="ghost-btn primary-ghost" data-apply-id="${item.id}">Set wallpaper</button>
        </div>
      </div>
      <div class="wall-card-body">
        <strong title="${esc(item.name)}">${esc(item.name)}</strong>
        <span>${item.width} × ${item.height} · ${ratioLabel(item.width, item.height)}</span>
      </div>
    </article>`;
}

function createViewMarkup(): string {
  const display = currentDisplay();
  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">CREATE</p>
        <h1>Build something new</h1>
        <p class="subheading">Compose layers, typography, and motion into a wallpaper.</p>
      </div>
      <div class="header-actions">
        <span class="display-pill">▣ Target ${display.width} × ${display.height}</span>
        <button class="primary" id="create-from-import">＋ Start from an image</button>
      </div>
    </header>
    <section class="create-grid">
      <div class="create-canvas">
        <div class="canvas-empty">
          <div class="empty-icon">✦</div>
          <h2>Blank canvas</h2>
          <p>Start from scratch, or bring in an image and layer over it. Everything you build is saved to your local library.</p>
          <div class="feature-row"><span>✓ Layers</span><span>✓ Text</span><span>✓ Effects</span><span>✓ Motion</span></div>
        </div>
      </div>
      <aside class="inspector">
        <div class="section-label">TOOLS</div>
        <button class="tool-row"><span>🖼</span> Add image layer</button>
        <button class="tool-row"><span>T</span> Add text</button>
        <button class="tool-row"><span>◐</span> Gradient / solid fill</button>
        <button class="tool-row"><span>✧</span> Effects &amp; filters</button>
        <button class="tool-row"><span>▶</span> Animate timeline</button>
        <div class="section-label" style="margin-top:22px">OUTPUT</div>
        <div class="meta-grid">
          <div><span>Resolution</span><strong>${display.width} × ${display.height}</strong></div>
          <div><span>Aspect</span><strong>${ratioLabel(display.width, display.height)}</strong></div>
          <div><span>Format</span><strong>PNG</strong></div>
          <div><span>Color</span><strong>sRGB</strong></div>
        </div>
        <button class="apply-button" id="create-export">Export to library <span>→</span></button>
        <p class="hint">The editor canvas lands in the next build slice. Export stays disabled until then.</p>
      </aside>
    </section>`;
}

function communityViewMarkup(): string {
  const display = currentDisplay();
  const publishable = library.filter(
    (item) => !published.some((work) => work.wallpaperId === item.id),
  );

  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">COMMUNITY</p>
        <h1>Discover wallpapers</h1>
        <p class="subheading">Free to use, with attribution to the creator.</p>
      </div>
      <div class="header-actions">
        <span class="display-pill">▣ Target ${display.width} × ${display.height}</span>
        <button class="secondary" id="publish-button">↑ Publish your work</button>
      </div>
    </header>

    <section class="offline-banner">
      <div class="offline-icon">◌</div>
      <div>
        <strong>The community server isn't running yet.</strong>
        <p>Browse, rate and download other people's wallpapers needs a backend. Until that ships, this tab shows only work published from this device — real files, real counts, no invented creators.</p>
      </div>
    </section>

    <div class="section-label section-label-spaced">PUBLISHED FROM THIS DEVICE <span>${published.length}</span></div>
    ${
      published.length
        ? `<div class="community-grid">${published.map(publishedCardMarkup).join("")}</div>`
        : `<section class="empty-state"><div class="empty-icon">◉</div><h2>Nothing published yet</h2><p>Publish a wallpaper from your library and it will appear here, ready for the day the community server comes online.</p><button class="primary" id="publish-first">Publish your first wallpaper</button></section>`
    }

    ${
      publishable.length
        ? `<div class="section-label section-label-spaced">READY TO PUBLISH <span>${publishable.length}</span></div>
           <div class="community-grid">${publishable.map(publishableCardMarkup).join("")}</div>`
        : ""
    }`;
}

function publishedCardMarkup(work: PublishedWork): string {
  const item = library.find((entry) => entry.id === work.wallpaperId);
  const author = profile.name.trim() || "You";
  return `
    <article class="community-card" data-post-id="${work.id}">
      <div class="community-art" style="background-image:url('${item?.dataUrl ?? ""}')">
        <div class="community-art-overlay">
          <span class="badge badge-dark">Local only</span>
          <span class="badge badge-dark">${work.notes.length} notes</span>
        </div>
      </div>
      <div class="community-body">
        <div class="community-author">
          <div class="avatar avatar-tiny">${esc(initials(author))}</div>
          <div><strong>${esc(author)}</strong><span>@${esc(handleFor(author))}</span></div>
          <span class="local-pill">You</span>
        </div>
        <h3>${esc(work.title)}</h3>
        <div class="community-stats">
          <span>${item ? `${item.width} × ${item.height}` : "source file missing"}</span>
          <span>0 ratings</span>
          <span>0 downloads</span>
        </div>
        <div class="community-actions">
          <button class="ghost-btn" data-use-id="${work.id}">↓ Use this wallpaper</button>
          <button class="ghost-btn" data-unpublish-id="${work.id}">Unpublish</button>
        </div>
        ${
          work.notes.length
            ? `<div class="comment-list">${work.notes
                .map(
                  (note) => `
          <div class="comment">
            <div class="comment-head"><strong>${esc(note.user)}</strong><span>${esc(note.time)}</span></div>
            <p>${esc(note.text)}</p>
          </div>`,
                )
                .join("")}</div>`
            : ""
        }
        <div class="comment-form">
          <input id="note-${work.id}" type="text" placeholder="Leave a note about this wallpaper…" />
          <button class="secondary" data-note-id="${work.id}">Post</button>
        </div>
      </div>
    </article>`;
}

function publishableCardMarkup(item: Wallpaper): string {
  return `
    <article class="community-card">
      <div class="community-art" style="background-image:url('${item.dataUrl}')">
        <div class="community-art-overlay">
          <span class="badge badge-dark">Not published</span>
        </div>
      </div>
      <div class="community-body">
        <h3>${esc(item.name)}</h3>
        <div class="community-stats">
          <span>${item.width} × ${item.height}</span>
          <span>${ratioLabel(item.width, item.height)}</span>
        </div>
        <div class="community-actions">
          <button class="ghost-btn primary-ghost" data-publish-id="${item.id}">↑ Publish this</button>
        </div>
      </div>
    </article>`;
}

function profileViewMarkup(): string {
  const hasProfile = Boolean(profile.name.trim());
  return `
    <header class="topbar">
      <div>
        <p class="eyebrow">PROFILE</p>
        <h1>${hasProfile ? esc(profile.name) : "Your profile"}</h1>
        <p class="subheading">@${esc(handleFor(profile.name))}</p>
      </div>
      <div class="header-actions">
        <button class="primary" id="profile-edit-button">${hasProfile ? "Edit profile" : "Set up profile"}</button>
      </div>
    </header>
    <section class="profile-hero-card">
      ${avatarMarkup("large")}
      <div class="profile-card-identity">
        <h2>${hasProfile ? esc(profile.name) : "No profile yet"}</h2>
        <p class="profile-handle">@${esc(handleFor(profile.name))}</p>
        <p class="profile-bio">${esc(profile.bio || "Tell the PixelForge community a little about yourself.")}</p>
        <div class="profile-stats big">
          <div><strong>${library.length}</strong><span>Creations</span></div>
          <div><strong>${profile.followers || 0}</strong><span>Followers</span></div>
          <div><strong>${profile.following || 0}</strong><span>Following</span></div>
        </div>
        ${
          !(profile.followers || profile.following)
            ? `<p class="profile-note">Follower counts activate once the community server is online. Everything you create stays local until then.</p>`
            : ""
        }
      </div>
    </section>
    <div class="section-label section-label-spaced">YOUR CREATIONS <span>${library.length}</span></div>
    ${
      library.length
        ? `<div class="library-grid">${library.map(cardMarkup).join("")}</div>`
        : `<section class="empty-state"><div class="empty-icon">✦</div><h2>Nothing here yet</h2><p>Import an image to start your collection.</p><button class="primary" id="empty-import">Import a wallpaper</button></section>`
    }`;
}

function profileDialogMarkup(): string {
  return `
    <dialog id="profile-dialog">
      <form method="dialog" class="dialog-card profile-dialog-card" id="profile-form">
        <div class="dialog-head">
          <div><p class="eyebrow">LOCAL PROFILE</p><h2>Your PixelForge profile</h2></div>
          <button class="icon-button" value="cancel" aria-label="Close">×</button>
        </div>
        <div class="profile-hero">
          <div class="profile-avatar-large">${profile.avatar ? `<img src="${profile.avatar}" alt="" />` : esc(profile.name ? initials(profile.name) : "?")}</div>
          <div class="profile-identity">
            <h3>${profile.name ? esc(profile.name) : "Your name"}</h3>
            <p>@${esc(handleFor(profile.name))}</p>
            <div class="profile-stats">
              <span><strong>${library.length}</strong> creations</span>
              <span><strong>${profile.followers || 0}</strong> followers</span>
            </div>
          </div>
        </div>
        <div class="profile-actions">
          <button type="button" class="secondary" id="edit-profile">Edit profile</button>
          <button type="button" class="secondary" id="view-archive">View archive</button>
        </div>
        <div class="profile-edit-fields">
          <p class="eyebrow">EDIT DETAILS</p>
          <label>Display name<input id="profile-name" required maxlength="40" value="${esc(profile.name)}" placeholder="What should we call you?" /></label>
          <label>Bio <span class="optional">optional</span><textarea id="profile-bio" maxlength="160" placeholder="A short introduction">${esc(profile.bio || "")}</textarea></label>
          <label>Profile picture <span class="optional">optional · local only</span>
            <div class="avatar-upload">
              <input id="avatar-input" type="file" accept="image/png,image/jpeg,image/webp" hidden />
              <label class="upload-dropzone" for="avatar-input">
                <span class="upload-symbol">＋</span>
                <span><strong>Choose a profile picture</strong><small id="avatar-file-name">PNG, JPG or WebP · stored locally</small></span>
                <span class="upload-arrow">↗</span>
              </label>
            </div>
          </label>
          <div class="dialog-actions">
            <button value="cancel" class="secondary">Cancel</button>
            <button value="default" class="primary">Save profile</button>
          </div>
        </div>
      </form>
    </dialog>`;
}

function editorDialogMarkup(): string {
  if (!selected) return "";
  const display = currentDisplay();
  const backgroundSize =
    fitMode === "fit" ? "contain" : fitMode === "stretch" ? "100% 100%" : "cover";
  return `
    <dialog id="editor-dialog" class="editor-dialog">
      <div class="editor-shell">
        <div class="editor-preview-column">
          <div class="section-label">
            <span>PREVIEW · ${display.width} × ${display.height}</span>
            <span class="status-dot">● Matched to ${ratioLabel(display.width, display.height)}</span>
          </div>
          <div class="wallpaper-preview" style="background-image:url('${selected.dataUrl}');background-position:${focalX}% ${focalY}%;background-size:${backgroundSize}">
            <div class="preview-overlay"><span>${ratioLabel(display.width, display.height)}</span><span>${selected.width} × ${selected.height} source</span></div>
          </div>
          <div class="preview-controls">
            <label>Horizontal focus <input id="focus-x" type="range" min="0" max="100" value="${focalX}" /></label><output>${focalX}%</output>
            <label>Vertical focus <input id="focus-y" type="range" min="0" max="100" value="${focalY}" /></label><output>${focalY}%</output>
          </div>
        </div>
        <aside class="inspector">
          <div class="section-label">WALLPAPER DETAILS</div>
          <img class="thumb" src="${selected.dataUrl}" alt="${esc(selected.name)}" />
          <label>Wallpaper name<input id="wallpaper-name" value="${esc(selected.name)}" /></label>
          <div class="section-label section-label-spaced">FIT MODE</div>
          <div class="segmented">
            <button class="seg ${fitMode === "fill" ? "active" : ""}" data-fit="fill">Fill</button>
            <button class="seg ${fitMode === "stretch" ? "active" : ""}" data-fit="stretch">Stretch</button>
            <button class="seg ${fitMode === "fit" ? "active" : ""}" data-fit="fit">Fit</button>
          </div>
          <div class="meta-grid">
            <div><span>Source</span><strong>${esc(selected.sourceName)}</strong></div>
            <div><span>Original</span><strong>${selected.width} × ${selected.height}</strong></div>
            <div><span>Target</span><strong>${display.width} × ${display.height}</strong></div>
            <div><span>Quality</span><strong>${selected.width < display.width ? "Upscaling" : "Native"}</strong></div>
            <div><span>File size</span><strong>${formatBytes(selected.sourceBytes)}</strong></div>
            <div><span>Type</span><strong>Static image</strong></div>
          </div>
          <button class="apply-button" id="apply-button">Set as wallpaper <span>→</span></button>
          <p class="hint" id="apply-hint">Crops to ${display.width} × ${display.height}, upscales with Lanczos resampling, then applies natively.</p>
        </aside>
      </div>
    </dialog>`;
}

function openProfile() {
  document.querySelector<HTMLDialogElement>("#profile-dialog")?.showModal();
}

function openImport() {
  document.querySelector<HTMLInputElement>("#file-input")?.click();
}

function openEditor(id: string) {
  selected = library.find((item) => item.id === id) || null;
  if (!selected) return;
  focalX = 50;
  focalY = 50;
  render();
  document.querySelector<HTMLDialogElement>("#editor-dialog")?.showModal();
}

async function detectDisplays() {
  try {
    displays = await invoke<Display[]>("detect_displays");
    if (activeDisplayIndex >= displays.length) activeDisplayIndex = 0;
  } catch {
    displays = [
      {
        index: 0,
        name: "Primary display",
        width: window.screen.width,
        height: window.screen.height,
        is_primary: true,
        is_virtual: false,
      },
    ];
  }
  render();
}

function bindEvents() {
  document.querySelector("#import-button")?.addEventListener("click", openImport);
  document.querySelector("#empty-import")?.addEventListener("click", openImport);
  document.querySelector("#create-from-import")?.addEventListener("click", openImport);
  document.querySelector("#publish-first")?.addEventListener("click", () => {
    activeView = "library";
    render();
    toast("Import a wallpaper first, then publish it from here.");
  });
  document.querySelector("#publish-button")?.addEventListener("click", () => {
    const next = library.find((item) => !published.some((work) => work.wallpaperId === item.id));
    if (!next) {
      toast("Everything in your library is already published.", "error");
      return;
    }
    published = [
      {
        id: crypto.randomUUID(),
        wallpaperId: next.id,
        title: next.name,
        publishedAt: Date.now(),
        notes: [],
      },
      ...published,
    ];
    save();
    render();
    toast(`"${next.name}" published locally. It will sync when the community server is live.`);
  });
  document.querySelector("#profile-button")?.addEventListener("click", openProfile);
  document.querySelector("#profile-edit-button")?.addEventListener("click", openProfile);
  document.querySelector("#edit-profile")?.addEventListener("click", () =>
    document.querySelector(".profile-edit-fields")?.classList.toggle("visible"),
  );
  document.querySelector("#view-archive")?.addEventListener("click", () =>
    document.querySelector<HTMLDialogElement>("#profile-dialog")?.close(),
  );

  document.querySelectorAll<HTMLButtonElement>(".nav-item").forEach((button) =>
    button.addEventListener("click", () => {
      activeView = (button.dataset.view as typeof activeView) || "library";
      render();
    }),
  );

  document.querySelectorAll<HTMLButtonElement>("[data-display-index]").forEach((button) =>
    button.addEventListener("click", () => {
      activeDisplayIndex = Number(button.dataset.displayIndex) || 0;
      render();
    }),
  );

  const search = document.querySelector<HTMLInputElement>("#search-input");
  search?.addEventListener("input", () => {
    searchTerm = search.value;
    const caret = search.selectionStart ?? 0;
    render();
    const next = document.querySelector<HTMLInputElement>("#search-input");
    next?.focus();
    next?.setSelectionRange(caret, caret);
  });

  document.querySelector<HTMLInputElement>("#file-input")?.addEventListener("change", importFile);
  document.querySelector<HTMLFormElement>("#profile-form")?.addEventListener("submit", saveProfile);
  document.querySelector<HTMLInputElement>("#avatar-input")?.addEventListener("change", (event) => {
    const file = (event.target as HTMLInputElement).files?.[0];
    const label = document.querySelector<HTMLElement>("#avatar-file-name");
    if (label && file) label.textContent = file.name;
  });

  document.querySelectorAll<HTMLElement>("[data-edit-id]").forEach((button) =>
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      openEditor(button.dataset.editId!);
    }),
  );

  document.querySelectorAll<HTMLElement>("[data-apply-id]").forEach((button) =>
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      selected = library.find((item) => item.id === button.dataset.applyId) || null;
      focalX = 50;
      focalY = 50;
      render();
      document.querySelector<HTMLDialogElement>("#editor-dialog")?.showModal();
    }),
  );

  document.querySelectorAll<HTMLButtonElement>("[data-publish-id]").forEach((button) =>
    button.addEventListener("click", () => {
      const item = library.find((entry) => entry.id === button.dataset.publishId);
      if (!item) return;
      published = [
        {
          id: crypto.randomUUID(),
          wallpaperId: item.id,
          title: item.name,
          publishedAt: Date.now(),
          notes: [],
        },
        ...published,
      ];
      save();
      render();
      toast(`"${item.name}" published locally. It will sync when the community server is live.`);
    }),
  );

  document.querySelectorAll<HTMLButtonElement>("[data-unpublish-id]").forEach((button) =>
    button.addEventListener("click", () => {
      const work = published.find((entry) => entry.id === button.dataset.unpublishId);
      if (!work) return;
      published = published.filter((entry) => entry.id !== work.id);
      save();
      render();
      toast(`"${work.title}" unpublished.`);
    }),
  );

  document.querySelectorAll<HTMLButtonElement>("[data-use-id]").forEach((button) =>
    button.addEventListener("click", () => {
      const work = published.find((entry) => entry.id === button.dataset.useId);
      const item = work ? library.find((entry) => entry.id === work.wallpaperId) : null;
      if (!item) {
        toast("That wallpaper is no longer in your library.", "error");
        return;
      }
      selected = item;
      save();
      render();
      activeView = "library";
      render();
      toast(`"${item.name}" is in your library. Set it as your wallpaper from the Library tab.`);
    }),
  );

  document.querySelectorAll<HTMLButtonElement>("[data-note-id]").forEach((button) =>
    button.addEventListener("click", () => {
      const id = button.dataset.noteId!;
      const input = document.querySelector<HTMLInputElement>(`#note-${id}`);
      const text = input?.value.trim();
      if (!text) return;
      const work = published.find((entry) => entry.id === id);
      if (!work) return;
      work.notes.push({ user: profile.name.trim() || "You", text, time: "now" });
      save();
      render();
    }),
  );
  document.querySelector("#create-export")?.addEventListener("click", () =>
    toast("The editor canvas lands in the next build slice."),
  );

  const focusX = document.querySelector<HTMLInputElement>("#focus-x");
  const focusY = document.querySelector<HTMLInputElement>("#focus-y");
  focusX?.addEventListener("input", () => {
    focalX = Number(focusX.value);
    updateFocusOutputs();
  });
  focusY?.addEventListener("input", () => {
    focalY = Number(focusY.value);
    updateFocusOutputs();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-fit]").forEach((button) =>
    button.addEventListener("click", () => {
      fitMode = (button.dataset.fit as typeof fitMode) || "fill";
      render();
      document.querySelector<HTMLDialogElement>("#editor-dialog")?.showModal();
    }),
  );

  document
    .querySelector<HTMLInputElement>("#wallpaper-name")
    ?.addEventListener("change", (event) => {
      if (!selected) return;
      selected.name = (event.target as HTMLInputElement).value.trim() || selected.sourceName;
      save();
      render();
      document.querySelector<HTMLDialogElement>("#editor-dialog")?.showModal();
    });

  document.querySelector("#apply-button")?.addEventListener("click", applyWallpaper);
}

function updateFocusOutputs() {
  const preview = document.querySelector<HTMLElement>(".wallpaper-preview");
  if (preview) preview.style.backgroundPosition = `${focalX}% ${focalY}%`;
  const outputs = document.querySelectorAll<HTMLOutputElement>(".preview-controls output");
  if (outputs[0]) outputs[0].textContent = `${focalX}%`;
  if (outputs[1]) outputs[1].textContent = `${focalY}%`;
}

async function applyWallpaper() {
  if (!selected || applying) return;
  applying = true;
  const button = document.querySelector<HTMLButtonElement>("#apply-button");
  const hint = document.querySelector<HTMLElement>("#apply-hint");
  if (button) {
    button.disabled = true;
    button.textContent = "Optimizing…";
  }
  if (hint) hint.textContent = "Cropping, upscaling and writing the wallpaper file…";

  try {
    const display = currentDisplay();
    const result = await invoke<{
      path: string;
      width: number;
      height: number;
      upscaled: boolean;
      cropped: boolean;
    }>("optimize_wallpaper", {
      request: {
        dataBase64: dataUrlToBase64(selected.dataUrl),
        targetWidth: display.width,
        targetHeight: display.height,
        focalX,
        focalY,
        mode: fitMode,
      },
    });
    await invoke("set_wallpaper", { path: result.path });
    if (hint) {
      hint.textContent = `Applied at ${result.width} × ${result.height}${
        result.upscaled ? " (upscaled)" : ""
      }${result.cropped ? " (cropped to fit)" : ""}.`;
    }
    toast("Wallpaper applied to your desktop.");
  } catch (error) {
    const message = typeof error === "string" ? error : JSON.stringify(error);
    if (hint) hint.textContent = message;
    toast(`Could not apply the wallpaper: ${message}`, "error");
  } finally {
    applying = false;
  }
}

function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.includes(",") ? dataUrl.split(",")[1] : dataUrl;
}

function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      const item: Wallpaper = {
        id: crypto.randomUUID(),
        name: file.name.replace(/\.[^/.]+$/, "") || file.name,
        sourceName: file.name,
        dataUrl: String(reader.result),
        width: image.naturalWidth,
        height: image.naturalHeight,
        type: "image",
        createdAt: Date.now(),
        sourceBytes: file.size,
      };
      library = [item, ...library.filter((old) => old.sourceName !== item.sourceName)];
      selected = item;
      save();
      render();
      toast(`"${item.name}" added to your library.`);
    };
    image.src = String(reader.result);
  };
  reader.readAsDataURL(file);
  input.value = "";
}

function saveProfile(event: SubmitEvent) {
  event.preventDefault();
  const name = document.querySelector<HTMLInputElement>("#profile-name")?.value.trim() || "";
  const bio = document.querySelector<HTMLTextAreaElement>("#profile-bio")?.value.trim() || "";
  const avatarInput = document.querySelector<HTMLInputElement>("#avatar-input");
  const finish = (avatar?: string) => {
    profile = { ...profile, name, bio, avatar: avatar || profile.avatar };
    save();
    document.querySelector<HTMLDialogElement>("#profile-dialog")?.close();
    render();
    toast("Profile saved.");
  };
  const file = avatarInput?.files?.[0];
  if (!file) return finish();
  const reader = new FileReader();
  reader.onload = () => finish(String(reader.result));
  reader.readAsDataURL(file);
}

render();
detectDisplays();
