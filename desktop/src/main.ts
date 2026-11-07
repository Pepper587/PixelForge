import "./styles.css";

type Profile = { name: string; avatar?: string; bio?: string; followers?: number; following?: number };
type Wallpaper = { id: string; name: string; sourceName: string; dataUrl: string; width: number; height: number; type: "image" };

const profileKey = "pixelforge.profile";
const libraryKey = "pixelforge.library";
const app = document.querySelector<HTMLDivElement>("#app")!;
const display = { width: window.screen.width, height: window.screen.height };
let profile: Profile = JSON.parse(localStorage.getItem(profileKey) || "null") || { name: "", avatar: "", bio: "", followers: 0, following: 0 };
let library: Wallpaper[] = JSON.parse(localStorage.getItem(libraryKey) || "[]");
let selected: Wallpaper | null = library[0] || null;
let focalX = 50;
let focalY = 50;

function save() {
  localStorage.setItem(profileKey, JSON.stringify(profile));
  localStorage.setItem(libraryKey, JSON.stringify(library));
}

function esc(value: string) {
  return value.replace(/[&<>\"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[char] || char);
}

function ratioLabel(w: number, h: number) {
  const ratio = w / h;
  if (Math.abs(ratio - 16 / 9) < 0.04) return "16:9";
  if (Math.abs(ratio - 16 / 10) < 0.04) return "16:10";
  if (ratio > 1.8) return "Ultrawide";
  if (ratio < 0.85) return "Portrait";
  return `${w} × ${h}`;
}

function render() {
  const hasProfile = Boolean(profile.name.trim());
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand"><div class="brand-mark">PF</div><div><strong>PixelForge</strong><span>Wallpaper studio</span></div></div>
        <nav>
          <button class="nav-item active" data-view="library"><span>▦</span> Library</button>
          <button class="nav-item" data-view="create"><span>✦</span> Create</button>
          <button class="nav-item" data-view="community"><span>◉</span> Community</button>
        </nav>
        <div class="sidebar-bottom"><button class="profile-chip" id="profile-button"><div class="avatar">${profile.avatar ? `<img src="${profile.avatar}" alt="" />` : (profile.name ? esc(profile.name[0].toUpperCase()) : "?")}</div><div><strong>${hasProfile ? esc(profile.name) : "Set up profile"}</strong><span>Local profile</span></div><span class="chevron">›</span></button></div>
      </aside>
      <main class="content">
        <header class="topbar"><div><p class="eyebrow">YOUR WORKSPACE</p><h1>Wallpaper library</h1><p class="subheading">Prepare every image for your exact display.</p></div><div class="header-actions"><span class="display-pill">▣ ${display.width} × ${display.height}</span><button class="primary" id="import-button">＋ Import wallpaper</button></div></header>
        ${selected ? editorMarkup() : emptyMarkup()}
      </main>
    </div>
    <input id="file-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden />
    <dialog id="profile-dialog"><form method="dialog" class="dialog-card profile-dialog-card" id="profile-form"><div class="dialog-head"><div><p class="eyebrow">LOCAL PROFILE</p><h2>Your PixelForge profile</h2></div><button class="icon-button" value="cancel" aria-label="Close">×</button></div><div class="profile-hero"><div class="profile-avatar-large">${profile.avatar ? `<img src="${profile.avatar}" alt="" />` : (profile.name ? esc(profile.name[0].toUpperCase()) : "?")}</div><div class="profile-identity"><h3>${profile.name ? esc(profile.name) : "Your name"}</h3><p>@${profile.name ? esc(profile.name.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 20) || "creator") : "creator"}</p><div class="profile-stats"><span><strong>${library.length}</strong> creations</span><span><strong>${profile.followers || 0}</strong> followers</span></div></div></div><div class="profile-actions"><button type="button" class="secondary" id="edit-profile">Edit profile</button><button type="button" class="secondary" id="view-archive">View archive</button></div><div class="profile-edit-fields"><p class="eyebrow">EDIT DETAILS</p><label>Display name<input id="profile-name" required maxlength="40" value="${esc(profile.name)}" placeholder="What should we call you?" /></label><label>Bio <span class="optional">optional</span><textarea id="profile-bio" maxlength="160" placeholder="A short introduction">${esc(profile.bio || "")}</textarea></label><label>Profile picture <span class="optional">optional · local only</span><input id="avatar-input" type="file" accept="image/png,image/jpeg,image/webp" /></label><div class="dialog-actions"><button value="cancel" class="secondary">Cancel</button><button value="default" class="primary">Save profile</button></div></div></form></dialog>
  `;
  bindEvents();
}

function emptyMarkup() {
  return `<section class="empty-state"><div class="empty-icon">✦</div><h2>Start with one wallpaper</h2><p>Import an image and PixelForge will prepare a display-aware preview without touching your original file.</p><button class="primary" id="empty-import">Import your first wallpaper</button><div class="feature-row"><span>✓ Original preserved</span><span>✓ Smart crop preview</span><span>✓ Local library</span></div></section>`;
}

function editorMarkup() {
  if (!selected) return "";
  return `<section class="workspace-grid"><div class="preview-column"><div class="section-label"><span>LIVE PREVIEW</span><span class="status-dot">● Optimized for this display</span></div><div class="wallpaper-preview" style="background-image:url('${selected.dataUrl}');background-position:${focalX}% ${focalY}%"><div class="preview-overlay"><span>${ratioLabel(display.width, display.height)}</span><span>${display.width} × ${display.height}</span></div></div><div class="preview-controls"><label>Horizontal focus <input id="focus-x" type="range" min="0" max="100" value="${focalX}" /></label><output>${focalX}%</output><label>Vertical focus <input id="focus-y" type="range" min="0" max="100" value="${focalY}" /></label><output>${focalY}%</output></div></div><aside class="inspector"><div class="section-label">WALLPAPER DETAILS</div><img class="thumb" src="${selected.dataUrl}" alt="${esc(selected.name)}" /><label>Wallpaper name<input id="wallpaper-name" value="${esc(selected.name)}" /></label><div class="meta-grid"><div><span>Source</span><strong>${esc(selected.sourceName)}</strong></div><div><span>Original</span><strong>${selected.width} × ${selected.height}</strong></div><div><span>Type</span><strong>Static image</strong></div><div><span>Mode</span><strong>Smart crop</strong></div></div><button class="apply-button" id="apply-button">Set as wallpaper <span>→</span></button><p class="hint" id="apply-hint">The Windows wallpaper adapter will apply this preview in the next engine slice.</p><div class="library-list"><div class="section-label">YOUR WALLPAPERS <span>${library.length}</span></div>${library.map((item) => `<button class="library-item ${item.id === selected?.id ? "selected" : ""}" data-wallpaper-id="${item.id}"><img src="${item.dataUrl}" alt="" /><span>${esc(item.name)}</span></button>`).join("")}</div></aside></section>`;
}

function openProfile() { document.querySelector<HTMLDialogElement>("#profile-dialog")?.showModal(); }
function openImport() { document.querySelector<HTMLInputElement>("#file-input")?.click(); }

function bindEvents() {
  document.querySelector("#import-button")?.addEventListener("click", openImport);
  document.querySelector("#empty-import")?.addEventListener("click", openImport);
  document.querySelector("#profile-button")?.addEventListener("click", openProfile);
  document.querySelector("#edit-profile")?.addEventListener("click", () => document.querySelector(".profile-edit-fields")?.classList.toggle("visible"));
  document.querySelector("#view-archive")?.addEventListener("click", () => document.querySelector<HTMLDialogElement>("#profile-dialog")?.close());
  document.querySelectorAll<HTMLButtonElement>(".nav-item").forEach((button) => button.addEventListener("click", () => {
    if (button.dataset.view !== "library") alert(`${button.textContent?.trim()} is coming after the library foundation is complete.`);
  }));
  document.querySelector<HTMLInputElement>("#file-input")?.addEventListener("change", importFile);
  document.querySelector<HTMLFormElement>("#profile-form")?.addEventListener("submit", saveProfile);
  document.querySelectorAll<HTMLButtonElement>("[data-wallpaper-id]").forEach((button) => button.addEventListener("click", () => {
    selected = library.find((item) => item.id === button.dataset.wallpaperId) || null; render();
  }));
  const focusX = document.querySelector<HTMLInputElement>("#focus-x");
  const focusY = document.querySelector<HTMLInputElement>("#focus-y");
  focusX?.addEventListener("input", () => { focalX = Number(focusX.value); render(); });
  focusY?.addEventListener("input", () => { focalY = Number(focusY.value); render(); });
  document.querySelector<HTMLInputElement>("#wallpaper-name")?.addEventListener("change", (event) => { if (!selected) return; selected.name = (event.target as HTMLInputElement).value.trim() || selected.sourceName; save(); render(); });
  document.querySelector("#apply-button")?.addEventListener("click", () => { const hint = document.querySelector("#apply-hint"); if (hint) hint.textContent = "Preview saved. Native wallpaper application will be connected next."; });
}

function importFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    const image = new Image();
    image.onload = () => {
      const item: Wallpaper = { id: crypto.randomUUID(), name: file.name.replace(/\.[^/.]+$/, "") || file.name, sourceName: file.name, dataUrl: String(reader.result), width: image.naturalWidth, height: image.naturalHeight, type: "image" };
      library = [item, ...library.filter((old) => old.sourceName !== item.sourceName)]; selected = item; save(); render();
    };
    image.src = String(reader.result);
  };
  reader.readAsDataURL(file);
}

function saveProfile(event: SubmitEvent) {
  event.preventDefault();
  const name = document.querySelector<HTMLInputElement>("#profile-name")?.value.trim() || "";
  const bio = document.querySelector<HTMLTextAreaElement>("#profile-bio")?.value.trim() || "";
  const avatarInput = document.querySelector<HTMLInputElement>("#avatar-input");
  const finish = (avatar?: string) => { profile = { name, bio, avatar: avatar || profile.avatar }; save(); document.querySelector<HTMLDialogElement>("#profile-dialog")?.close(); render(); };
  const file = avatarInput?.files?.[0];
  if (!file) return finish();
  const reader = new FileReader(); reader.onload = () => finish(String(reader.result)); reader.readAsDataURL(file);
}

render();
