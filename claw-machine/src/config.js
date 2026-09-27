// All sizes are in metres, times in seconds. The machine stands at the origin,
// its front (glass, control panel, prize door) faces +Z.

export const CAB = {
  half: 0.45, // half of the outer width/depth
  inner: 0.41, // half of the play area (inside the glass)
  post: 0.02, // half-thickness of the corner posts
};

export const FLOOR_Y = 0.82; // top of the play floor
export const CEIL_Y = 1.62; // top of the glass / bottom of the header
export const HEADER_TOP = 1.84;

// Prize chute in the front-left corner of the play area.
export const CHUTE = {
  minX: -0.41,
  maxX: -0.19,
  minZ: 0.19,
  maxZ: 0.41,
  guardHeight: 0.12,
  guardThickness: 0.012,
  doorBottom: 0.36, // prize door opening in the front of the base
  doorTop: 0.6,
  rampBackY: 0.54, // ramp inside the shaft slopes down towards the door
};
CHUTE.cx = (CHUTE.minX + CHUTE.maxX) / 2;
CHUTE.cz = (CHUTE.minZ + CHUTE.maxZ) / 2;

export const CLAW = {
  restY: 1.42, // hub centre when fully raised
  minY: FLOOR_Y + 0.05,
  travel: 0.315, // max |x| / |z| of the claw axis
  home: { x: CHUTE.cx, z: CHUTE.cz },

  moveSpeed: 0.27,
  moveAccel: 1.5,
  dropSpeed: 0.34,
  liftSpeed: 0.24,
  returnSpeed: 0.22,

  openAngle: 0.8,
  releaseAngle: 0.62,
  closedAngle: -0.06,
  openSpeed: 2.4,
  closeSpeed: 1.6,

  hubRadius: 0.034,
  hingeRadius: 0.028,
  hingeY: -0.024,
  // Finger directions around the hub (radians in the XZ plane): one prong at the
  // back, two at the front so the player sees a "V" from the front camera.
  fingerDirs: [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6],
  // Prong centre line in finger space (x = radially outwards, y = up), hinge at origin.
  fingerPath: [
    [0, 0],
    [0.014, -0.03],
    [0.022, -0.066],
    [0.02, -0.1],
    [0.006, -0.13],
    [-0.017, -0.149],
  ],
  fingerRadius: 0.0095,

  swingLength: 0.4, // pendulum length used for the sway of the claw
  swingMax: 0.03,
};

export const GANTRY_Y = 1.585; // rails height
export const CARRIAGE_Y = 1.545;

export const ROUND_TIME = 30;
export const START_COINS = 10;
export const PRIZE_COUNT = 46;

// Grip behaviour per difficulty. `strength` scales how well a good grab holds,
// `weaken` multiplies it once the claw reaches the top, `relax` opens the prongs
// slightly at the top (radians), `minAssist` is a floor for any valid grab.
// The greedy mode imitates real mall machines.
export const DIFFICULTY = {
  easy: {
    label: 'Лёгкий',
    hint: 'Клешня держит мёртвой хваткой',
    roll: () => ({ strength: 1.25, weaken: 1, relax: 0, minAssist: 1.12 }),
  },
  fair: {
    label: 'Честный',
    hint: 'Физика и немного удачи',
    roll: () => ({ strength: 0.85 + Math.random() * 0.25, weaken: 0.9, relax: 0.03 }),
  },
  greedy: {
    label: 'Как в ТЦ',
    hint: 'Хватка слабеет наверху, щедрый раунд — редкость',
    roll: (lossStreak) => {
      const strongChance = Math.min(0.85, 0.1 + lossStreak * 0.09);
      if (Math.random() < strongChance) return { strength: 1, weaken: 0.9, relax: 0.03, strong: true };
      return { strength: 0.3 + Math.random() * 0.3, weaken: 0.55, relax: 0.13 };
    },
  },
};
