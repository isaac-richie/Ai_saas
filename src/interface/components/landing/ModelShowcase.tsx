"use client"

import { motion } from "framer-motion"
import { MODELS, ModelCardBody } from "./models"

export function ModelShowcase() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
      {MODELS.map((model, index) => (
        <motion.article
          key={model.id}
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          whileInView={{ opacity: 1, y: 0, scale: 1 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.5, ease: "easeOut", delay: index * 0.1 }}
          className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-b ${model.accent} to-transparent p-6 transition-all duration-300 hover:-translate-y-0.5 ${model.border}`}
        >
          <ModelCardBody model={model} />
        </motion.article>
      ))}
    </div>
  )
}
