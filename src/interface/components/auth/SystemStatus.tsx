"use client"

import { motion } from "framer-motion"

export function SystemStatus() {
  return (
    <div className="flex items-center gap-6 p-4 rounded-xl border border-white/5 bg-black/20 backdrop-blur-sm self-stretch mt-8 transition-all hover:bg-black/30 group">
      <div className="flex items-center gap-2">
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.6, 1, 0.6] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"
        />
        <span className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-500/80">System Online</span>
      </div>
      
      <div className="h-4 w-px bg-white/10" />

      <div className="flex-1 space-y-1.5">
         <div className="flex justify-between items-end">
            <span className="text-[8px] font-bold uppercase tracking-widest text-white/30">Engine Ready</span>
            <span className="text-[9px] font-mono text-cyan-400 opacity-60">Latency: 24ms</span>
         </div>
         <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden flex gap-0.5">
            {[...Array(12)].map((_, i) => (
               <motion.div 
                  key={i}
                  animate={{ 
                    height: ["40%", "100%", "60%", "100%", "40%"],
                    opacity: [0.3, 1, 0.5, 1, 0.3]
                  }}
                  transition={{ 
                    duration: 1.5, 
                    repeat: Infinity, 
                    delay: i * 0.1,
                    ease: "easeInOut"
                  }}
                  className="flex-1 bg-cyan-500/40 rounded-full"
               />
            ))}
         </div>
      </div>
    </div>
  )
}
