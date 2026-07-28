/**
 * offline.js
 * Calculates and awards offline earnings based on elapsed real time
 * since the last save, then shows a "Welcome Back" popup.
 */
(function () {
  'use strict';

  const MAX_OFFLINE_SECONDS = 24 * 60 * 60; // cap offline earnings at 24 real hours
  const MIN_OFFLINE_SECONDS_TO_SHOW = 60; // don't bother popping up for quick refreshes

  const Offline = {
    /** Call once, right after a save is loaded on startup. */
    resolveOnLoad() {
      const last = Game.state.lastActiveTimestamp;
      if (!last) return;

      const elapsedSeconds = Math.max(0, (Date.now() - last) / 1000);
      if (elapsedSeconds < MIN_OFFLINE_SECONDS_TO_SHOW) return;

      const cappedSeconds = Math.min(elapsedSeconds, MAX_OFFLINE_SECONDS);
      const incomePerSec = Game.Cities.totalIncomePerSec();
      const offlineMultiplier = Game.Prestige.getOfflineEarningsMultiplier();
      const earned = incomePerSec * cappedSeconds * offlineMultiplier;

      if (earned <= 0) return;

      Game.state.sparks += earned;
      Game.state.lifetimeSparks += earned;
      Game.state.stats.offlineEarningsTotal += earned;

      Offline.showPopup(cappedSeconds, earned, offlineMultiplier);
    },

    showPopup(seconds, earned, offlineMultiplier) {
      document.getElementById('offline-time-away').textContent = `You were away for ${Game.Utils.formatDuration(seconds)}.`;
      document.getElementById('offline-earned-amount').textContent = Game.Utils.formatNumber(earned);
      document.getElementById('offline-multiplier').textContent = `Bonus Multiplier: ×${offlineMultiplier.toFixed(2)} (offline efficiency, includes Prestige + City + Achievement bonuses)`;
      Game.UI.openModal('modal-offline');
    },
  };

  window.Game.Offline = Offline;
})();
