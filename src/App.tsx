import { useEffect, useState } from "react";
import Landing from "./pages/Landing";
import CrewRoom from "./pages/CrewRoom";
import { Cursor } from "./components/Shared";
import "./App.css";

export default function App() {
  const [inRoom, setInRoom] = useState(() =>
    location.hash.startsWith("#/workspace"),
  );
  useEffect(() => {
    const change = () => {
      const next = location.hash.startsWith("#/workspace");
      setInRoom(next);
      if (next) window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useEffect(() => {
    document.title = inRoom
      ? "Your crew · Quil"
      : "Quil — Your next client. Already in sight.";
  }, [inRoom]);
  const openRoom = () => {
    location.hash = "/workspace";
    window.scrollTo(0, 0);
  };
  const goHome = () => {
    location.hash = "";
    setInRoom(false);
    window.scrollTo(0, 0);
  };
  return (
    <>
      <a
        className="skip-link"
        href={inRoom ? "#room-content" : "#platform"}
        onClick={
          inRoom
            ? (event) => {
                event.preventDefault();
                document.getElementById("room-content")?.focus();
              }
            : undefined
        }
      >
        Skip to content
      </a>
      {inRoom ? (
        <CrewRoom goHome={goHome} />
      ) : (
        <Landing openWorkspace={openRoom} />
      )}
      <Cursor />
    </>
  );
}
