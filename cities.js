/**
 * cities.js
 * Static city data + city-level logic: unlocking, switching, completion,
 * permanent rewards, and the visual "scene" (sky/skyline/ground/weather).
 */
(function () {
  'use strict';

  // ---------------------------------------------------------------------
  // Static city definitions
  // ---------------------------------------------------------------------
  const CITY_DATA = [
    {
      id: 'green_village',
      name: 'Green Village',
      unlockCost: 0,
      theme: 'theme-green-village',
      atmosphere: 'Morning',
      rewardKey: 'globalIncomeMult',
      rewardAmount: 0.10,
      rewardLabel: '+10% Global Income',
      buildingNames: ['Hut', 'Grocery Shop', 'Bakery', 'Café', 'Workshop', 'Warehouse'],
    },
    {
      id: 'river_town',
      name: 'River Town',
      unlockCost: 1e6,
      theme: 'theme-river-town',
      atmosphere: 'Sunset',
      rewardKey: 'productionSpeedMult',
      rewardAmount: 0.10,
      rewardLabel: '+10% Production Speed',
      buildingNames: ['Restaurant', 'Clothing Store', 'Pharmacy', 'Electronics Shop', 'Hotel', 'Factory'],
    },
    {
      id: 'metro_city',
      name: 'Metro City',
      unlockCost: 1e8,
      theme: 'theme-metro-city',
      atmosphere: 'Night Lights',
      rewardKey: 'offlineIncomeMult',
      rewardAmount: 0.15,
      rewardLabel: '+15% Offline Income',
      buildingNames: ['Bank', 'Shopping Mall', 'Cinema', 'Supermarket', 'Hospital', 'Technology Center'],
    },
    {
      id: 'capital_city',
      name: 'Capital City',
      unlockCost: 1e10,
      theme: 'theme-capital-city',
      atmosphere: 'Luxury Skyline',
      rewardKey: 'autoCollectorSpeedMult',
      rewardAmount: 0.20,
      rewardLabel: '+20% Auto Collector Speed',
      buildingNames: ['Airport', 'University', 'Corporate Office', 'Industrial Park', 'Stadium', 'Financial Center'],
    },
    {
      id: 'future_city',
      name: 'Future City',
      unlockCost: 1e12,
      theme: 'theme-future-city',
      atmosphere: 'Cyberpunk Neon',
      rewardKey: 'ultimateSparkGainMult',
      rewardAmount: 0.25,
      rewardLabel: '+25% Ultimate Spark Gain',
      buildingNames: ['AI Laboratory', 'Space Port', 'Quantum Factory', 'Energy Core', 'Mega Tower', 'Smart City Hub'],
    },
  ];

  const Cities = {
    data: CITY_DATA,

    /** Returns the static definition for a city id. */
    getDef(cityId) {
      return CITY_DATA.find((c) => c.id === cityId);
    },

    getDefByIndex(index) {
      return CITY_DATA[index];
    },

    /** Fresh per-save city state (used on new game + after prestige). */
    createFreshCityState(cityId) {
      const def = Cities.getDef(cityId);
      const isFirst = def.unlockCost === 0;
      return {
        id: cityId,
        unlocked: isFirst,
        completed: false,
        rewardEarned: false, // set true permanently once completion reward granted (kept across prestige)
        buildings: def.buildingNames.map((name, index) =>
          Game.Buildings.createFreshBuildingState(cityId, index)
        ),
      };
    },

    /** Builds the initial `cities` map for a brand-new save. */
    createFreshCitiesMap() {
      const map = {};
      CITY_DATA.forEach((def) => {
        map[def.id] = Cities.createFreshCityState(def.id);
      });
      return map;
    },

    /** Resets progression on prestige, but preserves permanent rewards + unlock flag for city 1. */
    resetForPrestige() {
      const fresh = Cities.createFreshCitiesMap();
      CITY_DATA.forEach((def) => {
        const oldState = Game.state.cities[def.id];
        if (oldState && oldState.rewardEarned) {
          // Permanent city rewards survive prestige even though the city re-locks.
          fresh[def.id].rewardEarned = true;
        }
      });
      Game.state.cities = fresh;
      Game.state.currentCityId = 'green_village';
    },

    getState(cityId) {
      return Game.state.cities[cityId];
    },

    getCurrent() {
      return Cities.getState(Game.state.currentCityId);
    },

    isUnlocked(cityId) {
      return Cities.getState(cityId).unlocked;
    },

    /** Opens the animated unlock screen (or unlocks instantly if already affordable & confirmed). */
    requestUnlock(cityId) {
      const def = Cities.getDef(cityId);
      const state = Cities.getState(cityId);
      if (state.unlocked) {
        Cities.switchTo(cityId);
        return;
      }
      Game.UI.openUnlockModal(def);
    },

    confirmUnlock(cityId) {
      const def = Cities.getDef(cityId);
      const state = Cities.getState(cityId);
      if (state.unlocked) return false;
      if (Game.state.sparks < def.unlockCost) return false;

      Game.state.sparks -= def.unlockCost;
      state.unlocked = true;
      Game.Audio.play('unlock');
      Game.UI.notify(`${def.name} unlocked!`, 'success');
      Game.Achievements.check();
      Cities.switchTo(cityId);
      Game.UI.playScreenTransition();
      Game.Save.save();
      return true;
    },

    switchTo(cityId) {
      if (!Cities.isUnlocked(cityId)) return;
      Game.state.currentCityId = cityId;
      Game.UI.renderCityTabs();
      Game.UI.renderScene();
      Game.UI.renderBuildingGrid();
      Game.UI.updateCityCompletionBar();
    },

    /** Total buildings maxed (level 100) inside a city. */
    countMaxedBuildings(cityId) {
      return Cities.getState(cityId).buildings.filter((b) => b.level >= Game.Buildings.MAX_LEVEL).length;
    },

    completionPercent(cityId) {
      const maxed = Cities.countMaxedBuildings(cityId);
      return Math.floor((maxed / 6) * 100);
    },

    starRating(cityId) {
      const pct = Cities.completionPercent(cityId);
      if (pct >= 100) return 3;
      if (pct >= 66) return 2;
      if (pct >= 33) return 1;
      return 0;
    },

    /** Called after any level-up to check whether the city just became fully complete. */
    checkCompletion(cityId) {
      const state = Cities.getState(cityId);
      if (state.completed) return;
      if (Cities.countMaxedBuildings(cityId) < 6) return;

      state.completed = true;
      if (!state.rewardEarned) {
        state.rewardEarned = true;
      }
      if (!Game.state.stats.citiesCompletedEver[cityId]) {
        Game.state.stats.citiesCompletedEver[cityId] = true;
        Game.state.stats.citiesCompletedCount++;
      }
      Game.Audio.play('achievement');
      Game.UI.showCityCompletionModal(cityId);
      Game.UI.spawnConfetti();
      Game.Achievements.check();
      Game.Save.save();
    },

    /** Sum of a given permanent-reward multiplier across all cities that have earned it. */
    getRewardMultiplier(rewardKey) {
      let mult = 1;
      CITY_DATA.forEach((def) => {
        if (def.rewardKey !== rewardKey) return;
        const state = Game.state.cities[def.id];
        if (state && state.rewardEarned) mult += def.rewardAmount;
      });
      return mult;
    },

    /** Sparks/sec currently produced by a given city (auto-collected buildings only). */
    incomePerSec(cityId) {
      const state = Cities.getState(cityId);
      if (!state || !state.unlocked) return 0;
      return state.buildings.reduce((sum, b) => sum + Game.Buildings.getIncomePerSec(b), 0);
    },

    totalIncomePerSec() {
      return CITY_DATA.reduce((sum, def) => sum + Cities.incomePerSec(def.id), 0);
    },
  };

  window.Game.Cities = Cities;
})();
