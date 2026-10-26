import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

const colors = {
  paper: '#F7F5EB',
  panel: '#FFFCF2',
  ink: '#5A5746',
  muted: '#898674',
  olive: '#82876A',
  line: '#D8D4C3',
};

export default function App() {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.card}>
        <Text style={styles.kicker}>LEAFMARK · READING JOURNAL</Text>
        <Text accessibilityRole="header" style={styles.title}>
          A reading journal that stays on this iPad.
        </Text>
        <Text style={styles.description}>
          Keep your books, reading days, notes, and digital bookshelf together in a quiet place of your own.
        </Text>
        <View style={styles.installNote}>
          <Text style={styles.installTitle}>Made for your Home Screen</Text>
          <Text style={styles.installText}>Open Leafmark in Safari, tap Share, then choose Add to Home Screen.</Text>
        </View>
        <Text style={styles.offlineNote}>Connect to the internet for the first visit and app updates.</Text>
        <Text style={styles.offlineNote}>Your journal opens offline after the first visit.</Text>
        <Text style={styles.footer}>Your reading journal is stored on this device.</Text>
      </View>
      <StatusBar style="dark" />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: {
    alignItems: 'center',
    backgroundColor: colors.paper,
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 42,
  },
  card: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderRadius: 28,
    borderWidth: 1,
    maxWidth: 680,
    paddingHorizontal: 36,
    paddingVertical: 42,
    width: '100%',
  },
  kicker: { color: colors.olive, fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  title: { color: colors.ink, fontFamily: 'Georgia', fontSize: 40, lineHeight: 48, marginTop: 22 },
  description: { color: colors.muted, fontSize: 17, lineHeight: 27, marginTop: 16, maxWidth: 530 },
  installNote: { backgroundColor: '#F2EFDF', borderRadius: 18, marginTop: 34, padding: 20 },
  installTitle: { color: colors.ink, fontFamily: 'Georgia', fontSize: 21 },
  installText: { color: colors.ink, fontSize: 15, lineHeight: 23, marginTop: 8 },
  offlineNote: { color: colors.olive, fontSize: 14, fontWeight: '600', marginTop: 22 },
  footer: { borderTopColor: colors.line, borderTopWidth: 1, color: colors.muted, fontSize: 13, marginTop: 30, paddingTop: 18 },
});
