// Every setting of the site, one entry each (docs/CODE-RULES.md, "Settings").

import { S, store } from "./state.js";
import { KEY_SOUNDS, MISS_SOUNDS } from "./sound.js";

export const CATEGORIES = ["text", "caret", "typing", "sound", "keyboard", "goals", "data"];

export const LENGTHS = ["words-10", "words-20", "words-30", "words-40", "words-50", "time-15", "time-30", "time-60", "time-90"];
export const DAILY = [0, 5, 10, 15, 20, 30, 45, 60];

const anySound = () => S.settings.keySound !== "off" || S.settings.missSound !== "off";
const kbKey = () => "tt.kb." + S.mode;

export const SETTINGS = [
  // ---------- text ----------
  { id: "ws", cat: "text", kind: "choice", values: ["dot", "none"], def: "dot", store: "tt.ws", body: true, words: "space mark dot gap" },
  { id: "live", cat: "text", kind: "switch", def: true, store: "tt.live", body: true, tip: true, words: "wpm accuracy numbers" },
  { id: "streak", cat: "text", kind: "switch", def: false, store: "tt.streak.free", body: true, tip: true, modes: ["freetype"], words: "combo clean words" },
  { id: "bg", cat: "text", kind: "choice", values: ["off", "keys"], def: "keys", store: "tt.bg", tip: true, words: "falling keycaps background decoration animation" },

  // ---------- caret ----------
  { id: "caret", cat: "caret", kind: "choice", values: ["line", "block"], def: "line", store: "tt.caret", body: true, preview: true, icons: true, words: "cursor" },
  { id: "glide", cat: "caret", kind: "choice", values: ["smooth", "jump"], def: "smooth", store: "tt.glide", body: true, preview: true, words: "cursor movement animation" },

  // ---------- typing ----------
  { id: "stop", cat: "typing", kind: "switch", def: false, store: "tt.stop", tip: true, words: "mistake error block" },
  { id: "length", cat: "typing", kind: "length", values: LENGTHS, modes: ["climb", "freetype"], tip: true, words: "words time seconds round",
    show: () => S.mode !== "learn" },

  // ---------- sound ----------
  { id: "keySound", cat: "sound", kind: "choice", values: KEY_SOUNDS, def: "off", store: "tt.keySound", words: "click audio" },
  { id: "missSound", cat: "sound", kind: "choice", values: MISS_SOUNDS, def: "off", store: "tt.missSound", words: "error audio" },
  { id: "volume", cat: "sound", kind: "choice", values: ["25", "50", "75", "100"], def: "50", store: "tt.volume", unit: "settings.pct", words: "loud audio", show: anySound },

  // ---------- keyboard ----------
  { id: "kb", cat: "keyboard", kind: "switch", tip: true, words: "on-screen alt+k", touch: false,
    get: () => !S.kbHidden, set: (on) => store.set(kbKey(), on ? "on" : "off") },
  { id: "nextKey", cat: "keyboard", kind: "switch", def: true, store: "tt.nextKey", touch: false, words: "highlight" },
  { id: "hand", cat: "keyboard", kind: "switch", def: true, store: "tt.hand", body: true, touch: false, words: "finger" },

  // ---------- goals ----------
  { id: "daily", cat: "goals", kind: "choice", values: DAILY, def: 15, store: "tt.daily", words: "minutes day" },
  { id: "goal", cat: "goals", kind: "number", min: 20, max: 300, step: 5, start: 40, def: 0, store: "tt.goal", tip: true, modes: ["climb", "freetype"],
    words: "wpm speed target chart line" },

  // ---------- data ----------
  { id: "data", cat: "data", kind: "action", buttons: [["btn-export", "export", "data.save"], ["btn-import", "import", "data.load"]], tip: true,
    words: "export import backup file" },
  { id: "danger", cat: "data", kind: "action", buttons: [["btn-reset", "trash", "data.reset", "danger"]], tip: true, words: "reset delete clear" },
];
