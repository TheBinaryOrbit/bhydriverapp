import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { WebView } from 'react-native-webview';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../navigation/types';
import CircularCountdown from '../../components/CircularCountdown';
import PrimaryButton from '../../components/PrimaryButton';
import ScreenHeader from '../../components/ScreenHeader';
import { CARD_SHADOW } from '../../components/profile/MenuSection';
import { useAuth, useSignOut } from '../../hooks/useAuth';
import { ApiError } from '../../services/api';
import {
  fetchContentList,
  getCachedContentList,
} from '../../services/contentService';
import {
  PHONE_CONFIRM_SECONDS,
  fetchKycStatusByPhone,
  isKycRedirect,
  isKycSettled,
  pollKycStatus,
  pollKycStatusByPhone,
  startKyc,
  startKycByPhone,
} from '../../services/kycService';
import type { PhoneKycStatus } from '../../services/kycService';
import { colors } from '../../theme/colors';
import type { AppContentSummary } from '../../types/driver';
import { notify } from '../../utils/notify';

type Props = NativeStackScreenProps<RootStackParamList, 'Kyc'>;
type Nav = Props['navigation'];

/** Phase of the confirmation that follows the provider's screens. */
type Phase = 'idle' | 'confirming' | 'unconfirmed';

/**
 * Aadhaar verification through Signzy's DigiLocker flow — see `docs/driver-kyc.md`.
 *
 * The screen has two lives. Reached from the profile it verifies a signed-in
 * driver against the token; reached from Login with a `phone` — the OTP was
 * right but there is no account yet — it works off the phone number alone,
 * because KYC is what creates the driver record in that direction.
 */
export default function KycScreen({ navigation, route }: Props) {
  const phone = route.params?.phone;

  return phone ? (
    <SignupKyc phone={phone} navigation={navigation} />
  ) : (
    <ProfileKyc navigation={navigation} />
  );
}

/* ------------------------------------------------------------------ *
 * Signed-in driver — status comes from `GET /drivers/me`
 * ------------------------------------------------------------------ */

