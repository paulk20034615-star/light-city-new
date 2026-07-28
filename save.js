/**
 * save.js
 * LocalStorage persistence: autosave, save-on-action, export/import,
 * and full reset. Offline-earnings timing is anchored on
 * `state.lastActiveTimestamp`, refreshed every time we save.
 */
(function () {
  'use strict';

  const SAVE_KEY = 'lightCityGame_save_v1';
  const AUTOSAVE_INTERVAL_MS = 15000;
  const EXPECTED_KEYS = ['sparks', 'lifetimeSparks', 'ultimateSparks', 'cities', 'prestigeUpgrades'];

  let autosaveTimer = null;
  let beforeUnloadHandler = null;

  const Save = {
    save() {
      Game.state.lastActiveTimestamp = Date.now();
      try {
        localStorage.setItem(SAVE_KEY, JSON.stringify(Game.state));
      } catch (err) {
        console.error('Light City: failed to save game.', err);
      }
    },

    hasSave() {
      return !!localStorage.getItem(SAVE_KEY);
    },

    /** Returns the parsed save object, or null if none/invalid. */
    load() {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      try {
        const parsed = JSON.parse(raw);
        if (!EXPECTED_KEYS.every((key) => key in parsed)) return null;
        return parsed;
      } catch (err) {
        console.error('Light City: failed to parse save.', err);
        return null;
      }
    },

    startAutosave() {
      if (autosaveTimer) clearInterval(autosaveTimer);
      autosaveTimer = setInterval(Save.save, AUTOSAVE_INTERVAL_MS);
      if (!beforeUnloadHandler) {
        beforeUnloadHandler = () => Save.save();
        window.addEventListener('beforeunload', beforeUnloadHandler);
      }
    },

    /** Stops autosave-on-exit. Must be called before any reload that should NOT
     * persist the current in-memory state (e.g. resetSave) — otherwise the
     * beforeunload handler re-writes the old state back to localStorage during
     * the very reload meant to clear it. */
    stopAutosave() {
      if (autosaveTimer) {
        clearInterval(autosaveTimer);
        autosaveTimer = null;
      }
      if (beforeUnloadHandler) {
        window.removeEventListener('beforeunload', beforeUnloadHandler);
        beforeUnloadHandler = null;
      }
    },

    exportSave() {
      Save.save();
      const blob = new Blob([JSON.stringify(Game.state, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `light-city-save-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      Game.UI.notify('Save exported.', 'success');
    },

    importSave(file) {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result);
          if (!EXPECTED_KEYS.every((key) => key in parsed)) {
            throw new Error('Not a valid Light City save file.');
          }
          Object.assign(Game.state, parsed);
          Save.save();
          Game.UI.fullRefresh();
          Game.UI.notify('Save imported successfully.', 'success');
        } catch (err) {
          Game.UI.notify('Import failed: invalid save file.', 'error');
          console.error('Light City: import failed.', err);
        }
      };
      reader.readAsText(file);
    },

    resetSave() {
      Save.stopAutosave();
      localStorage.removeItem(SAVE_KEY);
      window.location.reload();
    },
  };

  window.Game.Save = Save;
})();
