import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0]
}

export function getTodayDate(): string {
  return formatDate(new Date())
}

export function formatDisplayDate(dateStr: string): string {
  const date = new Date(dateStr + 'T00:00:00')
  return date.toLocaleDateString('en-IN', {
    weekday: 'short',
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function analyzeSentiment(text: string): string {
  if (!text || text.trim().length === 0) return 'neutral'
  const lower = text.toLowerCase()
  const positiveWords = [
    'good', 'great', 'excellent', 'tasty', 'delicious', 'nice', 'amazing',
    'love', 'loved', 'wonderful', 'fantastic', 'fresh', 'hot', 'perfect',
    'best', 'superb', 'awesome', 'yummy', 'well cooked', 'clean',
  ]
  const negativeWords = [
    'bad', 'terrible', 'awful', 'disgusting', 'cold', 'stale', 'undercooked',
    'salty', 'burnt', 'worst', 'horrible', 'tasteless', 'raw', 'oily',
    'dirty', 'insect', 'hair', 'spoiled', 'rotten', 'not cooked', 'bland',
    'overcooked', 'spicy', 'too much', 'unhygienic', 'waste',
  ]
  let positiveCount = 0
  let negativeCount = 0
  for (const word of positiveWords) {
    if (lower.includes(word)) positiveCount++
  }
  for (const word of negativeWords) {
    if (lower.includes(word)) negativeCount++
  }
  if (negativeCount > positiveCount) return 'negative'
  if (positiveCount > negativeCount) return 'positive'
  if (positiveCount === 0 && negativeCount === 0) return 'neutral'
  return 'neutral'
}

export const MEAL_TYPES = ['breakfast', 'lunch', 'snacks', 'dinner'] as const
export type MealType = (typeof MEAL_TYPES)[number]

export const MEAL_CONFIG: Record<MealType, { label: string; timing: string }> = {
  breakfast: { label: 'Breakfast', timing: '7:30 - 9:30 AM' },
  lunch: { label: 'Lunch', timing: '12:30 - 2:30 PM' },
  snacks: { label: 'Snacks', timing: '4:30 - 5:30 PM' },
  dinner: { label: 'Dinner', timing: '7:30 - 9:30 PM' },
}
