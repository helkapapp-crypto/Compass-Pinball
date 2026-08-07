const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestScoreEl = document.getElementById('bestScore');
const ballsLeftEl = document.getElementById('ballsLeft');
const couponEl = document.getElementById('coupon');
const gameStateLabel = document.getElementById('gameStateLabel');
const launchBtn = document.getElementById('launchBtn');
const milestoneModal = document.getElementById('milestoneModal');
const milestoneText = document.getElementById('milestoneText');
const milestoneClose = document.getElementById('milestoneClose');
const gameOverModal = document.getElementById('gameOverModal');
const gameOverText = document.getElementById('gameOverText');
const gameOverClose = document.getElementById('gameOverClose');
const entryModal = document.getElementById('entryModal');
const entryName = document.getElementById('entryName');
const entryEmail = document.getElementById('entryEmail');
const entryStart = document.getElementById('entryStart');
const leaderboardList = document.getElementById('leaderboardList');
const discountTiers = document.getElementById('discountTiers');

const APPS_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbwsL_UiAck_dnGvf0Tw_r5XczAJVqS7KqGWykPypifdIHg9Hf1gYbobZvu-07hgu5iC/exec';
const REGISTER_URL = APPS_SCRIPT_URL;
const LEADERBOARD_URL = APPS_SCRIPT_URL;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

let currentUsername = '';

// Playfield layout: a horseshoe arch (like the reference blueprint).
// FIELD_CENTER is the x-axis the flippers/bumpers mirror around.
const FIELD_LEFT = 34;
const FIELD_RIGHT = 306;
const FIELD_TOP = 76;
const FIELD_BOTTOM = 516;
const FIELD_CENTER = (FIELD_LEFT + FIELD_RIGHT) / 2;
const BORDER = { x: 18, y: 60, w: 304, h: 456, r: 24 };

// Below this height the side walls taper inward toward the flippers,
// matching the drawn rail — the ball's bounds must follow the same funnel
// so it can't roll past the visible track.
const TAPER_START_Y = 380;
const TAPER_END_Y = FIELD_BOTTOM;
const TAPER_LEFT_X = FIELD_CENTER - 68;
const TAPER_RIGHT_X = FIELD_CENTER + 68;

// Plunger lane: a narrow channel to the right of the main border where the
// ball rests on the spring, gets launched upward, then merges into the
// horseshoe arch near the top.
const LANE_LEFT = FIELD_RIGHT + 16; // flush with the outer playfield border
const LANE_RIGHT = LANE_LEFT + 30;
const LANE_CENTER = (LANE_LEFT + LANE_RIGHT) / 2;
const LANE_TOP = FIELD_TOP;
const LANE_REST_Y = FIELD_BOTTOM - 20;
const LANE_PULL_MAX = 22;
const LANE_ANCHOR_Y = LANE_REST_Y + LANE_PULL_MAX + 40;
const LANE_MERGE_HEIGHT = 60; // height of the rounded curve that merges the lane into the field

// 2-over-3 bumper pentagon, matching the Compass blueprint layout — spread
// wider than a tight cluster, but kept clear of the top arch rail (y=140)
// above and the slingshots/flippers (y>=428) below.
const bumpers = [
  { x: FIELD_CENTER - 76, y: 170, r: 24, color: '#6545CC', label: 'AI', cooldown: 0, cooldownTime: 0.2 },
  { x: FIELD_CENTER + 76, y: 170, r: 24, color: '#ffa414', label: 'PR', cooldown: 0, cooldownTime: 0.2 },
  { x: FIELD_CENTER - 100, y: 270, r: 24, color: '#159dd9', label: 'UX', cooldown: 0, cooldownTime: 0.2 },
  { x: FIELD_CENTER, y: 270, r: 24, color: '#e6007e', label: 'DA', cooldown: 0, cooldownTime: 0.2 },
  { x: FIELD_CENTER + 100, y: 270, r: 24, color: '#00a75d', label: 'LD', cooldown: 0, cooldownTime: 0.2 }
];

