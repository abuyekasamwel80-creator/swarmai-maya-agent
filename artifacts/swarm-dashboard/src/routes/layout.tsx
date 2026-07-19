import { Link, useLocation } from "wouter";
import {
  Activity, Layers, Database, HardDrive, Settings, Cpu,
  Menu, X, Bot, TrendingUp, LayoutDashboard, Zap,
} from "lucide-react";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/maya",      label: "Maya",           icon: Bot,           primary: true },
  { href: "/trading",   label: "Trading Engine", icon: TrendingUp },
  { href: "/dashboard", label: "Command Center", icon: LayoutDashboard },
  { href: "/tasks",     label: "Task Queue",     icon: Layers },
  { href: "/agents",    label: "Agent Registry", icon: Cpu },
  { href: "/models",    label: "Model Fleet",    icon: HardDrive },
  { href: "/memory",    label: "Knowledge Graph",icon: Database },
  { href: "/settings",  label: "Config Center",  icon: Settings },
];

interface FleetStats {
  N: number;           // NVIDIA model count
  M: number;           // OpenRouter model count
  agentCount: number;
  nvidiaRpmCapacity: number;
  openrouterRpmCapacity: number;
  totalTheoreticalRpm: number;
  currentInflight: number;
  utilizationPct: number;
}

function useFleetStats() {
  const [stats, setStats] = useState<FleetStats | null>(null);

  useEffect(() => {
    const BASE = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
    const API = `${BASE}/api`;

    async function fetchStats() {
      try {
        const res = await fetch(`${API}/fleet/health`);
        if (res.ok) setStats(await res.json());
      } catch { /* silently skip */ }
    }

    fetchStats();
    const interval = setInterval(fetchStats, 8000);
    return () => clearInterval(interval);
  }, []);

  return stats;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const fleet = useFleetStats();

  const isMaya = location === "/" || location === "/maya";

  // Fallback static values match the actual registry
  const N = fleet?.N ?? 92;
  const M = fleet?.M ?? 20;
  const agents = fleet?.agentCount ?? 393;
  const rpm = fleet?.totalTheoreticalRpm ?? 3960;
  const inflight = fleet?.currentInflight ?? 0;
  const util = fleet?.utilizationPct ?? 0;

  // Maya gets its own full-screen immersive layout — skip the dashboard chrome
  if (isMaya) {
    return (
      <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30">
        {children}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col md:flex-row font-sans selection:bg-primary/30">
      {/* Mobile Header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card">
        <div className="flex items-center gap-2 text-primary font-bold tracking-wider">
          <Activity className="w-5 h-5" />
          SWARM_AI
        </div>
        <button onClick={() => setIsOpen(!isOpen)} className="text-muted-foreground">
          {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar */}
      <div className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform duration-300 ease-in-out md:relative md:translate-x-0",
        isOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex flex-col h-full">
          <div className="p-6">
            <Link href="/maya" className="flex items-center gap-3 text-primary font-black tracking-widest text-lg">
              <div className="relative">
                <Activity className="w-6 h-6 relative z-10 animate-pulse" />
                <div className="absolute inset-0 bg-primary blur-md opacity-50 z-0"></div>
              </div>
              SWARM_AI
            </Link>
          </div>

          <nav className="flex-1 px-4 space-y-1 mt-2 overflow-y-auto">
            {NAV_ITEMS.map((item) => {
              const isActive =
                (item.href === "/maya" && (location === "/" || location === "/maya")) ||
                (item.href !== "/maya" && item.href !== "/" &&
                  (location === item.href || location.startsWith(item.href + "/")));

              return (
                <Link key={item.href} href={item.href} onClick={() => setIsOpen(false)} className="block">
                  <div className={cn(
                    "flex items-center gap-3 px-4 py-2.5 rounded-md transition-all duration-200 cursor-pointer font-medium",
                    isActive
                      ? "bg-primary/10 text-primary border-l-2 border-primary shadow-[inset_0_0_20px_rgba(0,255,255,0.05)]"
                      : "text-muted-foreground hover:bg-secondary hover:text-foreground",
                    item.primary && !isActive && "text-primary/70 font-semibold"
                  )}>
                    <item.icon className={cn(
                      "w-5 h-5",
                      isActive && "drop-shadow-[0_0_8px_rgba(0,255,255,0.8)]",
                      item.primary && !isActive && "text-primary/60"
                    )} />
                    {item.label}
                    {item.primary && (
                      <span className="ml-auto text-[10px] font-mono bg-primary/20 text-primary px-1.5 py-0.5 rounded">
                        AI
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </nav>

          {/* Fleet Status Panel */}
          <div className="p-4 m-4 border border-border rounded-lg bg-background/50 space-y-3">
            <div className="text-xs text-muted-foreground font-mono uppercase tracking-wider">
              Fleet Status
            </div>

            {/* Online indicator */}
            <div className="flex items-center gap-2 text-xs text-green-400 font-mono">
              <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shadow-[0_0_8px_rgba(0,255,100,0.8)]" />
              ONLINE
            </div>

            {/* N / M split row */}
            <div className="grid grid-cols-2 gap-2">
              {/* NVIDIA */}
              <div className="rounded-md border border-green-500/30 bg-green-500/5 px-2 py-1.5 text-center">
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  <Zap className="w-3 h-3 text-green-400" />
                  <span className="text-[10px] font-mono text-green-500 uppercase tracking-wider">N</span>
                </div>
                <div className="text-lg font-black font-mono text-green-400 leading-none">{N}</div>
                <div className="text-[9px] font-mono text-green-600 mt-0.5">NVIDIA NIM</div>
              </div>

              {/* OpenRouter */}
              <div className="rounded-md border border-purple-500/30 bg-purple-500/5 px-2 py-1.5 text-center">
                <div className="flex items-center justify-center gap-1 mb-0.5">
                  <Activity className="w-3 h-3 text-purple-400" />
                  <span className="text-[10px] font-mono text-purple-500 uppercase tracking-wider">M</span>
                </div>
                <div className="text-lg font-black font-mono text-purple-400 leading-none">{M}</div>
                <div className="text-[9px] font-mono text-purple-600 mt-0.5">OpenRouter</div>
              </div>
            </div>

            {/* Agent count */}
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-muted-foreground">Agents</span>
              <span className="text-primary font-bold">{agents.toLocaleString()}</span>
            </div>

            {/* RPM */}
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-muted-foreground">Capacity</span>
              <span className="text-foreground">{rpm.toLocaleString()} RPM</span>
            </div>

            {/* Live utilization bar */}
            {inflight > 0 && (
              <div>
                <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground mb-1">
                  <span>Active calls</span>
                  <span className="text-primary">{inflight} · {util}%</span>
                </div>
                <div className="h-1 rounded-full bg-border overflow-hidden">
                  <div
                    className="h-full bg-primary transition-all duration-1000 shadow-[0_0_6px_rgba(0,255,255,0.6)]"
                    style={{ width: `${Math.min(util, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 relative overflow-x-hidden flex flex-col">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />
        <div className="relative z-10 flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full min-h-screen">
          {children}
        </div>
      </main>
    </div>
  );
}
