import { useGame } from "./hooks/useGame";
import { GameScreen } from "./screens/GameScreen";
import { LandingScreen } from "./screens/LandingScreen";
import { LobbyScreen } from "./screens/LobbyScreen";

export default function App() {
  const g = useGame();

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
        onClearError={g.clearError}
        onChooseTeam={g.chooseTeam}
        onSetReady={g.setReady}
        onStart={(opts) => g.startGame(opts)}
        onLeave={g.leave}
      />
    );
  }

  return (
    <GameScreen
      view={g.game}
      myPlayerId={g.playerId}
      dispatch={g.doAction}
      onPlayAgain={g.leave}
    />
  );
}
