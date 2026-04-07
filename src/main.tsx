import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

/* StrictMode 제거: 개발 모드 이중 마운트 시 Kakao Loader 싱글톤과 충돌할 수 있음 */

createRoot(document.getElementById("root")!).render(<App />);