function ProfileKyc({ navigation }: { navigation: Nav }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const signOut = useSignOut();

  // `useAuth` re-reads `GET /drivers/me` on every focus, so the status here is
  // already current when the driver returns from support or another tab — a
  // driver may well have completed KYC on another device.
  const { token, driver, loading, setDriver, reload } = useAuth();
  const { helpPage, loadHelpPage } = useHelpPage();

  const [sessionUrl, setSessionUrl] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');

  // `onNavigationStateChange` fires repeatedly; the finish must run once.
  const finished = useRef(false);

  const verified = driver?.isKycCompleted === true;
  const requestId = driver?.kycDetails?.requestId;
  // A reason only means anything while KYC is incomplete — once verified, a
  // reason left over from an earlier attempt is history, not a problem.
  const failedReason = verified
    ? null
    : driver?.kycFailedReason?.trim() || null;

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Pulling down is the driver's way out of a stale "still processing" state,
    // so drop it and let the fresh profile decide what to show.
    setPhase('idle');
    await Promise.all([reload(), loadHelpPage()]);
    setRefreshing(false);
  }, [loadHelpPage, reload]);

  const closeSession = useCallback(() => {
    setSessionUrl(null);
    finished.current = false;
  }, []);

  const handleStart = useCallback(async () => {
    // Debounced so a double-tap can't open two WebViews.
    if (!token || !driver?.phoneNumber || starting || sessionUrl) {
      return;
    }
    setStarting(true);
    setPhase('idle');
    try {
      finished.current = false;
      setSessionUrl(await startKyc(token, driver.phoneNumber));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        await signOut();
        return;
      }
      // 403/500/502 are all "not something the driver can act on".
      notify(t('kyc.startFailed'));
    } finally {
      setStarting(false);
    }
  }, [driver?.phoneNumber, signOut, sessionUrl, starting, t, token]);

  /** Runs once the WebView reaches a redirect URL — the outcome is still unknown. */
  const handleFinish = useCallback(async () => {
    if (finished.current) {
      return;
    }
    finished.current = true;
    setSessionUrl(null);

    if (!token) {
      return;
    }
    setPhase('confirming');
    const latest = await pollKycStatus(token, setDriver);
    if (latest?.isKycCompleted) {
      setPhase('idle');
      notify(t('kyc.justVerified'));
    } else {
      setPhase('unconfirmed');
    }
  }, [setDriver, t, token]);

  if (loading && !driver) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.secondary} />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      <ScreenHeader title={t('kyc.title')} />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 24,
          paddingBottom: 24,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.secondary}
          />
        }
      >
        <StatusCard
          state={
            phase === 'confirming'
              ? 'confirming'
              : verified
                ? 'verified'
                : 'pending'
          }
        />

        {verified ? (
          <InfoNote
            icon="lock-outline"
            tone="neutral"
            text={t('kyc.verifiedNote')}
          />
        ) : (
          <>
            <Steps />

            <View className="mt-6">
              {/* A reason from the backend beats our own guess about what
                  happened, so it replaces the "still processing" note. */}
              {failedReason ? (
                <InfoNote
                  icon="error-outline"
                  tone="danger"
                  title={t('kyc.failedTitle')}
                  text={failedReason}
                />
              ) : phase === 'unconfirmed' ? (
                <InfoNote
                  icon="schedule"
                  tone="warning"
                  text={t('kyc.stillProcessing')}
                />
              ) : (
                <InfoNote
                  icon="info-outline"
                  tone="neutral"
                  text={t('kyc.consentNote')}
                />
              )}

              {/* Both the stuck and the failed case need a way out. */}
              {failedReason || phase === 'unconfirmed' ? (
                <StuckActions
                  requestId={requestId}
                  helpPage={helpPage}
                  navigation={navigation}
                />
              ) : null}
            </View>
          </>
        )}
      </ScrollView>

      {/* Verified drivers are never offered re-verification. */}
      {verified ? null : (
        <View
          className="border-t border-border px-6 pt-4"
          style={{ paddingBottom: insets.bottom + 12 }}
        >
          <PrimaryButton
            label={
              failedReason || phase === 'unconfirmed'
                ? t('kyc.retry')
                : t('kyc.startButton')
            }
            icon="verified-user"
            onPress={handleStart}
            loading={starting || phase === 'confirming'}
          />
        </View>
      )}

      <KycWebViewModal
        sessionUrl={sessionUrl}
        onClose={closeSession}
        onFinish={handleFinish}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Un-onboarded driver — status comes from `GET /kyc/status/:phone`
 * ------------------------------------------------------------------ */