const state = {
  score: 0,
  coupon: 0,
  bestScore: Number(localStorage.getItem('compassPinballBest') || 0),
  ballsLeft: 3,
  gameOver: false,
  milestoneIndex: 0,
  paused: true
};

const ball = {
  x: LANE_CENTER,
  y: LANE_REST_Y,
  r: 10,
  vx: 0,
  vy: 0,
  color: '#fefefe',
  launched: false,
  inLane: true
};

const physics = {
  gravity: 320,
  substeps: 6
};

// Collision response tuning: keep the ball bouncy without letting it gain energy.
const wallRestitution = 0.7;
const bumperRestitution = 0.72;
const flipperRestitution = 0.72;
const collisionDamping = 0.98;

const flippers = {
  left: { x: FIELD_CENTER - 58, y: 520, length: 56, angle: 0.55, restingAngle: 0.55, activeAngle: -0.55, targetAngle: 0.55, angularVelocity: 0, contacting: false },
  right: { x: FIELD_CENTER + 58, y: 520, length: 56, angle: 0.55, restingAngle: 0.55, activeAngle: -0.55, targetAngle: 0.55, angularVelocity: 0, contacting: false }
};

const controls = {
  left: false,
  right: false
};

const launchState = {
  charging: false,
  charge: 0,
  holdTime: 0.9,
  minCharge: 0.65
};

const stuckWatch = {
  timer: 0,
  lastX: 0,
  lastY: 0,
  threshold: 1.4
};

let lastTime = 0;

function setLaunchButtonLabel() {
  launchBtn.textContent = launchState.charging
    ? `Charging ${Math.round(launchState.charge * 100)}%`
    : (ball.launched ? 'Launched' : 'Launch');
  launchBtn.classList.toggle('charging', launchState.charging);
}

function beginLaunch() {
  if (state.gameOver || state.paused || ball.launched || launchState.charging) return;
  launchState.charging = true;
  launchState.charge = 0;
  setLaunchButtonLabel();
}

function endLaunch() {
  if (!launchState.charging) return;
  launchState.charging = false;
  const power = Math.max(launchState.minCharge, launchState.charge / launchState.holdTime);
  ball.vx = 0;
  ball.vy = -(420 + power * 220);
  ball.launched = true;
  setLaunchButtonLabel();
  updateHud();
}

function updateLaunch(dt) {
  if (launchState.charging) {
    launchState.charge = Math.min(1, launchState.charge + dt / launchState.holdTime);
    setLaunchButtonLabel();
  }
}

function updateHud() {
  scoreEl.textContent = state.score;
  bestScoreEl.textContent = state.bestScore;
  ballsLeftEl.textContent = state.ballsLeft;
  couponEl.textContent = state.coupon;
  gameStateLabel.textContent = state.gameOver ? 'Game over' : (ball.launched ? 'In play' : 'Ready to launch');
  updateDiscountTiers();
}

function updateDiscountTiers() {
  const items = discountTiers.querySelectorAll('li');
  let nextAssigned = false;
  items.forEach((item) => {
    const threshold = Number(item.dataset.threshold);
    const reached = state.score >= threshold;
    item.classList.toggle('reached', reached);
    item.classList.toggle('next', !reached && !nextAssigned);
    if (!reached) nextAssigned = true;
  });
}

function showMilestone(score) {
  const milestones = [
    { threshold: 1500, percent: 15, code: 'PINBALL15' },
    { threshold: 2000, percent: 20, code: 'PINBALL20' },
    { threshold: 2500, percent: 25, code: 'PINBALL25' },
    { threshold: 3000, percent: 30, code: 'PINBALL30' },
    { threshold: 3500, percent: 35, code: 'PINBALL35' },
    { threshold: 4000, percent: 40, code: 'PINBALL40' },
    { threshold: 4500, percent: 45, code: 'PINBALL45' },
    { threshold: 5000, percent: 50, code: 'PINBALL50' }
  ];

  const nextMilestone = milestones.find((item) => item.threshold === score);
  if (!nextMilestone) return;
if (state.milestoneIndex > milestones.indexOf(nextMilestone)) return;
  state.milestoneIndex = milestones.indexOf(nextMilestone) + 1;
  milestoneText.textContent = `Congratulations! You reached ${score} points! Your prize: ${nextMilestone.percent}% discount coupon: ${nextMilestone.code}`;
  milestoneModal.classList.add('show');
  milestoneModal.setAttribute('aria-hidden', 'false');
  state.paused = true;
}

