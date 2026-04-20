import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Force light theme — no dark mode supported
document.documentElement.classList.remove("dark");
try { localStorage.removeItem("emm-theme"); } catch {}

createRoot(document.getElementById("root")!).render(<App />);

