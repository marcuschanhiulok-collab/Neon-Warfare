import express from "express";
import http from "http";
import path from "path";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import { GameState, Player, Laser, PlayerInput, WeaponType } from "./src/types.js";

const PORT = 3000;
const ARENA_WIDTH = 2500;
const ARENA_HEIGHT = 2500;
const PLAYER_SPEED = 300; // pixels per second
const MIN_BATS = 4; // Ensure there are at least this many bots if online humans < MIN_PLAYERS
const PLAYER_SIZE = 20;

const WEAPONS: Record<WeaponType, any> = {
  repeater: { cooldown: 0.2, speed: 800, damage: 20, maxDist: 1000, projectiles: 1, spread: 0 },
  blaster: { cooldown: 0.08, speed: 1200, damage: 8, maxDist: 800, projectiles: 1, spread: 0.15 },
  scatter: { cooldown: 0.8, speed: 600, damage: 15, maxDist: 500, projectiles: 5, spread: Math.PI / 4 },
  sniper: { cooldown: 1.5, speed: 2500, damage: 80, maxDist: 2500, projectiles: 1, spread: 0 },
  cannon: { cooldown: 2.0, speed: 400, damage: 100, maxDist: 2000, projectiles: 1, spread: 0 },
  vulcan: { cooldown: 0.05, speed: 1500, damage: 5, maxDist: 900, projectiles: 1, spread: 0.2 },
  wave: { cooldown: 1.0, speed: 500, damage: 12, maxDist: 600, projectiles: 9, spread: Math.PI / 2 },
  laser: { cooldown: 0.02, speed: 2000, damage: 2, maxDist: 400, projectiles: 1, spread: 0.01 }
};
const WEAPON_KEYS = Object.keys(WEAPONS) as WeaponType[];

let gameState: GameState = {
  players: {},
  lasers: [],
  arenaSize: { width: ARENA_WIDTH, height: ARENA_HEIGHT },
};

const playerInputs: Record<string, PlayerInput> = {};

function spawnBot() {
  const id = `bot_${Math.random().toString(36).substr(2, 9)}`;
  gameState.players[id] = {
    id,
    x: Math.random() * ARENA_WIDTH,
    y: Math.random() * ARENA_HEIGHT,
    angle: Math.random() * Math.PI * 2,
    score: 0,
    health: 100,
    isBot: true,
    color: `hsl(${Math.random() * 360}, 80%, 50%)`,
    name: `Bot ${Math.floor(Math.random() * 1000)}`,
    lastShootTime: 0,
    state: "playing",
    weapon: WEAPON_KEYS[Math.floor(Math.random() * WEAPON_KEYS.length)],
  };
}

function spawnLasers(player: Player, angle: number, wStats: any) {
  for (let i = 0; i < wStats.projectiles; i++) {
    let shootAngle = angle;
    if (wStats.projectiles > 1) {
      const startAngle = angle - wStats.spread / 2;
      shootAngle = startAngle + (wStats.spread / (wStats.projectiles - 1)) * i;
    } else if (wStats.spread > 0) {
      shootAngle += (Math.random() - 0.5) * wStats.spread;
    }

    gameState.lasers.push({
      id: Math.random().toString(),
      x: player.x,
      y: player.y,
      vx: Math.cos(shootAngle) * wStats.speed,
      vy: Math.sin(shootAngle) * wStats.speed,
      ownerId: player.id,
      distanceTraveled: 0,
      color: player.color,
      damage: wStats.damage,
      maxDist: wStats.maxDist
    });
  }
}

function updateBots(dt: number) {
  const playersInGame = Object.values(gameState.players);
  const botCount = playersInGame.filter((p) => p.isBot).length;
  
  // Ensure we have enough bots just wandering
  const targetBotCount = Math.max(MIN_BATS, 10 - playersInGame.filter(p => !p.isBot).length);
  if (botCount < targetBotCount) {
    spawnBot();
  }

  // Update logic for bots
  Object.values(gameState.players).forEach((p) => {
    if (!p.isBot) return;

    // Simple AI
    // Find closest player (target)
    let target = null;
    let minD = Infinity;
    playersInGame.forEach((other) => {
      if (other.id === p.id) return;
      const dx = other.x - p.x;
      const dy = other.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minD) {
        minD = dist;
        target = other;
      }
    });

    if (target && minD < 1000) {
      // Move towards target
      const dx = target.x - p.x;
      const dy = target.y - p.y;
      const targetAngle = Math.atan2(dy, dx);
      
      // Gradually change angle
      const angleDiff = targetAngle - p.angle;
      p.angle += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), dt * 3);
      
      if (minD > 200) {
        p.x += Math.cos(p.angle) * PLAYER_SPEED * dt * 0.7;
        p.y += Math.sin(p.angle) * PLAYER_SPEED * dt * 0.7;
      }

      // Shoot if roughly facing target
      const botWStats = WEAPONS[p.weapon] || WEAPONS.repeater;
      if (Math.abs(angleDiff) < 0.5 && Date.now() / 1000 - p.lastShootTime > botWStats.cooldown * 2) {
         p.lastShootTime = Date.now() / 1000;
         spawnLasers(p, p.angle, botWStats);
      }
    } else {
      // Wander randomly
      p.angle += (Math.random() - 0.5) * dt * 2;
      p.x += Math.cos(p.angle) * PLAYER_SPEED * dt * 0.5;
      p.y += Math.sin(p.angle) * PLAYER_SPEED * dt * 0.5;
    }

    // Keep bot in bounds
    p.x = Math.max(PLAYER_SIZE, Math.min(ARENA_WIDTH - PLAYER_SIZE, p.x));
    p.y = Math.max(PLAYER_SIZE, Math.min(ARENA_HEIGHT - PLAYER_SIZE, p.y));
  });
}

