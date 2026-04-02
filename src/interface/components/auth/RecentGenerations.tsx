"use client"

import { motion } from "framer-motion"
import { Play } from "lucide-react"

const PREVIEWS = [
  {
    id: 1,
    title: "Neo-Noir Close-Up",
    metadata: "4K • 8s • 24fps",
    image: "/auth/portrait.png",
    size: "large",
  },
  {
    id: 2,
    title: "Feature Drop 01",
    metadata: "4K • 6s • 24fps",
    image: "/image1.jpeg",
    size: "medium",
  },
  {
    id: 3,
    title: "Sci-Fi Establishing Shot",
    metadata: "4K • 10s • 24fps",
    image: "/auth/city.png",
    size: "small",
  },
  {
    id: 4,
    title: "Sunset Chase Run",
    metadata: "4K • 10s • 24fps",
    image: "/jpeg4.jpeg",
    size: "medium",
  },
  {
    id: 5,
    title: "Feature Drop 02",
    metadata: "4K • 15s • 24fps",
    image: "/image2.jpeg",
    size: "small",
  },
]

export function RecentGenerations() {
  return (
    <div className="relative mt-2 w-full">
      <div className="mb-3 flex items-center gap-3">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-[10px] font-black uppercase tracking-[0.3em] text-cyan-400/60">
          Live Preview: Recent Generations
        </span>
        <div className="h-px flex-1 bg-white/10" />
      </div>

      <div className="grid grid-cols-6 gap-3.5 items-start">
        {/* Large Feature Card */}
        <div className="col-span-3 row-span-2">
          <PreviewCard item={PREVIEWS[0]} />
        </div>
        
        {/* Staggered Grid */}
        <div className="col-span-3 grid grid-cols-2 gap-3.5">
          <PreviewCard item={PREVIEWS[1]} />
          <PreviewCard item={PREVIEWS[2]} />
          <div className="mt-2">
            <PreviewCard item={PREVIEWS[3]} />
          </div>
          <div className="-mt-4">
            <PreviewCard item={PREVIEWS[4]} />
          </div>
        </div>
      </div>
      
      {/* Background Glow */}
      <div className="pointer-events-none absolute -inset-20 -z-10 bg-cyan-500/5 blur-[90px]" />
    </div>
  )
}

function PreviewCard({ item }: { item: typeof PREVIEWS[0] }) {
  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 shadow-2xl transition-all duration-500"
    >
      <div className="relative aspect-square">
        {/* Fill the image, and use low opacity overlay to fix readability as per requirement */}
        <img 
          src={item.image} 
          alt={item.title}
          className="h-full w-full object-cover transition-all duration-700 group-hover:scale-110"
        />
        
        {/* Dark Overlay that reduces on hover */}
        <div className="absolute inset-0 bg-black/40 transition-opacity duration-500 group-hover:opacity-10" />
        
        {/* Film Grain Texture */}
        <div className="absolute inset-0 opacity-20 group-hover:opacity-10 transition-opacity pointer-events-none bg-[url('https://grainy-gradients.vercel.app/noise.svg')]" />

        {/* Hover Elements */}
        <div className="absolute inset-0 flex items-center justify-center translate-y-4 opacity-0 transition-all duration-500 group-hover:translate-y-0 group-hover:opacity-100">
           <div className="h-12 w-12 rounded-full bg-white/10 backdrop-blur-md flex items-center justify-center border border-white/20">
             <Play className="h-5 w-5 text-white fill-white ml-0.5" />
           </div>
        </div>

        {/* Metadata Overlay */}
        <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
          <p className="text-[11px] font-bold text-white tracking-widest uppercase truncate">{item.title}</p>
          <div className="flex items-center gap-2 mt-1">
             <span className="text-[8px] font-bold text-white/50 tracking-widest uppercase">Generated</span>
             <span className="h-1 w-1 rounded-full bg-cyan-500/50" />
             <span className="text-[8px] font-mono text-cyan-400/80 uppercase">{item.metadata}</span>
          </div>
        </div>
      </div>
      
      {/* Light Sweep Effect */}
      <div className="absolute inset-0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/10 to-transparent skew-x-12 pointer-events-none" />
    </motion.div>
  )
}
