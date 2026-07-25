import React from 'react';
import { Text, View } from 'react-native';

type Props = {
  /** Number of steps completed *or* in progress (1-based). */
  active: number;
  /** Total number of steps. */
  steps: number;
  /** Optional captions; falls back to "Step N". */
  labels?: string[];
};

/**
 * Numbered step indicator with connecting rails.
 * Active pills use the brand navy (`secondary`); `primary` in this palette is
 * white, so it would be invisible on the white onboarding background.
 */
export default function Steps({ active, steps, labels }: Props) {
  const activearr = Array(Math.max(0, Math.min(active, steps))).fill(1);
  const inactivearr = Array(Math.max(0, steps - active)).fill(1);

  const labelAt = (index: number) => labels?.[index] ?? `Step ${index + 1}`;

  return (
    <>
      <View className="mb-2 flex-row items-center justify-between px-3">
        {activearr.map((_, index) => (
          <React.Fragment key={`active-${index}`}>
            {index !== 0 && (
              <View className="mx-1 mt-0.5 h-0.5 flex-1 bg-secondary" />
            )}
            <View className="flex items-center">
              <View className="h-6 w-6 items-center justify-center rounded-full bg-secondary">
                <Text className="text-xs font-bold text-white">
                  {index + 1}
                </Text>
              </View>
            </View>
          </React.Fragment>
        ))}

        {inactivearr.map((_, index) => (
          <React.Fragment key={`inactive-${index}`}>
            <View className="mx-1 mt-0.5 h-0.5 flex-1 bg-gray-300" />
            <View className="flex items-center">
              <View className="h-6 w-6 items-center justify-center rounded-full bg-gray-300">
                <Text className="text-xs font-bold text-white">
                  {index + activearr.length + 1}
                </Text>
              </View>
            </View>
          </React.Fragment>
        ))}
      </View>

      <View className="mb-8 flex-row justify-between px-2">
        {activearr.map((_, index) => (
          <Text
            key={`label-active-${index}`}
            className="text-xs font-semibold text-secondary"
          >
            {labelAt(index)}
          </Text>
        ))}

        {inactivearr.map((_, index) => (
          <Text key={`label-inactive-${index}`} className="text-xs text-gray-400">
            {labelAt(index + activearr.length)}
          </Text>
        ))}
      </View>
    </>
  );
}
