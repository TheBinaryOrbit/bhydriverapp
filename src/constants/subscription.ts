/**
 * The plan every driver is on.
 *
 * There is no subscription endpoint yet: the free plan is the only one, and
 * every onboarded driver has it. So the plan lives here as content rather than
 * as fetched state — the welcome sheet and the subscription screen read the
 * same list, which is what keeps the two from promising different things.
 *
 * When plans become a server concern, this is the shape to fill from it.
 */
export type PlanFeature = {
  /** Suffix under `subscription.features.*` for the title and body. */
  key: string;
  /** MaterialIcons name. */
  icon: string;
};

export const FREE_PLAN_FEATURES: PlanFeature[] = [
  { key: 'quickRide', icon: 'bolt' },
  { key: 'outstation', icon: 'map' },
  { key: 'alerts', icon: 'notifications-active' },
  { key: 'payouts', icon: 'account-balance-wallet' },
  { key: 'support', icon: 'support-agent' },
];

/** The three worth showing in the welcome sheet, where space is short. */
export const WELCOME_FEATURES: PlanFeature[] = FREE_PLAN_FEATURES.slice(0, 3);
