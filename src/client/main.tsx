import type { MantineThemeOverride } from "@mantine/core";
import { createTheme, MantineProvider } from "@mantine/core";
import type { ReactElement } from "react";
import React from "react";
import ReactDOM from "react-dom/client";
import "@mantine/core/styles.css";
import "@mantine/dropzone/styles.css";
import App from "./App";

const theme: MantineThemeOverride = createTheme({
  primaryColor: "blue",
});

const rootElement: HTMLElement | null = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found");
}

const root: ReactDOM.Root = ReactDOM.createRoot(rootElement);

function Main(): ReactElement {
  return (
    <React.StrictMode>
      <MantineProvider theme={theme} defaultColorScheme="auto">
        <App />
      </MantineProvider>
    </React.StrictMode>
  );
}

root.render(<Main />);
