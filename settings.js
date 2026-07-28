/**
 * settings.js
 * Player-facing settings: theme, audio toggles, animation/UI toggles,
 * and the reset/export/import actions (delegated to save.js).
 */
(function () {
  'use strict';

  const Settings = {
    createFreshState() {
      return {
        theme: 'dark',
        sound: true,
        music: false,
        animations: true,
        floatingNumbers: true,
        notifications: true,
      };
    },

    /** Applies current settings to the DOM (theme class, etc.) — call after load and after any change. */
    apply() {
      const s = Game.state.settings;
      document.body.classList.toggle('theme-light', s.theme === 'light');
      document.body.classList.toggle('theme-dark', s.theme !== 'light');
      document.body.classList.toggle('no-animations', !s.animations);

      document.querySelectorAll('#setting-theme .seg-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.value === s.theme);
      });
      document.getElementById('setting-sound').checked = s.sound;
      document.getElementById('setting-music').checked = s.music;
      document.getElementById('setting-animations').checked = s.animations;
      document.getElementById('setting-floating').checked = s.floatingNumbers;
      document.getElementById('setting-notifications').checked = s.notifications;
    },

    setTheme(theme) {
      Game.state.settings.theme = theme;
      Settings.apply();
      Game.Save.save();
    },

    toggle(key, value) {
      Game.state.settings[key] = value;
      if (key === 'music') Game.Audio.setMusicEnabled(value);
      Settings.apply();
      Game.Save.save();
    },

    bindEvents() {
      document.getElementById('setting-theme').addEventListener('click', (e) => {
        const btn = e.target.closest('.seg-btn');
        if (btn) Settings.setTheme(btn.dataset.value);
      });
      document.getElementById('setting-sound').addEventListener('change', (e) => Settings.toggle('sound', e.target.checked));
      document.getElementById('setting-music').addEventListener('change', (e) => Settings.toggle('music', e.target.checked));
      document.getElementById('setting-animations').addEventListener('change', (e) => Settings.toggle('animations', e.target.checked));
      document.getElementById('setting-floating').addEventListener('change', (e) => Settings.toggle('floatingNumbers', e.target.checked));
      document.getElementById('setting-notifications').addEventListener('change', (e) => Settings.toggle('notifications', e.target.checked));

      document.getElementById('btn-export-save').addEventListener('click', () => Game.Save.exportSave());
      document.getElementById('btn-import-save').addEventListener('click', () => document.getElementById('import-file-input').click());
      document.getElementById('import-file-input').addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) Game.Save.importSave(file);
        e.target.value = '';
      });
      document.getElementById('btn-reset-save').addEventListener('click', () => {
        if (confirm('Reset ALL progress, including Ultimate Sparks and achievements? This cannot be undone.')) {
          Game.Save.resetSave();
        }
      });
    },
  };

  window.Game.Settings = Settings;
})();
