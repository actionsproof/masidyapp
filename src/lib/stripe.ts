// SERVER ONLY. npm i stripe
import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!)

// Credits are decided HERE on the server, never taken from the browser.
export const PACKS: Record<string, { credits: number; priceId: string }> = {
  starter: { credits: 50, priceId: process.env.STRIPE_PRICE_STARTER! },
  pro: { credits: 200, priceId: process.env.STRIPE_PRICE_PRO! },
}
