import { useEffect, useState } from "react";
import Landing from "./pages/Landing";
import CrewRoom from "./pages/CrewRoom";
import { Cursor } from "./components/Shared";
import "./App.css";
import AccountProvider from "./components/AccountProvider";
import { useAccount } from "./hooks/useAccount";

function QuilApp() {
  const account = useAccount();
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
        account.session ? <CrewRoom key={`${account.session.user.id}:${account.session.user.authenticated}`} goHome={goHome} /> : <div className="account-opening"><p>{account.error || "Opening your workspace…"}</p>{account.error && <button className="text-link" onClick={() => void account.refresh()}>Try again</button>}</div>
      ) : (
        <Landing openWorkspace={openRoom} />
      )}
      <Cursor />
    </>
  );
}
export default function App() { return <AccountProvider><QuilApp /></AccountProvider>; }
