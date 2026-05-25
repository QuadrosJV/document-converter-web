import { createHashRouter, Navigate, Outlet } from "react-router";
import { AuthProvider } from "./context/AuthContext";
import { HomePage } from "./pages/HomePage";
import { EditorPage } from "./pages/EditorPage";

/**
 * Layout raiz — AuthProvider precisa estar DENTRO da árvore do RouterProvider
 * para que useAuth() funcione em todos os componentes de rota.
 */
function RootLayout() {
  return (
    <AuthProvider>
      <Outlet />
    </AuthProvider>
  );
}

export const router = createHashRouter([
  {
    path: "/",
    Component: RootLayout,
    children: [
      { index: true, Component: HomePage },
      { path: "editor", Component: EditorPage },
      { path: "*", element: <Navigate to="/" replace /> },
    ],
  },
]);