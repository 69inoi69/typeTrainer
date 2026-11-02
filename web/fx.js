// The toast.

export const FX = (() => {
  // ---------- messages: part of the interface, not pop-ups ----------
  const NOTE_MS = 3500;
  const INFO_ICON = '<circle cx="12" cy="12" r="8"/><path d="M12 11v5M12 8h.01"/>';
  const queue = [];
  let current = null;
  function toast(html, act) {
    queue.push({ html, act });
    if (!current) showNext();
  }
  function showNext() {
    const box = document.getElementById("notice");
    const item = queue.shift();
    if (!item) {
      current = null;
      return;
    }
    const node = document.createElement("div");
    node.className = "note";
    const mark = document.createElement("span");
    mark.className = "note-mark";
    mark.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${INFO_ICON}</svg>`;
    node.innerHTML = `<span class="note-body">${item.html}</span>`;
    node.prepend(mark);
    if (item.act) node.querySelector(".note-act")?.addEventListener("click", item.act);
    node.addEventListener("click", () => closeNote(node));
    box.replaceChildren(node);
    current = node;
    setTimeout(() => closeNote(node), NOTE_MS);
  }
  function closeNote(node) {
    if (node !== current) return;
    node.remove();
    showNext();
  }

  return { toast };
})();
