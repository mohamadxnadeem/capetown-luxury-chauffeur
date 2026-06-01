import React, { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Chip, TextInput } from "react-native-paper";
import { colors } from "@/theme";

interface Props {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

// Add/remove chip input — one item per chip, type in the field and tap Add
// (or hit return) to append. Tap × on a chip to remove. The wire format is
// just a string array so the backend stays simple.
export function ChipListInput({
  values,
  onChange,
  placeholder = "Add and press return",
}: Props) {
  const [draft, setDraft] = useState("");

  function add() {
    const trimmed = draft.trim();
    if (!trimmed) return;
    if (values.includes(trimmed)) {
      setDraft("");
      return;
    }
    onChange([...values, trimmed]);
    setDraft("");
  }

  function remove(value: string) {
    onChange(values.filter((v) => v !== value));
  }

  return (
    <View>
      {values.length > 0 ? (
        <View style={styles.chipRow}>
          {values.map((v) => (
            <Chip
              key={v}
              onClose={() => remove(v)}
              style={styles.chip}
              textStyle={styles.chipText}
            >
              {v}
            </Chip>
          ))}
        </View>
      ) : null}
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onSubmitEditing={add}
        onBlur={add}
        mode="outlined"
        placeholder={placeholder}
        returnKeyType="done"
        right={
          draft.trim().length > 0 ? (
            <TextInput.Icon icon="plus" onPress={add} />
          ) : undefined
        }
        style={styles.input}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  chip: { backgroundColor: colors.surfaceMuted },
  chipText: { color: colors.heading, fontSize: 12, fontWeight: "600" },
  input: { backgroundColor: colors.surface },
});
