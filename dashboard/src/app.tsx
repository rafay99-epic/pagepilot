import { useSyncExternalStore } from "react";
import { PagesView } from "./pages-view";
import { StorageView } from "./storage-view";
import "./style.css";

type Route = "pages" | "storage";

function subscribe(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function getRoute(): Route {
  return window.location.hash === "#/storage" ? "storage" : "pages";
}

function useRoute(): Route {
  return useSyncExternalStore(subscribe, getRoute);
}

// Full-width bar: wordmark, view links addressed by hash, sign out.
function TopBar({ route }: { route: Route }) {
  return (
    <header className="topbar">
      <h1>PagePilot</h1>
      <nav aria-label="Views">
        <a href="#/" aria-current={route === "pages" ? "page" : undefined}>
          Pages
        </a>
        <a href="#/storage" aria-current={route === "storage" ? "page" : undefined}>
          Storage
        </a>
      </nav>
      <a className="signout" href="/cdn-cgi/access/logout">
        Sign out
      </a>
    </header>
  );
}

// Shell: the top bar plus whichever view the hash addresses.
export function App() {
  const route = useRoute();
  return (
    <main>
      <TopBar route={route} />
      {route === "storage" ? <StorageView /> : <PagesView />}
    </main>
  );
}
