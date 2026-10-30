import { useEffect, useLayoutEffect, useState } from "react";
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
    };
    window.addEventListener("hashchange", change);
    return () => window.removeEventListener("hashchange", change);
  }, []);
  useLayoutEffect(() => {
    // Reset after the new page exists, without the global smooth-scroll delay.
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [inRoom]);
  useEffect(() => {
    document.title = inRoom
      ? "Your crew · Quil"
      : "Quil — Your next client. Already in sight.";
  }, [inRoom]);
  const openRoom = () => {
    location.hash = "/workspace";
    setInRoom(true);
  };
  const goHome = () => {
    location.hash = "";
    setInRoom(false);
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