function closeMilestoneModal() {
  milestoneModal.classList.remove('show');
  milestoneModal.setAttribute('aria-hidden', 'true');
  state.paused = false;
}

function showGameOverModal() {
  gameOverText.textContent = `You lost all 3 balls. Final score: ${state.score}`;
  gameOverModal.classList.add('show');
  gameOverModal.setAttribute('aria-hidden', 'false');
}

function closeGameOverModal() {
  gameOverModal.classList.remove('show');
  gameOverModal.setAttribute('aria-hidden', 'true');
  resetGame();
  state.paused = false;
}

function sendScoreUpdate() {
  if (!currentUsername) return;
  fetch(REGISTER_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'updateScore', username: currentUsername, score: state.score })
  }).catch(() => {});
}

function renderLeaderboard(entries) {
  const rows = Array.isArray(entries) ? entries : [];
  const players = rows.map((entry) => ({
    name: String(entry.username || entry.name || 'Unknown'),
    score: Number(entry.score) || 0
  }));

  // Show the current player right away, even before the backend has
  // caught up with their registration or first score update.
  if (currentUsername) {
    const existing = players.find((entry) => entry.name === currentUsername);
    if (existing) {
      existing.score = Math.max(existing.score, state.score);
    } else {
      players.push({ name: currentUsername, score: state.score });
    }
  }

  const sorted = players.sort((a, b) => b.score - a.score);

  leaderboardList.innerHTML = '';

  if (sorted.length === 0) {
    const empty = document.createElement('li');
    empty.className = 'leaderboard-empty';
    empty.textContent = 'No scores yet.';
    leaderboardList.appendChild(empty);
    return;
  }

  const renderRow = (entry, rank) => {
    const li = document.createElement('li');
    const isYou = entry.name === currentUsername;
    if (isYou) li.classList.add('you');
    const rankEl = document.createElement('span');
    rankEl.className = 'rank';
    rankEl.textContent = String(rank);
    const nameEl = document.createElement('span');
    nameEl.className = 'name';
    nameEl.textContent = isYou ? `${entry.name} (You)` : entry.name;
    const scoreEl = document.createElement('span');
    scoreEl.className = 'score';
    scoreEl.textContent = String(entry.score);
    li.append(rankEl, nameEl, scoreEl);
    leaderboardList.appendChild(li);
  };

  const top20 = sorted.slice(0, 20);
  top20.forEach((entry, index) => renderRow(entry, index + 1));

  const playerRank = sorted.findIndex((entry) => entry.name === currentUsername);
  if (currentUsername && playerRank >= 20) {
    const divider = document.createElement('li');
    divider.className = 'leaderboard-divider';
    divider.textContent = '···';
    leaderboardList.appendChild(divider);
    renderRow(sorted[playerRank], playerRank + 1);
  }
}

function showLeaderboardMessage(message) {
  leaderboardList.innerHTML = '';
  const li = document.createElement('li');
  li.className = 'leaderboard-empty';
  li.textContent = message;
  leaderboardList.appendChild(li);
}

function loadLeaderboard() {
  if (!LEADERBOARD_URL) {
    showLeaderboardMessage('Leaderboard URL not configured.');
    return;
  }
  fetch(LEADERBOARD_URL)
    .then((res) => res.json())
    .then((data) => renderLeaderboard(data))
    .catch(() => {
      showLeaderboardMessage("Couldn't load leaderboard.");
    });
}

function addScore(amount) {
  state.score += amount;
  state.bestScore = Math.max(state.bestScore, state.score);
  localStorage.setItem('compassPinballBest', String(state.bestScore));
  updateHud();
  const milestoneCandidates = [1500, 2000, 2500, 3000, 3500, 4000, 4500, 5000];
  const reachedMilestone = milestoneCandidates.find((threshold) => state.score >= threshold && state.score - amount < threshold);
  if (reachedMilestone) {
    showMilestone(reachedMilestone);
  }
}

