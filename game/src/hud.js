// The DOM HUD: crosshair, hit marker, health, ammo, money, timer, score, bomb state,
// kill feed and the three overlays (menu, buy, round end). It never touches the
// simulation; main.js pushes numbers in and reads the play and buy callbacks out.
// Every setter skips a DOM write when the value did not change.
const OVERLAY_COPY = {
  menu: {
    title: 'KESTREL STATION',
    copy: 'One Kestrel against five Jackals. Plant the Charge at Relay Hall or Freight Dock — or clear the yard. Click to play.',
    action: 'Click to play',
  },
  paused: {
    title: 'KESTREL STATION',
    copy: 'Paused. Click to resume.',
    action: 'Click to resume',
  },
  round: {
    title: 'Round over',
    copy: '',
    action: 'Next round',
  },
  match: {
    title: 'Match over',
    copy: '',
    action: 'Play again',
  },
};

export function createHud() {
  const root = document.getElementById('hud');
  const crosshair = document.getElementById('crosshair');
  const hitmarker = document.getElementById('hitmarker');
  const vignette = document.getElementById('damage-vignette');
  const healthFill = document.getElementById('health-fill');
  const healthNum = document.getElementById('health-num');
  const ammoMag = document.getElementById('ammo-mag');
  const ammoReserve = document.getElementById('ammo-reserve');
  const ammoBox = document.getElementById('ammo');
  const moneyValue = document.getElementById('money-value');
  const timerValue = document.getElementById('timer-value');
  const scoreUs = document.getElementById('score-us');
  const scoreThem = document.getElementById('score-them');
  const roundValue = document.getElementById('round-value');
  const bombText = document.getElementById('bomb-text');
  const killfeed = document.getElementById('killfeed');
  const toast = document.getElementById('toast');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlayCopy = document.getElementById('overlay-copy');
  const playButton = document.getElementById('play');
  const buyPanel = document.getElementById('buy');
  const buyMoney = document.getElementById('buy-money');
  const buyList = document.getElementById('buy-list');
  const plantBar = document.getElementById('plant-bar');
  const plantFill = document.getElementById('plant-fill');
  const plantLabel = document.getElementById('plant-label');

  let lastHealth = -1;
  let lastMag = -1;
  let lastReserve = -1;
  let lastMoney = -1;
  let lastTimer = '';
  let lastScore = '';
  let lastBomb = '';
  let hitTimer = 0;
  let toastTimer = 0;
  let vignetteTimer = 0;

  function formatTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  return {
    buildBuy(catalog, grenadeDef, onBuy) {
      buyList.innerHTML = '';
      const entries = Object.values(catalog).concat([{
        id: 'grenade', name: grenadeDef.name, key: grenadeDef.key, price: grenadeDef.price,
        damage: 120, headMult: 1, mag: 0, reserve: 0,
      }]);
      for (const item of entries) {
        const row = document.createElement('div');
        row.className = 'buy-row';
        row.dataset.weapon = item.id;
        const damageText = item.id === 'grenade' ? 'blast 120' : `dmg ${item.damage} · ${item.mag} rnd`;
        row.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.name}</span><span class="buy-detail">${damageText}</span><span class="buy-price">$${item.price}</span>`;
        row.addEventListener('click', () => onBuy(item.id));
        buyList.appendChild(row);
      }
    },
    setHealth(hp, maxHp) {
      if (hp === lastHealth) return;
      lastHealth = hp;
      healthFill.style.width = `${(hp / maxHp) * 100}%`;
      healthNum.textContent = String(hp);
      healthFill.classList.toggle('low', hp <= 30);
    },
    setAmmo(mag, reserve) {
      if (mag === lastMag && reserve === lastReserve) return;
      lastMag = mag;
      lastReserve = reserve;
      ammoMag.textContent = String(mag);
      ammoReserve.textContent = `/ ${reserve}`;
      ammoBox.classList.toggle('empty', mag === 0);
    },
    setMoney(value) {
      if (value === lastMoney) return;
      lastMoney = value;
      moneyValue.textContent = `$${value}`;
      buyMoney.textContent = `$${value}`;
    },
    setTimer(seconds) {
      const text = formatTime(seconds);
      if (text === lastTimer) return;
      lastTimer = text;
      timerValue.textContent = text;
    },
    setScore(us, them, round) {
      const text = `${us}|${them}|${round}`;
      if (text === lastScore) return;
      lastScore = text;
      scoreUs.textContent = String(us);
      scoreThem.textContent = String(them);
      roundValue.textContent = `Round ${round}`;
    },
    setBomb(text) {
      if (text === lastBomb) return;
      lastBomb = text;
      bombText.textContent = text;
    },
    setPlant(progress, label) {
      if (progress <= 0) {
        plantBar.hidden = true;
        return;
      }
      plantBar.hidden = false;
      plantFill.style.width = `${Math.round(progress * 100)}%`;
      plantLabel.textContent = label;
    },
    setCrosshair(spreadPx) {
      crosshair.style.setProperty('--gap', `${Math.round(spreadPx)}px`);
    },
    hitMarker(killed, holdMs = 110) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFlash() {
      vignette.classList.add('on');
      clearTimeout(vignetteTimer);
      vignetteTimer = setTimeout(() => vignette.classList.remove('on'), 220);
    },
    killfeed(text) {
      const line = document.createElement('div');
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 4) killfeed.removeChild(killfeed.lastChild);
      setTimeout(() => line.remove(), 5200);
    },
    toast(text, holdMs = 2200) {
      toast.textContent = text;
      toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.hidden = true;
      }, holdMs);
    },
    showOverlay(mode, detail) {
      const text = OVERLAY_COPY[mode];
      overlayTitle.textContent = text.title;
      if (mode === 'round') overlayCopy.textContent = `${detail} — next round starts shortly.`;
      else if (mode === 'match') overlayCopy.textContent = detail;
      else overlayCopy.textContent = text.copy;
      playButton.textContent = text.action;
      overlay.hidden = false;
      playButton.focus();
    },
    hideOverlay() {
      overlay.hidden = true;
    },
    showBuy(open) {
      buyPanel.hidden = !open;
    },
    onPlay(handler) {
      playButton.addEventListener('click', handler);
    },
    setBuyAffordability(money, owned) {
      for (const row of buyList.children) {
        const id = row.dataset.weapon;
        const price = Number(row.querySelector('.buy-price').textContent.slice(1));
        row.classList.toggle('cant', money < price && !owned.has(id));
        row.classList.toggle('owned', owned.has(id));
      }
    },
  };
}
