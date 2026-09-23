import { Toaster } from "sonner"
import { createRoot } from "react-dom/client"
import { TownApp } from "./town/TownApp"
import "./town/setup.css"
import "./town/town.css"

createRoot(document.getElementById("root")!).render(<><TownApp /><Toaster position="bottom-right" closeButton toastOptions={{ style: { background: "#faf9f5", color: "#394338", border: "1px solid #d5d8c8", fontFamily: "var(--brand)" } }} /></>)
