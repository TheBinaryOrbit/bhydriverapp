import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BackHandler,
  Keyboard,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';
import { useTranslation } from 'react-i18next';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import type { RootStackParamList } from '../../navigation/types';
import KeyboardSafeView from '../../components/KeyboardSafeView';
import PrimaryButton from '../../components/PrimaryButton';
import Steps from '../../components/Steps';
import { ApiError } from '../../services/api';
import { fetchVehicleTypes, onboardDriver } from '../../services/driverService';
import { saveSession } from '../../storage/authStorage';
import { colors } from '../../theme/colors';
import type { VehicleType } from '../../types/driver';
import { dobToIso } from '../../utils/validators';
import { notify } from '../../utils/notify';
import DocumentsStep from './DocumentsStep';
import PersonalStep from './PersonalStep';
import VehicleStep from './VehicleStep';
import { createEmptyForm, type FormErrors, type OnboardingForm } from './types';
import { mapServerErrors, validateStep } from './validate';

type Props = NativeStackScreenProps<RootStackParamList, 'DriverOnboarding'>;

const TOTAL_STEPS = 3;

/**
 * Three-step driver registration shown when `/auth/verify` reports
 * `userStatus: 404`. Everything is submitted in one multipart call to
 * `/drivers/onboard`, which returns the JWT — no second login is needed.
 */
