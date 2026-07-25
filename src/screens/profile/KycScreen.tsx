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
import PrimaryButton from '../../components/PrimaryButton';
import ScreenHeader from '../../components/ScreenHeader';
import { CARD_SHADOW } from '../../components/profile/MenuSection';
import { useAuth, useSignOut } from '../../hooks/useAuth';
import { ApiError } from '../../services/api';
import {
  fetchContentList,
  getCachedContentList,
} from '../../services/contentService';
import { isKycRedirect, pollKycStatus, startKyc } from '../../services/kycService';
import { colors } from '../../theme/colors';
import type { AppContentSummary } from '../../types/driver';
import { notify } from '../../utils/notify';

type Props = NativeStackScreenProps<RootStackParamList, 'Kyc'>;

/** Phase of the confirmation that follows the provider's screens. */
type Phase = 'idle' | 'confirming' | 'unconfirmed';

/**
 * Aadhaar verification through Signzy's DigiLocker flow — see `docs/driver-kyc.md`.
 *
 * The driver taps Verify, consents inside an in-app WebView, and Signzy reports
 * the result to our backend out-of-band. Landing on the redirect URL only means
 * the driver left the provider's screens, so this screen then polls
 * `GET /drivers/me`: `isKycCompleted` is the only flag it branches on.
 */
export default function KycScreen({ navigation }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const signOut = useSignOut();

  // `useAuth` re-reads `GET /drivers/me` on every focus, so the status here is
  // already current when the driver returns from support or another tab — a
  // driver may well have completed KYC on another device.
  const { token, driver, loading, setDriver, reload } = useAuth();

  const [sessionUrl, setSessionUrl] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [helpPage, setHelpPage] = useState<AppContentSummary | null>(null);

  // `onNavigationStateChange` fires repeatedly; the finish must run once.
  const finished = useRef(false);

  const verified = driver?.isKycCompleted === true;
  const requestId = driver?.kycDetails?.requestId;
  // A reason only means anything while KYC is incomplete — once verified, a
  // reason left over from an earlier attempt is history, not a problem.
  const failedReason = verified ? null : driver?.kycFailedReason?.trim() || null;

  // Only needed for the stuck case, but resolve it up front so the action is
  // ready the moment that state appears.
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
    if (!token || starting || sessionUrl) {
      return;
    }
    setStarting(true);
    setPhase('idle');
    try {
      finished.current = false;
      setSessionUrl(await startKyc(token));
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
  }, [signOut, sessionUrl, starting, t, token]);

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
        <StatusCard verified={verified} phase={phase} />

        {verified ? (
          <InfoNote
            icon="lock-outline"
            tone="neutral"
            text={t('kyc.verifiedNote')}
          />
        ) : (
          <>
            <View className="mt-6">
              <Text className="text-[15px] font-bold text-secondary">
                {t('kyc.stepsTitle')}
              </Text>
              <Step index={1} text={t('kyc.step1')} />
              <Step index={2} text={t('kyc.step2')} />
              <Step index={3} text={t('kyc.step3')} />
            </View>

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
                <>
                  {requestId ? (
                    <View className="mt-3 rounded-xl border border-border bg-surface px-4 py-3">
                      <Text className="text-xs font-semibold uppercase tracking-wide text-muted">
                        {t('kyc.referenceId')}
                      </Text>
                      <Text
                        className="mt-0.5 text-sm font-bold text-secondary"
                        selectable
                      >
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

      <Modal
        visible={sessionUrl !== null}
        animationType="slide"
        onRequestClose={closeSession}
      >
        <View className="flex-1 bg-white" style={{ paddingTop: insets.top }}>
          <View className="flex-row items-center border-b border-border px-4 pb-3 pt-2">
            {/* Cancelling is fine — it just leaves KYC incomplete. */}
            <Pressable
              onPress={closeSession}
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
              // The flow spans several pages, so only the redirect ends it.
              onNavigationStateChange={nav => {
                if (isKycRedirect(nav.url)) {
                  handleFinish();
                }
              }}
              onError={() => {
                closeSession();
                notify(t('kyc.webviewFailed'));
              }}
            />
          ) : null}
        </View>
      </Modal>
    </View>
  );
}

/** Big verified / pending / confirming banner at the top of the screen. */
function StatusCard({ verified, phase }: { verified: boolean; phase: Phase }) {
  const { t } = useTranslation();

  const confirming = phase === 'confirming';
  const tint = verified ? colors.success : colors.warning;
  const surface = verified ? colors.successSurface : colors.warningSurface;

  return (
    <View
      className="flex-row items-center rounded-2xl border border-border bg-white p-5"
      style={CARD_SHADOW}
    >
      <View
        className="h-14 w-14 items-center justify-center rounded-full"
        style={{ backgroundColor: surface }}
      >
        {confirming ? (
          <ActivityIndicator color={tint} />
        ) : (
          <MaterialIcons
            name={verified ? 'verified-user' : 'gpp-maybe'}
            size={28}
            color={tint}
          />
        )}
      </View>

      <View className="ml-4 flex-1">
        <Text className="text-base font-bold" style={{ color: tint }}>
          {confirming
            ? t('kyc.confirming')
            : verified
              ? t('kyc.statusVerified')
              : t('kyc.statusPending')}
        </Text>
        <Text className="mt-1 text-[13px] leading-5 text-muted">
          {confirming
            ? t('kyc.confirmingBody')
            : verified
              ? t('kyc.statusVerifiedBody')
              : t('kyc.statusPendingBody')}
        </Text>
      </View>
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
