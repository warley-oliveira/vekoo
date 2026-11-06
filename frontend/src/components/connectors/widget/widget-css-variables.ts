// Nomes de variável do bundle do widget, que não são traduzíveis. É por elas que a pessoa
// ajusta o chat sem depender de nomes de classe internos, que mudam entre versões.
export const WIDGET_CSS_VARIABLES = [
  { name: "--aiva-primary", key: "primary" },
  { name: "--aiva-header-bg", key: "headerBg" },
  { name: "--aiva-header-text", key: "headerText" },
  { name: "--aiva-user-bubble", key: "userBubble" },
  { name: "--aiva-user-text", key: "userText" },
  { name: "--aiva-assistant-bubble", key: "assistantBubble" },
  { name: "--aiva-assistant-text", key: "assistantText" },
  { name: "--aiva-msg-bg", key: "messageBg" },
  { name: "--aiva-bubble-radius", key: "bubbleRadius" },
  { name: "--aiva-panel-radius", key: "panelRadius" },
  { name: "--aiva-launcher-size", key: "launcherSize" },
  { name: "--aiva-font", key: "font" },
] as const
