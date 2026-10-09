import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

type Props = { children: React.ReactNode };
type State = { hasError: boolean };

export default class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('United Delhi UI error:', error);
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <View style={styles.safe}>
        <Text style={styles.mark}>UNITED DELHI</Text>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>The app hit an unexpected error. You can restart this screen without losing the app installation.</Text>
        <Pressable style={styles.button} onPress={() => this.setState({ hasError: false })}>
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center', padding: 28 },
  mark: { fontSize: 11, fontWeight: '900', letterSpacing: 1.5, color: colors.accent },
  title: { marginTop: 8, fontSize: 25, fontWeight: '900', color: colors.text, textAlign: 'center' },
  body: { marginTop: 9, fontSize: 13, lineHeight: 20, color: colors.textMuted, textAlign: 'center' },
  button: { marginTop: 20, paddingHorizontal: 24, paddingVertical: 13, borderRadius: 14, backgroundColor: colors.accent },
  buttonText: { color: '#fff', fontSize: 14, fontWeight: '900' }
});
