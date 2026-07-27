import type { NavigatorScreenParams } from '@react-navigation/native';

import type { OnboardingPrefill } from '../screens/onboarding/types';

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
};

declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}
