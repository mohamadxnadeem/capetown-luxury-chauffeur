import { StyleSheet } from "react-native";
import { colors } from "@/theme";

// Shared bottom-sheet styling for the day edit and split shift sheets.
export const sheetStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,0.45)" },
  backdrop: { flex: 1 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: "92%",
    paddingTop: 8,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: 8,
  },
  content: { paddingHorizontal: 20, paddingBottom: 32 },
  title: { fontSize: 20, fontWeight: "700", color: colors.heading },
  sub: { color: colors.muted, marginTop: 6, marginBottom: 12, lineHeight: 19 },
  input: { backgroundColor: colors.surface },
  label: { marginTop: 14, marginBottom: 6, fontWeight: "700", color: colors.heading },
  select: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: colors.surface,
  },
  selectText: { color: colors.text, fontWeight: "600", flexShrink: 1 },
  chevron: { color: colors.muted, marginLeft: 8 },
  list: { borderWidth: 1, borderColor: colors.border, borderRadius: 10, marginTop: 6 },
  option: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  optionActive: { backgroundColor: colors.surfaceMuted },
  optionText: { color: colors.text },
  check: { color: colors.primary, fontWeight: "700" },
  rates: { flexDirection: "row", gap: 10, marginTop: 12 },
  rateInput: { flex: 1, backgroundColor: colors.surface },
  hint: { color: colors.muted, fontSize: 12, marginTop: 6, lineHeight: 17 },
});
