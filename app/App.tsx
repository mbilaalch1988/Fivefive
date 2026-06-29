import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { LandingScreen } from "./src/screens/LandingScreen";
import { colors } from "./src/theme";

export default function App() {
  return (
    <SafeAreaProvider>
      {/* Status bar icons rendered white over the navy background. The
          status bar's bg color is set via app.json (edgeToEdgeEnabled +
          navigationBar.backgroundColor) and the SafeAreaView below. */}
      <StatusBar style="light" />
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.navy }}>
        <LandingScreen />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
