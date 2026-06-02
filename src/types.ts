export type WeaponType = "repeater" | "blaster" | "scatter" | "sniper" | "cannon" | "vulcan" | "wave" | "laser";

export type Player = {
  id: string;
  x: number;
  y: number;
  angle: number;
  score: number;
  health: number;
  isBot: boolean;
  color: string;
  name: string;
  lastShootTime: number;
  state: "lobby" | "playing";
  weapon: WeaponType;
};

export type Laser = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ownerId: string;
  distanceTraveled: number;
  color: string;
  damage: number;
  maxDist: number;
};

export type GameState = {
  players: Record<string, Player>;
  lasers: Laser[];
  arenaSize: { width: number; height: number };
};

export type PlayerInput = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  angle: number;
  shooting: boolean;
};
