import { createRoot } from "react-dom/client"
import { TownApp } from "../town/TownApp"
import "../town/setup.css"
import "../town/town.css"

createRoot(document.getElementById("root")!).render(<TownApp />)
