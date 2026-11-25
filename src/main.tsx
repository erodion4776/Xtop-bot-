
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import CookieConsent from "./CookieConsent";
import "./style.css";

ReactDOM.createRoot(
  document.getElementById("root")!
).render(
  <React.StrictMode>
    <App />
    {window.location.hostname.toLowerCase() !== "engr.sabibyxtop.com.ng" && <CookieConsent />}
  </React.StrictMode>
);