function SignupKyc({ phone, navigation }: { phone: string; navigation: Nav }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { helpPage, loadHelpPage } = useHelpPage();

  const [status, setStatus] = useState<PhoneKycStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>('idle');
  const [sessionUrl, setSessionUrl] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const finished = useRef(false);

  const verified = status?.isKycCompleted === true;
  const requestId = status?.kycDetails?.requestId;
  const failedReason = verified
    ? null
    : status?.kycFailedReason?.trim() || null;

  const load = useCallback(async () => {
    try {
      setStatus(await fetchKycStatusByPhone(phone));
    } catch {
      // Nothing the driver can act on, and the Verify button still works —
      // treat it as "we don't know yet" rather than blocking the screen.
      notify(t('kyc.statusFailed'));
    } finally {
      setLoading(false);
    }
  }, [phone, t]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setPhase('idle');
    await Promise.all([load(), loadHelpPage()]);
    setRefreshing(false);
  }, [load, loadHelpPage]);

  const closeSession = useCallback(() => {
    setSessionUrl(null);
    finished.current = false;
  }, []);

  const handleStart = useCallback(async () => {
    if (starting || sessionUrl) {
      return;
    }
    setStarting(true);
    setPhase('idle');
    try {
      finished.current = false;
      setSessionUrl(await startKycByPhone(phone));
    } catch {
      notify(t('kyc.startFailed'));
    } finally {
      setStarting(false);
    }
  }, [phone, sessionUrl, starting, t]);

  /**
   * Landing on the redirect URL only means the driver left DigiLocker, so the
   * countdown runs while the backend waits for Signzy's callback. A status of
   * "no driver yet" is expected during that window — only a verified or a
   * failed result ends it early.
   */
  const handleFinish = useCallback(async () => {
    if (finished.current) {
      return;
    }
    finished.current = true;
    setSessionUrl(null);
    setPhase('confirming');

    const latest = await pollKycStatusByPhone(phone, setStatus);
    if (latest?.isKycCompleted) {
      setPhase('idle');
      notify(t('kyc.justVerified'));
    } else {
      // Includes a failure — the reason drives the UI from here on.
      setPhase(latest && isKycSettled(latest) ? 'idle' : 'unconfirmed');
    }
  }, [phone, t]);

  // Login is one `replace` back, so there is nothing under this screen to pop
  // to — a driver who mistyped their number needs the arrow to say so.
  const backToLogin = useCallback(() => {
    navigation.replace('Login');
  }, [navigation]);

  if (loading) {
    return (
      <View className="flex-1 items-center justify-center bg-white">
        <ActivityIndicator color={colors.secondary} />
      </View>
    );
  }

  // The processing window owns the whole screen — there is nothing to act on
  // until it resolves, and a button underneath would only invite a double run.
  if (phase === 'confirming') {
    return (
      <View className="flex-1 bg-white">
        <ScreenHeader title={t('kyc.title')} onBack={backToLogin} />
        <View className="flex-1 items-center justify-center px-10">
          <CircularCountdown seconds={PHONE_CONFIRM_SECONDS} />
          <Text className="mt-8 text-lg font-bold text-secondary">
            {t('kyc.processingTitle')}
          </Text>
          <Text className="mt-2 text-center text-[13px] leading-5 text-muted">
            {t('kyc.processingBody')}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-white">
      <ScreenHeader title={t('kyc.title')} onBack={backToLogin} />

      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 24,
          paddingTop: 24,
          paddingBottom: 24,
        }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.secondary}
          />
        }
      >
        <StatusCard
          state={verified ? 'verified' : failedReason ? 'failed' : 'pending'}
        />

        {verified ? (
          <InfoNote
            icon="lock-outline"
            tone="neutral"
            text={t('kyc.verifiedNote')}
          />
        ) : (
          <>
            <Steps />

            <View className="mt-6">
              {failedReason ? (
                <InfoNote
                  icon="error-outline"
                  tone="danger"
                  title={t('kyc.failedTitle')}
                  text={failedReason}
                />
              ) : phase === 'unconfirmed' ? (
                <InfoNote
                  icon="schedule"
                  tone="warning"
                  text={t('kyc.stillProcessing')}
                />
              ) : (
                <InfoNote
                  icon="info-outline"
                  tone="neutral"
                  text={t('kyc.consentNote')}
                />
              )}

              {failedReason || phase === 'unconfirmed' ? (
                <StuckActions
                  requestId={requestId}
                  helpPage={helpPage}
                  navigation={navigation}
                />
              ) : null}
            </View>
          </>
        )}
      </ScrollView>

      <View
        className="border-t border-border px-6 pt-4"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        {verified ? (
          <PrimaryButton
            label={t('kyc.next')}
            icon="arrow-forward"
            // TODO: destination still to be decided — registration is what the
            // 404 from `/auth/verify` used to lead to, so it stands in for now.
            // `status.token` is available here once that decision lands.
            onPress={() => navigation.replace('DriverOnboarding', { phone })}
          />
        ) : (
          <PrimaryButton
            label={
              failedReason || phase === 'unconfirmed'
                ? t('kyc.redoKyc')
                : t('kyc.startButton')
            }
            icon="verified-user"
            onPress={handleStart}
            loading={starting}
          />
        )}
      </View>

      <KycWebViewModal
        sessionUrl={sessionUrl}
        onClose={closeSession}
        onFinish={handleFinish}
      />
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * Shared pieces
 * ------------------------------------------------------------------ */

