import { createRoot } from "react-dom/client"
import { App } from "../legacy/LegacyTown"
import "../legacy/styles.css"

createRoot(document.getElementById("root")!).render(<App />)
