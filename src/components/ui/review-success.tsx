"use client";

import { motion, AnimatePresence } from "framer-motion";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faCircleCheck, faStar } from "@fortawesome/free-solid-svg-icons";
import { useEffect, useState } from "react";

interface ReviewSuccessProps {
  show: boolean;
  rating: number;
  mealLabel: string;
  onComplete?: () => void;
}

const CONFETTI_COLORS = [
  "#22c55e",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#a855f7",
  "#06b6d4",
  "#f97316",
  "#ec4899",
];

/**
 * Animated review submission success overlay.
 * Shows a confetti burst, checkmark, and rating stars.
 * Auto-dismisses after 2.5 seconds.
 */
export function ReviewSuccess({
  show,
  rating,
  mealLabel,
  onComplete,
}: ReviewSuccessProps) {
  const [particles, setParticles] = useState<
    { id: number; x: number; y: number; color: string; delay: number; size: number }[]
  >([]);

  useEffect(() => {
    if (show) {
      // Generate confetti particles
      const newParticles = Array.from({ length: 30 }, (_, i) => ({
        id: i,
        x: Math.random() * 200 - 100,
        y: -(Math.random() * 150 + 50),
        color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
        delay: Math.random() * 0.3,
        size: Math.random() * 6 + 4,
      }));
      setParticles(newParticles);

      const timer = setTimeout(() => {
        onComplete?.();
      }, 2500);
      return () => clearTimeout(timer);
    }
  }, [show, onComplete]);

  const emoji = ["😡", "🙁", "😐", "🙂", "😍"][rating - 1] || "😐";

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
        >
          {/* Confetti particles */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {particles.map((p) => (
              <motion.div
                key={p.id}
                className="absolute rounded-full"
                style={{
                  width: p.size,
                  height: p.size,
                  backgroundColor: p.color,
                  left: "50%",
                  top: "50%",
                }}
                initial={{ x: 0, y: 0, opacity: 1, scale: 0 }}
                animate={{
                  x: p.x,
                  y: p.y,
                  opacity: [1, 1, 0],
                  scale: [0, 1.5, 0.5],
                  rotate: Math.random() * 360,
                }}
                transition={{
                  duration: 1.2,
                  delay: p.delay,
                  ease: "easeOut",
                }}
              />
            ))}
          </div>

          {/* Success content */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.8, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25, delay: 0.1 }}
            className="flex flex-col items-center gap-4 p-8"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 15, delay: 0.2 }}
            >
              <div className="w-20 h-20 rounded-full bg-green-100 dark:bg-green-500/15 flex items-center justify-center">
                <FontAwesomeIcon
                  icon={faCircleCheck}
                  className="w-10 h-10 text-green-500"
                />
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-center"
            >
              <p className="text-xl font-bold text-foreground mb-1">Review Submitted!</p>
              <p className="text-sm text-muted-foreground">{mealLabel}</p>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5, type: "spring" }}
              className="flex items-center gap-2"
            >
              <div className="flex gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <FontAwesomeIcon
                    key={star}
                    icon={faStar}
                    className={`w-5 h-5 ${
                      star <= rating
                        ? "text-primary"
                        : "text-zinc-200 dark:text-zinc-700"
                    }`}
                  />
                ))}
              </div>
              <span className="text-2xl">{emoji}</span>
            </motion.div>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.7 }}
              className="text-xs text-muted-foreground"
            >
              Thank you for your feedback!
            </motion.p>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