const TICK_RATE = 60; // 60 ticks per second
let lastTime = Date.now();

function gameLoop() {
  const now = Date.now();
  const dt = (now - lastTime) / 1000;
  lastTime = now;

  // Update players based on inputs
  Object.keys(playerInputs).forEach((id) => {
    const input = playerInputs[id];
    const player = gameState.players[id];
    if (!player || player.state !== "playing") return;

    let dx = 0; let dy = 0;
    if (input.up) dy -= 1;
    if (input.down) dy += 1;
    if (input.left) dx -= 1;
    if (input.right) dx += 1;

    // Normalize diagonal movement
    if (dx !== 0 && dy !== 0) {
      const length = Math.sqrt(dx * dx + dy * dy);
      dx /= length;
      dy /= length;
    }

    player.x += dx * PLAYER_SPEED * dt;
    player.y += dy * PLAYER_SPEED * dt;
    player.angle = input.angle;

    // Boundary check
    player.x = Math.max(PLAYER_SIZE, Math.min(ARENA_WIDTH - PLAYER_SIZE, player.x));
    player.y = Math.max(PLAYER_SIZE, Math.min(ARENA_HEIGHT - PLAYER_SIZE, player.y));

    // Shooting
    const wStats = WEAPONS[player.weapon] || WEAPONS.repeater;
    if (input.shooting && now / 1000 - player.lastShootTime > wStats.cooldown) {
      player.lastShootTime = now / 1000;
      spawnLasers(player, player.angle, wStats);
    }
  });

  // Update bots
  updateBots(dt);

  // Update lasers
  const currentLasers = gameState.lasers;
  gameState.lasers = [];
  
  currentLasers.forEach((laser) => {
    laser.x += laser.vx * dt;
    laser.y += laser.vy * dt;
    const dist = Math.sqrt((laser.vx * dt) ** 2 + (laser.vy * dt) ** 2);
    laser.distanceTraveled += dist;

    // Check collision against players
    let hit = false;
    Object.values(gameState.players).forEach((p) => {
      // Don't hit owner and don't hit lobby players
      if (p.id === laser.ownerId || p.state !== "playing") return;

      const hitDist = Math.sqrt((p.x - laser.x) ** 2 + (p.y - laser.y) ** 2);
      if (hitDist < PLAYER_SIZE) {
        hit = true;
        p.health -= laser.damage;
        
        if (p.health <= 0) {
           // Provide point to owner
           if (gameState.players[laser.ownerId]) {
              gameState.players[laser.ownerId].score += 1;
           }
           // Respawn
           p.health = 100;
           p.x = Math.random() * ARENA_WIDTH;
           p.y = Math.random() * ARENA_HEIGHT;
        }
      }
    });

    if (!hit && laser.distanceTraveled < laser.maxDist) {
      // Boundary check
      if (laser.x >= 0 && laser.x <= ARENA_WIDTH && laser.y >= 0 && laser.y <= ARENA_HEIGHT) {
         gameState.lasers.push(laser);
      }
    }
  });
}

function startServer() {
  const app = express();
  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: "*" } });

  io.on("connection", (socket) => {
    console.log(`[+] Player connected: ${socket.id}`);
    
    gameState.players[socket.id] = {
      id: socket.id,
      x: Math.random() * ARENA_WIDTH,
      y: Math.random() * ARENA_HEIGHT,
      angle: 0,
      score: 0,
      health: 100,
      isBot: false,
      color: `hsl(${Math.random() * 360}, 100%, 60%)`,
      name: `Player ${socket.id.substring(0,4)}`,
      lastShootTime: 0,
      state: "lobby",
      weapon: "repeater"
    };

    playerInputs[socket.id] = { up: false, down: false, left: false, right: false, angle: 0, shooting: false };

    socket.emit("init", { id: socket.id, state: gameState });

    socket.on("equip", (weapon: WeaponType) => {
      if (gameState.players[socket.id] && WEAPONS[weapon]) {
        gameState.players[socket.id].weapon = weapon;
      }
    });

    socket.on("engage", () => {
      if (gameState.players[socket.id]) {
        gameState.players[socket.id].state = "playing";
        gameState.players[socket.id].health = 100;
        gameState.players[socket.id].x = Math.random() * ARENA_WIDTH;
        gameState.players[socket.id].y = Math.random() * ARENA_HEIGHT;
      }
    });

    socket.on("input", (input: PlayerInput) => {
      if (playerInputs[socket.id]) {
        playerInputs[socket.id] = input;
      }
    });

    socket.on("disconnect", () => {
      console.log(`[-] Player disconnected: ${socket.id}`);
      delete gameState.players[socket.id];
      delete playerInputs[socket.id];
    });
  });

  // Game loop interval
  setInterval(() => {
    gameLoop();
    io.emit("update", gameState);
  }, 1000 / TICK_RATE);

  (async () => {
    if (process.env.NODE_ENV !== "production") {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on port ${PORT}`);
    });
  })();
}

startServer();
