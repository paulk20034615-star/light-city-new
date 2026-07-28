/**
 * buildings.js
 * Building data, cost/income formulas, and all building-level actions:
 * unlocking, leveling, the one-time upgrade, auto collectors, and
 * manual/auto production collection.
 */
(function () {
  'use strict';

  const MAX_LEVEL = 100;
  const AUTO_COLLECTOR_MIN_LEVEL = 20;

  // Base unlock cost of "building slot 0" for each city tier (index matches CITY_DATA order).
  const BUILDING_BASE_COST = [10, 15000, 1500000, 150000000, 15000000000];
  const BUILDING_COST_GROWTH = 7;      // cost multiplier per building slot (0-5) within a city
  const LEVEL_COST_GROWTH = 1.15;      // cost multiplier per level-up
  const LEVEL_INCOME_GROWTH = 1.13;    // income multiplier per level-up
  const INCOME_TO_COST_RATIO = 0.10;   // base income per cycle, relative to unlock cost
  const BASE_INTERVAL = 4;             // seconds, for building slot 0
  const INTERVAL_STEP = 0.5;           // extra seconds per building slot within a city
  const UPGRADE_COST_MULT = 40;        // upgrade cost relative to unlock cost
  const UPGRADE_INCOME_MULT = 3;       // the one-time upgrade triples income
  const AUTO_COLLECTOR_COST_MULT = 15; // auto collector cost relative to unlock cost
  const LEVEL_UP_BASE_COST_RATIO = 0.5;// first level-up cost, relative to unlock cost

  const Buildings = {
    MAX_LEVEL,
    AUTO_COLLECTOR_MIN_LEVEL,

    /** Fresh state for a single building slot. */
    createFreshBuildingState(cityId, index) {
      return {
        cityId,
        index,
        unlocked: false,
        level: 0,
        upgradePurchased: false,
        autoCollector: false,
        productionTimer: 0,
        readyToCollect: false,
        lifetimeIncome: 0,
      };
    },

    getDef(cityId, index) {
      const cityIndex = Game.Cities.data.findIndex((c) => c.id === cityId);
      return {
        name: Game.Cities.data[cityIndex].buildingNames[index],
        cityIndex,
      };
    },

    /** The underlying cost/income scaling value for a building slot — always the
     * real formula value, even for buildings whose unlock cost is waived. Every
     * other cost (level up, upgrade, auto collector) and the income formula scale
     * off of this, not off the (possibly-free) unlock cost. */
    costBasis(cityId, index) {
      const { cityIndex } = Buildings.getDef(cityId, index);
      return BUILDING_BASE_COST[cityIndex] * Math.pow(BUILDING_COST_GROWTH, index);
    },

    /** Cost to unlock the building (before cost-reduction discount). The very first
     * building in the game (Green Village's Hut) is free, so a fresh save always has
     * a way to bootstrap Sparks from zero. */
    baseUnlockCost(cityId, index) {
      if (cityId === 'green_village' && index === 0) return 0;
      return Buildings.costBasis(cityId, index);
    },

    unlockCost(cityId, index) {
      return Buildings.baseUnlockCost(cityId, index) * Game.Prestige.getCostMultiplier();
    },

    levelUpCost(building) {
      const base = Buildings.costBasis(building.cityId, building.index) * LEVEL_UP_BASE_COST_RATIO;
      const scaled = base * Math.pow(LEVEL_COST_GROWTH, building.level);
      return scaled * Game.Prestige.getCostMultiplier();
    },

    upgradeCost(building) {
      const base = Buildings.costBasis(building.cityId, building.index) * UPGRADE_COST_MULT;
      return base * Game.Prestige.getCostMultiplier();
    },

    autoCollectorCost(building) {
      const base = Buildings.costBasis(building.cityId, building.index) * AUTO_COLLECTOR_COST_MULT;
      return base * Game.Prestige.getCostMultiplier();
    },

    canBuyAutoCollector(building) {
      return building.level >= AUTO_COLLECTOR_MIN_LEVEL && building.upgradePurchased && !building.autoCollector;
    },

    /** Base income per production cycle, before global multipliers. */
    baseIncomePerCycle(building) {
      if (building.level <= 0) return 0;
      const base = Buildings.costBasis(building.cityId, building.index) * INCOME_TO_COST_RATIO;
      let income = base * Math.pow(LEVEL_INCOME_GROWTH, building.level - 1);
      if (building.upgradePurchased) income *= UPGRADE_INCOME_MULT;
      return income;
    },

    /** Income per cycle after all global multipliers (global income, city reward, prestige, achievements, events). */
    incomePerCycle(building) {
      return (
        Buildings.baseIncomePerCycle(building) *
        Game.Prestige.getGlobalIncomeMultiplier() *
        Game.Events.getIncomeBuffMultiplier()
      );
    },

    /** Seconds between production cycles, after production-speed multipliers. */
    interval(building) {
      const base = BASE_INTERVAL + building.index * INTERVAL_STEP;
      let speedMult = Game.Prestige.getProductionSpeedMultiplier();
      let effective = base / speedMult;
      if (building.autoCollector) {
        effective /= Game.Prestige.getAutoCollectorSpeedMultiplier();
        effective /= Game.Events.getAutoCollectorSpeedBuffMultiplier();
      }
      return Math.max(0.25, effective);
    },

    /** Expected income/sec including average critical-hit value (for HUD + auto collection only). */
    getIncomePerSec(building) {
      if (!building.unlocked || building.level <= 0 || !building.autoCollector) return 0;
      const perCycle = Buildings.incomePerCycle(building) * Game.Prestige.getCriticalExpectedMultiplier();
      return perCycle / Buildings.interval(building);
    },

    // -------------------------------------------------------------------
    // Actions
    // -------------------------------------------------------------------

    unlock(cityId, index) {
      const building = Game.Cities.getState(cityId).buildings[index];
      if (building.unlocked) return false;
      const cost = Buildings.unlockCost(cityId, index);
      if (Game.state.sparks < cost) return false;

      Game.state.sparks -= cost;
      building.unlocked = true;
      building.level = 1;
      building.productionTimer = 0;
      building.readyToCollect = false;
      Game.state.stats.buildingsPurchased++;
      Buildings.recordPrestigeLevel(building);

      Game.Audio.play('purchase');
      Game.UI.spawnGlow(cityId, index);
      Game.Achievements.check();
      Game.Save.save();
      Game.UI.renderBuildingGrid();
      return true;
    },

    levelUp(building) {
      if (!building.unlocked || building.level >= MAX_LEVEL) return false;
      const cost = Buildings.levelUpCost(building);
      if (Game.state.sparks < cost) return false;

      Game.state.sparks -= cost;
      building.level++;
      Buildings.recordPrestigeLevel(building);

      if (building.level >= MAX_LEVEL) {
        Game.state.stats.buildingsMaxed++;
      }
      Game.Audio.play('upgrade');

      // Rewards (Sparks, Ultimate Sparks, permanent bonuses, cosmetics) are granted
      // exclusively through the Achievement System — see achievements.js. Leveling
      // a building only ever increases its own production and, at level 20 with
      // the upgrade purchased, unlocks its Auto Collector.
      Game.Achievements.check();
      Game.Cities.checkCompletion(building.cityId);
      Game.Save.save();
      Game.UI.renderBuildingGrid();
      return true;
    },

    purchaseUpgrade(building) {
      if (!building.unlocked || building.upgradePurchased) return false;
      const cost = Buildings.upgradeCost(building);
      if (Game.state.sparks < cost) return false;

      Game.state.sparks -= cost;
      building.upgradePurchased = true;
      Game.Audio.play('upgrade');
      Game.UI.notify(`${Buildings.getDef(building.cityId, building.index).name} upgraded: 3x income!`, 'success');
      Game.Achievements.check();
      Game.Save.save();
      Game.UI.renderBuildingGrid();
      return true;
    },

    purchaseAutoCollector(building) {
      if (!Buildings.canBuyAutoCollector(building)) return false;
      const cost = Buildings.autoCollectorCost(building);
      if (Game.state.sparks < cost) return false;

      Game.state.sparks -= cost;
      building.autoCollector = true;
      building.readyToCollect = false;
      building.productionTimer = 0;
      Game.Audio.play('purchase');
      Game.UI.notify(`Auto Collector installed on ${Buildings.getDef(building.cityId, building.index).name}!`, 'success');
      Game.Achievements.check();
      Game.Save.save();
      Game.UI.renderBuildingGrid();
      return true;
    },

    /** Manual collection when the building is ready (auto-collected buildings don't need this). */
    collect(building) {
      if (!building.readyToCollect) return false;
      const gained = Buildings.awardIncome(building, true);
      building.readyToCollect = false;
      building.productionTimer = 0;
      Game.state.stats.totalClicks++;
      Game.Audio.play('collect');
      Game.UI.spawnFloatingText(building, gained);
      Game.UI.renderBuildingCard(building);
      return true;
    },

    /** Applies a production payout to sparks/lifetime stats, honoring crit + click power. */
    awardIncome(building, isManual) {
      let amount = Buildings.incomePerCycle(building);
      let isCrit = false;

      if (Math.random() < Game.Prestige.getCriticalChance()) {
        amount *= Game.Prestige.getCriticalMultiplier();
        isCrit = true;
      }
      if (isManual) {
        amount *= Game.Prestige.getClickPowerMultiplier();
      }

      Game.state.sparks += amount;
      Game.state.lifetimeSparks += amount;
      building.lifetimeIncome += amount;
      if (Game.state.sparks > Game.state.stats.highestSparks) Game.state.stats.highestSparks = Game.state.sparks;

      return { amount, isCrit };
    },

    /** Keeps a permanent (never reset by prestige) record of the highest level ever reached. */
    recordPrestigeLevel(building) {
      const records = Game.state.buildingRecords[building.cityId];
      if (building.level > records[building.index]) {
        records[building.index] = building.level;
      }
    },

    getPrestigeLevel(building) {
      return Game.state.buildingRecords[building.cityId][building.index];
    },

    // -------------------------------------------------------------------
    // Main-loop tick: advances timers, resolves auto-collection.
    // -------------------------------------------------------------------
    tick(dt) {
      Game.Cities.data.forEach((cityDef) => {
        const cityState = Game.state.cities[cityDef.id];
        if (!cityState.unlocked) return;

        cityState.buildings.forEach((building) => {
          if (!building.unlocked || building.level <= 0) return;

          const interval = Buildings.interval(building);

          if (building.autoCollector) {
            building.productionTimer += dt;
            // Support large dt (offline/backgrounded tab) without an infinite loop.
            let cycles = Math.floor(building.productionTimer / interval);
            if (cycles > 0) {
              cycles = Math.min(cycles, 100000);
              building.productionTimer -= cycles * interval;
              for (let i = 0; i < cycles; i++) {
                Buildings.awardIncome(building, false);
              }
            }
          } else if (!building.readyToCollect) {
            building.productionTimer += dt;
            if (building.productionTimer >= interval) {
              building.productionTimer = interval;
              building.readyToCollect = true;
            }
          }
        });
      });
    },
  };

  window.Game.Buildings = Buildings;
})();
