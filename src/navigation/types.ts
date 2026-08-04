import type { NavigatorScreenParams } from '@react-navigation/native';

import type { OnboardingPrefill } from '../screens/onboarding/types';
import type { RidePaymentDetails } from '../types/driver';
import type { OutstationRide } from '../types/outstation';
import type { LatLng, QuickRide } from '../types/quickRide';

export type MainTabParamList = {
  Home: undefined;
  Profile: undefined;
  Settings: undefined;
  History: undefined;
};

export type RootStackParamList = {
  Splash: undefined;
  LanguageSelect: undefined;
  Login: undefined;
  /**
   * Driver registration — reached only once an un-onboarded driver clears KYC.
   *
   * `token` comes from the KYC status response and is the session for the rest
   * of the flow: `/drivers/onboard` fills in the record KYC created and returns
   * no token of its own. `prefill` holds the Aadhaar-verified fields.
   */
  DriverOnboarding: {
    phone: string;
    token: string;
    prefill?: OnboardingPrefill;
  };
  Main: NavigatorScreenParams<MainTabParamList> | undefined;

  // Profile section
  EditPersonalInfo: undefined;
  /** A driver may own exactly one vehicle, so this always targets that one. */
  EditVehicle: undefined;
  ManagePayment: undefined;
  /** Ratings riders left. Always the signed-in driver's own — no id needed. */
  MyReviews: undefined;
  /** The driver's plan. One free plan exists, so it takes no params. */
  Subscription: undefined;
  /**
   * Aadhaar verification status + the DigiLocker WebView flow.
   *
   * `phone` marks the pre-signup entry, reached when OTP verify returns
   * `userStatus: 404`: there is no account yet, so the whole screen works off
   * the phone number instead of a token. Without it the screen verifies the
   * signed-in driver.
   */
  Kyc: { phone: string } | undefined;
  /** Server-rendered content page — `slug` also accepts the page `_id`. */
  ContentPage: { slug: string; title: string };

  // QuickRide
  /**
   * The live ride. Navigation is always by `rideId`; `ride` is the copy that
   * came with `bid:accepted`, passed only so the screen has something to paint
   * while `GET /quick-rides/:id` — the actual source of truth — is in flight.
   */
  RideDetails: { rideId: string; ride?: QuickRide };

  // Outstation
  /**
   * The committed outstation trip. Its own screen rather than a mode of
   * `RideDetails`: there is an extra status between assigned and in-progress,
   * two driver actions instead of one, and a departure that may be weeks away —
   * branching one screen across all of that would hide more than it shares.
   */
  OutstationDetails: { rideId: string; ride?: OutstationRide };
  /**
   * In-app turn-by-turn guidance to one leg of the trip.
   *
   * Always coordinates — `title` is only the label the SDK shows in the
   * notification tray, never what it routes to.
   */
  Navigate: { destination: LatLng; title: string };
  /**
   * Trip closed. `finalFare` is what the driver earned — and what the UPI QR
   * on that screen collects.
   *
   * `paymentDetails` rides along from the completion response so the QR paints
   * immediately; the screen falls back to `GET /payment-details/my` when it is
   * missing, which is the case on the `ride:completed` socket path.
   */
  RideSuccess: {
    rideId: string;
    finalFare?: number;
    completedAt?: string;
    dropLocationName?: string;
    paymentDetails?: RidePaymentDetails;
  };
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