export default function DriverOnboardingScreen({ navigation, route }: Props) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { phone } = route.params;

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<OnboardingForm>(() => createEmptyForm(phone));
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);

  const [vehicleTypes, setVehicleTypes] = useState<VehicleType[]>([]);
  const [loadingTypes, setLoadingTypes] = useState(true);

  const scrollRef = React.useRef<ScrollView>(null);

  const loadVehicleTypes = useCallback(async () => {
    setLoadingTypes(true);
    try {
      setVehicleTypes(await fetchVehicleTypes());
    } catch (error) {
      notify(errorMessage(error, t('onboarding.errors.vehicleTypesLoad')));
    } finally {
      setLoadingTypes(false);
    }
  }, [t]);

  useEffect(() => {
    loadVehicleTypes();
  }, [loadVehicleTypes]);

  const handleChange = useCallback(
    <K extends keyof OnboardingForm>(key: K, value: OnboardingForm[K]) => {
      setForm(prev => ({ ...prev, [key]: value }));
      setErrors(prev => (prev[key] ? { ...prev, [key]: undefined } : prev));
    },
    [],
  );

  const goBack = useCallback(() => {
    Keyboard.dismiss();
    if (step === 0) {
      navigation.goBack();
      return;
    }
    setErrors({});
    setStep(prev => prev - 1);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [navigation, step]);

  // Hardware back walks the steps instead of leaving the flow.
  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (step === 0) {
          return false;
        }
        goBack();
        return true;
      },
    );
    return () => subscription.remove();
  }, [goBack, step]);

  const submit = useCallback(async () => {
    setSubmitting(true);
    try {
      const result = await onboardDriver({
        name: form.name,
        phoneNumber: form.phoneNumber,
        dob: dobToIso(form.dob),
        email: form.email,
        gender: form.gender,
        profileImage: form.profileImage,

        aadharCardNumber: form.aadharCardNumber,
        dlNumber: form.dlNumber,
        address: form.address,
        dlFrontImage: form.dlFrontImage,
        dlBackImage: form.dlBackImage,

        vehicleTypeId: form.vehicleTypeId,
        vehicleNumber: form.vehicleNumber,
        vehicleName: form.vehicleName,
        ownerName: form.ownerName,
        seatingCapacity: form.seatingCapacity,
        manufactureYear: form.manufactureYear,
        insuranceExpiryMonth: form.insuranceExpiryMonth,
        insuranceExpiryYear: form.insuranceExpiryYear,
        vehicleImages: [
          form.vehicleFrontImage,
          form.vehicleSideImage,
          form.vehicleBackImage,
        ],
        rcFrontImage: form.rcFrontImage,
        rcBackImage: form.rcBackImage,
      });

      await saveSession({
        token: result.token,
        phone: form.phoneNumber,
        driver: result.driver,
      });
      notify(t('onboarding.success'));
      navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
    } catch (error) {
      if (error instanceof ApiError) {
        // 409 on the phone number means the account was created meanwhile.
        if (error.status === 409 && /phone/i.test(error.message)) {
          notify(error.message);
          navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
          return;
        }
        if (error.status === 404) {
          // Stale vehicle-type list.
          loadVehicleTypes();
        }
        const fieldErrors = mapServerErrors(error.fieldErrors);
        if (Object.keys(fieldErrors).length > 0) {
          setErrors(fieldErrors);
        }
      }
      notify(errorMessage(error, t('onboarding.errors.submit')));
    } finally {
      setSubmitting(false);
    }
  }, [form, loadVehicleTypes, navigation, t]);

  const handleNext = useCallback(() => {
    Keyboard.dismiss();
    const stepErrors = validateStep(step, form, t);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) {
      notify(t('onboarding.errors.fixFields'));
      return;
    }
    if (step < TOTAL_STEPS - 1) {
      setStep(prev => prev + 1);
      scrollRef.current?.scrollTo({ y: 0, animated: true });
      return;
    }
    submit();
  }, [form, step, submit, t]);

  const stepLabels = useMemo(
    () => [
      t('onboarding.steps.personal'),
      t('onboarding.steps.documents'),
      t('onboarding.steps.vehicle'),
    ],
    [t],
  );

  const isLastStep = step === TOTAL_STEPS - 1;

  return (
    <KeyboardSafeView>
      {/* Header */}
      <View
        className="flex-row items-center px-5 pb-4"
        style={{ paddingTop: insets.top + 8 }}
      >
        <Pressable onPress={goBack} hitSlop={10} className="active:opacity-60">
          <MaterialIcons name="arrow-back" size={24} color={colors.secondary} />
        </Pressable>
        <Text className="ml-3 flex-1 text-lg font-bold text-secondary">
          {t('onboarding.title')}
        </Text>
        <Text className="text-xs font-semibold text-muted">
          {t('onboarding.stepCount', { current: step + 1, total: TOTAL_STEPS })}
        </Text>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{
          flexGrow: 1,
          paddingHorizontal: 24,
          paddingBottom: 24,
        }}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <Steps active={step + 1} steps={TOTAL_STEPS} labels={stepLabels} />

        {/* Only starred fields are mandatory — everything else is optional. */}
        <Text className="mb-4 text-xs text-muted">
          <Text className="text-[#d92d20]">*</Text> {t('onboarding.requiredNote')}
        </Text>

        {step === 0 && (
          <PersonalStep form={form} errors={errors} onChange={handleChange} />
        )}
        {step === 1 && (
          <DocumentsStep form={form} errors={errors} onChange={handleChange} />
        )}
        {step === 2 && (
          <VehicleStep
            form={form}
            errors={errors}
            onChange={handleChange}
            vehicleTypes={vehicleTypes}
            loadingTypes={loadingTypes}
          />
        )}
      </ScrollView>

      {/* Footer actions */}
      <View
        className="flex-row items-center gap-3 border-t border-border px-6 pt-4"
        style={{ paddingBottom: insets.bottom + 12 }}
      >
        {step > 0 ? (
          <Pressable
            onPress={goBack}
            disabled={submitting}
            className="h-14 flex-1 flex-row items-center justify-center rounded-2xl border border-border active:opacity-80"
          >
            <MaterialIcons
              name="arrow-back"
              size={18}
              color={colors.secondary}
            />
            <Text className="ml-1.5 text-base font-bold text-secondary">
              {t('onboarding.back')}
            </Text>
          </Pressable>
        ) : null}

        <PrimaryButton
          className={step > 0 ? 'flex-[1.4]' : 'flex-1'}
          label={isLastStep ? t('onboarding.submit') : t('onboarding.next')}
          icon={isLastStep ? 'check-circle' : 'arrow-forward'}
          onPress={handleNext}
          loading={submitting}
        />
      </View>
    </KeyboardSafeView>
  );
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
