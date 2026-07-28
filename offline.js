/**
 * offline.js
 * Calculates offline earnings based on elapsed real time since the last
 * save (capped at 2 hours), then shows a "Welcome Back" popup. Nothing is
 * credited to the player until they press Claim — see claim().
 */
(function () {
  'use strict';

  const MAX_OFFLINE_SECONDS = 2 * 60 * 60; // cap offline earnings at 2 real hours
  const MIN_OFFLINE_SECONDS_TO_SHOW = 60; // don't bother popping up for quick refreshes

  const Offline = {
    /** Call once, right after a save is loaded on startup. Computes the pending
     * amount and shows the popup, but does NOT credit it yet. */
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

      Game.state.pendingOffline = { seconds: cappedSeconds, earned, multiplier: offlineMultiplier };
      Offline.showPopup(cappedSeconds, earned, offlineMultiplier);
    },

    showPopup(seconds, earned, offlineMultiplier) {
      document.getElementById('offline-time-away').textContent = `Time Away: ${Game.Utils.formatDuration(seconds)}`;
      document.getElementById('offline-earned-amount').textContent = Game.Utils.formatNumber(earned);
      document.getElementById('offline-multiplier').textContent = `Bonus Multiplier: ×${offlineMultiplier.toFixed(2)} (offline efficiency, includes Prestige + City + Achievement bonuses)`;
      Game.UI.openModal('modal-offline');
    },

    /** Player pressed Claim — only now does the pending amount actually get credited. */
    claim() {
      const pending = Game.state.pendingOffline;
      if (!pending) return false;

      Game.state.sparks += pending.earned;
      Game.state.lifetimeSparks += pending.earned;
      Game.state.stats.offlineEarningsTotal += pending.earned;
      Game.state.pendingOffline = null;

      Game.UI.closeModal('modal-offline');
      Game.UI.fullRefresh();
      Game.Achievements.check();
      Game.Save.save();
      return true;
    },
  };

  window.Game.Offline = Offline;
})();
