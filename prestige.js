/**
 * prestige.js
 * Prestige progression (Sparks -> Ultimate Sparks) and the Prestige Shop,
 * plus every global-multiplier getter other modules read from.
 */
(function () {
  'use strict';

  const BASE_REQUIRED_LIFETIME = 1e6;
  const REQUIRED_LIFETIME_GROWTH = 4;
  const BASE_CRIT_CHANCE = 0.02;
  const CRIT_MULTIPLIER = 5;
  const OFFLINE_BASE_EFFICIENCY = 0.5;
  const UPGRADE_COST_GROWTH = 1.25;

  // Every prestige-shop upgrade. `amount` is the per-level effect (interpreted per upgrade below).
  const SHOP_UPGRADES = [
    { id: 'globalIncome', name: 'Global Income', icon: '⚡', desc: '+2% income from all buildings per level.', baseCost: 5, amount: 0.02, maxLevel: 50 },
    { id: 'productionSpeed', name: 'Production Speed', icon: '⏱️', desc: '+2% production speed per level.', baseCost: 5, amount: 0.02, maxLevel: 50 },
    { id: 'offlineEarnings', name: 'Offline Earnings', icon: '☕', desc: '+5% offline earning efficiency per level.', baseCost: 8, amount: 0.05, maxLevel: 20 },
    { id: 'costReduction', name: 'Cost Reduction', icon: '💰', desc: '-1% building/upgrade costs per level.', baseCost: 10, amount: 0.01, maxLevel: 30 },
    { id: 'autoCollectorSpeed', name: 'Auto Collector Speed', icon: '🤖', desc: '+3% auto collector speed per level.', baseCost: 8, amount: 0.03, maxLevel: 30 },
    { id: 'criticalChance', name: 'Critical Income', icon: '💥', desc: '+0.5% chance for 5x income per level.', baseCost: 12, amount: 0.005, maxLevel: 20 },
    { id: 'clickPower', name: 'Click Power', icon: '👆', desc: '+5% income from manual collection per level.', baseCost: 6, amount: 0.05, maxLevel: 20 },
    { id: 'cityIncome', name: 'City Income', icon: '🏙️', desc: '+1% income per level, per unlocked city.', baseCost: 15, amount: 0.01, maxLevel: 20 },
    { id: 'ultimateGain', name: 'Ultimate Spark Gain', icon: '⭐', desc: '+4% Ultimate Sparks earned per level.', baseCost: 20, amount: 0.04, maxLevel: 25 },
  ];

  const Prestige = {
    SHOP_UPGRADES,

    createFreshUpgradesState() {
      const map = {};
      SHOP_UPGRADES.forEach((u) => (map[u.id] = 0));
      return map;
    },

    getUpgradeLevel(id) {
      return Game.state.prestigeUpgrades[id] || 0;
    },

    getUpgradeDef(id) {
      return SHOP_UPGRADES.find((u) => u.id === id);
    },

    upgradeCost(id) {
      const def = Prestige.getUpgradeDef(id);
      const level = Prestige.getUpgradeLevel(id);
      return Math.ceil(def.baseCost * Math.pow(UPGRADE_COST_GROWTH, level));
    },

    purchaseUpgrade(id) {
      const def = Prestige.getUpgradeDef(id);
      const level = Prestige.getUpgradeLevel(id);
      if (level >= def.maxLevel) return false;
      const cost = Prestige.upgradeCost(id);
      if (Game.state.ultimateSparks < cost) return false;

      Game.state.ultimateSparks -= cost;
      Game.state.prestigeUpgrades[id] = level + 1;
      Game.Audio.play('upgrade');
      Game.UI.renderPrestigeShop();
      Game.UI.refreshHUD();
      Game.Save.save();
      return true;
    },

    // ---------------------------------------------------------------
    // Multiplier getters — consumed by buildings.js / cities.js / offline.js
    // ---------------------------------------------------------------

    getGlobalIncomeMultiplier() {
      let mult = 1;
      mult *= Game.Cities.getRewardMultiplier('globalIncomeMult');
      mult *= 1 + Prestige.getUpgradeLevel('globalIncome') * Prestige.getUpgradeDef('globalIncome').amount;
      mult *= Game.Achievements.getBonusMultiplier();
      mult *= Prestige.getCityIncomeBonusMultiplier();
      return mult;
    },

    getProductionSpeedMultiplier() {
      let mult = 1;
      mult *= Game.Cities.getRewardMultiplier('productionSpeedMult');
      mult *= 1 + Prestige.getUpgradeLevel('productionSpeed') * Prestige.getUpgradeDef('productionSpeed').amount;
      return mult;
    },

    getOfflineEarningsMultiplier() {
      let mult = OFFLINE_BASE_EFFICIENCY;
      mult *= Game.Cities.getRewardMultiplier('offlineIncomeMult');
      mult *= 1 + Prestige.getUpgradeLevel('offlineEarnings') * Prestige.getUpgradeDef('offlineEarnings').amount;
      return mult;
    },

    getCostMultiplier() {
      const level = Prestige.getUpgradeLevel('costReduction');
      const amount = Prestige.getUpgradeDef('costReduction').amount;
      return Math.max(0.4, 1 - level * amount);
    },

    getAutoCollectorSpeedMultiplier() {
      let mult = 1;
      mult *= Game.Cities.getRewardMultiplier('autoCollectorSpeedMult');
      mult *= 1 + Prestige.getUpgradeLevel('autoCollectorSpeed') * Prestige.getUpgradeDef('autoCollectorSpeed').amount;
      return mult;
    },

    getCriticalChance() {
      const level = Prestige.getUpgradeLevel('criticalChance');
      const amount = Prestige.getUpgradeDef('criticalChance').amount;
      return Math.min(0.5, BASE_CRIT_CHANCE + level * amount);
    },

    getCriticalMultiplier() {
      return CRIT_MULTIPLIER;
    },

    getCriticalExpectedMultiplier() {
      const chance = Prestige.getCriticalChance();
      return 1 - chance + chance * CRIT_MULTIPLIER;
    },

    getClickPowerMultiplier() {
      const level = Prestige.getUpgradeLevel('clickPower');
      const amount = Prestige.getUpgradeDef('clickPower').amount;
      return (1 + level * amount) * Game.Achievements.getClickBonusMultiplier();
    },

    getCityIncomeBonusMultiplier() {
      const level = Prestige.getUpgradeLevel('cityIncome');
      const amount = Prestige.getUpgradeDef('cityIncome').amount;
      const unlockedCities = Game.Cities.data.filter((c) => Game.state.cities[c.id].unlocked).length;
      return 1 + level * amount * unlockedCities;
    },

    getUltimateGainMultiplier() {
      let mult = 1;
      mult *= Game.Cities.getRewardMultiplier('ultimateSparkGainMult');
      mult *= 1 + Prestige.getUpgradeLevel('ultimateGain') * Prestige.getUpgradeDef('ultimateGain').amount;
      return mult;
    },

    // ---------------------------------------------------------------
    // Prestige itself
    // ---------------------------------------------------------------

    requiredLifetime() {
      return BASE_REQUIRED_LIFETIME * Math.pow(REQUIRED_LIFETIME_GROWTH, Game.state.prestigeCount);
    },

    isAvailable() {
      return Game.state.lifetimeSparks >= Prestige.requiredLifetime();
    },

    previewGain() {
      if (!Prestige.isAvailable()) return 0;
      const raw = Math.floor(Math.cbrt(Game.state.lifetimeSparks / BASE_REQUIRED_LIFETIME));
      return Math.max(1, Math.floor(raw * Prestige.getUltimateGainMultiplier()));
    },

    doPrestige() {
      if (!Prestige.isAvailable()) return false;
      const gain = Prestige.previewGain();

      Game.state.ultimateSparks += gain;
      Game.state.prestigeCount++;
      Game.state.sparks = 0;
      Game.Cities.resetForPrestige();

      Game.Audio.play('prestige');
      Game.UI.notify(`Prestiged! +${Game.Utils.formatNumber(gain)} ⭐ Ultimate Sparks`, 'success');
      Game.UI.spawnConfetti();
      Game.Achievements.check();
      Game.UI.renderCityTabs();
      Game.UI.renderScene();
      Game.UI.renderBuildingGrid();
      Game.UI.refreshHUD();
      Game.Save.save();
      return true;
    },
  };

  window.Game.Prestige = Prestige;
})();