/**
 * The support page, resolved up front. Only the stuck and failed cases use it,
 * but it has to be ready the moment either appears.
 */
function useHelpPage() {
  const [helpPage, setHelpPage] = useState<AppContentSummary | null>(null);

  const loadHelpPage = useCallback(async () => {
    const findHelpPage = (pages: AppContentSummary[]) =>
      pages.find(page => /help|support|contact/i.test(page.slug)) ?? null;

    const cached = await getCachedContentList();
    if (cached.length > 0) {
      setHelpPage(findHelpPage(cached));
    }
    try {
      setHelpPage(findHelpPage(await fetchContentList()));
    } catch {
      // Keep whatever the cache offered; the link just may not appear.
    }
  }, []);

  useEffect(() => {
    loadHelpPage();
  }, [loadHelpPage]);

  return { helpPage, loadHelpPage };
}

/** Reference id + a way to reach a human, for the failed and stuck cases. */
function StuckActions({
  requestId,
  helpPage,
  navigation,
}: {
  requestId?: string;
  helpPage: AppContentSummary | null;
  navigation: Nav;
}) {
  const { t } = useTranslation();

  return (
    <>
      {requestId ? (
        <View className="mt-3 rounded-xl border border-border bg-surface px-4 py-3">
          <Text className="text-xs font-semibold uppercase tracking-wide text-muted">
            {t('kyc.referenceId')}
          </Text>
          <Text className="mt-0.5 text-sm font-bold text-secondary" selectable>
            {requestId}
          </Text>
        </View>
      ) : null}

      {helpPage ? (
        <Pressable
          onPress={() =>
            navigation.navigate('ContentPage', {
              slug: helpPage.slug,
              title: helpPage.name,
            })
          }
          className="mt-3 flex-row items-center justify-center rounded-xl border border-border py-3.5 active:opacity-70"
        >
          <MaterialIcons
            name="support-agent"
            size={18}
            color={colors.secondary}
          />
          <Text className="ml-2 text-sm font-bold text-secondary">
            {t('kyc.contactSupport')}
          </Text>
        </Pressable>
      ) : null}
    </>
  );
}

/** The DigiLocker session itself. Only the redirect URL ends it. */
function KycWebViewModal({
  sessionUrl,
  onClose,
  onFinish,
}: {
  sessionUrl: string | null;
  onClose: () => void;
  onFinish: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={sessionUrl !== null}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View className="flex-1 bg-white" style={{ paddingTop: insets.top }}>
        <View className="flex-row items-center border-b border-border px-4 pb-3 pt-2">
          {/* Cancelling is fine — it just leaves KYC incomplete. */}
          <Pressable
            onPress={onClose}
            hitSlop={10}
            className="active:opacity-60"
          >
            <MaterialIcons name="close" size={24} color={colors.secondary} />
          </Pressable>
          <Text className="ml-3 flex-1 text-base font-bold text-secondary">
            {t('kyc.webviewTitle')}
          </Text>
        </View>

        {sessionUrl ? (
          <WebView
            source={{ uri: sessionUrl }}
            javaScriptEnabled
            domStorageEnabled
            thirdPartyCookiesEnabled
            startInLoadingState
            renderLoading={() => (
              <View className="flex-1 items-center justify-center bg-white">
                <ActivityIndicator color={colors.secondary} />
              </View>
            )}
            // Caught before the page loads, so the marketing site never
            // flashes up: refusing the request closes the WebView instead.
            onShouldStartLoadWithRequest={request => {
              if (isKycRedirect(request.url)) {
                onFinish();
                return false;
              }
              return true;
            }}
            // Backstop for redirects the request handler doesn't see (JS
            // `location` changes, history pushes). `onFinish` runs once either
            // way. The flow spans several pages, so only the redirect ends it.
            onNavigationStateChange={nav => {
              if (isKycRedirect(nav.url)) {
                onFinish();
              }
            }}
            onError={() => {
              onClose();
              notify(t('kyc.webviewFailed'));
            }}
          />
        ) : null}
      </View>
    </Modal>
  );
}

type CardState = 'verified' | 'pending' | 'failed' | 'confirming';

