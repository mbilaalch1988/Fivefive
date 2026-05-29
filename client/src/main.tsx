import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// NOTE: StrictMode is intentionally disabled. The shared game engine mutates
// GameState in place; StrictMode's double-invocation of state updaters in dev
// causes actions to be applied twice. The multiplayer wiring in Phase 5
// dispatches actions over the socket (server is authoritative) so this only
// affects the local hot-seat preview.
createRoot(document.getElementById("root")!).render(<App />);
