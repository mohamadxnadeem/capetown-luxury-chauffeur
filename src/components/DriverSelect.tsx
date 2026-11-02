import React, { useState } from "react";
import { ScrollView, TouchableOpacity, View } from "react-native";
import { Text } from "react-native-paper";
import type { DriverNested } from "@/api/types";
import { sheetStyles as styles } from "@/components/sheetStyles";

interface Props {
  drivers: DriverNested[];
  value: number | null;
  onChange: (id: number | null) => void;
  // Label for the null option, e.g. "Booking driver (Sipho)".
  nullLabel: string;
}

export function DriverSelect({ drivers, value, onChange, nullLabel }: Props) {
  const [open, setOpen] = useState(false);
  const selected = drivers.find((d) => d.id === value);
  return (
    <View>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => setOpen((o) => !o)}
        style={styles.select}
      >
        <Text style={styles.selectText} numberOfLines={1}>
          {selected ? selected.full_name : nullLabel}
        </Text>
        <Text style={styles.chevron}>{open ? "▴" : "▾"}</Text>
      </TouchableOpacity>
      {open ? (
        <View style={styles.list}>
          <ScrollView nestedScrollEnabled style={{ maxHeight: 220 }}>
            {[{ id: null as number | null, name: nullLabel }]
              .concat(drivers.map((d) => ({ id: d.id, name: d.full_name })))
              .map((o) => (
                <TouchableOpacity
                  key={String(o.id)}
                  activeOpacity={0.85}
                  onPress={() => {
                    onChange(o.id);
                    setOpen(false);
                  }}
                  style={[styles.option, value === o.id && styles.optionActive]}
                >
                  <Text style={styles.optionText}>{o.name}</Text>
                  {value === o.id ? <Text style={styles.check}>✓</Text> : null}
                </TouchableOpacity>
              ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}
