/**
 * achievements.js
 * Achievement definitions + checking. Each unlocked achievement grants a
 * small permanent global-income bonus, and achievements are never reset
 * by prestige.
 */
(function () {
  'use strict';

  const ACHIEVEMENT_LIST = [
    { id: 'reach_1k', name: 'First Light', icon: '⚡', desc: 'Reach 1,000 lifetime Sparks.', bonus: 0.01, sparksReward: 50, test: (s) => s.lifetimeSparks >= 1e3 },
    { id: 'reach_1m', name: 'Spark Millionaire', icon: '💰', desc: 'Reach 1,000,000 lifetime Sparks.', bonus: 0.01, sparksReward: 5000, test: (s) => s.lifetimeSparks >= 1e6 },
    { id: 'reach_1b', name: 'Spark Billionaire', icon: '💎', desc: 'Reach 1,000,000,000 lifetime Sparks.', bonus: 0.01, sparksReward: 500000, test: (s) => s.lifetimeSparks >= 1e9 },
    { id: 'reach_1t', name: 'Spark Titan', icon: '🌟', desc: 'Reach 1,000,000,000,000 lifetime Sparks.', bonus: 0.02, ultimateSparksReward: 2, test: (s) => s.lifetimeSparks >= 1e12 },
    { id: 'unlock_river_town', name: 'Down the River', icon: '🌇', desc: 'Unlock River Town.', bonus: 0.01, test: (s) => s.cities.river_town.unlocked },
    { id: 'unlock_metro_city', name: 'Big City Lights', icon: '🌃', desc: 'Unlock Metro City.', bonus: 0.01, test: (s) => s.cities.metro_city.unlocked },
    { id: 'unlock_capital_city', name: 'Seat of Power', icon: '🏛️', desc: 'Unlock Capital City.', bonus: 0.01, test: (s) => s.cities.capital_city.unlocked },
    { id: 'unlock_future_city', name: 'Tomorrow, Today', icon: '🛰️', desc: 'Unlock Future City.', bonus: 0.02, ultimateSparksReward: 1, test: (s) => s.cities.future_city.unlocked },
    { id: 'first_building', name: 'Groundbreaking', icon: '🧱', desc: 'Purchase your first building.', bonus: 0.01, test: (s) => s.stats.buildingsPurchased >= 1 },
    { id: 'ten_buildings', name: 'Urban Planner', icon: '🏗️', desc: 'Purchase 10 buildings.', bonus: 0.01, test: (s) => s.stats.buildingsPurchased >= 10 },
    { id: 'all_buildings', name: 'Full Occupancy', icon: '🏘️', desc: 'Purchase all 30 buildings.', bonus: 0.02, clickBonus: 0.05, test: (s) => s.stats.buildingsPurchased >= 30 },
    { id: 'reach_level_25', name: 'Rising Star', icon: '🌱', desc: 'Reach Level 25 on any building.', bonus: 0.01, sparksReward: 1000, test: (s) => Object.values(s.buildingRecords).some((arr) => arr.some((lvl) => lvl >= 25)) },
    { id: 'reach_level_50', name: 'Halfway Titan', icon: '🏔️', desc: 'Reach Level 50 on any building.', bonus: 0.02, ultimateSparksReward: 1, test: (s) => Object.values(s.buildingRecords).some((arr) => arr.some((lvl) => lvl >= 50)) },
    { id: 'max_building', name: 'Fully Powered', icon: '🔋', desc: 'Max a building to level 100.', bonus: 0.01, clickBonus: 0.05, test: (s) => s.stats.buildingsMaxed >= 1 },
    { id: 'max_five_buildings', name: 'Powerhouse', icon: '🔌', desc: 'Max 5 buildings.', bonus: 0.01, clickBonus: 0.05, test: (s) => s.stats.buildingsMaxed >= 5 },
    { id: 'max_city', name: 'City Perfected', icon: '🏆', desc: 'Complete any city.', bonus: 0.02, ultimateSparksReward: 1, test: (s) => s.stats.citiesCompletedCount >= 1 },
    { id: 'complete_all_cities', name: 'Light Across the Land', icon: '🌍', desc: 'Complete all 5 cities.', bonus: 0.05, ultimateSparksReward: 10, cosmetic: 'Light Bringer', test: (s) => s.stats.citiesCompletedCount >= 5 },
    { id: 'first_auto_collector', name: 'Automation Begins', icon: '🤖', desc: 'Install your first Auto Collector.', bonus: 0.01, test: (s) => Object.values(s.cities).some((c) => c.buildings.some((b) => b.autoCollector)) },
    { id: 'first_prestige', name: 'Reborn in Light', icon: '🔁', desc: 'Prestige for the first time.', bonus: 0.02, ultimateSparksReward: 1, test: (s) => s.prestigeCount >= 1 },
    { id: 'ten_prestiges', name: 'Cycle Runner', icon: '♻️', desc: 'Prestige 10 times.', bonus: 0.02, ultimateSparksReward: 5, test: (s) => s.prestigeCount >= 10 },
    { id: 'hundred_prestiges', name: 'Eternal Spark', icon: '♾️', desc: 'Prestige 100 times.', bonus: 0.05, ultimateSparksReward: 25, cosmetic: 'Eternal Spark', test: (s) => s.prestigeCount >= 100 },
    { id: 'busy_hands', name: 'Busy Hands', icon: '👆', desc: 'Manually collect 500 times.', bonus: 0.01, clickBonus: 0.05, test: (s) => s.stats.totalClicks >= 500 },
    { id: 'tireless_hands', name: 'Tireless Hands', icon: '✋', desc: 'Manually collect 5,000 times.', bonus: 0.01, clickBonus: 0.1, test: (s) => s.stats.totalClicks >= 5000 },
    { id: 'ultimate_hoarder', name: 'Ultimate Hoarder', icon: '⭐', desc: 'Hold 100 Ultimate Sparks at once.', bonus: 0.02, cosmetic: 'Hoarder', test: (s) => s.ultimateSparks >= 100 },
  ];

  const Achievements = {
    LIST: ACHIEVEMENT_LIST,

    createFreshState() {
      return { unlocked: {} };
    },

    isUnlocked(id) {
      return !!Game.state.achievements.unlocked[id];
    },

    /** Re-evaluates every achievement predicate; unlocks any newly-earned ones and
     * grants their one-time rewards (Sparks, Ultimate Sparks, cosmetic titles). */
    check() {
      let anyNew = false;
      ACHIEVEMENT_LIST.forEach((def) => {
        if (Achievements.isUnlocked(def.id)) return;
        if (!def.test(Game.state)) return;

        Game.state.achievements.unlocked[def.id] = true;
        anyNew = true;

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
        if (def.cosmetic) rewardParts.push(`title "${def.cosmetic}"`);

        Game.Audio.play('achievement');
        const rewardText = rewardParts.length ? ` (${rewardParts.join(', ')})` : '';
        Game.UI.notify(`Achievement unlocked: ${def.name}${rewardText}`, 'achievement');
      });
      if (anyNew) {
        Game.UI.renderAchievements();
        Game.UI.refreshHUD();
      }
    },

    /** Combined permanent income bonus from all unlocked achievements. */
    getBonusMultiplier() {
      let mult = 1;
      ACHIEVEMENT_LIST.forEach((def) => {
        if (Achievements.isUnlocked(def.id) && def.bonus) mult += def.bonus;
      });
      return mult;
    },

    /** Combined permanent click-power bonus from unlocked achievements. */
    getClickBonusMultiplier() {
      let mult = 1;
      ACHIEVEMENT_LIST.forEach((def) => {
        if (Achievements.isUnlocked(def.id) && def.clickBonus) mult += def.clickBonus;
      });
      return mult;
    },

    /** The most prestigious cosmetic title the player has unlocked via achievements, or null. */
    getCosmeticTitle() {
      const achievementTitles = ACHIEVEMENT_LIST.filter((def) => def.cosmetic && Achievements.isUnlocked(def.id)).map(
        (def) => def.cosmetic
      );
      return achievementTitles.length ? achievementTitles[achievementTitles.length - 1] : null;
    },

    unlockedCount() {
      return ACHIEVEMENT_LIST.filter((def) => Achievements.isUnlocked(def.id)).length;
    },
  };

  window.Game.Achievements = Achievements;
})();
