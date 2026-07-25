import React from 'react';
import { Text } from 'react-native';

type Props = {
  title: string;
  /** Adds the red asterisk when every field in the group is mandatory. */
  required?: boolean;
  className?: string;
};

/** Heading for a group of fields (insurance, photos), marked like a field. */
export default function SectionLabel({
  title,
  required = false,
  className = 'mt-2',
}: Props) {
  return (
    <Text className={`text-sm font-bold text-secondary ${className}`}>
      {title}
      {required ? <Text className="text-[#d92d20]"> *</Text> : null}
    </Text>
  );
}