function updateBumpers(dt) {
  bumpers.forEach((bumper) => {
    bumper.cooldown = Math.max(0, bumper.cooldown - dt);
  });
}

function applyCollisionDamping(multiplier = collisionDamping) {
  ball.vx *= multiplier;
  ball.vy *= multiplier;
}

function collideWithFlipper(flipper) {
  const sign = flipper.x < FIELD_CENTER ? 1 : -1;
  const tipX = flipper.x + sign * Math.cos(flipper.angle) * flipper.length;
  const tipY = flipper.y + Math.sin(flipper.angle) * flipper.length;
  const segmentX = tipX - flipper.x;
  const segmentY = tipY - flipper.y;
  const toBallX = ball.x - flipper.x;
  const toBallY = ball.y - flipper.y;
  const lengthSq = segmentX * segmentX + segmentY * segmentY;
  const projection = (toBallX * segmentX + toBallY * segmentY) / Math.max(lengthSq, 0.0001);
  const t = Math.max(0, Math.min(1, projection));
  const closestX = flipper.x + segmentX * t;
  const closestY = flipper.y + segmentY * t;
  const dx = ball.x - closestX;
  const dy = ball.y - closestY;
  const dist = Math.hypot(dx, dy);
  const hitRadius = ball.r + 4;

  if (dist < hitRadius) {
    const nx = dx / Math.max(dist, 0.0001);
    const ny = dy / Math.max(dist, 0.0001);
    const overlap = hitRadius - dist;
    ball.x += nx * overlap;
    ball.y += ny * overlap;

    const pointY = t * segmentY;
   const segVelX = -sign * flipper.angularVelocity * pointY;
   const segVelY = sign * flipper.angularVelocity * t * segmentX;
    const relVx = ball.vx - segVelX;
    const relVy = ball.vy - segVelY;
    const normalSpeed = relVx * nx + relVy * ny;

    if (!flipper.contacting && normalSpeed < 0) {
      flipper.contacting = true;
      const normalImpulse = -(1 + flipperRestitution) * normalSpeed;
      const kickStrength = 260 + Math.abs(flipper.angularVelocity) * 380;
      const tangentialImpulse = sign * kickStrength * 0.02;
      const tangentX = -ny;
      const tangentY = nx;

      ball.vx += nx * normalImpulse + tangentX * tangentialImpulse;
      ball.vy += ny * normalImpulse + tangentY * tangentialImpulse;
      applyCollisionDamping(0.995);

      window.__lastFlipperLog = {
        kickStrength,
        normalSpeed,
        tangentialImpulse,
        finalVelocity: { vx: ball.vx, vy: ball.vy }
      };
      console.log('[flipper kick]', window.__lastFlipperLog);
    }
  } else {
    flipper.contacting = false;
  }
}

function resetBall() {
  ball.x = LANE_CENTER;
  ball.y = LANE_REST_Y;
  ball.vx = 0;
  ball.vy = 0;
  ball.launched = false;
  ball.inLane = true;
  launchState.charging = false;
  launchState.charge = 0;
  setLaunchButtonLabel();
  updateHud();
}

function resetGame() {
  state.score = 0;
  state.coupon = 0;
  state.ballsLeft = 3;
  state.gameOver = false;
  state.milestoneIndex = 0;
  resetBall();
}

function loseBall() {
  sendScoreUpdate();
  state.ballsLeft -= 1;
  if (state.ballsLeft <= 0) {
    state.gameOver = true;
    state.ballsLeft = 0;
    state.paused = true;
    updateHud();
    loadLeaderboard();
    showGameOverModal();
    return;
  }
  resetBall();
}

