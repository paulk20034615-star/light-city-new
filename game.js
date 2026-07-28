/**
 * game.js
 * Entry point: state shape, the main requestAnimationFrame loop, and the
 * `Game.UI` rendering/DOM layer. Loaded last so every other module
 * (Cities, Buildings, Prestige, Achievements, Audio, Settings, Save,
 * Offline) is already attached to the shared `Game` namespace.
 */
(function () {
  'use strict';

  const Cities = Game.Cities;
  const Buildings = Game.Buildings;
  const Prestige = Game.Prestige;
  const Achievements = Game.Achievements;

  // ===================================================================
  // Utilities
  // ===================================================================
  const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'De', 'Ud', 'Dd', 'Td', 'Qad', 'Qid', 'Sxd', 'Spd', 'Ocd', 'Nod', 'Vg'];

  const Utils = {
    formatNumber(num) {
      if (num === null || num === undefined || isNaN(num)) return '0';
      const sign = num < 0 ? '-' : '';
      num = Math.abs(num);
      if (num < 1) return sign + num.toFixed(2);
      // Keep decimal precision below 1000 so small per-level income gains (common
      // early game, e.g. 1.01 -> 1.14) are actually visible instead of both flooring
      // to the same integer and looking like the level-up had no effect.
      if (num < 100) return sign + num.toFixed(2);
      if (num < 1000) return sign + num.toFixed(1);

      const tier = Math.floor(Math.log10(num) / 3);
      if (tier >= SUFFIXES.length) return sign + num.toExponential(2);

      const scaled = num / Math.pow(1000, tier);
      return sign + scaled.toFixed(2) + SUFFIXES[tier];
    },

    formatDuration(totalSeconds) {
      let seconds = Math.floor(totalSeconds);
      const days = Math.floor(seconds / 86400);
      seconds -= days * 86400;
      const hours = Math.floor(seconds / 3600);
      seconds -= hours * 3600;
      const minutes = Math.floor(seconds / 60);
      seconds -= minutes * 60;

      const parts = [];
      if (days > 0) parts.push(days + 'd');
      if (hours > 0) parts.push(hours + 'h');
      if (minutes > 0 || parts.length === 0) parts.push(minutes + 'm');
      if (days === 0 && hours === 0) parts.push(seconds + 's');
      return parts.join(' ');
    },
  };

  // ===================================================================
  // Fresh state factory
  // ===================================================================
  function buildFreshBuildingRecords() {
    const map = {};
    Cities.data.forEach((def) => (map[def.id] = new Array(6).fill(0)));
    return map;
  }

  function createFreshState() {
    return {
      sparks: 0,
      lifetimeSparks: 0,
      ultimateSparks: 0,
      prestigeCount: 0,
      currentCityId: 'green_village',
      cities: Cities.createFreshCitiesMap(),
      buildingRecords: buildFreshBuildingRecords(),
      prestigeUpgrades: Prestige.createFreshUpgradesState(),
      achievements: Achievements.createFreshState(),
      events: Game.Events.createFreshState(),
      settings: Game.Settings.createFreshState(),
      stats: {
        totalClicks: 0,
        buildingsPurchased: 0,
        buildingsMaxed: 0,
        citiesCompletedCount: 0,
        citiesCompletedEver: {},
        timePlayed: 0,
        offlineEarningsTotal: 0,
        highestIncomePerSec: 0,
        highestSparks: 0,
      },
      lastActiveTimestamp: Date.now(),
    };
  }

  // ===================================================================
  // UI / rendering layer
  // ===================================================================
  const UI = {
    _pendingUnlockCity: null,

    // ---- modal helpers -------------------------------------------------
    openModal(id) {
      document.getElementById(id).classList.remove('hidden');
    },
    closeModal(id) {
      document.getElementById(id).classList.add('hidden');
    },

    // ---- HUD -------------------------------------------------------------
    refreshHUD() {
      document.getElementById('hud-sparks').textContent = Utils.formatNumber(Game.state.sparks);
      document.getElementById('hud-sps').textContent = Utils.formatNumber(Cities.totalIncomePerSec());
      document.getElementById('hud-lifetime').textContent = Utils.formatNumber(Game.state.lifetimeSparks);
      document.getElementById('hud-ultimate').textContent = Utils.formatNumber(Game.state.ultimateSparks);
      document.getElementById('hud-prestige').textContent = Game.state.prestigeCount;
      document.getElementById('hud-city').textContent = Cities.getDef(Game.state.currentCityId).name;
      UI.renderIncomeBreakdown();
      UI.updateCityCompletionBar();
      UI.updateCosmeticTitle();
    },

    updateCosmeticTitle() {
      const title = Achievements.getCosmeticTitle();
      const el = document.getElementById('hud-cosmetic-title');
      if (title) {
        el.textContent = '✦ ' + title;
        el.classList.remove('hidden');
      } else {
        el.classList.add('hidden');
      }
    },

    renderIncomeBreakdown() {
      const el = document.getElementById('income-breakdown');
      const unlocked = Cities.data.filter((d) => Game.state.cities[d.id].unlocked);
      if (unlocked.length <= 1) {
        el.innerHTML = `<span class="income-total">${Utils.formatNumber(Cities.totalIncomePerSec())}/sec total</span>`;
        return;
      }
      const parts = unlocked.map(
        (d) => `<span class="income-part"><strong>${d.name}</strong> ${Utils.formatNumber(Cities.incomePerSec(d.id))}/s</span>`
      );
      el.innerHTML =
        parts.join('<span class="income-op">+</span>') +
        `<span class="income-op">=</span><span class="income-total">${Utils.formatNumber(Cities.totalIncomePerSec())}/s</span>`;
    },

    updateCityCompletionBar() {
      const cityId = Game.state.currentCityId;
      const def = Cities.getDef(cityId);
      const pct = Cities.completionPercent(cityId);
      const stars = Cities.starRating(cityId);

      document.getElementById('city-completion-name').textContent = def.name;
      document.getElementById('city-completion-pct').textContent = pct + '%';
      document.getElementById('city-progress-fill').style.width = pct + '%';
      document.getElementById('city-stars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);

      const btn = document.getElementById('btn-prestige');
      const available = Prestige.isAvailable();
      btn.disabled = !available;
      btn.textContent = available
        ? `🔁 Prestige (+${Utils.formatNumber(Prestige.previewGain())} ⭐)`
        : `🔁 Prestige (need ${Utils.formatNumber(Prestige.requiredLifetime())} lifetime ⚡)`;
    },

    // ---- City tabs ---------------------------------------------------
    renderCityTabs() {
      const container = document.getElementById('city-tabs');
      container.innerHTML = '';
      Cities.data.forEach((def) => {
        const state = Game.state.cities[def.id];
        const btn = document.createElement('button');
        btn.className =
          'city-tab' + (state.unlocked ? '' : ' locked') + (def.id === Game.state.currentCityId ? ' active' : '');
        btn.dataset.city = def.id;
        btn.innerHTML = `
          <span class="city-tab-icon">${state.unlocked ? '🏙️' : '🔒'}</span>
          <span class="city-tab-name">${def.name}</span>
          ${state.unlocked ? `<span class="city-tab-pct">${Cities.completionPercent(def.id)}%</span>` : ''}
          <span class="city-tab-details">
            <span class="city-tab-status">${state.unlocked ? 'Unlocked' : 'Locked'}</span>
            ${
              state.unlocked
                ? `<span class="city-tab-income">${Utils.formatNumber(Cities.incomePerSec(def.id))}/s</span>`
                : `<span class="city-tab-cost">${Utils.formatNumber(def.unlockCost)} ⚡</span>`
            }
          </span>
        `;
        container.appendChild(btn);
      });
    },

    // ---- City scene (background / skyline) ---------------------------
    renderScene() {
      const cityId = Game.state.currentCityId;
      const def = Cities.getDef(cityId);
      const cityState = Game.state.cities[cityId];

      document.getElementById('city-scene').className = 'city-scene ' + def.theme;

      const skyline = document.getElementById('scene-skyline');
      skyline.innerHTML = '';
      cityState.buildings.forEach((b, i) => {
        const div = document.createElement('div');
        div.className = 'skyline-building' + (b.unlocked ? ' lit' : '');
        const heightPct = b.unlocked ? 20 + (b.level / Buildings.MAX_LEVEL) * 70 : 8;
        div.style.height = heightPct + '%';
        div.style.setProperty('--i', i);
        skyline.appendChild(div);
      });

      UI.updateCityCompletionBar();
    },

    // ---- Building grid --------------------------------------------------
    buildCardElement(building, index, cityId) {
      const def = Buildings.getDef(cityId, index);
      const card = document.createElement('div');
      card.className =
        'building-card' + (building.unlocked ? '' : ' locked') + (building.level >= Buildings.MAX_LEVEL ? ' maxed' : '');
      card.id = `card-${cityId}-${index}`;
      card.dataset.city = cityId;
      card.dataset.index = index;

      if (!building.unlocked) {
        card.innerHTML = `
          <div class="building-icon">🔒</div>
          <div class="building-name">${def.name}</div>
          <button class="btn btn-primary btn-block" data-action="unlock" ${
            Game.state.sparks < Buildings.unlockCost(cityId, index) ? 'disabled' : ''
          }>Unlock — ${Utils.formatNumber(Buildings.unlockCost(cityId, index))} ⚡</button>
        `;
        return card;
      }

      const incomeText = Utils.formatNumber(Buildings.incomePerCycle(building));
      const intervalText = Buildings.interval(building).toFixed(1);
      const canAuto = Buildings.canBuyAutoCollector(building);
      const isMax = building.level >= Buildings.MAX_LEVEL;

      card.innerHTML = `
        <div class="building-header">
          <div class="building-icon">${building.autoCollector ? '🤖' : '🏢'}</div>
          <div class="building-name">${def.name}</div>
          <div class="building-level">Lv. ${building.level}/${Buildings.MAX_LEVEL}</div>
        </div>
        <div class="building-stats">
          <span>${incomeText} ⚡ / ${intervalText}s</span>
          <span class="building-prestige-level" title="Highest level ever reached">🏅 ${Buildings.getPrestigeLevel(building)}</span>
        </div>
        <div class="progress-bar building-progress-bar">
          <div class="progress-fill" id="progress-${cityId}-${index}" style="width:0%"></div>
        </div>
        <button class="btn collect-btn ${building.autoCollector ? 'auto' : ''}" id="collect-${cityId}-${index}" data-action="collect" ${
        building.autoCollector ? 'disabled' : ''
      }>
          ${building.autoCollector ? 'Auto-Collecting' : 'Producing...'}
        </button>
        <div class="building-actions">
          <button class="btn btn-small" data-action="levelup" ${isMax ? 'disabled' : ''}>
            ${isMax ? 'MAX LEVEL' : `Level Up — ${Utils.formatNumber(Buildings.levelUpCost(building))} ⚡`}
          </button>
          ${
            !building.upgradePurchased
              ? `<button class="btn btn-small btn-upgrade" data-action="upgrade" ${
                  Game.state.sparks < Buildings.upgradeCost(building) ? 'disabled' : ''
                }>⬆ Upgrade (3x) — ${Utils.formatNumber(Buildings.upgradeCost(building))} ⚡</button>`
              : `<span class="upgrade-badge">⬆ Upgraded</span>`
          }
          ${
            canAuto
              ? `<button class="btn btn-small btn-auto" data-action="autocollector" ${
                  Game.state.sparks < Buildings.autoCollectorCost(building) ? 'disabled' : ''
                }>🤖 Auto Collector — ${Utils.formatNumber(Buildings.autoCollectorCost(building))} ⚡</button>`
              : ''
          }
        </div>
        <div class="building-lifetime">Lifetime: ${Utils.formatNumber(building.lifetimeIncome)} ⚡</div>
      `;
      return card;
    },

    renderBuildingGrid() {
      const grid = document.getElementById('building-grid');
      grid.innerHTML = '';
      const cityId = Game.state.currentCityId;
      const cityState = Game.state.cities[cityId];
      cityState.buildings.forEach((b, index) => {
        grid.appendChild(UI.buildCardElement(b, index, cityId));
      });
      UI.updateCityCompletionBar();
    },

    /** Re-renders a single card in place (used after a manual collection). */
    renderBuildingCard(building) {
      if (building.cityId !== Game.state.currentCityId) return;
      const card = document.getElementById(`card-${building.cityId}-${building.index}`);
      if (!card) return;
      card.replaceWith(UI.buildCardElement(building, building.index, building.cityId));
    },

    /** Called every animation frame: cheap progress-bar/ready-state updates only. */
    updateDynamicUI() {
      const cityId = Game.state.currentCityId;
      const cityState = Game.state.cities[cityId];
      if (!cityState) return;

      cityState.buildings.forEach((b, index) => {
        if (!b.unlocked) return;
        const interval = Buildings.interval(b);
        const fill = document.getElementById(`progress-${cityId}-${index}`);
        if (fill) {
          const pct = b.autoCollector ? (b.productionTimer / interval) * 100 : (b.productionTimer / interval) * 100;
          fill.style.width = Math.min(100, pct) + '%';
        }
        const collectBtn = document.getElementById(`collect-${cityId}-${index}`);
        if (collectBtn && !b.autoCollector) {
          collectBtn.classList.toggle('ready', b.readyToCollect);
          collectBtn.disabled = !b.readyToCollect;
          collectBtn.textContent = b.readyToCollect ? 'Collect! ⚡' : 'Producing...';
        }

        const card = document.getElementById(`card-${cityId}-${index}`);
        if (!card) return;
        const unlockBtn = card.querySelector('[data-action="unlock"]');
        if (unlockBtn) unlockBtn.disabled = Game.state.sparks < Buildings.unlockCost(cityId, index);
        const levelBtn = card.querySelector('[data-action="levelup"]');
        if (levelBtn && b.level < Buildings.MAX_LEVEL) levelBtn.disabled = Game.state.sparks < Buildings.levelUpCost(b);
        const upgradeBtn = card.querySelector('[data-action="upgrade"]');
        if (upgradeBtn) upgradeBtn.disabled = Game.state.sparks < Buildings.upgradeCost(b);
        const autoBtn = card.querySelector('[data-action="autocollector"]');
        if (autoBtn) autoBtn.disabled = Game.state.sparks < Buildings.autoCollectorCost(b);
      });
    },

    // ---- Prestige shop -------------------------------------------------
    renderPrestigeShop() {
      const list = document.getElementById('prestige-shop-list');
      list.innerHTML = '';
      Prestige.SHOP_UPGRADES.forEach((def) => {
        const level = Prestige.getUpgradeLevel(def.id);
        const maxed = level >= def.maxLevel;
        const cost = Prestige.upgradeCost(def.id);
        const row = document.createElement('div');
        row.className = 'shop-row' + (maxed ? ' maxed' : '');
        row.innerHTML = `
          <div class="shop-icon">${def.icon}</div>
          <div class="shop-info">
            <div class="shop-name">${def.name} <span class="shop-level">Lv. ${level}/${def.maxLevel}</span></div>
            <div class="shop-desc">${def.desc}</div>
          </div>
          <button class="btn btn-small" data-upgrade="${def.id}" ${
          maxed || Game.state.ultimateSparks < cost ? 'disabled' : ''
        }>${maxed ? 'MAXED' : `${Utils.formatNumber(cost)} ⭐`}</button>
        `;
        list.appendChild(row);
      });
      document.getElementById('shop-ultimate-balance').textContent = Utils.formatNumber(Game.state.ultimateSparks);
    },

    // ---- Achievements ---------------------------------------------------
    renderAchievements() {
      const list = document.getElementById('achievements-list');
      list.innerHTML = '';
      Achievements.LIST.forEach((def) => {
        const unlocked = Achievements.isUnlocked(def.id);
        const card = document.createElement('div');
        card.className = 'achievement-card' + (unlocked ? ' unlocked' : ' locked');
        card.innerHTML = `
          <div class="achievement-icon">${unlocked ? def.icon : '❔'}</div>
          <div class="achievement-name">${unlocked ? def.name : '???'}</div>
          <div class="achievement-desc">${def.desc}</div>
          <div class="achievement-bonus">+${Math.round(def.bonus * 100)}% Income</div>
        `;
        list.appendChild(card);
      });
      document.getElementById('achievements-progress').textContent = `${Achievements.unlockedCount()}/${Achievements.LIST.length}`;
    },

    // ---- Statistics ------------------------------------------------------
    renderStats() {
      const s = Game.state.stats;
      const sps = Cities.totalIncomePerSec();
      const rows = [
        ['Lifetime Sparks', Utils.formatNumber(Game.state.lifetimeSparks)],
        ['Sparks / Second', Utils.formatNumber(sps)],
        ['Sparks / Minute', Utils.formatNumber(sps * 60)],
        ['Sparks / Hour', Utils.formatNumber(sps * 3600)],
        ['Total Clicks', s.totalClicks],
        ['Buildings Purchased', s.buildingsPurchased],
        ['Buildings Maxed', s.buildingsMaxed],
        ['Cities Completed', `${s.citiesCompletedCount}/5`],
        ['Time Played', Utils.formatDuration(s.timePlayed)],
        ['Offline Earnings', Utils.formatNumber(s.offlineEarningsTotal)],
        ['Prestiges', Game.state.prestigeCount],
        ['Highest Income/sec', Utils.formatNumber(s.highestIncomePerSec)],
        ['Highest Sparks', Utils.formatNumber(s.highestSparks)],
      ];
      document.getElementById('stats-list').innerHTML = rows
        .map(([label, val]) => `<div class="stat-row"><span>${label}</span><strong>${val}</strong></div>`)
        .join('');
    },

    // ---- Unlock / completion modals -----------------------------------
    openUnlockModal(def) {
      UI._pendingUnlockCity = def.id;
      document.getElementById('unlock-city-name').textContent = def.name;
      document.getElementById('unlock-city-reward').textContent = 'Permanent Reward: ' + def.rewardLabel;
      document.getElementById('unlock-city-cost').textContent = Utils.formatNumber(def.unlockCost);
      document.getElementById('unlock-preview').className = 'unlock-preview ' + def.theme;
      document.getElementById('btn-unlock-confirm').disabled = Game.state.sparks < def.unlockCost;
      UI.openModal('modal-unlock');
    },

    showCityCompletionModal(cityId) {
      const def = Cities.getDef(cityId);
      document.getElementById('completion-city-name').textContent = def.name;
      document.getElementById('completion-reward-text').textContent = 'Permanent Reward: ' + def.rewardLabel;
      UI.openModal('modal-completion');
    },

    // ---- Effects: floating text / glow / confetti / toasts / transitions ----
    spawnFloatingText(building, gainedInfo) {
      if (!Game.state.settings.floatingNumbers) return;
      const card = document.getElementById(`card-${building.cityId}-${building.index}`);
      if (!card) return;
      const rect = card.getBoundingClientRect();
      const el = document.createElement('div');
      el.className = 'floating-text' + (gainedInfo.isCrit ? ' crit' : '');
      el.textContent = (gainedInfo.isCrit ? 'CRIT! +' : '+') + Utils.formatNumber(gainedInfo.amount) + ' ⚡';
      el.style.left = rect.left + rect.width / 2 + 'px';
      el.style.top = rect.top + 'px';
      document.getElementById('floating-layer').appendChild(el);
      setTimeout(() => el.remove(), 1200);
    },

    spawnGlow(cityId, index) {
      const card = document.getElementById(`card-${cityId}-${index}`);
      if (!card) return;
      card.classList.add('glow-pulse');
      setTimeout(() => card.classList.remove('glow-pulse'), 900);
    },

    notify(message, type) {
      if (!Game.state.settings.notifications) return;
      const toast = document.createElement('div');
      toast.className = 'toast toast-' + (type || 'info');
      toast.textContent = message;
      document.getElementById('toast-layer').appendChild(toast);
      setTimeout(() => {
        toast.classList.add('toast-out');
        setTimeout(() => toast.remove(), 300);
      }, 3200);
    },

    playScreenTransition() {
      if (!Game.state.settings.animations) return;
      const flash = document.createElement('div');
      flash.className = 'screen-flash';
      document.body.appendChild(flash);
      setTimeout(() => flash.remove(), 700);
    },

    spawnConfetti() {
      if (!Game.state.settings.animations) return;
      const canvas = document.getElementById('confetti-canvas');
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      canvas.classList.add('active');
      const ctx = canvas.getContext('2d');
      const colors = ['#ffd93d', '#6bcbef', '#ff6b6b', '#4ecdc4', '#a78bfa'];
      // Fewer particles on small/low-end screens keeps this smooth without changing the effect itself.
      const particleCount = window.innerWidth < 600 ? 50 : 120;
      const particles = Array.from({ length: particleCount }, () => ({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * canvas.height * 0.3,
        vx: (Math.random() - 0.5) * 4,
        vy: 2 + Math.random() * 4,
        size: 4 + Math.random() * 5,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        vr: (Math.random() - 0.5) * 10,
      }));
      let frames = 0;
      function step() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        particles.forEach((p) => {
          p.x += p.vx;
          p.y += p.vy;
          p.rotation += p.vr;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.fillStyle = p.color;
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
          ctx.restore();
        });
        frames++;
        if (frames < 150) {
          requestAnimationFrame(step);
        } else {
          canvas.classList.remove('active');
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      step();
    },

    fullRefresh() {
      Game.Settings.apply();
      UI.renderCityTabs();
      UI.renderScene();
      UI.renderBuildingGrid();
      UI.renderPrestigeShop();
      UI.renderAchievements();
      UI.renderEventOrb();
      UI.renderActiveBuffsBar();
      UI.refreshHUD();
    },

    // ---- Random Bonus Events --------------------------------------------
    renderEventOrb() {
      const layer = document.getElementById('event-orb-layer');
      layer.innerHTML = '';
      const pending = Game.state.events.pendingOrb;
      if (!pending) return;

      const def = Game.Events.DEFS.find((e) => e.id === pending.id);
      if (!def) return;

      const orb = document.createElement('button');
      orb.className = 'event-orb';
      orb.id = 'event-orb';
      orb.title = def.desc;
      // Deterministic-ish placement that still varies per spawn, without Math.random() at render time.
      const left = 10 + ((pending.timeLeft * 37) % 70);
      const top = 15 + ((pending.timeLeft * 53) % 55);
      orb.style.left = left + '%';
      orb.style.top = top + '%';
      orb.innerHTML = `<span class="event-orb-icon">${def.icon}</span><span class="event-orb-name">${def.name}</span><span class="event-orb-timer" id="event-orb-timer">${Math.ceil(
        pending.timeLeft
      )}s</span>`;
      layer.appendChild(orb);
    },

    /** Cheap per-tick update of the orb's countdown text, without rebuilding the DOM. */
    updateEventOrbCountdown() {
      const pending = Game.state.events.pendingOrb;
      const timerEl = document.getElementById('event-orb-timer');
      if (pending && timerEl) timerEl.textContent = Math.ceil(pending.timeLeft) + 's';
    },

    renderActiveBuffsBar() {
      const bar = document.getElementById('active-buffs-bar');
      const buffs = Game.state.events.activeBuffs;
      if (!buffs.length) {
        bar.innerHTML = '';
        bar.classList.add('hidden');
        return;
      }
      bar.classList.remove('hidden');
      bar.innerHTML = buffs
        .map(
          (b) =>
            `<span class="buff-chip">${b.icon || '⏳'} ${b.label} ×${b.value} — ${Math.ceil(b.timeLeft)}s</span>`
        )
        .join('');
    },

    // ---- Event binding ---------------------------------------------------
    bindGlobalEvents() {
      document.getElementById('building-grid').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const card = btn.closest('.building-card');
        const cityId = card.dataset.city;
        const index = parseInt(card.dataset.index, 10);
        const building = Game.state.cities[cityId].buildings[index];
        const action = btn.dataset.action;

        if (action === 'unlock') Buildings.unlock(cityId, index);
        else if (action === 'levelup') Buildings.levelUp(building);
        else if (action === 'upgrade') Buildings.purchaseUpgrade(building);
        else if (action === 'autocollector') Buildings.purchaseAutoCollector(building);
        else if (action === 'collect') Buildings.collect(building);
      });

      document.getElementById('city-tabs').addEventListener('click', (e) => {
        const tab = e.target.closest('.city-tab');
        if (tab) Cities.requestUnlock(tab.dataset.city);
      });

      document.getElementById('event-orb-layer').addEventListener('click', (e) => {
        if (e.target.closest('.event-orb')) Game.Events.claimOrb();
      });

      document.getElementById('btn-stats').addEventListener('click', () => {
        UI.renderStats();
        UI.openModal('modal-stats');
      });
      document.getElementById('btn-achievements').addEventListener('click', () => {
        UI.renderAchievements();
        UI.openModal('modal-achievements');
      });
      document.getElementById('btn-prestige-shop').addEventListener('click', () => {
        UI.renderPrestigeShop();
        UI.openModal('modal-prestige-shop');
      });
      document.getElementById('btn-settings').addEventListener('click', () => UI.openModal('modal-settings'));

      document.getElementById('btn-prestige').addEventListener('click', () => {
        if (!Prestige.isAvailable()) return;
        document.getElementById('prestige-gain-preview').textContent = Utils.formatNumber(Prestige.previewGain());
        UI.openModal('modal-prestige');
      });
      document.getElementById('btn-prestige-confirm').addEventListener('click', () => {
        Prestige.doPrestige();
        UI.closeModal('modal-prestige');
      });
      document.getElementById('btn-prestige-cancel').addEventListener('click', () => UI.closeModal('modal-prestige'));

      document.getElementById('btn-unlock-confirm').addEventListener('click', () => {
        if (Cities.confirmUnlock(UI._pendingUnlockCity)) UI.closeModal('modal-unlock');
      });
      document.getElementById('btn-unlock-cancel').addEventListener('click', () => UI.closeModal('modal-unlock'));
      document.getElementById('btn-completion-close').addEventListener('click', () => UI.closeModal('modal-completion'));
      document.getElementById('btn-offline-close').addEventListener('click', () => {
        UI.closeModal('modal-offline');
        UI.fullRefresh();
        Game.Save.save();
      });

      document.getElementById('prestige-shop-list').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-upgrade]');
        if (btn) Prestige.purchaseUpgrade(btn.dataset.upgrade);
      });

      document.querySelectorAll('.modal-close').forEach((btn) => {
        btn.addEventListener('click', () => UI.closeModal(btn.dataset.close));
      });
      document.querySelectorAll('.modal-overlay').forEach((overlay) => {
        overlay.addEventListener('click', (e) => {
          if (e.target === overlay) overlay.classList.add('hidden');
        });
      });
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          document.querySelectorAll('.modal-overlay:not(.hidden)').forEach((m) => m.classList.add('hidden'));
        }
      });

      window.addEventListener('resize', () => {
        const canvas = document.getElementById('confetti-canvas');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
      });
    },
  };

  // ===================================================================
  // Main loop
  // ===================================================================
  let lastFrameTime = null;
  let hudTickAccumulator = 0;

  function loop(timestamp) {
    if (lastFrameTime === null) lastFrameTime = timestamp;
    let dt = (timestamp - lastFrameTime) / 1000;
    lastFrameTime = timestamp;
    dt = Math.min(dt, 0.25); // avoid huge jumps if the tab was backgrounded briefly

    Game.state.stats.timePlayed += dt;
    Buildings.tick(dt);
    Game.Events.tick(dt);
    UI.updateDynamicUI();

    hudTickAccumulator += dt;
    if (hudTickAccumulator >= 0.2) {
      hudTickAccumulator = 0;
      UI.refreshHUD();
      UI.renderActiveBuffsBar();
      UI.updateEventOrbCountdown();
      const currentSps = Cities.totalIncomePerSec();
      if (currentSps > Game.state.stats.highestIncomePerSec) Game.state.stats.highestIncomePerSec = currentSps;
      if (Game.state.sparks > Game.state.stats.highestSparks) Game.state.stats.highestSparks = Game.state.sparks;
    }

    requestAnimationFrame(loop);
  }

  // ===================================================================
  // Init
  // ===================================================================
  function init() {
    Game.state = createFreshState();

    const saved = Game.Save.load();
    if (saved) Object.assign(Game.state, saved);

    Game.Settings.apply();
    Game.Audio.init();
    UI.bindGlobalEvents();
    Game.Settings.bindEvents();
    UI.fullRefresh();

    Game.Offline.resolveOnLoad();
    UI.fullRefresh();

    Game.Save.startAutosave();
    if (Game.state.settings.music) Game.Audio.startMusic();

    requestAnimationFrame(loop);
  }

  window.Game.Utils = Utils;
  window.Game.UI = UI;
  window.Game.createFreshState = createFreshState;
  window.Game.init = init;
  window.Game.loop = loop;

  init();
})();
