import 'react-native-url-polyfill/auto';

import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, Text, View } from 'react-native';

import { ClerkApp } from './src/auth/clerk/ClerkApp';

const clerkPublishableKey = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabasePublishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export default function App() {
  if (!clerkPublishableKey || !supabaseUrl || !supabasePublishableKey) {
    const missingSettings: string[] = [];
    if (!clerkPublishableKey) missingSettings.push('EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY');
    if (!supabaseUrl) missingSettings.push('EXPO_PUBLIC_SUPABASE_URL');
    if (!supabasePublishableKey) missingSettings.push('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');

    return (
      <View style={styles.container}>
        <Text style={styles.kicker}>LEAFMARK</Text>
        <Text style={styles.title}>Connect your reading journal</Text>
        <Text style={styles.message}>
          Add the following public project settings to your local .env file to enable account sign-in:
        </Text>
        {missingSettings.map((setting) => (
          <Text key={setting} style={styles.setting}>{setting}</Text>
        ))}
        <Text style={styles.note}>
          Use your Clerk publishable key and Supabase publishable key. Never add a secret or service-role key to this app.
        </Text>
        <StatusBar style="dark" />
      </View>
    );
  }

  return (
    <>
      <ClerkApp
        clerkPublishableKey={clerkPublishableKey}
        supabaseUrl={supabaseUrl}
        supabasePublishableKey={supabasePublishableKey}
      />
      <StatusBar style="dark" />
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F7F5EB',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  kicker: {
    color: '#82876A',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
  },
  title: {
    color: '#5A5746',
    fontFamily: 'Georgia',
    fontSize: 30,
    marginTop: 16,
    textAlign: 'center',
  },
  message: {
    color: '#898674',
    fontSize: 15,
    lineHeight: 23,
    marginTop: 14,
    maxWidth: 420,
    textAlign: 'center',
  },
  setting: {
    color: '#5A5746',
    fontFamily: 'Menlo',
    fontSize: 13,
    marginTop: 12,
  },
  note: {
    color: '#898674',
    fontSize: 12,
    lineHeight: 18,
    marginTop: 24,
    maxWidth: 440,
    textAlign: 'center',
  },
});