function updateBall(dt) {
  if (!ball.launched) {
    ball.x = LANE_CENTER;
    ball.y = LANE_REST_Y + LANE_PULL_MAX * (launchState.charging ? launchState.charge : 0);
    ball.vx = 0;
    ball.vy = 0;
    return;
  }

  const step = dt / physics.substeps;
  const prevX = ball.x;
  const prevY = ball.y;
  for (let i = 0; i < physics.substeps; i += 1) {
    ball.vy += physics.gravity * step;
    ball.x += ball.vx * step;
    ball.y += ball.vy * step;

    if (ball.inLane) {
      const mergeStart = LANE_TOP + LANE_MERGE_HEIGHT;

      if (ball.y <= mergeStart) {
        // Rounded merge into the main field: ease the ball off the lane
        // and onto the playfield instead of snapping its position.
        const t = Math.min(1, (mergeStart - ball.y) / LANE_MERGE_HEIGHT);
        const eased = t * t * (3 - 2 * t);
        const mergeX = FIELD_RIGHT + 10 - ball.r;
        ball.x = LANE_CENTER + (mergeX - LANE_CENTER) * eased;
        if (ball.y <= LANE_TOP) {
          ball.inLane = false;
          ball.vx = -160;
        }
      } else {
        const laneLeft = LANE_LEFT + ball.r;
        const laneRight = LANE_RIGHT - ball.r;
        if (ball.x < laneLeft) {
          ball.x = laneLeft;
          ball.vx = Math.abs(ball.vx) * wallRestitution;
        } else if (ball.x > laneRight) {
          ball.x = laneRight;
          ball.vx = -Math.abs(ball.vx) * wallRestitution;
        }

        if (ball.y > LANE_ANCHOR_Y) {
          loseBall();
          return;
        }
      }
      continue;
    }

    let left = FIELD_LEFT + 10 + ball.r;
    let right = FIELD_RIGHT + 10 - ball.r;
    if (ball.y > TAPER_START_Y) {
      const taperT = Math.min(1, (ball.y - TAPER_START_Y) / (TAPER_END_Y - TAPER_START_Y));
      left += (TAPER_LEFT_X + ball.r - left) * taperT;
      right += (TAPER_RIGHT_X - ball.r - right) * taperT;
    }
    const top = FIELD_TOP + ball.r;
    const bottom = FIELD_BOTTOM - ball.r;

    bumpers.forEach((bumper) => {
      const dx = ball.x - bumper.x;
      const dy = ball.y - bumper.y;
      const dist = Math.hypot(dx, dy);
      const hitDistance = ball.r + bumper.r;

      if (dist < hitDistance && bumper.cooldown <= 0) {
        const nx = dx / Math.max(dist, 0.0001);
        const ny = dy / Math.max(dist, 0.0001);
        const overlap = hitDistance - dist;
        ball.x += nx * overlap;
        ball.y += ny * overlap;
        ball.vx += nx * 70 * bumperRestitution;
        ball.vy += ny * 70 * bumperRestitution;
        applyCollisionDamping();
        bumper.cooldown = bumper.cooldownTime;
        addScore(25);
      }
    });

    if (ball.x < left) {
      ball.x = left;
      ball.vx = Math.abs(ball.vx) * wallRestitution;
      applyCollisionDamping();
    } else if (ball.x > right) {
      ball.x = right;
      ball.vx = -Math.abs(ball.vx) * wallRestitution;
      applyCollisionDamping();
    }

    if (ball.y < top) {
      ball.y = top;
      ball.vy = Math.abs(ball.vy) * wallRestitution;
      applyCollisionDamping();
    } else if (ball.y > bottom) {
      ball.y = bottom;
      ball.vy = -Math.abs(ball.vy) * wallRestitution;
      applyCollisionDamping();
      if (ball.vy > 0) {
        loseBall();
        return;
      }
    }

    collideWithFlipper(flippers.left);
    collideWithFlipper(flippers.right);
  }

  const moved = Math.hypot(ball.x - prevX, ball.y - prevY);
  if (moved < 0.04) {
    stuckWatch.timer += dt;
  } else {
    stuckWatch.timer = 0;
  }

  if (stuckWatch.timer >= stuckWatch.threshold) {
    stuckWatch.timer = 0;
    loseBall();
  }
}

