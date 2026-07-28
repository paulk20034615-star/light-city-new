/**
 * events.js
 * Random Bonus Events: periodically spawns a clickable event orb that
 * grants a temporary buff (income, production, auto collector speed) or
 * an instant reward. Also hosts the generic "active buff" system that
 * buildings.js and prestige.js read multipliers from — Daily Rewards
 * boosters plug into the same buff list.
 */
(function () {
  'use strict';

  const MIN_SPAWN_SECONDS = 90;
  const MAX_SPAWN_SECONDS = 240;
  const ORB_LIFETIME_SECONDS = 14; // how long an unclaimed orb stays before vanishing

  const EVENT_DEFS = [
    {
      id: 'sparkStorm',
      name: 'Spark Storm',
      icon: '🌩️',
      desc: '10× income for 30 seconds!',
      weight: 3,
      apply() {
        Events.addBuff({ type: 'incomeMult', value: 10, seconds: 30, label: 'Spark Storm', icon: '🌩️' });
      },
    },
    {
      id: 'goldenSpark',
      name: 'Golden Spark',
      icon: '✨',
      desc: 'An instant windfall of Sparks!',
      weight: 3,
      apply() {
        const reward = Math.max(50, Game.Cities.totalIncomePerSec() * 45);
        Game.state.sparks += reward;
        Game.state.lifetimeSparks += reward;
        Game.UI.notify(`✨ Golden Spark! +${Game.Utils.formatNumber(reward)} ⚡`, 'success');
      },
    },
    {
      id: 'luckyDelivery',
      name: 'Lucky Delivery',
      icon: '🚚',
      desc: 'A free building level!',
      weight: 2,
      apply() {
        const candidates = [];
        Game.Cities.data.forEach((def) => {
          const cityState = Game.state.cities[def.id];
          if (!cityState.unlocked) return;
          cityState.buildings.forEach((b) => {
            if (b.unlocked && b.level < Game.Buildings.MAX_LEVEL) candidates.push(b);
          });
        });
        if (candidates.length === 0) {
          const reward = Math.max(20, Game.Cities.totalIncomePerSec() * 20);
          Game.state.sparks += reward;
          Game.state.lifetimeSparks += reward;
          Game.UI.notify(`🚚 Lucky Delivery! +${Game.Utils.formatNumber(reward)} ⚡`, 'success');
          return;
        }
        const building = candidates[Math.floor(Math.random() * candidates.length)];
        building.level++;
        Game.Buildings.recordPrestigeLevel(building);
        Game.Cities.checkCompletion(building.cityId);
        Game.UI.notify(
          `🚚 Lucky Delivery! ${Game.Buildings.getDef(building.cityId, building.index).name} got a free level!`,
          'success'
        );
        Game.UI.spawnGlow(building.cityId, building.index);
        Game.UI.renderBuildingGrid();
      },
    },
    {
      id: 'productionBoost',
      name: 'Production Boost',
      icon: '⚡',
      desc: '+100% production for 60 seconds!',
      weight: 3,
      apply() {
        Events.addBuff({ type: 'incomeMult', value: 2, seconds: 60, label: 'Production Boost', icon: '⚡' });
      },
    },
    {
      id: 'autoOverdrive',
      name: 'Auto Overdrive',
      icon: '🤖',
      desc: '2× Auto Collector speed for 45 seconds!',
      weight: 2,
      apply() {
        Events.addBuff({ type: 'autoSpeedMult', value: 2, seconds: 45, label: 'Auto Overdrive', icon: '🤖' });
      },
    },
  ];

  function pickWeighted() {
    const totalWeight = EVENT_DEFS.reduce((sum, e) => sum + e.weight, 0);
    let roll = Math.random() * totalWeight;
    for (const def of EVENT_DEFS) {
      roll -= def.weight;
      if (roll <= 0) return def;
    }
    return EVENT_DEFS[0];
  }

  function randomSpawnDelay() {
    return MIN_SPAWN_SECONDS + Math.random() * (MAX_SPAWN_SECONDS - MIN_SPAWN_SECONDS);
  }

  const Events = {
    DEFS: EVENT_DEFS,

    createFreshState() {
      return {
        activeBuffs: [],
        pendingOrb: null, // { id, timeLeft }
        nextSpawnIn: randomSpawnDelay(),
      };
    },

    /** Adds a temporary multiplicative buff. Used by event orbs and Daily Reward boosters alike. */
    addBuff({ type, value, seconds, label, icon }) {
      Game.state.events.activeBuffs.push({ type, value, seconds, timeLeft: seconds, label, icon });
      Game.UI.notify(`${icon || '⏳'} ${label} activated!`, 'success');
      Game.UI.renderBuildingGrid();
    },

    getIncomeBuffMultiplier() {
      return Game.state.events.activeBuffs
        .filter((b) => b.type === 'incomeMult')
        .reduce((mult, b) => mult * b.value, 1);
    },

    getAutoCollectorSpeedBuffMultiplier() {
      return Game.state.events.activeBuffs
        .filter((b) => b.type === 'autoSpeedMult')
        .reduce((mult, b) => mult * b.value, 1);
    },

    hasActiveBuffs() {
      return Game.state.events.activeBuffs.length > 0;
    },

    /** Player clicked the floating orb — apply its effect and clear it. */
    claimOrb() {
      const pending = Game.state.events.pendingOrb;
      if (!pending) return;
      const def = EVENT_DEFS.find((e) => e.id === pending.id);
      Game.state.events.pendingOrb = null;
      Game.state.events.nextSpawnIn = randomSpawnDelay();
      if (!def) return;
      Game.Audio.play('achievement');
      def.apply();
      Game.UI.renderEventOrb();
      Game.Save.save();
    },

    /** Called every animation frame from the main loop. */
    tick(dt) {
      const events = Game.state.events;

      events.activeBuffs.forEach((b) => (b.timeLeft -= dt));
      const before = events.activeBuffs.length;
      events.activeBuffs = events.activeBuffs.filter((b) => b.timeLeft > 0);
      if (events.activeBuffs.length !== before) {
        Game.UI.renderActiveBuffsBar();
        Game.UI.renderBuildingGrid();
      }

      if (events.pendingOrb) {
        events.pendingOrb.timeLeft -= dt;
        if (events.pendingOrb.timeLeft <= 0) {
          events.pendingOrb = null;
          events.nextSpawnIn = randomSpawnDelay();
          Game.UI.renderEventOrb();
        }
        return;
      }

      // Only start spawning events once the player has some real progress.
      if (Game.state.stats.buildingsPurchased === 0) return;

      events.nextSpawnIn -= dt;
      if (events.nextSpawnIn <= 0) {
        const def = pickWeighted();
        events.pendingOrb = { id: def.id, timeLeft: ORB_LIFETIME_SECONDS };
        Game.UI.renderEventOrb();
      }
    },
  };

  window.Game.Events = Events;
})();
