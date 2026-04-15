/* Next Ezeiza — Global Styles */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
  -webkit-tap-highlight-color: transparent;
}

:root {
  --v: #652f8d;
  --v2: #7d3aab;
  --v3: #8f45c0;
  --vl: #f2e8f9;
  --vll: #faf5fd;
  --white: #ffffff;
  --bg: #f8f6fb;
  --text: #1a1020;
  --text2: #5a4d6a;
  --text3: #9b8eaa;
  --border: #e8dff2;
  --green: #2d7a4f;
  --greenl: #e6f4ec;
  --red: #c0392b;
  --redl: #fdeaea;
  --amber: #b45309;
  --amberl: #fef3cd;
  --blue: #1a6b8a;
  --bluel: #e0f0f7;
}

html {
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: 'Inter', sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  line-height: 1.5;
  overflow-x: hidden;
}

/* Scrollbar sutil */
::-webkit-scrollbar { width: 4px; height: 4px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

/* Focus visible accesible */
:focus-visible {
  outline: 2px solid var(--v);
  outline-offset: 2px;
}

/* Inputs base */
input, select, textarea {
  font-family: inherit;
  font-size: inherit;
}

/* Botones base */
button {
  cursor: pointer;
  font-family: inherit;
}

/* Animaciones */
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes slideUp {
  from { transform: translateY(100%); }
  to   { transform: translateY(0); }
}

.fade-in {
  animation: fadeIn 0.2s ease-out;
}

.slide-up {
  animation: slideUp 0.25s cubic-bezier(0.32, 0.72, 0, 1);
}