function updateFlippers(dt) {
  const speed = 36;
  const updateOne = (flipper, pressed, targetAngle) => {
    const prevAngle = flipper.angle;
    flipper.targetAngle = pressed ? targetAngle : flipper.restingAngle;
    flipper.angle += (flipper.targetAngle - flipper.angle) * Math.min(1, dt * speed);
    flipper.angularVelocity = (flipper.angle - prevAngle) / Math.max(dt, 0.0001);
  };

  updateOne(flippers.left, controls.left, flippers.left.activeAngle);
  updateOne(flippers.right, controls.right, flippers.right.activeAngle);
}

function drawSlot(x, y, w, h) {
  ctx.beginPath();
  ctx.roundRect(x - w / 2, y - h / 2, w, h, w / 2);
  ctx.fill();
}

function drawPlungerLane() {
  const plungerY = ball.launched ? LANE_REST_Y : ball.y;
  const mergeStart = LANE_TOP + LANE_MERGE_HEIGHT;
  const mergeX = FIELD_RIGHT + 10 - ball.r;

  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.03)';
  ctx.fillRect(LANE_LEFT, mergeStart, LANE_RIGHT - LANE_LEFT, LANE_ANCHOR_Y - mergeStart);

  ctx.strokeStyle = 'rgba(0,245,255,0.35)';
  ctx.lineWidth = 3;

  // Outer wall: straight down the full lane
  ctx.beginPath();
  ctx.moveTo(LANE_RIGHT, LANE_TOP);
  ctx.lineTo(LANE_RIGHT, LANE_ANCHOR_Y);
  ctx.stroke();

  // Inner wall: straight, then a rounded curve merging into the playfield
  ctx.beginPath();
  ctx.moveTo(LANE_LEFT, LANE_ANCHOR_Y);
  ctx.lineTo(LANE_LEFT, mergeStart);
  ctx.quadraticCurveTo(LANE_LEFT, LANE_TOP, mergeX, LANE_TOP);
  ctx.stroke();

  // Spring coil from the fixed base up to the moving plunger head
  const amplitude = (LANE_RIGHT - LANE_LEFT) / 2 - 5;
  const segments = 8;
  ctx.strokeStyle = 'rgba(0,245,255,0.7)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(LANE_CENTER, LANE_ANCHOR_Y);
  for (let i = 1; i < segments; i += 1) {
    const t = i / segments;
    const y = LANE_ANCHOR_Y + (plungerY - LANE_ANCHOR_Y) * t;
    const x = LANE_CENTER + (i % 2 === 0 ? amplitude : -amplitude);
    ctx.lineTo(x, y);
  }
  ctx.lineTo(LANE_CENTER, plungerY);
  ctx.stroke();

  ctx.fillStyle = '#00f5ff';
  ctx.shadowBlur = 10;
  ctx.shadowColor = '#00f5ff';
  ctx.beginPath();
  ctx.roundRect(LANE_LEFT + 3, plungerY - 5, LANE_RIGHT - LANE_LEFT - 6, 10, 4);
  ctx.fill();
  ctx.restore();
}

