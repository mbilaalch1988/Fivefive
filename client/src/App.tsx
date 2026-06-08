import { useEffect } from "react";
import { useGame } from "./hooks/useGame";
import { GameScreen } from "./screens/GameScreen";
import { LandingScreen } from "./screens/LandingScreen";
import { LobbyScreen } from "./screens/LobbyScreen";
import { applyColorBlindClass, onPrefsChange } from "./lib/prefs";

export default function App() {
  const g = useGame();

  // Apply color-blind body class on mount and whenever the pref toggles.
  useEffect(() => {
    applyColorBlindClass();
    return onPrefsChange(applyColorBlindClass);
  }, []);

  if (g.phase === "landing" || !g.room || !g.playerId) {
    return (
      <LandingScreen
        connected={g.connected}
        error={g.error}
        onClearError={g.clearError}
        onCreate={g.createRoom}
        onJoin={g.joinRoom}
      />
    );
  }

  if (g.phase === "lobby" || !g.game) {
    return (
      <LobbyScreen
        room={g.room}
        myPlayerId={g.playerId}
        connected={g.connected}
        error={g.error}
        decks={g.decks}
        onClearError={g.clearError}
        onChooseTeam={g.chooseTeam}
        onSetReady={g.setReady}
        onRenameTeam={g.renameTeam}
        onStart={(opts) => g.startGame(opts)}
        onLeave={g.leave}
      />
    );
  }

  const isHost = g.room.hostId === g.playerId;

  return (
    <GameScreen
      view={g.game}
      room={g.room}
      myPlayerId={g.playerId}
      isHost={isHost}
      stickers={g.stickers}
      quickChats={g.quickChats}
      dispatch={g.doAction}
      onSendSticker={g.sendSticker}
      onSendQuickChat={g.sendQuickChat}
      onStopGame={g.stopGame}
      onRematch={g.stopGame}
    />
  );
}
