/**
 * achievements.js
 * Achievement definitions + checking. Reaching an achievement's condition
 * only unlocks it as "Ready to Claim" — rewards (Sparks, Ultimate Sparks,
 * permanent bonuses, cosmetic titles) are never granted automatically.
 * The player must press Claim per-achievement; only then is the reward
 * applied and the achievement marked Claimed (which is what's permanent
 * and never reset by prestige — the claim, not just the condition).
 */
(function () {
  'use strict';

  const ACHIEVEMENT_LIST = [
    { id: 'reach_1k', name: 'First Light', icon: '⚡', desc: 'Reach 1,000 lifetime Sparks.', bonus: 0.01, sparksReward: 100, test: (s) => s.lifetimeSparks >= 1e3, progress: (s) => ({ current: s.lifetimeSparks, target: 1e3 }) },
    { id: 'reach_100k', name: 'Six Figures', icon: '💵', desc: 'Reach 100,000 lifetime Sparks.', bonus: 0.01, sparksReward: 50000, test: (s) => s.lifetimeSparks >= 1e5, progress: (s) => ({ current: s.lifetimeSparks, target: 1e5 }) },
    { id: 'reach_1m', name: 'Spark Millionaire', icon: '💰', desc: 'Reach 1,000,000 lifetime Sparks.', bonus: 0.01, sparksReward: 200000, test: (s) => s.lifetimeSparks >= 1e6, progress: (s) => ({ current: s.lifetimeSparks, target: 1e6 }) },
    { id: 'reach_1b', name: 'Spark Billionaire', icon: '💎', desc: 'Reach 1,000,000,000 lifetime Sparks.', bonus: 0.01, sparksReward: 100000000, ultimateSparksReward: 2, test: (s) => s.lifetimeSparks >= 1e9, progress: (s) => ({ current: s.lifetimeSparks, target: 1e9 }) },
    { id: 'reach_1t', name: 'Spark Titan', icon: '🌟', desc: 'Reach 1,000,000,000,000 lifetime Sparks.', bonus: 0.02, ultimateSparksReward: 10, test: (s) => s.lifetimeSparks >= 1e12, progress: (s) => ({ current: s.lifetimeSparks, target: 1e12 }) },
    { id: 'unlock_river_town', name: 'Down the River', icon: '🌇', desc: 'Unlock River Town.', bonus: 0.01, test: (s) => s.cities.river_town.unlocked },
    { id: 'unlock_metro_city', name: 'Big City Lights', icon: '🌃', desc: 'Unlock Metro City.', bonus: 0.01, test: (s) => s.cities.metro_city.unlocked },
    { id: 'unlock_capital_city', name: 'Seat of Power', icon: '🏛️', desc: 'Unlock Capital City.', bonus: 0.01, test: (s) => s.cities.capital_city.unlocked },
    { id: 'unlock_future_city', name: 'Tomorrow, Today', icon: '🛰️', desc: 'Unlock Future City.', bonus: 0.02, ultimateSparksReward: 1, test: (s) => s.cities.future_city.unlocked },
    { id: 'first_building', name: 'Groundbreaking', icon: '🧱', desc: 'Purchase your first building.', bonus: 0.01, test: (s) => s.stats.buildingsPurchased >= 1 },
    { id: 'ten_buildings', name: 'Urban Planner', icon: '🏗️', desc: 'Purchase 10 buildings.', bonus: 0.01, test: (s) => s.stats.buildingsPurchased >= 10, progress: (s) => ({ current: s.stats.buildingsPurchased, target: 10 }) },
    { id: 'all_buildings', name: 'Full Occupancy', icon: '🏘️', desc: 'Purchase all 30 buildings.', bonus: 0.02, clickBonus: 0.05, test: (s) => s.stats.buildingsPurchased >= 30, progress: (s) => ({ current: s.stats.buildingsPurchased, target: 30 }) },
    { id: 'reach_level_25', name: 'Rising Star', icon: '🌱', desc: 'Reach Level 25 on any building.', bonus: 0.01, sparksReward: 1000, test: (s) => Object.values(s.buildingRecords).some((arr) => arr.some((lvl) => lvl >= 25)), progress: (s) => ({ current: Math.max(0, ...Object.values(s.buildingRecords).flat()), target: 25 }) },
    { id: 'reach_level_50', name: 'Halfway Titan', icon: '🏔️', desc: 'Reach Level 50 on any building.', bonus: 0.02, ultimateSparksReward: 1, test: (s) => Object.values(s.buildingRecords).some((arr) => arr.some((lvl) => lvl >= 50)), progress: (s) => ({ current: Math.max(0, ...Object.values(s.buildingRecords).flat()), target: 50 }) },
    { id: 'max_building', name: 'Fully Powered', icon: '🔋', desc: 'Max a building to level 100.', bonus: 0.01, clickBonus: 0.05, test: (s) => s.stats.buildingsMaxed >= 1 },
    { id: 'max_five_buildings', name: 'Powerhouse', icon: '🔌', desc: 'Max 5 buildings.', bonus: 0.01, clickBonus: 0.05, test: (s) => s.stats.buildingsMaxed >= 5, progress: (s) => ({ current: s.stats.buildingsMaxed, target: 5 }) },
    { id: 'max_city', name: 'City Perfected', icon: '🏆', desc: 'Complete any city.', bonus: 0.02, ultimateSparksReward: 1, test: (s) => s.stats.citiesCompletedCount >= 1 },
    { id: 'complete_all_cities', name: 'Light Across the Land', icon: '🌍', desc: 'Complete all 5 cities.', bonus: 0.05, ultimateSparksReward: 10, cosmetic: 'Light Bringer', test: (s) => s.stats.citiesCompletedCount >= 5, progress: (s) => ({ current: s.stats.citiesCompletedCount, target: 5 }) },
    { id: 'first_auto_collector', name: 'Automation Begins', icon: '🤖', desc: 'Install your first Auto Collector.', bonus: 0.01, test: (s) => Object.values(s.cities).some((c) => c.buildings.some((b) => b.autoCollector)) },
    { id: 'first_prestige', name: 'Reborn in Light', icon: '🔁', desc: 'Prestige for the first time.', bonus: 0.02, ultimateSparksReward: 1, test: (s) => s.prestigeCount >= 1 },
    { id: 'ten_prestiges', name: 'Cycle Runner', icon: '♻️', desc: 'Prestige 10 times.', bonus: 0.02, ultimateSparksReward: 5, test: (s) => s.prestigeCount >= 10, progress: (s) => ({ current: s.prestigeCount, target: 10 }) },
    { id: 'hundred_prestiges', name: 'Eternal Spark', icon: '♾️', desc: 'Prestige 100 times.', bonus: 0.05, ultimateSparksReward: 25, cosmetic: 'Eternal Spark', test: (s) => s.prestigeCount >= 100, progress: (s) => ({ current: s.prestigeCount, target: 100 }) },
    { id: 'busy_hands', name: 'Busy Hands', icon: '👆', desc: 'Manually collect 500 times.', bonus: 0.01, clickBonus: 0.05, test: (s) => s.stats.totalClicks >= 500, progress: (s) => ({ current: s.stats.totalClicks, target: 500 }) },
    { id: 'tireless_hands', name: 'Tireless Hands', icon: '✋', desc: 'Manually collect 5,000 times.', bonus: 0.01, clickBonus: 0.1, test: (s) => s.stats.totalClicks >= 5000, progress: (s) => ({ current: s.stats.totalClicks, target: 5000 }) },
    { id: 'ultimate_hoarder', name: 'Ultimate Hoarder', icon: '⭐', desc: 'Hold 100 Ultimate Sparks at once.', bonus: 0.02, cosmetic: 'Hoarder', test: (s) => s.ultimateSparks >= 100, progress: (s) => ({ current: s.ultimateSparks, target: 100 }) },
  ];

  const Achievements = {
    LIST: ACHIEVEMENT_LIST,

    createFreshState() {
      return { unlocked: {}, claimed: {} };
    },

    getDef(id) {
      return ACHIEVEMENT_LIST.find((def) => def.id === id);
    },

    isUnlocked(id) {
      return !!Game.state.achievements.unlocked[id];
    },

    isClaimed(id) {
      return !!Game.state.achievements.claimed[id];
    },

    /** 'locked' | 'in_progress' | 'ready' | 'claimed' — drives the achievement card UI. */
    getStatus(id) {
      if (Achievements.isClaimed(id)) return 'claimed';
      if (Achievements.isUnlocked(id)) return 'ready';
      const def = Achievements.getDef(id);
      if (def.progress) {
        const p = def.progress(Game.state);
        if (p && p.current > 0) return 'in_progress';
      }
      return 'locked';
    },

    /** {current, target, pct} for achievements with a numeric progress function, else null. */
    getProgress(id) {
      const def = Achievements.getDef(id);
      if (!def.progress) return null;
      const p = def.progress(Game.state);
      if (!p) return null;
      const pct = Math.max(0, Math.min(100, (p.current / p.target) * 100));
      return { current: p.current, target: p.target, pct };
    },

    /** Re-evaluates every achievement predicate; newly-met ones become "Ready to
     * Claim" — no reward is granted here, only a notification that one is waiting. */
    check() {
      let anyNew = false;
      ACHIEVEMENT_LIST.forEach((def) => {
        if (Achievements.isUnlocked(def.id)) return;
        if (!def.test(Game.state)) return;

        Game.state.achievements.unlocked[def.id] = true;
        anyNew = true;

        Game.Audio.play('achievement');
        Game.UI.notify(`🏆 Achievement unlocked: ${def.name} — reward ready to claim!`, 'achievement');
      });
      if (anyNew) {
        Game.UI.renderAchievements();
        Game.UI.refreshHUD();
      }
    },

    /** Grants the reward for one unlocked-but-unclaimed achievement. */
    claim(id) {
      const def = Achievements.getDef(id);
      if (!def) return false;
      if (!Achievements.isUnlocked(id) || Achievements.isClaimed(id)) return false;

      const rewardParts = [];
      if (def.sparksReward) {
        Game.state.sparks += def.sparksReward;
        Game.state.lifetimeSparks += def.sparksReward;
        rewardParts.push(`+${Game.Utils.formatNumber(def.sparksReward)} ⚡`);
      }
      if (def.ultimateSparksReward) {
        Game.state.ultimateSparks += def.ultimateSparksReward;
        rewardParts.push(`+${def.ultimateSparksReward} ⭐`);
      }
      if (def.bonus) rewardParts.push(`+${Math.round(def.bonus * 100)}% income`);
      if (def.clickBonus) rewardParts.push(`+${Math.round(def.clickBonus * 100)}% click power`);
      if (def.cosmetic) rewardParts.push(`title "${def.cosmetic}"`);

      Game.state.achievements.claimed[id] = true;

      Game.Audio.play('achievement');
      Game.UI.notify(`Claimed: ${def.name} (${rewardParts.join(', ')})`, 'success');
      Game.UI.renderAchievements();
      Game.UI.refreshHUD();
      Game.Save.save();
      return true;
    },

    /** Combined permanent income bonus from all CLAIMED achievements. */
    getBonusMultiplier() {
      let mult = 1;
      ACHIEVEMENT_LIST.forEach((def) => {
        if (Achievements.isClaimed(def.id) && def.bonus) mult += def.bonus;
      });
      return mult;
    },

    /** Combined permanent click-power bonus from CLAIMED achievements. */
    getClickBonusMultiplier() {
      let mult = 1;
      ACHIEVEMENT_LIST.forEach((def) => {
        if (Achievements.isClaimed(def.id) && def.clickBonus) mult += def.clickBonus;
      });
      return mult;
    },

    /** The most prestigious cosmetic title the player has claimed via achievements, or null. */
    getCosmeticTitle() {
      const achievementTitles = ACHIEVEMENT_LIST.filter((def) => def.cosmetic && Achievements.isClaimed(def.id)).map(
        (def) => def.cosmetic
      );
      return achievementTitles.length ? achievementTitles[achievementTitles.length - 1] : null;
    },

    unlockedCount() {
      return ACHIEVEMENT_LIST.filter((def) => Achievements.isUnlocked(def.id)).length;
    },

    claimedCount() {
      return ACHIEVEMENT_LIST.filter((def) => Achievements.isClaimed(def.id)).length;
    },
  };

  window.Game.Achievements = Achievements;
})();