/** Big status banner at the top of the screen. */
function StatusCard({ state }: { state: CardState }) {
  const { t } = useTranslation();

  const TONES: Record<
    CardState,
    {
      tint: string;
      surface: string;
      icon: string | null;
      title: string;
      body: string;
    }
  > = {
    verified: {
      tint: colors.success,
      surface: colors.successSurface,
      icon: 'verified-user',
      title: t('kyc.statusVerified'),
      body: t('kyc.statusVerifiedBody'),
    },
    pending: {
      tint: colors.warning,
      surface: colors.warningSurface,
      icon: 'gpp-maybe',
      title: t('kyc.statusPending'),
      body: t('kyc.statusPendingBody'),
    },
    failed: {
      tint: colors.danger,
      surface: colors.dangerSurface,
      icon: 'gpp-bad',
      title: t('kyc.failedTitle'),
      body: t('kyc.statusFailedBody'),
    },
    confirming: {
      tint: colors.warning,
      surface: colors.warningSurface,
      // A spinner replaces the icon while we wait.
      icon: null,
      title: t('kyc.confirming'),
      body: t('kyc.confirmingBody'),
    },
  };

  const tone = TONES[state];

  return (
    <View
      className="flex-row items-center rounded-2xl border border-border bg-white p-5"
      style={CARD_SHADOW}
    >
      <View
        className="h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: tone.surface }}
      >
        {tone.icon ? (
          <MaterialIcons name={tone.icon} size={28} color={tone.tint} />
        ) : (
          <ActivityIndicator color={tone.tint} />
        )}
      </View>

      <View className="ml-4 flex-1">
        <Text className="text-base font-bold" style={{ color: tone.tint }}>
          {tone.title}
        </Text>
        <Text className="mt-1 text-[13px] leading-5 text-muted">
          {tone.body}
        </Text>
      </View>
    </View>
  );
}

function Steps() {
  const { t } = useTranslation();

  return (
    <View className="mt-6">
      <Text className="text-[15px] font-bold text-secondary">
        {t('kyc.stepsTitle')}
      </Text>
      <Step index={1} text={t('kyc.step1')} />
      <Step index={2} text={t('kyc.step2')} />
      <Step index={3} text={t('kyc.step3')} />
    </View>
  );
}

function Step({ index, text }: { index: number; text: string }) {
  return (
    <View className="mt-3 flex-row items-start">
      <View className="h-6 w-6 items-center justify-center rounded-full bg-surface">
        <Text className="text-xs font-bold text-secondary">{index}</Text>
      </View>
      <Text className="ml-3 flex-1 text-[13px] leading-5 text-muted">
        {text}
      </Text>
    </View>
  );
}

const NOTE_TONES = {
  neutral: {
    surface: '#e8f4fd',
    icon: colors.secondaryMuted,
    text: 'rgba(0, 45, 75, 0.8)',
  },
  warning: {
    surface: colors.warningSurface,
    icon: colors.warning,
    text: colors.warning,
  },
  danger: {
    surface: colors.dangerSurface,
    icon: colors.danger,
    text: colors.danger,
  },
} as const;

function InfoNote({
  icon,
  text,
  tone,
  title,
}: {
  icon: string;
  text: string;
  tone: keyof typeof NOTE_TONES;
  /** Optional heading above `text`, for notes that need to announce themselves. */
  title?: string;
}) {
  const palette = NOTE_TONES[tone];

  return (
    <View
      className="flex-row items-start rounded-xl px-4 py-3 mt-10"
      style={{ backgroundColor: palette.surface }}
    >
      <MaterialIcons
        name={icon}
        size={15}
        color={palette.icon}
        style={{ marginTop: 2 }}
      />
      <View className="ml-2 flex-1">
        {title ? (
          <Text
            className="mb-0.5 text-xs font-bold"
            style={{ color: palette.text }}
          >
            {title}
          </Text>
        ) : null}
        <Text className="text-xs leading-5" style={{ color: palette.text }}>
          {text}
        </Text>
      </View>
    </View>
  );
}