function drawBoard() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#241046');
  gradient.addColorStop(1, '#080314');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Outer playfield border — tapers inward toward the flippers instead of
  // running out to a flat horizontal edge.
  ctx.save();
  const borderGradient = ctx.createLinearGradient(BORDER.x, BORDER.y, BORDER.x, BORDER.y + BORDER.h);
  borderGradient.addColorStop(0, 'rgba(0,245,255,0.55)');
  borderGradient.addColorStop(1, 'rgba(124,92,255,0.55)');
  ctx.strokeStyle = borderGradient;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(BORDER.x, 380);
  ctx.lineTo(BORDER.x, BORDER.y + BORDER.r);
  ctx.arcTo(BORDER.x, BORDER.y, BORDER.x + BORDER.r, BORDER.y, BORDER.r);
  ctx.lineTo(BORDER.x + BORDER.w - BORDER.r, BORDER.y);
  ctx.arcTo(BORDER.x + BORDER.w, BORDER.y, BORDER.x + BORDER.w, BORDER.y + BORDER.r, BORDER.r);
  ctx.lineTo(BORDER.x + BORDER.w, 380);
  ctx.lineTo(FIELD_CENTER + 82, BORDER.y + BORDER.h);
  ctx.lineTo(FIELD_CENTER - 82, BORDER.y + BORDER.h);
  ctx.lineTo(BORDER.x, 380);
  ctx.stroke();
  ctx.restore();

  // Horseshoe arch rails (glow + inner rail) — same inward taper at the bottom.
  ctx.save();
  ctx.strokeStyle = 'rgba(0,245,255,0.35)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(FIELD_CENTER - 68, 520);
  ctx.lineTo(32, 380);
  ctx.lineTo(32, 150);
  ctx.quadraticCurveTo(60, 95, 110, 110);
  ctx.quadraticCurveTo(FIELD_CENTER, 120, 230, 110);
  ctx.quadraticCurveTo(280, 95, 308, 150);
  ctx.lineTo(308, 380);
  ctx.lineTo(FIELD_CENTER + 68, 520);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(124,92,255,0.5)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(FIELD_CENTER - 68, 520);
  ctx.lineTo(32, 380);
  ctx.lineTo(32, 140);
  ctx.lineTo(308, 140);
  ctx.lineTo(308, 380);
  ctx.lineTo(FIELD_CENTER + 68, 520);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(FIELD_CENTER, 140, 140, Math.PI * 0.08, Math.PI * 0.92);
  ctx.stroke();
  ctx.restore();

  // Top rollover-lane slots
  ctx.save();
  ctx.fillStyle = 'rgba(0,245,255,0.55)';
  drawSlot(FIELD_CENTER - 30, 84, 10, 10);
  drawSlot(FIELD_CENTER - 13, 84, 6, 22);
  drawSlot(FIELD_CENTER + 13, 84, 6, 22);
  drawSlot(FIELD_CENTER + 30, 84, 10, 10);
  ctx.restore();

  // Mid-rail corner posts
  ctx.save();
  ctx.fillStyle = '#00f5ff';
  ctx.shadowBlur = 10;
  ctx.shadowColor = '#00f5ff';
  [[26, 296], [FIELD_RIGHT + 6, 296]].forEach(([x, y]) => {
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();

  bumpers.forEach((bumper) => {
    ctx.save();
    ctx.beginPath();
    ctx.arc(bumper.x, bumper.y, bumper.r, 0, Math.PI * 2);
    ctx.fillStyle = bumper.color;
    ctx.shadowBlur = 18;
    ctx.shadowColor = bumper.color;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.stroke();
    ctx.fillStyle = '#fefefe';
    ctx.font = 'bold 15px Segoe UI';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(bumper.label, bumper.x, bumper.y);
    ctx.restore();
  });

  // Center drain kickout
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.10)';
  ctx.beginPath();
  ctx.arc(FIELD_CENTER, 500, 34, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Bottom outlane guides
  ctx.save();
  ctx.strokeStyle = 'rgba(124,92,255,0.4)';
  ctx.lineWidth = 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(34, 430);
  ctx.lineTo(50, 500);
  ctx.moveTo(2 * FIELD_CENTER - 34 + 4, 430);
  ctx.lineTo(2 * FIELD_CENTER - 50 + 4, 500);
  ctx.stroke();
  ctx.restore();

  drawPlungerLane();
}

function drawFlippers() {
  const draw = (flipper, color) => {
    const sign = flipper.x < FIELD_CENTER ? 1 : -1;
    const tipX = flipper.x + sign * Math.cos(flipper.angle) * flipper.length;
    const tipY = flipper.y + Math.sin(flipper.angle) * flipper.length;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(flipper.x, flipper.y);
    ctx.lineTo(tipX, tipY);
    ctx.lineWidth = 12;
    ctx.lineCap = 'round';
    ctx.strokeStyle = color;
    ctx.shadowBlur = 12;
    ctx.shadowColor = color;
    ctx.stroke();
    ctx.restore();
  };

  draw(flippers.left, '#00f5ff');
  draw(flippers.right, '#ff4fd8');
}

function drawBall() {
  ctx.save();

  // Chrome-ball shading: a tight hotspot offset toward the light source,
  // darkening through mid-grays to near-black at the rim.
  const hlX = ball.x - ball.r * 0.35;
  const hlY = ball.y - ball.r * 0.4;
  const chrome = ctx.createRadialGradient(hlX, hlY, 0, ball.x, ball.y, ball.r * 1.05);
  chrome.addColorStop(0, '#ffffff');
  chrome.addColorStop(0.12, '#f2f2f4');
  chrome.addColorStop(0.32, '#b6b6bc');
  chrome.addColorStop(0.6, '#65656b');
  chrome.addColorStop(0.85, '#28282c');
  chrome.addColorStop(1, '#08080a');

  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = chrome;
  ctx.shadowBlur = 14;
  ctx.shadowColor = 'rgba(255,255,255,0.5)';
  ctx.fill();
  ctx.shadowBlur = 0;

  // Faint, blurred secondary highlight (reflected light) on the opposite side.
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.clip();
  const rx = ball.x + ball.r * 0.4;
  const ry = ball.y + ball.r * 0.45;
  const reflection = ctx.createRadialGradient(rx, ry, 0, rx, ry, ball.r * 0.55);
  reflection.addColorStop(0, 'rgba(255,255,255,0.35)');
  reflection.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = reflection;
  ctx.fillRect(ball.x - ball.r, ball.y - ball.r, ball.r * 2, ball.r * 2);

  ctx.restore();
}

function animate(now) {
  if (!lastTime) {
    lastTime = now;
  }
  window.__pinballDebug = {
    ballX: ball.x,
    ballY: ball.y,
    minY: window.__pinballDebug?.minY === undefined ? ball.y : Math.min(window.__pinballDebug.minY, ball.y)
  };
  const dt = Math.min((now - lastTime) / 1000, 0.03);
  lastTime = now;
  if (!state.paused) {
    updateLaunch(dt);
    updateFlippers(dt);
    updateBumpers(dt);
    updateBall(dt);
  }
  drawBoard();
  drawFlippers();
  drawBall();
  requestAnimationFrame(animate);
}

drawBoard();
drawFlippers();
drawBall();
requestAnimationFrame(animate);

launchBtn.addEventListener('pointerdown', (event) => {
  event.preventDefault();
  beginLaunch();
});

milestoneClose.addEventListener('click', () => {
  closeMilestoneModal();
});

milestoneModal.addEventListener('click', (event) => {
  if (event.target === milestoneModal) {
    closeMilestoneModal();
  }
});

gameOverClose.addEventListener('click', () => {
  closeGameOverModal();
});

gameOverModal.addEventListener('click', (event) => {
  if (event.target === gameOverModal) {
    closeGameOverModal();
  }
});

function updateEntryValidity() {
  const nameValid = entryName.value.trim().length > 0;
  const emailValid = EMAIL_PATTERN.test(entryEmail.value.trim());
  entryStart.disabled = !(nameValid && emailValid);
}

entryName.addEventListener('input', updateEntryValidity);
entryEmail.addEventListener('input', updateEntryValidity);

entryStart.addEventListener('click', () => {
  if (entryStart.disabled) return;
  currentUsername = entryName.value.trim();
  const email = entryEmail.value.trim();
  entryStart.disabled = true;

  fetch(REGISTER_URL, {
    method: 'POST',
    mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'register', username: currentUsername, email })
  }).catch(() => {});

  entryModal.classList.remove('show');
  entryModal.setAttribute('aria-hidden', 'true');
  state.paused = false;
  loadLeaderboard();
});

updateDiscountTiers();
loadLeaderboard();
setInterval(loadLeaderboard, 20000);

window.addEventListener('pointerup', () => {
  endLaunch();
});

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    event.preventDefault();
    beginLaunch();
  }
  if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') {
    controls.left = true;
  }
  if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') {
    controls.right = true;
  }
});

window.addEventListener('keyup', (event) => {
  if (event.code === 'Space') {
    event.preventDefault();
    endLaunch();
  }
  if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') {
    controls.left = false;
  }
  if (event.key === 'ArrowRight' || event.key.toLowerCase() === 'd') {
    controls.right = false;
  }
});

setLaunchButtonLabel();
