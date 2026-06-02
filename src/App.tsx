import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { GameState, PlayerInput } from "./types";

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const zoomRef = useRef<number>(1);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  // Local input state tracking so we can push to server
  const inputRef = useRef<PlayerInput>({
    up: false,
    down: false,
    left: false,
    right: false,
    angle: 0,
    shooting: false,
  });

  const leftJoyRef = useRef<HTMLDivElement>(null);
  const leftThumbRef = useRef<HTMLDivElement>(null);
  const rightJoyRef = useRef<HTMLDivElement>(null);
  const rightThumbRef = useRef<HTMLDivElement>(null);
  
  const leftTouchRef = useRef<{ id: number; startX: number; startY: number } | null>(null);
  const rightTouchRef = useRef<{ id: number; startX: number; startY: number } | null>(null);
  const [touchControlsActive, setTouchControlsActive] = useState(false);

  useEffect(() => {
    // Only connect once
    const newSocket = io();
    setSocket(newSocket);
    
    newSocket.on("init", ({ id, state }) => {
      setPlayerId(id);
      setGameState(state);
    });

    newSocket.on("update", (state: GameState) => {
      setGameState(state);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Keyboard and mouse handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "w" || e.key === "W" || e.key === "ArrowUp") inputRef.current.up = true;
      if (e.key === "s" || e.key === "S" || e.key === "ArrowDown") inputRef.current.down = true;
      if (e.key === "a" || e.key === "A" || e.key === "ArrowLeft") inputRef.current.left = true;
      if (e.key === "d" || e.key === "D" || e.key === "ArrowRight") inputRef.current.right = true;
      if (e.key === "1") socket?.emit("equip", "repeater");
      if (e.key === "2") socket?.emit("equip", "blaster");
      if (e.key === "3") socket?.emit("equip", "scatter");
      if (e.key === "4") socket?.emit("equip", "sniper");
      if (e.key === "5") socket?.emit("equip", "cannon");
      if (e.key === "6") socket?.emit("equip", "vulcan");
      if (e.key === "7") socket?.emit("equip", "wave");
      if (e.key === "8") socket?.emit("equip", "laser");
      socket?.emit("input", inputRef.current);
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === "w" || e.key === "W" || e.key === "ArrowUp") inputRef.current.up = false;
      if (e.key === "s" || e.key === "S" || e.key === "ArrowDown") inputRef.current.down = false;
      if (e.key === "a" || e.key === "A" || e.key === "ArrowLeft") inputRef.current.left = false;
      if (e.key === "d" || e.key === "D" || e.key === "ArrowRight") inputRef.current.right = false;
      socket?.emit("input", inputRef.current);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [socket]);

  useEffect(() => {
    // Prevent default scroll when zooming in the game area
    const canvasNode = canvasRef.current;
    if (!canvasNode) return;
    const preventScroll = (e: WheelEvent) => e.preventDefault();
    canvasNode.addEventListener("wheel", preventScroll, { passive: false });
    return () => {
      canvasNode.removeEventListener("wheel", preventScroll);
    };
  }, [gameState, playerId]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') {
       if (e.button === 0) {
          inputRef.current.shooting = true;
          socket?.emit("input", inputRef.current);
       }
       return;
    }
    
    if (!touchControlsActive) setTouchControlsActive(true);
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (x < rect.width / 2) {
      if (!leftTouchRef.current) {
        leftTouchRef.current = { id: e.pointerId, startX: x, startY: y };
        if (leftJoyRef.current) {
           leftJoyRef.current.style.left = `${x}px`;
           leftJoyRef.current.style.top = `${y}px`;
           leftJoyRef.current.style.opacity = '1';
        }
      }
    } else {
      if (!rightTouchRef.current) {
        rightTouchRef.current = { id: e.pointerId, startX: x, startY: y };
        inputRef.current.shooting = true;
        socket?.emit("input", inputRef.current);
        if (rightJoyRef.current) {
           rightJoyRef.current.style.left = `${x}px`;
           rightJoyRef.current.style.top = `${y}px`;
           rightJoyRef.current.style.opacity = '1';
        }
      }
    }
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') {
      if (!playerId || !gameState || !canvasRef.current) return;
      const rect = canvasRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const dx = e.clientX - centerX;
      const dy = e.clientY - centerY;
      inputRef.current.angle = Math.atan2(dy, dx);
      socket?.emit("input", inputRef.current);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    if (leftTouchRef.current && e.pointerId === leftTouchRef.current.id) {
       let dx = x - leftTouchRef.current.startX;
       let dy = y - leftTouchRef.current.startY;
       const dist = Math.sqrt(dx*dx + dy*dy);
       const maxDist = 40;
       
       if (dist > maxDist) {
         dx = (dx / dist) * maxDist;
         dy = (dy / dist) * maxDist;
       }

       if (leftThumbRef.current) {
         leftThumbRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
       }

       const normalizedX = dx / maxDist;
       const normalizedY = dy / maxDist;
       const threshold = 0.2;
       
       inputRef.current.left = normalizedX < -threshold;
       inputRef.current.right = normalizedX > threshold;
       inputRef.current.up = normalizedY < -threshold;
       inputRef.current.down = normalizedY > threshold;
       
       socket?.emit("input", inputRef.current);
    } 
    else if (rightTouchRef.current && e.pointerId === rightTouchRef.current.id) {
       let dx = x - rightTouchRef.current.startX;
       let dy = y - rightTouchRef.current.startY;
       const dist = Math.sqrt(dx*dx + dy*dy);
       const maxDist = 40;

       if (dist > maxDist) {
         dx = (dx / dist) * maxDist;
         dy = (dy / dist) * maxDist;
       }

       if (rightThumbRef.current) {
         rightThumbRef.current.style.transform = `translate(${dx}px, ${dy}px)`;
       }

       if (dist > 10) {
         inputRef.current.angle = Math.atan2(dy, dx);
       }
       socket?.emit("input", inputRef.current);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse') {
       if (e.button === 0) {
          inputRef.current.shooting = false;
          socket?.emit("input", inputRef.current);
       }
       return;
    }

    if (leftTouchRef.current && e.pointerId === leftTouchRef.current.id) {
       leftTouchRef.current = null;
       inputRef.current.up = false;
       inputRef.current.down = false;
       inputRef.current.left = false;
       inputRef.current.right = false;
       socket?.emit("input", inputRef.current);
       
       if (leftJoyRef.current) leftJoyRef.current.style.opacity = '0';
       if (leftThumbRef.current) leftThumbRef.current.style.transform = `translate(0px, 0px)`;
    }
    else if (rightTouchRef.current && e.pointerId === rightTouchRef.current.id) {
       rightTouchRef.current = null;
       inputRef.current.shooting = false;
       socket?.emit("input", inputRef.current);
       
       if (rightJoyRef.current) rightJoyRef.current.style.opacity = '0';
       if (rightThumbRef.current) rightThumbRef.current.style.transform = `translate(0px, 0px)`;
    }
  };

  // Render Loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !gameState || !playerId) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      const me = gameState.players[playerId];
      if (!me) {
         // spectator or disconnected
         animationFrameId = requestAnimationFrame(render);
         return;
      }
      
      // Responsive resize for container
      if (canvas.width !== canvas.clientWidth) canvas.width = canvas.clientWidth;
      if (canvas.height !== canvas.clientHeight) canvas.height = canvas.clientHeight;
      
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Camera Transform
      ctx.save();
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.scale(zoomRef.current, zoomRef.current);
      ctx.translate(-me.x, -me.y);

      // Draw Grid / Arena Setup
      // Using a subtle grid pattern
      ctx.fillStyle = "#020617"; // Dark slate
      ctx.fillRect(0, 0, gameState.arenaSize.width, gameState.arenaSize.height);
      
      ctx.strokeStyle = "rgba(34, 211, 238, 0.1)"; // cyan-400 with 10% opacity
      ctx.lineWidth = 1;
      const gridSize = 100;
      for (let x = 0; x <= gameState.arenaSize.width; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, gameState.arenaSize.height);
        ctx.stroke();
      }
      for (let y = 0; y <= gameState.arenaSize.height; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(gameState.arenaSize.width, y);
        ctx.stroke();
      }
      
      // Draw Arena Border
      ctx.strokeStyle = "rgba(6, 182, 212, 0.5)";
      ctx.lineWidth = 5;
      ctx.strokeRect(0, 0, gameState.arenaSize.width, gameState.arenaSize.height);

      // Draw Lasers
      gameState.lasers.forEach(laser => {
         ctx.save();
         ctx.translate(laser.x, laser.y);
         const angle = Math.atan2(laser.vy, laser.vx);
         ctx.rotate(angle);
         
         // Laser line
         ctx.fillStyle = laser.color;
         ctx.shadowColor = laser.color;
         ctx.shadowBlur = 15;
         ctx.fillRect(-12, -2, 24, 4);
         
         ctx.restore();
      });

      // Draw Players
      Object.keys(gameState.players).forEach(id => {
         const p = gameState.players[id];
         if (p.state !== "playing") return;
         
         ctx.save();
         ctx.translate(p.x, p.y);
         
         // Health Bar Background
         ctx.fillStyle = "rgba(15, 23, 42, 0.8)";
         ctx.fillRect(-20, -35, 40, 4);
         // Health Bar Fill
         ctx.fillStyle = p.health > 50 ? "#22d3ee" : "#d946ef"; // cyan to fuchsia
         ctx.shadowColor = ctx.fillStyle;
         ctx.shadowBlur = 5;
         ctx.fillRect(-20, -35, Math.max(0, 40 * (p.health / 100)), 4);
         ctx.shadowBlur = 0;
         
         // Player name
         ctx.fillStyle = p.id === playerId ? "#22d3ee" : "#94a3b8";
         if (p.isBot) ctx.fillStyle = "#d946ef";
         ctx.font = "10px monospace";
         ctx.textAlign = "center";
         ctx.fillText(p.name + (id === playerId ? " (You)" : ""), 0, -45);
         
         // Player Body Angle rotation
         ctx.rotate(p.angle);
         
         // Body
         ctx.beginPath();
         ctx.arc(0, 0, 18, 0, Math.PI * 2);
         ctx.fillStyle = p.color;
         ctx.shadowColor = p.color;
         ctx.shadowBlur = 20;
         ctx.fill();
         ctx.closePath();
         
         // Inner circle styling
         ctx.beginPath();
         ctx.arc(0, 0, 12, 0, Math.PI * 2);
         ctx.fillStyle = "#0f172a"; // darker tank center
         ctx.fill();
         ctx.closePath();

         // Gun Turret
         ctx.fillStyle = p.color;
         ctx.shadowBlur = 0;
         ctx.fillRect(8, -3, 22, 6); // x offsets the turret forward

         ctx.restore();
      });

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, [gameState, playerId]);

  if (!gameState || !playerId) {
    return (
      <div className="flex bg-slate-950 items-center justify-center min-h-screen text-slate-100 font-mono">
        <div className="flex flex-col items-center gap-4">
           <div className="w-12 h-12 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
           <p className="animate-pulse text-cyan-400 tracking-widest text-sm uppercase">Connecting to servers...</p>
        </div>
      </div>
    );
  }

  // Calculate sorted scores for leaderboard
  const leaderboard = Object.values(gameState.players).sort((a, b) => b.score - a.score);
  const me = gameState.players[playerId];

  const handleWheel = (e: React.WheelEvent) => {
    zoomRef.current = Math.max(0.3, Math.min(3, zoomRef.current + e.deltaY * -0.001));
  };

  return (
    <div className="w-full h-screen min-h-[700px] overflow-y-auto overflow-x-hidden bg-slate-950 text-slate-100 font-sans flex flex-col relative select-none">
      {/* Background Atmospheric Elements */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-cyan-500/10 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-fuchsia-500/10 rounded-full blur-[120px]"></div>
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#1e293b 1px, transparent 1px)', backgroundSize: '24px 24px' }}></div>
      </div>

      {/* Top HUD: Global Stats */}
      <div className="h-16 flex items-center justify-between px-8 bg-slate-900/80 border-b border-cyan-500/30 backdrop-blur-md relative z-10">
        <div className="flex items-center gap-6">
          <div className="flex flex-col hidden sm:flex">
            <span className="text-[10px] uppercase tracking-widest text-cyan-400 font-bold">System Status</span>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_#4ade80]"></div>
              <span className="text-sm font-mono tracking-tighter uppercase whitespace-nowrap">Servers Live</span>
            </div>
          </div>
          <div className="h-8 w-px bg-slate-700 hidden sm:block"></div>
          <div className="flex flex-col">
            <span className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Network Population</span>
            <span className="text-sm font-mono whitespace-nowrap">
              <span className="text-cyan-300">{Object.keys(gameState.players).filter(id => !gameState.players[id].isBot).length}</span> Online / <span className="text-fuchsia-400">{Object.keys(gameState.players).filter(id => gameState.players[id].isBot).length}</span> Bots
            </span>
          </div>
        </div>
        
        <div className="text-xl sm:text-2xl font-black italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-fuchsia-500 whitespace-nowrap mx-4">
          NEON WARFARE
        </div>

        <div className="flex items-center gap-4 hidden sm:flex">
          <div className="text-right">
             <div className="text-xs text-slate-400 uppercase tracking-widest">Protocol</div>
             <div className="text-sm font-mono text-cyan-400">ACTIVE</div>
          </div>
          <div className="w-10 h-10 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
             <div className="w-6 h-6 border-2 border-cyan-500 rounded-sm rotate-45"></div>
          </div>
        </div>
      </div>

      {/* Main Viewport Section */}
      <div className="flex-1 flex gap-4 p-4 relative z-10">
        {/* Left Sidebar: Player Loadout & Stats */}
        <div className="w-64 hidden lg:flex flex-col gap-4">
          <div className="flex-1 bg-slate-900/60 border border-slate-800 p-4 rounded-xl backdrop-blur-sm">
            <div className="text-[10px] uppercase tracking-widest text-cyan-500 font-bold mb-4 border-b border-cyan-500/20 pb-2">Current Operator</div>
            <div className="aspect-square bg-slate-800 rounded-lg mb-4 flex items-center justify-center relative overflow-hidden border border-slate-700 shadow-inner">
               <div className="absolute inset-0 bg-gradient-to-t from-cyan-500/20 to-transparent"></div>
               <div className="text-5xl opacity-50">⚡</div>
            </div>
            <div className="space-y-3">
              <div>
                <div className="text-[10px] text-slate-500 uppercase">Callsign</div>
                <div className="text-lg font-bold text-slate-200 truncate">{me?.name || 'Observer'}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase">Primary Weapon</div>
                <div className="text-sm border-l-2 border-fuchsia-500 pl-2 bg-fuchsia-500/5 py-1 text-slate-300 uppercase">
                  {me?.weapon || 'REPEATER'}
                </div>
                <div className="mt-2 grid grid-cols-2 gap-1">
                  <button onClick={() => socket?.emit("equip", "repeater")} className={`py-1 px-1 text-[9px] border rounded-sm transition-colors ${me?.weapon === 'repeater' ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300' : 'border-slate-700 text-slate-500 hover:border-slate-500'}`}>1: REPEATER</button>
                  <button onClick={() => socket?.emit("equip", "blaster")} className={`py-1 px-1 text-[9px] border rounded-sm transition-colors ${me?.weapon === 'blaster' ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300' : 'border-slate-700 text-slate-500 hover:border-slate-500'}`}>2: BLASTER</button>
                  <button onClick={() => socket?.emit("equip", "scatter")} className={`py-1 px-1 text-[9px] border rounded-sm transition-colors ${me?.weapon === 'scatter' ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300' : 'border-slate-700 text-slate-500 hover:border-slate-500'}`}>3: SCATTER</button>
                  <button onClick={() => socket?.emit("equip", "sniper")} className={`py-1 px-1 text-[9px] border rounded-sm transition-colors ${me?.weapon === 'sniper' ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300' : 'border-slate-700 text-slate-500 hover:border-slate-500'}`}>4: SNIPER</button>
                  <button onClick={() => socket?.emit("equip", "cannon")} className={`py-1 px-1 text-[9px] border rounded-sm transition-colors ${me?.weapon === 'cannon' ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300' : 'border-slate-700 text-slate-500 hover:border-slate-500'}`}>5: CANNON</button>
                  <button onClick={() => socket?.emit("equip", "vulcan")} className={`py-1 px-1 text-[9px] border rounded-sm transition-colors ${me?.weapon === 'vulcan' ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300' : 'border-slate-700 text-slate-500 hover:border-slate-500'}`}>6: VULCAN</button>
                  <button onClick={() => socket?.emit("equip", "wave")} className={`py-1 px-1 text-[9px] border rounded-sm transition-colors ${me?.weapon === 'wave' ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300' : 'border-slate-700 text-slate-500 hover:border-slate-500'}`}>7: WAVE</button>
                  <button onClick={() => socket?.emit("equip", "laser")} className={`py-1 px-1 text-[9px] border rounded-sm transition-colors ${me?.weapon === 'laser' ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300' : 'border-slate-700 text-slate-500 hover:border-slate-500'}`}>8: LASER</button>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 uppercase flex justify-between">
                   <span>Combat Efficiency (Score)</span>
                   <span className="text-cyan-400 font-mono">{me?.score || 0}</span>
                </div>
                <div className="flex gap-1 mt-1">
                  <div className="h-1.5 w-full bg-cyan-500"></div>
                  <div className="h-1.5 w-full bg-cyan-500"></div>
                  <div className="h-1.5 w-full bg-cyan-500"></div>
                  <div className="h-1.5 w-4/5 bg-slate-700"></div>
                </div>
              </div>
            </div>
          </div>

          <div className="h-24 bg-fuchsia-900/20 border border-fuchsia-500/30 p-3 rounded-xl flex flex-col justify-center text-center">
            <div className="text-[10px] uppercase text-fuchsia-400 font-bold mb-1">Status</div>
            <div className="text-xs text-fuchsia-200">{me?.isBot ? "Spectating AI" : "System Integrated"}</div>
          </div>
        </div>

        {/* Center: Tactical Game Display */}
        <div 
           className="flex-1 min-h-[400px] bg-slate-950 border border-cyan-500/40 rounded-2xl relative overflow-hidden shadow-[inset_0_0_50px_rgba(6,182,212,0.1)] flex flex-col cursor-crosshair min-w-0 touch-none"
           onPointerDown={handlePointerDown}
           onPointerMove={handlePointerMove}
           onPointerUp={handlePointerUp}
           onPointerCancel={handlePointerUp}
           onWheel={handleWheel}
        >
          {/* Mobile Weapon Tray */}
          <div className="absolute top-4 right-4 left-4 lg:hidden flex gap-2 overflow-x-auto hide-scrollbar z-40 pointer-events-auto pb-2">
            {(["repeater", "blaster", "scatter", "sniper", "cannon", "vulcan", "wave", "laser"] as const).map(w => (
               <button 
                  key={w}
                  onClick={(e) => { e.stopPropagation(); socket?.emit("equip", w); }}
                  className={`flex-shrink-0 px-3 py-2 text-[10px] uppercase font-bold border rounded-md transition-colors backdrop-blur-sm ${me?.weapon === w ? 'bg-cyan-500/40 border-cyan-400 text-white shadow-[0_0_10px_rgba(34,211,238,0.5)]' : 'bg-slate-900/60 border-slate-700 text-slate-400'}`}
               >
                 {w}
               </button>
            ))}
          </div>

          {/* Virtual Joysticks */}
          <div 
             ref={leftJoyRef} 
             className="absolute w-32 h-32 bg-slate-800/40 rounded-full border border-cyan-500/30 flex items-center justify-center pointer-events-none opacity-0 transition-opacity duration-200 z-50"
             style={{ transform: 'translate(-50%, -50%)' }}
          >
             <div ref={leftThumbRef} className="w-12 h-12 bg-cyan-500/60 rounded-full shadow-[0_0_15px_rgba(34,211,238,0.5)] transition-transform duration-75"></div>
          </div>
          <div 
             ref={rightJoyRef} 
             className="absolute w-32 h-32 bg-slate-800/40 rounded-full border border-fuchsia-500/30 flex items-center justify-center pointer-events-none opacity-0 transition-opacity duration-200 z-50"
             style={{ transform: 'translate(-50%, -50%)' }}
          >
             <div ref={rightThumbRef} className="w-12 h-12 bg-fuchsia-500/60 rounded-full shadow-[0_0_15px_rgba(217,70,239,0.5)] transition-transform duration-75"></div>
          </div>
          {/* Radar Grid overlay effects mapping to canvas */}
          <div className="absolute inset-0 opacity-10 pointer-events-none" style={{ background: 'repeating-linear-gradient(0deg, #22d3ee 0px, #22d3ee 1px, transparent 1px, transparent 40px), repeating-linear-gradient(90deg, #22d3ee 0px, #22d3ee 1px, transparent 1px, transparent 40px)' }}></div>
          
          <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
          
          {/* Scanning Circle Aesthetic overlay */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] max-w-[90vw] max-h-[90vw] border border-cyan-500/10 rounded-full flex items-center justify-center pointer-events-none">
             <div className="w-full h-full border border-cyan-500/5 rounded-full scale-[0.6] absolute"></div>
             <div className="w-full h-full border border-cyan-500/5 rounded-full scale-[0.3] absolute"></div>
             <div className="w-px h-full bg-cyan-500/10 absolute"></div>
             <div className="h-px w-full bg-cyan-500/10 absolute"></div>
             {/* Center Reticle styling */}
             <div className="w-12 h-12 border border-cyan-500/40 rotate-45 flex items-center justify-center">
               <div className="w-2 h-2 bg-cyan-500/40 rounded-full"></div>
             </div>
          </div>

          {/* Overlay HUD Info inside Canvas */}
          {me?.state === "playing" && (
            <>
              <div className="absolute top-4 left-4 font-mono text-[10px] text-cyan-400/60 leading-tight pointer-events-none">
                COORD_X: {Math.floor(me?.x || 0).toString().padStart(6, '0')}<br/>
                COORD_Y: {Math.floor(me?.y || 0).toString().padStart(6, '0')}<br/>
                SECTOR: DELTA-{Math.floor(((me?.x || 0) / gameState.arenaSize.width) * 10) || 0}
              </div>
              
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-12 items-end pointer-events-none">
                <div className="text-center">
                   <div className="text-[10px] uppercase text-slate-500 tracking-widest">Health Integrity</div>
                   <div className={`text-4xl font-black tracking-tighter ${me?.health && me.health < 40 ? 'text-rose-500 animate-pulse' : 'text-cyan-400'}`}>
                     {Math.round(me?.health || 0)}%
                   </div>
                </div>
              </div>
            </>
          )}

          {me?.state === "lobby" && (
            <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px] flex items-center justify-center">
              <div className="text-center">
                <h2 className="text-2xl font-black tracking-[0.3em] text-cyan-400 mb-2 uppercase opacity-80">Awaiting Deployment</h2>
                <p className="text-slate-400 text-sm font-mono mb-8">System Standby</p>
                <button 
                  onClick={() => socket?.emit("engage")}
                  className="px-16 py-4 bg-gradient-to-r from-cyan-600 to-fuchsia-600 text-white font-black text-2xl tracking-[0.2em] rounded-sm shadow-[0_0_30px_rgba(6,182,212,0.4)] hover:brightness-125 transition-all cursor-pointer border border-cyan-400/50"
                  style={{ textShadow: "0 0 10px rgba(255,255,255,0.5)" }}
                >
                  ENGAGE
                </button>
              </div>
            </div>
          )}
          
          {/* Corner Decorators for Arena */}
          <div className="absolute bottom-0 left-0 w-8 h-1 bg-cyan-500"></div>
          <div className="absolute bottom-0 left-0 w-1 h-8 bg-cyan-500"></div>
          <div className="absolute top-0 right-0 w-8 h-1 bg-fuchsia-500"></div>
          <div className="absolute top-0 right-0 w-1 h-8 bg-fuchsia-500"></div>
        </div>

        {/* Right Sidebar: Killfeed & Lobby */}
        <div className="w-64 hidden md:flex flex-col gap-4">
          <div className="flex-1 bg-slate-900/60 border border-slate-800 p-4 rounded-xl backdrop-blur-sm overflow-hidden flex flex-col">
            <div className="text-[10px] uppercase tracking-widest text-fuchsia-500 font-bold mb-4 border-b border-fuchsia-500/20 pb-2 flex-shrink-0">Global Leaderboard</div>
            <div className="space-y-3 font-mono text-xs overflow-y-auto pr-2">
              {leaderboard.map((p, i) => (
                 <div key={p.id} className={`flex justify-between items-center ${p.id === playerId ? 'text-cyan-400 font-bold' : 'text-slate-300'}`}>
                    <div className="flex items-center gap-2">
                       <span className="text-slate-500 w-4">{i + 1}.</span>
                       <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color, boxShadow: `0 0 6px ${p.color}` }} />
                       <span className="truncate w-24" title={p.name}>{p.name}</span>
                    </div>
                    <span className="">{p.score}</span>
                 </div>
              ))}
            </div>
          </div>

          <div className="bg-slate-900/60 border border-slate-800 p-4 rounded-xl backdrop-blur-sm">
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-2">Controls Reference</div>
            <div className="space-y-2">
               <div className="flex justify-between text-xs opacity-75">
                  <span className="text-slate-400">Movement</span>
                  <span className="text-cyan-500 font-bold">W A S D</span>
               </div>
               <div className="flex justify-between text-xs opacity-75">
                  <span className="text-slate-400">Aim</span>
                  <span className="text-cyan-500 font-bold">MOUSE</span>
               </div>
               <div className="flex justify-between text-xs opacity-75">
                  <span className="text-slate-400">Fire</span>
                  <span className="text-cyan-500 font-bold">CLICK</span>
               </div>
               <div className="flex justify-between text-xs opacity-75">
                  <span className="text-slate-400">Weapon</span>
                  <span className="text-cyan-500 font-bold">1 - 8</span>
               </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

